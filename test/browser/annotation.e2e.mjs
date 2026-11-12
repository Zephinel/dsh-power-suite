#!/usr/bin/env node
/**
 * Live-DSH end-to-end harness for the UI element annotation feature.
 *
 * What it does
 * ------------
 * Launches a throwaway headless Chrome (fresh `--user-data-dir`, so the profile is never
 * touched), connects over the Chrome DevTools Protocol with Node's global WebSocket (no
 * dependencies), opens the REAL running DSH Web GUI with a fresh token URL, and injects this
 * worktree's `src/client.js` into the live page with `Page.addScriptToEvaluateOnNewDocument`:
 * the injected script wraps `window.__ModuleLoader__.load` so the shell's
 * `@rexxin/dsh-power-suite` registration is loaded from this worktree instead of the installed
 * checkout. The installed plugin, the profile and the launchd service stay untouched.
 *
 * It then drives the page with real CDP input (`Input.dispatchMouseEvent` /
 * `Input.dispatchKeyEvent`, modifier bitmask Alt=1 Ctrl=2 Meta=4 Shift=8) and asserts the nine
 * acceptance scenarios from `CONTRACT.md` section 4.2, collects page errors
 * (`Runtime.exceptionThrown` + `Runtime.consoleAPICalled` at error level), prints a PASS/FAIL
 * table and exits non-zero on failure.
 *
 * Side effects: one blank session is created through the native New Session button per run
 * (scenario 2 creates a second one as part of its own pass-through assertion; scenario 7
 * creates a third to prove native clicking works again after exit). The created
 * `data-conversation-session` ids are printed for cleanup; no other session, setting or file is
 * touched.
 *
 * Usage:
 *   node test/browser/annotation.e2e.mjs                 # full run: smoke + 9 scenarios + shots
 *   node test/browser/annotation.e2e.mjs --smoke         # pipeline smoke only, no feature runs
 *   node test/browser/annotation.e2e.mjs --client /tmp/baseline-client.js
 *   node test/browser/annotation.e2e.mjs --no-shots      # skip docs/assets screenshots
 *   node test/browser/annotation.e2e.mjs --scenario 4    # run only scenario 4 (plus smoke)
 *   node test/browser/annotation.e2e.mjs --keep-open     # leave Chrome running for inspection
 *   node test/browser/annotation.e2e.mjs --headful       # show the browser window
 *
 * Env:
 *   DSH_WEB_URL  token URL for the GUI. If unset (or set without `token=`, as the DSH shell
 *                itself does), the URL is resolved with `~/.local/bin/dsh-web url --ip`.
 *   CHROME_BIN   Chrome binary; defaults to the standard macOS Google Chrome location.
 *
 * Requires Node >= 22 (global WebSocket, fetch) and Chrome. Never prints the auth token.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKTREE = path.resolve(HERE, '..', '..')
const ASSETS_DIR = path.join(WORKTREE, 'docs', 'assets')
const CLIENT_PATH = path.join(WORKTREE, 'src', 'client.js')
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DSH_WEB_BIN = path.join(homedir(), '.local', 'bin', 'dsh-web')
const VIEWPORT = { width: 1728, height: 900 }

const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
const KEY_DEFS = {
  alt: { key: 'Alt', code: 'AltLeft', vk: 18, mod: MOD.alt },
  control: { key: 'Control', code: 'ControlLeft', vk: 17, mod: MOD.ctrl },
  meta: { key: 'Meta', code: 'MetaLeft', vk: 91, mod: MOD.meta },
  shift: { key: 'Shift', code: 'ShiftLeft', vk: 16, mod: MOD.shift },
  escape: { key: 'Escape', code: 'Escape', vk: 27, mod: 0 },
}

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
    assets: false,
    shotsOnly: false,
    scenario: null,
    from: null,
    url: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--smoke') opts.mode = 'smoke'
    else if (arg === '--no-shots') opts.shots = false
    else if (arg === '--keep-open') opts.keepOpen = true
    else if (arg === '--headful') opts.headful = true
    else if (arg === '--assets') opts.assets = true
    else if (arg === '--shots-only') { opts.shotsOnly = true; opts.mode = 'shots' }
    else if (arg === '--client') opts.clientPath = path.resolve(argv[++i])
    else if (arg.startsWith('--client=')) opts.clientPath = path.resolve(arg.slice('--client='.length))
    else if (arg === '--scenario') opts.scenario = argv[++i]
    else if (arg.startsWith('--scenario=')) opts.scenario = arg.slice('--scenario='.length)
    else if (arg === '--from') opts.from = argv[++i]
    else if (arg.startsWith('--from=')) opts.from = arg.slice('--from='.length)
    else if (arg === '--url') opts.url = argv[++i]
    else if (arg.startsWith('--url=')) opts.url = arg.slice('--url='.length)
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node test/browser/annotation.e2e.mjs [--smoke] [--shots-only] [--assets] [--client path] [--no-shots] [--scenario N|--from N] [--keep-open] [--headful] [--url TOKEN_URL]')
      process.exit(0)
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  // H1: an invalid/out-of-range selection must fail loudly instead of silently running nothing.
  const validateSelection = (name, raw) => {
    if (raw === undefined) {
      const error = new Error(`${name} requires an integer argument`)
      error.exitCode = 2
      throw error
    }
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      const error = new Error(`invalid ${name} "${raw}": expected an integer in the 1..9 scenario range`)
      error.exitCode = 2
      throw error
    }
    return value
  }
  if (opts.scenario !== null) opts.scenario = validateSelection('--scenario', opts.scenario)
  if (opts.from !== null) opts.from = validateSelection('--from', opts.from)
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

  const profileDir = await mkdtemp(path.join(tmpdir(), 'dsh-psa-e2e-'))
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
    '--window-size=1728,900',
  ]
  if (!opts.headful) args.unshift('--headless=new')

  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const chromeStderr = []
  proc.stderr.on('data', (chunk) => {
    const text = String(chunk)
    if (chromeStderr.length < 200) chromeStderr.push(text)
    // surface an early crash in the timeout message
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
// Page wrapper: one attached target/session with evaluation + real input helpers
// ---------------------------------------------------------------------------------------------

class Page {
  static async open(cdp, url, initScript) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new Page(cdp, sessionId)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable').catch(() => {})
    await page.send('Network.enable').catch(() => {})
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
    this.networkFailures = []
    this.networkProblems = []
    this._requestUrls = new Map()
    this.logEntries = []
    this._subscriptions = [
      cdp.on('Runtime.exceptionThrown', (params, eventSession) => {
        if (eventSession !== this.sessionId) return
        const details = params?.exceptionDetails || {}
        const description = details.exception?.description || details.text || 'unknown exception'
        this.pageErrors.push(short(description.split('\n')[0], 300))
      }),
      cdp.on('Runtime.consoleAPICalled', (params, eventSession) => {
        if (eventSession !== this.sessionId || params.type !== 'error') return
        const text = (params.args || [])
          .map((arg) => arg.value ?? arg.description ?? arg.type ?? '')
          .join(' ')
        this.pageErrors.push(short(text, 300))
        this.consoleErrors.push(short(text, 300))
      }),
      cdp.on('Log.entryAdded', (params, eventSession) => {
        if (eventSession && eventSession !== this.sessionId) return
        if (params.entry?.level !== 'error') return
        const entry = params.entry
        const source = entry.source ? `${entry.source}: ` : ''
        const location = entry.url ? ` @ ${short(entry.url, 160)}` : ''
        this.logEntries.push(short(`${source}${entry.text}${location}`, 400))
      }),
      cdp.on('Network.requestWillBeSent', (params, eventSession) => {
        if (eventSession !== this.sessionId) return
        const request = params?.request || {}
        this._requestUrls.set(params.requestId, {
          url: String(request.url || ''),
          type: String(params.type || ''),
        })
      }),
      cdp.on('Network.responseReceived', (params, eventSession) => {
        if (eventSession !== this.sessionId) return
        const response = params?.response || {}
        const url = String(response.url || '')
        const status = Number(response.status || 0)
        if (status < 400) return
        if (!/^https?:/i.test(url)) return
        if (/favicon\.ico/i.test(url)) return
        this.networkProblems.push(`${status} ${params.type || '?'} ${short(url, 180)}`)
      }),
      cdp.on('Network.loadingFailed', (params, eventSession) => {
        if (eventSession !== this.sessionId) return
        if (params.canceled) return
        const info = this._requestUrls.get(params.requestId) || {}
        const url = String(info.url || '')
        if (/favicon\.ico/i.test(url)) return
        const type = String(params.type || info.type || '?')
        if (!['Fetch', 'XHR', 'Document', 'Script', 'Stylesheet'].includes(type)) return
        const text = `${params.errorText || 'failed'} ${type} ${short(url, 180)}`
        this.networkFailures.push(text)
        this.networkProblems.push(text)
      }),
    ]
  }

  send(method, params = {}, timeoutMs) {
    return this.cdp.send(method, params, this.sessionId, timeoutMs)
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: false,
    })
    if (result.exceptionDetails) {
      const details = result.exceptionDetails
      const description = details.exception?.description || details.text || 'evaluate failed'
      throw new Error(`page evaluate failed: ${short(description.split('\n')[0], 300)}`)
    }
    return result.result?.value
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

  /** First visible element matching selector -> {x,y,w,h} center point + rect, or null. */
  findRect(selector) {
    return this.eval((sel) => {
      const els = [...document.querySelectorAll(sel)]
      for (const el of els) {
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
      // A busy renderer can delay one dispatch; retry once before failing the scenario.
      await sleep(600)
      await this.send('Input.dispatchMouseEvent', event, 30000)
    }
  }

  async moveTo(x, y, modifiers = 0) {
    await this.mouse({ type: 'mouseMoved', x, y, modifiers })
  }

  async clickAt(x, y, { modifiers = 0, button = 'left', clickCount = 1 } = {}) {
    await this.moveTo(x, y, modifiers)
    await this.mouse({ type: 'mousePressed', x, y, button, clickCount, modifiers })
    await sleep(30)
    await this.mouse({ type: 'mouseReleased', x, y, button, clickCount, modifiers })
    await sleep(60)
  }

  /** Real click on the first visible element matching selector. Returns its rect or null. */
  async clickSelector(selector, options = {}) {
    const rect = await this.findRect(selector)
    if (!rect) return null
    await this.clickAt(rect.x, rect.y, options)
    return rect
  }

  async rightClickAt(x, y, { modifiers = 0 } = {}) {
    await this.moveTo(x, y, modifiers)
    await this.mouse({ type: 'mousePressed', x, y, button: 'right', clickCount: 1, modifiers })
    await sleep(30)
    await this.mouse({ type: 'mouseReleased', x, y, button: 'right', clickCount: 1, modifiers })
    await sleep(80)
  }

  async drag(from, to, { modifiers = 0, steps = 12, button = 'left' } = {}) {
    await this.moveTo(from.x, from.y, modifiers)
    await this.mouse({ type: 'mousePressed', x: from.x, y: from.y, button, clickCount: 1, modifiers })
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      await this.mouse({
        type: 'mouseMoved',
        x: Math.round(from.x + (to.x - from.x) * t),
        y: Math.round(from.y + (to.y - from.y) * t),
        button,
        buttons: 1,
        modifiers,
      })
      await sleep(16)
    }
    await this.mouse({ type: 'mouseReleased', x: to.x, y: to.y, button, clickCount: 1, modifiers })
    await sleep(100)
  }

  async wheel(x, y, deltaY, { deltaX = 0, modifiers = 0 } = {}) {
    await this.mouse({ type: 'mouseWheel', x, y, deltaX, deltaY, modifiers })
    await sleep(120)
  }

  async keyDown(name, extraModifiers = 0) {
    const def = KEY_DEFS[name]
    if (!def) throw new Error(`unknown key: ${name}`)
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers: def.mod | extraModifiers,
    })
    await sleep(30)
  }

  async keyUp(name, extraModifiers = 0) {
    const def = KEY_DEFS[name]
    if (!def) throw new Error(`unknown key: ${name}`)
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers: extraModifiers,
    })
    await sleep(30)
  }

  /** Hold a modifier (alt/shift/meta/control) for the duration of `fn`. */
  async withModifier(name, fn) {
    const def = KEY_DEFS[name]
    await this.keyDown(name)
    try {
      return await fn(def.mod)
    } finally {
      await this.keyUp(name, 0)
    }
  }

  async pressKey(name, { modifiers = 0 } = {}) {
    const def = KEY_DEFS[name]
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers,
    })
    await sleep(20)
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers,
    })
    await sleep(60)
  }

  /** Dispatch one key press with arbitrary key/code/virtual key code and modifier bitmask. */
  async dispatchKey(key, code, virtualKeyCode, modifiers = 0) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
      modifiers,
    })
    await sleep(25)
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
      modifiers,
    })
    await sleep(40)
  }

  /** Real character input into the focused element (CRLF-free text is required). */
  async insertText(text) {
    await this.send('Input.insertText', { text })
    await sleep(80)
  }

  dispose() {
    for (const unsubscribe of this._subscriptions) unsubscribe()
  }
}

