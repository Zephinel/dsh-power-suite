#!/usr/bin/env node
/**
 * Live-DSH end-to-end harness for the dynamic-Workspaces sidebar surface
 * ("Running & recent" card, Workspace buckets, hover card, plugin chrome).
 *
 * What it does
 * ------------
 * Launches a throwaway headless Chrome (fresh `--user-data-dir`, so the real profile is
 * never touched), connects over the Chrome DevTools Protocol with Node's global
 * WebSocket (no dependencies), opens the REAL running DSH Web GUI with a fresh token URL,
 * and injects this worktree's `src/client.js` into the live page with
 * `Page.addScriptToEvaluateOnNewDocument` (same loader swap as annotation.e2e.mjs: the
 * shell's `@rexxin/dsh-power-suite` registration is loaded from this worktree instead of
 * the installed checkout). The installed plugin, the profile and the launchd service stay
 * untouched.
 *
 * It then verifies the sidebar polish work on the real rendered DOM:
 *   B1  right-anchored row columns: actions / time / disclosure share fixed x positions
 *       across parent rows, child rows and the header; clipped titles carry the
 *       right-edge gradient mask.
 *   B2  hover highlight geometry: content-paced body pill, fixed-size control highlights
 *       (22 px action buttons, 24 px chevron) on the same columns in every row.
 *   B3  plugin input focus uses the shared rainbow track glow (prompt-history search
 *       field), with no solid-color focus border left behind.
 *   B4  the current Session gets the soft rainbow wave behind its row and the native
 *       Workspace row that owns it gets the same wave; reduced motion leaves a static
 *       tint.
 *   B5  the row hover card matches the native sidebar tooltip oracle measured live
 *       (flush at the sidebar's right edge, top aligned to the row, same width, radius,
 *       borderless elevation, padding and typography).
 *   C2  plugin floating surfaces are borderless like the native ones.
 *   C3  fonts match DSH (14/20 row titles, 13 px bucket labels in title case, inherited
 *       family) and the bucket labels read "Active Projects"/"Inactive Projects".
 *   C4  bucket folds persist across a reload and are applied on the first observable
 *       paint (before the Session stores hydrate), while live buckets still correct a
 *       stale cached classification.
 *   F4  while annotation mode is active the hover card is pinned/annotatable
 *       (`data-psd-hovercard`, `data-psd-pinned`) and mode exit clears it.
 *
 * Side effects: one blank Session is created through the native New Session button per
 * run (never typed into); one existing Session row is opened (from the card) to exercise
 * the current-highlight marker; `localStorage` for the throwaway profile is modified
 * (folds/bucket cache). No other session, setting or file is touched, and the token is
 * never printed. The harness exits 0 only when every check passed and the page reported
 * no errors; 1 on any failure; 2 on usage errors.
 *
 * Usage:
 *   node test/browser/sidebar.e2e.mjs                 # full run (screenshots into .tmp-work/)
 *   node test/browser/sidebar.e2e.mjs --smoke         # pipeline smoke only
 *   node test/browser/sidebar.e2e.mjs --no-shots      # skip screenshots
 *   node test/browser/sidebar.e2e.mjs --client path/to/client.js
 *   node test/browser/sidebar.e2e.mjs --keep-open     # leave Chrome running for inspection
 *   node test/browser/sidebar.e2e.mjs --headful       # show the browser window
 *
 * Env:
 *   DSH_WEB_URL  token URL for the GUI. If unset (or set without `token=`), the URL is
 *                resolved with `~/.local/bin/dsh-web url --ip`.
 *   CHROME_BIN   Chrome binary; defaults to the standard macOS Google Chrome location.
 *
 * Requirement: at least one running or recently finished Session must be listed in the
 * "Running & recent" card for the row-level checks. The harness never fabricates
 * activity, so on an idle GUI start a Session first and rerun; it fails with a clear
 * message instead of skipping silently.
 *
 * Requires Node >= 22 (global WebSocket) and Chrome.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKTREE = path.resolve(HERE, '..', '..')
const CLIENT_PATH = path.join(WORKTREE, 'src', 'client.js')
const SHOTS_DIR = path.join(WORKTREE, '.tmp-work', 'sidebar-e2e')
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DSH_WEB_BIN = path.join(homedir(), '.local', 'bin', 'dsh-web')
const VIEWPORT = { width: 1728, height: 900 }

// CSS recipe copied from the annotation spec for the F4 simulation: the annotation
// implementer ships the real rule inside ANNOTATION_CSS; the harness injects the same
// rule only while testing the pinned card on this worktree (which predates it).
const ANNOTATION_PIN_CSS =
  "html[data-psa-active='true'] [data-psd-hovercard]{pointer-events:auto;z-index:120!important}"

// ---------------------------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function redact(text) {
  return String(text).replace(/token=[^&\s"']*/g, 'token=REDACTED')
}

function log(msg) {
  process.stdout.write(redact(msg) + '\n')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
  }
}

function assertNear(actual, expected, tolerance, message) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message} (expected ${expected} ±${tolerance}, got ${actual})`)
  }
}

function short(value, max = 220) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > max ? text.slice(0, max) + '…' : text
}

function parseArgs(argv) {
  const opts = {
    mode: 'full',
    clientPath: CLIENT_PATH,
    shots: true,
    keepOpen: false,
    headful: false,
    url: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--smoke') opts.mode = 'smoke'
    else if (arg === '--no-shots') opts.shots = false
    else if (arg === '--keep-open') opts.keepOpen = true
    else if (arg === '--headful') opts.headful = true
    else if (arg === '--client') opts.clientPath = path.resolve(argv[++i])
    else if (arg.startsWith('--client=')) opts.clientPath = path.resolve(arg.slice('--client='.length))
    else if (arg === '--url') opts.url = argv[++i]
    else if (arg.startsWith('--url=')) opts.url = arg.slice('--url='.length)
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node test/browser/sidebar.e2e.mjs [--smoke] [--no-shots] [--client path] [--keep-open] [--headful] [--url TOKEN_URL]')
      process.exit(0)
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return opts
}

// ---------------------------------------------------------------------------------------------
// GUI URL resolution (token never printed)
// ---------------------------------------------------------------------------------------------

function runCommand(command, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`${path.basename(command)} exited ${code}: ${redact(stderr.trim())}`))
    })
  })
}

async function resolveGuiUrl(opts) {
  if (opts.url) {
    if (!/[?&]token=/.test(opts.url)) throw new Error('--url must be a token URL (contains token=)')
    return opts.url
  }
  const envUrl = process.env.DSH_WEB_URL || ''
  if (/[?&]token=/.test(envUrl)) return envUrl
  if (!existsSync(DSH_WEB_BIN)) {
    throw new Error(
      `cannot resolve a token URL: DSH_WEB_URL=${envUrl || '(unset)'} has no token and ${DSH_WEB_BIN} is missing. ` +
        'Set DSH_WEB_URL to the token URL printed by `dsh-web url --ip`.'
    )
  }
  const url = await runCommand(DSH_WEB_BIN, ['url', '--ip'])
  if (!/[?&]token=/.test(url)) throw new Error('`dsh-web url --ip` did not return a token URL')
  return url
}

// ---------------------------------------------------------------------------------------------
// Chrome launch
// ---------------------------------------------------------------------------------------------

async function launchChrome(opts) {
  const chrome = process.env.CHROME_BIN || DEFAULT_CHROME
  if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome}; set CHROME_BIN`)
  const profileDir = await mkdtemp(path.join(tmpdir(), 'dsh-psd-e2e-'))
  const args = [
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--mute-audio',
    '--no-proxy-server',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--use-mock-keychain',
    '--password-store=basic',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  ]
  if (!opts.headful) args.unshift('--headless=new')
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const chromeStderr = []
  proc.stderr.on('data', (chunk) => {
    if (chromeStderr.length < 200) chromeStderr.push(String(chunk))
  })
  const exited = new Promise((resolve) => proc.on('exit', (code, signal) => resolve({ code, signal })))
  let exitInfo = null
  exited.then((info) => (exitInfo = info))
  const portFile = path.join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + 20000
  let port = null
  let remotePath = null
  while (Date.now() < deadline) {
    if (exitInfo) {
      throw new Error(`Chrome exited during startup (${JSON.stringify(exitInfo)}): ${redact(chromeStderr.join('').slice(0, 800))}`)
    }
    try {
      const lines = (await readFile(portFile, 'utf8')).trim().split('\n')
      port = Number(lines[0])
      remotePath = lines[1]
      if (port > 0 && remotePath) break
    } catch {
      /* not written yet */
    }
    await sleep(100)
  }
  if (!port || !remotePath) {
    proc.kill('SIGKILL')
    throw new Error(`Chrome did not expose a CDP port within 20s: ${redact(chromeStderr.join('').slice(0, 800))}`)
  }
  return {
    proc,
    profileDir,
    port,
    wsUrl: `ws://127.0.0.1:${port}${remotePath}`,
    async close() {
      proc.kill('SIGTERM')
      await Promise.race([exited, sleep(3000)])
      if (exitInfo === null) proc.kill('SIGKILL')
      await sleep(200)
      await rm(profileDir, { recursive: true, force: true }).catch(() => {})
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Minimal CDP client over Node's global WebSocket
// ---------------------------------------------------------------------------------------------

class CdpConnection {
  static async connect(wsUrl, timeoutMs = 15000) {
    const socket = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connect timed out')), timeoutMs)
      socket.onopen = () => {
        clearTimeout(timer)
        resolve()
      }
      socket.onerror = () => {
        clearTimeout(timer)
        reject(new Error(`CDP WebSocket error while connecting to ${redact(wsUrl)}`))
      }
    })
    const connection = new CdpConnection(socket)
    socket.onmessage = (event) => connection._onMessage(event.data)
    socket.onclose = () => connection._onClose()
    return connection
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.closed = false
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set())
    this.listeners.get(method).add(handler)
    return () => this.listeners.get(method)?.delete(handler)
  }

  send(method, params = {}, sessionId, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('CDP connection is closed'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP command timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      const message = { id, method, params }
      if (sessionId) message.sessionId = sessionId
      this.socket.send(JSON.stringify(message))
    })
  }

  _onMessage(data) {
    let message
    try {
      message = JSON.parse(typeof data === 'string' ? data : String(data))
    } catch {
      return
    }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(`CDP ${message.error.message || 'error'}: ${JSON.stringify(message.error.data || '')}`))
      else resolve(message.result ?? {})
      return
    }
    if (message.method) {
      const handlers = this.listeners.get(message.method)
      if (handlers) for (const handler of [...handlers]) handler(message.params, message.sessionId)
    }
  }

  _onClose() {
    this.closed = true
    for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed'))
    this.pending.clear()
  }
}

