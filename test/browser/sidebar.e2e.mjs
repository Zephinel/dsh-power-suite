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
 *   B1  one fixed trailing grid shared by parent rows, child rows and the header —
 *       time 48 px (right-aligned) then the 22 px New session action slot then the
 *       24 px disclosure column; nested child rows reserve the action and disclosure
 *       columns as empty spacers so their time ends on the parent row's time x, and
 *       they render no New session control; clipped titles carry the right-edge
 *       gradient mask.
 *   B2  hover highlight geometry: content-paced body pill, fixed-size control highlights
 *       (22 px New session button, 24 px chevron) on the same columns in every row;
 *       revealing the actions moves no column, and the main-row New session action
 *       still creates and opens a blank Session.
 *   B3  plugin input focus uses the shared rainbow track glow (prompt-history search
 *       field), with no solid-color focus border left behind.
 *   B4  the current Session row gets the rainbow smoke glow painted on the bottom face
 *       of its own rounded rectangle (a flowing rim that follows the rounded bottom
 *       corners plus soft rising rainbow puffs), and the owning native Workspace row
 *       gets the same treatment; nested child rows paint it through their dedicated
 *       host; reduced motion leaves a static tint.
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
 * run and one more through the card's main-row New session action (b2-4; both blank and
 * never typed into); one existing Session row is opened (from the card) to exercise the
 * current-highlight marker; `localStorage` for the throwaway profile is modified
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

  async screenshotBase64(clip) {
    const params = { format: 'png', fromSurface: true }
    if (clip !== undefined) params.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 }
    const result = await this.send('Page.captureScreenshot', params)
    return result.data
  }

  async screenshot(pathname, clip) {
    const data = await this.screenshotBase64(clip)
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
      dataActions: el.getAttribute('data-actions'),
      rect: rect(el),
      title: titleOf(el, '.psd-run-title, .psd-child-title'),
      time: (() => {
        const node = el.querySelector('.psd-run-time, .psd-child-time')
        return node ? { rect: rect(node), text: (node.innerText || '').trim(), style: styleOf(node) } : null
      })(),
      actions: (() => {
        const node = el.querySelector('.psd-run-actions')
        if (!node) return null
        const r = node.getBoundingClientRect()
        return { rect: rect(node), width: Math.round(r.width), empty: node.getAttribute('data-empty') === 'true' }
      })(),
      actionButtons: [...el.querySelectorAll('.psd-row-action')].map((button) => ({
        variant: button.getAttribute('data-variant'),
        label: button.getAttribute('aria-label'),
        rect: rect(button),
        radius: getComputedStyle(button).borderRadius,
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
      headBadge: (() => {
        const node = document.querySelector('.psd-panel-head .psd-count')
        return node ? { rect: rect(node), text: (node.innerText || '').trim() } : null
      })(),
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
    const text = (node) => node ? (node.innerText || '').trim() : ''
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
      session: inner('.psd-hovercard-session'),
      sessionText: text(card.querySelector('.psd-hovercard-session')),
      // Native session-figure sections (B6): header line plus right-aligned rows.
      sections: [...card.querySelectorAll('.psd-hovercard-section')].map((section) => ({
        title: text(section.querySelector('.psd-hovercard-section-title')),
        value: text(section.querySelector('.psd-hovercard-section-value')),
        rows: [...section.querySelectorAll('.psd-hovercard-row')].map((row) => ({
          key: text(row.querySelector('.psd-hovercard-key')),
          value: text(row.querySelector('.psd-hovercard-row-value')),
        })),
      })),
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      scrollHeight: card.scrollHeight,
      clientHeight: card.clientHeight,
      offsetHeight: card.offsetHeight,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      text: (card.innerText || '').trim().slice(0, 700),
    }
  },

  /**
   * Reach the injected seat's `ctx.sessions` through the React fiber tree and
   * instrument its one-shot `refreshProjections`, so the B6 checks can count
   * projection reads and pick a Session whose figures have not been fetched yet.
   */
  projectionBridge: () => {
    const panel = document.querySelector('.psd-panel')
    if (!panel) return { ok: false, reason: 'no .psd-panel' }
    const fiberKey = Object.keys(panel).find((key) => key.startsWith('__reactFiber$'))
    if (fiberKey === undefined) return { ok: false, reason: 'no react fiber on .psd-panel' }
    let fiber = panel[fiberKey]
    let sessions = null
    let panelProps = null
    for (let i = 0; i < 80 && fiber !== null && fiber !== undefined; i += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps
      if (props === null || typeof props !== 'object') continue
      if (sessions === null && props.parentSessions !== null && typeof props.parentSessions === 'object'
        && typeof props.parentSessions.refreshProjections === 'function') {
        sessions = props.parentSessions
      }
      if (panelProps === null && props.childrenByParent instanceof Map && Array.isArray(props.rows)) {
        panelProps = { rows: props.rows, childrenByParent: props.childrenByParent, projections: props.projections }
      }
    }
    if (sessions === null) return { ok: false, reason: 'ctx.sessions not found on the fiber chain' }
    window.__psdE2ESessions = sessions
    if (sessions.__psdE2ERefreshCounts === undefined) {
      const counts = {}
      const original = sessions.refreshProjections.bind(sessions)
      sessions.refreshProjections = (sessionId) => {
        counts[sessionId] = (counts[sessionId] ?? 0) + 1
        return original(sessionId)
      }
      sessions.__psdE2ERefreshCounts = counts
    }
    const snapshot = sessions.list !== null && sessions.list !== undefined && typeof sessions.list.getSnapshot === 'function'
      ? sessions.list.getSnapshot()
      : null
    const recordOf = (sessionId) => {
      const value = snapshot !== null ? snapshot.projectionsBySession?.[sessionId] : undefined
      if (value === undefined) return { state: null, keys: [], hasStats: false, hasBreakdown: false }
      return {
        state: value.state ?? null,
        keys: Object.keys(value.values ?? {}),
        hasStats: value.values?.sessionStats !== undefined,
        hasBreakdown: value.values?.contextBreakdown !== undefined,
      }
    }
    const needsRead = (sessionId) => {
      const record = recordOf(sessionId)
      if (record.keys.length === 0) return true
      if (record.hasStats && record.hasBreakdown) return false
      return record.state === null || record.state === 'idle'
    }
    const rows = panelProps === null ? [] : panelProps.rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: 'parent',
      state: row.state,
      subagents: row.subagents,
      record: recordOf(row.id),
      needsRead: needsRead(row.id),
    }))
    const children = []
    if (panelProps !== null) {
      for (const [parentId, kids] of panelProps.childrenByParent.entries()) {
        for (const child of kids) {
          children.push({
            id: child.id,
            title: child.title,
            kind: 'child',
            parentId,
            state: child.state,
            record: recordOf(child.id),
            needsRead: needsRead(child.id),
          })
        }
      }
    }
    return {
      ok: true,
      counts: { ...sessions.__psdE2ERefreshCounts },
      rows,
      children,
      listTotal: snapshot !== null ? snapshot.ids.length : null,
      domRows: [...document.querySelectorAll('.psd-run, .psd-child')].map((el) => ({
        kind: el.classList.contains('psd-run') ? 'parent' : 'child',
        title: (el.querySelector('.psd-run-title, .psd-child-title')?.innerText ?? '').trim(),
      })),
    }
  },

  /**
   * Hold one Session's one-shot projection read pending, simulating a Host that
   * never answers (unknown id / absent projection units), while leaving every
   * other Session readable. Used to prove the card renders without data.
   */
  stallProjectionRefresh: (sessionId) => {
    const sessions = window.__psdE2ESessions
    if (sessions === undefined || sessions === null) return { ok: false, reason: 'projectionBridge was not called yet' }
    if (sessions.__psdE2EStalled === undefined) {
      const wrapped = sessions.refreshProjections
      sessions.__psdE2EStalled = new Set()
      sessions.refreshProjections = (sessionIdToRead) => {
        if (sessions.__psdE2EStalled.has(sessionIdToRead)) return new Promise(() => {})
        return wrapped(sessionIdToRead)
      }
    }
    sessions.__psdE2EStalled.add(sessionId)
    return { ok: true, stalled: [...sessions.__psdE2EStalled] }
  },

  /**
   * Remove one Session's projection store and rebuild the list snapshot, so the
   * hover card sees a Session with no projection values (the Host-without-units
   * / unknown-Session shape) and must hide the whole figure block.
   */
  dropProjectionValues: (sessionId) => {
    const sessions = window.__psdE2ESessions
    if (sessions === undefined || sessions === null) return { ok: false, reason: 'projectionBridge was not called yet' }
    const manager = sessions.manager
    if (manager === undefined || manager === null || !(manager.projectionStores instanceof Map)) {
      return { ok: false, reason: 'manager projection stores not reachable' }
    }
    const existed = manager.projectionStores.delete(sessionId)
    manager.notifier.markDirty()
    return { ok: true, existed }
  },

  /** Identity glyphs of the panel header and the card rows (B6 icon swap). */
  identityGlyphs: () => {
    const pathPrefix = (root, selector) => {
      const lookup = selector === null || selector === undefined || selector === '' ? 'path' : `${selector} path`
      const node = root ? root.querySelector(lookup) : null
      return node ? (node.getAttribute('d') ?? '').slice(0, 40) : null
    }
    const header = document.querySelector('.psd-panel-toggle')
    const headerSpark = header ? header.querySelector('.psd-spark') : null
    const headerSvg = headerSpark ? headerSpark.querySelector('svg') : null
    const parents = [...document.querySelectorAll('.psd-run')].map((row) => ({
      state: row.dataset.state ?? null,
      brand: pathPrefix(row, '.psd-run-brand'),
      statusDot: row.querySelector('.psd-run-glyph') !== null,
    }))
    return {
      headerPulsing: header !== null && header.querySelector('.psd-pulse') !== null,
      headerPath: pathPrefix(header, '.psd-spark'),
      headerGlyphSize: headerSvg === null
        ? null
        : { width: headerSvg.getAttribute('width'), height: headerSvg.getAttribute('height') },
      brandRows: parents.filter((row) => row.brand !== null),
      parentRows: parents.length,
      childBrands: [...document.querySelectorAll('.psd-child-brand')].map((el) => pathPrefix(el, null)),
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
      slotRect: rect(actions),
      actionRects: actionButtons.map((button) => rect(button)),
      actionVariants: actionButtons.map((button) => button.getAttribute('data-variant')),
      actionRadii: actionButtons.map((button) => getComputedStyle(button).borderRadius),
      toggleRect: rect(toggle),
    }
  },

  /** Current-Session highlight facts on the card row and the native Workspace row. */
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
        content: s.content,
        position: s.position,
        backgroundImage: s.backgroundImage,
        backgroundSize: s.backgroundSize,
        backgroundPosition: s.backgroundPosition,
        animationName: s.animationName,
        animationDuration: s.animationDuration,
        opacity: s.opacity,
        filter: s.filter,
        maskImage: s.maskImage || s.webkitMaskImage || 'none',
        borderRadius: s.borderRadius,
        top: s.top,
        right: s.right,
        bottom: s.bottom,
        left: s.left,
        width: s.width,
        height: s.height,
        zIndex: s.zIndex,
      }
    }
    const host = (el) => {
      if (!el) return null
      return { tag: el.tagName.toLowerCase(), className: String(el.className), radius: getComputedStyle(el).borderRadius, rect: rect(el), clientWidth: el.clientWidth, clientHeight: el.clientHeight }
    }
    const row = document.querySelector('.psd-run-current, .psd-child-current')
    const childWave = row && row.classList.contains('psd-child-current') ? row.querySelector('.psd-child-wave') : null
    // All three hosts paint through their own pseudo-elements: parent card rows on
    // the row itself, nested child rows on the injected .psd-child-wave layer (the
    // row's own ::before/::after are the tree connectors), native rows on the row.
    const waveHost = row ? (row.classList.contains('psd-run-current') ? row : childWave) : null
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
      row: row ? { kind: row.classList.contains('psd-run-current') ? 'parent' : 'child', className: row.className, rect: rect(row), radius: getComputedStyle(row).borderRadius, current: row.getAttribute('aria-current') } : null,
      waveHost: host(waveHost),
      wave: waveHost ? { before: pseudo(waveHost, '::before'), after: pseudo(waveHost, '::after') } : null,
      legacyWave: row && row.classList.contains('psd-run-current') ? pseudo(row, '::before') : null,
      childWave: document.querySelector('.psd-child-wave') !== null,
      ringPresent,
      oldRing,
      marker: marker
        ? {
            rowKey: marker.getAttribute('data-row-key'),
            rect: rect(marker),
            radius: getComputedStyle(marker).borderRadius,
            clientWidth: marker.clientWidth,
            clientHeight: marker.clientHeight,
            before: pseudo(marker, '::before'),
            after: pseudo(marker, '::after'),
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

/**
 * Hover one specific card row identified by its exact title (parent or nested
 * subagent row), scrolling it into view first when the card body has scrolled.
 * @param {object} page - Page wrapper.
 * @param {'parent' | 'child'} kind - row kind to search.
 * @param {string} title - exact row title text.
 * @returns {Promise<object>} measured hover target.
 */
async function hoverCardRowByTitle(page, kind, title) {
  const locate = () => page.eval((rowKind, rowTitle) => {
    const selector = rowKind === 'child' ? '.psd-child' : '.psd-run'
    const titleSelector = rowKind === 'child' ? '.psd-child-title' : '.psd-run-title'
    const row = [...document.querySelectorAll(selector)].find((el) => ((el.querySelector(titleSelector)?.innerText ?? '').trim()) === rowTitle)
    if (!row) return null
    const rect = row.getBoundingClientRect()
    const offscreen = rect.top < 8 || rect.bottom > window.innerHeight - 8
    if (offscreen) row.scrollIntoView({ block: 'center' })
    return { found: true, offscreen }
  }, kind, title)
  const found = await locate()
  assert(found, `card ${kind} row "${short(title, 60)}" not found in the DOM`)
  if (found.offscreen) await sleep(250)
  const target = await page.eval((rowKind, rowTitle) => {
    const selector = rowKind === 'child' ? '.psd-child' : '.psd-run'
    const titleSelector = rowKind === 'child' ? '.psd-child-title' : '.psd-run-title'
    const row = [...document.querySelectorAll(selector)].find((el) => ((el.querySelector(titleSelector)?.innerText ?? '').trim()) === rowTitle)
    if (!row) return null
    const r = row.getBoundingClientRect()
    const tr = row.querySelector(titleSelector)?.getBoundingClientRect() ?? r
    return {
      rowTop: Math.round(r.top),
      x: Math.round(tr.left + Math.min(40, Math.max(8, tr.width / 2))),
      y: Math.round(r.top + r.height / 2),
    }
  }, kind, title)
  assert(target, `card ${kind} row "${short(title, 60)}" disappeared while scrolling`)
  assert(target.y > 8 && target.y < VIEWPORT.height - 8, `card row "${short(title, 40)}" is outside the viewport (y=${target.y})`)
  await page.moveTo(900, 500)
  await sleep(180)
  await page.moveTo(target.x, target.y)
  return target
}

/**
 * Open the hover card for one card row and capture it as soon as it appears.
 * The sidebar list is live: rows can re-sort under a stationary pointer, which
 * dismisses the card. Retrying and capturing on first appearance keeps the
 * figure checks deterministic without freezing the host data.
 * @param {object} page - Page wrapper.
 * @param {'parent' | 'child'} kind - row kind.
 * @param {string} title - exact row title.
 * @param {object} [options] - retry/timeout options.
 * @returns {Promise<{ card: object, target: object } | null>} the card, or null.
 */
async function openHoverCard(page, kind, title, { attempts = 5, timeoutMs = 2200 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.moveTo(900, 500)
    await sleep(120)
    let target = null
    try {
      target = await hoverCardRowByTitle(page, kind, title)
    } catch {
      await sleep(250)
      continue
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await sleep(80)
      const card = await page.eval(probe.hoverCard)
      if (card !== null) return { card, target }
    }
  }
  return null
}

/**
 * `hoverRow` with retries: the live card can re-sort between the coordinate
 * measurement and the pointer move, so a single dispatch can land on nothing.
 * @param {object} page - Page wrapper.
 * @param {number} rowIndex - index into the rendered card rows.
 * @returns {Promise<object>} the measured hover target.
 */
async function hoverRowStable(page, rowIndex) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const target = await hoverRow(page, rowIndex)
      await sleep(350)
      const present = await page.eval(() => document.querySelector('[data-psd-hovercard]') !== null)
      if (present) return target
    } catch {
      // retry
    }
    await page.moveTo(900, 500)
    await sleep(200)
  }
  throw new Error(`card row ${rowIndex} could not be hovered (live list kept re-sorting)`)
}