// ---------------------------------------------------------------------------------------------
// Injection: replace the installed plugin factory with this worktree's src/client.js
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
  window.__POWER_SUITE_TEST_HOOKS__ = {}
  // E2E-only instrumentation: stopImmediatePropagation() hides later listeners, so the
  // harness records preventDefault() calls to read a blocked event's defaultPrevented
  // after the fact. Scoped to this throwaway browser profile.
  window.__psaPreventedLog = []
  try {
    const originalPreventDefault = Event.prototype.preventDefault
    Event.prototype.preventDefault = function () {
      try {
        if (window.__psaPreventedLog.length < 500) window.__psaPreventedLog.push(this.type)
      } catch (error) { void error }
      return originalPreventDefault.apply(this, arguments)
    }
  } catch (error) { void error }
  // Bubble-phase contextmenu oracle (post-load recorders cannot see a blocked event because
  // the product stops immediate propagation at window capture).
  window.__psaMenuBubble = []
  window.addEventListener('contextmenu', (event) => {
    try {
      if (window.__psaMenuBubble.length < 20) window.__psaMenuBubble.push({ defaultPrevented: event.defaultPrevented })
    } catch (error) { void error }
  }, false)
  window.__psaResizeCount = 0
  window.addEventListener('resize', () => { window.__psaResizeCount += 1 })
  window.__psaSource = __PSA_SOURCE__
  init(window.__psaSource)
})()`

function injectorSource(clientSource) {
  // Function replacement avoids `$`-pattern expansion when the client source is large.
  return INJECT_SCRIPT.replace('__PSA_SOURCE__', () => JSON.stringify(clientSource))
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

  hasRow(id) {
    return this.rows.some((row) => row.id === id)
  }

  recordFailure(id, title, detail) {
    this.rows.push({ id, title, pass: false, detail, ms: 0 })
    log(`FAIL  ${id}  ${title} — ${short(detail, 400)}`)
  }

  get failures() {
    return this.rows.filter((row) => !row.pass)
  }
}

// ---------------------------------------------------------------------------------------------
// Page-side probes (kept as plain functions so they serialize cleanly)
// ---------------------------------------------------------------------------------------------

const pageProbe = {
  appReady: () =>
    document.readyState === 'complete' &&
    !!document.querySelector('[data-slot="main"]') &&
    window.__psInjectedFactoryRan === true,

  metrics: () => {
    const overlay = document.querySelector('[data-shell-overlay]')
    const frame = overlay && overlay.parentElement
    const main = document.querySelector('[data-slot="main"]')
    const chat = document.querySelector('[data-conversation-region="chat"]')
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      grid: frame ? frame.style.gridTemplateColumns : null,
      frameClass: frame ? String(frame.className) : null,
      hasOverlay: !!overlay,
      main: rect(main),
      chat: rect(chat),
      composer: rect(composer),
      sessionId: document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null,
      sessionRows: document.querySelectorAll('[data-row-key^="session:"]').length,
    }
  },

  /** Return the visible New Session button rect (the sidebar one), never the palette entry. */
  newSessionButton: () => {
    const candidates = [...document.querySelectorAll('button[aria-label="New session"]')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return { el, r, style }
      })
      .filter(({ r, style }) => {
        if (r.width <= 0 || r.height <= 0) return false
        if (style.display === 'none' || style.visibility === 'hidden') return false
        return r.left < 400 && r.top < 200 && r.right > 0 && r.bottom > 0
      })
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
    const hit = candidates[0]
    if (!hit) return null
    return {
      x: Math.round(hit.r.left + hit.r.width / 2),
      y: Math.round(hit.r.top + hit.r.height / 2),
      left: Math.round(hit.r.left),
      top: Math.round(hit.r.top),
      width: Math.round(hit.r.width),
      height: Math.round(hit.r.height),
    }
  },
}

// ---------------------------------------------------------------------------------------------
// Smoke checks (pipeline proof; independent of whether the feature exists yet)
// ---------------------------------------------------------------------------------------------

async function runSmoke({ page, results, state }) {
  log('\n=== Smoke: pipeline ===')
  await results.check('smoke-1', 'app loaded in headless Chrome', async () => {
    await page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready + factory injected' })
    const metrics = await page.eval(pageProbe.metrics)
    state.baseline = metrics
    assertEqual(metrics.viewport.width, VIEWPORT.width, 'viewport width')
    assertEqual(metrics.viewport.height, VIEWPORT.height, 'viewport height')
    assert(metrics.hasOverlay, 'shell overlay layer missing')
    assert(metrics.grid, 'layout frame grid style missing')
    return `grid ${short(metrics.grid, 60)}`
  })

  await results.check('smoke-2', 'plugin factory injected from local client.js', async () => {
    const probe = await page.evaluate(
      `({ injected: window.__psInjectedFactoryRan === true, swapped: !!(window.__psInject && window.__psInject.swapped), error: window.__psInject?.error || window.__psInjectBootError || null, errors: window.__psInjectErrors || [] })`
    )
    assert(probe.injected, 'wrapper factory never ran')
    assert(probe.swapped, `registration factory was not swapped (error: ${probe.error})`)
    assertEqual(probe.errors.length, 0, 'injection script errors')
    return 'wrapper ran with real ctx'
  })

  await results.check('smoke-3', 'frozen test seam exposes 31 keys incl. textDigest', async () => {
    const probe = await page.evaluate(
      `(() => { const flag = window.__POWER_SUITE_TEST_HOOKS__; const hook = flag && flag.uiAnnotation; return { flagType: typeof flag, hookType: typeof hook, keys: hook && typeof hook === 'object' ? Object.keys(hook) : [] } })()`
    )
    assertEqual(probe.flagType, 'object', 'test hook flag type')
    assertEqual(probe.hookType, 'object', 'hooks.uiAnnotation is not an object')
    assertEqual(probe.keys.length, 31, `frozen seam must expose exactly 31 keys (got ${probe.keys.length}: ${probe.keys.join(', ') || 'none'})`)
    assert(probe.keys.includes('textDigest'), `textDigest is missing from the seam (keys: ${probe.keys.join(', ')})`)
    state.hooks = probe.keys
    return `uiAnnotation seam: ${probe.keys.length} keys`
  })

  await results.check('smoke-4', 'blank session is opened/verified through the native flow', async () => {
    const metrics = await ensureBlankSession(page, state)
    return `blank session ${metrics.sessionId}, ${metrics.sessionRows} sidebar rows, ${state.blankStateSource || 'blank'}`
  })

  await results.check('smoke-5', 'screenshot round-trip produces 1728x900 PNG', async () => {
    const data = await page.screenshotBase64()
    const buffer = Buffer.from(data, 'base64')
    assert(buffer.length > 20000, `screenshot too small: ${buffer.length} bytes`)
    state.smokeShot = path.join(tmpdir(), 'psa-e2e-smoke.png')
    await writeFile(state.smokeShot, buffer)
    return `${buffer.length} bytes -> ${state.smokeShot}`
  })

  await results.check('smoke-6', 'feature surface: rail under shell overlay, one launcher, prompt rail hidden', async () => {
    const launcher = await page.findRect('[data-psa-launcher]')
    assert(launcher, 'launcher not found: the injected client does not mount the annotation surface')
    await page.clickAt(launcher.x, launcher.y)
    await page.waitFor(
      `document.documentElement.getAttribute('data-psa-active') === 'true' && !!document.querySelector('[data-psa-rail]')`,
      { timeout: 8000, label: 'mode active for the surface check' }
    )
    await sleep(350)
    const probe = await page.evaluate(`(() => {
      const overlay = document.querySelector('[data-shell-overlay]')
      const rail = document.querySelector('[data-psa-rail]')
      const psp = document.querySelector('[data-psp-rail]')
      const style = document.querySelector('style[data-power-suite-css="ui-annotation"]')
      return {
        railInOverlay: overlay !== null && rail !== null && overlay.contains(rail),
        launchers: document.querySelectorAll('[data-psa-launcher]').length,
        pspRail: psp !== null,
        pspDisplay: psp !== null ? getComputedStyle(psp).display : null,
        stylesheetHasPromptRailRule: style !== null && typeof style.textContent === 'string'
          ? style.textContent.includes('[data-psp-rail]') : false,
      }
    })()`)
    const exit = await page.findRect('[data-psa-exit]')
    if (exit !== null) await page.clickAt(exit.x, exit.y)
    else await page.pressKey('escape')
    await page.waitFor(
      `document.documentElement.getAttribute('data-psa-active') === null`,
      { timeout: 8000, label: 'mode off after the surface check' }
    )
    await sleep(250)
    assert(probe.railInOverlay, 'the annotation rail is not a descendant of [data-shell-overlay]')
    assertEqual(probe.launchers, 1, `expected exactly one launcher, got ${probe.launchers}`)
    assert(probe.stylesheetHasPromptRailRule, 'annotation stylesheet is missing the hidden prompt-history rail rule')
    if (probe.pspRail) {
      assertEqual(probe.pspDisplay, 'none', 'the native prompt-history rail is visible while the mode is active')
    }
    return `rail inside [data-shell-overlay], launcher ×${probe.launchers}, prompt rail ${probe.pspRail ? `display=${probe.pspDisplay}` : 'absent (hidden rule present)'}`
  })
}

// ---------------------------------------------------------------------------------------------
// Acceptance run: page-side probes (plain functions, serialized into the live page)
// ---------------------------------------------------------------------------------------------

const probes = {
  installPrivacyStyle: () => {
    if (document.getElementById('psa-e2e-privacy-style') !== null) return true
    const style = document.createElement('style')
    style.id = 'psa-e2e-privacy-style'
    style.textContent =
      'html.psa-e2e-privacy [class$="_sidebarCol"] { filter: blur(7px) !important; }' +
      'html.psa-e2e-privacy [data-slot="conversation.header"] { filter: blur(6px) !important; }'
    document.head.appendChild(style)
    return true
  },

  /**
   * Apply the privacy guard: CSS blur on the native sidebar and conversation header, plus a
   * blur/hide shield over the conversation content above the composer. The composer (and the
   * annotation rail/popover, which live in the shell overlay above the shield) stays crisp.
   * @returns {object} the applied geometry for assertions.
   */
  privacyApply: () => {
    document.documentElement.classList.add('psa-e2e-privacy')
    let shield = document.getElementById('psa-e2e-privacy-shield')
    if (shield === null) {
      shield = document.createElement('div')
      shield.id = 'psa-e2e-privacy-shield'
      document.body.appendChild(shield)
    }
    const sidebar = document.querySelector('[class$="_sidebarCol"]')
    const rail = document.querySelector('[data-psa-rail]')
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const sidebarRight = sidebar !== null ? Math.round(sidebar.getBoundingClientRect().right) : 0
    const railLeft = rail !== null ? Math.round(rail.getBoundingClientRect().left) : innerWidth
    const composerTop = composer !== null ? Math.round(composer.getBoundingClientRect().top) : innerHeight
    const width = Math.max(0, railLeft - sidebarRight)
    const height = Math.max(0, composerTop)
    // Theme-matched frosted shield: use the conversation surface colour with high alpha so the
    // masked content is unreadable while the capture still looks like a deliberate panel
    // (dark theme is the primary visual reference).
    let background = 'rgba(20, 22, 28, 0.9)'
    for (const element of [document.querySelector('[data-conversation-region="chat"]'), document.querySelector('[data-slot="main"]'), document.body]) {
      if (element === null) continue
      const computed = getComputedStyle(element).backgroundColor || ''
      const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(computed)
      if (match === null) continue
      const alpha = match[4] === undefined ? 1 : Number(match[4])
      if (alpha < 0.5) continue
      background = `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0.9)`
      break
    }
    Object.assign(shield.style, {
      position: 'fixed',
      left: `${sidebarRight}px`,
      top: '0px',
      width: `${width}px`,
      height: `${height}px`,
      background,
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      pointerEvents: 'none',
      zIndex: '18',
    })
    shield.setAttribute('data-psa-e2e-privacy-shield', '')
    return { sidebarRight, railLeft, composerTop, width, height }
  },

  privacyRemove: () => {
    document.documentElement.classList.remove('psa-e2e-privacy')
    const shield = document.getElementById('psa-e2e-privacy-shield')
    if (shield !== null) shield.remove()
    return true
  },

  /** Assertable privacy state: both CSS blurs and the content shield must be in effect. */
  privacyState: () => {
    const shield = document.getElementById('psa-e2e-privacy-shield')
    const sidebar = document.querySelector('[class$="_sidebarCol"]')
    const header = document.querySelector('[data-slot="conversation.header"]')
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const shieldRect = shield !== null ? shield.getBoundingClientRect() : null
    const shieldStyle = shield !== null ? getComputedStyle(shield) : null
    return {
      classOn: document.documentElement.classList.contains('psa-e2e-privacy'),
      shield: shield !== null,
      shieldBottom: shieldRect !== null ? Math.round(shieldRect.bottom) : null,
      shieldBackdrop: shieldStyle !== null ? (shieldStyle.backdropFilter || shieldStyle.webkitBackdropFilter || null) : null,
      sidebarFilter: sidebar !== null ? getComputedStyle(sidebar).filter : null,
      headerFilter: header !== null ? getComputedStyle(header).filter : null,
      composerTop: composer !== null ? Math.round(composer.getBoundingClientRect().top) : null,
      composerFilter: composer !== null ? getComputedStyle(composer).filter : null,
    }
  },

  frame: () => {
    const overlay = document.querySelector('[data-shell-overlay]')
    const frame = overlay !== null ? overlay.parentElement : null
    const rectOf = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    return {
      htmlActive: document.documentElement.getAttribute('data-psa-active'),
      htmlPassThrough: document.documentElement.getAttribute('data-psa-passthrough'),
      grid: frame !== null ? frame.style.gridTemplateColumns : null,
      paddingRight: frame !== null ? frame.style.paddingRight : null,
      railWidthVar: frame !== null ? frame.style.getPropertyValue('--psa-rail-width') : null,
      frameMarker: frame !== null ? frame.getAttribute('data-psa-frame') : null,
      main: rectOf(document.querySelector('[data-slot="main"]')),
      canvas: rectOf(document.querySelector('[data-conversation-content]')),
      chat: rectOf(document.querySelector('[data-conversation-region="chat"]')),
      sidebarCol: rectOf(document.querySelector('[class$="_sidebarCol"]')),
      composerRegion: rectOf(document.querySelector('[data-conversation-region="composer"]')),
      rail: rectOf(document.querySelector('[data-psa-rail]')),
      railCollapsed: document.querySelector('[data-psa-rail]')?.getAttribute('data-psa-collapsed') ?? null,
      railMode: document.querySelector('[data-psa-rail]')?.getAttribute('data-psa-mode') ?? null,
      railChildCount: document.querySelector('[data-psa-rail]')?.childElementCount ?? null,
      railPanelCount: document.querySelectorAll('[data-psa-rail-panel]').length,
      panel: document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') ?? null,
      railHtml: (document.querySelector('[data-psa-rail]')?.innerHTML || '').slice(0, 300),
      viewport: { width: innerWidth, height: innerHeight },
      sessionId: document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null,
      sessionRows: document.querySelectorAll('[data-row-key^="session:"]').length,
    }
  },

  launcherRect: () => {
    const element = document.querySelector('[data-psa-launcher]')
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  },

  ui: () => {
    const panel = document.querySelector('[data-psa-rail-panel]')
    const launcher = document.querySelector('[data-psa-launcher]')
    return {
      launcher: launcher !== null,
      launcherActive: launcher !== null ? launcher.getAttribute('data-psa-active') : null,
      rail: !!document.querySelector('[data-psa-rail]'),
      panel: panel !== null ? panel.getAttribute('data-psa-rail-panel') : null,
      panelText: panel !== null ? (panel.innerText || '').replace(/\s+/g, ' ').trim() : '',
      popover: !!document.querySelector('[data-psa-popover]'),
      hover: !!document.querySelector('[data-psa-hover]'),
      selection: document.querySelectorAll('[data-psa-selection]').length,
      multi: document.querySelectorAll('[data-psa-multi-outline]').length,
      box: !!document.querySelector('[data-psa-box]'),
      entries: document.querySelectorAll('[data-psa-entry]').length,
      empty: !!document.querySelector('[data-psa-empty]'),
      feedback: document.querySelector('[data-psa-feedback]')?.innerText ?? null,
    }
  },

  popover: () => {
    const popover = document.querySelector('[data-psa-popover]')
    if (popover === null) return null
    return {
      title: document.querySelector('[data-psa-popover-title]')?.innerText ?? null,
      ref: document.querySelector('[data-psa-popover-ref]')?.innerText ?? null,
      status: document.querySelector('[data-psa-popover-status]')?.getAttribute('data-psa-status') ?? null,
      note: document.querySelector('[data-psa-note]')?.value ?? null,
      addLabel: (document.querySelector('[data-psa-add]')?.innerText || '').trim(),
      quickRef: !!document.querySelector('[data-psa-quick-ref]'),
    }
  },

  entries: () => [...document.querySelectorAll('[data-psa-entry]')].map((element) => ({
    ref: element.getAttribute('data-psa-ref'),
    scope: element.getAttribute('data-psa-entry-scope'),
    status: element.getAttribute('data-psa-status'),
    note: element.querySelector('[data-psa-entry-note]')?.value ?? '',
    name: (element.querySelector('.psa-entry-name')?.innerText || '').trim(),
    locator: (element.querySelector('.psa-entry-locator')?.innerText || '').trim(),
    text: (element.innerText || '').replace(/\s+/g, ' ').trim(),
  })),

  composer: () => {
    const region = document.querySelector('[data-conversation-region="composer"]')
    const editor = region !== null ? region.querySelector('[data-lexical-editor="true"]') : null
    const rectOf = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    return {
      text: editor !== null ? (editor.innerText || '') : null,
      focused: editor !== null && document.activeElement === editor,
      region: rectOf(region),
      editor: rectOf(editor),
    }
  },

  transcript: () => ({
    messages: document.querySelectorAll('[data-message-id]').length,
    turns: document.querySelectorAll('[data-turn-id]').length,
    chatChildren: document.querySelector('[data-conversation-region="chat"]')?.childElementCount ?? 0,
  }),

  mainText: () => (document.querySelector('[data-slot="main"]')?.innerText || '').replace(/\s+/g, ' ').trim(),

  // Native page elements outside the composer (our own annotation surface and transient
  // feedback are excluded: they are expected UI, not page mutations).
  nonComposerElementCount: () => [...document.querySelectorAll('*')]
    .filter((element) => element.closest('[data-conversation-region="composer"]') === null)
    .filter((element) => element.closest('[data-psa-own]') === null).length,

  modeOverlayNodeCount: () => ['[data-psa-rail]', '[data-psa-popover]', '[data-psa-layer]', '[data-psa-box]',
    '[data-psa-hover]', '[data-psa-selection]', '[data-psa-multi-outline]', '[data-psa-feedback]',
    '[data-psa-entry-note-editor]'].reduce((total, selector) => total + document.querySelectorAll(selector).length, 0),

  pluginNavRect: () => {
    for (const button of document.querySelectorAll('button')) {
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      const text = (button.innerText || '').trim()
      if (rect.width < 100 || rect.height < 20) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (rect.left > 400 || rect.top < 0 || rect.bottom > innerHeight) continue
      if (!/^(Plugins|插件)$/i.test(text)) continue
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      }
    }
    return null
  },

  buttonAriaRect: (label) => {
    for (const button of document.querySelectorAll('button')) {
      if (button.getAttribute('aria-label') !== label) continue
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      if (rect.width <= 0 || rect.height <= 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (rect.top < 0 || rect.bottom > innerHeight) continue
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    return null
  },

  sessionRowPoint: (sessionId) => {
    const exact = sessionId === null
      ? null
      : document.querySelector(`[data-row-key="session:${sessionId}"]`)
    const element = exact !== null ? exact : document.querySelector('[data-row-key^="session:"]')
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      // The left edge of the row avoids the row's inner "open" button so the row itself
      // (data-row-key) becomes the annotation candidate.
      x: Math.round(rect.left + 12),
      y: Math.round(rect.top + rect.height / 2),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    }
  },

  workspaceRowPoint: () => {
    for (const element of document.querySelectorAll('[data-row-key^="workspace:"]')) {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (rect.width <= 0 || rect.height <= 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (rect.left > 400 || rect.top < 0 || rect.bottom > innerHeight) continue
      return {
        x: Math.round(rect.left + 14),
        y: Math.round(rect.top + rect.height / 2),
        key: element.getAttribute('data-row-key'),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      }
    }
    return null
  },

  sidebarState: () => ({
    collapseButtons: document.querySelectorAll('button[aria-label="Collapse sidebar"]').length,
    openButtons: document.querySelectorAll('button[aria-label="Open sidebar"]').length,
    sidebarColWidth: (() => {
      const col = document.querySelector('[class$="_sidebarCol"]')
      if (col === null) return null
      return Math.round(col.getBoundingClientRect().width)
    })(),
    grid: (() => {
      const overlay = document.querySelector('[data-shell-overlay]')
      const frame = overlay !== null ? overlay.parentElement : null
      return frame !== null ? frame.style.gridTemplateColumns : null
    })(),
  }),

  launcherCenterCover: () => {
    const launcher = document.querySelector('[data-psa-launcher]')
    if (launcher === null) return { launcher: false, cover: null }
    const rect = launcher.getBoundingClientRect()
    const x = Math.round(rect.left + rect.width / 2)
    const y = Math.round(rect.top + rect.height / 2)
    const hit = document.elementFromPoint(x, y)
    if (hit === null) return { launcher: true, cover: null }
    const inside = hit === launcher || launcher.contains(hit)
    return {
      launcher: true,
      inside,
      cover: inside ? null : `${hit.tagName}${hit.className ? '.' + String(hit.className).slice(0, 40) : ''}`,
    }
  },



  /** Blank-session predicate: no messages, empty composer draft, no draft attachments. */
  blankCheck: () => {
    const session = document.querySelector('[data-conversation-session]')
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const editor = composer !== null ? composer.querySelector('[data-lexical-editor="true"]') : null
    const messages = document.querySelectorAll('[data-message-id]').length
    const turns = document.querySelectorAll('[data-turn-id]').length
    const draft = editor !== null ? (editor.innerText || '').trim() : ''
    const editorImages = editor !== null ? editor.querySelectorAll('img').length : 0
    const attachmentNodes = composer !== null
      ? [...composer.querySelectorAll('img, [data-attachment], [data-attachment-id], [class*="attachment" i]')].length
      : 0
    const sessionId = session !== null ? session.getAttribute('data-conversation-session') : null
    const ok = sessionId !== null && messages === 0 && turns === 0 && draft === ''
      && editorImages === 0 && attachmentNodes === 0
    return {
      ok,
      sessionId,
      messages,
      turns,
      draft,
      editorImages,
      attachments: attachmentNodes,
      composerFound: composer !== null,
      editorFound: editor !== null,
    }
  },

  /** Visible workspace rows in the sidebar ACTIVE PROJECTS list. */
  workspaceRows: () => [...document.querySelectorAll('[data-row-key^="workspace:"]')]
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        key: element.getAttribute('data-row-key'),
        text: (element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        x: Math.round(rect.left + 14),
        y: Math.round(rect.top + rect.height / 2),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      }
    })
    .filter((row) => row.bottom > 0 && row.top < innerHeight && row.right > 0 && row.left < 400),

  /** Visible scrollable container that holds the workspace rows (sidebar session/workspace list). */
  workspaceScrollPoint: () => {
    const row = document.querySelector('[data-row-key^="workspace:"]')
    if (row === null) return null
    let element = row.parentElement
    while (element !== null && element !== document.body) {
      const style = getComputedStyle(element)
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 20) {
        const rect = element.getBoundingClientRect()
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(Math.min(rect.bottom - 30, Math.max(rect.top + 30, rect.top + rect.height / 2))),
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        }
      }
      element = element.parentElement
    }
    return null
  },

  /** Visible recent-session rows (their native hover actions create sessions in that directory). */
  recentSessionRows: () => [...document.querySelectorAll('button[aria-label^="Open "]')]
    .map((button) => {
      const rect = button.getBoundingClientRect()
      let hoverRow = button
      while (hoverRow.parentElement !== null && hoverRow.getAttribute('data-row-key') === null && hoverRow !== document.body) {
        hoverRow = hoverRow.parentElement
      }
      const rowRect = hoverRow.getBoundingClientRect()
      return {
        label: button.getAttribute('aria-label'),
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        top: Math.round(rowRect.top),
        bottom: Math.round(rowRect.bottom),
        left: Math.round(rect.left),
      }
    })
    .filter((row) => row.bottom > 0 && row.top < innerHeight && row.left < 400),

  /** The native "New session in ..." hover action belonging to one hovered row. */
  newSessionActionNear: (row) => {
    for (const button of document.querySelectorAll('button[aria-label^="New session in"]')) {
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      if (rect.width <= 0 || rect.height <= 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const centerY = rect.top + rect.height / 2
      const insideRow = centerY >= row.top - 16 && centerY <= row.bottom + 16
      if (!insideRow) continue
      return {
        label: button.getAttribute('aria-label'),
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(centerY),
      }
    }
    return null
  },

  /** The visible "New session in ..." action whose centre is vertically nearest to `y`. */
  nearestNewSessionAction: (y) => {
    let best = null
    for (const button of document.querySelectorAll('button[aria-label^="New session in"]')) {
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      if (rect.width <= 0 || rect.height <= 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (rect.top < 0 || rect.bottom > innerHeight) continue
      const centerY = rect.top + rect.height / 2
      const distance = Math.abs(centerY - y)
      if (best === null || distance < best.distance) {
        best = {
          label: button.getAttribute('aria-label'),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(centerY),
          distance,
        }
      }
    }
    return best
  },

  /** Remove the annotation mode's browser-owned keys so the default launcher position is used. */
  clearAnnotationStorage: () => {
    const keys = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (typeof key === 'string' && key.startsWith('power-suite.ui-annotation.')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
    return keys
  },

  /** Launcher/rail/footer geometry used by the screenshot assertions. */
  railFooterState: () => {
    const launcher = document.querySelector('[data-psa-launcher]')
    const rail = document.querySelector('[data-psa-rail]')
    const footer = rail !== null ? rail.querySelector('.psa-rail-footer') : null
    const rectOf = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    const launcherRect = rectOf(launcher)
    const railRect = rectOf(rail)
    const footerRect = rectOf(footer)
    const intersects = (left, right) => left !== null && right !== null
      && left.left < right.right && right.left < left.right
      && left.top < right.bottom && right.top < left.bottom
    return {
      launcher: launcherRect,
      rail: railRect,
      footer: footerRect,
      overlapsFooter: intersects(launcherRect, footerRect),
      overlapsRail: intersects(launcherRect, railRect),
      viewport: { width: innerWidth, height: innerHeight },
    }
  },

  installScrollProbe: () => {
    const collect = (root, kind) => {
      const found = []
      if (root === null) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.closest('[data-psa-own]') !== null) continue
        const rect = element.getBoundingClientRect()
        if (rect.width < 60 || rect.height < 60) continue
        if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) continue
        const style = getComputedStyle(element)
        if (!/(auto|scroll)/.test(style.overflowY)) continue
        if (element.scrollHeight - element.clientHeight < 40) continue
        found.push({ element, kind })
      }
      return found
    }
    const conversation = collect(document.querySelector('[data-conversation-region="chat"]'), 'conversation')
    const sidebar = collect(document.querySelector('[data-slot="sidebar"]'), 'sidebar')
    const candidates = [...conversation, ...sidebar]
    if (candidates.length === 0) return null
    candidates.sort((left, right) => {
      const deltaLeft = left.element.scrollHeight - left.element.clientHeight
      const deltaRight = right.element.scrollHeight - right.element.clientHeight
      if (deltaLeft !== deltaRight) return deltaRight - deltaLeft
      return left.kind === 'conversation' ? -1 : 1
    })
    const chosen = candidates.find((candidate) => candidate.kind === 'conversation') || candidates[0]
    window.__psaScrollProbe = chosen.element
    const rect = chosen.element.getBoundingClientRect()
    return {
      kind: chosen.kind,
      conversationScrollable: conversation.length > 0,
      sidebarScrollable: sidebar.length > 0,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      scrollTop: chosen.element.scrollTop,
      scrollHeight: chosen.element.scrollHeight,
      clientHeight: chosen.element.clientHeight,
    }
  },

  readScrollProbe: () => {
    const element = window.__psaScrollProbe
    if (!element) return { scrollTop: null }
    return { scrollTop: element.scrollTop }
  },

  installElementProbe: (selector) => {
    window.__psaElementProbe = { selector, hits: 0, events: [], targets: 0 }
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (rect.width <= 0 || rect.height <= 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      window.__psaElementProbe.targets += 1
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'click']) {
        element.addEventListener(type, (event) => {
          window.__psaElementProbe.hits += 1
          if (window.__psaElementProbe.events.length < 16) {
            window.__psaElementProbe.events.push(`${type}:${event.defaultPrevented ? 'prevented' : 'native'}`)
          }
        }, true)
      }
    }
    return window.__psaElementProbe
  },

  readElementProbe: () => window.__psaElementProbe || null,

  installContextProbe: (selector) => {
    window.__psaContextProbe = { hits: 0, prevented: [] }
    const element = document.querySelector(selector)
    if (element === null) return window.__psaContextProbe
    element.addEventListener('contextmenu', (event) => {
      window.__psaContextProbe.hits += 1
      window.__psaContextProbe.prevented.push(event.defaultPrevented)
    }, true)
    return window.__psaContextProbe
  },

  readContextProbe: () => window.__psaContextProbe || null,

  installKeyRecorder: () => {
    if (window.__psaKeyRecorderInstalled === true) return true
    window.__psaKeyRecorderInstalled = true
    window.__psaKeyLog = []
    window.addEventListener('keydown', (event) => {
      if (window.__psaKeyLog.length >= 60) return
      window.__psaKeyLog.push({
        key: event.key,
        code: event.code,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
      })
    })
    return true
  },

  readKeyLog: () => window.__psaKeyLog || [],

  clearKeyLog: () => {
    window.__psaKeyLog = []
    return true
  },

  popoverRect: () => {
    const element = document.querySelector('[data-psa-popover]')
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewport: { width: innerWidth, height: innerHeight },
    }
  },

  clearPreventedLog: () => {
    window.__psaPreventedLog = []
    return true
  },

  clearMenuBubble: () => {
    window.__psaMenuBubble = []
    return true
  },

  readMenuBubble: () => window.__psaMenuBubble || [],

  countPrevented: (type) => (window.__psaPreventedLog || []).filter((entry) => entry === type).length,
}

// ---------------------------------------------------------------------------------------------
// Harness: real-input helpers over one live page
// ---------------------------------------------------------------------------------------------

class Harness {
  constructor(page, state) {
    this.page = page
    this.state = state
  }

  // ---- queries ---------------------------------------------------------------------------

  frame() { return this.page.eval(probes.frame) }
  ui() { return this.page.eval(probes.ui) }
  popover() { return this.page.eval(probes.popover) }
  entries() { return this.page.eval(probes.entries) }
  composer() { return this.page.eval(probes.composer) }
  transcript() { return this.page.eval(probes.transcript) }
  mainText() { return this.page.eval(probes.mainText) }
  launcherRect() { return this.page.eval(probes.launcherRect) }

  async refreshSession() {
    const frame = await this.frame()
    if (frame.sessionId !== null) this.state.sessionId = frame.sessionId
    return frame.sessionId
  }

  waitFor(expression, opts = {}) {
    return this.page.waitFor(expression, opts)
  }

  // ---- real input --------------------------------------------------------------------------

  async click(selector, options = {}) {
    const rect = await this.page.findRect(selector)
    assert(rect, `no visible element for real click: ${selector}`)
    await this.page.clickAt(rect.x, rect.y, options)
    await sleep(140)
    return rect
  }

  async clickByText(scopeSelector, pattern, options = {}) {
    const rect = await this.page.eval((scope, source) => {
      const matcher = new RegExp(source)
      const root = scope === null ? document : document.querySelector(scope)
      if (root === null) return null
      for (const button of root.querySelectorAll('button')) {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        if (rect.width <= 0 || rect.height <= 0) continue
        if (style.display === 'none' || style.visibility === 'hidden') continue
        if (rect.top < 0 || rect.bottom > innerHeight) continue
        const text = (button.innerText || '').trim()
        const label = button.getAttribute('aria-label') || ''
        if (matcher.test(text) || matcher.test(label)) {
          return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          }
        }
      }
      return null
    }, scopeSelector, pattern.source)
    assert(rect, `no visible button matching ${pattern} inside ${scopeSelector || 'the page'}`)
    await this.page.clickAt(rect.x, rect.y, options)
    await sleep(140)
    return rect
  }

  async nativeNewSessionRect() {
    return this.page.eval(pageProbe.newSessionButton)
  }

  async clickNativeNewSession(options = {}) {
    const rect = await this.nativeNewSessionRect()
    assert(rect, 'native New Session button not found')
    await this.page.clickAt(rect.x, rect.y, options)
    return rect
  }

  async selectElement(selector) {
    const rect = await this.page.findRect(selector)
    assert(rect, `no visible element to select: ${selector}`)
    await this.page.clickAt(rect.x, rect.y)
    await sleep(320)
    return rect
  }

  // ---- mode / view state --------------------------------------------------------------------

  async activate() {
    const active = await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    if (active) return false
    const rect = await this.page.findRect('[data-psa-launcher]')
    assert(rect, 'launcher not found for activation')
    await this.page.clickAt(rect.x, rect.y)
    await this.page.waitFor(
      `document.documentElement.getAttribute('data-psa-active') === 'true' && !!document.querySelector('[data-psa-rail]')`,
      { timeout: 8000, label: 'annotation mode active' }
    )
    await sleep(400)
    return true
  }

  async exit() {
    const active = await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    if (!active) return false
    if ((await this.page.count('[data-psa-exit]')) > 0) await this.click('[data-psa-exit]')
    else await this.page.pressKey('escape')
    await this.page.waitFor(
      `document.documentElement.getAttribute('data-psa-active') === null`,
      { timeout: 8000, label: 'annotation mode off' }
    )
    await sleep(350)
    return true
  }

  async ensureModeOn() {
    const active = await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    if (!active) await this.activate()
    return true
  }

  async ensureModeOff() {
    const active = await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    if (active) await this.exit()
    return true
  }

  async ensureConversation() {
    const has = await this.page.evaluate(`!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`)
    if (has) {
      const sessionId = await this.refreshSession()
      this.track(sessionId, 'current-conversation')
      return true
    }
    await this.clickNativeNewSession()
    await this.page.waitFor(
      `!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`,
      { timeout: 20000, label: 'conversation composer' }
    )
    await sleep(400)
    const sessionId = await this.refreshSession()
    this.track(sessionId, 'native-new-session')
    return true
  }

  async ensurePluginsView() {
    const text = await this.mainText()
    if (/^(Plugins|插件)\b/.test(text)) return true
    const rect = await this.page.eval(probes.pluginNavRect)
    assert(rect, 'native Plugins navigation button not found')
    await this.page.clickAt(rect.x, rect.y)
    await this.page.waitFor(
      `/^(Plugins|插件)/.test((document.querySelector('[data-slot="main"]')?.innerText || '').replace(/\\s+/g, ' ').trim())`,
      { timeout: 8000, label: 'Plugins page' }
    )
    await sleep(400)
    return true
  }

  async openCollection() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ui = await this.ui()
      if (ui.panel === 'collection') return true
      const rect = await this.page.findRect('[data-psa-open-collection]')
      assert(rect, 'no visible collection switch button')
      await this.page.clickAt(rect.x, rect.y)
      await sleep(250)
      try {
        await this.page.waitFor(
          `document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') === 'collection'`,
          { timeout: 2000, label: 'collection rail panel' }
        )
        await sleep(150)
        return true
      } catch {
        // The rail may have re-rendered between the rect read and the click; retry.
      }
    }
    throw new Error('the collection rail panel did not open after 3 real clicks')
  }

  async clickBack() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rect = await this.clickByText('[data-psa-rail]', /^(Back|返回)$/)
      try {
        await this.page.waitFor(
          `document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') === 'status'`,
          { timeout: 2000, label: 'status rail panel' }
        )
        await sleep(150)
        return rect
      } catch {
        // retry: the rail may have re-rendered between the lookup and the click
      }
    }
    throw new Error('the rail did not return to the status view after 3 real clicks')
  }

  /** Wait until the launcher's centre actually receives pointer input (no overlay covering it). */
  async ensureLauncherClickable(timeout = 4000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const cover = await this.page.eval(probes.launcherCenterCover)
      if (cover.launcher === true && cover.inside === true) return true
      await sleep(150)
    }
    const cover = await this.page.eval(probes.launcherCenterCover)
    return cover.launcher === true && cover.inside === true
  }

  /** Expand a collapsed native sidebar (mode off: native click; mode on: pass-through). */
  async ensureSidebarExpanded() {
    const open = await this.page.eval(probes.buttonAriaRect, 'Open sidebar')
    if (open === null) return false
    const active = await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    if (active) {
      await this.page.keyDown('alt')
      try {
        await this.page.clickAt(open.x, open.y, { modifiers: MOD.alt })
      } finally {
        await this.page.keyUp('alt')
      }
    } else {
      await this.page.clickAt(open.x, open.y)
    }
    await this.page.waitFor(
      `!!document.querySelector('button[aria-label="Collapse sidebar"]')`,
      { timeout: 6000, label: 'sidebar expanded' }
    ).catch(() => {})
    await sleep(300)
    return true
  }

  async ensureStatusPanel() {
    const ui = await this.ui()
    if (ui.panel === null || ui.panel === 'status') return true
    await this.clickBack()
    return true
  }

  async clearSelection() {
    const ui = await this.ui()
    if (!ui.popover && ui.selection === 0 && ui.multi === 0) return false
    await this.page.pressKey('escape')
    await sleep(280)
    return true
  }

  /** Track every session this run opens or creates (H2). */
  track(sessionId, source) {
    return trackSession(this.state, sessionId, source)
  }

  /** Read the blank-session predicate for the current session. */
  blankState() {
    return this.page.eval(probes.blankCheck)
  }

  /** Refuse to type/insert into a session that is not verified blank (H2). */
  async assertBlankForInput(label) {
    const blank = await this.blankState()
    assert(
      blank.ok,
      `refusing to type/insert into a non-blank session (${label}): ` +
        `session=${blank.sessionId} messages=${blank.messages} turns=${blank.turns} ` +
        `draft=${JSON.stringify(blank.draft)} editorImages=${blank.editorImages} attachments=${blank.attachments}`
    )
    this.track(blank.sessionId, 'blank-session')
    return blank
  }

  /** Create a genuinely new blank session through the native hover action (H2). */
  async createBlankSessionViaHover() {
    const blank = await createBlankSessionViaHover(this.page, this.state)
    this.state.sessionId = blank.sessionId
    return blank
  }
}