// ---------------------------------------------------------------------------------------------
// Page wrapper: one attached target/session with evaluation, input and screenshot helpers
// ---------------------------------------------------------------------------------------------

class Page {
  static async open(cdp, url, initScript) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new Page(cdp, sessionId)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable').catch(() => {})
    page.origin = new URL(url).origin
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    })
    if (initScript) await page.addInitScript(initScript)
    await page.navigate(url)
    return page
  }

  constructor(cdp, sessionId) {
    this.cdp = cdp
    this.sessionId = sessionId
    this.pageErrors = []
    this.consoleErrors = []
    this.logEntries = []
    this.origin = null
    this._subscriptions = [
      cdp.on('Runtime.exceptionThrown', (params, eventSession) => {
        if (eventSession !== this.sessionId) return
        const details = params?.exceptionDetails || {}
        const description = details.exception?.description || details.text || 'unknown exception'
        this.pageErrors.push(short(description.split('\n')[0], 300))
      }),
      cdp.on('Runtime.consoleAPICalled', (params, eventSession) => {
        if (eventSession !== this.sessionId || params.type !== 'error') return
        const text = (params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type ?? '').join(' ')
        this.pageErrors.push(short(text, 300))
        this.consoleErrors.push(short(text, 300))
      }),
      cdp.on('Log.entryAdded', (params, eventSession) => {
        if (eventSession && eventSession !== this.sessionId) return
        if (params.entry?.level !== 'error') return
        const entry = params.entry
        const source = entry.source ? `${entry.source}: ` : ''
        this.logEntries.push(short(`${source}${entry.text}`, 400))
      }),
    ]
  }

  send(method, params = {}, timeoutMs) {
    return this.cdp.send(method, params, this.sessionId, timeoutMs)
  }

  async evaluate(expression) {
    const run = async () => {
      const result = await this.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: false,
        timeout: 30000,
      })
      if (result.exceptionDetails) {
        const details = result.exceptionDetails
        const description = details.exception?.description || details.text || 'evaluate failed'
        throw new Error(`page evaluate failed: ${short(description.split('\n')[0], 300)}`)
      }
      return result.result?.value
    }
    try {
      return await run()
    } catch (error) {
      if (!/CDP command timed out/i.test(error?.message || '')) throw error
      await sleep(700)
      return run()
    }
  }

  /** Evaluate a page-side function with JSON-serializable arguments. */
  eval(fn, ...args) {
    const argsSource = args.map((arg) => JSON.stringify(arg)).join(', ')
    return this.evaluate(`(${fn.toString()})(${argsSource})`)
  }

  async waitFor(expression, { timeout = 15000, interval = 100, label = expression } = {}) {
    const deadline = Date.now() + timeout
    let lastError = null
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(`Boolean(${expression})`)) return true
      } catch (error) {
        lastError = error
      }
      await sleep(interval)
    }
    throw new Error(`timed out after ${timeout}ms waiting for: ${label}${lastError ? ` (last error: ${lastError.message})` : ''}`)
  }

  waitForFn(fn, args = [], opts = {}) {
    const argsSource = args.map((arg) => JSON.stringify(arg)).join(', ')
    return this.waitFor(`(${fn.toString()})(${argsSource})`, opts)
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
  }

  async addInitScript(source) {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source })
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: false })
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  }

  /** Emulate a media feature (e.g. prefers-color-scheme / prefers-reduced-motion). */
  async emulateMedia(features) {
    await this.send('Emulation.setEmulatedMedia', { features })
  }

  async screenshotBase64() {
    const result = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    return result.data
  }

  async screenshot(pathname) {
    const data = await this.screenshotBase64()
    await writeFile(pathname, Buffer.from(data, 'base64'))
    return pathname
  }

  // ---- queries -------------------------------------------------------------------------

  /** First visible element matching selector -> center point + rect, or null. */
  findRect(selector) {
    return this.eval((sel) => {
      const elements = [...document.querySelectorAll(sel)]
      for (const el of elements) {
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
        if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) continue
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      }
      return null
    }, selector)
  }

  count(selector) {
    return this.eval((sel) => document.querySelectorAll(sel).length, selector)
  }

  text(selector) {
    return this.eval((sel) => {
      const el = document.querySelector(sel)
      return el ? (el.innerText || el.textContent || '').trim() : null
    }, selector)
  }

  // ---- real input ----------------------------------------------------------------------

  async mouse(event) {
    try {
      await this.send('Input.dispatchMouseEvent', event, 15000)
    } catch (error) {
      if (!/CDP command timed out/i.test(error?.message || '') || event.type !== 'mouseMoved') throw error
      await sleep(500)
      await this.send('Input.dispatchMouseEvent', event, 30000)
    }
  }

  async moveTo(x, y) {
    await this.mouse({ type: 'mouseMoved', x, y })
    await sleep(40)
  }

  async clickAt(x, y) {
    await this.mouse({ type: 'mouseMoved', x, y })
    await sleep(40)
    await this.mouse({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await sleep(50)
    await this.mouse({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    await sleep(180)
  }

  async pressEscape() {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    })
    await sleep(20)
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    })
    await sleep(80)
  }

  dispose() {
    for (const unsubscribe of this._subscriptions) unsubscribe()
  }
}

// ---------------------------------------------------------------------------------------------
// Injection: replace the installed plugin factory with this worktree's src/client.js
// (same loader swap as annotation.e2e.mjs; no network or profile change)
// ---------------------------------------------------------------------------------------------

const INJECT_SCRIPT = `(() => {
  const init = (source) => {
    const ID = '@rexxin/dsh-power-suite'
    let store, loadImpl, swappedRegistration = null, evaluated = false, evaluating = false
    const captureFacade = { load(reg) { swappedRegistration = reg } }
    function applyRegistration(reg) {
      if (!reg || reg.id !== ID) return reg
      if (!evaluated) {
        evaluated = true
        evaluating = true
        try { (0, eval)(source) } catch (error) {
          window.__psInject = { swapped: false, error: String((error && error.message) || error) }
        } finally { evaluating = false }
      }
      if (swappedRegistration !== null && typeof swappedRegistration.factory === 'function') {
        const inner = swappedRegistration.factory
        window.__psInject = { swapped: true, at: Date.now() }
        return { id: reg.id, factory: (require) => { window.__psInjectedFactoryRan = true; return inner(require) } }
      }
      return reg
    }
    function install(loader) {
      if (!loader || typeof loader.load !== 'function') return loader
      let impl = loader.load
      Object.defineProperty(loader, 'load', {
        configurable: true,
        get() { return function (reg) { return impl.call(loader, applyRegistration(reg)) } },
        set(next) { impl = next }
      })
      return loader
    }
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      get() { return evaluating ? captureFacade : store },
      set(next) { store = install(next) }
    })
  }
  window.__psInjectedFactoryRan = false
  window.__psInjectErrors = []
  init(__PSD_SOURCE__)
})()`

function injectorSource(clientSource) {
  return INJECT_SCRIPT.replace('__PSD_SOURCE__', () => JSON.stringify(clientSource))
}

// ---------------------------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------------------------

class Results {
  constructor() {
    this.rows = []
  }

  async check(id, title, fn) {
    const started = Date.now()
    try {
      const detail = await fn()
      this.rows.push({ id, title, pass: true, detail: detail ? short(detail) : '', ms: Date.now() - started })
      log(`PASS  ${id}  ${title}${detail ? ` — ${short(detail)}` : ''}`)
    } catch (error) {
      const detail = error?.message || String(error)
      this.rows.push({ id, title, pass: false, detail, ms: Date.now() - started })
      log(`FAIL  ${id}  ${title} — ${short(detail, 400)}`)
    }
  }

  get failures() {
    return this.rows.filter((row) => !row.pass)
  }
}

// ---------------------------------------------------------------------------------------------
// Shared page probes (plain serializable functions)
// ---------------------------------------------------------------------------------------------