/**
 * Make at least one finished parent row read (its identity glyph is visible)
 * by opening it from the card when no acknowledged row exists yet.
 * @param {object} page - Page wrapper.
 * @returns {Promise<number>} number of acknowledged parent rows afterwards.
 */
async function arrangeReadDoneRow(page) {
  const count = () => page.eval(() => document.querySelectorAll('.psd-run-brand').length)
  if (await count() > 0) return count()
  const target = await page.eval(() => {
    const row = [...document.querySelectorAll('.psd-run')].find((el) => el.dataset.state === 'done' && el.querySelector('.psd-run-main') !== null)
    if (!row) return null
    const main = row.querySelector('.psd-run-main')
    const rect = main.getBoundingClientRect()
    return { x: Math.round(rect.left + 20), y: Math.round(rect.top + rect.height / 2), title: row.querySelector('.psd-run-title')?.innerText ?? '' }
  })
  if (target === null) return 0
  await page.clickAt(target.x, target.y)
  await sleep(1400)
  return count()
}

// ---------------------------------------------------------------------------------------------
// B6 helpers: parse the native figure strings rendered by the hover card
// ---------------------------------------------------------------------------------------------

/** Group a number with the native thousands separator for log details. */
function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Parse a native exact count (`5,203,456 tok`) into its integer value. */
function parseTokenCount(label, text) {
  const match = /^([\d,]+) tok$/.exec(text ?? '')
  assert(match, `${label} is not a native exact count: ${JSON.stringify(text)}`)
  return Number(match[1].replace(/,/g, ''))
}