// ---------------------------------------------------------------------------------------------
// Acceptance scenarios (CONTRACT.md section 4.2)
// ---------------------------------------------------------------------------------------------

const SCENARIO_TITLES = {
  1: 'activate mode via real launcher click: shrink + rail; native New Session blocked',
  2: 'Alt pass-through: native New Session works, native context menu not prevented',
  3: 'wheel scrolling works, shortcuts not consumed, Esc ladder steps out',
  4: 'multi-select via Shift+click; collection add/update/note/remove',
  5: 'batch insert: order, existing draft preserved, not sent, composer focused',
  6: 'session scope: stale target marked + cross-session entries skipped, no DOM mutation',
  7: 'exit mode: markers/padding cleaned, native clicks work again, launcher stays',
  8: 'launcher drag clamp, viewport resize, scroll stability, reload default + position memory',
  9: 'collection view keeps the frame/rail geometry; exit restores the baseline layout',
}

const SCENARIO_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function buildScenarios(harness) {
  const h = harness
  return {
    1: async () => {
      await h.ensureModeOff()
      await h.ensurePluginsView()
      const baseline = await h.frame()
      assertEqual(baseline.htmlActive, null, 'mode should be off before the scenario starts')
      await h.activate()
      const frame = await h.frame()
      const railWidth = Number.parseFloat(frame.railWidthVar || '0')
      const padding = Number.parseFloat(frame.paddingRight || '0')
      assert(frame.rail !== null, 'rail is missing after activation')
      assertEqual(frame.htmlActive, 'true', 'html[data-psa-active] marker')
      assertEqual(frame.frameMarker, 'true', 'frame[data-psa-frame] marker')
      assert(railWidth >= 188 && railWidth <= 236, `rail width ${railWidth}px outside the 188..236 contract range`)
      assertNear(padding, railWidth, 2, 'frame padding-right vs computed rail width')
      assertEqual(frame.grid, baseline.grid, 'inline grid-template-columns must stay untouched')
      assert(frame.rail.width <= railWidth + 2, `rail is ${frame.rail.width}px wide, reserved ${railWidth}px`)
      assertNear(frame.rail.x + frame.rail.width, frame.viewport.width, 2, 'rail right edge must equal the viewport width (right-anchored)')
      assertNear(frame.rail.x, frame.viewport.width - railWidth, 2, 'rail left edge must sit at viewportWidth - railWidth')
      assert(
        frame.rail.x >= frame.viewport.width - railWidth - 3,
        `rail does not sit in the freed right strip (rail.x=${frame.rail.x}, viewport=${frame.viewport.width})`
      )
      // Blocked native New Session: real click must not reach the native handlers.
      const probeInfo = await h.page.eval(probes.installElementProbe, 'button[aria-label="New session"]')
      assert(probeInfo.targets > 0, 'native New Session button not found for the blocked-click probe')
      await h.page.eval(probes.clearPreventedLog)
      const sessionsBefore = { sessionId: frame.sessionId, rows: frame.sessionRows }
      await h.clickNativeNewSession()
      await sleep(450)
      const after = await h.frame()
      const probe = await h.page.eval(probes.readElementProbe)
      const preventedPointers = await h.page.eval(probes.countPrevented, 'pointerdown')
      const preventedClicks = await h.page.eval(probes.countPrevented, 'click')
      assertEqual(probe.hits, 0, 'the blocked New Session event reached the native button listeners')
      assert(preventedPointers + preventedClicks >= 1, 'the blocked events were not preventDefault()-ed')
      assertEqual(after.sessionId, sessionsBefore.sessionId, 'the blocked New Session click changed the session id')
      assertEqual(after.sessionRows, sessionsBefore.rows, 'the blocked New Session click changed the session row count')
      const afterText = await h.mainText()
      assert(/^(Plugins|插件)/.test(afterText), `the blocked New Session click left the Plugins page: ${short(afterText, 180)}`)
      assertEqual(after.sessionId, null, 'the blocked New Session click opened a conversation')
      return `rail ${railWidth}px, padding ${padding}px, blocked click: 0 native hits / ${preventedPointers + preventedClicks} prevented events, view stayed on Plugins`
    
    },

    2: async () => {
      await h.ensureModeOn()
      await h.clearSelection()
      const before = await h.frame()
      assertEqual(before.htmlActive, 'true', 'mode must still be on')
      assertEqual(before.sessionId, null, 'the Plugins view (no conversation) is the pass-through precondition')
      const probeInfo = await h.page.eval(probes.installElementProbe, 'button[aria-label="New session"]')
      assert(probeInfo.targets > 0, 'native New Session button not found for the pass-through probe')
      await h.page.eval(probes.clearPreventedLog)
      await h.page.keyDown('alt')
      let sessionAfterNative = null
      try {
        await h.clickNativeNewSession({ modifiers: MOD.alt })
        await h.page.waitFor(
          `!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`,
          { timeout: 10000, label: 'native New Session under the pass-through modifier' }
        )
        sessionAfterNative = await h.refreshSession()
      } finally {
        await h.page.keyUp('alt')
      }
      await sleep(350)
      const probe = await h.page.eval(probes.readElementProbe)
      assert(probe.hits > 0, 'the Alt click never reached the native New Session button')
      assert(probe.events.every((entry) => !entry.endsWith('prevented')), `pass-through events were prevented: ${probe.events.join(',')}`)
      assert(sessionAfterNative !== null, 'native New Session under Alt did not open a conversation')
      h.track(sessionAfterNative, 'native-new-session-under-pass-through')
      // Native context menu: defaultPrevented true while blocked, false under the modifier.
      const chat = (await h.frame()).chat
      const point = {
        x: chat !== null ? chat.x + Math.round(chat.width / 2) : 900,
        y: chat !== null ? chat.y + Math.round(chat.height / 2) : 400,
      }
      await h.page.eval(probes.installContextProbe, '[data-conversation-region="chat"]')
      await h.page.eval(probes.clearPreventedLog)
      await h.page.rightClickAt(point.x, point.y, {})
      await sleep(250)
      const plainPrevented = await h.page.eval(probes.countPrevented, 'contextmenu')
      const plainProbe = await h.page.eval(probes.readContextProbe)
      const plainBubble = await h.page.eval(probes.readMenuBubble)
      // The pass-through marker must track the held modifier.
      assertEqual((await h.frame()).htmlPassThrough, null, 'html[data-psa-passthrough] leaked after the Alt click')
      await h.page.eval(probes.clearPreventedLog)
      await h.page.eval(probes.clearMenuBubble)
      await h.page.keyDown('alt')
      await sleep(120)
      assertEqual((await h.frame()).htmlPassThrough, 'true', 'html[data-psa-passthrough] is not set while Alt is held')
      // F10: hover resolution pauses while the pass-through modifier is held.
      await h.page.moveTo(point.x, point.y)
      await sleep(300)
      assertEqual(await h.page.evaluate(`!!document.querySelector('[data-psa-hover]')`), false, 'hover outline is shown while the pass-through modifier is held (F10)')
      try {
        await h.page.rightClickAt(point.x, point.y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await sleep(250)
      const altPrevented = await h.page.eval(probes.countPrevented, 'contextmenu')
      const altProbe = await h.page.eval(probes.readContextProbe)
      const altBubble = await h.page.eval(probes.readMenuBubble)
      assert(plainPrevented >= 1, 'plain right click did not defaultPrevent the contextmenu event')
      assertEqual(plainProbe.hits, 0, 'plain right click reached the native contextmenu target (it must stay blocked)')
      assertEqual(plainBubble.length, 0, 'plain right click escaped to the bubble phase (blocked event must stop propagation)')
      assertEqual(altPrevented, 0, 'Alt+right click still defaultPrevented the contextmenu event')
      assertEqual(altProbe.hits, 1, 'Alt+right click did not reach the native contextmenu target')
      assert(
        altProbe.prevented.every((value) => value === false),
        'Alt+right click contextmenu was defaultPrevented at the target'
      )
      assertEqual(altBubble.length, 1, `Alt+right click: expected exactly one native contextmenu event in the bubble oracle, got ${altBubble.length}`)
      assertEqual(altBubble[0].defaultPrevented, false, 'Alt+right click contextmenu was defaultPrevented')
      assertEqual((await h.frame()).htmlPassThrough, null, 'html[data-psa-passthrough] is not cleared after releasing Alt')
      return `native New Session opened ${short(sessionAfterNative, 28)}; blocked contextmenu bubble=(plain ${plainBubble.length} / alt ${altBubble.length}, alt prevented=${altBubble[0]?.defaultPrevented}), passthrough marker tracked`
    },

    3: async () => {
      await h.ensureModeOn()
      await h.ensureConversation()
      // Wheel scrolling: a blank session has no long conversation, so the assertion uses
      // the nearest native scrollable region (the sidebar session list) instead.
      const scrollable = await h.page.eval(probes.installScrollProbe)
      assert(scrollable, 'no native scrollable region found for the wheel assertion')
      await h.page.eval(probes.clearPreventedLog)
      await h.page.wheel(scrollable.x, scrollable.y, 320)
      await sleep(280)
      const scrolled = await h.page.eval(probes.readScrollProbe)
      const wheelPrevented = await h.page.eval(probes.countPrevented, 'wheel')
      const wheelTarget = scrollable.kind === 'conversation'
        ? 'conversation scroll region'
        : 'sidebar session list (blank conversation is not scrollable)'
      assert(scrolled.scrollTop !== scrollable.scrollTop, `wheel did not scroll ${wheelTarget} (${scrollable.scrollTop} -> ${scrolled.scrollTop})`)
      assertEqual(wheelPrevented, 0, `wheel events were blocked while the mode is on (${wheelTarget})`)
      // Keyboard: browser shortcuts and plain letters keep their native default behavior.
      await h.page.eval(probes.installKeyRecorder)
      await h.page.eval(probes.clearKeyLog)
      for (const spec of [
        { key: 'a', code: 'KeyA', vk: 65, modifiers: 0 },
        { key: 'k', code: 'KeyK', vk: 75, modifiers: MOD.meta },
        { key: 'l', code: 'KeyL', vk: 76, modifiers: MOD.ctrl },
      ]) {
        await h.page.dispatchKey(spec.key, spec.code, spec.vk, spec.modifiers)
      }
      await sleep(220)
      const keyLog = await h.page.eval(probes.readKeyLog)
      for (const key of ['a', 'k', 'l']) {
        const entry = keyLog.find((item) => item.key === key)
        assert(entry, `keydown for "${key}" never reached the page`)
        assertEqual(entry.defaultPrevented, false, `keydown for "${key}" was preventDefault-ed`)
      }
      // F15/F13: marquee selection must draw a box and collect click-selectable candidates.
      const boxFrom = { x: 460, y: 250 }
      const boxTo = { x: 780, y: 500 }
      await h.page.moveTo(boxFrom.x, boxFrom.y, MOD.shift)
      await h.page.mouse({ type: 'mousePressed', x: boxFrom.x, y: boxFrom.y, button: 'left', clickCount: 1, modifiers: MOD.shift })
      for (let step = 1; step <= 6; step++) {
        const t = step / 6
        await h.page.mouse({
          type: 'mouseMoved',
          x: Math.round(boxFrom.x + (boxTo.x - boxFrom.x) * t),
          y: Math.round(boxFrom.y + (boxTo.y - boxFrom.y) * t),
          button: 'left',
          buttons: 1,
          modifiers: MOD.shift,
        })
        await sleep(25)
      }
      const boxDrawn = await h.page.evaluate(`!!document.querySelector('[data-psa-box]')`)
      await h.page.mouse({ type: 'mouseReleased', x: boxTo.x, y: boxTo.y, button: 'left', clickCount: 1, modifiers: MOD.shift })
      await sleep(400)
      const marqueeUi = await h.ui()
      assert(boxDrawn, 'marquee drag did not draw the [data-psa-box] element')
      assert(
        marqueeUi.selection + marqueeUi.multi >= 1,
        `marquee release did not select any candidate (selection=${marqueeUi.selection}, multi=${marqueeUi.multi})`
      )
      const marqueeCount = marqueeUi.selection + marqueeUi.multi
      await h.clearSelection()
      // F6: first Esc ends note editing (popover stays, note kept), second Esc clears the
      // selection, third Esc leaves the mode.
      await h.selectElement('button[aria-label="New session"]')
      const popoverUi = await h.ui()
      assert(popoverUi.popover, 'selecting an element did not open the popover')
      const noteField = await h.page.findRect('[data-psa-note]')
      assert(noteField, 'popover note textarea not found')
      await h.page.clickAt(noteField.x, noteField.y)
      await sleep(150)
      await h.page.insertText('KEEP-THIS-NOTE')
      await sleep(250)
      await h.page.pressKey('escape')
      await sleep(320)
      const afterFirstEsc = await h.ui()
      const popoverAfterFirstEsc = await h.popover()
      assertEqual(afterFirstEsc.popover, true, 'first Esc closed the popover while editing a note (F6: it must only end editing)')
      assert(
        popoverAfterFirstEsc !== null && /KEEP-THIS-NOTE/.test(popoverAfterFirstEsc.note || ''),
        `first Esc lost the typed note (F6): ${JSON.stringify(popoverAfterFirstEsc)}`
      )
      assert(afterFirstEsc.selection + afterFirstEsc.multi >= 1, 'first Esc cleared the selection while it should only end note editing')
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), 'true', 'first Esc must keep the mode on')
      await h.page.pressKey('escape')
      await sleep(320)
      const afterSecondEsc = await h.ui()
      assertEqual(afterSecondEsc.popover, false, 'second Esc did not close the popover')
      assertEqual(afterSecondEsc.selection + afterSecondEsc.multi, 0, 'second Esc did not clear the selection')
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), 'true', 'second Esc must keep the mode on')
      await h.page.pressKey('escape')
      await sleep(380)
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), null, 'third Esc did not leave the mode')
      await h.activate()
      return `wheel over ${wheelTarget} ${scrollable.scrollTop}->${scrolled.scrollTop} with 0 preventDefault (conversationScrollable=${scrollable.conversationScrollable}), ${keyLog.length} keydowns uncancelled, marquee selected ${marqueeCount} candidate(s) with [data-psa-box], F6 Esc ladder end-edit -> clear-selection -> mode-off`
    },

    4: async () => {
      await h.ensureModeOn()
      await h.ensureConversation()
      await h.ensureStatusPanel()
      await h.clearSelection()
      const sessionId = await h.refreshSession()
      h.track(sessionId, 's4-annotated-session')
      const targets = []
      // 1) the native New Session button
      const newSession = await h.nativeNewSessionRect()
      assert(newSession, 'native New Session button not found')
      targets.push({ name: 'New session', point: newSession })
      // 2) the composer region
      const composerRegion = await h.page.findRect('[data-conversation-region="composer"]')
      assert(composerRegion, 'composer region not found')
      targets.push({ name: 'composer region', point: composerRegion })
      // 3) a real sidebar session row (left edge, so the row itself is the candidate)
      const row = await h.page.eval(probes.sessionRowPoint, sessionId)
      assert(row, 'sidebar session row not found')
      targets.push({ name: 'sidebar row', point: row })
      for (const target of targets) {
        await h.page.clickAt(target.point.x, target.point.y, { modifiers: MOD.shift })
        await sleep(350)
      }
      const multiUi = await h.ui()
      assertEqual(multiUi.multi, 3, 'three Shift+clicks must produce three multi-select outlines')
      assert(
        /3 elements selected|已选择 3 个元素/.test(multiUi.panelText),
        `rail status does not report 3 selected elements: ${short(multiUi.panelText, 140)}`
      )
      await h.click('[data-psa-add-multi]')
      await sleep(350)
      const added = await h.ui()
      assert(/Added to the collection|已加入标注集/.test(added.feedback || ''), `missing "added" feedback: ${added.feedback}`)
      await h.openCollection()
      assertEqual((await h.ui()).entries, 3, 'three entries after "Add all to collection"')
      await h.clickBack()
      // Re-selecting the same element updates its entry instead of duplicating it.
      await h.clearSelection()
      await h.selectElement('button[aria-label="New session"]')
      const popover = await h.popover()
      assert(/Update collection|更新标注集/.test(popover.addLabel || ''), `popover should offer update, got "${popover.addLabel}"`)
      await h.click('[data-psa-add]')
      await sleep(350)
      const updated = await h.ui()
      assert(/Updated the existing collection entry|已更新/.test(updated.feedback || ''), `missing "updated" feedback: ${updated.feedback}`)
      await h.openCollection()
      const entriesAfterUpdate = await h.entries()
      assertEqual(entriesAfterUpdate.length, 3, 're-adding the same element duplicated the collection entry')
      // Edit a note inline in the rail.
      const noteRect = await h.page.findRect('[data-psa-entry-note]')
      assert(noteRect, 'collection note textarea not found')
      await h.page.clickAt(noteRect.x, noteRect.y)
      await sleep(150)
      await h.page.insertText('RAIL-NOTE-1')
      await sleep(350)
      const edited = await h.entries()
      assert(edited.some((entry) => entry.note.includes('RAIL-NOTE-1')), 'inline rail note edit did not reach the entry')
      // Remove one entry.
      await h.click('[data-psa-entry-remove]')
      await sleep(350)
      assertEqual((await h.ui()).entries, 2, 'remove one entry from the collection')
      await h.clickBack()
      return `${targets.length} Shift selections -> multi outlined, 3 entries, update-in-place, note edited, 2 after remove`
    },

    5: async () => {
      await h.ensureModeOn()
      await h.ensureConversation()
      await h.ensureStatusPanel()
      await h.clearSelection()
      const transcriptBefore = await h.transcript()
      const sessionBefore = await h.refreshSession()
      h.track(sessionBefore, 's5-insert-session')
      // H2: never type into a session that is not verified blank.
      await h.assertBlankForInput('scenario 5 pre-existing draft')
      // A pre-existing draft must survive the insertion. The composer is focused through the
      // pass-through modifier because plain clicks are annotation clicks while the mode is on.
      const editor = await h.page.findRect('[data-conversation-region="composer"] [data-lexical-editor="true"]')
      assert(editor, 'composer editor not found')
      await h.page.keyDown('alt')
      try {
        await h.page.clickAt(editor.x, editor.y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await sleep(250)
      await h.page.insertText('DRAFT-PRESERVE')
      await sleep(250)
      const typed = await h.composer()
      assert((typed.text || '').includes('DRAFT-PRESERVE'), `draft was not typed: ${short(typed.text)}`)
      await h.openCollection()
      const entries = await h.entries()
      assert(entries.length >= 2, 'need at least two collection entries for the batch assertion')
      assertEqual(entries.filter((entry) => entry.scope === 'current').length, entries.length, 'all S5 entries must be current-session entries')
      for (const entry of entries) {
        assert(entry.name.length > 0, `collection entry name must not be empty (ref ${entry.ref}) — a vacuous batch assertion is not acceptable`)
      }
      await h.click('[data-psa-insert-batch]')
      const headerPattern = /Please adjust the UI elements below|请调整以下 UI 元素/
      await h.page.waitFor(
        `(${headerPattern.toString()}).test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || '')`,
        { timeout: 8000, label: 'batch insert appended to the composer' }
      )
      await sleep(400)
      const composer = await h.composer()
      const text = composer.text || ''
      assert(headerPattern.test(text), `batch header missing from the composer: ${short(text, 260)}`)
      assert(text.includes('DRAFT-PRESERVE'), 'the pre-existing draft text was not preserved')
      assert(text.indexOf('DRAFT-PRESERVE') < text.search(headerPattern), 'the existing draft must stay before the inserted block')
      const headerIndex = text.search(headerPattern)
      assert(headerIndex >= 0, `batch header missing from the composer: ${short(text, 260)}`)
      const inserted = text.slice(headerIndex)
      // H4: exactly one ordered numbered block per collection entry, each with its own note.
      const blockMatches = [...inserted.matchAll(/^(\d+)\. /gm)]
      assertEqual(
        blockMatches.length,
        entries.length,
        `expected one numbered block per collection entry (${entries.length}), got ${blockMatches.length}: ${short(inserted, 320)}`
      )
      for (let index = 0; index < blockMatches.length; index++) {
        assertEqual(Number(blockMatches[index][1]), index + 1, `numbered blocks must be ordered 1..n (block index ${index})`)
        const start = blockMatches[index].index
        const end = index + 1 < blockMatches.length ? blockMatches[index + 1].index : inserted.length
        const segment = inserted.slice(start, end)
        const entry = entries[index]
        assert(segment.includes(entry.name), `block ${index + 1} does not contain its entry name "${entry.name}": ${short(segment, 220)}`)
        if (entry.note.length > 0) {
          assert(segment.includes(entry.note), `block ${index + 1} does not contain its note "${entry.note}": ${short(segment, 240)}`)
        } else {
          assert(/Note: (—|$)|备注：\s*(—|$)/.test(segment), `block ${index + 1} is missing the empty-note placeholder: ${short(segment, 240)}`)
        }
      }
      const transcriptAfter = await h.transcript()
      assertEqual(transcriptAfter.messages, transcriptBefore.messages, 'a message was sent by the batch insert')
      assertEqual(transcriptAfter.chatChildren, transcriptBefore.chatChildren, 'conversation DOM changed after the batch insert')
      assertEqual(await h.refreshSession(), sessionBefore, 'the current session id changed after the batch insert')
      assert(composer.focused, 'the composer was not focused after insertion')
      await h.clickBack()
      return `draft preserved before ${blockMatches.length} ordered numbered blocks with matching notes, not sent, composer focused`
    },

    6: async () => {
      await h.ensureModeOn()
      await h.ensureConversation()
      await h.ensureSidebarExpanded()
      await h.ensureStatusPanel()
      await h.clearSelection()
      const sessionOne = await h.refreshSession()
      // ---- Part A: truly removed targets must be marked stale.
      // Target A (hard assertion): a workspace row with a stable data-row-key. The native
      // collapse below unmounts the whole sidebar list, so this element is truly removed.
      const rowPoint = await h.page.eval(probes.workspaceRowPoint)
      assert(rowPoint, 'sidebar workspace row not found for the true-removal case')
      await h.page.clickAt(rowPoint.x, rowPoint.y)
      await sleep(320)
      assert((await h.ui()).popover, 'selecting the sidebar workspace row did not open the popover')
      const removedPopover = await h.popover()
      await h.click('[data-psa-add]')
      await sleep(320)
      await h.page.pressKey('escape')
      await sleep(200)
      // Target B (evidence only): the native sidebar toggle, which is replaced in place by
      // another control that shares the same stable `data-sidebar-toggle` attribute. The
      // product may legitimately resolve this "same control" case; true removals below are
      // the acceptance oracle.
      const collapse = await h.page.eval(probes.buttonAriaRect, 'Collapse sidebar')
      assert(collapse, 'native Collapse sidebar button not found')
      await h.page.clickAt(collapse.x, collapse.y)
      await sleep(320)
      assert((await h.ui()).popover, 'selecting the Collapse sidebar button did not open the popover')
      const togglePopover = await h.popover()
      await h.click('[data-psa-add]')
      await sleep(320)
      await h.page.pressKey('escape')
      await sleep(200)
      await h.openCollection()
      const beforeCollapse = await h.entries()
      const toggleEntry = beforeCollapse.find((entry) => /Collapse sidebar/.test(entry.name))
      const removedEntry = beforeCollapse.filter((entry) => entry.ref !== toggleEntry?.ref).pop()
      assert(removedEntry, `collection entry for the truly removed workspace row not found (entries: ${JSON.stringify(beforeCollapse.map((entry) => entry.name))})`)
      // Collapse the sidebar with the real native action (pass-through modifier).
      await h.page.keyDown('alt')
      try {
        await h.page.clickAt(collapse.x, collapse.y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await h.page.waitFor(`!!document.querySelector('button[aria-label="Open sidebar"]')`, { timeout: 6000, label: 'sidebar collapsed natively' })
      await sleep(350)
      // Leave and reopen the collection so the rows recompute against the collapsed DOM.
      await h.ensureStatusPanel()
      await h.openCollection()
      const afterCollapse = await h.entries()
      const unmountedEntry = afterCollapse.find((entry) => entry.ref === removedEntry.ref)
      assert(unmountedEntry, 'the truly removed collection entry disappeared')
      assertEqual(
        unmountedEntry.status,
        'missing',
        `a truly unmounted element with a stable data attribute must be "missing", got "${unmountedEntry.status}" ` +
          `(row popover title="${removedPopover.title}" ref="${removedPopover.ref}", entry name="${removedEntry.name}", ` +
          `sidebar=${short(JSON.stringify(await h.page.eval(probes.sidebarState)))})`
      )
      const toggleStatus = afterCollapse.find((entry) => entry.ref === toggleEntry?.ref)?.status ?? 'n/a'
      // Batch insert: the truly removed target must carry the explicit stale marker line.
      const domBeforeInsert = await h.page.eval(probes.nonComposerElementCount)
      await h.click('[data-psa-insert-batch]')
      const stalePattern = /Status: target no longer resolves|目标已无法定位/
      await h.page.waitFor(
        `(${stalePattern.toString()}).test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || '')`,
        { timeout: 8000, label: 'stale marker line in the inserted text' }
      ).catch(() => {})
      await sleep(300)
      const staleText = (await h.composer()).text || ''
      const staleMarkerCount = (staleText.match(new RegExp(stalePattern.source, 'g')) || []).length
      assert(staleMarkerCount >= 1, `expected an explicit stale marker line for the removed target, got ${staleMarkerCount}: ${short(staleText, 320)}`)
      assertEqual(await h.page.eval(probes.nonComposerElementCount), domBeforeInsert, 'native DOM elements changed outside the composer during insertion')
      // Restore the sidebar and confirm the rebuilt target resolves again.
      const reopen = await h.page.eval(probes.buttonAriaRect, 'Open sidebar')
      assert(reopen, 'native Open sidebar button not found')
      await h.page.keyDown('alt')
      try {
        await h.page.clickAt(reopen.x, reopen.y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await h.page.waitFor(`!!document.querySelector('button[aria-label="Collapse sidebar"]')`, { timeout: 6000, label: 'sidebar restored' })
      await h.page.pressKey('escape')
      await sleep(200)
      await h.ensureStatusPanel()
      await h.openCollection()
      const afterRestore = await h.entries()
      const restoredRow = afterRestore.find((entry) => entry.ref === unmountedEntry.ref)
      assert(restoredRow !== undefined, 'the unmounted entry disappeared from the collection')
      // The sidebar session/workspace list is virtualized: after collapse/expand the rebuilt row
      // may be outside the rendered window, so "missing" is a valid outcome here. The decisive
      // stale-target oracle is the assertion above (a truly unmounted target must be "missing").
      assert(
        ['resolved', 'changed', 'missing'].includes(restoredRow.status),
        `unexpected rebuilt-target status "${restoredRow.status}"`
      )
      const restoredStatus = restoredRow.status
      await h.clickBack()
      await h.ensureStatusPanel()
      // ---- F8: with no mounted Composer seat the rail must explain the missing session
      // explicitly (collection view) and hide the generic cross-session skip line.
      const pluginsRect = await h.page.eval(probes.pluginNavRect)
      assert(pluginsRect, 'native Plugins navigation button not found for the no-session check')
      await h.page.keyDown('alt')
      try {
        await h.page.clickAt(pluginsRect.x, pluginsRect.y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await h.page.waitFor(
        `!document.querySelector('[data-conversation-session]')`,
        { timeout: 8000, label: 'conversation left for the no-session notice check' }
      )
      await sleep(450)
      await h.openCollection()
      const noSessionState = await h.page.evaluate(`(() => {
        const notice = document.querySelector('[data-psa-no-session]')
        const panel = document.querySelector('[data-psa-rail-panel]')
        return {
          notice: notice !== null,
          noticeText: notice !== null ? (notice.innerText || '').trim() : '',
          panelText: panel !== null ? (panel.innerText || '').replace(/\\s+/g, ' ').trim() : '',
          batchDisabled: document.querySelector('[data-psa-insert-batch]')?.disabled === true,
        }
      })()`)
      assert(noSessionState.notice, 'the collection rail is missing [data-psa-no-session] while no session is mounted (F8)')
      assert(/session|会话/i.test(noSessionState.noticeText), `the no-session notice is not explicit: ${JSON.stringify(noSessionState.noticeText)}`)
      assert(
        !/from other sessions will be skipped|来自其他会话/.test(noSessionState.panelText),
        `the generic cross-session skip line must be hidden when no session exists (F8): ${short(noSessionState.panelText, 220)}`
      )
      assertEqual(noSessionState.batchDisabled, true, 'batch insert must be disabled when no session is mounted')
      // Return to the conversation through the native New Session flow (pass-through).
      await h.page.keyDown('alt')
      try {
        await h.clickNativeNewSession({ modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await h.page.waitFor(
        `!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`,
        { timeout: 12000, label: 'conversation restored after the no-session check' }
      )
      await sleep(450)
      await h.ensureStatusPanel()
      // ---- Part B: genuinely mixed scope across two blank sessions (H5).
      // Session A holds the collection entries added above. A second *blank* session is created
      // through the native "New session in <workspace>" hover action, so the entries keep their
      // origin session and must be scoped as "other" until a new current-session entry is added.
      await h.ensureStatusPanel()
      const sessionA = await h.refreshSession()
      h.track(sessionA, 's6-session-a')
      await h.openCollection()
      const entriesA = await h.entries()
      for (const entry of entriesA) {
        assert(entry.name.length > 0, `S6 collection entry name must not be empty (ref ${entry.ref})`)
      }
      const otherNamesA = entriesA.map((entry) => entry.name)
      await h.clickBack()
      await h.ensureModeOff()
      const blankB = await h.createBlankSessionViaHover()
      const sessionB = blankB.sessionId
      assert(sessionB !== null && sessionB !== sessionA, `the second blank session must differ from the first (${sessionA} -> ${sessionB})`)
      assert(blankB.ok, `the second session did not verify blank: ${JSON.stringify(blankB)}`)
      h.track(sessionB, 's6-session-b')
      await sleep(600)
      await h.ensureModeOn()
      await h.ensureStatusPanel()
      await h.openCollection()
      const scopedEntries = await h.entries()
      assertEqual(scopedEntries.length, entriesA.length, 'collection entries must survive the session switch')
      assertEqual(
        scopedEntries.filter((entry) => entry.scope === 'other').length,
        scopedEntries.length,
        'every pre-switch entry must be marked other-session in the second session'
      )
      assertEqual(
        await h.page.evaluate(`document.querySelector('[data-psa-insert-batch]')?.disabled === true`),
        true,
        'batch insert must be disabled while only other-session entries exist'
      )
      const panelText = (await h.ui()).panelText
      assert(/from other sessions will be skipped|来自其他会话/.test(panelText), `cross-session notice missing from the rail: ${short(panelText, 220)}`)
      // Add one current-session entry in session B so the collection has mixed scope.
      await h.clickBack()
      await h.selectElement('button[aria-label="New session"]')
      assert((await h.ui()).popover, 'popover did not open in the second session')
      const currentNote = 'Mixed scope current entry'
      const mixedNoteRect = await h.page.findRect('[data-psa-note]')
      assert(mixedNoteRect, 'popover note textarea not found in the second session')
      await h.page.clickAt(mixedNoteRect.x, mixedNoteRect.y)
      await sleep(120)
      await h.page.insertText(currentNote)
      await sleep(200)
      await h.click('[data-psa-add]')
      await sleep(320)
      await h.openCollection()
      const mixed = await h.entries()
      const currentEntries = mixed.filter((entry) => entry.scope === 'current')
      const otherEntries = mixed.filter((entry) => entry.scope === 'other')
      assertEqual(currentEntries.length, 1, 'exactly one entry must be scoped to the current session')
      assertEqual(otherEntries.length, entriesA.length, 'all pre-switch entries must stay other-session')
      for (const entry of otherEntries) {
        assertEqual(
          entry.status,
          'other',
          `other-session entry "${entry.name}" must expose data-psa-status="other", got "${entry.status}" (F9)`
        )
      }
      // F9: re-locate on an other-session entry must refuse with explicit feedback and no scroll.
      const chatScrollBefore = await h.page.evaluate(
        `(() => { const chat = document.querySelector('[data-conversation-region="chat"]'); return chat !== null ? chat.scrollTop : null })()`
      )
      const relocateRect = await h.page.findRect('[data-psa-entry-relocate]')
      assert(relocateRect, 'no re-locate control on the other-session entries')
      await h.page.clickAt(relocateRect.x, relocateRect.y)
      await sleep(400)
      const relocateUi = await h.ui()
      assert(
        typeof relocateUi.feedback === 'string' && relocateUi.feedback.length > 0,
        're-locate on an other-session entry did not show explicit feedback (F9)'
      )
      const chatScrollAfter = await h.page.evaluate(
        `(() => { const chat = document.querySelector('[data-conversation-region="chat"]'); return chat !== null ? chat.scrollTop : null })()`
      )
      assertEqual(chatScrollAfter, chatScrollBefore, 're-locate on an other-session entry scrolled the canvas (F9)')
      assertEqual(
        await h.page.evaluate(`document.querySelector('[data-psa-insert-batch]')?.disabled === true`),
        false,
        'batch insert must be enabled once a current-session entry exists'
      )
      // Batch insert with mixed scope: only the current entry plus the explicit skip line.
      const domBeforeMixed = await h.page.eval(probes.nonComposerElementCount)
      await h.click('[data-psa-insert-batch]')
      const skipPattern = /\(\d+ annotation\(s\) from other sessions skipped\)|来自其他会话/
      await h.page.waitFor(
        `(${skipPattern.toString()}).test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || '')`,
        { timeout: 8000, label: 'cross-session skip line in the inserted text' }
      ).catch(() => {})
      await sleep(450)
      const mixedText = (await h.composer()).text || ''
      const skipMatch = mixedText.match(new RegExp(skipPattern.source))
      assert(skipMatch, `expected the cross-session skip line in the inserted text: ${short(mixedText, 340)}`)
      if (/annotation\(s\) from other sessions skipped/.test(skipMatch[0])) {
        const skipCount = /^\((\d+) /.exec(skipMatch[0])?.[1]
        assertEqual(Number(skipCount), entriesA.length, `the skip line must report ${entriesA.length} other-session annotations, got "${skipMatch[0]}"`)
      }
      assert(mixedText.includes(currentNote), `the current-session entry note must be inserted: ${short(mixedText, 340)}`)
      const mixedBlocks = [...mixedText.matchAll(/^(\d+)\. /gm)]
      assertEqual(mixedBlocks.length, 1, `exactly one numbered block must be inserted for the mixed scope, got ${mixedBlocks.length}: ${short(mixedText, 340)}`)
      for (const otherName of otherNamesA) {
        assert(!mixedText.includes(otherName), `other-session entry content leaked into the composer: "${otherName}"`)
      }
      assertEqual(await h.page.eval(probes.nonComposerElementCount), domBeforeMixed, 'native DOM elements changed outside the composer during the mixed-scope insertion')
      assertEqual((await h.transcript()).messages, 0, 'a message was sent after the mixed-scope insert')
      await h.ensureStatusPanel()
      const scopeDetail = `mixed scope: ${short(sessionA, 22)} (${otherEntries.length} entries -> other, skipped) + ${short(sessionB, 22)} (1 current entry inserted), skip line "${skipMatch[0]}"`
      return `true removal -> status missing + ${staleMarkerCount} stale marker line(s) (in-place replaced toggle status: ${toggleStatus}, rebuilt row status: ${restoredStatus}); ${scopeDetail}; no DOM mutation`
    },

    7: async () => {
      await h.ensureModeOff()
      await h.ensureConversation()
      await h.ensureSidebarExpanded()
      // F12: a pre-existing inline padding on the layout frame must be restored exactly on exit.
      const sentinel = await h.page.evaluate(`(() => {
        const overlay = document.querySelector('[data-shell-overlay]')
        const frame = overlay !== null ? overlay.parentElement : null
        if (frame === null) return null
        frame.style.setProperty('padding-right', '13px')
        return { padding: frame.style.getPropertyValue('padding-right'), priority: frame.style.getPropertyPriority('padding-right') }
      })()`)
      assert(sentinel !== null, 'the layout frame was not found for the F12 sentinel')
      assertEqual(sentinel.padding, '13px', 'F12 sentinel padding was not applied')
      const preMode = await h.frame()
      const baselineGrid = preMode.grid
      await h.activate()
      await h.ensureStatusPanel()
      const before = await h.frame()
      const railWidth = Number.parseFloat(before.railWidthVar || '0')
      assertEqual(before.htmlActive, 'true', 'mode must be on before the exit checks')
      assert(before.paddingRight !== '13px', 'the sentinel padding must be replaced by the rail width while the mode is active')
      assertNear(Number.parseFloat(before.paddingRight || '0'), railWidth, 2, 'active frame padding must equal the rail width')
      // Record the frame/attribute timeline across the exit transition.
      await h.page.evaluate(`(() => {
        const overlay = document.querySelector('[data-shell-overlay]')
        const frame = overlay !== null ? overlay.parentElement : null
        window.__psaExitTimeline = { started: performance.now(), records: [] }
        const record = (label) => {
          if (frame === null) return
          window.__psaExitTimeline.records.push({
            label,
            at: Math.round(performance.now() - window.__psaExitTimeline.started),
            frameMarker: frame.getAttribute('data-psa-frame'),
            htmlActive: document.documentElement.getAttribute('data-psa-active'),
            padding: frame.style.paddingRight,
          })
        }
        record('before')
        window.__psaExitObserver = new MutationObserver(() => record('frame'))
        window.__psaExitObserver.observe(frame, { attributes: true, attributeFilter: ['data-psa-frame', 'style'] })
        window.__psaExitHtmlObserver = new MutationObserver(() => record('html'))
        window.__psaExitHtmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-psa-active'] })
        return true
      })()`)
      const exitRect = await h.page.findRect('[data-psa-exit]')
      assert(exitRect, 'rail exit button not found')
      await h.page.clickAt(exitRect.x, exitRect.y)
      await h.page.waitFor(
        `document.documentElement.getAttribute('data-psa-active') === null`,
        { timeout: 6000, label: 'mode off after the exit click' }
      )
      // The reverse transition removes data-psa-frame after roughly 180 ms, but a busy renderer
      // can delay the removal callback; poll instead of assuming a fixed window.
      let markerGone = false
      const markerDeadline = Date.now() + 5000
      while (Date.now() < markerDeadline) {
        const state = await h.page.evaluate(`(() => {
          const overlay = document.querySelector('[data-shell-overlay]')
          const frame = overlay !== null ? overlay.parentElement : null
          return { marker: frame !== null ? frame.getAttribute('data-psa-frame') : null }
        })()`)
        if (state.marker === null) {
          markerGone = true
          break
        }
        await sleep(120)
      }
      assert(markerGone, 'data-psa-frame never disappeared after the exit transition')
      const timeline = await h.page.evaluate(`(() => {
        if (window.__psaExitObserver) window.__psaExitObserver.disconnect()
        if (window.__psaExitHtmlObserver) window.__psaExitHtmlObserver.disconnect()
        return window.__psaExitTimeline || null
      })()`)
      const after = await h.frame()
      assertEqual(after.htmlActive, null, 'html[data-psa-active] remains after exit')
      assertEqual(after.htmlPassThrough, null, 'html[data-psa-passthrough] remains after exit')
      assertEqual(after.frameMarker, null, 'frame[data-psa-frame] remains after the reverse transition')
      assertEqual(after.paddingRight, '13px', 'F12: the pre-existing inline frame padding was not restored exactly')
      assertEqual(after.railWidthVar, '', '--psa-rail-width remains after exit')
      assertEqual(after.grid, baselineGrid, 'the inline grid style changed after exit')
      assertEqual(after.rail, null, 'rail remains after exit')
      assert(timeline !== null && Array.isArray(timeline.records) && timeline.records.length > 0, 'no frame transition timeline was recorded')
      const transitionRecord = timeline.records.find(
        (record) => record.htmlActive === null && record.frameMarker === 'true' && record.padding === '13px'
      )
      assert(
        transitionRecord !== undefined,
        `F12: data-psa-frame must stay during the reverse padding transition after data-psa-active clears ` +
          `(timeline: ${JSON.stringify(timeline.records)})`
      )
      assert(
        transitionRecord.at <= 5000,
        `F12: the reverse transition marker record is implausibly late (${transitionRecord.at} ms)`
      )
      const leftovers = await h.page.eval(probes.modeOverlayNodeCount)
      assertEqual(leftovers, 0, `${leftovers} annotation overlay nodes remain after exit`)
      assertEqual(await h.page.count('[data-psa-launcher]'), 1, 'the launcher must remain exactly once after exit')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-active')`), 'false', 'launcher still reports an active mode')
      assertEqual(await h.page.evaluate(`document.querySelector('style[data-power-suite-css="ui-annotation"]') !== null`), true, 'the plugin stylesheet must stay installed while the plugin is loaded')
      // Clean the sentinel so later scenarios see the standard layout frame again.
      await h.page.evaluate(`(() => {
        const overlay = document.querySelector('[data-shell-overlay]')
        const frame = overlay !== null ? overlay.parentElement : null
        if (frame !== null) frame.style.removeProperty('padding-right')
        return true
      })()`)
      const cleaned = await h.frame()
      assertEqual(cleaned.paddingRight, '', 'sentinel padding cleanup failed (harness)')
      assertEqual(cleaned.grid, baselineGrid, 'grid changed after the sentinel cleanup')
      // Native New Session works again: from the Plugins page a plain real click returns to the conversation.
      await h.ensurePluginsView()
      await h.clickNativeNewSession()
      await h.page.waitFor(
        `!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`,
        { timeout: 12000, label: 'native New Session after exit' }
      )
      await sleep(300)
      const restored = await h.frame()
      h.state.sessionId = restored.sessionId
      h.track(restored.sessionId, 's7-native-new-session')
      return `markers/padding removed (sentinel 13px restored exactly, reverse-transition marker observed at ${transitionRecord.at} ms then removed), grid restored, launcher kept once, native New Session reopened ${short(restored.sessionId, 28)}`
    },

    8: async () => {
      await h.ensureModeOff()
      // Start from a freshly loaded page: the earlier scenarios leave a long, text-heavy
      // composer behind, and a busy renderer can delay input dispatch.
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready before the launcher geometry scenario' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the pre-scenario reload' })
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(500)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const reloadedSessionId = await h.refreshSession()
      h.track(reloadedSessionId, 's8-reloaded-session')
      const viewport = await h.page.evaluate(`({ width: innerWidth, height: innerHeight })`)
      // F5: aborting an in-flight launcher drag by leaving the mode must not toggle the mode,
      // must not persist a position, and must leave no gesture nodes behind.
      await h.activate()
      const abortStart = await h.launcherRect()
      assert(abortStart, 'launcher missing before the F5 drag-abort check')
      const storedBefore = await h.page.evaluate(`localStorage.getItem('power-suite.ui-annotation.launcher')`)
      await h.page.moveTo(abortStart.x, abortStart.y)
      await h.page.mouse({ type: 'mousePressed', x: abortStart.x, y: abortStart.y, button: 'left', clickCount: 1 })
      for (let step = 1; step <= 4; step++) {
        await h.page.mouse({
          type: 'mouseMoved',
          x: abortStart.x - step * 40,
          y: abortStart.y - step * 30,
          button: 'left',
          buttons: 1,
        })
        await sleep(25)
      }
      assertEqual(
        await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-dragging') ?? null`),
        'true',
        'the launcher drag did not start (data-psa-dragging missing)'
      )
      await h.page.pressKey('escape')
      await h.page.mouse({ type: 'mouseReleased', x: abortStart.x - 160, y: abortStart.y - 120, button: 'left', clickCount: 1 })
      await sleep(420)
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), null, 'Esc during the drag must leave the mode')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-active')`), 'false', 'the aborted drag re-activated the mode')
      assertEqual(await h.page.evaluate(`!!document.querySelector('[data-psa-box]')`), false, 'the aborted gesture left a marquee box node')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-dragging') ?? null`), null, 'the aborted gesture left data-psa-dragging set')
      // F5's guarantee is that the aborted gesture does not *persist* the position (the
      // in-memory position may stay where the pointer left it); the storage oracle is decisive.
      assertEqual(
        await h.page.evaluate(`localStorage.getItem('power-suite.ui-annotation.launcher')`),
        storedBefore,
        'the aborted drag persisted the launcher position'
      )
      const start = await h.launcherRect()
      assert(start, 'launcher missing before the drag scenario')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-active')`), 'false', 'launcher must be inactive before the drag')
      const clickable = await h.ensureLauncherClickable()
      assert(clickable, `the launcher centre does not receive pointer input: ${short(JSON.stringify(await h.page.eval(probes.launcherCenterCover)))}`)
      // Real mouse drag away from the default corner first (the default position is already
      // bottom-right, so a corner-to-corner drag would not move anything).
      await h.page.drag({ x: start.x, y: start.y }, { x: 430, y: 330 }, { steps: 16 })
      await sleep(350)
      let moved = await h.launcherRect()
      if (moved.left === start.left && moved.top === start.top) {
        // Retry once with a slower sequence: a re-render or a transient overlay can swallow
        // the first pointerdown.
        await h.ensureLauncherClickable()
        await h.page.drag({ x: moved.x, y: moved.y }, { x: 430, y: 330 }, { steps: 24 })
        await sleep(400)
        moved = await h.launcherRect()
      }
      assert(
        moved.left !== start.left || moved.top !== start.top,
        `the first drag never moved the launcher (start ${JSON.stringify(start)}, after ${JSON.stringify(moved)}, ` +
          `cover=${short(JSON.stringify(await h.page.eval(probes.launcherCenterCover)))}, ` +
          `dragging=${await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-dragging') ?? null`)})`
      )
      // Drag to the bottom-right corner; the position must be clamped with the margin.
      await h.page.drag({ x: moved.x, y: moved.y }, { x: viewport.width - 5, y: viewport.height - 5 }, { steps: 16 })
      await sleep(350)
      const dragged = await h.launcherRect()
      assert(dragged.left >= 0 && dragged.top >= 0, `launcher left the viewport after the drag: ${short(JSON.stringify(dragged))}`)
      assert(dragged.left + dragged.width <= viewport.width + 1, 'launcher overflows the viewport horizontally after the drag')
      assert(dragged.top + dragged.height <= viewport.height + 1, 'launcher overflows the viewport vertically after the drag')
      assert(dragged.left + dragged.width <= viewport.width - 6, 'launcher lost its 8px right margin after the drag')
      assert(dragged.top + dragged.height <= viewport.height - 6, 'launcher lost its 8px bottom margin after the drag')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-active')`), 'false', 'dragging the launcher toggled the mode')
      assert(dragged.left !== moved.left || dragged.top !== moved.top, 'the corner drag never moved the launcher')
      // Activate the mode; while it is active and the full viewport is available, assert that
      // wheel-scrolling a native region does not move the fixed launcher (H6 makes a missing
      // scrollable region a failure instead of a silently skipped sub-assertion).
      await h.activate()
      const scrollable = await h.page.eval(probes.installScrollProbe)
      assert(scrollable, 'no native scrollable region available for the scroll-stability assertion')
      const beforeScroll = await h.launcherRect()
      await h.page.wheel(scrollable.x, scrollable.y, -260)
      await sleep(320)
      const afterScroll = await h.launcherRect()
      assertEqual(afterScroll.left, beforeScroll.left, 'launcher moved horizontally when the page scrolled')
      assertEqual(afterScroll.top, beforeScroll.top, 'launcher moved vertically when the page scrolled')
      const scrollEvidence = `scroll over the ${scrollable.kind} region did not move the launcher`
      // Then shrink the viewport: the launcher must be clamped in. The Emulation override should
      // fire a native resize; poll the clamped geometry because the resize handler is debounced
      // (120 ms) and geometry updates run on frames.
      const insideSmall = async () => {
        const rect = await h.launcherRect()
        if (rect === null) return null
        if (rect.left < 0 || rect.top < 0 || rect.left + rect.width > 1000 || rect.top + rect.height > 700) return null
        return rect
      }
      const pollSmall = async (timeout) => {
        const deadline = Date.now() + timeout
        let result = await insideSmall()
        while (result === null && Date.now() < deadline) {
          await sleep(150)
          result = await insideSmall()
        }
        return result
      }
      await h.page.setViewport(1000, 700)
      let small = await pollSmall(1500)
      let resizeEvents = await h.page.evaluate(`window.__psaResizeCount ?? -1`)
      if (small === null && resizeEvents === 0) {
        // Headless Chrome occasionally swallows the resize event for the Emulation override.
        // Force a second real viewport change first; if even that delivers no native resize,
        // dispatch a single resize event as a documented fallback so the product's resize
        // path is still exercised (the native path is covered when the event does arrive).
        await h.page.setViewport(1001, 701)
        await sleep(300)
        await h.page.setViewport(1000, 700)
        small = await pollSmall(1500)
        resizeEvents = await h.page.evaluate(`window.__psaResizeCount ?? -1`)
        if (small === null && resizeEvents === 0) {
          await h.page.evaluate(`window.dispatchEvent(new Event('resize'))`)
          small = await pollSmall(1500)
        }
      }
      const smallViewport = await h.page.evaluate(`({ width: innerWidth, height: innerHeight })`)
      assertEqual(smallViewport.width, 1000, 'viewport width after the Emulation override')
      assertEqual(smallViewport.height, 700, 'viewport height after the Emulation override')
      assert(
        small !== null,
        `launcher not clamped into the 1000x700 viewport after retrying ` +
          `(rect=${short(JSON.stringify(await h.launcherRect()))}, viewport=${short(JSON.stringify(smallViewport))}, ` +
          `layout=${short(JSON.stringify(await h.frame()))}, ` +
          `resizes=${await h.page.evaluate(`window.__psaResizeCount ?? -1`)})`
      )
      const remembered = small
      // Reload: mode is off by default, remembered position survives.
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after reload' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after reload' })
      await sleep(500)
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), null, 'annotation mode must be off by default after reload')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-active')`), 'false', 'launcher must be inactive after reload')
      const reloaded = await h.launcherRect()
      assert(reloaded, 'launcher missing after reload')
      assertNear(reloaded.left, remembered.left, 2, 'remembered launcher x after reload')
      assertNear(reloaded.top, remembered.top, 2, 'remembered launcher y after reload')
      return `F5 aborted drag left no state; drag clamped (${dragged.left},${dragged.top}); ${scrollEvidence}; 1000x700 clamp (${small.left},${small.top}); reload keeps ${reloaded.left},${reloaded.top} with the mode off`
    },

    9: async () => {
      await h.ensureModeOff()
      // Scenario 8 may have left the Emulation viewport at 1000x700 if it failed mid-way.
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(400)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      await h.ensureStatusPanel()
      const baseline = await h.frame()
      assertEqual(baseline.htmlActive, null, 'mode must be off before the collection geometry scenario')
      assert(baseline.canvas, 'conversation canvas missing')
      const canvasWidthBaseline = baseline.canvas.width
      await h.activate()
      const active = await h.frame()
      const railWidth = Number.parseFloat(active.railWidthVar || '0')
      assert(active.rail !== null, 'rail missing after activation')
      assertNear(active.canvas.width, canvasWidthBaseline - railWidth, 3, 'conversation canvas width after the shrink')
      assertEqual(active.railPanelCount, 1, `rail body missing right after activation (railChildCount=${active.railChildCount})`)
      const paddingBefore = active.paddingRight
      // Opening the collection must not change the frame geometry or draw a wide drawer.
      await h.openCollection()
      await sleep(250)
      const collectionFrame = await h.frame()
      assertEqual(
        collectionFrame.panel,
        'collection',
        `collection panel not visible (rail=${JSON.stringify(collectionFrame.rail)}, ` +
          `collapsed=${JSON.stringify(collectionFrame.railCollapsed)}, mode=${JSON.stringify(collectionFrame.railMode)}, ` +
          `children=${collectionFrame.railChildCount}, panels=${collectionFrame.railPanelCount}, ` +
          `padding=${JSON.stringify(collectionFrame.paddingRight)}, active=${JSON.stringify(collectionFrame.htmlActive)}, ` +
          `html=${JSON.stringify(collectionFrame.railHtml)})`
      )
      assertEqual(collectionFrame.paddingRight, paddingBefore, 'frame padding changed when the collection opened')
      assertNear(collectionFrame.canvas.width, active.canvas.width, 1, 'conversation canvas width changed when the collection opened')
      assert(
        collectionFrame.rail.x >= collectionFrame.viewport.width - railWidth - 3,
        `collection view extends beyond the rail strip (rail.x=${collectionFrame.rail.x}, viewport=${collectionFrame.viewport.width}, rail=${railWidth})`
      )
      assert(collectionFrame.rail.x + collectionFrame.rail.width <= collectionFrame.viewport.width + 1, 'rail overflows the viewport')
      assert(collectionFrame.rail.width <= railWidth + 2, `rail width grew from ${railWidth}px to ${collectionFrame.rail.width}px when the collection opened`)
      // Close the collection: status view restored with the same geometry.
      await h.clickBack()
      await sleep(250)
      const closed = await h.frame()
      assertEqual(closed.panel, 'status', 'status panel not restored after closing the collection')
      assertEqual(closed.paddingRight, paddingBefore, 'frame padding changed when the collection closed')
      assertNear(closed.canvas.width, active.canvas.width, 1, 'conversation canvas width changed when the collection closed')
      // Exit: full layout restoration.
      await h.exit()
      const restored = await h.frame()
      assertEqual(restored.paddingRight, '', 'frame padding not removed after exit')
      assertNear(restored.canvas.width, canvasWidthBaseline, 2, 'conversation canvas width not restored after exit')
      assertEqual(restored.grid, baseline.grid, 'inline grid style changed after exit')
      return `padding ${paddingBefore} stable across collection open/close; canvas ${active.canvas.width}px -> restored ${restored.canvas.width}px (baseline ${canvasWidthBaseline}px)`
    },
  }
}