const probe = {
  appReady: () =>
    document.readyState === 'complete' &&
    !!document.querySelector('[data-slot="main"]') &&
    window.__psInjectedFactoryRan === true,

  /**
   * Geometry of the "Running & recent" card: every row (parent and child) with the
   * rect of its fixed trailing columns.
   */
  panelGeometry: () => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    }
    const styleOf = (el) => {
      if (!el) return null
      const s = getComputedStyle(el)
      return { fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight, fontFamily: s.fontFamily, transform: s.textTransform }
    }
    const titleOf = (el, sel) => {
      const node = el.querySelector(sel)
      if (!node) return null
      const s = getComputedStyle(node)
      return {
        rect: rect(node),
        style: styleOf(node),
        text: (node.innerText || '').trim(),
        clipped: node.getAttribute('data-clipped') === 'true',
        mask: s.maskImage || s.webkitMaskImage || 'none',
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }
    }
    const rows = [...document.querySelectorAll('.psd-run, .psd-child')].map((el) => ({
      kind: el.classList.contains('psd-run') ? 'parent' : 'child',
      state: el.dataset.state,
      rect: rect(el),
      title: titleOf(el, '.psd-run-title, .psd-child-title'),
      time: (() => {
        const node = el.querySelector('.psd-run-time, .psd-child-time')
        return node ? { rect: rect(node), style: styleOf(node) } : null
      })(),
      actions: (() => {
        const node = el.querySelector('.psd-run-actions')
        return node ? { rect: rect(node), width: node.getBoundingClientRect().width } : null
      })(),
      actionButtons: [...el.querySelectorAll('.psd-row-action')].map((button) => ({
        rect: rect(button),
        radius: getComputedStyle(button).borderRadius,
        hidden: button.dataset.hidden,
      })),
      toggle: (() => {
        const node = el.querySelector('.psd-run-toggle') || el.querySelector('.psd-run-toggle-spacer')
        return node ? rect(node) : null
      })(),
    }))
    const head = [...document.querySelectorAll('.psd-panel-head > *')].map((el) => ({
      className: String(el.className),
      rect: rect(el),
    }))
    const panel = document.querySelector('.psd-panel')
    const sidebar = panel ? panel.closest('[class*="_sidebarCol"]') : null
    return {
      rows,
      head,
      panel: rect(panel),
      sidebar: sidebar ? rect(sidebar) : null,
      headerTitle: (() => {
        const node = document.querySelector('.psd-panel-title')
        return node ? { rect: rect(node), style: styleOf(node) } : null
      })(),
      groupLabels: [...document.querySelectorAll('.psd-group-label')].map((el) => ({
        text: (el.innerText || '').trim(),
        style: styleOf(el),
      })),
    }
  },

  /** Native sidebar session-row rects that are fully visible in the tree. */
  nativeSessionRows: () => {
    const tree = document.querySelector('[role="tree"]')
    const panel = document.querySelector('.psd-panel')
    const treeRect = tree ? tree.getBoundingClientRect() : null
    const panelRect = panel ? panel.getBoundingClientRect() : null
    return [...document.querySelectorAll('[data-row-key^="session:"]')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        const overlapped =
          panelRect !== null &&
          !(r.bottom <= panelRect.top || r.top >= panelRect.bottom || r.right <= panelRect.left || r.left >= panelRect.right)
        return {
          key: el.getAttribute('data-row-key'),
          text: (el.innerText || '').trim().slice(0, 80),
          rect: {
            left: Math.round(r.left),
            right: Math.round(r.right),
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            width: Math.round(r.width),
            height: Math.round(r.height),
          },
          inTree: treeRect !== null && r.top >= treeRect.top && r.bottom <= Math.min(treeRect.bottom, innerHeight),
          overlapped,
        }
      })
      .filter((row) => row.inTree && !row.overlapped)
  },

  /** Native sidebar tooltip (`_card_`) measurement, if present. */
  nativeTooltip: () => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const card = [...document.querySelectorAll('[class*="_card_"]')].find((el) => {
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return (s.position === 'fixed' || s.position === 'absolute') && r.width > 20 && r.height > 20
    })
    if (!card) return null
    const style = getComputedStyle(card)
    const inner = (sel) => {
      const node = card.querySelector(sel)
      if (!node) return null
      const s = getComputedStyle(node)
      return { fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight, color: s.color, rect: rect(node) }
    }
    const panel = document.querySelector('.psd-panel')
    const sidebar = panel ? panel.closest('[class*="_sidebarCol"]') : null
    return {
      rect: rect(card),
      sidebarRight: sidebar ? Math.round(sidebar.getBoundingClientRect().right) : null,
      offsetFromSidebarRight: sidebar ? Math.round(card.getBoundingClientRect().left - sidebar.getBoundingClientRect().right) : null,
      radius: style.borderRadius,
      borderWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      padding: style.padding,
      background: style.backgroundColor,
      title: inner('[class*="hoverTitle"]'),
      path: inner('[class*="hoverPath"]'),
      time: inner('[class*="hoverTime"]'),
      status: inner('[class*="hoverStatus"]'),
    }
  },

  /** Our hover card measurement (all values needed for the native-oracle comparison). */
  hoverCard: () => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const card = document.querySelector('[data-psd-hovercard]')
    if (!card) return null
    const style = getComputedStyle(card)
    const inner = (sel) => {
      const node = card.querySelector(sel)
      if (!node) return null
      const s = getComputedStyle(node)
      return { fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight, color: s.color }
    }
    const panel = document.querySelector('.psd-panel')
    const sidebar = panel ? panel.closest('[class*="_sidebarCol"]') : null
    return {
      rect: rect(card),
      sidebarRight: sidebar ? Math.round(sidebar.getBoundingClientRect().right) : null,
      offsetFromSidebarRight: sidebar ? Math.round(card.getBoundingClientRect().left - sidebar.getBoundingClientRect().right) : null,
      radius: style.borderRadius,
      borderWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      padding: style.padding,
      background: style.backgroundColor,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      pinned: card.getAttribute('data-psd-pinned'),
      title: inner('.psd-hovercard-title'),
      path: inner('.psd-hovercard-path'),
      status: inner('.psd-hovercard-status'),
      text: (card.innerText || '').trim().slice(0, 400),
    }
  },

  /** Row hover-highlight state for the currently hovered row. */
  hoverHighlight: () => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const rows = [...document.querySelectorAll('.psd-run, .psd-child')]
    let hoveredRow = null
    for (const row of rows) if (row.matches(':hover')) hoveredRow = row
    const main = hoveredRow ? hoveredRow.querySelector('.psd-run-main, .psd-child-main') : null
    const actions = hoveredRow ? hoveredRow.querySelector('.psd-run-actions') : null
    const actionButtons = hoveredRow ? [...hoveredRow.querySelectorAll('.psd-row-action')] : []
    const toggle = hoveredRow ? hoveredRow.querySelector('.psd-run-toggle') : null
    return {
      hovered: hoveredRow !== null,
      kind: hoveredRow ? (hoveredRow.classList.contains('psd-run') ? 'parent' : 'child') : null,
      mainBackground: main ? getComputedStyle(main).backgroundColor : null,
      mainRect: rect(main),
      actionsOpacity: actions ? getComputedStyle(actions).opacity : null,
      actionRects: actionButtons.map((button) => rect(button)),
      actionRadii: actionButtons.map((button) => getComputedStyle(button).borderRadius),
      toggleRect: rect(toggle),
    }
  },

  /** Current-Session wave facts on the card row and the native Workspace row. */
  currentHighlight: () => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const pseudo = (el, which) => {
      if (!el) return null
      const s = getComputedStyle(el, which)
      return {
        backgroundImage: s.backgroundImage,
        animationName: s.animationName,
        opacity: s.opacity,
        height: s.height,
        filter: s.filter,
      }
    }
    const row = document.querySelector('.psd-run-current, .psd-child-current')
    const wave = row
      ? row.classList.contains('psd-run-current')
        ? pseudo(row, '::before')
        : pseudo(row.querySelector('.psd-child-wave'), '::after')
      : null
    const marker = document.querySelector('[data-psd-current-workspace]')
    const markerSection = (() => {
      let node = marker
      for (let i = 0; i < 8 && node && node.parentElement; i += 1) {
        node = node.parentElement
        if (node.matches && node.matches('[role="tree"]')) return null
        if (node.querySelector && node.querySelector('[data-row-key^="session:"]')) return node
      }
      return null
    })()
    const sessionId = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null
    const ringPresent = document.querySelector('.psd-child-ring') !== null
    const oldRing = row ? getComputedStyle(row, '::before').content !== 'none' && getComputedStyle(row, '::before').backgroundImage.includes('conic-gradient') : false
    return {
      row: row ? { className: row.className, rect: rect(row), current: row.getAttribute('aria-current') } : null,
      wave,
      childWave: document.querySelector('.psd-child-wave') !== null,
      ringPresent,
      oldRing,
      marker: marker
        ? {
            rowKey: marker.getAttribute('data-row-key'),
            rect: rect(marker),
            wave: pseudo(marker, '::after'),
            ownsCurrentSession:
              sessionId !== null && markerSection !== null && [...markerSection.querySelectorAll('[data-row-key^="session:"]')].some((el) => el.getAttribute('data-row-key') === `session:${sessionId}`),
          }
        : null,
      markerCount: document.querySelectorAll('[data-psd-current-workspace]').length,
      sessionId,
    }
  },

  /** Fold state: persisted documents, header aria state and native section display. */
  foldState: () => {
    const displays = [...document.querySelectorAll('[data-row-key^="workspace:"]')].map((row) => {
      let el = row
      for (let i = 0; i < 8 && el && el.parentElement && !el.parentElement.matches('[role="tree"]'); i += 1) el = el.parentElement
      return { key: row.getAttribute('data-row-key'), display: el ? el.style.display : null, order: el ? el.style.order : null }
    })
    const active = document.querySelector('[data-psd="group"][data-group="active"] .psd-group-toggle')
    const inactive = document.querySelector('[data-psd="group"][data-group="inactive"] .psd-group-toggle')
    const read = (key) => {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    }
    return {
      folds: read('power-suite.dynamic-workspaces.folds'),
      buckets: read('power-suite.dynamic-workspaces.buckets'),
      activeExpanded: active ? active.getAttribute('aria-expanded') : null,
      inactiveExpanded: inactive ? active ? inactive.getAttribute('aria-expanded') : null : null,
      hiddenCount: displays.filter((entry) => entry.display === 'none').length,
      displays,
      panelPresent: document.querySelector('.psd-panel') !== null,
      groupHeadersPresent: active !== null && inactive !== null,
    }
  },

  /** Shared rainbow focus ring measurement for a focused plugin input wrapper. */
  focusRing: (selector) => {
    const field = document.querySelector(selector)
    if (!field) return { present: false }
    const s = getComputedStyle(field, '::after')
    return {
      present: true,
      afterOpacity: s.opacity,
      afterAnimation: s.animationName,
      afterBackground: s.backgroundImage,
      afterMask: `${s.maskImage || s.webkitMaskImage || ''} ${s.maskComposite || s.webkitMaskComposite || ''}`.trim(),
      focused: field.contains(document.activeElement),
    }
  },

  /** Computed style of a transient element with the given class (stylesheet oracle). */
  computedForClass: (className) => {
    const el = document.createElement('div')
    el.className = className
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    el.style.top = '0'
    el.textContent = 'x'
    document.body.appendChild(el)
    const s = getComputedStyle(el)
    const result = { borderWidth: s.borderTopWidth, borderStyle: s.borderTopStyle, radius: s.borderRadius, boxShadow: s.boxShadow, background: s.backgroundColor }
    el.remove()
    return result
  },
}