/** Parse a native percentage (`96%` / `99.9999%`) into a number. */
function parsePercent(label, text) {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(text ?? '')
  assert(match, `${label} is not a native percentage: ${JSON.stringify(text)}`)
  return Number(match[1])
}

/**
 * One section of the hover card as a key→value map; asserts the section exists
 * and that the native label shape holds.
 * @param {Array<object>} sections - measured sections.
 * @param {string} title - expected section title (exact label or prefix match).
 * @param {Function} [titleMatch] - optional title predicate instead of equality.
 * @returns {object} `{ section, rows }` with `rows` a Map.
 */
function sectionRows(sections, title, titleMatch) {
  const section = titleMatch === undefined
    ? sections.find((candidate) => candidate.title === title)
    : sections.find((candidate) => titleMatch.test(candidate.title))
  assert(section, `missing hover-card section "${title}" (got ${JSON.stringify(sections.map((s) => s.title))})`)
  return { section, rows: new Map(section.rows.map((row) => [row.key, row.value])) }
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

  await results.check('b1-2', 'rows share one trailing grid: time → New session slot → disclosure (parent + child)', async () => {
    const geometry = await page.eval(probe.panelGeometry)
    const rows = geometry.rows
    assert(rows.length >= 2, `need at least two rows to compare columns, got ${rows.length}`)
    state.geometry = geometry
    const parents = rows.filter((row) => row.kind === 'parent')
    const children = rows.filter((row) => row.kind === 'child')
    assert(parents.length >= 1 && children.length >= 1, `need both a parent and a nested child row, got ${parents.length} parent / ${children.length} child`)
    for (const row of rows) {
      const label = `${row.kind} row "${short(row.title?.text, 28)}"`
      assert(row.time, `${label} has no time column`)
      assert(row.actions, `${label} has no fixed action slot`)
      assert(row.toggle, `${label} has no disclosure column/spacer`)
    }
    const spread = (values) => Math.max(...values) - Math.min(...values)
    const timeRights = rows.map((row) => row.time.rect.right)
    const timeWidths = rows.map((row) => row.time.rect.width)
    const actionLefts = rows.map((row) => row.actions.rect.left)
    const actionRights = rows.map((row) => row.actions.rect.right)
    const actionWidths = rows.map((row) => row.actions.rect.width)
    const toggleLefts = rows.map((row) => row.toggle.left)
    const toggleRights = rows.map((row) => row.toggle.right)
    assertNear(spread(timeRights), 0, 1, `time right edges must align across every row (${JSON.stringify(timeRights)})`)
    assertNear(spread(timeWidths), 0, 0.5, `time column width must be fixed (${JSON.stringify(timeWidths)})`)
    assertNear(timeWidths[0], 48, 0.5, `time column must be 48 px wide, got ${timeWidths[0]}`)
    assertNear(spread(actionLefts), 0, 1, `action-slot left edges must align across every row (${JSON.stringify(actionLefts)})`)
    assertNear(spread(actionRights), 0, 1, `action-slot right edges must align across every row (${JSON.stringify(actionRights)})`)
    assertNear(spread(actionWidths), 0, 0.5, `action slot width must be fixed (${JSON.stringify(actionWidths)})`)
    assertNear(actionWidths[0], 22, 0.5, `action slot must be 22 px wide, got ${actionWidths[0]}`)
    assertNear(spread(toggleLefts), 0, 1, `disclosure column left edges must align across every row (${JSON.stringify(toggleLefts)})`)
    assertNear(spread(toggleRights), 0, 1, `disclosure column right edges must align across every row (${JSON.stringify(toggleRights)})`)
    // Column order left to right: time, then the New session slot, then disclosure.
    for (const row of rows) {
      assert(row.time.rect.right < row.actions.rect.left, `time must sit left of the action slot on a ${row.kind} row`)
      assert(row.actions.rect.right < row.toggle.left, `action slot must sit left of the disclosure column on a ${row.kind} row`)
    }
    // The user-reported bug: parent and child times must end on one x.
    const parentTimeRight = parents[0].time.rect.right
    for (const childRow of children) {
      assertNear(childRow.time.rect.right, parentTimeRight, 1, `child time right edge (${childRow.time.rect.right}) must equal parent time right edge (${parentTimeRight})`)
    }
    // New session is a main-row action only.
    for (const parentRow of parents) {
      const variants = parentRow.actionButtons.map((button) => button.variant)
      assertEqual(variants.filter((variant) => variant === 'new-session').length, 1, `main row must render exactly one New session action, got ${JSON.stringify(variants)}`)
      const button = parentRow.actionButtons.find((entry) => entry.variant === 'new-session')
      assertNear(button.rect.width, 22, 0.5, 'New session button width')
      assertNear(button.rect.right, parentRow.actions.rect.right, 1, 'New session button must be right-anchored inside its fixed slot')
    }
    for (const childRow of children) {
      const variants = childRow.actionButtons.map((button) => button.variant)
      assertEqual(variants.filter((variant) => variant === 'new-session').length, 0, `child row must not render the New session action, got ${JSON.stringify(variants)}`)
      assert(variants.every((variant) => variant === 'continue'), `child action slot may only hold Continue when interrupted, got ${JSON.stringify(variants)}`)
      assertEqual(childRow.actions.empty, variants.length === 0, 'child action slot must be an empty fixed spacer unless it holds Continue')
    }
    // The header shares the same grid: time spacer, count badge on the action
    // column, chevron on the disclosure column.
    const headTime = geometry.head.find((part) => part.className.includes('psd-panel-head-time-spacer'))
    const headActions = geometry.head.find((part) => part.className.includes('psd-panel-head-actions'))
    const headChevron = geometry.head.find((part) => part.className.includes('psd-panel-chevron'))
    assert(headTime && headActions && headChevron, 'header is missing its time/action/chevron column parts')
    assertNear(headTime.rect.right, timeRights[0], 1, `header time column right edge (${headTime.rect.right}) must line up with the row time column (${timeRights[0]})`)
    assertNear(headActions.rect.right, actionRights[0], 1, `header action column right edge (${headActions.rect.right}) must line up with the row action column (${actionRights[0]})`)
    assertNear(headChevron.rect.right, toggleRights[0], 1, `header chevron right edge (${headChevron.rect.right}) must line up with the row disclosure column (${toggleRights[0]})`)
    assertNear(headChevron.rect.width, 24, 0.5, 'header chevron column width')
    assert(geometry.headBadge, 'header count badge missing')
    assertNear(geometry.headBadge.rect.right, headActions.rect.right, 1, 'count badge must be right-anchored on the header action column')
    const parentTimes = parents.map((row) => `${row.time.text}@${row.time.rect.right}`)
    const childTimes = children.map((row) => `${row.time.text}@${row.time.rect.right}`)
    return `time right ${parentTimeRight} (${timeWidths[0]} px), New session slot right ${actionRights[0]} (${actionWidths[0]} px), disclosure right ${toggleRights[0]}; parent times ${parentTimes.join(', ')}; child times ${childTimes.join(', ')}; header ${headTime.rect.right}/${headActions.rect.right}/${headChevron.rect.right}`
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
    // A clipped title stops on the content-column boundary, immediately left of
    // its row's time column, in parent and child rows alike.
    for (const row of geometry.rows) {
      if (!row.title || !row.title.clipped || !row.time) continue
      assertNear(row.title.rect.right, row.time.rect.left - 2, 1, `clipped ${row.kind} title must end at the content column (title ${row.title.rect.right}, time left ${row.time.rect.left})`)
    }
    const sample = clipped[0]
    assert(sample.scrollWidth > sample.clientWidth, 'clipped flag disagrees with the measured overflow')
    return `${clipped.length} masked / ${unclipped.length} unmasked titles; fade ${sample.mask}`
  })

  await results.check('b1-4', 'header controls are content-paced with fixed 24px disclosure column', async () => {
    const geometry = await page.eval(probe.panelGeometry)
    const toggle = geometry.head.find((part) => part.className.includes('psd-panel-toggle'))
    const spacer = geometry.head.find((part) => part.className.includes('psd-panel-head-spacer'))
    const chevron = geometry.head.find((part) => part.className.includes('psd-panel-chevron'))
    assert(toggle && spacer && chevron, `header is missing the toggle/spacer/chevron parts (head: ${JSON.stringify(geometry.head.map((part) => part.className))}; panel: ${JSON.stringify(geometry.panel)})`)
    assert(toggle.rect.height === 30 && chevron.rect.height === 30, 'header control heights must stay 30px')
    assertNear(chevron.rect.width, 24, 0.5, 'header chevron column must be 24px wide')
    assert(toggle.rect.right < spacer.rect.left + spacer.rect.width + 1, 'header toggle must be content-sized, the spacer takes the slack')
    return `toggle ${toggle.rect.width}px + spacer ${spacer.rect.width}px + chevron ${chevron.rect.width}px`
  })

  await results.check('b2-1', 'hover reveals a fixed-size New session highlight and a content-paced body pill', async () => {
    await page.eval(() => window.scrollTo(0, 0))
    const target = await hoverRow(page, 0)
    await sleep(400)
    const hovered = await page.eval(probe.hoverHighlight)
    assert(hovered.hovered, 'no card row registered :hover after moving the pointer')
    assert(hovered.kind === 'parent', `expected to hover a parent row, got ${hovered.kind}`)
    assert(hovered.actionsOpacity === '1', `action slot must reveal on hover (opacity ${hovered.actionsOpacity})`)
    assertEqual(hovered.actionVariants.length, 1, `a main row must reveal exactly one action, got ${JSON.stringify(hovered.actionVariants)}`)
    assertEqual(hovered.actionVariants[0], 'new-session', 'the revealed main-row action must be New session')
    const action = hovered.actionRects[0]
    assertEqual(action.width, 22, 'New session highlight width')
    assertEqual(action.height, 22, 'New session highlight height')
    for (const radius of hovered.actionRadii) assert(radius !== '0px', 'action buttons must keep their rounded highlight block')
    assertNear(action.right, hovered.slotRect.right, 1, 'New session button must be right-anchored in the fixed action slot')
    const body = hovered.mainRect
    assert(body, 'hovered body pill rect missing')
    assert(body.width < state.geometry.panel.width, 'body pill must be content-sized, not the full card width')
    assert(hovered.mainBackground !== 'rgba(0, 0, 0, 0)', 'hovered body pill has no background')
    state.hover = hovered
    return `pill ${body.width}x${body.height}, New session ${action.width}x${action.height} at right ${action.right} of slot ${hovered.slotRect.right}, top ${target.rowTop}`
  })

  await results.check('b2-2', 'nested child rows reveal no New session control; header highlight geometry unchanged', async () => {
    const rows = state.geometry.rows
    const parentIndex = rows.findIndex((row) => row.kind === 'parent')
    const childIndex = rows.findIndex((row) => row.kind === 'child')
    assert(parentIndex >= 0 && childIndex >= 0, 'need both a parent and a nested child row')
    await hoverRow(page, parentIndex)
    await sleep(300)
    const parentHover = await page.eval(probe.hoverHighlight)
    assert(parentHover.hovered && parentHover.kind === 'parent', 'parent row did not register hover')
    assert(parentHover.actionRects.length > 0, 'parent row must expose the New session action')
    const parentAction = parentHover.actionRects[parentHover.actionRects.length - 1]
    assertEqual(parentHover.actionVariants[parentHover.actionVariants.length - 1], 'new-session', 'parent row action must be New session')
    await hoverRow(page, childIndex)
    await sleep(300)
    const childHover = await page.eval(probe.hoverHighlight)
    assert(childHover.hovered && childHover.kind === 'child', 'child row did not register hover')
    assertEqual(childHover.actionRects.length, 0, `child row must reveal no action buttons, got ${JSON.stringify(childHover.actionVariants)}`)
    assertEqual(childHover.actionsOpacity, '1', `child action slot must still reveal as an empty spacer (opacity ${childHover.actionsOpacity})`)
    const headerToggle = state.geometry.head.find((part) => part.className.includes('psd-panel-toggle'))
    assert(headerToggle && headerToggle.rect.height === 30, 'header toggle control lost its 30px height')
    await page.moveTo(900, 500)
    await sleep(300)
    return `parent New session ${parentAction.width}x${parentAction.height} at x=${parentAction.left}; child action buttons 0 in its reserved 22px slot; header toggle ${headerToggle.rect.width}x30`
  })

  await results.check('b2-3', 'hover-revealing the row actions moves no fixed column', async () => {
    await page.moveTo(900, 500)
    await sleep(250)
    const before = await page.eval(probe.panelGeometry)
    const parentIndex = state.geometry.rows.findIndex((row) => row.kind === 'parent')
    await hoverRow(page, parentIndex)
    await sleep(400)
    const during = await page.eval(probe.panelGeometry)
    const hovered = await page.eval(probe.hoverHighlight)
    assert(hovered.hovered && hovered.kind === 'parent', 'parent row did not stay hovered')
    assertEqual(hovered.actionsOpacity, '1', 'parent actions did not reveal on hover')
    assertEqual(before.rows.length, during.rows.length, 'row count changed while hovering')
    const columns = (row) => ({
      time: row.time ? [row.time.rect.left, row.time.rect.right] : null,
      actions: row.actions ? [row.actions.rect.left, row.actions.rect.right] : null,
      toggle: row.toggle ? [row.toggle.left, row.toggle.right] : null,
      title: row.title ? [row.title.rect.left, row.title.rect.right] : null,
    })
    for (let index = 0; index < before.rows.length; index += 1) {
      const was = columns(before.rows[index])
      const now = columns(during.rows[index])
      for (const key of ['time', 'actions', 'toggle', 'title']) {
        if (was[key] === null || now[key] === null) continue
        assertNear(now[key][0], was[key][0], 0.5, `row ${index} ${key} left edge moved on hover (${was[key][0]} -> ${now[key][0]})`)
        assertNear(now[key][1], was[key][1], 0.5, `row ${index} ${key} right edge moved on hover (${was[key][1]} -> ${now[key][1]})`)
      }
    }
    await page.moveTo(900, 500)
    await sleep(300)
    return `columns identical before/while hovered: time ${before.rows[0].time.rect.right}, action ${before.rows[0].actions.rect.right}, disclosure ${before.rows[0].toggle.right}`
  })

  await results.check('b2-5', 'the interrupted main-row Continue overlay lands left of the time column without covering it', async () => {
    const measured = await page.eval(() => {
      const row = document.querySelector('.psd-run')
      if (!row) return null
      const time = row.querySelector('.psd-run-time')
      const main = row.querySelector('.psd-run-main')
      if (!time || !main) return null
      const before = time.getBoundingClientRect()
      // The real overlay button only renders for an interrupted Session; probe the
      // shipped CSS contract with a detached stand-in, then remove it.
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'psd-row-action psd-row-continue'
      button.setAttribute('data-variant', 'continue')
      row.appendChild(button)
      const rowRect = row.getBoundingClientRect()
      const probeRect = button.getBoundingClientRect()
      const timeRect = time.getBoundingClientRect()
      const mainRect = main.getBoundingClientRect()
      button.remove()
      const after = time.getBoundingClientRect()
      return {
        rowRight: Math.round(rowRect.right),
        probeRight: Math.round(probeRect.right),
        probeLeft: Math.round(probeRect.left),
        probeWidth: Math.round(probeRect.width),
        probeHeight: Math.round(probeRect.height),
        timeLeft: Math.round(timeRect.left),
        mainRight: Math.round(mainRect.right),
        timeShift: Math.round(after.left - before.left),
      }
    })
    assert(measured, 'no parent card row to probe the Continue overlay against')
    assertEqual(measured.probeWidth, 22, 'Continue overlay width')
    assertEqual(measured.probeHeight, 22, 'Continue overlay height')
    assertNear(measured.probeRight, measured.timeLeft - 2, 1, `Continue overlay right edge (${measured.probeRight}) must stop before the time column (${measured.timeLeft})`)
    assertNear(measured.probeRight, measured.mainRight, 1, `Continue overlay must sit on the faded title-tail end (overlay ${measured.probeRight}, title tail ${measured.mainRight})`)
    assertEqual(measured.timeShift, 0, 'Continue overlay must not move the time column')
    return `Continue overlay 22x22 at right ${measured.probeRight} vs time column left ${measured.timeLeft} (row right ${measured.rowRight}); no time shift`
  })

  await results.check('b2-4', 'the main-row New session action still creates and opens a blank Session', async () => {
    await page.moveTo(900, 500)
    await sleep(200)
    const previousSession = await page.eval(() => document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null)
    const parentIndex = state.geometry.rows.findIndex((row) => row.kind === 'parent')
    await hoverRow(page, parentIndex)
    await sleep(350)
    const targeted = await page.eval(() => {
      const row = document.querySelector('.psd-run')
      const button = row ? row.querySelector('.psd-row-action[data-variant="new-session"]') : null
      if (!button) return null
      const r = button.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: Math.round(r.width), height: Math.round(r.height) }
    })
    assert(targeted, 'parent row New session button not found while hovered')
    assertEqual(targeted.width, 22, 'New session button hit area width')
    await page.clickAt(targeted.x, targeted.y)
    await page.waitForFn((previous) => {
      const node = document.querySelector('[data-conversation-session]')
      return !!node && node.getAttribute('data-conversation-session') !== previous && !!document.querySelector('[data-lexical-editor="true"]')
    }, [previousSession], { timeout: 25000, label: 'row New session action opened a Session' })
    await sleep(600)
    const opened = await page.eval(() => {
      const session = document.querySelector('[data-conversation-session]')
      const editor = document.querySelector('[data-lexical-editor="true"]')
      return {
        id: session ? session.getAttribute('data-conversation-session') : null,
        messages: document.querySelectorAll('[data-conversation-message]').length,
        draftLength: editor ? (editor.innerText || '').trim().length : 0,
      }
    })
    assert(opened.id !== null && opened.id !== previousSession, 'New session action did not open a new Session')
    assertEqual(opened.messages, 0, `New session action opened a Session with ${opened.messages} transcript messages (not blank)`)
    assertEqual(opened.draftLength, 0, 'New session action opened a Session with a non-empty draft')
    return `created and opened blank Session ${opened.id} from the card row (previous ${previousSession ?? 'none'}); same-directory row open behaviour untouched`
  })
}