async function runScenarios(harness, results, opts) {
  const scenarios = buildScenarios(harness)
  for (const id of SCENARIO_ORDER) {
    // --scenario N runs exactly that scenario; it is intended for debugging the
    // state-independent scenarios (7, 8, 9) one at a time.
    if (opts.scenario !== null && id !== opts.scenario) continue
    if (opts.from !== null && id < opts.from) continue
    await results.check(id, SCENARIO_TITLES[id], () => scenarios[id]())
    // Never let a viewport override or mode state cascade into the next scenario.
    try {
      const widths = await harness.page.evaluate(`({ width: innerWidth, height: innerHeight })`)
      if (widths.width !== VIEWPORT.width || widths.height !== VIEWPORT.height) {
        await harness.page.setViewport(VIEWPORT.width, VIEWPORT.height)
        await sleep(500)
      }
    } catch {
      /* best effort */
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Screenshots (1728x900, privacy-blurred sidebar + chat area)
// ---------------------------------------------------------------------------------------------

async function captureScreenshots(harness) {
  const h = harness
  const shots = []
  /** PNG IHDR width/height (the capture must be exactly 1728x900). */
  const pngSize = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) })
  const capture = async (name, expectations = {}) => {
    await h.page.eval(probes.installPrivacyStyle)
    await h.page.eval(probes.privacyApply)
    // Park the pointer on neutral canvas so hover tooltips do not end up in the capture, and let
    // transient toasts fade out.
    await h.page.moveTo(1710, 450)
    await sleep(3400)
    // --- H3: proof of the privacy guard before every single capture ---
    const privacy = await h.page.eval(probes.privacyState)
    assert(privacy.classOn, `[${name}] privacy class is not applied`)
    assert(privacy.shield, `[${name}] privacy content shield is missing`)
    assert(
      typeof privacy.shieldBackdrop === 'string' && privacy.shieldBackdrop.includes('blur'),
      `[${name}] privacy shield has no backdrop blur: ${JSON.stringify(privacy.shieldBackdrop)}`
    )
    assert(
      typeof privacy.sidebarFilter === 'string' && privacy.sidebarFilter.includes('blur'),
      `[${name}] native sidebar is not blurred: ${JSON.stringify(privacy.sidebarFilter)}`
    )
    if (privacy.headerFilter !== null) {
      assert(privacy.headerFilter.includes('blur'), `[${name}] conversation header is not blurred: ${JSON.stringify(privacy.headerFilter)}`)
    }
    assert(
      privacy.composerTop === null || privacy.shieldBottom <= privacy.composerTop + 1,
      `[${name}] privacy shield covers the composer (shieldBottom=${privacy.shieldBottom}, composerTop=${privacy.composerTop})`
    )
    if (privacy.composerFilter !== null) {
      assertEqual(privacy.composerFilter, 'none', `[${name}] composer must stay crisp (got filter ${privacy.composerFilter})`)
    }
    // --- H3/H2: blank-session precondition before every capture ---
    const blank = await h.blankState()
    assertEqual(blank.messages, 0, `[${name}] refusing capture: transcript has ${blank.messages} messages`)
    assertEqual(blank.turns, 0, `[${name}] refusing capture: transcript has ${blank.turns} turns`)
    assertEqual(blank.attachments, 0, `[${name}] refusing capture: session has ${blank.attachments} attachments`)
    assert(blank.sessionId !== null, `[${name}] refusing capture: no active session`)
    const composerState = await h.composer()
    const composerText = (composerState.text || '').trim()
    if (expectations.allowInsertedText === true) {
      assert(
        /^(Please adjust the UI elements below|请调整以下 UI 元素)/.test(composerText),
        `[${name}] composer must contain only the inserted structured request: ${short(composerText, 220)}`
      )
    } else {
      assertEqual(composerText, '', `[${name}] refusing capture: composer draft is not empty: ${short(composerText, 160)}`)
    }
    // --- H12: viewport / layout / launcher geometry assertions ---
    const viewport = await h.page.evaluate('({ width: innerWidth, height: innerHeight })')
    assertEqual(viewport.width, VIEWPORT.width, `[${name}] viewport width`)
    assertEqual(viewport.height, VIEWPORT.height, `[${name}] viewport height`)
    const launcher = await h.launcherRect()
    assert(launcher, `[${name}] launcher missing`)
    if (expectations.modeOn === true) {
      const frame = await h.frame()
      const railWidth = Number.parseFloat(frame.railWidthVar || '0')
      assert(frame.rail !== null, `[${name}] rail missing while the mode is active`)
      assertNear(frame.rail.x + frame.rail.width, viewport.width, 2, `[${name}] rail must be right-anchored`)
      assertNear(frame.rail.x, viewport.width - railWidth, 2, `[${name}] rail must sit at viewportWidth - railWidth`)
      const footerState = await h.page.eval(probes.railFooterState)
      assert(!footerState.overlapsFooter, `[${name}] launcher overlaps the rail footer: ${JSON.stringify(footerState)}`)
      assert(!footerState.overlapsRail, `[${name}] launcher overlaps the rail: ${JSON.stringify(footerState)}`)
    } else {
      assertNear(launcher.left + launcher.width, viewport.width - 8, 3, `[${name}] launcher must use the default bottom-right position`)
      assertNear(launcher.top + launcher.height, viewport.height - 8, 3, `[${name}] launcher must use the default bottom-right position`)
    }
    if (expectations.expectPopover === true) {
      const popoverRect = await h.page.eval(probes.popoverRect)
      assert(popoverRect, `[${name}] popover missing for the capture`)
      assert(popoverRect.left >= 0 && popoverRect.top >= 0, `[${name}] popover overflows the viewport: ${JSON.stringify(popoverRect)}`)
      assert(
        popoverRect.right <= popoverRect.viewport.width && popoverRect.bottom <= popoverRect.viewport.height,
        `[${name}] popover overflows the viewport: ${JSON.stringify(popoverRect)}`
      )
    }
    const data = await h.page.screenshotBase64()
    await h.page.eval(probes.privacyRemove)
    await sleep(80)
    const buffer = Buffer.from(data, 'base64')
    const size = pngSize(buffer)
    assertEqual(size.width, VIEWPORT.width, `[${name}] captured PNG width`)
    assertEqual(size.height, VIEWPORT.height, `[${name}] captured PNG height`)
    shots.push({ name, buffer })
    return name
  }

  // H12: clear the annotation browser storage so the idle capture shows the real default launcher
  // position, then reload so no stale mode/collection state is captured.
  await h.ensureModeOff()
  const cleared = await h.page.eval(probes.clearAnnotationStorage)
  await h.page.reload()
  await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready for the screenshot pass' })
  await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher for the screenshot pass' })
  await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
  await sleep(700)
  await h.ensureSidebarExpanded()
  try {
    await h.page.waitFor(
      `!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`,
      { timeout: 12000, interval: 250, label: 'session restored for the screenshot pass' }
    )
  } catch {
    // no session restored; the blank check below decides whether one must be created
  }
  let blank = await h.blankState()
  if (!blank.ok) {
    log(
      `      screenshot session ${blank.sessionId ?? '(none)'} is not blank ` +
        `(messages=${blank.messages}, draft=${JSON.stringify(blank.draft)}, attachments=${blank.attachments}); ` +
        'creating a fresh blank session'
    )
    blank = await h.createBlankSessionViaHover()
  }
  assert(blank.ok, `the screenshot pass could not confirm a blank session: ${JSON.stringify(blank)}`)
  h.track(blank.sessionId, 'screenshots-session')
  h.state.shotsSessionId = blank.sessionId
  await sleep(500)

  // 1) Idle: the launcher only, mode off, default bottom-right position.
  await capture('annotation-idle.png', { modeOn: false })
  // 2) Mode: shrunk page + right rail.
  await h.activate()
  await sleep(350)
  await capture('annotation-mode.png', { modeOn: true })
  // 3) Selection: a small native control with a clear label + popover + note.
  const composerBar = '[data-conversation-region="composer"]'
  const modelButton = await h.page.eval((scope) => {
    const root = document.querySelector(scope)
    if (root === null) return null
    for (const button of root.querySelectorAll('button')) {
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      if (rect.width < 40 || rect.height < 10) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const text = (button.innerText || '').replace(/\s+/g, ' ').trim()
      if (!/DeepSeek|V4\.1|Flash/i.test(text)) continue
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), text }
    }
    return null
  }, composerBar)
  assert(modelButton, 'model selector button not found for the selection pose')
  await h.page.clickAt(modelButton.x, modelButton.y)
  await sleep(400)
  assert((await h.ui()).popover, 'popover missing while posing the selection screenshot')
  const noteRect = await h.page.findRect('[data-psa-note]')
  assert(noteRect, 'popover note textarea not found')
  await h.page.clickAt(noteRect.x, noteRect.y)
  await sleep(120)
  await h.page.insertText('Show the full model name')
  await sleep(220)
  await capture('annotation-selection.png', { modeOn: true, expectPopover: true })
  await h.click('[data-psa-add]')
  await sleep(300)
  await h.clearSelection()
  // Two more small native controls for the collection view (unique labels -> resolved).
  for (const spec of [
    { pattern: /Full access|完全访问|Full Access/, note: 'Clarify the permission scope here' },
    { pattern: /UI: Follow|Follow global|跟随全局/, note: 'Explain what this scope controls' },
  ]) {
    const hit = await h.page.eval((scope, source) => {
      const matcher = new RegExp(source, 'i')
      const root = document.querySelector(scope)
      if (root === null) return null
      for (const button of root.querySelectorAll('button')) {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        if (rect.width < 30 || rect.height < 10) continue
        if (style.display === 'none' || style.visibility === 'hidden') continue
        if (rect.top < 0 || rect.bottom > innerHeight) continue
        const text = (button.innerText || '').replace(/\s+/g, ' ').trim()
        if (!matcher.test(text)) continue
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), text }
      }
      return null
    }, composerBar, spec.pattern.source)
    if (hit === null) continue
    await h.page.clickAt(hit.x, hit.y)
    await sleep(350)
    if (!(await h.ui()).popover) continue
    const rect = await h.page.findRect('[data-psa-note]')
    if (rect !== null) {
      await h.page.clickAt(rect.x, rect.y)
      await sleep(100)
      await h.page.insertText(spec.note)
      await sleep(200)
    }
    await h.click('[data-psa-add]')
    await sleep(250)
    await h.clearSelection()
  }
  await h.ensureStatusPanel()
  // 4) Collection view inside the rail.
  await h.openCollection()
  await sleep(300)
  await capture('annotation-collection.png', { modeOn: true })
  // 5) Composer with the structured batch request inserted (not sent).
  await h.click('[data-psa-insert-batch]')
  const headerPattern = /Please adjust the UI elements below|请调整以下 UI 元素/
  await h.page.waitFor(
    `(${headerPattern.toString()}).test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || '')`,
    { timeout: 8000, label: 'batch insert for the composer screenshot' }
  ).catch(() => {})
  await sleep(350)
  await h.clickBack()
  await sleep(300)
  await capture('annotation-inserted.png', { modeOn: true, allowInsertedText: true })
  await h.exit()
  await h.ensureModeOff()
  h.state.clearedStorageKeys = cleared
  return shots
}