// ---------------------------------------------------------------------------------------------
// Setup helpers (page-side work shared by checks)
// ---------------------------------------------------------------------------------------------

/**
 * Reload the page and wait until the NEW document is live (a window marker set before
 * the reload disappears), so fold/first-paint polling never reads the old document.
 */
async function reloadFresh(page) {
  await page.evaluate('window.__psdE2ENewDocument = true')
  await page.reload()
  await page.waitFor(
    `typeof window.__psdE2ENewDocument === 'undefined' && document.readyState !== 'loading'`,
    { timeout: 20000, label: 'fresh document after reload' }
  )
}

async function ensureAppReady(page) {
  await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'DSH shell + injected plugin factory' })
  await page.waitForFn(() => !!document.querySelector('[data-slot="sidebar.workspaces"]'), [], { timeout: 20000, label: 'sidebar Workspaces slot' })
  await page.waitForFn(() => !!document.querySelector('.psd-panel'), [], { timeout: 20000, label: 'Running & recent card mounted' })
}

/** Open/verify one blank Session through the native flow (never typed into). */
async function ensureBlankSession(page) {
  // Wait for the auto-restored session + composer, then check the transcript is empty.
  try {
    await page.waitForFn(
      () => !!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]'),
      [],
      { timeout: 12000, label: 'restored session + composer' }
    )
  } catch {
    // fall through to the native New Session button
  }
  const readState = () =>
    page.eval(() => {
      const session = document.querySelector('[data-conversation-session]')
      const editor = document.querySelector('[data-lexical-editor="true"]')
      const messages = document.querySelectorAll('[data-conversation-message]').length
      const draft = editor ? (editor.innerText || '').trim() : ''
      return {
        sessionId: session ? session.getAttribute('data-conversation-session') : null,
        hasEditor: editor !== null,
        messages,
        draftLength: draft.length,
        attachments: document.querySelectorAll('[data-composer-attachment]').length,
      }
    })
  let state = await readState().catch(() => null)
  if (!state || state.sessionId === null || !state.hasEditor) {
    const button = await page.eval(() => {
      const candidates = [...document.querySelectorAll('button[aria-label="New session"]')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.left < 400 && r.top < 200)
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
      const hit = candidates[0]
      return hit ? { x: Math.round(hit.r.left + hit.r.width / 2), y: Math.round(hit.r.top + hit.r.height / 2) } : null
    })
    assert(button, 'native New Session button not found')
    await page.clickAt(button.x, button.y)
    await page.waitForFn(
      () => !!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]'),
      [],
      { timeout: 20000, label: 'native New Session opened a Session' }
    )
    await sleep(500)
    state = await readState()
  }
  assert(state.sessionId !== null, 'no Session is open after the native New Session flow')
  assert(state.messages === 0, `refusing to continue: the open Session has ${state.messages} transcript messages (not blank)`)
  assert(state.draftLength === 0, 'refusing to continue: the composer draft is not empty')
  assert(state.attachments === 0, 'refusing to continue: the composer has attachments')
  return state
}

/** Wait for at least one running/recent row and return the card row count. */
async function ensurePanelRows(page) {
  try {
    await page.waitForFn(() => document.querySelectorAll('.psd-run').length > 0, [], { timeout: 12000, label: 'running/recent card rows' })
  } catch {
    const empty = await page.eval(() => document.querySelector('.psd-panel-empty') !== null)
    throw new Error(
      'the "Running & recent" card has no rows. This harness verifies card rows against live data and never fabricates activity: ' +
        'start a Session (or finish one inside the retention window) and rerun.' +
        (empty ? ' The card is showing its empty state.' : '')
    )
  }
  return page.count('.psd-run')
}

/**
 * Make one native session row visible for the hover-card oracle: expand the first
 * collapsed Workspace group (the native tree starts collapsed on a fresh profile).
 */
async function ensureNativeSessionRow(page) {
  const visible = () => page.eval(probe.nativeSessionRows)
  let rows = await visible()
  if (rows.length > 0) return rows[0]
  const workspaceRows = await page.eval(() => {
    const tree = document.querySelector('[role="tree"]')
    if (!tree) return []
    const rows = [...tree.children].filter((el) => el.querySelector('[data-row-key^="workspace:"]'))
    return rows.map((el) => {
      const row = el.querySelector('[data-row-key^="workspace:"]')
      const r = row.getBoundingClientRect()
      return {
        key: row.getAttribute('data-row-key'),
        expanded: row.getAttribute('aria-expanded'),
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      }
    })
  })
  for (const workspace of workspaceRows) {
    if (workspace.expanded === 'true') continue
    if (workspace.y <= 0 || workspace.y >= VIEWPORT.height) {
      await page.eval((key) => {
        const row = document.querySelector(`[data-row-key="${key}"]`)
        if (row) row.scrollIntoView({ block: 'center' })
      }, workspace.key)
      await sleep(250)
      const moved = await page.eval((key) => {
        const row = document.querySelector(`[data-row-key="${key}"]`)
        if (!row) return null
        const r = row.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      }, workspace.key)
      if (!moved) continue
      workspace.x = moved.x
      workspace.y = moved.y
    }
    await page.clickAt(workspace.x, workspace.y)
    await sleep(350)
    rows = await visible()
    if (rows.length > 0) return rows[0]
  }
  // Last resort: a restored Session's group may already be open further down the tree.
  await page.eval(() => {
    const tree = document.querySelector('[role="tree"]')
    if (tree) tree.scrollTop = tree.scrollHeight
  })
  await sleep(400)
  rows = await visible()
  assert(rows.length > 0, 'no native sidebar session row is visible; cannot measure the native tooltip oracle')
  return rows[0]
}

async function hoverRow(page, rowIndex) {
  const target = await page.eval((index) => {
    const rows = [...document.querySelectorAll('.psd-run, .psd-child')]
    const row = rows[index]
    if (!row) return null
    const r = row.getBoundingClientRect()
    const title = row.querySelector('.psd-run-title, .psd-child-title')
    const tr = title ? title.getBoundingClientRect() : r
    return {
      rowTop: Math.round(r.top),
      x: Math.round(tr.left + Math.min(40, tr.width / 2)),
      y: Math.round(r.top + r.height / 2),
    }
  }, rowIndex)
  assert(target, `card row ${rowIndex} not found`)
  // Leave the row first: dispatching a mouse move to the exact current coordinates is
  // a no-op, which would keep a previously dismissed row's hover state dead.
  await page.moveTo(900, 500)
  await sleep(180)
  await page.moveTo(target.x, target.y)
  return target
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

async function runSmoke({ page, results, state }) {
  log('\n=== Smoke: pipeline ===')
  await results.check('smoke-1', 'app loaded and plugin factory injected from this worktree', async () => {
    await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'app ready' })
    const probeState = await page.evaluate(
      `({ injected: window.__psInjectedFactoryRan === true, swapped: !!(window.__psInject && window.__psInject.swapped), error: window.__psInject?.error || null, errors: window.__psInjectErrors || [] })`
    )
    assert(probeState.injected, 'wrapper factory never ran')
    assert(probeState.swapped, `registration factory was not swapped (error: ${probeState.error})`)
    assertEqual(probeState.errors.length, 0, 'injection script errors')
    return 'worktree client.js evaluated in the live page'
  })
  await results.check('smoke-2', '"Running & recent" card mounted above the native browser', async () => {
    await page.waitForFn(() => !!document.querySelector('.psd-panel'), [], { timeout: 25000, label: 'card mounted' })
    const details = await page.eval(() => {
      const slot = document.querySelector('[data-slot="sidebar.workspaces"]')
      const root = slot ? slot.firstElementChild : null
      return {
        insideWorkspacesSlot: slot !== null && slot.contains(document.querySelector('.psd-panel')),
        aboveNativeHeader: root !== null && root.firstElementChild && root.firstElementChild.hasAttribute('data-psd'),
        panels: document.querySelectorAll('.psd-panel').length,
      }
    })
    assert(details.insideWorkspacesSlot, 'card is not inside [data-slot="sidebar.workspaces"]')
    assertEqual(details.panels, 1, 'expected exactly one running card')
    return 'card inside the native Workspaces browser root'
  })
  await results.check('smoke-3', 'blank Session open/verified (never typed into)', async () => {
    const blank = await ensureBlankSession(page)
    state.sessionId = blank.sessionId
    return `blank Session ${blank.sessionId}, 0 messages, empty draft`
  })
  await results.check('smoke-4', 'screenshot round-trip produces 1728x900 PNG', async () => {
    const buffer = Buffer.from(await page.screenshotBase64(), 'base64')
    assert(buffer.length > 20000, `screenshot too small: ${buffer.length} bytes`)
    state.smokeBytes = buffer.length
    return `${buffer.length} bytes`
  })
}