/**
 * Assert one current-Session glow host paints the rainbow on the bottom face of
 * its own rounded rectangle through two stacked pseudo-element layers: a bottom
 * rim of rainbow light that follows the rounded bottom corners and a smoke wash
 * of drifting rainbow puffs rising from it. The old detached band/ring geometry
 * must be gone.
 * @param {string} label - host description for failure messages.
 * @param {{ radius: string, rect: object }} host - the row-shaped host box.
 * @param {{ before: object | null, after: object | null }} layers - pseudo facts.
 * @returns {string} measured summary.
 */
function assertBottomFaceGlow(label, host, layers) {
  const { before, after } = layers
  assert(before && after, `${label}: the two glow layers are missing`)
  // ::before is the smoke layer; ::after is the bottom rim painted on top of it.
  const checks = [['smoke', before], ['rim', after]]
  for (const [layerName, layer] of checks) {
    assert(layer.content !== 'none', `${label}: the ${layerName} layer does not render`)
    assertEqual(layer.position, 'absolute', `${label}: the ${layerName} layer must be positioned`)
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assertNear(parseFloat(layer[side]), 0, 0.5, `${label}: the ${layerName} layer must cover the whole row box (${side}=${layer[side]}, not the old inset band)`)
    }
    assertEqual(layer.borderRadius, host.radius, `${label}: the ${layerName} layer must inherit the row's rounded-rectangle radius`)
    // inset:0 resolves against the row's padding box: the native row paints its
    // own surface there too (it carries 3 px transparent inline borders), so the
    // glow canvas is the client box, not the border box.
    assertNear(parseFloat(layer.width), host.clientWidth, 1, `${label}: the ${layerName} width must follow the row's paint box (${layer.width} vs ${host.clientWidth})`)
    assertNear(parseFloat(layer.height), host.clientHeight, 1, `${label}: the ${layerName} height must follow the row's paint box (${layer.height} vs ${host.clientHeight})`)
    assert(layer.backgroundImage.includes('linear-gradient'), `${label}: the ${layerName} layer must paint the rainbow gradient`)
    assert(layer.backgroundImage.includes('rgb(255, 107, 107)'), `${label}: the ${layerName} layer must use the rainbow stops`)
    assert(layer.maskImage.includes('gradient'), `${label}: the ${layerName} layer needs its bottom-face mask`)
    assert(layer.filter.includes('blur'), `${label}: the ${layerName} layer must stay soft`)
    assert(layer.animationName.includes('psd-'), `${label}: the ${layerName} layer has no animation (${layer.animationName})`)
    assert(!layer.animationName.includes('psd-wave'), `${label}: the old psd-wave recipe is still running`)
    assert(Number(layer.opacity) > 0 && Number(layer.opacity) <= 1, `${label}: the ${layerName} layer opacity is out of range (${layer.opacity})`)
    assertEqual(layer.zIndex, '0', `${label}: the ${layerName} layer must sit behind the row content`)
  }
  assert(after.maskImage.includes('linear-gradient'), `${label}: the rim layer must be a bottom-strip mask`)
  assert(before.maskImage.includes('linear-gradient'), `${label}: the smoke layer must include the vertical feather falloff`)
  assert((before.maskImage.match(/radial-gradient/g) ?? []).length >= 3, `${label}: the smoke layer must use several soft radial puffs (${before.maskImage})`)
  assert(before.animationName.includes('psd-smoke'), `${label}: the smoke layer must run the psd-smoke animations (${before.animationName})`)
  assert(after.animationName.includes('psd-glow'), `${label}: the rim layer must run the psd-glow animations (${after.animationName})`)
  return `${label}: smoke+rim ${before.width}x${before.height} r=${before.borderRadius} inset 0; animations ${before.animationName} | ${after.animationName}`
}