// ---------------------------------------------------------------------------------------------
// Feature presence
// ---------------------------------------------------------------------------------------------

/**
 * Whether the injected client actually mounted the annotation feature.
 * @param {Page} page - attached page.
 * @returns {Promise<boolean>} true when at least one feature marker exists.
 */
async function featurePresent(page) {
  for (const marker of ['[data-psa-launcher]']) {
    if ((await page.count(marker)) > 0) return true
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// Session bookkeeping and blank-session setup (H2)
// ---------------------------------------------------------------------------------------------

/** Track one created/opened session id exactly once, with the reason it was touched. */
function trackSession(state, sessionId, source) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  if (!state.sessions.includes(sessionId)) state.sessions.push(sessionId)
  if (state.sessionSources === undefined) state.sessionSources = new Map()
  if (typeof source === 'string' && source.length > 0) state.sessionSources.set(sessionId, source)
  return sessionId
}

/** Read the blank-session predicate from the live page. */
async function readBlankState(page) {
  return page.eval(probes.blankCheck)
}

/**
 * Create a genuinely new blank session through the native "New session in <workspace>" hover
 * action. The GUI can restore the last active session, which may be a user session; the
 * harness must never type or insert into such a session. Every workspace row is tried (hover
 * reveals the action); the new id must differ from the previous one and verify blank.
 * @param {Page} page - attached page.
 * @param {object} state - run state (session ids are tracked for cleanup).
 * @returns {Promise<object>} the verified blank predicate.
 */
async function createBlankSessionViaHover(page, state) {
  const readSession = () => page.evaluate(
    `document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null`
  )
  const before = await readSession()
  const failures = []
  /** Click one native hover action and verify that a new blank session was opened. */
  const tryAction = async (action) => {
    await page.clickAt(action.x, action.y)
    let sessionId = before
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) {
      await sleep(250)
      sessionId = await readSession()
      if (sessionId !== null && sessionId !== before) break
    }
    if (sessionId === null || sessionId === before) {
      failures.push(`${action.label}: no session change`)
      return null
    }
    trackSession(state, sessionId, 'native-new-session-hover-action')
    await sleep(650)
    const blank = await readBlankState(page)
    if (blank.ok) return blank
    failures.push(`${action.label}: opened ${sessionId} but it is not blank (messages=${blank.messages}, draft=${JSON.stringify(blank.draft)})`)
    return null
  }
  /** Hover the visible workspace rows and try their "New session in <workspace>" actions. */
  const tryWorkspaceRows = async () => {
    const workspaceRows = await page.eval(probes.workspaceRows)
    for (const row of workspaceRows.slice(0, 6)) {
      await page.moveTo(row.x, row.y)
      await sleep(600)
      const action = await page.eval(probes.newSessionActionNear, row)
      if (action === null) continue
      const blank = await tryAction(action)
      if (blank !== null) return blank
    }
    return null
  }
  // A) Workspace rows currently visible in ACTIVE PROJECTS.
  let blank = await tryWorkspaceRows()
  if (blank !== null) return blank
  // B) Other workspaces live further down the scrollable sidebar list and their hover action
  // creates a fresh blank session in that workspace. Scroll the list and retry.
  const workspaceScroll = await page.eval(probes.workspaceScrollPoint)
  if (workspaceScroll !== null) {
    for (const delta of [300, 300, 300, -900, 300]) {
      await page.wheel(workspaceScroll.x, workspaceScroll.y, delta)
      await sleep(500)
      blank = await tryWorkspaceRows()
      if (blank !== null) return blank
    }
  }
  // C) Recent session rows ("New session in this directory"): creates a genuinely new blank
  // session in that directory even when the active workspace already has the current draft.
  const recentRows = await page.eval(probes.recentSessionRows)
  for (const row of recentRows.slice(0, 5)) {
    await page.moveTo(row.x, row.y)
    await sleep(600)
    const action = (await page.eval(probes.newSessionActionNear, {
      top: row.y - 14,
      bottom: row.y + 14,
    })) || (await page.eval(probes.nearestNewSessionAction, row.y))
    if (action === null) {
      const diag = await page.evaluate(`(() => {
        const buttons = [...document.querySelectorAll('button[aria-label^="New session in"]')]
        const rects = buttons.map((button) => { const rect = button.getBoundingClientRect(); const style = getComputedStyle(button); return { label: button.getAttribute('aria-label'), top: Math.round(rect.top), h: Math.round(rect.height), w: Math.round(rect.width), display: style.display, visibility: style.visibility, opacity: style.opacity, pe: style.pointerEvents } })
        const hit = document.elementFromPoint(${row.x}, ${row.y})
        let ancestor = hit
        for (let depth = 0; ancestor !== null && depth < 6; depth += 1) ancestor = ancestor.parentElement
        return { total: buttons.length, sample: rects.slice(0, 4), hit: hit ? hit.tagName + ':' + String(hit.className || '').slice(0, 30) : null }
      })()`)
      failures.push(`${row.label}: no new-session action (diag=${JSON.stringify(diag)})`)
      continue
    }
    const result = await tryAction(action)
    if (result !== null) return result
  }
  throw new Error(
    'could not create a genuinely blank session through a native "New session in ..." hover action: ' +
      (failures.length > 0 ? failures.join('; ') : 'no action was found')
  )
}