async function runLayoutChecks({ page, results, state }) {
  log('\n=== B1/B2: row columns, fade mask, hover highlights ===')
  await results.check('b1-1', 'card lists at least one running/recent row', async () => {
    const count = await ensurePanelRows(page)
    state.rows = await page.eval(probe.panelGeometry)
    return `${count} top-level rows, ${state.rows.rows.length} rows incl. subagents`
  })

  await results.check('b1-2', 'actions / time / disclosure share fixed columns across parent and child rows', async () => {
    const geometry = await page.eval(probe.panelGeometry)
    const rows = geometry.rows
    assert(rows.length >= 2, `need at least two rows to compare columns, got ${rows.length}`)
    state.geometry = geometry
    const collect = (fn) => rows.map(fn).filter((value) => value !== null && Number.isFinite(value))
    const actionRights = collect((row) => row.actionButtons.length > 0 ? row.actionButtons[row.actionButtons.length - 1].rect.right : null)
    const timeRights = collect((row) => row.time?.rect.right)
    const toggleRights = collect((row) => row.toggle?.right)
    const titleRights = collect((row) => row.title?.rect.right)
    const spread = (values) => Math.max(...values) - Math.min(...values)
    assert(actionRights.length === rows.length, `every row must render the New session slot: ${actionRights.length}/${rows.length}`)
    assertNear(spread(actionRights), 0, 1, `New session button right edges must align across rows (${JSON.stringify(actionRights)})`)
    assertNear(spread(timeRights), 0, 1, `time right edges must align across rows (${JSON.stringify(timeRights)})`)
    assertNear(spread(toggleRights), 0, 1, `disclosure/spacer right edges must align across rows (${JSON.stringify(toggleRights)})`)
    assertNear(spread(titleRights), 0, 1, `title right edges must align on the shared column (${JSON.stringify(titleRights)})`)
    const parentAction = rows.find((row) => row.kind === 'parent' && row.actionButtons.length > 0)
    const childAction = rows.find((row) => row.kind === 'child' && row.actionButtons.length > 0)
    if (parentAction && childAction) {
      assertNear(parentAction.actionButtons[parentAction.actionButtons.length - 1].rect.left, childAction.actionButtons[childAction.actionButtons.length - 1].rect.left, 1, 'parent and child New session buttons must be on one column')
    }
    // The header chevron shares the row disclosure column.
    const headChevron = geometry.head.find((part) => part.className.includes('psd-panel-chevron'))
    assert(headChevron, 'header chevron missing')
    assertNear(headChevron.rect.right, toggleRights[0], 1, `header chevron right edge must line up with the row disclosure column (chevron ${headChevron.rect.right}, rows ${toggleRights[0]})`)
    assertNear(headChevron.rect.width, 24, 0.5, 'header chevron column width')
    return `actions right ${actionRights[0]}, time right ${timeRights[0]}, disclosure right ${toggleRights[0]}, titles right ${titleRights[0]} (${rows.length} rows)`
  })

  await results.check('b1-3', 'long titles carry the right-edge gradient mask; short titles do not', async () => {
    const geometry = await page.eval(probe.panelGeometry)
    const titles = geometry.rows.map((row) => row.title).filter(Boolean)
    const clipped = titles.filter((title) => title.clipped)
    assert(clipped.length > 0, 'no clipped row title: expected at least one long Session title at this width')
    for (const title of clipped) {
      assert(title.mask.includes('linear-gradient'), `clipped title "${short(title.text, 30)}" has no gradient mask: ${title.mask}`)
    }
    const unclipped = titles.filter((title) => !title.clipped)
    for (const title of unclipped) {
      assertEqual(title.mask, 'none', `unclipped title "${short(title.text, 30)}" must not be masked`)
    }
    // The fade must sit in the last ~18px of the title column and never eat a short title.
    const sample = clipped[0]
    assert(sample.scrollWidth > sample.clientWidth, 'clipped flag disagrees with the measured overflow')
    return `${clipped.length} masked / ${unclipped.length} unmasked titles; fade ${sample.mask}`
  })

  await results.check('b1-4', 'header controls are content-paced with fixed 24px disclosure column', async () => {
    const geometry = await page.eval(probe.panelGeometry)
    const toggle = geometry.head.find((part) => part.className.includes('psd-panel-toggle'))
    const spacer = geometry.head.find((part) => part.className.includes('psd-panel-head-spacer'))
    const chevron = geometry.head.find((part) => part.className.includes('psd-panel-chevron'))
    assert(toggle && spacer && chevron, 'header is missing the toggle/spacer/chevron parts')
    assert(toggle.rect.height === 30 && chevron.rect.height === 30, 'header control heights must stay 30px')
    assertNear(chevron.rect.width, 24, 0.5, 'header chevron column must be 24px wide')
    assert(toggle.rect.right < spacer.rect.left + spacer.rect.width + 1, 'header toggle must be content-sized, the spacer takes the slack')
    return `toggle ${toggle.rect.width}px + spacer ${spacer.rect.width}px + chevron ${chevron.rect.width}px`
  })

  await results.check('b2-1', 'hover reveals fixed-size control highlights and a content-paced body pill', async () => {
    await page.eval(() => window.scrollTo(0, 0))
    const target = await hoverRow(page, 0)
    await sleep(400)
    const hovered = await page.eval(probe.hoverHighlight)
    assert(hovered.hovered, 'no card row registered :hover after moving the pointer')
    assert(hovered.kind === 'parent', `expected to hover a parent row, got ${hovered.kind}`)
    assert(hovered.actionsOpacity === '1', `action cluster must reveal on hover (opacity ${hovered.actionsOpacity})`)
    for (const rect of hovered.actionRects) {
      assertEqual(rect.width, 22, 'action button highlight width')
      assertEqual(rect.height, 22, 'action button highlight height')
    }
    for (const radius of hovered.actionRadii) assert(radius !== '0px', 'action buttons must keep their rounded highlight block')
    const body = hovered.mainRect
    assert(body, 'hovered body pill rect missing')
    assert(body.width < state.geometry.panel.width, 'body pill must be content-sized, not the full card width')
    assert(hovered.mainBackground !== 'rgba(0, 0, 0, 0)', 'hovered body pill has no background')
    state.hover = hovered
    return `pill ${body.width}x${body.height}, actions ${hovered.actionRects.map((r) => `${r.width}x${r.height}`).join('+')}, top ${target.rowTop}`
  })

  await results.check('b2-2', 'parent, child and header controls keep identical highlight geometry', async () => {
    const rows = state.geometry.rows
    const parentIndex = rows.findIndex((row) => row.kind === 'parent')
    const childIndex = rows.findIndex((row) => row.kind === 'child')
    assert(parentIndex >= 0 && childIndex >= 0, 'need both a parent and a nested child row')
    await hoverRow(page, parentIndex)
    await sleep(300)
    const parentHover = await page.eval(probe.hoverHighlight)
    await hoverRow(page, childIndex)
    await sleep(300)
    const childHover = await page.eval(probe.hoverHighlight)
    assert(parentHover.actionRects.length > 0 && childHover.actionRects.length > 0, 'both rows must expose the action buttons')
    const lastParent = parentHover.actionRects[parentHover.actionRects.length - 1]
    const lastChild = childHover.actionRects[childHover.actionRects.length - 1]
    assertNear(lastParent.width, lastChild.width, 0, 'New session highlight widths differ between parent and child rows')
    assertNear(lastParent.left, lastChild.left, 1, 'New session highlights do not share one column')
    const headerToggle = state.geometry.head.find((part) => part.className.includes('psd-panel-toggle'))
    assert(headerToggle && headerToggle.rect.height === 30, 'header toggle control lost its 30px height')
    await page.moveTo(900, 500)
    await sleep(300)
    return `parent/child action blocks ${lastParent.width}px at x=${lastParent.left}; header toggle ${headerToggle.rect.width}x30`
  })
}