async function runCurrentHighlightChecks({ page, results, state }) {
  log('\n=== B4: current-Session rainbow glow on the rounded row bottom face ===')
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

  await results.check('b4-1', 'card row and owning native Workspace row paint the rounded bottom-face glow (old band/ring gone)', async () => {
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
    assert(highlight.waveHost && highlight.wave, 'current card row has no glow host')
    for (const side of ['left', 'right', 'top', 'bottom']) {
      assertNear(highlight.waveHost.rect[side], highlight.row.rect[side], 1, `card glow host must follow the row box (${side}: ${highlight.waveHost.rect[side]} vs ${highlight.row.rect[side]})`)
    }
    const cardSummary = assertBottomFaceGlow('card current row', highlight.waveHost, highlight.wave)
    assert(highlight.marker, 'no native Workspace row carries data-psd-current-workspace')
    assertEqual(highlight.markerCount, 1, 'exactly one native Workspace row must be marked')
    const nativeSummary = assertBottomFaceGlow('native Workspace row', { radius: highlight.marker.radius, rect: highlight.marker.rect, clientWidth: highlight.marker.clientWidth, clientHeight: highlight.marker.clientHeight }, { before: highlight.marker.before, after: highlight.marker.after })
    assert(highlight.marker.ownsCurrentSession, `marked Workspace row does not own the open Session ${highlight.sessionId}`)
    return `${highlight.row.className} + ${highlight.marker.rowKey}; ${cardSummary}; ${nativeSummary}`
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
    assert(highlight.marker && highlight.marker.before && highlight.marker.before.animationName.includes('psd-smoke'), 'the moved Workspace marker lost its bottom-face smoke layer')
    return `marker follows ${highlight.sessionId} on ${highlight.marker.rowKey}`
  })

  await results.check('b4-3', 'reduced motion leaves a static bottom-face tint', async () => {
    await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await sleep(400)
    const highlight = await page.eval(probe.currentHighlight)
    assert(highlight.wave && highlight.marker, 'current highlight facts missing under reduced motion')
    const layers = [
      ['card smoke', highlight.wave.before],
      ['card rim', highlight.wave.after],
      ['native smoke', highlight.marker.before],
      ['native rim', highlight.marker.after],
    ]
    for (const [name, layer] of layers) {
      assertEqual(layer.animationName, 'none', `reduced motion must stop the ${name} animation (${layer.animationName})`)
      assert(Number(layer.opacity) > 0.1, `reduced motion must leave a visible static tint (${name} opacity ${layer.opacity})`)
      assert(layer.maskImage.includes('gradient'), `reduced motion must keep the bottom-face mask (${name})`)
    }
    await page.emulateMedia([])
    await sleep(200)
    return `static smoke ${highlight.wave.before.opacity} + rim ${highlight.wave.after.opacity}; native ${highlight.marker.before.opacity}/${highlight.marker.after.opacity}`
  })

  await results.check('b4-4', 'a nested child current row paints the same glow on its own rounded rectangle', async () => {
    const target = await page.eval(() => {
      const child = document.querySelector('.psd-child')
      const main = child ? child.querySelector('.psd-child-main') : null
      if (!main) return null
      const r = main.getBoundingClientRect()
      return { x: Math.round(r.left + Math.min(30, Math.max(10, r.width / 2))), y: Math.round(r.top + r.height / 2) }
    })
    assert(target, 'no nested child row to open')
    await page.moveTo(900, 500)
    await sleep(200)
    await page.clickAt(target.x, target.y)
    await page.waitForFn(() => !!document.querySelector('.psd-child-current'), [], { timeout: 15000, label: 'current child row highlight' })
    await sleep(900)
    const highlight = await page.eval(probe.currentHighlight)
    assert(highlight.row && highlight.row.kind === 'child', `expected a child current row, got ${JSON.stringify(highlight.row)}`)
    assert(highlight.childWave, 'child current row is missing its .psd-child-wave glow host')
    assert(highlight.waveHost && highlight.wave, 'child glow host facts missing')
    for (const side of ['left', 'right', 'top', 'bottom']) {
      assertNear(highlight.waveHost.rect[side], highlight.row.rect[side], 1, `child glow host must follow the row box (${side}: ${highlight.waveHost.rect[side]} vs ${highlight.row.rect[side]})`)
    }
    assertEqual(highlight.waveHost.radius, highlight.row.radius, 'child glow host must inherit the child row radius')
    const summary = assertBottomFaceGlow('child current row', highlight.waveHost, highlight.wave)
    // Leave a parent row current again: the report screenshots show the primary case.
    const parent = await page.eval(() => {
      const row = document.querySelector('.psd-run')
      const main = row ? row.querySelector('.psd-run-main') : null
      if (!main) return null
      const r = main.getBoundingClientRect()
      return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }
    })
    if (parent) {
      await page.moveTo(900, 500)
      await sleep(150)
      await page.clickAt(parent.x, parent.y)
      await page.waitForFn(() => !!document.querySelector('.psd-run-current'), [], { timeout: 15000, label: 'parent current row after child check' })
      await sleep(700)
    }
    return `${summary}; child row ${highlight.row.rect.width}x${highlight.row.rect.height} radius ${highlight.row.radius}`
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
    // The live card re-sorts under a stationary pointer; retry until the card is
    // actually showing instead of a single timed hover.
    const target = await hoverRowStable(page, 0)
    const card = await page.eval(probe.hoverCard)
    assert(card, 'our hover card did not appear after the hover delay')
    state.hoverCard = card
    assertEqual(card.offsetFromSidebarRight, native.offsetFromSidebarRight, 'hover card left edge must be flush on the sidebar edge like the native tooltip')
    assertNear(card.rect.top, target.rowTop, 1, 'hover card top must align to the hovered row top')
    assertEqual(card.rect.width, 320, 'hover card keeps the native chrome and grows to its documented 320 px so the B6 figure sections fit on one line each')
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

async function runStatsChecks({ page, results, state }) {
  log('\n=== B6: native session figures in the row hover card ===')
  state.pageErrorsBefore = page.pageErrors.length
  state.logEntriesBefore = page.logEntries.length

  await results.check('b6-1', 'live parent row hover shows statistics, token usage and context figures', async () => {
    const bridge = await page.eval(probe.projectionBridge)
    assert(bridge.ok, `projection bridge unavailable: ${short(bridge.reason || 'unknown')}`)
    const parents = bridge.rows ?? []
    const live = parents.find((row) => row.record.hasStats && row.record.hasBreakdown && row.record.state === 'idle')
      ?? parents.find((row) => row.record.hasStats && row.record.hasBreakdown)
    assert(live, 'no parent card row exposes push-seeded projection values')
    state.liveStatsRow = { id: live.id, title: live.title }
    const opened = await openHoverCard(page, 'parent', live.title)
    assert(opened !== null, 'hover card did not open on the live parent row')
    const card = opened.card
    state.liveStatsCard = card
    assertEqual(card.pointerEvents, 'none', 'figure card must stay pointer-events:none in normal mode')
    assertEqual(card.sections.length, 3, `expected the three native figure sections, got ${JSON.stringify(card.sections.map((section) => section.title))}`)
    // 1. Session statistics: native counts line plus native-formatted duration/speed rows.
    const stats = sectionRows(card.sections, 'Session statistics')
    const counts = /^(\d+) turns (\d+) steps$/.exec(stats.section.value) ?? /^(\d+) 轮 (\d+) 步$/.exec(stats.section.value)
    assert(counts, `statistics headline is not the native counts line: ${JSON.stringify(stats.section.value)}`)
    assert(Number(counts[2]) > 0, 'statistics section must only appear for a Session with steps')
    const durationShape = /^\d+(?:\.\d+)?(?:s|秒)$|^\d+(?:m|分)\d+(?:s|秒)$/
    const speedShape = /^\d+(?:\.\d+)? tok\/s$/
    const statsLabels = new Map([
      ['LLM time', durationShape], ['模型用时', durationShape],
      ['Tool time', durationShape], ['工具调用用时', durationShape],
      ['Avg time to first token (TTFT)', durationShape], ['首 token 平均（TTFT）', durationShape],
      ['Tokens per second (TPS)', speedShape], ['输出速度（TPS）', speedShape],
    ])
    let statsRows = 0
    for (const [key, value] of stats.rows) {
      const shape = statsLabels.get(key)
      if (shape === undefined) continue
      statsRows += 1
      assert(shape.test(value), `statistics row "${key}" has a non-native value: ${JSON.stringify(value)}`)
    }
    assert(statsRows >= 2, `expected at least LLM time and TPS rows, got ${statsRows} (${JSON.stringify(stats.section.rows)})`)
    // 2. Token usage: total = billed input buckets + output, exact grouped counts.
    const usage = sectionRows(card.sections, 'Token usage')
    const total = parseTokenCount('Token usage total', usage.section.value)
    const uncached = parseTokenCount('Uncached input', usage.rows.get('Uncached input') ?? usage.rows.get('未缓存输入'))
    const cached = parseTokenCount('Cached input', usage.rows.get('Cached input') ?? usage.rows.get('缓存读取'))
    const output = parseTokenCount('Output', usage.rows.get('Output') ?? usage.rows.get('输出'))
    const cacheWriteText = usage.rows.get('Cache write') ?? usage.rows.get('缓存写入')
    const cacheWrite = cacheWriteText === undefined ? 0 : parseTokenCount('Cache write', cacheWriteText)
    assertEqual(uncached + cached + cacheWrite + output, total, 'token usage total must equal the billing buckets plus output')
    assert(total > 0, 'live Session must show a non-zero token total')
    const billed = uncached + cached + cacheWrite
    const hitText = usage.rows.get('Cache hit') ?? usage.rows.get('缓存命中')
    if (billed > 0) {
      assert(hitText !== undefined, 'billed input must show a cache-hit row')
      const hit = parsePercent('Cache hit', hitText)
      if (cached === billed) assertEqual(hitText, '100%', 'a full cache hit must read 100%')
      else assert(hit < 100, `a partial cache hit must never round to 100% (got ${hitText})`)
    } else {
      assertEqual(hitText, undefined, 'no billed input must hide the cache-hit row')
    }
    // 3. Context usage: percent + ~used / window plus the heuristic composition,
    //    which is never asserted to partition the provider pressure.
    const context = sectionRows(card.sections, 'of context used', /^\d+% of context used$|^上下文已用 \d+%$/)
    const percentValue = /^(\d+)%/.exec(context.section.title)
    assert(percentValue, `context headline is not a percentage: ${JSON.stringify(context.section.title)}`)
    const percent = Number(percentValue[1])
    assert(percent >= 0 && percent <= 100, `context percent out of range: ${percent}`)
    const figures = /^~([\d.]+[KM]?) \/ ([\d.]+[KM]?)$/.exec(context.section.value)
    assert(figures, `context figures are not "~used / window": ${JSON.stringify(context.section.value)}`)
    const breakdownLabels = new Set(['System prompt', 'Tool definitions', 'Messages', '系统提示词', '工具定义', '对话消息'])
    let breakdownRows = 0
    for (const [key, value] of context.rows) {
      if (!breakdownLabels.has(key)) continue
      breakdownRows += 1
      assert(/^~[\d.]+[KM]?$/.test(value), `context breakdown row "${key}" must be a compact ~-prefixed count: ${JSON.stringify(value)}`)
    }
    assertEqual(breakdownRows, 3, `expected the three composition rows, got ${breakdownRows}`)
    assert(Number(card.rect.width) <= 320, `figure card must stay within its 320 px budget, got ${card.rect.width}`)
    return `${counts[1]} turns ${counts[2]} steps | ${formatNumber(total)} tok | cache hit ${hitText ?? 'n/a'} | context ${context.section.title} (${context.section.value}); ${statsRows} stats rows`
  })

  await results.check('b6-2', 'a cold subagent row triggers exactly one projection read, then fills its figures', async () => {
    const bridge = await page.eval(probe.projectionBridge)
    assert(bridge.ok, `projection bridge unavailable: ${short(bridge.reason || 'unknown')}`)
    const visibleChildren = new Set((bridge.domRows ?? []).filter((row) => row.kind === 'child').map((row) => row.title))
    const cold = (bridge.children ?? []).find((child) => child.needsRead && visibleChildren.has(child.title))
    assert(cold, 'no cold subagent row is listed in the card with unseeded figures; cannot verify the one-shot read')
    assert(cold.record.keys.length > 0, 'a cold child should still carry summary projection keys')
    assertEqual(bridge.counts[cold.id] ?? 0, 0, 'the cold child already had a projection read before this check')
    // The first hover starts the one-shot read. The live list can re-sort under
    // the pointer, so trigger until the bridge records the read instead of
    // requiring the card to stay open across the whole fill.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await hoverCardRowByTitle(page, 'child', cold.title)
      } catch {
        await sleep(250)
        continue
      }
      await sleep(500)
      const triggered = await page.eval(probe.projectionBridge)
      if ((triggered.counts[cold.id] ?? 0) > 0) break
    }
    // No loading state: the card is complete the moment it opens and the
    // figures append in place once the read lands.
    await sleep(1600)
    const opened = await openHoverCard(page, 'child', cold.title)
    assert(opened !== null, 'hover card did not open on the cold child row')
    const card = opened.card
    assertEqual(card.sessionText, cold.title, 'a subagent card must name the hovered Session under the Workspace title')
    const after = await page.eval(probe.projectionBridge)
    assertEqual(after.counts[cold.id] ?? 0, 1, `cold child must trigger exactly one projection read (${JSON.stringify(after.counts)})`)
    const record = (after.children ?? []).find((child) => child.id === cold.id)
    assert(record && record.record.hasStats, 'the projection read did not land the statistics values in the store')
    assert(card.sections.length >= 2, `cold child card should fill in its native figures, got ${JSON.stringify(card.sections.map((section) => section.title))}`)
    assertEqual(card.pointerEvents, 'none', 'cold child card must stay pointer-events:none')
    // Leaving and returning reuses the cached values: the guard never re-reads.
    await page.moveTo(900, 500)
    await sleep(500)
    await openHoverCard(page, 'child', cold.title)
    const second = await page.eval(probe.projectionBridge)
    assertEqual(second.counts[cold.id] ?? 0, 1, 'a second hover must not re-read the projection')
    state.coldChild = { id: cold.id, title: cold.title, reads: second.counts[cold.id], sections: card.sections.map((section) => section.title) }
    return `${cold.id.slice(0, 8)}… "${short(cold.title, 34)}": 1 read, ${card.sections.length} sections (${state.coldChild.sections.join(' / ')})`
  })

  await results.check('b6-3', 'absent projection data hides the whole figure block without breaking the card', async () => {
    // Open the figures for a live row first (adversarial setup), then simulate a
    // Session the Host exposes without projection values: hold its one-shot read
    // pending and clear its values while the card is open. The block must vanish,
    // the plain rows must stay, and there must be no loading state.
    const bridge = await page.eval(probe.projectionBridge)
    const domTitles = {
      parent: new Set((bridge.domRows ?? []).filter((row) => row.kind === 'parent').map((row) => row.title)),
      child: new Set((bridge.domRows ?? []).filter((row) => row.kind === 'child').map((row) => row.title)),
    }
    const liveId = state.liveStatsRow !== undefined ? state.liveStatsRow.id : null
    const candidates = [...(bridge.children ?? []), ...(bridge.rows ?? [])]
      .filter((row) => row.id !== liveId && row.record.hasStats && domTitles[row.kind === 'child' ? 'child' : 'parent'].has(row.title))
      .sort((left, right) => (left.kind === 'child' ? 0 : 1) - (right.kind === 'child' ? 0 : 1))
    let observed = null
    for (const candidate of candidates.slice(0, 3)) {
      const opened = await openHoverCard(page, candidate.kind === 'child' ? 'child' : 'parent', candidate.title)
      if (opened === null || opened.card.sections.length === 0) continue
      const stalled = await page.eval(probe.stallProjectionRefresh, candidate.id)
      assert(stalled.ok, `cannot stall the projection read: ${short(stalled.reason || 'unknown')}`)
      const dropped = await page.eval(probe.dropProjectionValues, candidate.id)
      assert(dropped.ok, `cannot clear the projection values: ${short(dropped.reason || 'unknown')}`)
      // Poll immediately: the seat re-renders as soon as the list snapshot changes.
      for (let i = 0; i < 25; i += 1) {
        await sleep(80)
        const card = await page.eval(probe.hoverCard)
        if (card !== null && card.sections.length === 0) {
          observed = { candidate, card }
          break
        }
      }
      if (observed !== null) break
      // The live card closed instead of hiding the block: try another row.
    }
    assert(observed !== null, 'the open figure card never hid its block after the projection values were cleared')
    const { candidate, card } = observed
    assert(card.title, 'the card kept rendering without its figure block')
    assert(card.text.includes('Last active'), 'the plain detail rows disappeared with the figure block')
    assertEqual(card.pointerEvents, 'none', 'card must stay pointer-events:none without figures')
    // Values must not appear later either (the read never settles): no flash.
    await sleep(700)
    const later = await page.eval(probe.hoverCard)
    if (later !== null) {
      assertEqual(later.sections.length, 0, 'absent projections must not grow a figure block later')
      assertEqual(later.pointerEvents, 'none', 'card must stay pointer-events:none')
    }
    await page.moveTo(900, 500)
    await sleep(400)
    return `live card lost ${candidate.id.slice(0, 8)}… "${short(candidate.title, 28)}" projections mid-hover: block hidden, plain rows intact (${card.rect.width}x${card.rect.height}), no spinner`
  })

  await results.check('b6-4', 'figure card keeps the native chrome, 320 px frame and viewport clamp', async () => {
    const live = state.liveStatsRow
    assert(live, 'need the live figure row from b6-1')
    const opened = await openHoverCard(page, 'parent', live.title)
    assert(opened !== null, 'hover card did not reopen for the geometry check')
    const card = opened.card
    assertEqual(card.pointerEvents, 'none', 'card must not capture the pointer')
    assertEqual(card.pinned, null, 'normal mode must not pin the card')
    assertEqual(card.rect.width, 320, 'the figure card keeps its documented 320 px width')
    assertEqual(card.offsetFromSidebarRight, 0, 'card left edge must stay flush on the sidebar right edge')
    assertEqual(card.borderWidth, '0px', 'card must stay borderless')
    assert(/560px/.test(card.maxHeight), `card max-height must keep the 560 px clamp: ${card.maxHeight}`)
    assert(card.overflowY === 'auto', `card must scroll internally past the clamp: ${card.overflowY}`)
    assert(card.rect.height <= 560, `card height ${card.rect.height} exceeds the 560 px clamp`)
    assert(card.rect.top >= 8, `card top ${card.rect.top} is above the viewport margin`)
    assert(card.rect.top + card.rect.height <= card.viewport.height - 8 + 1, `card bottom ${card.rect.top + card.rect.height} escapes the viewport (${card.viewport.height})`)
    // pointer-events:none must win hit-testing over the card surface.
    const hit = await page.eval((point) => {
      const element = document.elementFromPoint(point.x, point.y)
      return element === null ? null : { inCard: element.closest('[data-psd-hovercard]') !== null, tag: element.tagName }
    }, { x: card.rect.left + 12, y: card.rect.top + 12 })
    assert(hit, 'elementFromPoint returned nothing over the card')
    assertEqual(hit.inCard, false, 'the card captured pointer hit-testing')
    state.statsCardGeometry = { width: card.rect.width, height: card.rect.height, maxHeight: card.maxHeight }
    await page.moveTo(900, 500)
    await sleep(500)
    return `320x${card.rect.height} at ${card.rect.left}/${card.rect.top}, max-height ${card.maxHeight}, pointer-events none, clamped inside ${card.viewport.width}x${card.viewport.height}`
  })

  await results.check('b6-6', 'identity glyphs: all-complete header brand, read parent rows sparkle, child robots unchanged', async () => {
    const DEEPSEEK_PREFIX = 'M23.7493 4.92674'
    const SPARKLE_PREFIX = 'M14 4.4375'
    const ROBOT_PREFIX = 'M13.5 2C13.5 2.44425'
    let glyphs = await page.eval(probe.identityGlyphs)
    // Header: the pulse dot while anything runs; otherwise the DeepSeek brand
    // glyph in the same 14 px slot with the same class/colour recipe.
    if (!glyphs.headerPulsing) {
      assert(glyphs.headerPath && glyphs.headerPath.startsWith(DEEPSEEK_PREFIX),
        `all-complete header identity glyph must be the DeepSeek brand glyph, got ${short(glyphs.headerPath)}`)
      assertEqual(glyphs.headerGlyphSize?.width, '14', 'header identity glyph size')
      assertEqual(glyphs.headerGlyphSize?.height, '14', 'header identity glyph box')
    } else {
      assertEqual(glyphs.headerPath, null, 'a running card keeps the pulse dot instead of an identity glyph')
    }
    // Rows: a read/acknowledged finished parent row shows the sparkling glyph.
    // A live card may briefly contain only running parent rows (no finished
    // parent inside the retention window); try to arrange one by opening a
    // finished row, then verify every identity glyph that is actually shown.
    if (glyphs.brandRows.length === 0) {
      state.arrangedReadRows = await arrangeReadDoneRow(page)
      glyphs = await page.eval(probe.identityGlyphs)
    }
    const readParentRows = glyphs.brandRows.length
    for (const row of glyphs.brandRows) {
      assert(row.brand && row.brand.startsWith(SPARKLE_PREFIX),
        `a read parent row must use the sparkling glyph, got ${short(row.brand)}`)
    }
    // Child rows keep the robot glyph; arrange one acknowledged finished child
    // (opening it only acknowledges it) when none shows an identity glyph yet.
    let childBrands = glyphs.childBrands
    if (childBrands.length === 0) {
      const childTarget = await page.eval(() => {
        const row = [...document.querySelectorAll('.psd-child')].find((el) => el.dataset.state === 'done' && el.querySelector('.psd-child-main') !== null)
        if (!row) return null
        const main = row.querySelector('.psd-child-main')
        const rect = main.getBoundingClientRect()
        return { x: Math.round(rect.left + 20), y: Math.round(rect.top + rect.height / 2) }
      })
      if (childTarget !== null) {
        await page.clickAt(childTarget.x, childTarget.y)
        await sleep(1400)
        glyphs = await page.eval(probe.identityGlyphs)
        childBrands = glyphs.childBrands
      }
    }
    for (const path of childBrands) {
      assert(path && path.startsWith(ROBOT_PREFIX), `child rows must keep the robot glyph, got ${short(path)}`)
    }
    state.glyphEvidence = {
      headerPulsing: glyphs.headerPulsing,
      headerPath: glyphs.headerPath,
      readParentRows,
      childBrands: childBrands.length,
    }
    const headerState = glyphs.headerPulsing ? 'pulse dot (running card)' : 'DeepSeek brand glyph (all complete)'
    return `header ${headerState}; read parent rows verified: ${readParentRows}${readParentRows === 0 ? ' (none in the live card this run — source test pins the swap)' : ' sparkle'}; ${childBrands.length} child robot glyph(s) unchanged`
  })

  await results.check('b6-5', 'figure hovers add no page errors or failed network requests', async () => {
    const newPageErrors = page.pageErrors.slice(state.pageErrorsBefore)
    assertEqual(newPageErrors.length, 0, `new page errors: ${JSON.stringify(newPageErrors)}`)
    const knownNoise = /9230\/ingest/
    const newEntries = page.logEntries.slice(state.logEntriesBefore).filter((entry) => !knownNoise.test(entry))
    assertEqual(newEntries.length, 0, `new console/network errors: ${JSON.stringify(newEntries.slice(0, 4))}`)
    return `0 new page errors, 0 new network failures (${page.pageErrors.length} total page errors)`
  })
}