/**
 * Open/verify one blank session. The GUI autorestores the last active session after load; it
 * is only used when it verifies blank (0 transcript messages, empty composer draft, no
 * attachments). Otherwise the harness creates a fresh blank session through the native hover
 * action; if that is impossible it aborts instead of contaminating a non-blank session.
 * @param {Page} page - attached page.
 * @param {object} state - run state (session ids are tracked for cleanup).
 * @returns {Promise<object>} frame/session metrics after the session exists.
 */
async function ensureBlankSession(page, state) {
  let restored = false
  try {
    await page.waitFor(
      `!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`,
      { timeout: 12000, interval: 200, label: 'auto-restored session' }
    )
    restored = true
  } catch {
    restored = false
  }
  let blank = await readBlankState(page)
  if (!blank.ok && blank.sessionId === null) {
    // No session restored at all: the native New Session button is the documented setup path.
    const button = await page.eval(pageProbe.newSessionButton)
    assert(button, 'native New Session button not found')
    await page.clickAt(button.x, button.y)
    await page.waitFor(
      `!!document.querySelector('[data-conversation-session]') && !!document.querySelector('[data-lexical-editor="true"]')`,
      { timeout: 20000, label: 'session + composer after native New Session' }
    )
    await sleep(400)
    blank = await readBlankState(page)
  }
  if (blank.ok) {
    state.blankStateSource = restored ? 'auto-restored session verified blank' : 'native New Session verified blank'
  } else {
    if (blank.sessionId !== null) trackSession(state, blank.sessionId, 'non-blank-session-not-used')
    log(
      `      restored session ${blank.sessionId ?? '(none)'} is not blank ` +
        `(messages=${blank.messages}, turns=${blank.turns}, draft=${JSON.stringify(blank.draft)}, ` +
        `editorImages=${blank.editorImages}, attachments=${blank.attachments}); creating a fresh blank session`
    )
    blank = await createBlankSessionViaHover(page, state)
    state.blankStateSource = 'created via native "New session in <workspace>" (restored session was not blank)'
  }
  assert(blank.ok, `the harness could not confirm a blank session before typing/inserting: ${JSON.stringify(blank)}`)
  trackSession(state, blank.sessionId, 'blank-session-used')
  await sleep(400)
  const metrics = await page.eval(pageProbe.metrics)
  state.sessionId = blank.sessionId
  state.sessionRows = metrics.sessionRows
  state.sessionRestored = restored
  state.blankState = blank
  assertEqual(metrics.sessionId, blank.sessionId, 'blank predicate and frame probe disagree about the current session')
  return metrics
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

/** Write the capture buffers to docs/assets (--assets) or to the OS temp directory. */
async function writeScreenshots(shots, opts, state) {
  const shotsDir = opts.assets ? ASSETS_DIR : path.join(tmpdir(), 'psa-e2e-shots')
  await mkdir(shotsDir, { recursive: true })
  for (const shot of shots) {
    const target = path.join(shotsDir, shot.name)
    await writeFile(target, shot.buffer)
    log(`wrote ${target} (${shot.buffer.length} bytes)`)
    state.screenshots.push(target)
  }
  return shotsDir
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const started = Date.now()

  log('DSH Power Suite — UI annotation live E2E')
  log(`node: ${process.version}`)
  log(`client: ${opts.clientPath}`)
  const clientSource = await readFile(opts.clientPath, 'utf8')
  log(`client size: ${(clientSource.length / 1024).toFixed(0)} KiB`)

  const url = await resolveGuiUrl(opts)
  log(`GUI: ${redact(url)}`)

  let chrome = null
  let page = null
  const state = {
    sessionId: null,
    sessions: [],
    sessionSources: new Map(),
    blankState: null,
    blankStateSource: null,
    baseline: null,
    hooks: [],
    screenshots: [],
    shotsSessionId: null,
    clearedStorageKeys: [],
  }
  const results = new Results()
  let fatal = null
  let exitCode = 0

  // H1: the scenarios this invocation was asked to execute; every one must produce a row.
  const expectedScenarioIds = opts.scenario !== null
    ? [opts.scenario]
    : (opts.from !== null ? SCENARIO_ORDER.filter((id) => id >= opts.from) : [...SCENARIO_ORDER])

  try {
    chrome = await launchChrome(opts)
    log(`chrome: headless pid ${chrome.proc.pid}, CDP port ${chrome.port}`)
    const cdp = await CdpConnection.connect(chrome.wsUrl)
    page = await Page.open(cdp, url, injectorSource(clientSource))
    log('page: opened, waiting for the DSH shell…')

    await runSmoke({ page, results, state })
    const feature = await featurePresent(page)

    if (!feature) {
      // H1: a missing feature must never be a green run in full/shots mode.
      results.recordFailure(
        'gate-feature',
        'injected client exposes the annotation feature',
        'the injected client did not mount the annotation surface ([data-psa-launcher] missing)'
      )
      if (opts.mode === 'full') {
        log('\n=== Acceptance scenarios (CONTRACT.md section 4.2) ===')
        for (const id of expectedScenarioIds) {
          results.recordFailure(id, SCENARIO_TITLES[id], 'not executed: the injected client does not expose the annotation feature')
        }
        log('FEATURE GATE: the injected client does not expose the annotation feature — failing the run.')
      } else if (opts.mode === 'shots') {
        log('FEATURE GATE: the injected client does not expose the annotation feature — no screenshots produced.')
      }
    } else if (opts.mode === 'shots') {
      const harness = new Harness(page, state)
      log('\n=== Screenshots only (1728x900 originals, sidebar/header/content privacy-guarded) ===')
      const shots = await captureScreenshots(harness)
      await writeScreenshots(shots, opts, state)
    } else if (opts.mode === 'full') {
      log('\n=== Acceptance scenarios (CONTRACT.md section 4.2) ===')
      const harness = new Harness(page, state)
      await runScenarios(harness, results, opts)
      for (const id of expectedScenarioIds) {
        if (!results.hasRow(id)) {
          results.recordFailure(id, SCENARIO_TITLES[id], 'requested scenario did not produce a result row')
        }
      }
      if (opts.shots && results.failures.length === 0) {
        log('\n=== Screenshots (1728x900 originals, sidebar/header/content privacy-guarded) ===')
        const shots = await captureScreenshots(harness)
        await writeScreenshots(shots, opts, state)
      } else if (opts.shots) {
        log('\nSkipping screenshots: acceptance scenarios failed.')
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
  const networkProblems = page !== null ? page.networkProblems : []
  const nonJsErrors = page !== null ? page.logEntries : []

  log('\n=== Results ===')
  for (const row of results.rows) {
    log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.id}  ${row.title}${row.pass ? '' : `\n        ↳ ${short(row.detail, 700)}`}`)
  }
  log(`\nPASS ${passed} / FAIL ${failed}`)
  log(`page errors: ${pageErrors.length}`)
  for (const error of pageErrors.slice(0, 8)) log(`  ! ${error}`)
  log(`real network failures: ${networkProblems.length}`)
  for (const problem of networkProblems.slice(0, 10)) log(`  ! ${problem}`)
  log(`non-JS console/log errors: ${nonJsErrors.length}`)
  for (const entry of nonJsErrors.slice(0, 10)) log(`  ! ${entry}`)
  const uniqueSessions = [...new Set(state.sessions)]
  log(`created/reused sessions (${uniqueSessions.length}):`)
  for (const sessionId of uniqueSessions) {
    const source = state.sessionSources instanceof Map ? state.sessionSources.get(sessionId) : undefined
    log(`  ${sessionId}${source ? ` — ${source}` : ''}`)
  }
  if (state.shotsSessionId !== null) log(`screenshots session: ${state.shotsSessionId}`)
  if (state.clearedStorageKeys.length > 0) log(`cleared annotation localStorage: ${state.clearedStorageKeys.join(', ')}`)
  if (state.screenshots.length > 0) log(`screenshots: ${state.screenshots.join(', ')}`)
  log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`)
  if (fatal !== null) log(`fatal: ${short(fatal.message || String(fatal), 600)}`)

  if (failed > 0 || pageErrors.length > 0 || networkProblems.length > 0) exitCode = exitCode || 1
  log(`exit code: ${exitCode}`)
  process.exit(exitCode)
}

main().catch((error) => {
  // Argument validation errors are user-facing messages, not stack traces (H1).
  if (error?.exitCode === 2 && typeof error.message === 'string') {
    console.error(`error: ${error.message}`)
  } else {
    console.error(redact(error?.stack || String(error)))
  }
  process.exit(error?.exitCode === 2 ? 2 : 2)
})