async function runCurrentHighlightChecks({ page, results, state }) {
  log('\n=== B4: current-Session rainbow wave (card + Workspace row) ===')
  await results.check('b4-0', 'open a card row to make its Session current', async () => {
    const target = await page.eval(() => {
      const row = document.querySelector('.psd-run')
      if (!row) return null
      const main = row.querySelector('.psd-run-main')
      const r = main.getBoundingClientRect()
      return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2), title: row.querySelector('.psd-run-title')?.innerText ?? '' }
    })
    assert(target, 'no card row to open')
    state.openedTitle = target.title
    await page.clickAt(target.x, target.y)
    await page.waitForFn(
      () => !!document.querySelector('.psd-run-current') || !!document.querySelector('.psd-child-current'),
      [],
      { timeout: 15000, label: 'current-Session row marker' }
    )
    await sleep(1200)
    return `opened "${short(target.title, 40)}"`
  })

  await results.check('b4-1', 'card row and owning native Workspace row carry the wave (no conic ring left)', async () => {
    let highlight = await page.eval(probe.currentHighlight)
    state.highlight = highlight
    if (highlight.marker && highlight.sessionId !== null && highlight.marker.rowKey) {
      const opened = await page.eval((rowKey) => {
        const row = document.querySelector(`[data-row-key="${rowKey}"]`)
        if (!row) return { present: false }
        if (row.getAttribute('aria-expanded') === 'false') {
          row.click()
          return { present: true, expanded: true }
        }
        return { present: true, expanded: false }
      }, highlight.marker.rowKey)
      if (opened.expanded) {
        await sleep(500)
        highlight = await page.eval(probe.currentHighlight)
        state.highlight = highlight
      }
    }
    assert(highlight.row, 'current card row has no .psd-run-current/.psd-child-current class')
    assertEqual(highlight.row.current, 'true', 'current card row must expose aria-current')
    assert(!highlight.ringPresent, 'the old .psd-child-ring element is still rendered')
    assert(!highlight.oldRing, 'the current row still paints a conic-gradient ring')
    assert(highlight.wave, 'current row wave facts missing')
    assert(highlight.wave.backgroundImage.includes('linear-gradient'), `current row highlight must be the rainbow wave, got ${highlight.wave.backgroundImage}`)
    assert(highlight.wave.animationName.includes('psd-wave'), `wave animation missing (${highlight.wave.animationName})`)
    assert(highlight.marker, 'no native Workspace row carries data-psd-current-workspace')
    assertEqual(highlight.markerCount, 1, 'exactly one native Workspace row must be marked')
    assert(highlight.marker.wave.backgroundImage.includes('linear-gradient'), 'Workspace row highlight must be the rainbow wave')
    assert(highlight.marker.wave.animationName.includes('psd-wave'), 'Workspace row wave animation missing')
    assert(highlight.marker.ownsCurrentSession, `marked Workspace row does not own the open Session ${highlight.sessionId}`)
    return `${highlight.row.className} + ${highlight.marker.rowKey}; wave ${highlight.wave.animationName}`
  })

  await results.check('b4-2', 'opening another sidebar Session moves the marker to its Workspace', async () => {
    const before = await page.eval(probe.currentHighlight)
    const rows = await page.count('.psd-run')
    const target = await page.eval((index) => {
      const row = document.querySelectorAll('.psd-run')[index]
      if (!row) return null
      const main = row.querySelector('.psd-run-main')
      const r = main.getBoundingClientRect()
      return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }
    }, rows > 1 ? 1 : 0)
    assert(target, 'top-level card row not found for the marker-move check')
    await page.moveTo(900, 500)
    await sleep(200)
    await page.clickAt(target.x, target.y)
    await page.waitForFn(
      () => !!document.querySelector('.psd-run-current, .psd-child-current'),
      [],
      { timeout: 15000, label: 'card current row after opening another Session' }
    )
    await sleep(1800)
    let highlight = await page.eval(probe.currentHighlight)
    assertEqual(highlight.markerCount, 1, 'exactly one native Workspace row must stay marked')
    assertEqual(highlight.sessionId === before.sessionId, rows <= 1, `opening another card row did not change the main-view Session`)
    if (highlight.marker && highlight.sessionId !== null && highlight.marker.rowKey) {
      const expanded = await page.eval((rowKey) => {
        const row = document.querySelector(`[data-row-key="${rowKey}"]`)
        if (!row) return false
        if (row.getAttribute('aria-expanded') === 'false') { row.click(); return true }
        return false
      }, highlight.marker.rowKey)
      if (expanded) {
        await sleep(500)
        highlight = await page.eval(probe.currentHighlight)
      }
    }
    assert(highlight.marker.ownsCurrentSession, 'workspace marker did not move to the newly opened Session')
    return `marker follows ${highlight.sessionId} on ${highlight.marker.rowKey}`
  })

  await results.check('b4-3', 'reduced motion leaves a static (unanimated) tint', async () => {
    await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await sleep(400)
    const highlight = await page.eval(probe.currentHighlight)
    assertEqual(highlight.wave.animationName, 'none', 'reduced motion must stop the card wave animation')
    assertEqual(highlight.marker.wave.animationName, 'none', 'reduced motion must stop the Workspace wave animation')
    assert(Number(highlight.wave.opacity) > 0.1, `reduced motion must leave a visible static tint (opacity ${highlight.wave.opacity})`)
    await page.emulateMedia([])
    await sleep(200)
    return `static tint at opacity ${highlight.wave.opacity}`
  })
}

async function runHoverCardChecks({ page, results, state }) {
  log('\n=== B5/C2/C3: row hover card vs the native tooltip oracle ===')
  await results.check('b5-1', 'native sidebar tooltip measured live as the alignment oracle', async () => {
    const native = await ensureNativeSessionRow(page)
    await page.moveTo(900, 500)
    await sleep(400)
    await page.moveTo(native.rect.left + 40, native.rect.top + Math.round(native.rect.height / 2))
    await sleep(1200)
    let tooltip = await page.eval(probe.nativeTooltip)
    if (tooltip === null) {
      // The native tooltip has its own show delay/hover heuristic; retry once.
      await page.moveTo(700, 400)
      await sleep(400)
      await page.moveTo(native.rect.left + 40, native.rect.top + Math.round(native.rect.height / 2))
      await sleep(1400)
      tooltip = await page.eval(probe.nativeTooltip)
    }
    assert(tooltip, 'native hover tooltip did not appear over a native session row')
    state.nativeTooltip = tooltip
    state.nativeRow = native
    assertEqual(tooltip.offsetFromSidebarRight, 0, 'native tooltip must sit flush on the sidebar right edge')
    assertEqual(tooltip.borderWidth, '0px', 'native tooltip must be borderless')
    return `flush offset ${tooltip.offsetFromSidebarRight}px, radius ${tooltip.radius}, padding ${tooltip.padding}`
  })

  await results.check('b5-2', 'our hover card reproduces the native geometry and chrome', async () => {
    const native = state.nativeTooltip
    const target = await hoverRow(page, 0)
    await sleep(900)
    const card = await page.eval(probe.hoverCard)
    assert(card, 'our hover card did not appear after the hover delay')
    state.hoverCard = card
    assertEqual(card.offsetFromSidebarRight, native.offsetFromSidebarRight, 'hover card left edge must be flush on the sidebar edge like the native tooltip')
    assertNear(card.rect.top, target.rowTop, 1, 'hover card top must align to the hovered row top')
    assertEqual(card.rect.width, 244, 'hover card width must match the native tooltip')
    assertEqual(card.radius, native.radius, 'hover card radius must match the native tooltip')
    assertEqual(card.borderWidth, native.borderWidth, 'hover card must be borderless like the native tooltip')
    assertEqual(card.padding, native.padding, 'hover card padding must match the native tooltip')
    assertEqual(card.pointerEvents, 'none', 'hover card must not capture the pointer in normal mode')
    assertEqual(card.pinned, null, 'normal mode must not pin (data-psd-pinned) the hover card')
    // Native recipe typography + elevation (light theme uses the shell tooltip surface).
    assertEqual(card.title.fontSize, native.title.fontSize, 'hover card title font-size vs native')
    assertEqual(card.title.lineHeight, native.title.lineHeight, 'hover card title line-height vs native')
    assertEqual(card.title.fontWeight, native.title.fontWeight, 'hover card title font-weight vs native')
    assertEqual(card.status.fontSize, native.status.fontSize, 'hover card status font-size vs native')
    assertEqual(card.status.lineHeight, native.status.lineHeight, 'hover card status line-height vs native')
    assertEqual(card.background, native.background, 'hover card background must use the native tooltip surface')
    assert(card.boxShadow.includes('12px 32px'), `hover card must use the native tooltip elevation, got ${short(card.boxShadow, 120)}`)
    state.screenshots = state.screenshots || []
    return `flush ${card.offsetFromSidebarRight}px, top ${card.rect.top} (row ${target.rowTop}), ${card.rect.width}px, radius ${card.radius}, border ${card.borderWidth}`
  })

  await results.check('b5-3', 'hover card dismisses on pointer leave (normal mode unchanged)', async () => {
    await page.moveTo(900, 500)
    await sleep(700)
    const present = await page.eval(() => document.querySelector('[data-psd-hovercard]') !== null)
    assert(!present, 'hover card did not dismiss after the pointer left the row')
    return 'card closed on leave (140 ms delay preserved)'
  })

  await results.check('c2-1', 'plugin floating cards are borderless like the native tooltip', async () => {
    const quicklook = await page.eval(probe.computedForClass, 'dsa-quicklook')
    assertEqual(quicklook.borderWidth, '0px', 'quick-look card must be borderless')
    assert(quicklook.boxShadow.includes('12px 32px'), `quick-look must use the native elevation, got ${short(quicklook.boxShadow, 120)}`)
    const railCard = await page.eval(probe.computedForClass, 'psp-rail-card')
    assertEqual(railCard.borderWidth, '0px', 'prompt-history card must be borderless')
    assert(!/0px 0px 0px 0\.5px/.test(railCard.boxShadow), `prompt-history card still paints a 0.5px stroke ring: ${short(railCard.boxShadow, 120)}`)
    assert(railCard.boxShadow.includes('12px 32px'), 'prompt-history card must use the native elevation')
    return `quicklook border ${quicklook.borderWidth} / rail-card border ${railCard.borderWidth}`
  })

  await results.check('c3-1', 'bucket labels are title case, not uppercase', async () => {
    const labels = state.geometry.groupLabels
    assertEqual(labels.length, 2, 'expected the two bucket labels')
    for (const label of labels) {
      assertEqual(label.style.transform, 'none', `bucket label "${label.text}" still has text-transform`)
      assert(label.text === label.text.replace(/[A-Z]{2,}/g, (match) => match[0] + match.slice(1).toLowerCase()) || /^[A-Z][a-z]/.test(label.text), `bucket label "${label.text}" is not title case`)
      assert(/^Active Projects$|^Inactive Projects$|^活跃项目$|^非活跃项目$/.test(label.text), `unexpected bucket label "${label.text}"`)
    }
    return labels.map((label) => label.text).join(' / ')
  })

  await results.check('c3-2', 'DW typography matches the native sidebar rows', async () => {
    const geometry = state.geometry
    const parent = geometry.rows.find((row) => row.kind === 'parent' && row.title)
    const child = geometry.rows.find((row) => row.kind === 'child' && row.title)
    assert(parent && child, 'need parent and child rows for the typography check')
    assertEqual(parent.title.style.fontSize, '14px', 'main row title font-size must match native session rows (14px)')
    assertEqual(parent.title.style.lineHeight, '20px', 'main row title line-height must match native session rows (20px)')
    assertEqual(parent.title.style.fontWeight, '400', 'main row title weight must match native session rows')
    assertEqual(child.title.style.fontSize, '13px', 'nested subagent title font-size')
    assertEqual(parent.time.style.fontSize, '11px', 'row time font-size')
    const family = await page.eval(() => getComputedStyle(document.body).fontFamily)
    assertEqual(parent.title.style.fontFamily, family, 'row title must inherit the shell font family')
    assertEqual(child.title.style.fontFamily, family, 'nested title must inherit the shell font family')
    const headerFont = geometry.headerTitle.style
    assertEqual(headerFont.fontWeight, '500', 'card header title weight (native strong-small recipe)')
    return `title ${parent.title.style.fontSize}/${parent.title.style.lineHeight}, child ${child.title.style.fontSize}, family inherited`
  })

  await results.check('c3-3', 'hover card inherits the shell font family', async () => {
    const card = state.hoverCard
    const family = await page.eval(() => getComputedStyle(document.body).fontFamily)
    const cardFamily = await page.eval(() => {
      const el = document.querySelector('[data-psd-hovercard]')
      return el ? getComputedStyle(el).fontFamily : null
    })
    if (cardFamily !== null) assertEqual(cardFamily, family, 'hover card font family')
    assert(card, 'hover card was not measured earlier')
    return 'hover card uses the inherited shell family'
  })
}