async function runAnnotationPinChecks({ page, results, state }) {
  log('\n=== F4: annotation mode pins the hover card ===')
  // Earlier checks reload the page; wait for the live card to hydrate again.
  await ensurePanelRows(page)
  const clearAnnotationPin = async () => {
    // Always remove the simulated annotation state, even when an assertion throws,
    // so a failed f4-1 cannot cascade into f4-2.
    await page.evaluate(`(() => {
      document.documentElement.removeAttribute('data-psa-active')
      document.dispatchEvent(new CustomEvent('power-suite:ui-annotation-state', { detail: { active: false } }))
      const style = document.getElementById('psd-e2e-annotation-pin')
      if (style) style.remove()
    })()`)
    await page.moveTo(900, 500)
    await sleep(400)
  }
  await results.check('f4-1', 'annotation mode pins the hover card and mode exit unpins/clears it', async () => {
    try {
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
    const target = await hoverRowStable(page, 0)
    await sleep(300)
    let card = await page.eval(probe.hoverCard)
    if (card === null) {
      // hoverRowStable guarantees the card was present; re-open once for flake.
      await page.moveTo(900, 500)
      await sleep(300)
      await hoverRowStable(page, 0)
      card = await page.eval(probe.hoverCard)
    }
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
    let reopened = null
    for (let attempt = 0; attempt < 4 && reopened === null; attempt += 1) {
      try {
        await hoverRow(page, 0)
      } catch {
        await sleep(300)
        continue
      }
      await sleep(700)
      reopened = await page.eval(probe.hoverCard)
      if (reopened === null) {
        await page.moveTo(900, 500)
        await sleep(200)
      }
    }
    assert(reopened, 'hover card did not reopen for the mode-exit check')
    await page.evaluate(`(() => {
      document.documentElement.removeAttribute('data-psa-active')
      document.dispatchEvent(new CustomEvent('power-suite:ui-annotation-state', { detail: { active: false } }))
    })()`)
    await sleep(500)
    const cleared = await page.eval(probe.hoverCard)
    assertEqual(cleared, null, 'mode exit left the hover card pinned')
    return `pinned at z=${card.zIndex}, toggles correctly`
    } finally {
      await clearAnnotationPin()
    }
  })

  await results.check('f4-2', 'normal mode DOM never carries the pin marker', async () => {
    await page.evaluate(`(() => {
      const style = document.getElementById('psd-e2e-annotation-pin')
      if (style) style.remove()
    })()`)
    let card = null
    for (let attempt = 0; attempt < 4 && card === null; attempt += 1) {
      try {
        await hoverRow(page, 0)
      } catch {
        await sleep(300)
        continue
      }
      await sleep(700)
      card = await page.eval(probe.hoverCard)
      if (card === null) {
        await page.moveTo(900, 500)
        await sleep(200)
      }
    }
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

/**
 * Best-effort: leave the first card parent row as the current Session so the
 * screenshot pass captures the primary parent-row highlight. Never throws into
 * the evidence pass (a screenshot run must not fail on a live-data hiccup).
 * @param {object} page - Page wrapper.
 * @returns {Promise<void>}
 */
/**
 * Best effort: photograph the marked native Workspace row's bottom-face glow,
 * then scroll the current card row back into view for the remaining evidence.
 * @param {object} page - Page wrapper.
 * @param {Function} shot - screenshot(name, clip) helper.
 * @param {string} name - evidence file name.
 * @returns {Promise<void>}
 */
async function shotNativeWorkspaceGlow(page, shot, name) {
  try {
    // The marked row can be hidden by the Inactive bucket fold or a collapsed
    // native section after the fold checks; reopen both for the evidence shot.
    const prepared = await page.eval(() => {
      if (!document.querySelector('[data-psd-current-workspace="true"]')) return false
      const hidden = document.querySelector('[data-psd-current-workspace="true"]').getBoundingClientRect().height <= 4
      if (!hidden) return true
      const group = document.querySelector('[data-psd="group"][data-group="inactive"] .psd-group-toggle')
      if (group && group.getAttribute('aria-expanded') === 'false') group.click()
      return true
    })
    if (!prepared) return
    await page.moveTo(900, 500)
    await sleep(600)
    const scrolled = await page.eval(() => {
      const row = document.querySelector('[data-psd-current-workspace="true"]')
      if (!row) return false
      // The row's native section may have been collapsed by later checks: reopen
      // it so its bottom-face glow is photographable.
      if (row.getAttribute('aria-expanded') === 'false') row.click()
      row.scrollIntoView({ block: 'center', behavior: 'instant' })
      return true
    })
    if (!scrolled) return
    await page.moveTo(900, 500)
    await sleep(700)
    const view = await page.eval(() => {
      const row = document.querySelector('[data-psd-current-workspace="true"]')
      if (!row) return null
      const r = row.getBoundingClientRect()
      return { top: Math.round(r.top), height: Math.round(r.height), visible: r.height > 4 && r.top >= 0 && r.bottom <= window.innerHeight }
    })
    if (view === null || !view.visible) return
    const clipTop = Math.max(0, view.top - 80)
    await shot(name, { x: 0, y: clipTop, width: 340, height: Math.max(60, Math.min(220, VIEWPORT.height - clipTop)) })
    await page.eval(() => {
      const cardRow = document.querySelector('.psd-run-current, .psd-child-current')
      if (cardRow) cardRow.scrollIntoView({ block: 'center', behavior: 'instant' })
    })
    await page.moveTo(900, 500)
    await sleep(400)
  } catch {
    // Evidence capture is best effort.
  }
}

async function ensureParentRowCurrent(page) {
  try {
    if (await page.eval(() => document.querySelector('.psd-run-current') !== null)) {
      await page.moveTo(900, 500)
      await sleep(250)
      return
    }
    const target = await page.eval(() => {
      const row = document.querySelector('.psd-run')
      const main = row ? row.querySelector('.psd-run-main') : null
      if (!main) return null
      const r = main.getBoundingClientRect()
      return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }
    })
    if (!target) return
    await page.moveTo(900, 500)
    await sleep(150)
    await page.clickAt(target.x, target.y)
    await page.waitForFn(() => !!document.querySelector('.psd-run-current'), [], { timeout: 15000, label: 'parent current row for screenshots' })
    await page.moveTo(900, 500)
    await sleep(900)
  } catch {
    // Evidence capture is best effort; the checks already verified the highlight.
  }
}

async function captureScreenshots(page, state) {
  await mkdir(SHOTS_DIR, { recursive: true })
  // Best effort: the card should be hydrated after the checks, but evidence
  // capture must not turn a live-data hiccup into a failed run.
  await ensurePanelRows(page).catch(() => 0)
  const shots = []
  const shot = async (name, clip) => {
    const file = path.join(SHOTS_DIR, `${name}.png`)
    await page.screenshot(file, clip)
    shots.push(file)
    return file
  }
  await page.emulateMedia([])
  await page.moveTo(900, 500)
  await sleep(300)
  await shot('01-card-light')
  // Icon-swap evidence: the panel header (identity glyph / pulse dot) plus the
  // card rows including the acknowledged row arranged by the B6 glyph check.
  const panelClip = await page.eval(() => {
    const panel = document.querySelector('.psd-panel')
    if (!panel) return null
    const r = panel.getBoundingClientRect()
    const top = Math.max(0, Math.round(r.top))
    return {
      x: Math.max(0, Math.round(r.left)),
      y: top,
      width: Math.min(Math.round(r.width), 600),
      height: Math.min(Math.round(r.height), window.innerHeight - top),
    }
  })
  if (panelClip !== null && panelClip.width > 0 && panelClip.height > 0) {
    await shot('01b-panel-identity-glyphs', panelClip)
  }
  try {
    await hoverRowStable(page, 0)
  } catch {
    await sleep(300)
  }
  await shot('02-card-row-hover')
  await page.moveTo(900, 500)
  await sleep(400)
  // B6 figure sections (the values fill in when the projection read lands).
  if (state.liveStatsRow !== undefined) {
    const opened = await openHoverCard(page, 'parent', state.liveStatsRow.title)
    if (opened !== null && opened.card.sections.length > 0) await shot('02b-hovercard-stats-light')
    await page.moveTo(900, 500)
    await sleep(400)
  }
  // 01/02 above may show a nested child row's glow (the read-glyph check opens
  // one). Open the first card row so the primary parent-row highlight is the one
  // in the 03/04/05 evidence shots; the child case stays visible in 01/02.
  await ensureParentRowCurrent(page)
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
  await shotNativeWorkspaceGlow(page, shot, '03b-native-workspace-glow-light')
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
  await sleep(700)
  await shot('04-card-dark')
  if (currentRow) await shot('05-current-wave-dark')
  await shotNativeWorkspaceGlow(page, shot, '05c-native-workspace-glow-dark')
  if (state.liveStatsRow !== undefined) {
    const openedDark = await openHoverCard(page, 'parent', state.liveStatsRow.title)
    if (openedDark !== null && openedDark.card.sections.length > 0) await shot('05b-hovercard-stats-dark')
    await page.moveTo(900, 500)
    await sleep(400)
  }
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
      await runStatsChecks({ page, results, state })
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