async function runFocusChecks({ page, results, state }) {
  log('\n=== B3: rainbow focus highlight for plugin inputs ===')
  await results.check('b3-1', 'prompt-history search input shows the rainbow track glow on focus', async () => {
    const toggle = await page.findRect('[data-psp-search-toggle]')
    assert(toggle, 'prompt-history search toggle not found (the prompt rail is not mounted)')
    await page.clickAt(toggle.x, toggle.y)
    await sleep(800)
    const ring = await page.eval(probe.focusRing, '.psp-search-field')
    assert(ring.present, 'search field wrapper missing')
    assert(ring.focused, 'the search input did not take focus when the search card opened')
    assert(Number(ring.afterOpacity) > 0.9, `rainbow ring must be visible when focused (opacity ${ring.afterOpacity})`)
    assert(ring.afterBackground.includes('conic-gradient'), `focus ring must be the rainbow conic track, got ${short(ring.afterBackground, 100)}`)
    assert(ring.afterAnimation.includes('psf-ring'), `focus ring animation missing (${ring.afterAnimation})`)
    assert(ring.afterMask.includes('exclude') || ring.afterMask.includes('xor'), `focus ring must use the mask-composite track recipe (${ring.afterMask})`)
    await page.pressEscape()
    await sleep(400)
    const afterClose = await page.eval(probe.focusRing, '.psp-search-field')
    assertEqual(afterClose.present, false, 'search card did not close on Escape')
    return `conic ring ${ring.afterAnimation}, mask ${short(ring.afterMask, 40)}`
  })

  await results.check('b3-2', 'settings choice pills replaced their solid focus outline with the same ring', async () => {
    const rules = await page.evaluate(`(() => {
      const result = { ringRule: false, ringInputs: false, solidChoiceOutline: false }
      for (const sheet of document.styleSheets) {
        let rules2
        try { rules2 = sheet.cssRules } catch { continue }
        if (!rules2) continue
        for (const rule of rules2) {
          const text = rule.cssText || ''
          if (text.includes('.psf-rainbow-focus') && text.includes('conic-gradient')) result.ringRule = true
          if (text.includes('.psf-rainbow-focus') && text.includes('psp-search-field')) result.ringInputs = true
          if (text.includes('dps-choice-option') && text.includes('focus-visible') && text.includes('outline')) result.solidChoiceOutline = true
        }
      }
      return result
    })()`)
    assert(rules.ringRule, 'shared rainbow-focus stylesheet is missing')
    assert(rules.ringInputs, 'the prompt-history input is not wired to the shared ring')
    assert(!rules.solidChoiceOutline, 'a solid focus outline rule still targets the settings choice pills')
    const rapid = await page.evaluate(`(() => {
      const labels = [...document.querySelectorAll('.dps-choice-option')]
      return labels.length
    })()`)
    return `shared ring present, solid choice outline removed (${rapid} choice pills in the DOM if the settings page is mounted)`
  })
}

async function runFoldChecks({ page, results, state }) {
  log('\n=== C4: persisted bucket folds (first paint + live drift) ===')
  const readFoldState = () => page.eval(probe.foldState)
  const clickBucket = async (group) => {
    const clicked = await page.eval((name) => {
      const el = document.querySelector(`[data-psd="group"][data-group="${name}"] .psd-group-toggle`)
      if (!el) return false
      el.click()
      return true
    }, group)
    assert(clicked, `bucket ${group} toggle not found`)
    await sleep(500)
  }

  await results.check('c4-1', 'collapsing a bucket hides its native sections and persists the fold', async () => {
    const before = await readFoldState()
    assert(before.groupHeadersPresent, 'bucket headers are not mounted')
    await clickBucket('active')
    const folded = await readFoldState()
    assertEqual(folded.activeExpanded, 'false', 'Active Projects header did not collapse')
    assertEqual(folded.hiddenCount > 0 || folded.displays.every((entry) => entry.display !== 'none'), true, 'collapsed bucket did not hide native sections')
    const folds = JSON.parse(folded.folds || '{}')
    assertEqual(folds.active, true, 'fold document does not record the collapsed Active bucket')
    assert(folded.buckets !== null, 'bucket classification cache was not written')
    state.foldFolded = folded
    return `hidden ${folded.hiddenCount}/${folded.displays.length} sections, folds ${folded.folds}`
  })

  await results.check('c4-2', 'reload keeps the bucket collapsed and repaints it promptly', async () => {
    await reloadFresh(page)
    const mountedAt = Date.now()
    const deadline = mountedAt + 12000
    let earlier = null
    let last = null
    while (Date.now() < deadline) {
      const stateNow = await page.eval(probe.foldState).catch(() => null)
      if (stateNow !== null && stateNow.groupHeadersPresent) {
        if (earlier === null) earlier = { at: Date.now(), state: stateNow }
        last = stateNow
        if (stateNow.hiddenCount > 0 && stateNow.activeExpanded === 'false') break
      }
      await sleep(100)
    }
    assert(earlier !== null && last !== null, 'the card/buckets never mounted after the reload')
    assertEqual(last.activeExpanded, 'false', 'the persisted Active fold was not restored after the reload')
    assert(last.hiddenCount > 0, 'the collapsed bucket did not hide its native sections after the reload')
    assert(last.buckets !== null, 'the bucket classification cache is missing after the reload')
    assertEqual(last.folds, state.foldFolded.folds, 'fold document changed across the reload')
    const paintMs = Date.now() - earlier.at
    assert(paintMs < 4000, `the persisted fold took ${paintMs}ms to repaint after the buckets mounted`)
    state.firstPaint = earlier.state
    return `collapsed after ${paintMs}ms, hidden ${last.hiddenCount}/14 sections`
  })

  await results.check('c4-3', 'collapsed Inactive bucket persists too', async () => {
    // Unfold Active, collapse Inactive, reload, verify.
    await clickBucket('active')
    await clickBucket('inactive')
    const before = await readFoldState()
    const folds = JSON.parse(before.folds || '{}')
    assertEqual(folds.active, false, 'Active fold was not cleared')
    assertEqual(folds.inactive, true, 'Inactive fold was not persisted')
    const inactiveHidden = before.displays.filter((entry) => entry.display === 'none').length
    assert(inactiveHidden > 0, 'collapsed Inactive bucket did not hide native sections')
    await reloadFresh(page)
    const deadline = Date.now() + 30000
    let settled = null
    let first = null
    while (Date.now() < deadline) {
      const stateNow = await page.eval(probe.foldState).catch(() => null)
      if (stateNow !== null && stateNow.groupHeadersPresent) {
        if (first === null) first = stateNow
        settled = stateNow
        if (stateNow.hiddenCount > 0 && stateNow.inactiveExpanded === 'false') break
      }
      await sleep(120)
    }
    assert(settled !== null, 'buckets never mounted after the reload')
    assertEqual(settled.inactiveExpanded, 'false', 'collapsed Inactive bucket was expanded after the reload')
    assert(settled.hiddenCount > 0, 'collapsed Inactive bucket hid no sections after the reload')
    assert(first !== null && first.buckets !== null, 'the bucket cache document is missing after the reload')
    state.foldInactive = settled
    return `hidden ${settled.hiddenCount} after reload`
  })

  await results.check('c4-4', 'a stale cached classification never sticks once live data hydrates', async () => {
    // Mark an actually-inactive Workspace as active in the cache, keep the Active
    // bucket collapsed, reload, then require live data to win (the section shows).
    const setup = await page.evaluate(`(() => {
      const raw = localStorage.getItem('power-suite.dynamic-workspaces.buckets')
      const doc = raw ? JSON.parse(raw) : { version: 1, workspaces: {} }
      doc.workspaces = doc.workspaces || {}
      const sectionKeys = [...document.querySelectorAll('[data-row-key^="workspace:"]')].map((el) => el.getAttribute('data-row-key').slice('workspace:'.length))
      if (sectionKeys.length < 2) return { ok: false, reason: 'not enough Workspace sections' }
      const inactiveKey = Object.entries(doc.workspaces).find(([key, bucket]) => bucket === 'inactive' && sectionKeys.includes(key))?.[0]
      if (inactiveKey === undefined) return { ok: false, reason: 'no inactive Workspace in the classification cache' }
      doc.workspaces[inactiveKey] = 'active'
      localStorage.setItem('power-suite.dynamic-workspaces.buckets', JSON.stringify(doc))
      localStorage.setItem('power-suite.dynamic-workspaces.folds', JSON.stringify({ active: true, inactive: false }))
      return { ok: true, workspace: inactiveKey }
    })()`)
    assert(setup.ok, setup.reason || 'could not prepare the stale cache')
    await reloadFresh(page)
    const deadline = Date.now() + 30000
    let settled = null
    let sawStaleCache = false
    let corrected = false
    while (Date.now() < deadline) {
      const stateNow = await page.eval(probe.foldState).catch(() => null)
      if (stateNow !== null && stateNow.groupHeadersPresent) {
        settled = stateNow
        const section = stateNow.displays.find((entry) => entry.key === `workspace:${setup.workspace}`)
        if (section && section.display === 'none') sawStaleCache = true
        if (section && section.display !== 'none' && stateNow.activeExpanded === 'false') {
          corrected = true
          break
        }
      }
      await sleep(60)
    }
    assert(settled !== null, 'the buckets never mounted after the drift-test reload')
    assertEqual(settled.activeExpanded, 'false', 'Active fold did not restore for the drift test')
    assert(sawStaleCache, 'the pre-hydration pass did not use the cached classification (no stale hidden section observed)')
    assert(corrected, `live data must correct the stale cached classification: section ${setup.workspace} stayed hidden`)
    return `stale cache corrected: ${setup.workspace} hidden before hydration, visible after`
  })
}

async function runAnnotationPinChecks({ page, results, state }) {
  log('\n=== F4: annotation mode pins the hover card ===')
  await results.check('f4-1', 'annotation mode pins the hover card and mode exit unpins/clears it', async () => {
    // Simulate the annotation side: attribute + stylesheet rule + state event.
    await page.evaluate(`(() => {
      const style = document.createElement('style')
      style.id = 'psd-e2e-annotation-pin'
      style.textContent = ${JSON.stringify(ANNOTATION_PIN_CSS)}
      document.head.appendChild(style)
      document.documentElement.setAttribute('data-psa-active', 'true')
      document.dispatchEvent(new CustomEvent('power-suite:ui-annotation-state', { detail: { active: true } }))
    })()`)
    await sleep(300)
    const target = await hoverRow(page, 0)
    await sleep(700)
    const card = await page.eval(probe.hoverCard)
    assert(card, 'hover card did not open in annotation mode')
    assertEqual(card.pinned, 'true', 'hover card must expose data-psd-pinned="true" while annotation mode is active')
    assertEqual(card.pointerEvents, 'auto', 'annotation mode must make the hover card pointer-interactive')
    // Move the pointer onto the card and keep it there: the card must stay.
    await page.moveTo(card.rect.left + Math.round(card.rect.width / 2), card.rect.top + 40)
    await sleep(700)
    const pinned = await page.eval(probe.hoverCard)
    assert(pinned, 'hover card closed although the pointer moved onto it in annotation mode')
    assertEqual(pinned.pinned, 'true', 'pinned marker disappeared while annotation mode was active')
    state.pinned = pinned
    // Leaving the card closes it even in annotation mode.
    await page.moveTo(900, 500)
    await sleep(600)
    const gone = await page.eval(probe.hoverCard)
    assertEqual(gone, null, 'hover card did not close after the pointer left the pinned card')
    // Mode exit must clear a showing card too.
    const second = await hoverRow(page, 0)
    await sleep(700)
    const reopened = await page.eval(probe.hoverCard)
    assert(reopened, 'hover card did not reopen for the mode-exit check')
    await page.evaluate(`(() => {
      document.documentElement.removeAttribute('data-psa-active')
      document.dispatchEvent(new CustomEvent('power-suite:ui-annotation-state', { detail: { active: false } }))
    })()`)
    await sleep(500)
    const cleared = await page.eval(probe.hoverCard)
    assertEqual(cleared, null, 'mode exit left the hover card pinned')
    return `pinned at z=${card.zIndex}, toggles correctly; row top ${second.rowTop > 0 ? 'ok' : 'n/a'}`
  })

  await results.check('f4-2', 'normal mode DOM never carries the pin marker', async () => {
    await page.evaluate(`(() => {
      const style = document.getElementById('psd-e2e-annotation-pin')
      if (style) style.remove()
    })()`)
    const target = await hoverRow(page, 0)
    await sleep(700)
    const card = await page.eval(probe.hoverCard)
    assert(card, 'hover card did not open in normal mode')
    assertEqual(card.pinned, null, 'normal-mode hover card must not carry data-psd-pinned')
    assertEqual(card.pointerEvents, 'none', 'normal-mode hover card must not capture the pointer')
    await page.moveTo(900, 500)
    await sleep(600)
    assertEqual(await page.eval(probe.hoverCard), null, 'normal-mode hover card did not dismiss')
    return `unpinned at z=${card.zIndex}, pointer-events ${card.pointerEvents}`
  })
}

// ---------------------------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------------------------

async function captureScreenshots(page, state) {
  await mkdir(SHOTS_DIR, { recursive: true })
  const shots = []
  const shot = async (name) => {
    const file = path.join(SHOTS_DIR, `${name}.png`)
    await page.screenshot(file)
    shots.push(file)
    return file
  }
  await page.emulateMedia([])
  await page.moveTo(900, 500)
  await sleep(300)
  await shot('01-card-light')
  await hoverRow(page, 0)
  await sleep(700)
  await shot('02-card-row-hover')
  await page.moveTo(900, 500)
  await sleep(400)
  const currentRow = await page.eval(() => {
    const row = document.querySelector('.psd-run-current, .psd-child-current')
    return row !== null
  })
  if (currentRow) {
    await page.eval(() => {
      const row = document.querySelector('.psd-run-current')
      if (row) row.scrollIntoView({ block: 'center' })
    })
    await sleep(300)
    await shot('03-current-wave-light')
  }
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
  await sleep(700)
  await shot('04-card-dark')
  if (currentRow) await shot('05-current-wave-dark')
  await page.emulateMedia([])
  await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(500)
  await shot('06-reduced-motion')
  await page.emulateMedia([])
  const searchToggle = await page.findRect('[data-psp-search-toggle]')
  if (searchToggle) {
    await page.clickAt(searchToggle.x, searchToggle.y)
    await sleep(700)
    await shot('07-focus-ring')
    await page.pressEscape()
    await sleep(300)
  }
  const folds = await page.eval(probe.foldState)
  if (folds.groupHeadersPresent) {
    await page.eval(() => {
      const el = document.querySelector('[data-psd="group"]')
      if (el) el.scrollIntoView({ block: 'center' })
    })
    await sleep(400)
    await shot('08-buckets')
  }
  return shots
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function run() {
  const opts = parseArgs(process.argv.slice(2))
  const started = Date.now()
  log('DSH Power Suite — dynamic Workspaces sidebar live E2E')
  log(`node: ${process.version}`)
  log(`client: ${opts.clientPath}`)
  const clientSource = await readFile(opts.clientPath, 'utf8')
  log(`client size: ${(clientSource.length / 1024).toFixed(0)} KiB`)
  const url = await resolveGuiUrl(opts)
  log(`GUI: ${redact(url)}`)

  let chrome = null
  let page = null
  let fatal = null
  let exitCode = 0
  const state = { screenshots: [] }
  const results = new Results()
  try {
    chrome = await launchChrome(opts)
    log(`chrome: headless pid ${chrome.proc.pid}, CDP port ${chrome.port}`)
    const cdp = await CdpConnection.connect(chrome.wsUrl)
    page = await Page.open(cdp, url, injectorSource(clientSource))
    log('page: opened, waiting for the DSH shell…')

    await runSmoke({ page, results, state })
    await ensureAppReady(page)

    if (opts.mode === 'full') {
      log('\n=== Acceptance checks ===')
      await runLayoutChecks({ page, results, state })
      await runCurrentHighlightChecks({ page, results, state })
      await runHoverCardChecks({ page, results, state })
      await runFocusChecks({ page, results, state })
      await runFoldChecks({ page, results, state })
      await runAnnotationPinChecks({ page, results, state })
      if (opts.shots) {
        log('\n=== Screenshots ===')
        const shots = await captureScreenshots(page, state)
        state.screenshots = shots
        for (const file of shots) log(`wrote ${file}`)
      }
    }
  } catch (error) {
    fatal = error
    log(`\nFATAL  ${error?.stack ? short(error.stack, 1800) : String(error)}`)
    exitCode = error?.exitCode === 2 ? 2 : 1
  } finally {
    if (page !== null) page.dispose()
    if (chrome !== null) {
      if (opts.keepOpen) {
        log(`\nChrome left running (pid ${chrome.proc.pid}, CDP ${chrome.wsUrl}, profile ${chrome.profileDir})`)
        log('kill it manually when done')
      } else {
        await chrome.close()
      }
    }
  }

  const passed = results.rows.filter((row) => row.pass).length
  const failed = results.failures.length
  const pageErrors = page !== null ? page.pageErrors : []
  log('\n=== Results ===')
  for (const row of results.rows) {
    log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.id}  ${row.title}${row.pass ? '' : `\n        ↳ ${short(row.detail, 700)}`}`)
  }
  log(`\nPASS ${passed} / FAIL ${failed}`)
  log(`page errors: ${pageErrors.length}`)
  for (const error of pageErrors.slice(0, 8)) log(`  ! ${error}`)
  log(`non-JS console/log errors: ${page !== null ? page.logEntries.length : 0}`)
  for (const entry of (page !== null ? page.logEntries : []).slice(0, 8)) log(`  ! ${entry}`)
  if (state.screenshots.length > 0) log(`screenshots: ${state.screenshots.join(', ')}`)
  log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`)
  if (fatal !== null) log(`fatal: ${short(fatal.message || String(fatal), 600)}`)

  if (failed > 0 || pageErrors.length > 0) exitCode = exitCode || 1
  log(`exit code: ${exitCode}`)
  process.exit(exitCode)
}

run().catch((error) => {
  if (error?.exitCode === 2 && typeof error.message === 'string') {
    console.error(`error: ${error.message}`)
    process.exit(2)
  }
  console.error(redact(error?.stack || String(error)))
  process.exit(1)
})
