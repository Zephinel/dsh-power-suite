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
/** A second real-shaped Session id used by the other-Session mark assertions. */
const SESSION_ID_OTHER = 'session-5eec2763-0a91-460e-b559-08a8c3a98d13'

const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 }

// H10 network predicate (documented verbatim in test/browser/README.md):
// count a failure only when it is same-origin http(s) AND one of:
//   - a response with status >= 400 for a Document/Fetch/XHR request, or a path under
//     /api/ or /plugins/ (the DSH API and plugin-bundle routes);
//   - a non-canceled Fetch/XHR/Document/Script/Stylesheet loading failure on such a URL.
// Ignore favicon.ico, third-party origins, chrome-extension:, data: and blob: noise.
const NETWORK_PREDICATE_TEXT =
  'same-origin http(s)+DSH API/plugin routes only (Document/Fetch/XHR or /api/ or /plugins/); ' +
  'favicon, third-party, extension and data:/blob: noise ignored'
const KEY_DEFS = {
  alt: { key: 'Alt', code: 'AltLeft', vk: 18, mod: MOD.alt },
  control: { key: 'Control', code: 'ControlLeft', vk: 17, mod: MOD.ctrl },
  meta: { key: 'Meta', code: 'MetaLeft', vk: 91, mod: MOD.meta },
  shift: { key: 'Shift', code: 'ShiftLeft', vk: 16, mod: MOD.shift },
  escape: { key: 'Escape', code: 'Escape', vk: 27, mod: 0 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8, mod: 0 },
  end: { key: 'End', code: 'End', vk: 35, mod: 0 },
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

/**
 * Assert two rectangles agree on every edge within a tolerance.
 * @param {{ x: number, y: number, width: number, height: number }} actual - measured rectangle.
 * @param {{ x: number, y: number, width: number, height: number }} expected - expected rectangle.
 * @param {number} tolerance - maximum per-edge difference in pixels.
 * @param {string} message - assertion message.
 * @returns {void}
 */
function assertRectNear(actual, expected, tolerance, message) {
  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    throw new Error(`${message} (missing rect: actual=${short(JSON.stringify(actual))}, expected=${short(JSON.stringify(expected))})`)
  }
  for (const key of ['x', 'y', 'width', 'height']) {
    assertNear(actual[key], expected[key], tolerance, `${message} [${key}]`)
  }
}

/** Privacy-safe summary of a composer draft for logs: never print the draft text itself. */
function draftPreview(text) {
  const value = typeof text === 'string' ? text : ''
  if (value.length === 0) return 'empty (0 chars)'
  const head = value.slice(0, 8).replace(/\s+/g, ' ')
  return `${value.length} chars, starts "${head}${value.length > 8 ? '…' : ''}"`
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
    if (!Number.isInteger(value) || value < 1 || value > 15) {
      const error = new Error(`invalid ${name} "${raw}": expected an integer in the 1..15 scenario range`)
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
    // H10: never swallow a Network.enable failure — without the domain the failure oracle is
    // blind, so it must be reported and fail the run.
    page.networkEnabled = false
    try {
      await page.send('Network.enable')
      page.networkEnabled = true
    } catch (error) {
      page.networkEnableError = short(error?.message || String(error), 300)
    }
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
    this.networkFailures = []
    this.networkProblems = []
    this.networkIgnored = 0
    this.networkEnabled = false
    this.networkEnableError = null
    this.origin = null
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
        if (!this.isRealNetworkFailure(url, params.type)) {
          this.networkIgnored += 1
          return
        }
        this.networkProblems.push(`${status} ${params.type || '?'} ${short(url, 180)}`)
      }),
      cdp.on('Network.loadingFailed', (params, eventSession) => {
        if (eventSession !== this.sessionId) return
        if (params.canceled) return
        const info = this._requestUrls.get(params.requestId) || {}
        const url = String(info.url || '')
        const type = String(params.type || info.type || '?')
        if (!['Fetch', 'XHR', 'Document', 'Script', 'Stylesheet'].includes(type)) return
        if (!this.isRealNetworkFailure(url, type)) {
          this.networkIgnored += 1
          return
        }
        const text = `${params.errorText || 'failed'} ${type} ${short(url, 180)}`
        this.networkFailures.push(text)
        this.networkProblems.push(text)
      }),
    ]
  }

  send(method, params = {}, timeoutMs) {
    return this.cdp.send(method, params, this.sessionId, timeoutMs)
  }

  /** Same-origin http(s) URL test for the network failure oracle (H10). */
  isSameOriginHttp(url) {
    try {
      const parsed = new URL(url)
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
        && this.origin !== null
        && parsed.origin === this.origin
    } catch {
      return false
    }
  }

  /** Whether one response/loading failure belongs to the same-origin DSH API/plugin surface. */
  isRealNetworkFailure(url, type) {
    if (!this.isSameOriginHttp(url)) return false
    let pathname = ''
    try {
      pathname = new URL(url).pathname
    } catch {
      return false
    }
    if (/\/favicon\.ico$/i.test(pathname)) return false
    if (pathname.startsWith('/api/') || pathname.startsWith('/plugins')) return true
    return ['Document', 'Fetch', 'XHR'].includes(type)
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
      // A busy renderer can delay one evaluate past the CDP timeout; retry once with a short
      // backoff. Page-side exceptions are NOT retried (they are real assertion-relevant errors).
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
      if (!/CDP command timed out/i.test(error?.message || '')) throw error
      // N5: only pointer moves are safe to repeat blindly. Press/release/click dispatches are
      // non-idempotent; their retry is decided by clickAt()/drag() after re-reading state.
      if (event.type !== 'mouseMoved') throw error
      await sleep(600)
      await this.send('Input.dispatchMouseEvent', event, 30000)
    }
  }

  async moveTo(x, y, modifiers = 0) {
    await this.mouse({ type: 'mouseMoved', x, y, modifiers })
  }

  /**
   * One real click. On a CDP timeout the gesture is retried only when the caller supplies
   * `appliedWhen` (a postcondition probe): if the postcondition already holds, the action is
   * considered applied and is NOT repeated (N5); if it does not hold, the gesture is retried
   * exactly once. Without a postcondition a timeout fails honestly.
   */
  async clickAt(x, y, { modifiers = 0, button = 'left', clickCount = 1, appliedWhen = null } = {}) {
    const run = async () => {
      await this.moveTo(x, y, modifiers)
      await this.mouse({ type: 'mousePressed', x, y, button, clickCount, modifiers })
      await sleep(40)
      await this.mouse({ type: 'mouseReleased', x, y, button, clickCount, modifiers })
      await sleep(80)
    }
    try {
      await run()
    } catch (error) {
      if (!/CDP command timed out/i.test(error?.message || '')) throw error
      if (typeof appliedWhen !== 'function') throw error
      let applied = false
      try {
        applied = Boolean(await appliedWhen())
      } catch {
        applied = false
      }
      if (applied) return
      await sleep(900)
      await run()
    }
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

  /**
   * One real drag. Like clickAt(), a CDP timeout is retried only when the caller-provided
   * `appliedWhen` postcondition shows the gesture did not take effect (N5).
   */
  async drag(from, to, { modifiers = 0, steps = 12, button = 'left', appliedWhen = null } = {}) {
    const run = async () => {
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
    try {
      await run()
    } catch (error) {
      // Known late-run renderer stall: retry only if the postcondition proves nothing happened.
      if (!/CDP command timed out/i.test(error?.message || '')) throw error
      if (typeof appliedWhen !== 'function') throw error
      let applied = false
      try {
        applied = Boolean(await appliedWhen())
      } catch {
        applied = false
      }
      if (applied) return
      await sleep(1000)
      await run()
    }
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

  /**
   * Record an explicit SKIP row (cross-branch dependency, environment absence).
   * A skip is never a PASS: the run reports it separately, and it does not fail
   * the gate because the product path under test is not present in this branch.
   * @param {string} id - row id.
   * @param {string} title - row title.
   * @param {string} detail - why it was skipped.
   * @returns {void}
   */
  skip(id, title, detail) {
    this.rows.push({ id, title, pass: true, skipped: true, detail: short(detail, 400), ms: 0 })
    log(`SKIP  ${id}  ${title} — ${short(detail, 300)}`)
  }

  hasRow(id) {
    return this.rows.some((row) => row.id === id)
  }

  /**
   * Replace a just-recorded PASS row with an explicit SKIP row (cross-branch
   * dependency / environment absence). Never a fake PASS, never a duplicate id.
   * @param {string} id - row id.
   * @param {string} title - row title.
   * @param {string} detail - why the row cannot be verified on this branch.
   * @returns {void}
   */
  replaceWithSkip(id, title, detail) {
    this.rows = this.rows.filter((row) => row.id !== id)
    this.skip(id, title, detail)
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

  await results.check('smoke-3', 'frozen test seam pinned key set (31 round-1 / 32 resolveNodeCandidate / 35 audit-fix / 48 Phase 1 / 57 Phase 2-A / 66 Phase 2-B / 67 inner-first / 68 leaf-first / 76 batch groups / 79 sidebar redesign / 80 shared group ordinals / 82 surface pinning / 90 multi-strategy anchors / 91 P0 stability / 97 anchor hardening)', async () => {
    const probe = await page.evaluate(
      `(() => { const flag = window.__POWER_SUITE_TEST_HOOKS__; const hook = flag && flag.uiAnnotation; return { flagType: typeof flag, hookType: typeof hook, keys: hook && typeof hook === 'object' ? Object.keys(hook) : [] } })()`
    )
    assertEqual(probe.flagType, 'object', 'test hook flag type')
    assertEqual(probe.hookType, 'object', 'hooks.uiAnnotation is not an object')
    // Documented frozen generations: round-1 (31), round-2 adds resolveNodeCandidate
    // (32), audit-fix adds normalizeUserNote/cssIdentifier/clampPopoverPositionToViewport
    // (35), Phase 1 adds the A1/A2/persistence helpers (48), Phase 2-A adds the record
    // action/undo/mark/detail-card helpers (57), Phase 2-B adds the multi-delete undo,
    // rail selection and chip-ref serialization helpers (66). Pin a documented count and
    // require the keys that generation introduced.
    const ACCEPTED_SEAM_GENERATIONS = [31, 32, 35, 48, 57, 66, 67, 68, 76, 79, 80, 82, 90, 91, 97]
    const keyCount = probe.keys.length
    assert(
      ACCEPTED_SEAM_GENERATIONS.includes(keyCount),
      `frozen seam must expose a documented generation (got ${keyCount} keys: ${probe.keys.join(', ') || 'none'})`
    )
    assert(probe.keys.includes('textDigest'), `textDigest is missing from the seam (keys: ${probe.keys.join(', ')})`)
    if (keyCount >= 32) {
      assert(probe.keys.includes('resolveNodeCandidate'), `round-2+ seam must expose resolveNodeCandidate (keys: ${probe.keys.join(', ')})`)
    }
    if (keyCount === 35) {
      for (const key of ['normalizeUserNote', 'cssIdentifier', 'clampPopoverPositionToViewport']) {
        assert(probe.keys.includes(key), `audit-fix seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 48) {
      for (const key of ['RECORDS_STORAGE_KEY', 'RECORD_LIMIT', 'buildUniqueSelector', 'buildStableAncestors',
        'parseAnnotationStore', 'serializeAnnotationStore', 'annotationSurfaceRoot', 'annotationSurfaceLevels',
        'annotationLocatorText', 'normalizeAnnotationRecord']) {
        assert(probe.keys.includes(key), `Phase 1 seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 57) {
      for (const key of ['upsertAnnotationRecord', 'removeAnnotationRecord', 'restoreAnnotationRecord',
        'moveAnnotationRecord', 'toggleAnnotationInclude', 'annotationUndoRemove', 'annotationUndoRestore',
        'annotationMarkerBadgeText', 'clampDetailCardPosition']) {
        assert(probe.keys.includes(key), `Phase 2-A seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 66) {
      for (const key of ['annotationUndoRemoveMany', 'annotationScopeCounts', 'annotationSelectedEntries',
        'annotationApplyIncludes', 'annotationChipRefOf', 'annotationChipRefBatch', 'parseAnnotationChipRef',
        'annotationChipCandidates', 'serializeAnnotationChip']) {
        assert(probe.keys.includes(key), `Phase 2-B seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 67) {
      for (const key of ['annotationSurfacePickLevel', 'annotationSurfaceLevels', 'annotationSurfaceRoot']) {
        assert(probe.keys.includes(key), `inner-first surface seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 68) {
      for (const key of ['annotationLeafPickIndex', 'annotationSurfacePickLevel', 'annotationSurfaceLevels', 'annotationSurfaceRoot']) {
        assert(probe.keys.includes(key), `leaf-first seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 76) {
      for (const key of ['annotationLeafPickIndex', 'annotationGroupFromSelection', 'collectionAddGroup', 'serializeBatchEntries']) {
        assert(probe.keys.includes(key), `batch-group seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 79) {
      for (const key of ['annotationGroupFromSelection', 'annotationSidebarCounts', 'annotationFilterEntries', 'annotationGroupSummary']) {
        assert(probe.keys.includes(key), `redesigned-sidebar seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 80) {
      for (const key of ['annotationEntryOrdinals', 'annotationGroupSummary', 'annotationSidebarCounts']) {
        assert(probe.keys.includes(key), `task-29 seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 82) {
      for (const key of ['annotationSurfacePinEligible', 'annotationSurfacePinEventMatches', 'annotationEntryOrdinals']) {
        assert(probe.keys.includes(key), `task-30 seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 90) {
      for (const key of ['annotationResolveStatus', 'annotationXPathOf', 'annotationTextQuoteMatches', 'annotationSelectorScore']) {
        assert(probe.keys.includes(key), `task-32 seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 91) {
      for (const key of ['annotationIsGeneratedClass', 'resolveRefStatus', 'annotationResolveStatus']) {
        assert(probe.keys.includes(key), `task-33 seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    if (keyCount === 97) {
      for (const key of ['annotationDisambiguateQuote', 'annotationScoreQuoteMatches', 'annotationRenderTextChunks', 'annotationFullXPathOf', 'annotationFallbackCacheKey']) {
        assert(probe.keys.includes(key), `task-34 seam must expose ${key} (keys: ${probe.keys.join(', ')})`)
      }
    }
    state.hooks = probe.keys
    return `uiAnnotation seam: ${keyCount} keys`
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

  /** Every visible workspace row point, for expanding workspace groups in the sidebar. */
  workspaceRowPoints: () => [...document.querySelectorAll('[data-row-key^="workspace:"]')]
    .map((element) => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      if (rect.top < 0 || rect.bottom > innerHeight) return null
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })
    .filter((point) => point !== null),

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
    const chat = document.querySelector('[data-conversation-region="chat"]')
    const sessionId = session !== null ? session.getAttribute('data-conversation-session') : null
    const composerFound = composer !== null
    const editorFound = editor !== null
    const chatPresent = chat !== null
    // N3: counts alone can misclassify a non-Chat/virtualized view as blank, so require the
    // session root, the composer, its Lexical editor and the Chat view as well.
    const ok = sessionId !== null && composerFound && editorFound && chatPresent
      && messages === 0 && turns === 0 && draft === '' && editorImages === 0 && attachmentNodes === 0
    return {
      ok,
      sessionId,
      messages,
      turns,
      draft,
      editorImages,
      attachments: attachmentNodes,
      composerFound,
      editorFound,
      chatPresent,
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

  /** Re-locate control rect for the first visible collection entry in one scope (N4). */
  entryRelocateRect: (scope) => {
    for (const entry of document.querySelectorAll(`[data-psa-entry][data-psa-entry-scope="${scope}"]`)) {
      const button = entry.querySelector('[data-psa-entry-relocate]')
      if (button === null) continue
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      if (rect.width <= 0 || rect.height <= 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        ref: entry.getAttribute('data-psa-ref'),
        label: (button.innerText || '').trim(),
      }
    }
    return null
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

  // ---- Phase 1 probes: floating surfaces, paint layer, v2 records, rainbow focus ----

  /** Capture power-suite:ui-annotation-state events (F4 contract). */
  installAnnotationStateRecorder: () => {
    if (window.__psaStateEventsInstalled === true) return true
    window.__psaStateEventsInstalled = true
    window.__psaStateEvents = []
    const record = (event) => {
      window.__psaStateEvents.push({
        active: event !== null && typeof event === 'object' ? event.detail?.active === true : false,
        at: Date.now(),
      })
    }
    document.addEventListener('power-suite:ui-annotation-state', record, true)
    window.addEventListener('power-suite:ui-annotation-state', record, true)
    return true
  },
  readAnnotationStateEvents: () => window.__psaStateEvents || [],
  clearAnnotationStateEvents: () => {
    window.__psaStateEvents = []
    return true
  },

  /**
   * Synthetic `[data-psd-hovercard]` node for the annotation-side F4 CSS contract.
   * Its default `pointer-events:none` comes from a stylesheet class (like the real
   * hovercard), so the annotation override can win on specificity exactly as it
   * would there; z-index is inline and the override is `!important` (D3 contract).
   */
  createSyntheticHovercard: () => {
    const existing = document.getElementById('psa-e2e-psd-hovercard')
    if (existing !== null) existing.remove()
    if (document.getElementById('psa-e2e-hovercard-style') === null) {
      const style = document.createElement('style')
      style.id = 'psa-e2e-hovercard-style'
      style.textContent = '.psa-e2e-hovercard{pointer-events:none}'
      document.head.appendChild(style)
    }
    const node = document.createElement('div')
    node.id = 'psa-e2e-psd-hovercard'
    node.className = 'psa-e2e-hovercard'
    node.setAttribute('data-psd-hovercard', '')
    Object.assign(node.style, {
      position: 'fixed',
      left: '4px',
      top: '4px',
      width: '40px',
      height: '24px',
      zIndex: '5',
      background: 'transparent',
    })
    document.body.appendChild(node)
    return true
  },
  removeSyntheticHovercardStyle: () => {
    document.getElementById('psa-e2e-hovercard-style')?.remove()
    return true
  },
  syntheticHovercardStyle: () => {
    const node = document.getElementById('psa-e2e-psd-hovercard')
    if (node === null) return null
    const style = getComputedStyle(node)
    return { zIndex: style.zIndex, pointerEvents: style.pointerEvents }
  },
  removeSyntheticHovercard: () => {
    document.getElementById('psa-e2e-psd-hovercard')?.remove()
    return true
  },
  /** Whether the dynamic-workspaces hovercard (cross-branch marker) exists in this build. */
  realPsdHovercardPresent: () => document.querySelector('[data-psd-hovercard]') !== null,


  /** One opaque synthetic floating layer used for the F3 stationary-pointer check. */
  createFloatingProbeLayer: (x, y, width, height) => {
    document.getElementById('psa-e2e-floating-layer')?.remove()
    const node = document.createElement('div')
    node.id = 'psa-e2e-floating-layer'
    Object.assign(node.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
      zIndex: '500',
      background: 'rgb(40, 44, 56)',
      pointerEvents: 'auto',
    })
    document.body.appendChild(node)
    const rect = node.getBoundingClientRect()
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
  },
  removeFloatingProbeLayer: () => {
    document.getElementById('psa-e2e-floating-layer')?.remove()
    return true
  },

  /** Synthetic floating panel with text rows and one button, for deterministic drilling. */
  createSurfaceProbePanel: () => {
    document.getElementById('psa-e2e-surface-panel')?.remove()
    const panel = document.createElement('div')
    panel.id = 'psa-e2e-surface-panel'
    Object.assign(panel.style, {
      position: 'fixed',
      left: '360px',
      top: '280px',
      width: '340px',
      height: '170px',
      zIndex: '500',
      background: 'rgb(44, 44, 46)',
      color: 'rgb(235, 238, 245)',
      border: '1px solid rgb(90, 96, 112)',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: '10px',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      fontSize: '13px',
      fontFamily: 'system-ui, sans-serif',
    })
    // A dropdown-like row: left column (title + subtitle) and right meta column
    // (time, token count, chevron icon) — the leaf-first picker must reach each.
    const row = document.createElement('div')
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      padding: '4px 6px',
      borderRadius: '6px',
      background: 'rgb(54, 56, 60)',
    })
    const left = document.createElement('div')
    Object.assign(left.style, { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' })
    const title = document.createElement('span')
    title.textContent = 'Research hovercard session stats'
    Object.assign(title.style, { display: 'block', fontSize: '13px', whiteSpace: 'nowrap' })
    const subtitle = document.createElement('span')
    subtitle.textContent = 'You are a read-only research subagent'
    Object.assign(subtitle.style, { display: 'block', fontSize: '11px', color: 'rgb(180, 184, 192)', whiteSpace: 'nowrap' })
    left.append(title, subtitle)
    const right = document.createElement('div')
    Object.assign(right.style, { display: 'flex', alignItems: 'center', gap: '6px', flex: 'none' })
    const time = document.createElement('span')
    time.textContent = '18m 19s'
    Object.assign(time.style, { display: 'block', fontSize: '11px', whiteSpace: 'nowrap' })
    const token = document.createElement('span')
    token.textContent = '22.4M tok'
    Object.assign(token.style, { display: 'block', fontSize: '11px', whiteSpace: 'nowrap' })
    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    chevron.setAttribute('width', '14')
    chevron.setAttribute('height', '14')
    chevron.setAttribute('viewBox', '0 0 14 14')
    chevron.style.display = 'block'
    chevron.style.flex = 'none'
    const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    chevronPath.setAttribute('d', 'M5 3 L9 7 L5 11 Z')
    chevronPath.setAttribute('fill', 'currentColor')
    chevron.append(chevronPath)
    right.append(time, token, chevron)
    row.append(left, right)
    const status = document.createElement('div')
    status.textContent = 'Status: active'
    panel.append(row, status)
    document.body.appendChild(panel)
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect()
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        centerX: Math.round(rect.x + rect.width / 2),
        centerY: Math.round(rect.y + rect.height / 2),
      }
    }
    return {
      panel: rectOf(panel),
      row: rectOf(row),
      left: rectOf(left),
      right: rectOf(right),
      title: rectOf(title),
      subtitle: rectOf(subtitle),
      time: rectOf(time),
      token: rectOf(token),
      chevron: rectOf(chevron),
      chevronPath: rectOf(chevronPath),
      status: rectOf(status),
      button: null,
    }
  },
  removeSurfaceProbePanel: () => {
    document.getElementById('psa-e2e-surface-panel')?.remove()
    return true
  },

  /** Hover outline rect plus the `.psa-hover` computed border tokens. */
  hoverState: () => {
    const hover = document.querySelector('[data-psa-hover]')
    if (hover === null) return null
    const rect = hover.getBoundingClientRect()
    const style = getComputedStyle(hover)
    return {
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      borderColor: style.borderColor,
    }
  },

  /** Selection outlines and the current popover's surface/record metadata. */
  selectionState: () => {
    const outlines = [...document.querySelectorAll('[data-psa-selection],[data-psa-multi-outline]')].map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        ref: element.getAttribute('data-psa-ref'),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    })
    const popover = document.querySelector('[data-psa-popover]')
    return {
      outlines,
      popover: popover === null ? null : {
        surface: popover.getAttribute('data-psa-surface'),
        ephemeral: popover.getAttribute('data-psa-ephemeral'),
        title: document.querySelector('[data-psa-popover-title]')?.innerText ?? null,
        ref: document.querySelector('[data-psa-popover-ref]')?.innerText ?? null,
        status: document.querySelector('[data-psa-popover-status]')?.getAttribute('data-psa-status') ?? null,
        copyLocator: document.querySelector('[data-psa-popover-copy-locator]') !== null,
        ephemeralHint: document.querySelector('[data-psa-ephemeral-hint]')?.innerText ?? null,
      },
    }
  },

  /** Paint layer state for F1. */
  paintLayerState: () => {
    const overlay = document.querySelector('[data-shell-overlay]')
    return {
      found: overlay !== null,
      inlineZ: overlay !== null ? overlay.style.zIndex : null,
      inlinePriority: overlay !== null ? overlay.style.getPropertyPriority('z-index') : null,
      computedZ: overlay !== null ? getComputedStyle(overlay).zIndex : null,
      raised: document.documentElement.getAttribute('data-psa-raised'),
    }
  },

  /** Floating surfaces currently painted above page content (excluding our own UI). */
  floatingCandidates: () => {
    const floats = []
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element)
      if (style.position !== 'fixed' && style.position !== 'absolute') continue
      const z = Number.parseInt(style.zIndex, 10)
      if (!Number.isFinite(z) || z < 10) continue
      if (element.closest('[data-psa-own]') !== null) continue
      if (String(element.id).startsWith('psa-e2e-')) continue
      const rect = element.getBoundingClientRect()
      if (rect.width < 120 || rect.height < 40) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      floats.push({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        z,
        pointerEvents: style.pointerEvents,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.x + rect.width / 2),
          centerY: Math.round(rect.y + rect.height / 2),
        },
      })
    }
    return floats
  },

  /** First visible native hover-card-ish surface (fixed, 10 <= z < 1000, pointer-interactive). */
  nativeHoverCard: () => {
    for (const element of document.querySelectorAll('body *')) {
      if (String(element.id).startsWith('psa-e2e-')) continue
      const style = getComputedStyle(element)
      if (style.position !== 'fixed') continue
      const z = Number.parseInt(style.zIndex, 10)
      if (!Number.isFinite(z) || z < 10 || z >= 1000) continue
      if (style.pointerEvents !== 'auto') continue
      if (element.closest('[data-psa-own]') !== null) continue
      const rect = element.getBoundingClientRect()
      if (rect.width < 160 || rect.width > 520 || rect.height < 50 || rect.height > 400) continue
      return {
        tag: element.tagName.toLowerCase(),
        z,
        text: (element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.x + rect.width / 2),
          centerY: Math.round(rect.y + rect.height / 2),
        },
      }
    }
    return null
  },

  /**
   * A deterministic inner text element inside the native hover preview card:
   * smallest descendant with non-empty text and a real box, inside the card.
   * @returns {{ rect: object, centerX: number, centerY: number, text: string } | null} inner point.
   */
  nativeHoverCardInnerPoint: () => {
    let card = null
    for (const element of document.querySelectorAll('body *')) {
      if (String(element.id).startsWith('psa-e2e-')) continue
      const style = getComputedStyle(element)
      if (style.position !== 'fixed') continue
      const z = Number.parseInt(style.zIndex, 10)
      if (!Number.isFinite(z) || z < 10 || z >= 1000) continue
      if (style.pointerEvents !== 'auto') continue
      if (element.closest('[data-psa-own]') !== null) continue
      const rect = element.getBoundingClientRect()
      if (rect.width < 160 || rect.width > 520 || rect.height < 50 || rect.height > 400) continue
      card = element
      break
    }
    if (card === null) return null
    const cardRect = card.getBoundingClientRect()
    let best = null
    for (const element of card.querySelectorAll('*')) {
      if (element.closest('[data-psa-own]') !== null) continue
      const rect = element.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) continue
      if (rect.left < cardRect.left || rect.top < cardRect.top
        || rect.right > cardRect.right + 1 || rect.bottom > cardRect.bottom + 1) continue
      const text = (element.innerText || '').replace(/\s+/g, ' ').trim()
      if (text.length === 0) continue
      const area = rect.width * rect.height
      if (best === null || area < best.area) best = { rect, text, area }
    }
    if (best === null) return null
    return {
      rect: {
        x: Math.round(best.rect.x),
        y: Math.round(best.rect.y),
        width: Math.round(best.rect.width),
        height: Math.round(best.rect.height),
        centerX: Math.round(best.rect.x + best.rect.width / 2),
        centerY: Math.round(best.rect.y + best.rect.height / 2),
      },
      centerX: Math.round(best.rect.x + best.rect.width / 2),
      centerY: Math.round(best.rect.y + best.rect.height / 2),
      text: best.text.slice(0, 80),
    }
  },

  /** Parsed persisted annotation document with only privacy-safe fields exposed. */
  annotationStorage: () => {
    let text = null
    try {
      text = localStorage.getItem('power-suite.ui-annotation.annotations')
    } catch {
      text = null
    }
    if (text === null) return { present: false, version: null, count: 0, itemCount: 0, records: [], groups: [] }
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      return { present: true, corrupt: true, version: null, count: 0, records: [] }
    }
    const records = Array.isArray(parsed?.records) ? parsed.records : []
    const groups = Array.isArray(parsed?.groups) ? parsed.groups : []
    const itemCount = records.length + groups.reduce((sum, group) => sum + (Array.isArray(group?.items) ? group.items.length : 0), 0)
    return {
      present: true,
      version: parsed?.version ?? null,
      updatedAt: parsed?.updatedAt ?? null,
      count: records.length + groups.length,
      itemCount,
      rawLength: text.length,
      records: records.map((record) => ({
        id: record?.id ?? null,
        version: record?.version ?? null,
        order: record?.order ?? null,
        at: record?.at ?? null,
        updatedAt: record?.updatedAt ?? null,
        note: record?.note ?? null,
        route: record?.route ?? null,
        session: record?.session ?? null,
        surface: record?.locator?.surface ?? null,
        ephemeral: record?.locator?.ephemeral ?? null,
        uniqueSelector: record?.locator?.uniqueSelector ?? null,
        uniqueVerified: record?.locator?.uniqueVerified ?? null,
        xpath: record?.locator?.xpath ?? null,
        jsPath: record?.locator?.jsPath ?? null,
        textQuote: record?.locator?.textQuote ?? null,
        textPosition: record?.locator?.textPosition ?? null,
        ancestorCount: Array.isArray(record?.locator?.ancestors) ? record.locator.ancestors.length : null,
        candidateCount: Array.isArray(record?.locator?.candidates) ? record.locator.candidates.length : null,
        context: record?.context ?? null,
        component: record?.component ?? null,
        bounds: record?.bounds ?? null,
        viewport: record?.viewport ?? null,
        keys: Object.keys(record ?? {}).sort(),
        locatorKeys: Object.keys(record?.locator ?? {}).sort(),
      })),
      groups: groups.map((group) => ({
        id: group?.id ?? null,
        kind: group?.kind ?? null,
        requirement: group?.requirement ?? null,
        createdAt: group?.createdAt ?? null,
        updatedAt: group?.updatedAt ?? null,
        collapsed: group?.collapsed ?? null,
        included: group?.included ?? null,
        session: group?.session ?? null,
        itemCount: Array.isArray(group?.items) ? group.items.length : 0,
        itemIds: Array.isArray(group?.items) ? group.items.map((item) => item?.id ?? null) : []
      }))
    }
  },

  /** Clone the current stored document up to `count` records (cap E2E setup). */
  seedAnnotationStorage: (count) => {
    const key = 'power-suite.ui-annotation.annotations'
    let base = null
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null')
      if (parsed !== null && Array.isArray(parsed.records) && parsed.records.length > 0) base = parsed.records[0]
    } catch {
      base = null
    }
    if (base === null) return { ok: false }
    const records = []
    for (let index = 0; index < count; index += 1) {
      const clone = JSON.parse(JSON.stringify(base))
      clone.id = `psa-seed-${index}`
      clone.order = index
      clone.at = 1700000000000 + index
      clone.updatedAt = clone.at
      clone.note = ''
      records.push(clone)
    }
    localStorage.setItem(key, JSON.stringify({ version: 2, updatedAt: Date.now(), records }))
    return { ok: true, count: records.length }
  },

  clearAnnotationStorage: () => {
    for (const key of [
      'power-suite.ui-annotation.annotations',
      'power-suite.ui-annotation.settings',
      'power-suite.ui-annotation.launcher',
      'power-suite.ui-annotation.rail-collapsed',
    ]) {
      try {
        localStorage.removeItem(key)
      } catch {
        // storage may be blocked in a hostile embedding
      }
    }
    return true
  },


  // ---- A3 Phase 2-B: native composer chips + cross-branch dynamic-workspaces card ------

  /** Native composer reference chips (atomic Lexical decorator nodes) in the draft. */
  chipState: () => {
    const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
    if (editor === null) return { present: false, text: '', chips: [] }
    let nodes = [...editor.querySelectorAll('[data-lexical-decorator="true"]')]
    if (nodes.length === 0) nodes = [...editor.querySelectorAll('[contenteditable="false"]')]
    const chips = nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim(),
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    })
    return { present: true, text: editor.innerText || '', chips }
  },

  /** The dynamic-workspaces hovercard marker + its computed contract state. */
  psdHovercardState: () => {
    const card = document.querySelector('[data-psd-hovercard]')
    if (card === null) return null
    const rect = card.getBoundingClientRect()
    const style = getComputedStyle(card)
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      centerX: Math.round(rect.x + rect.width / 2),
      centerY: Math.round(rect.y + rect.height / 2),
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
    }
  },

  /** A3/T30: synthetic hover-triggered floating menu (opens on trigger hover, closes on menu leave). */
  createHoverMenuFixture: () => {
    document.getElementById('psa-hover-menu-fixture')?.remove()
    const trigger = document.createElement('button')
    trigger.id = 'psa-hover-trigger'
    trigger.textContent = 'Open subagents'
    Object.assign(trigger.style, {
      position: 'fixed', left: '320px', top: '240px', width: '160px', height: '32px',
      zIndex: '400', background: 'rgb(60, 64, 72)', color: 'rgb(235, 238, 245)',
      border: '1px solid rgb(110, 116, 130)', borderRadius: '8px', cursor: 'pointer'
    })
    const menu = document.createElement('div')
    menu.id = 'psa-hover-menu-fixture'
    Object.assign(menu.style, {
      position: 'fixed', left: '320px', top: '280px', width: '320px',
      zIndex: '500', display: 'none', padding: '6px',
      background: 'rgb(44, 46, 52)', color: 'rgb(235, 238, 245)',
      border: '1px solid rgb(110, 116, 130)', borderRadius: '8px',
      fontSize: '12px', boxShadow: '0 8px 24px rgb(0 0 0 / 30%)'
    })
    const title = document.createElement('div')
    title.textContent = 'Subagent sessions'
    Object.assign(title.style, { fontWeight: '600', marginBottom: '4px' })
    const list = document.createElement('ul')
    Object.assign(list.style, { listStyle: 'none', margin: '0', padding: '0' })
    for (let index = 1; index <= 3; index += 1) {
      const item = document.createElement('li')
      item.setAttribute('role', 'listitem')
      Object.assign(item.style, { padding: '3px 4px', borderRadius: '4px' })
      const leaf = document.createElement('span')
      leaf.setAttribute('data-hover-leaf', String(index))
      leaf.textContent = `Subagent session ${index}`
      Object.assign(leaf.style, { display: 'block', height: '16px', lineHeight: '16px' })
      item.append(leaf)
      list.append(item)
    }
    menu.append(title, list)
    document.body.append(trigger, menu)
    const state = { open: false }
    const open = () => { state.open = true; menu.style.display = 'block' }
    const close = () => { state.open = false; menu.style.display = 'none' }
    trigger.addEventListener('mouseenter', open)
    menu.addEventListener('mouseleave', close)
    window.__psaHoverFixture = { open, close, isOpen: () => state.open }
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect()
      return { centerX: Math.round(rect.left + rect.width / 2), centerY: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height), left: Math.round(rect.left), top: Math.round(rect.top) }
    }
    return { trigger: rectOf(trigger), leaf: rectOf(list.querySelector('[data-hover-leaf="1"]')), menu: rectOf(menu) }
  },
  hoverMenuFixtureState: () => {
    const menu = document.getElementById('psa-hover-menu-fixture')
    if (menu === null) return null
    const leaf = menu.querySelector('[data-hover-leaf="1"]')
    const menuRect = menu.getBoundingClientRect()
    const leafRect = leaf === null ? null : leaf.getBoundingClientRect()
    return {
      open: window.__psaHoverFixture?.isOpen?.() === true,
      display: getComputedStyle(menu).display,
      menu: { left: Math.round(menuRect.left), top: Math.round(menuRect.top), width: Math.round(menuRect.width), height: Math.round(menuRect.height) },
      leaf: leafRect === null ? null : { centerX: Math.round(leafRect.left + leafRect.width / 2), centerY: Math.round(leafRect.top + leafRect.height / 2), width: Math.round(leafRect.width), height: Math.round(leafRect.height) }
    }
  },
  closeHoverMenuFixture: () => { window.__psaHoverFixture?.close?.(); return true },
  vanishHoverMenuFixture: () => { document.getElementById('psa-hover-menu-fixture')?.remove(); return true },
  removeHoverMenuFixture: () => { document.getElementById('psa-hover-menu-fixture')?.remove(); document.getElementById('psa-hover-trigger')?.remove(); return true },

  /** A3/T25: seed a deterministic singles+groups document for the sidebar states. */
  seedAnnotationSidebarFixture: (sessionId) => {
    const key = 'power-suite.ui-annotation.annotations'
    const now = Date.now()
    const record = (index, note) => ({
      version: 2,
      id: `psa-sidebar-${index}-000000`,
      at: now - index * 60000,
      updatedAt: now - index * 60000,
      order: index,
      session: { sessionId, cwd: '/tmp/annotation-fixture', workspaceLabel: 'annotation-fixture' },
      route: '/conversation/fixture',
      locator: {
        tag: 'button',
        role: 'button',
        name: `Button ${index}`,
        candidates: [{ kind: 'tag', value: 'button', reliability: 0.4 }],
        key: `tag:button:${index}`,
        path: 'button',
        uniqueSelector: null,
        uniqueVerified: false,
        ancestors: [],
        surface: 'page',
        ephemeral: false
      },
      component: 'button',
      text: `Button ${index}`,
      textDigest: '',
      context: '',
      bounds: { x: 20 + index * 8, y: 20 + index * 8, width: 120, height: 32 },
      viewport: { width: 1728, height: 900 },
      note,
      included: true,
      lastStatus: null
    })
    const singleA = record(1, '保存更改按钮的层级不够突出，建议加强视觉层级。')
    const singleB = record(2, '列表项选中态的高亮范围偏小，建议与行高一致。')
    const groupOneItems = [record(3, ''), record(4, ''), record(5, ''), record(6, '')]
    const groupTwoItems = [record(7, ''), record(8, '')]
    const group = (id, requirement, items, order, collapsed) => ({
      kind: 'group',
      id,
      at: now - 300000,
      createdAt: now - 300000,
      updatedAt: now - 120000,
      order,
      session: { sessionId, cwd: '/tmp/annotation-fixture', workspaceLabel: 'annotation-fixture' },
      requirement,
      items,
      collapsed,
      included: true
    })
    const doc = {
      version: 3,
      updatedAt: now,
      records: [singleA, singleB],
      groups: [
        group('psa-group-sidebar-01', '表单字段间距问题\n表单区域的多个控件存在间距不一致、对齐不整齐的问题。', groupOneItems, 2, false),
        group('psa-group-sidebar-02', '按钮样式统一', groupTwoItems, 3, true)
      ]
    }
    localStorage.setItem(key, JSON.stringify(doc))
    return { records: doc.records.length, groups: doc.groups.length, items: 2 + groupOneItems.length + groupTwoItems.length }
  },

  /** A3/T25: redesigned sidebar structure probe. */
  sidebarState: () => {
    const rail = document.querySelector('[data-psa-rail]')
    if (rail === null) return null
    const view = rail.getAttribute('data-psa-view')
    const rectOf = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left), top: Math.round(rect.top),
        width: Math.round(rect.width), height: Math.round(rect.height),
        right: Math.round(rect.right), bottom: Math.round(rect.bottom)
      }
    }
    const rows = [...rail.querySelectorAll('[data-psa-entry]')]
    const visible = (element) => {
      if (element === null) return false
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0
    }
    const actions = [...rail.querySelectorAll('[data-psa-entry-expand],[data-psa-entry-remove],[data-psa-group-edit],[data-psa-group-remove],[data-psa-group-item-edit],[data-psa-group-item-remove]')]
    return {
      view,
      title: (rail.querySelector('.psa-sb-rail-title')?.innerText || '').trim(),
      badge: (rail.querySelector('[data-psa-total-badge]')?.innerText || '').trim(),
      subtitle: (rail.querySelector('.psa-sb-subtitle')?.innerText || '').trim(),
      filters: [...rail.querySelectorAll('[data-psa-filter]')].map((button) => ({
        key: button.getAttribute('data-psa-filter'),
        pressed: button.getAttribute('aria-pressed'),
        text: (button.innerText || '').replace(/\s+/g, ' ').trim()
      })),
      rows: rows.length,
      singles: rail.querySelectorAll('[data-psa-entry]:not([data-psa-group])').length,
      groups: rail.querySelectorAll('[data-psa-group]').length,
      groupItems: rail.querySelectorAll('[data-psa-group-item]').length,
      typeBadges: [...rail.querySelectorAll('[data-psa-type-badge]')].map((badge) => badge.getAttribute('data-psa-type-badge')),
      groupBadges: [...rail.querySelectorAll('[data-psa-group] [data-psa-type-badge]')].map((badge) => (badge.innerText || '').trim()),
      expandedGroups: [...rail.querySelectorAll('[data-psa-group-toggle]')].map((button) => button.getAttribute('aria-expanded')),
      actions: actions.map((button) => ({ visible: visible(button), rect: rectOf(button) })),
      footer: {
        primary: (rail.querySelector('[data-psa-add-annotation]')?.innerText || '').trim(),
        secondary: (rail.querySelector('[data-psa-clear-selection]')?.innerText || '').trim(),
        primaryHeight: ract(rail.querySelector('[data-psa-add-annotation]')),
        secondaryHeight: ract(rail.querySelector('[data-psa-clear-selection]'))
      },
      empty: rail.querySelector('[data-psa-empty]') !== null,
      list: {
        scrollable: (() => { const element = rail.querySelector('[data-psa-sidebar-list]'); return element !== null ? { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight } : null })(),
        overflowX: rail.scrollWidth > rail.clientWidth + 1
      },
      rail: rectOf(rail)
    }
    function ract(element) { return element === null || element === undefined ? null : Math.round(element.getBoundingClientRect().height) }
  },

  /** A3/T23: requirement-popover layout (caption row, trash, footer row, ring hug). */
  popoverLayout: () => {
    const popover = document.querySelector('[data-psa-popover]')
    if (popover === null) return null
    const rectOf = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left), top: Math.round(rect.top),
        right: Math.round(rect.right), bottom: Math.round(rect.bottom),
        width: Math.round(rect.width), height: Math.round(rect.height),
        centerY: Math.round(rect.top + rect.height / 2)
      }
    }
    const note = popover.querySelector('[data-psa-note]')
    const wrapper = note !== null ? note.closest('.psa-rainbow-field') : null
    const head = popover.querySelector('[data-psa-popover-note-head]')
    const caption = popover.querySelector('[data-psa-popover-note-label]')
      ?? popover.querySelector('.psa-popover-note > .psa-muted')
    const trash = popover.querySelector('[data-psa-popover-delete]')
    const actions = popover.querySelector('[data-psa-popover-actions]') ?? popover.querySelector('.psa-popover-actions')
    const actionButtons = actions === null ? [] : [...actions.querySelectorAll('button')].map((button) => ({
      text: (button.innerText || '').replace(/\s+/g, ' ').trim(),
      ...rectOf(button),
      clientWidth: Math.round(button.clientWidth),
      scrollWidth: Math.round(button.scrollWidth),
      wrap: getComputedStyle(button).whiteSpace
    }))
    const noteRect = rectOf(note)
    const captionRect = rectOf(caption)
    const headRect = rectOf(head)
    const trashRect = rectOf(trash)
    const popoverRect = rectOf(popover)
    const ring = noteRect === null || rectOf(wrapper) === null ? null : {
      wrapper: rectOf(wrapper),
      exact: Math.abs(rectOf(wrapper).left - noteRect.left) <= 1
        && Math.abs(rectOf(wrapper).top - noteRect.top) <= 1
        && Math.abs(rectOf(wrapper).right - noteRect.right) <= 1
        && Math.abs(rectOf(wrapper).bottom - noteRect.bottom) <= 1
    }
    return {
      popover: popoverRect,
      caption: captionRect,
      head: headRect,
      textarea: noteRect,
      ring,
      trash: trashRect === null ? null : {
        ...trashRect,
        title: trash.getAttribute('title'),
        ariaLabel: trash.getAttribute('aria-label'),
        inHead: head !== null && head.contains(trash),
        rightAligned: headRect !== null && Math.abs(headRect.right - trashRect.right) <= 10
      },
      footer: {
        flexWrap: actions === null ? null : getComputedStyle(actions).flexWrap,
        buttons: actionButtons
      },
      gap: captionRect === null || noteRect === null ? null : Math.round(noteRect.top - captionRect.bottom),
      headGap: headRect === null || noteRect === null ? null : Math.round(noteRect.top - headRect.bottom)
    }
  },

  /** A3/T22: the × affordance over an annotation chip, plus the chip count. */
  chipDelete: () => {
    const button = document.querySelector('[data-psa-chip-delete]')
    if (button === null) return null
    const rect = button.getBoundingClientRect()
    return {
      ariaLabel: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
      pointerEvents: getComputedStyle(button).pointerEvents,
      chips: document.querySelectorAll('[data-composer-chip="ui-annotation"]').length,
      rect: {
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        viewport: { width: innerWidth, height: innerHeight }
      }
    }
  },

  /** A3/T21: composer-chip hover preview state (content + geometry). */
  chipPreview: () => {
    const preview = document.querySelector('[data-psa-chip-preview]')
    if (preview === null) return null
    const rect = preview.getBoundingClientRect()
    const text = (preview.innerText || preview.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      title: preview.querySelector('[data-psa-chip-preview-title]')?.innerText ?? null,
      requirement: preview.querySelector('[data-psa-chip-preview-requirement]')?.innerText ?? null,
      count: preview.querySelector('[data-psa-chip-preview-count]')?.innerText ?? null,
      listItems: [...preview.querySelectorAll('.psa-chip-preview-item')].map((item) => (item.innerText || '').replace(/\s+/g, ' ').trim()),
      text,
      role: preview.getAttribute('role'),
      pointerEvents: getComputedStyle(preview).pointerEvents,
      rect: {
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        viewport: { width: innerWidth, height: innerHeight }
      }
    }
  },

  // ---- A3 Phase 2-A: page marks, hover detail card, undo toast -------------------------

  /** Current page marks with their geometry, badge excerpt, and hit-test state. */
  marksState: () => [...document.querySelectorAll('[data-psa-mark]')].map((element) => {
    const rect = element.getBoundingClientRect()
    const badge = element.querySelector('[data-psa-mark-badge]')
    return {
      id: element.getAttribute('data-psa-mark-id'),
      index: element.getAttribute('data-psa-mark-index'),
      state: element.getAttribute('data-psa-mark-state'),
      stale: element.getAttribute('data-psa-mark-stale'),
      empty: badge !== null ? badge.getAttribute('data-psa-mark-empty') : null,
      badge: badge !== null ? (badge.innerText || badge.textContent || '').replace(/\s+/g, ' ').trim() : null,
      pointerEvents: getComputedStyle(element).pointerEvents,
      inLayer: element.closest('[data-psa-layer]') !== null,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      },
    }
  }),

  /** The hover detail card state (content, actions, geometry). */
  detailState: () => {
    const card = document.querySelector('[data-psa-detail]')
    if (card === null) return null
    const rect = card.getBoundingClientRect()
    const text = (selector) => {
      const element = card.querySelector(selector)
      return element === null ? null : (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim()
    }
    return {
      ref: card.getAttribute('data-psa-detail-ref'),
      mode: card.getAttribute('data-psa-detail-mode'),
      status: card.getAttribute('data-psa-status'),
      role: card.getAttribute('role'),
      ariaLabel: card.getAttribute('aria-label'),
      title: text('[data-psa-detail-title]'),
      requirement: text('[data-psa-detail-requirement]'),
      locator: text('[data-psa-detail-locator]'),
      position: text('[data-psa-detail-position]'),
      session: text('[data-psa-detail-session]'),
      workspace: text('[data-psa-detail-workspace]'),
      surface: text('[data-psa-detail-surface]'),
      buttons: {
        quickRef: card.querySelector('[data-psa-detail-quick-ref]') !== null,
        edit: card.querySelector('[data-psa-detail-edit]') !== null,
        relocate: card.querySelector('[data-psa-detail-relocate]') !== null,
        copy: card.querySelector('[data-psa-detail-copy-locator]') !== null,
        delete: card.querySelector('[data-psa-detail-delete]') !== null,
        save: card.querySelector('[data-psa-detail-save]') !== null,
        cancel: card.querySelector('[data-psa-detail-cancel]') !== null,
      },
      hasTextarea: card.querySelector('[data-psa-detail-note]') !== null,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        viewport: { width: innerWidth, height: innerHeight },
      },
    }
  },

  /** The delete undo toast state. */
  undoToast: () => {
    const toast = document.querySelector('[data-psa-undo-toast]')
    if (toast === null) return { present: false }
    return {
      present: true,
      role: toast.getAttribute('role'),
      live: toast.getAttribute('aria-live'),
      text: (toast.innerText || toast.textContent || '').replace(/\s+/g, ' ').trim(),
      undo: toast.querySelector('[data-psa-undo]') !== null,
    }
  },

  /** Insert one deterministic synthetic button (removed by a reload for the missing case). */
  createSyntheticTarget: () => {
    for (const existing of document.querySelectorAll('#psa-e2e-target')) existing.remove()
    const button = document.createElement('button')
    button.type = 'button'
    button.id = 'psa-e2e-target'
    button.setAttribute('data-testid', 'psa-e2e-target')
    button.textContent = 'Synthetic annotation target'
    button.setAttribute('style', [
      'position:fixed',
      'left:300px',
      'top:150px',
      // z-index 5 keeps it a *page* element: the product's F2 surface picker only
      // treats fixed/absolute boxes with z>=10 as floating.
      'z-index:5',
      'padding:6px 10px',
      'font:12px sans-serif',
      'background:#fff',
      'border:1px solid #888'
    ].join(';'))
    document.body.appendChild(button)
    const rect = button.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  },

  /** Remove the synthetic target element. */
  removeSyntheticTarget: () => {
    for (const element of document.querySelectorAll('#psa-e2e-target')) element.remove()
    return true
  },

  /** Clone one persisted record under another Session identity (other-Session scope proof). */
  appendOtherSessionRecord: (sessionId) => {
    const key = 'power-suite.ui-annotation.annotations'
    let parsed = null
    try {
      parsed = JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      parsed = null
    }
    if (parsed === null || !Array.isArray(parsed.records) || parsed.records.length === 0) return { ok: false }
    const clone = JSON.parse(JSON.stringify(parsed.records[0]))
    clone.id = 'psa-e2e-other-session'
    clone.order = parsed.records.length
    clone.note = 'OTHER-SESSION-REQUIREMENT'
    clone.updatedAt = Date.now()
    clone.session = { ...(clone.session || {}), sessionId, workspaceLabel: 'other-workspace' }
    parsed.records.push(clone)
    localStorage.setItem(key, JSON.stringify(parsed))
    return { ok: true, count: parsed.records.length, id: clone.id }
  },

  /** Rainbow-field focus treatment for one annotation input selector. */
  rainbowFocusState: (selector) => {
    const input = document.querySelector(selector)
    if (input === null) return { found: false }
    const wrapper = input.closest('.psa-rainbow-field')
    const rect = input.getBoundingClientRect()
    const style = getComputedStyle(input)
    if (wrapper === null) {
      return {
        found: true,
        wrapper: false,
        focused: document.activeElement === input,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      }
    }
    const ring = getComputedStyle(wrapper, '::after')
    return {
      found: true,
      wrapper: true,
      focused: document.activeElement === input,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      ringOpacity: ring.opacity,
      ringAnimation: ring.animationName,
      ringDuration: ring.animationDuration,
      ringBackground: ring.backgroundImage,
      ringFilter: ring.filter,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    }
  },
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

  /** Compact live-state snapshot attached to scenario failures (environment vs product triage). */
  environmentSnapshot() {
    return this.page.eval(() => {
      const launcher = document.querySelector('[data-psa-launcher]')
      const rail = document.querySelector('[data-psa-rail]')
      const panel = document.querySelector('[data-psa-rail-panel]')
      const popover = document.querySelector('[data-psa-popover]')
      return {
        mode: document.documentElement.getAttribute('data-psa-active'),
        passthrough: document.documentElement.getAttribute('data-psa-passthrough'),
        rail: rail !== null,
        railCollapsed: rail !== null ? rail.getAttribute('data-psa-collapsed') : null,
        panel: panel !== null ? panel.getAttribute('data-psa-rail-panel') : null,
        popover: popover !== null,
        launcher: launcher !== null,
        launcherActive: launcher !== null ? launcher.getAttribute('data-psa-active') : null,
        sessionId: document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null,
        viewport: { width: innerWidth, height: innerHeight },
        framePadding: (() => {
          const overlay = document.querySelector('[data-shell-overlay]')
          const frame = overlay !== null ? overlay.parentElement : null
          return frame !== null ? frame.style.paddingRight : null
        })(),
      }
    })
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

  /**
   * Activate the mode and verify the rail remains present after a short settle. The S1 gate can
   * lose the rail after activate() returns (N1); a single activation retry covers that window,
   * and a second loss fails honestly with the live environment snapshot (no cause attributed).
   * @returns {Promise<{retried: boolean}>} whether a retry was needed.
   */
  async activateAndVerifyStable({ settleChecks = 2, settleMs = 500 } = {}) {
    const railPresent = () => this.page.evaluate(
      `document.documentElement.getAttribute('data-psa-active') === 'true' && !!document.querySelector('[data-psa-rail]')`
    )
    const stable = async () => {
      for (let check = 0; check < settleChecks; check += 1) {
        await sleep(settleMs)
        if (!(await railPresent())) return false
      }
      return true
    }
    await this.activate()
    if (await stable()) return { retried: false }
    const before = await this.environmentSnapshot()
    // The rail disappeared after activation returned: retry activation once.
    await this.exit().catch(() => {})
    await this.activate()
    if (await stable()) return { retried: true }
    const after = await this.environmentSnapshot()
    throw new Error(
      `annotation rail was not stable after activation (one retry): ` +
        `state before retry=${JSON.stringify(before)} state after retry=${JSON.stringify(after)}`
    )
  }

  async activate() {
    const modeOn = () => this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    const waitForRail = (label) => this.page.waitFor(
      `document.documentElement.getAttribute('data-psa-active') === 'true' && !!document.querySelector('[data-psa-rail]')`,
      { timeout: 8000, label }
    )
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (await modeOn()) {
        // The mode is on but the rail has not painted yet (first-frame race): poll for it.
        await waitForRail('annotation rail visible')
        await sleep(350)
        return false
      }
      const rect = await this.page.findRect('[data-psa-launcher]')
      assert(rect, 'launcher not found for activation')
      await this.page.clickAt(rect.x, rect.y, {
        appliedWhen: async () => modeOn(),
      })
      try {
        await waitForRail('annotation mode active')
        await sleep(400)
        return true
      } catch (error) {
        const stillActive = await modeOn()
        if (stillActive) {
          // The click was accepted; only the rail paint is late. Give it a longer window.
          await waitForRail('annotation rail visible (late paint)')
          await sleep(350)
          return true
        }
        if (attempt === 2) throw error
        // The first click was swallowed: retry once with a fresh launcher rect.
        await sleep(400)
      }
    }
    throw new Error('could not activate the annotation mode after two real launcher clicks')
  }

  async exit() {
    const active = await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    if (!active) return false
    if ((await this.page.count('[data-psa-exit]')) > 0) {
      await this.click('[data-psa-exit]')
    } else {
      await this.page.pressKey('escape')
    }
    // A3/T29: exits with records ask for confirmation; accept it in the harness.
    const confirmDeadline = Date.now() + 1500
    while (Date.now() < confirmDeadline) {
      if ((await this.page.count('[data-psa-exit-clear]')) > 0) {
        await this.click('[data-psa-exit-clear]')
        break
      }
      if (!(await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`))) break
      await sleep(40)
    }
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

  /**
   * Ensure the mode is on **and stable**: if already active, re-verify the rail with the same
   * two 500 ms settle checks used by S1; otherwise run the stable activation (which retries).
   */
  async ensureActivatedStable() {
    const railPresent = () => this.page.evaluate(
      `document.documentElement.getAttribute('data-psa-active') === 'true' && !!document.querySelector('[data-psa-rail]')`
    )
    const stable = async () => {
      for (let check = 0; check < 2; check += 1) {
        await sleep(500)
        if (!(await railPresent())) return false
      }
      return true
    }
    const active = await this.page.evaluate(`document.documentElement.getAttribute('data-psa-active') === 'true'`)
    if (active) {
      if (await stable()) return { retried: false }
      await this.exit().catch(() => {})
    }
    await this.activateAndVerifyStable()
    if (!(await stable())) {
      const env = await this.environmentSnapshot()
      throw new Error(`mode on but rail unstable when ensuring activation: ${JSON.stringify(env)}`)
    }
    return { retried: true }
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
    // A3/T26: the managed annotation list is the default rail body; this helper
    // only has to leave the settings view when that happens to be open.
    const ui = await this.ui()
    if (ui.panel === 'collection') return true
    if (ui.panel === 'settings') {
      const back = await this.page.findRect('[data-psa-rail-back]')
      if (back !== null) await this.page.clickAt(back.x, back.y)
      await sleep(250)
    }
    await this.page.waitFor(
      `document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') === 'collection'`,
      { timeout: 3000, label: 'collection rail panel (default list)' }
    )
    await sleep(120)
    return true
  }

  async clickBack() {
    // A3/T26: the list is the root view; Back now only leaves the settings view.
    const ui = await this.ui()
    if (ui.panel === 'collection') return true
    for (let attempt = 0; attempt < 3; attempt++) {
      const back = await this.page.findRect('[data-psa-rail-back]')
      if (back !== null) await this.page.clickAt(back.x, back.y)
      else {
        const rect = await this.clickByText('[data-psa-rail]', /^(Back|返回)$/)
        if (rect === null || rect === undefined) return false
      }
      await sleep(200)
      try {
        await this.page.waitFor(
          `document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') === 'collection'`,
          { timeout: 2000, label: 'collection rail panel after Back' }
        )
        await sleep(120)
        return true
      } catch {
        // retry: the rail may have re-rendered between the lookup and the click
      }
    }
    throw new Error('the rail did not return to the list view after 3 real clicks')
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
    // A3/T26 compatibility name: the default rail body is now the managed list.
    const ui = await this.ui()
    if (ui.panel === null || ui.panel === 'collection') return true
    if (ui.panel === 'settings') await this.clickBack()
    return true
  }

  async clearSelection() {
    const ui = await this.ui()
    if (!ui.popover && ui.selection === 0 && ui.multi === 0) return false
    await this.page.pressKey('escape')
    await sleep(280)
    return true
  }

  /**
   * After a reload the shell can restore a different "last viewed" Session than the
   * one a scenario captured records in. Switch back through the native sidebar row
   * (expanding workspace groups and scrolling the list if needed) so scope/mark
   * assertions are deterministic; returns the current Session either way.
   * @param {string | null | undefined} targetSessionId - Session that owns the records.
   * @returns {Promise<string | null>} the current Session after the attempt.
   */
  async ensureSessionFor(targetSessionId) {
    if (typeof targetSessionId !== 'string' || targetSessionId.length === 0) return null
    let current = await this.refreshSession()
    if (current === targetSessionId) return current
    await this.ensureSidebarExpanded()
    /**
     * Locate the native row for one Session id.
     * @returns {Promise<{ x: number, y: number } | null>} row centre, when rendered.
     */
    const rowPointFor = async () => this.page.evaluate(`(() => {
      const element = document.querySelector('[data-row-key="session:${targetSessionId}"]')
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      if (rect.top < 0 || rect.bottom > innerHeight) return null
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const row = await rowPointFor()
      if (row !== null) {
        await this.page.clickAt(row.x, row.y)
        await sleep(550)
        current = await this.refreshSession()
        if (current === targetSessionId) return current
      }
      // Reveal grouped Session rows: expand every visible workspace row once, then
      // scroll the sidebar list a little and retry.
      const workspacePoints = await this.page.eval(probes.workspaceRowPoints)
      for (const point of workspacePoints.slice(0, 6)) {
        await this.page.clickAt(point.x, point.y)
        await sleep(120)
      }
      const sidebar = await this.page.eval(probes.sessionRowPoint, null)
      if (sidebar !== null) {
        await this.page.moveTo(sidebar.x, sidebar.y)
        await this.page.wheel(sidebar.x, sidebar.y, 240)
        await sleep(220)
      }
    }
    return this.refreshSession()
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
        `draft=${draftPreview(blank.draft)} editorImages=${blank.editorImages} attachments=${blank.attachments}`
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
  8: 'launcher docked in rail while active, idle drag clamp, overlay layout, fallback position across mode cycle/reload',
  9: 'collection view keeps the frame/rail geometry; exit restores the baseline layout',
  10: 'floating surfaces: leaf-first hover/click (title/subtitle/time/token/icon leaves), full Parent/Child chain, whole surface via background, identical outline style, F3 recompute, F4 state CSS, v2 records + reload persistence',
  11: 'F4 cross-branch: pinned dynamic-workspaces hover card is selectable in annotation mode (SKIP without the DW branch)',
  12: 'page marks + hover detail card + delete/undo + other-Session exclusion',
  13: 'composer chip: Quick reference, hover preview, chip × removal (single+group, one undo step), Backspace removal, real chat-anchor capture, ONE batch group chip, not sent',
  14: 'persistence: reload restores records/marks; removed target is missing and not drawn',
  15: 'rainbow input focus ring: wrapper ring, no solid outline, reduced motion, no layout shift',
}

const SCENARIO_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

function buildScenarios(harness) {
  const h = harness
  return {
    1: async () => {
      await h.ensureModeOff()
      await h.ensurePluginsView()
      const baseline = await h.frame()
      assertEqual(baseline.htmlActive, null, 'mode should be off before the scenario starts')
      // A3/T29: clicking the launcher hides it (fade/scale, no docking, no flight)
      // and it only reappears once the mode is fully exited.
      const animLauncher = await h.page.findRect('[data-psa-launcher]')
      assert(animLauncher, 'idle launcher missing for the hide-animation probe')
      const launcherHidden = () => h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-launcher-hidden')`)
      await h.page.clickAt(animLauncher.x, animLauncher.y)
      await h.page.waitFor(`document.documentElement.getAttribute('data-psa-active') === 'true'`, { timeout: 8000, label: 'mode active after the launcher click' })
      await sleep(320)
      assertEqual(await launcherHidden(), 'true', 'A3/T29: the launcher must hide while annotation mode is active')
      assertEqual(await h.page.count('[data-psa-launcher]'), 1, 'A3/T29: exactly one launcher control must exist while active')
      assertEqual(await h.page.count('[data-psa-launcher-docked]'), 0, 'A3/T29: no docked launcher may exist')
      assertEqual(await h.page.count('[data-psa-launcher-flight]'), 0, 'A3/T29: no flying launcher element may exist')
      const hiddenStyle = await h.page.evaluate(`(() => {
        const launcher = document.querySelector('[data-psa-launcher]')
        if (launcher === null) return null
        const style = getComputedStyle(launcher)
        const rect = launcher.getBoundingClientRect()
        return { opacity: style.opacity, transform: style.transform, pointerEvents: style.pointerEvents, ariaHidden: launcher.getAttribute('aria-hidden'), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } }
      })()`)
      assert(hiddenStyle !== null, 'hidden launcher probe missing')
      assertEqual(hiddenStyle.opacity, '0', 'A3/T29: the active launcher is not faded out')
      assert(hiddenStyle.transform !== 'none' && hiddenStyle.transform.includes('matrix'), 'A3/T29: the hidden launcher has no scale transform')
      assertEqual(hiddenStyle.pointerEvents, 'none', 'A3/T29: the hidden launcher must not receive pointer input')
      assertEqual(hiddenStyle.ariaHidden, 'true', 'A3/T29: the hidden launcher is not aria-hidden')
      // No records yet: the header X exits directly and the launcher animates back in.
      await h.click('[data-psa-exit]')
      await h.page.waitFor(`document.documentElement.getAttribute('data-psa-active') === null`, { timeout: 8000, label: 'mode off after the direct exit' })
      await sleep(320)
      assertEqual(await launcherHidden(), 'false', 'A3/T29: the launcher did not reappear after exiting')
      const reappeared = await h.launcherRect()
      assert(reappeared !== null, 'launcher missing after exit')
      assertEqual(await h.page.count('[data-psa-launcher]'), 1, 'A3/T29: exactly one launcher must exist when idle')
      // A3/T19: the launcher floats only while idle. Drag it to a known place first;
      // A3/T19: the launcher floats only while idle. Drag it to a known place first;
      // it must return to that exact place after a docked mode cycle.
      const idleLauncherStart = await h.page.findRect('[data-psa-launcher]')
      assert(idleLauncherStart, 'idle floating launcher not found')
      await h.page.drag(
        { x: idleLauncherStart.x, y: idleLauncherStart.y },
        { x: 640, y: 320 },
        { steps: 16, appliedWhen: async () => {
          const rect = await h.launcherRect()
          return rect !== null && (rect.left !== idleLauncherStart.left || rect.top !== idleLauncherStart.top)
        } }
      )
      await sleep(400)
      const draggedIdleLauncher = await h.launcherRect()
      assert(draggedIdleLauncher, 'launcher missing after the idle drag')
      assert(
        draggedIdleLauncher.left !== idleLauncherStart.left || draggedIdleLauncher.top !== idleLauncherStart.top,
        'the idle launcher drag did not move the launcher'
      )
      const rememberedIdle = { left: draggedIdleLauncher.left, top: draggedIdleLauncher.top }
      /**
       * Capture one clipped evidence image (gated on PSA_LAUNCHER_EVIDENCE_DIR).
       * @param {string} name - file name.
       * @param {{ left: number, top: number, width: number, height: number }} rect - region.
       * @returns {Promise<void>}
       */
      const captureLauncherClip = async (name, rect) => {
        const dir = process.env.PSA_LAUNCHER_EVIDENCE_DIR
        if (!dir || rect === null) return
        await mkdir(dir, { recursive: true })
        const pad = 18
        const x = Math.max(0, Math.floor(rect.left - pad))
        const y = Math.max(0, Math.floor(rect.top - pad))
        const clip = {
          x,
          y,
          width: Math.min(VIEWPORT.width - x, Math.ceil(rect.width + pad * 2)),
          height: Math.min(VIEWPORT.height - y, Math.ceil(rect.height + pad * 2)),
          scale: 1
        }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(dir, name), Buffer.from(data.data, 'base64'))
      }
      const activation = await h.activateAndVerifyStable()
      const frame = await h.frame()
      const railWidth = Number.parseFloat(frame.railWidthVar || '0')
      const padding = Number.parseFloat(frame.paddingRight || '0')
      assert(frame.rail !== null, 'rail is missing after activation')
      assertEqual(frame.htmlActive, 'true', 'html[data-psa-active] marker')
      assertEqual(frame.frameMarker, 'true', 'frame[data-psa-frame] marker')
      assert(railWidth >= 320 && railWidth <= 420, `active-mode list rail width ${railWidth}px outside the 320..420 contract range`)
      assertNear(padding, railWidth, 2, 'frame padding-right vs computed rail width')
      assertEqual(frame.grid, baseline.grid, 'inline grid-template-columns must stay untouched')
      assert(frame.rail.width <= railWidth + 2, `rail is ${frame.rail.width}px wide, reserved ${railWidth}px`)
      assertNear(frame.rail.x + frame.rail.width, frame.viewport.width, 2, 'rail right edge must equal the viewport width (right-anchored)')
      assertNear(frame.rail.x, frame.viewport.width - railWidth, 2, 'rail left edge must sit at viewportWidth - railWidth')
      assert(
        frame.rail.x >= frame.viewport.width - railWidth - 3,
        `rail does not sit in the freed right strip (rail.x=${frame.rail.x}, viewport=${frame.viewport.width})`
      )
      // A3/T29: while active the launcher is hidden in place (no dock, no flight).
      const activeLauncherState = await h.page.evaluate(`(() => {
        const launcher = document.querySelector('[data-psa-launcher]')
        if (launcher === null) return null
        const style = getComputedStyle(launcher)
        return {
          count: document.querySelectorAll('[data-psa-launcher]').length,
          hidden: launcher.getAttribute('data-psa-launcher-hidden'),
          opacity: style.opacity,
          pointerEvents: style.pointerEvents,
          inRail: launcher.closest('[data-psa-rail]') !== null,
          docked: document.querySelectorAll('[data-psa-launcher-docked]').length,
          flight: document.querySelectorAll('[data-psa-launcher-flight]').length
        }
      })()`)
      assert(activeLauncherState !== null, 'no launcher control while active')
      assertEqual(activeLauncherState.count, 1, 'there must be exactly one launcher control while active')
      assertEqual(activeLauncherState.hidden, 'true', 'A3/T29: the active launcher is not hidden')
      assertEqual(activeLauncherState.opacity, '0', 'A3/T29: the active launcher is not faded out')
      assertEqual(activeLauncherState.pointerEvents, 'none', 'A3/T29: the hidden launcher still receives pointer input')
      assertEqual(activeLauncherState.inRail, false, 'A3/T29: the launcher must not be docked in the rail header')
      assertEqual(activeLauncherState.docked, 0, 'A3/T29: no docked launcher control may exist')
      assertEqual(activeLauncherState.flight, 0, 'A3/T29: no flying launcher element may exist')
      await captureLauncherClip('launcher-active-hidden.png', { left: frame.rail.x, top: frame.rail.y, width: frame.rail.width, height: frame.rail.height })
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
      // A3/T29: narrow overlay layout keeps the list at the 320px floor with the
      // launcher still hidden (no docked copy anywhere).
      await h.page.setViewport(800, 700)
      await sleep(700)
      const narrowFrame = await h.frame()
      assertEqual(narrowFrame.railMode, 'overlay', 'the narrow viewport did not switch the rail to overlay mode')
      assert(narrowFrame.rail !== null, 'rail missing in the narrow overlay layout')
      assertEqual(Number.parseFloat(narrowFrame.railWidthVar || '0'), 320, 'narrow overlay list width is not the 320px floor')
      const narrowLauncher = await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-launcher-hidden')`)
      assertEqual(narrowLauncher, 'true', 'A3/T29: the launcher is not hidden in the narrow overlay layout')
      await captureLauncherClip('launcher-narrow-overlay-hidden.png', { left: narrowFrame.rail.x, top: narrowFrame.rail.y, width: narrowFrame.rail.width, height: narrowFrame.rail.height })
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(700)
      // Header X exits directly (no records) and the floating launcher returns at the
      // remembered idle position (drag persistence across a mode cycle).
      await h.click('[data-psa-exit]')
      await h.page.waitFor(
        `document.documentElement.getAttribute('data-psa-active') === null`,
        { timeout: 8000, label: 'mode off after header X' }
      )
      await sleep(450)
      const returnedFloating = await h.launcherRect()
      assert(returnedFloating, 'floating launcher did not return after exiting the mode')
      assertNear(returnedFloating.left, rememberedIdle.left, 3, 'floating launcher returned at the wrong remembered x')
      assertNear(returnedFloating.top, rememberedIdle.top, 3, 'floating launcher returned at the wrong remembered y')
      const returnedHit = await h.page.evaluate(`(() => {
        const launcher = document.querySelector('[data-psa-launcher]')
        if (launcher === null) return false
        const rect = launcher.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return hit === launcher || (hit !== null && launcher.contains(hit))
      })()`)
      assertEqual(returnedHit, true, 'the returned floating launcher is not hit-testable at its remembered position')
      await captureLauncherClip('launcher-idle-returned.png', {
        left: returnedFloating.left, top: returnedFloating.top,
        width: returnedFloating.width, height: returnedFloating.height
      })
      return `rail ${railWidth}px, padding ${padding}px, active launcher hidden in place (no dock/flight, one control), narrow overlay 320px with hidden launcher, header X returned floating at (${returnedFloating.left},${returnedFloating.top}) == remembered (${rememberedIdle.left},${rememberedIdle.top}), post-activate rail stable${activation.retried ? ' (after one activation retry)' : ''}, blocked click: 0 native hits / ${preventedPointers + preventedClicks} prevented events, view stayed on Plugins`

    },

    2: async () => {
      // Self-contained precondition (also makes --scenario 2 runnable on its own): leave any
      // active mode/selection from a previous scenario, open the native Plugins view, then make
      // sure the mode is on AND the rail is stable (same predicate as S1) before the Alt oracle.
      await h.ensureModeOff()
      await h.ensurePluginsView()
      await h.ensureActivatedStable()
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
      let boxDrawn = false
      try {
        boxDrawn = await (async () => {
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
          const drawn = await h.page.evaluate(`!!document.querySelector('[data-psa-box]')`)
          await h.page.mouse({ type: 'mouseReleased', x: boxTo.x, y: boxTo.y, button: 'left', clickCount: 1, modifiers: MOD.shift })
          await sleep(400)
          return drawn
        })()
      } catch (error) {
        if (!/CDP command timed out/i.test(error?.message || '')) throw error
        // N5: do not blindly repeat the marquee; only tolerate the timeout when the selection
        // state already proves the gesture took effect.
        const applied = await h.ui()
        if (applied.selection + applied.multi < 1) throw error
        boxDrawn = await h.page.evaluate(`!!document.querySelector('[data-psa-box]')`)
      }
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
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), null, `third Esc did not leave the mode ui=${JSON.stringify(await h.ui())} panel=${JSON.stringify(await h.page.evaluate(`document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel')`))}`)
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
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index]
        const expectedOutlines = index + 1
        await sleep(150)
        await h.page.clickAt(target.point.x, target.point.y, {
          modifiers: MOD.shift,
          appliedWhen: async () => {
            const state = await h.ui()
            return state.selection + state.multi >= expectedOutlines
          },
        })
        await sleep(450)
      }
      const multiUi = await h.ui()
      assertEqual(multiUi.multi, 3, 'three Shift+clicks must produce three multi-select outlines')
      assert(
        /3 elements selected|已选择 3 个元素/.test(multiUi.panelText),
        `rail status does not report 3 selected elements: ${short(multiUi.panelText, 140)}`
      )
      // A3/T24: when the multi-select gesture settles, ONE batch popover opens with
      // ONE shared requirement field for the whole selection.
      await h.page.waitFor(`!!document.querySelector('[data-psa-batch-popover]')`, { timeout: 5000, label: 'batch popover after multi-select' })
      await sleep(250)
      const batchPopover = await h.page.evaluate(`(() => {
        const popover = document.querySelector('[data-psa-batch-popover]')
        if (popover === null) return null
        const note = popover.querySelector('[data-psa-batch-note]')
        const rect = note === null ? null : note.getBoundingClientRect()
        return {
          count: popover.getAttribute('data-psa-count'),
          title: (popover.querySelector('[data-psa-batch-title]')?.innerText || '').trim(),
          noteCount: popover.querySelectorAll('[data-psa-batch-note]').length,
          items: [...popover.querySelectorAll('[data-psa-batch-items] li')].map((item) => (item.innerText || '').trim()),
          rect: rect === null ? null : { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
        }
      })()`)
      assert(batchPopover !== null, 'the batch popover did not render for a 3-element selection')
      assertEqual(batchPopover.count, '3', `the batch popover count is wrong: ${JSON.stringify(batchPopover)}`)
      assert(/3 elements selected|已选择 3 个元素/.test(batchPopover.title), `the batch popover title is wrong: ${batchPopover.title}`)
      assertEqual(batchPopover.noteCount, 1, 'the batch popover must have exactly ONE shared requirement field')
      assertEqual(batchPopover.items.length, 3, `the batch popover must list the 3 selected elements: ${JSON.stringify(batchPopover.items)}`)
      assert(batchPopover.rect !== null, 'the batch popover requirement textarea has no geometry')
      await h.page.clickAt(batchPopover.rect.x, batchPopover.rect.y)
      await sleep(120)
      await h.page.insertText('Batch group requirement')
      await sleep(200)
      await h.click('[data-psa-save-group]')
      await h.page.waitFor(
        `document.querySelector('[data-psa-batch-popover]') === null && document.documentElement.getAttribute('data-psa-active') === 'true'`,
        { timeout: 8000, label: 'batch popover commit' }
      )
      await sleep(350)
      const groupFeedback = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
      assert(/Group saved|已保存为分组/.test(groupFeedback), `missing group-saved feedback: ${short(groupFeedback)}`)
      const groupUi = await h.ui()
      assertEqual(groupUi.popover, false, 'the batch popover did not close after commit')
      assertEqual(groupUi.selection + groupUi.multi, 0, 'the batch commit did not clear the selection')
      const groupStored = await h.page.eval(probes.annotationStorage)
      assertEqual(groupStored.version, 3, 'the group commit did not persist the v3 document')
      assertEqual(groupStored.groups.length, 1, 'the batch commit must create exactly ONE group, not N singles')
      assertEqual(groupStored.records.length, 0, 'the batch commit must not create independent single records')
      assertEqual(groupStored.groups[0].itemCount, 3, 'the group must contain all three selected elements')
      assertEqual(groupStored.groups[0].requirement, 'Batch group requirement', 'the shared requirement was not persisted on the group')
      // A3/T29: the group is ONE ordinal; all its page marks carry the same number.
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length >= 3`, { timeout: 6000, label: 'group element marks' })
      const groupMarkIndices = await h.page.evaluate(`[...document.querySelectorAll('[data-psa-mark]')].map((mark) => mark.getAttribute('data-psa-mark-index'))`)
      assert(groupMarkIndices.length >= 3, `expected one page mark per group item: ${JSON.stringify(groupMarkIndices)}`)
      assertEqual(new Set(groupMarkIndices).size, 1, `group items must share ONE ordinal, got ${JSON.stringify(groupMarkIndices)}`)
      assertEqual(groupMarkIndices[0], '1', `the first group must be ordinal #1, got ${groupMarkIndices[0]}`)
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-group] .psa-entry-index')?.innerText`), '#1',
        'the group card does not show its single ordinal')
      // The collection view shows the group (with its children), not three singles.
      await h.openCollection()
      await sleep(300)
      const groupRows = await h.page.evaluate(`({
        groups: document.querySelectorAll('[data-psa-group]').length,
        singles: document.querySelectorAll('[data-psa-entry]:not([data-psa-group])').length,
        items: document.querySelectorAll('[data-psa-group-item]').length,
        requirement: document.querySelector('[data-psa-group-requirement]')?.value ?? null
      })`)
      assertEqual(groupRows.groups, 1, 'the collection must show exactly one group row')
      assertEqual(groupRows.singles, 0, 'the collection must not show the three elements as separate single rows')
      assertEqual(groupRows.items, 3, 'the expanded group must list all three child rows')
      assertEqual(groupRows.requirement, 'Batch group requirement', 'the group requirement is missing from the collection row')
      // Child remove + one undo step restores the whole group.
      await h.page.evaluate(`document.querySelector('[data-psa-group-item-remove]')?.click()`)
      await sleep(350)
      assertEqual(await h.page.evaluate(`document.querySelectorAll('[data-psa-group-item]').length`), 2, 'removing a child did not update the group')
      const childUndoToast = await h.page.eval(probes.undoToast)
      assertEqual(childUndoToast.present, true, 'child removal did not show the undo toast')
      await h.click('[data-psa-undo]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-group-item]').length === 3`, { timeout: 5000, label: 'child removal undo' })
      // Edit the shared requirement inline in the group card.
      assert(await h.page.evaluate(`document.querySelector('[data-psa-group-requirement]') !== null`),
        'group requirement textarea not found in the collection')
      await h.page.evaluate(`(() => {
        const field = document.querySelector('[data-psa-group-requirement]')
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(field, 'Batch requirement updated')
        field.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await sleep(450)
      const updatedStorage = await h.page.eval(probes.annotationStorage)
      assertEqual(updatedStorage.groups[0].requirement, 'Batch requirement updated', 'editing the group requirement did not persist')
      // ONE group chip for the group insertion (3 elements reported).
      const chipsBeforeGroup = (await h.page.eval(probes.chipState)).chips.length
      await h.click('[data-psa-group-insert]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === ${chipsBeforeGroup + 1}`,
        { timeout: 8000, label: 'one group chip from the group row' }
      )
      await sleep(350)
      const groupChipState = await h.page.eval(probes.chipState)
      const groupChipText = String(groupChipState.chips[groupChipState.chips.length - 1].text || '')
      assert(/UI annotations × 3|UI 标注 × 3/.test(groupChipText), `the group chip must report 3 elements: ${short(groupChipText)}`)
      assertEqual((await h.transcript()).messages, 0, 'the group chip insertion sent a message')
      // Delete the whole group from the card, then undo it back.
      await h.click('[data-psa-group-remove]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-group]').length === 0`, { timeout: 5000, label: 'group removal' })
      const groupUndoToast = await h.page.eval(probes.undoToast)
      assertEqual(groupUndoToast.present, true, 'group deletion did not show the undo toast')
      await h.click('[data-psa-undo]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-group]').length === 1`, { timeout: 5000, label: 'group undo' })
      await sleep(250)
      // Reload: the group (shared requirement + items) survives persistence.
      await h.clickBack()
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after the group reload' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the group reload' })
      await sleep(700)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const reloadedGroups = await h.page.eval(probes.annotationStorage)
      assertEqual(reloadedGroups.groups.length, 1, 'the group did not survive the reload')
      assertEqual(reloadedGroups.groups[0].itemCount, 3, 'the reloaded group lost items')
      assertEqual(reloadedGroups.groups[0].requirement, 'Batch requirement updated', 'the reloaded group lost its shared requirement')
      await h.activate()
      await h.openCollection()
      await sleep(250)
      assertEqual(await h.page.evaluate(`document.querySelectorAll('[data-psa-group]').length`), 1, 'the reloaded collection does not render the group card')
      await h.clickBack()
      // Cleanup: empty the draft so the next scenario starts from a blank composer.
      await h.page.evaluate(`(() => { const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]'); if (editor !== null) editor.focus(); return true })()`)
      await h.page.dispatchKey('a', 'KeyA', 65, MOD.meta)
      await h.page.pressKey('backspace')
      await sleep(250)
      await h.exit()
      return `3 Shift selections -> ONE batch popover (3 items, 1 shared requirement field) -> ONE group with 3 items (0 singles); collection group card with 3 child rows; shared requirement edited; ONE "@ UI annotations × 3" chip; child/group delete undo; reload keeps the group (requirement + 3 items); single flows untouched`
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
      // Self-contained precondition: when run alone this scenario seeds one current-session
      // single annotation so the batch assertion has an entry to insert.
      const seeded = await h.page.eval(probes.annotationStorage)
      if (seeded.count === 0) {
        const seedPoint = await h.page.eval(pageProbe.newSessionButton)
        assert(seedPoint, 'native New Session button not found for the S5 seed annotation')
        await h.page.moveTo(seedPoint.x, seedPoint.y)
        await sleep(150)
        await h.page.clickAt(seedPoint.x, seedPoint.y)
        await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'S5 seed popover' })
        const seedNote = await h.page.findRect('[data-psa-note]')
        assert(seedNote, 'S5 seed requirement textarea missing')
        await h.page.clickAt(seedNote.x, seedNote.y)
        await sleep(120)
        await h.page.insertText('S5 seed requirement')
        await sleep(200)
        await h.click('[data-psa-add]')
        await sleep(350)
      }
      await h.openCollection()
      const entries = await h.entries()
      assert(entries.length >= 1, 'need at least one collection entry for the batch assertion')
      assertEqual(entries.filter((entry) => entry.scope === 'current').length, entries.length, 'all S5 entries must be current-session entries')
      for (const entry of entries) {
        assert(entry.name.length > 0, `collection entry name must not be empty (ref ${entry.ref}) — a vacuous batch assertion is not acceptable`)
      }
      const chipsBefore = (await h.page.eval(probes.chipState)).chips.length
      await h.click('[data-psa-insert-batch]')
      // A3/T9/D2: the batch insertion is ONE native group chip ("UI annotations × N"),
      // never N per-item chips and never the old plain numbered blocks in the draft.
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === ${chipsBefore + 1}`,
        { timeout: 8000, label: 'batch group chip in the composer' }
      )
      await sleep(400)
      const batchChip = await h.page.eval(probes.chipState)
      assertEqual(batchChip.chips.length, chipsBefore + 1, 'D2: a batch insert must add exactly ONE group chip')
      const batchLabel = String(batchChip.chips[batchChip.chips.length - 1].text || '')
      assert(/UI annotations|UI 标注/.test(batchLabel), `the group chip label is not the batch label: ${short(batchLabel)}`)
      const composer = await h.composer()
      const text = composer.text || ''
      assert(text.includes('DRAFT-PRESERVE'), 'the pre-existing draft text was not preserved')
      assert(!/^\d+\. /m.test(text), `the batch chip must not insert the plain numbered blocks: ${short(text, 260)}`)
      assert(!/Please adjust the UI elements below|请调整以下 UI 元素/.test(text), 'the batch header must not be inserted as plain text when a chip is available')
      const transcriptAfter = await h.transcript()
      assertEqual(transcriptAfter.messages, transcriptBefore.messages, 'a message was sent by the batch insert')
      assertEqual(transcriptAfter.chatChildren, transcriptBefore.chatChildren, 'conversation DOM changed after the batch insert')
      assertEqual(await h.refreshSession(), sessionBefore, 'the current session id changed after the batch insert')
      assert(composer.focused, 'the composer was not focused after insertion')
      // Cleanup: empty the draft so the next scenario starts from a blank composer.
      await h.page.evaluate(`(() => { const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]'); if (editor !== null) editor.focus(); return true })()`)
      await h.page.dispatchKey('a', 'KeyA', 65, MOD.meta)
      await h.page.pressKey('backspace')
      await sleep(250)
      await h.clickBack()
      return `draft preserved before one group chip "${short(batchLabel, 40)}" (D2, no numbered blocks in the draft), not sent, composer focused`
    },

    6: async () => {
      // Self-contained precondition (full-run state and --from 6 state must behave the same):
      // mode off -> conversation -> stable mode on -> empty collection -> deterministic sidebar
      // scroll position, then pick the true-removal target.
      await h.ensureModeOff()
      await h.ensureConversation()
      await h.ensureSidebarExpanded()
      await h.ensureActivatedStable()
      await h.ensureStatusPanel()
      await h.clearSelection()
      const sessionOne = await h.refreshSession()
      // Empty the collection so inherited entries cannot affect the stale/scope assertions.
      await h.openCollection()
      if ((await h.ui()).entries > 0) {
        await h.click('[data-psa-clear]')
        await sleep(300)
      }
      await h.clickBack()
      await h.ensureStatusPanel()
      // Deterministic sidebar position: scroll the list that hosts the workspace rows to the
      // top (setup convenience; the native collapse below is the real interaction).
      const sidebarReset = await h.page.eval(() => {
        const row = document.querySelector('[data-row-key^="workspace:"]')
        if (row === null) return null
        let element = row.parentElement
        while (element !== null && element !== document.body) {
          const style = getComputedStyle(element)
          if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 10) {
            element.scrollTop = 0
            return { scrollTop: element.scrollTop, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }
          }
          element = element.parentElement
        }
        return null
      })
      if (sidebarReset === null) {
        // NIT-5: the workspace list may be non-scrollable (already at the top) — that is a valid
        // state, so do not fail setup; continue with the visible rows.
        log('      S6: sidebar workspace list is not scrollable; assuming it is already at the top')
      }
      await sleep(400)
      // ---- Part A: truly removed targets must be marked stale.
      // Target A (hard assertion): a workspace row with a stable data-row-key. The native
      // collapse below unmounts the whole sidebar list, so this element is truly removed.
      const rowPoint = await h.page.eval(probes.workspaceRowPoint)
      assert(rowPoint, 'sidebar workspace row not found for the true-removal case')
      const targetKey = rowPoint.key
      assert(typeof targetKey === 'string' && targetKey.startsWith('workspace:'), `unexpected true-removal target key: ${targetKey}`)
      await h.page.clickAt(rowPoint.x, rowPoint.y)
      await sleep(320)
      assert((await h.ui()).popover, 'selecting the sidebar workspace row did not open the popover')
      const removedPopover = await h.popover()
      await h.click('[data-psa-add]')
      await sleep(320)
      // Phase 2-A auto-dismiss: the commit already closed the popover and cleared the
      // selection, so no Esc step is needed (an Esc here would leave the mode).
      // The target must really be in the CURRENT session's collection before the collapse.
      await h.openCollection()
      const allTargetEntries = await h.entries()
      const targetEntries = allTargetEntries.filter((entry) => entry.scope === 'current')
      assert(
        targetEntries.length >= 1,
        `the true-removal target is not present as a current-session collection entry ` +
          `(entries: ${JSON.stringify(allTargetEntries.map((entry) => `${entry.scope}:${entry.name}`))})`
      )
      const targetEntry = targetEntries.find(
        (entry) => entry.locator.includes(targetKey) || entry.locator.includes('[data-row-key=')
      )
      assert(
        targetEntry !== undefined,
        `could not identify the true-removal entry ${targetKey} in the collection ` +
          `(locators: ${JSON.stringify(targetEntries.map((entry) => entry.locator))})`
      )
      const trueRemovalRef = targetEntry.ref
      assert(typeof trueRemovalRef === 'string' && trueRemovalRef.length > 0, 'true-removal entry has no ref id')
      await h.clickBack()
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
      // Phase 2-A auto-dismiss: no post-commit Esc (see the first target above).
      await h.openCollection()
      const beforeCollapse = await h.entries()
      const toggleEntry = beforeCollapse.find((entry) => /Collapse sidebar/.test(entry.name))
      const removedEntry = beforeCollapse.find((entry) => entry.ref === trueRemovalRef)
      assert(
        removedEntry !== undefined,
        `collection entry for the recorded true-removal target ${targetKey} disappeared before the collapse ` +
          `(entries: ${JSON.stringify(beforeCollapse.map((entry) => `${entry.scope}:${entry.name}`))})`
      )
      assertEqual(removedEntry.scope, 'current', 'the true-removal entry must be scoped to the current session before the collapse')
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
      // Batch insert: A3/T9 makes the insertion ONE group chip; the stale/status lines
      // are emitted by the send-time codec (unit-tested) and are intentionally absent
      // from the draft. The stale target's honesty is asserted above through the rail
      // row status plus the codec unit tests.
      const domBeforeInsert = await h.page.eval(probes.nonComposerElementCount)
      const chipsBefore = (await h.page.eval(probes.chipState)).chips.length
      await h.click('[data-psa-insert-batch]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === ${chipsBefore + 1}`,
        { timeout: 8000, label: 'batch group chip for the stale-target collection' }
      ).catch(() => {})
      await sleep(300)
      const staleChip = await h.page.eval(probes.chipState)
      assertEqual(staleChip.chips.length, chipsBefore + 1, 'the stale-target batch must add exactly one group chip')
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
        ['resolved', 'changed', 'missing', 'ambiguous'].includes(restoredRow.status),
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
      // F9/N4: re-locate on an OTHER-scope row must refuse with the explicit
      // "this annotation belongs to another session" feedback and must not scroll the canvas.
      await h.openCollection()
      const otherRelocate = await h.page.eval(probes.entryRelocateRect, 'other')
      assert(otherRelocate, 'no re-locate control on an other-scope collection row (N4)')
      const chatScrollBefore = await h.page.evaluate(
        `(() => {
          const chat = document.querySelector('[data-conversation-region="chat"]')
          if (chat === null) return null
          const scrollable = [chat, ...chat.querySelectorAll('*')].find((element) => element.scrollHeight > element.clientHeight + 10)
          return scrollable ? scrollable.scrollTop : chat.scrollTop
        })()`
      )
      await h.page.clickAt(otherRelocate.x, otherRelocate.y)
      await sleep(450)
      const relocateUi = await h.ui()
      assert(
        typeof relocateUi.feedback === 'string' && /another session|其他会话/i.test(relocateUi.feedback),
        `re-locate on an other-scope row must report "this annotation belongs to another session", ` +
          `got ${JSON.stringify(relocateUi.feedback)} (N4)`
      )
      const chatScrollAfter = await h.page.evaluate(
        `(() => {
          const chat = document.querySelector('[data-conversation-region="chat"]')
          if (chat === null) return null
          const scrollable = [chat, ...chat.querySelectorAll('*')].find((element) => element.scrollHeight > element.clientHeight + 10)
          return scrollable ? scrollable.scrollTop : chat.scrollTop
        })()`
      )
      assertEqual(chatScrollAfter, chatScrollBefore, 're-locate on an other-scope row scrolled the canvas (F9)')
      assertEqual(
        await h.page.evaluate(`document.querySelector('[data-psa-insert-batch]')?.disabled === true`),
        false,
        'batch insert must be enabled once a current-session entry exists'
      )
      // Batch insert with mixed scope (A3/T8/T9): only the CURRENT entry is selected, so
      // the insertion is ONE group chip over that single entry. Other-Session records are
      // excluded before the chip ref is built; their count is surfaced by the rail notice
      // (asserted above), never by the draft.
      const domBeforeMixed = await h.page.eval(probes.nonComposerElementCount)
      const chipsBeforeMixed = (await h.page.eval(probes.chipState)).chips.length
      await h.click('[data-psa-insert-batch]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === ${chipsBeforeMixed + 1}`,
        { timeout: 8000, label: 'mixed-scope group chip in the letter composer' }
      ).catch(() => {})
      await sleep(400)
      const mixedChip = await h.page.eval(probes.chipState)
      assertEqual(mixedChip.chips.length, chipsBeforeMixed + 1, 'the mixed-scope batch must add exactly one group chip')
      const mixedLabel = String(mixedChip.chips[mixedChip.chips.length - 1].text || '')
      assert(/UI annotations|UI 标注/.test(mixedLabel), `the mixed-scope chip is not the batch group label: ${short(mixedLabel)}`)
      assert(/×\s*1|×1/.test(mixedLabel), `the mixed-scope group chip must cover exactly the one current entry: ${short(mixedLabel)}`)
      const mixedText = mixedChip.text || ''
      assert(!/\(\d+ annotation\(s\) from other sessions skipped\)|来自其他会话/.test(mixedText),
        'the chip draft must not carry the plain skipped line (it belongs to the send-time codec/rail notice)')
      assert(!/^\d+\. /m.test(mixedText), 'the mixed-scope chip must not insert numbered plain blocks')
      // N4: leak check covers the entry name, note and locator text of every other-scope row.
      const otherLeakTokens = []
      for (const entry of otherEntries) {
        for (const token of [entry.name, entry.note, entry.locator]) {
          const text = String(token || '').trim()
          if (text.length >= 6 && text !== '—') otherLeakTokens.push(text)
        }
      }
      for (const token of otherLeakTokens) {
        assert(!mixedText.includes(token), `other-session entry content leaked into the composer: "${token}"`)
      }
      assertEqual(await h.page.eval(probes.nonComposerElementCount), domBeforeMixed, 'native DOM elements changed outside the composer during the mixed-scope insertion')
      assertEqual((await h.transcript()).messages, 0, 'a message was sent after the mixed-scope insert')
      await h.ensureStatusPanel()
      const scopeDetail = `mixed scope: ${short(sessionA, 22)} (${otherEntries.length} entries -> other, excluded from the chip ref) + ${short(sessionB, 22)} (1 current entry -> ONE group chip "${short(mixedLabel, 30)}")`
      return `true removal -> rail status missing + one batch group chip (stale codec line unit-tested; in-place replaced toggle status: ${toggleStatus}, rebuilt row status: ${restoredStatus}); ${scopeDetail}; no DOM mutation`
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
      const markerDeadline = Date.now() + 15000
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
        transitionRecord.at <= 15000,
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
      /** Read the single launcher control and whether it is docked. @returns {Promise<object | null>} state. */
      const readLauncher = async () => h.page.evaluate(`(() => {
        const launcher = document.querySelector('[data-psa-launcher]')
        if (launcher === null) return null
        const rail = launcher.closest('[data-psa-rail]')
        const layer = launcher.closest('[data-psa-layer]')
        const rect = launcher.getBoundingClientRect()
        const railRect = rail === null ? null : rail.getBoundingClientRect()
        return {
          count: document.querySelectorAll('[data-psa-launcher]').length,
          docked: launcher.getAttribute('data-psa-launcher-docked') === 'true',
          hidden: launcher.getAttribute('data-psa-launcher-hidden') === 'true',
          inRail: rail !== null,
          inLayer: layer !== null,
          activeAttr: launcher.getAttribute('data-psa-active'),
          ariaPressed: launcher.getAttribute('aria-pressed'),
          rect: { left: Math.round(rect.x), top: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          railRect: railRect === null ? null : {
            left: Math.round(railRect.x), top: Math.round(railRect.y),
            width: Math.round(railRect.width), height: Math.round(railRect.height)
          }
        }
      })()`)
      const insideRail = (launcherRect, railRect) => launcherRect !== null && railRect !== null
        && launcherRect.left >= railRect.left - 1 && launcherRect.top >= railRect.top - 1
        && launcherRect.left + launcherRect.width <= railRect.left + railRect.width + 1
        && launcherRect.top + launcherRect.height <= railRect.top + railRect.height + 1
      // ---- Idle drag: drag to a mid position, then to the bottom-right corner (clamped). ----
      const start = await h.launcherRect()
      assert(start, 'launcher missing before the drag scenario')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-active')`), 'false', 'launcher must be inactive before the drag')
      const clickable = await h.ensureLauncherClickable()
      assert(clickable, `the launcher centre does not receive pointer input: ${short(JSON.stringify(await h.page.eval(probes.launcherCenterCover)))}`)
      const launcherMovedFrom = (origin) => async () => {
        const rect = await h.launcherRect()
        return rect !== null && (rect.left !== origin.left || rect.top !== origin.top)
      }
      await h.page.drag(
        { x: start.x, y: start.y },
        { x: 430, y: 330 },
        { steps: 16, appliedWhen: launcherMovedFrom(start) }
      )
      await sleep(350)
      let moved = await h.launcherRect()
      if (moved.left === start.left && moved.top === start.top) {
        // Retry once with a slower sequence: a re-render or a transient overlay can swallow
        // the first pointerdown.
        await h.ensureLauncherClickable()
        await h.page.drag(
          { x: moved.x, y: moved.y },
          { x: 430, y: 330 },
          { steps: 24, appliedWhen: launcherMovedFrom(moved) }
        )
        await sleep(400)
        moved = await h.launcherRect()
      }
      assert(
        moved.left !== start.left || moved.top !== start.top,
        `the first drag never moved the launcher (start ${JSON.stringify(start)}, after ${JSON.stringify(moved)}, ` +
          `cover=${short(JSON.stringify(await h.page.eval(probes.launcherCenterCover)))}, ` +
          `dragging=${await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-dragging') ?? null`)})`
      )
      await h.page.drag(
        { x: moved.x, y: moved.y },
        { x: viewport.width - 5, y: viewport.height - 5 },
        { steps: 16, appliedWhen: launcherMovedFrom(moved) }
      )
      await sleep(350)
      const dragged = await h.launcherRect()
      assert(dragged.left >= 0 && dragged.top >= 0, `launcher left the viewport after the drag: ${short(JSON.stringify(dragged))}`)
      assert(dragged.left + dragged.width <= viewport.width + 1, 'launcher overflows the viewport horizontally after the drag')
      assert(dragged.top + dragged.height <= viewport.height + 1, 'launcher overflows the viewport vertically after the drag')
      assert(dragged.left + dragged.width <= viewport.width - 6, 'launcher lost its 8px right margin after the drag')
      assert(dragged.top + dragged.height <= viewport.height - 6, 'launcher lost its 8px bottom margin after the drag')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-active')`), 'false', 'dragging the launcher toggled the mode')
      assert(dragged.left !== moved.left || dragged.top !== moved.top, 'the corner drag never moved the launcher')
      // ---- Active: the launcher is docked in the rail; dragging it must do nothing. ----
      await h.activate()
      await sleep(320)
      const activeLauncher = await readLauncher()
      assert(activeLauncher !== null, 'launcher missing while active')
      assertEqual(activeLauncher.count, 1, 'exactly one launcher control must exist while active')
      assertEqual(activeLauncher.docked, false, 'A3/T29: no launcher may be docked in the rail header')
      const hiddenLauncher = await h.page.evaluate(`(() => {
        const launcher = document.querySelector('[data-psa-launcher]')
        if (launcher === null) return null
        const style = getComputedStyle(launcher)
        return { hidden: launcher.getAttribute('data-psa-launcher-hidden'), opacity: style.opacity, pointerEvents: style.pointerEvents, active: launcher.getAttribute('data-psa-active') }
      })()`)
      assertEqual(hiddenLauncher.hidden, 'true', 'A3/T29: the active launcher is not hidden')
      assertEqual(hiddenLauncher.opacity, '0', 'A3/T29: the active launcher is not faded out')
      assertEqual(hiddenLauncher.pointerEvents, 'none', 'A3/T29: the hidden launcher still receives pointer input')
      assertEqual(await h.page.count('[data-psa-launcher-docked]'), 0, 'A3/T29: docked launcher must not exist')
      assertEqual(await h.page.count('[data-psa-launcher-flight]'), 0, 'A3/T29: flying launcher must not exist')
      const storedWhileActive = await h.page.evaluate(`localStorage.getItem('power-suite.ui-annotation.launcher')`)
      // Dragging is impossible while active: the launcher is hidden, and a stray drag
      // gesture must not move/persist anything.
      const hiddenPoint = await h.launcherRect()
      await h.page.mouse({ type: 'mousePressed', x: hiddenPoint.left + 10, y: hiddenPoint.top + 10, button: 'left', clickCount: 1 })
      for (let step = 1; step <= 4; step += 1) {
        await h.page.mouse({ type: 'mouseMoved', x: hiddenPoint.left + 10 - step * 20, y: hiddenPoint.top + 10 - step * 15, button: 'left', buttons: 1 })
        await sleep(25)
      }
      await h.page.mouse({ type: 'mouseReleased', x: hiddenPoint.left - 70, y: hiddenPoint.top - 50, button: 'left', clickCount: 1 })
      await sleep(350)
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), 'true', 'a drag on the hidden launcher exited the mode')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-launcher-hidden')`), 'true', 'the hidden launcher changed state after a drag attempt')
      assertEqual(await h.page.evaluate(`localStorage.getItem('power-suite.ui-annotation.launcher')`), storedWhileActive, 'a drag attempt while active persisted a position')
      // ---- Wheel scrolling does not move the hidden launcher. ----
      const scrollable = await h.page.eval(probes.installScrollProbe)
      assert(scrollable, 'no native scrollable region available for the scroll-stability assertion')
      const scrolledBefore = await h.launcherRect()
      await h.page.wheel(scrollable.x, scrollable.y, -260)
      await sleep(320)
      const scrolledAfter = await h.launcherRect()
      assertEqual(scrolledAfter.left, scrolledBefore.left, 'hidden launcher moved horizontally when the page scrolled')
      assertEqual(scrolledAfter.top, scrolledBefore.top, 'hidden launcher moved vertically when the page scrolled')
      // ---- Narrow overlay layout: no docked launcher; list keeps the 320 px floor. ----
      await h.page.setViewport(800, 700)
      await sleep(700)
      const narrowFrame = await h.frame()
      assertEqual(narrowFrame.railMode, 'overlay', 'the narrow viewport did not switch the rail to overlay mode')
      assertEqual(Number.parseFloat(narrowFrame.railWidthVar || '0'), 320, 'narrow overlay list width is not the 320px floor')
      assertEqual(await h.page.count('[data-psa-launcher-docked]'), 0, 'a docked launcher appeared in the narrow overlay layout')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-launcher-hidden')`), 'true',
        'the launcher is not hidden in the narrow overlay layout')
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(700)
      // ---- Header X exits directly (no records); the floating launcher returns at the dragged corner. ----
      await h.click('[data-psa-exit]')
      await h.page.waitFor(
        `document.documentElement.getAttribute('data-psa-active') === null`,
        { timeout: 8000, label: 'mode off after header X' }
      )
      await sleep(400)
      const returned = await readLauncher()
      assert(returned !== null, 'floating launcher missing after exiting the mode')
      assertEqual(returned.hidden, false, 'the launcher is still hidden after exiting')
      assertNear(returned.rect.left, dragged.left, 3, 'the floating launcher did not return to the dragged x')
      assertNear(returned.rect.top, dragged.top, 3, 'the floating launcher did not return to the dragged y')
      // ---- Reload: mode off by default; the remembered floating position survives. ----
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after reload' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after reload' })
      await sleep(500)
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), null, 'annotation mode must be off by default after reload')
      const reloadedLauncher = await readLauncher()
      assertEqual(reloadedLauncher.docked, false, 'the launcher must float after a reload (mode off)')
      assertEqual(reloadedLauncher.activeAttr, 'false', 'the floating launcher is marked active after reload')
      assertNear(reloadedLauncher.rect.left, dragged.left, 2, 'remembered launcher x after reload')
      assertNear(reloadedLauncher.rect.top, dragged.top, 2, 'remembered launcher y after reload')
      return `idle drag clamp (${dragged.left},${dragged.top}); active launcher hidden (fade/scale, no dock/flight, one control); drag/wheel no-op while hidden; 800x700 overlay 320px with hidden launcher; header X returned floating at (${returned.rect.left},${returned.rect.top}) == dragged; reload kept it`
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
      assertEqual(baseline.htmlActive, null, 'mode must be off before the sidebar scenario')
      assert(baseline.canvas, 'conversation canvas missing')
      const canvasWidthBaseline = baseline.canvas.width
      await h.activate()
      const active = await h.frame()
      const activeRailWidth = Number.parseFloat(active.railWidthVar || '0')
      assert(active.rail !== null, 'rail missing after activation')
      // A3/T26: the managed list is the default body; its wide width is the active-mode
      // rail width (clamp(320px, 24vw, 420px)).
      assertEqual(active.panel, 'collection', `the rail must open on the managed list, got panel=${JSON.stringify(active.panel)}`)
      assertNear(activeRailWidth, 415, 2, `active list rail width is not clamp(320,24vw,420): ${activeRailWidth}`)
      assertNear(Number.parseFloat(active.paddingRight || '0'), activeRailWidth, 2, 'frame padding does not follow the list width')
      assertNear(active.rail.x + active.rail.width, active.viewport.width, 2, 'list rail must stay right-anchored')
      assert(active.rail.width <= activeRailWidth + 2, `list rail overflows its reserved strip: ${active.rail.width}`)
      assertNear(active.canvas.width, canvasWidthBaseline - activeRailWidth, 3, 'conversation canvas width does not shrink with the list rail')
      const defaultViewProbe = await h.page.evaluate(`({
        collectionRows: document.querySelectorAll('[data-psa-open-collection]').length,
        settingsRows: document.querySelectorAll('[data-psa-rail] [data-psa-open-settings]').length,
        gear: !!document.querySelector('[data-psa-rail] [data-psa-open-settings][aria-label]'),
        filters: document.querySelectorAll('[data-psa-filter]').length,
        footer: !!document.querySelector('[data-psa-add-annotation]'),
        empty: !!document.querySelector('[data-psa-empty]'),
        hint: (document.querySelector('[data-psa-selection-hint]')?.innerText || '').trim(),
        title: (document.querySelector('.psa-sb-rail-title')?.innerText || '').trim()
      })`)
      assertEqual(defaultViewProbe.collectionRows, 0, 'A3/T26: the old full-width Collection row must be gone')
      assertEqual(defaultViewProbe.settingsRows, 1, 'A3/T26: the header must contain exactly one settings gear icon')
      assertEqual(defaultViewProbe.gear, true, 'A3/T26: the settings gear has no aria-label')
      assertEqual(defaultViewProbe.filters, 3, 'the managed list filters did not render on activation')
      assertEqual(defaultViewProbe.footer, true, 'the managed list footer did not render on activation')
      assertEqual(defaultViewProbe.empty, true, 'the empty state did not render for an empty collection')
      assert(/Click an element to annotate it|点击页面元素开始标注/.test(defaultViewProbe.hint),
        `the selection hint is not discoverable on the list: ${defaultViewProbe.hint}`)
      assertEqual(defaultViewProbe.title, 'Annotations', `default list title wrong: ${defaultViewProbe.title}`)
      // Gear opens the settings view; Back (or the gear again) returns to the list.
      await h.click('[data-psa-open-settings]')
      await h.page.waitFor(`document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') === 'settings'`,
        { timeout: 4000, label: 'settings view from the gear icon' })
      assertEqual(await h.page.count('[data-psa-setting-passthrough]'), 1, 'settings view did not render its fields')
      await h.click('[data-psa-rail-back]')
      await h.page.waitFor(`document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') === 'collection'`,
        { timeout: 4000, label: 'list view after settings Back' })
      // Esc from settings also returns to the list (one step, mode stays on).
      await h.click('[data-psa-open-settings]')
      await h.page.waitFor(`document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') === 'settings'`,
        { timeout: 4000, label: 'settings view before Esc' })
      await h.page.pressKey('escape')
      await sleep(250)
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel')`), 'collection',
        'Esc in settings must return to the list, not leave the mode')
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), 'true',
        'Esc in settings left the annotation mode')
      // ---- Structure: header, badges, subtitle, filters, list, footer ----      // ---- Structure: header, badges, subtitle, filters, list, footer ----
      // A3/T25: seed a deterministic v3 document in an init script so the page's own
      // unload flush cannot overwrite it, then reload into the seeded state.
      const fixtureSessionId = await h.refreshSession()
      const fixtureNow = Date.now()
      const makeRecord = (index, note) => ({
        version: 2,
        id: `psa-sidebar-${index}-000000`,
        at: fixtureNow - index * 60000,
        updatedAt: fixtureNow - index * 60000,
        order: index,
        session: { sessionId: fixtureSessionId, cwd: '/tmp/annotation-fixture', workspaceLabel: 'annotation-fixture' },
        route: '/conversation/fixture',
        locator: {
          tag: 'button', role: 'button', name: `Button ${index}`,
          candidates: [{ kind: 'tag', value: 'button', reliability: 0.4 }],
          key: `tag:button:${index}`, path: 'button', uniqueSelector: null, uniqueVerified: false,
          ancestors: [], surface: 'page', ephemeral: false
        },
        component: 'button', text: `Button ${index}`, textDigest: '', context: '',
        bounds: { x: 20 + index * 8, y: 20 + index * 8, width: 120, height: 32 },
        viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
        note, included: true, lastStatus: null
      })
      const makeGroup = (id, requirement, items, order, collapsed) => ({
        kind: 'group', id, at: fixtureNow - 300000, createdAt: fixtureNow - 300000, updatedAt: fixtureNow - 120000, order,
        session: { sessionId: fixtureSessionId, cwd: '/tmp/annotation-fixture', workspaceLabel: 'annotation-fixture' },
        requirement, items, collapsed, included: true
      })
      const fixtureDoc = {
        version: 3,
        updatedAt: fixtureNow,
        records: [makeRecord(1, '保存更改按钮的层级不够突出，建议加强视觉层级。'), makeRecord(2, '列表项选中态的高亮范围偏小，建议与行高一致。')],
        groups: [
          makeGroup('psa-group-sidebar-01', '表单字段间距问题\n表单区域的多个控件存在间距不一致、对齐不整齐的问题。', [makeRecord(3, ''), makeRecord(4, ''), makeRecord(5, ''), makeRecord(6, '')], 2, false),
          makeGroup('psa-group-sidebar-02', '按钮样式统一', [makeRecord(7, ''), makeRecord(8, '')], 3, true)
        ]
      }
      // the record ids inside groups must stay unique across groups
      for (let index = 0; index < fixtureDoc.groups.length; index += 1) {
        fixtureDoc.groups[index].items = fixtureDoc.groups[index].items.map((item, itemIndex) => ({
          ...item,
          id: `psa-sidebar-${10 + index * 10 + itemIndex}-000000`
        }))
      }
      const fixtureSource = `(() => {
        try {
          const mode = localStorage.getItem('psa-t25-fixture')
          if (mode === 'pending') {
            localStorage.setItem('power-suite.ui-annotation.annotations', ${JSON.stringify(JSON.stringify(fixtureDoc))})
            localStorage.setItem('psa-t25-fixture', 'loaded')
          } else if (mode === 'clear') {
            localStorage.setItem('power-suite.ui-annotation.annotations', '')
            localStorage.setItem('psa-t25-fixture', 'cleared')
          }
        } catch {}
      })()`
      await h.page.addInitScript(fixtureSource)
      await h.page.evaluate(`localStorage.setItem('psa-t25-fixture', 'pending')`)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after the sidebar fixture reload' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the sidebar fixture reload' })
      await sleep(700)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      await h.activate()
      await h.openCollection()
      await sleep(350)
      const sidebar = await h.page.eval(probes.sidebarState)
      assert(sidebar !== null, 'redesigned sidebar did not render')
      assertEqual(sidebar.view, 'collection', 'rail data-view is not collection')
      assertEqual(sidebar.title, 'Annotations', `sidebar title is wrong: ${sidebar.title}`)
      assertEqual(sidebar.badge, '8', `sidebar total badge must count singles+group items (8): ${sidebar.badge} storage=${JSON.stringify(await h.page.eval(probes.annotationStorage))}`)
      assert(sidebar.subtitle.length > 0, 'sidebar subtitle missing')
      assertEqual(sidebar.filters.length, 3, `expected three filters: ${JSON.stringify(sidebar.filters)}`)
      assertEqual(sidebar.filters.map((filter) => filter.key).join(','), 'all,single,group', 'filter order/keys wrong')
      assert(/^All\s*4$/.test(sidebar.filters[0].text), `all-filter count wrong: ${sidebar.filters[0].text}`)
      assert(/^Singles\s*2$/.test(sidebar.filters[1].text), `single-filter count wrong: ${sidebar.filters[1].text}`)
      assert(/^Groups\s*2$/.test(sidebar.filters[2].text), `group-filter count wrong: ${sidebar.filters[2].text}`)
      assertEqual(sidebar.filters[0].pressed, 'true', 'the all filter must start pressed')
      assertEqual(sidebar.rows, 4, `mixed list must show 2 singles + 2 groups: ${sidebar.rows}`)
      assertEqual(sidebar.singles, 2, 'single rows missing')
      assertEqual(sidebar.groups, 2, 'group cards missing')
      assertEqual(sidebar.groupItems, 4, `expanded group must show 4 child rows: ${sidebar.groupItems}`)
      assert(sidebar.typeBadges.includes('single') && sidebar.typeBadges.includes('group'), `type badges missing: ${JSON.stringify(sidebar.typeBadges)}`)
      assert(sidebar.groupBadges.some((label) => /Group · 4 items/.test(label)), `group item-count badge wrong: ${JSON.stringify(sidebar.groupBadges)}`)
      assertEqual(JSON.stringify(sidebar.expandedGroups), JSON.stringify(['true', 'false']), 'group aria-expanded states wrong (one expanded, one collapsed)')
      // Always-visible edit/delete affordances (no hover-only actions).
      assert(sidebar.actions.length >= 8, `expected edit/delete actions for rows+groups+children: ${sidebar.actions.length}`)
      for (const action of sidebar.actions) {
        assert(action.visible, 'an edit/delete action is not visible without hover')
        assert(action.rect !== null && action.rect.height >= 18 && action.rect.width >= 18, `action hit target too small: ${JSON.stringify(action.rect)}`)
      }
      assertEqual(sidebar.footer.primary, 'Add annotation', `footer primary label wrong: ${sidebar.footer.primary}`)
      assertEqual(sidebar.footer.secondary, 'Cancel Annotation', `footer danger label wrong: ${sidebar.footer.secondary}`)
      assert(sidebar.footer.primaryHeight >= 30 && sidebar.footer.secondaryHeight >= 30, 'footer actions are under the 30px height target')
      const footerWidths = await h.page.evaluate(`(() => {
        const primary = document.querySelector('[data-psa-add-annotation]')
        const danger = document.querySelector('[data-psa-cancel-annotation]')
        if (primary === null || danger === null) return null
        const a = primary.getBoundingClientRect()
        const b = danger.getBoundingClientRect()
        return { primary: Math.round(a.width), danger: Math.round(b.width) }
      })()`)
      assert(footerWidths !== null, 'footer action widths could not be measured')
      assert(Math.abs(footerWidths.primary - footerWidths.danger) <= 2, `footer buttons are not equal width: ${JSON.stringify(footerWidths)}`)
      assertEqual(sidebar.empty, false, 'empty state rendered with a populated collection')
      assertEqual(sidebar.list.overflowX, false, 'sidebar content overflows horizontally at the wide width')
      assert(sidebar.list.scrollable !== null, 'sidebar list element missing')
      // ---- Filters are client-side and keep counts/aria state ----
      await h.click('[data-psa-filter="single"]')
      await sleep(250)
      const singlesOnly = await h.page.eval(probes.sidebarState)
      assertEqual(singlesOnly.singles, 2, 'single filter must show the two singles')
      assertEqual(singlesOnly.groups, 0, 'single filter must hide groups')
      assertEqual(singlesOnly.filters[1].pressed, 'true', 'single filter did not report aria-pressed')
      await h.click('[data-psa-filter="group"]')
      await sleep(250)
      const groupsOnly = await h.page.eval(probes.sidebarState)
      assertEqual(groupsOnly.groups, 2, 'group filter must show the two groups')
      assertEqual(groupsOnly.singles, 0, 'group filter must hide singles')
      await h.click('[data-psa-filter="all"]')
      await sleep(250)
      // ---- Group card collapse/expand ----
      const firstToggle = await h.page.findRect('[data-psa-group-toggle]')
      assert(firstToggle, 'group expand/collapse control missing')
      await h.page.clickAt(firstToggle.x, firstToggle.y)
      await sleep(300)
      const collapsed = await h.page.eval(probes.sidebarState)
      assertEqual(collapsed.groupItems, 0, 'collapsing the expanded group did not hide its children')
      assertEqual(JSON.stringify(collapsed.expandedGroups), JSON.stringify(['false', 'false']), 'collapse did not update aria-expanded')
      await h.page.clickAt(firstToggle.x, firstToggle.y)
      await sleep(300)
      const expanded = await h.page.eval(probes.sidebarState)
      assertEqual(expanded.groupItems, 4, 'expanding the group did not restore its children')
      assertEqual(JSON.stringify(expanded.expandedGroups), JSON.stringify(['true', 'false']), 'expand did not update aria-expanded')
      // ---- Light/dark high-fidelity captures of the required states ----
      if (process.env.PSA_SIDEBAR_EVIDENCE_DIR) {
        const dir = process.env.PSA_SIDEBAR_EVIDENCE_DIR
        await mkdir(dir, { recursive: true })
        const capture = async (name) => {
          const frame = await h.frame()
          const rail = frame.rail
          if (rail === null) return
          const pad = 10
          const clip = { x: Math.max(0, rail.x - pad), y: Math.max(0, rail.y - pad), width: rail.width + pad * 2, height: Math.min(VIEWPORT.height - 2, rail.height + pad * 2), scale: 1 }
          const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
          await writeFile(path.join(dir, name), Buffer.from(data.data, 'base64'))
        }
        await capture('sidebar-mixed-light.png')
        const firstRowRect = await h.page.findRect('.psa-entry-name')
        if (firstRowRect !== null) {
          await h.page.moveTo(firstRowRect.x, firstRowRect.y)
          await sleep(200)
          await capture('sidebar-hover-light.png')
        }
        await h.page.evaluate(`document.querySelector('[data-psa-filter="group"]')?.focus()`)
        await sleep(150)
        await capture('sidebar-focus-light.png')
        await h.page.evaluate(`document.activeElement?.blur()`)
        await sleep(120)
        const originalDark = await h.page.evaluate(`document.body.getAttribute('data-ds-dark-theme')`)
        await h.page.evaluate(`document.body.setAttribute('data-ds-dark-theme', 'true')`)
        await sleep(650)
        await capture('sidebar-mixed-dark.png')
        await h.click('[data-psa-filter="single"]')
        await sleep(250)
        await capture('sidebar-singles-dark.png')
        await h.click('[data-psa-filter="group"]')
        await sleep(250)
        await capture('sidebar-groups-dark.png')
        if (originalDark === null) await h.page.evaluate(`document.body.removeAttribute('data-ds-dark-theme')`)
        else await h.page.evaluate(`document.body.setAttribute('data-ds-dark-theme', ${JSON.stringify(originalDark)})`)
        await sleep(350)
        await h.click('[data-psa-filter="all"]')
        await sleep(200)
      }
      // ---- Narrow viewport: overlay mode keeps the wide sidebar usable ----
      await h.page.setViewport(800, 700)
      await sleep(700)
      const narrowFrame = await h.frame()
      assertEqual(narrowFrame.railMode, 'overlay', 'narrow viewport did not switch the rail to overlay mode')
      const narrowRailWidth = Number.parseFloat(narrowFrame.railWidthVar || '0')
      assertEqual(narrowRailWidth, 320, `narrow overlay sidebar width is not the 320px clamp floor: ${narrowRailWidth}`)
      assert(narrowFrame.rail !== null, 'narrow overlay sidebar missing')
      assert(narrowFrame.rail.x + narrowFrame.rail.width <= narrowFrame.viewport.width + 1, 'narrow overlay sidebar overflows the viewport')
      const narrowSidebar = await h.page.eval(probes.sidebarState)
      assert(narrowSidebar !== null && narrowSidebar.list.overflowX === false, 'narrow overlay sidebar overflows horizontally')
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(700)
      // ---- Exit confirmation: Cancel keeps state; Clear & exit clears records + storage ----
      await h.click('[data-psa-cancel-annotation]')
      await h.page.waitFor(`!!document.querySelector('[data-psa-exit-confirm]')`, { timeout: 4000, label: 'exit confirmation dialog' })
      await sleep(200)
      const confirmDialog = await h.page.evaluate(`(() => {
        const dialog = document.querySelector('[data-psa-exit-confirm]')
        if (dialog === null) return null
        const rect = dialog.getBoundingClientRect()
        const titleNode = dialog.querySelector('.psa-exit-confirm-title')
        const messageNode = dialog.querySelector('.psa-exit-confirm-message')
        return {
          count: dialog.getAttribute('data-psa-exit-count'),
          title: (titleNode?.innerText || '').replace(/\\s+/g, ' ').trim(),
          message: (messageNode?.innerText || '').replace(/\\s+/g, ' ').trim(),
          text: (String(titleNode?.innerText || '') + ' ' + String(messageNode?.innerText || '')).replace(/\\s+/g, ' ').trim(),
          role: dialog.getAttribute('role'),
          rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
          cancel: !!dialog.querySelector('[data-psa-exit-cancel]'),
          clear: !!dialog.querySelector('[data-psa-exit-clear]')
        }
      })()`)
      assert(confirmDialog !== null, 'A3/T29: no exit confirmation dialog appeared for Cancel Annotation')
      assertEqual(confirmDialog.count, '8', `confirmation count wrong: ${confirmDialog.count}`)
      assert(/Exit annotation mode and clear 8 annotations\?/.test(confirmDialog.text), `confirmation message wrong: ${short(confirmDialog.text)}`)
      assertEqual(confirmDialog.role, 'alertdialog', 'confirmation is not an alertdialog')
      assert(confirmDialog.cancel && confirmDialog.clear, 'confirmation buttons missing')
      await h.click('[data-psa-exit-cancel]')
      await sleep(250)
      assertEqual(await h.page.count('[data-psa-exit-confirm]'), 0, 'Cancel did not close the confirmation')
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), 'true', 'Cancel left the annotation mode')
      assertEqual((await h.page.eval(probes.annotationStorage)).count, 4, 'Cancel changed the stored records')
      // Confirm: clears all records, flushes the empty v3 document, exits, launcher returns.
      await h.click('[data-psa-cancel-annotation]')
      await h.page.waitFor(`!!document.querySelector('[data-psa-exit-confirm]')`, { timeout: 4000, label: 'exit confirmation before clearing' })
      if (process.env.PSA_T29_EVIDENCE_DIR) {
        await mkdir(process.env.PSA_T29_EVIDENCE_DIR, { recursive: true })
        const dialog = confirmDialog
        const pad = 12
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, dialog.rect.left - pad), y: Math.max(0, dialog.rect.top - pad), width: dialog.rect.width + pad * 2, height: dialog.rect.height + pad * 2, scale: 1 } })
        await writeFile(path.join(process.env.PSA_T29_EVIDENCE_DIR, 'exit-confirm-dialog.png'), Buffer.from(data.data, 'base64'))
      }
      await h.click('[data-psa-exit-clear]')
      await h.page.waitFor(`document.documentElement.getAttribute('data-psa-active') === null`, { timeout: 8000, label: 'mode off after Clear & exit' })
      await sleep(400)
      assertEqual(await h.page.count('[data-psa-exit-confirm]'), 0, 'confirm dialog stayed after clearing')
      const clearedStorage = await h.page.eval(probes.annotationStorage)
      assertEqual(clearedStorage.version, 3, 'cleared document lost its v3 version')
      assertEqual(clearedStorage.count, 0, 'confirmed exit did not clear the records')
      assertEqual(clearedStorage.itemCount, 0, 'confirmed exit left group items behind')
      assertEqual(await h.page.evaluate(`document.querySelector('[data-psa-launcher]')?.getAttribute('data-psa-launcher-hidden')`), 'false',
        'the launcher did not reappear after Clear & exit')
      const clearedLauncher = await h.launcherRect()
      assert(clearedLauncher !== null, 'floating launcher missing after clearing exit')
      // ---- Empty state: re-entering shows the empty managed list directly ----
      await h.activate()
      await h.openCollection()
      await sleep(300)
      const emptySidebar = await h.page.eval(probes.sidebarState)
      assertEqual(emptySidebar.empty, true, 'empty state did not render for an empty collection')
      assertEqual(emptySidebar.rows, 0, 'empty collection still rendered rows')
      if (process.env.PSA_T29_EVIDENCE_DIR) {
        const frame = await h.frame()
        const rail = frame.rail
        const pad = 10
        const dir = process.env.PSA_T29_EVIDENCE_DIR
        await mkdir(dir, { recursive: true })
        const clip = { x: Math.max(0, rail.x - pad), y: Math.max(0, rail.y - pad), width: rail.width + pad * 2, height: Math.min(VIEWPORT.height - 2, rail.height + pad * 2), scale: 1 }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(dir, 'footer-empty-state.png'), Buffer.from(data.data, 'base64'))
      }
      // Exit: full layout restoration from the wide sidebar.
      await h.exit()
      const restored = await h.frame()
      assertEqual(restored.paddingRight, '', 'frame padding not removed after exit')
      assertNear(restored.canvas.width, canvasWidthBaseline, 2, 'conversation canvas width not restored after exit')
      assertEqual(restored.grid, baseline.grid, 'inline grid style changed after exit')
      return `active list rail ${activeRailWidth}px (clamp 320..420; frame padding follows, canvas shrink, no Collection/Settings rows, gear settings + Back/Esc); header/badge/subtitle/filters (2 singles, 2 groups, 8 items) + always-visible edit/delete; client-side filters; group collapse/expand aria; footer Add annotation / Clear collection; narrow overlay 320px no overflow; empty state; exit restores baseline`
    },

    10: async () => {
      await h.ensureModeOff()
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(350)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      // Start from a clean persisted document so the reload assertions are exact.
      await h.page.eval(probes.clearAnnotationStorage)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready before the floating-surface scenario' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the clean reload' })
      await sleep(600)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      // Earlier scenarios legitimately leave unsent batches in the composer; this
      // scenario types a note, so it must run on a genuinely blank session (H2).
      const cleanBlank = await h.blankState()
      if (cleanBlank.ok !== true) {
        const fresh = await h.createBlankSessionViaHover()
        assert(fresh && typeof fresh.sessionId === 'string', 'could not create a blank session for the annotation-record scenario')
        await sleep(500)
        await h.ensureSidebarExpanded()
      }

      // ---- F4 annotation side: state event contract + [data-psd-hovercard] CSS ----
      const realHovercardPresent = await h.page.eval(probes.realPsdHovercardPresent)
      await h.page.eval(probes.installAnnotationStateRecorder)
      await h.page.eval(probes.clearAnnotationStateEvents)
      await h.page.eval(probes.createSyntheticHovercard)
      const overlayBefore = await h.page.eval(probes.paintLayerState)
      const hovercardIdle = await h.page.eval(probes.syntheticHovercardStyle)
      assertEqual(hovercardIdle.pointerEvents, 'none', 'the synthetic hovercard started pointer-interactive')
      assertEqual(hovercardIdle.zIndex, '5', 'the synthetic hovercard started at a custom z-index')

      await h.ensureActivatedStable()
      await sleep(300)
      const overlayActive = await h.page.eval(probes.paintLayerState)
      const hovercardActive = await h.page.eval(probes.syntheticHovercardStyle)
      assertEqual(overlayActive.inlineZ, '150', 'F1: [data-shell-overlay] inline z-index is not 150 while active')
      assertEqual(overlayActive.inlinePriority, 'important', 'F1: the paint-layer raise is not !important')
      assertEqual(overlayActive.computedZ, '150', 'F1: computed paint-layer z-index is not 150')
      assertEqual(overlayActive.raised, 'true', 'F1: data-psa-raised marker missing while active')
      assertEqual(hovercardActive.pointerEvents, 'auto', 'F4: [data-psd-hovercard] did not become pointer-interactive in annotation mode')
      assertEqual(hovercardActive.zIndex, '120', 'F4: [data-psd-hovercard] z-index is not 120 in annotation mode')
      const stateEventsActive = await h.page.eval(probes.readAnnotationStateEvents)
      assert(
        stateEventsActive.some((event) => event.active === true),
        `F4: no {active:true} power-suite:ui-annotation-state event (got ${short(JSON.stringify(stateEventsActive))})`
      )

      await h.exit()
      await sleep(250)
      const overlayAfterExit = await h.page.eval(probes.paintLayerState)
      assertEqual(overlayAfterExit.inlineZ, overlayBefore.inlineZ, 'F1: exit did not restore the captured inline z-index value')
      assertEqual(overlayAfterExit.inlinePriority, overlayBefore.inlinePriority, 'F1: exit did not restore the captured z-index priority')
      assertEqual(overlayAfterExit.computedZ, overlayBefore.computedZ, 'F1: exit did not restore the computed overlay z-index')
      assertEqual(overlayAfterExit.raised, null, 'F1: data-psa-raised leaked after exit')
      const hovercardAfterExit = await h.page.eval(probes.syntheticHovercardStyle)
      assertEqual(hovercardAfterExit.pointerEvents, 'none', 'F4: the hovercard CSS override leaked outside annotation mode')
      assertEqual(hovercardAfterExit.zIndex, '5', 'F4: the hovercard z-index override leaked outside annotation mode')
      const stateEvents = await h.page.eval(probes.readAnnotationStateEvents)
      assert(stateEvents.some((event) => event.active === false),
        `F4: no {active:false} power-suite:ui-annotation-state event after exit (got ${short(JSON.stringify(stateEvents))})`)
      await h.page.eval(probes.removeSyntheticHovercard)
      await h.ensureActivatedStable()

      // ---- F3: a floating layer that appears under a stationary pointer recomputes ----
      const plainTarget = await h.page.eval(pageProbe.newSessionButton)
      assert(plainTarget, 'native New session button not found for the F3 probe')
      const plainRect = { x: plainTarget.left, y: plainTarget.top, width: plainTarget.width, height: plainTarget.height }
      await h.page.moveTo(plainTarget.x, plainTarget.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-hover]')`, { timeout: 4000, label: 'hover outline on an ordinary control' })
      await sleep(180)
      const ordinaryHover = await h.page.eval(probes.hoverState)
      assert(ordinaryHover, 'ordinary hover outline missing')
      // A3/T18: ordinary page picking is leaf-first now, so the hover target is the
      // deepest eligible element inside the control (icon/text span), not the control
      // box itself — it must still lie inside the control box.
      assert(
        ordinaryHover.rect.x >= plainRect.x - 1
          && ordinaryHover.rect.y >= plainRect.y - 1
          && ordinaryHover.rect.x + ordinaryHover.rect.width <= plainRect.x + plainRect.width + 1
          && ordinaryHover.rect.y + ordinaryHover.rect.height <= plainRect.y + plainRect.height + 1,
        `ordinary leaf hover escaped the control rect (hover ${JSON.stringify(ordinaryHover.rect)}, control ${JSON.stringify(plainRect)})`
      )
      assert(
        ordinaryHover.rect.width <= plainRect.width || ordinaryHover.rect.height <= plainRect.height,
        'ordinary page picking must be leaf-first (hover target inside the control)'
      )
      const layerRect = await h.page.eval(probes.createFloatingProbeLayer, plainTarget.left - 20, plainTarget.top - 20, 240, 120)
      const hoverFollowDeadline = Date.now() + 2000
      let layerHover = null
      while (Date.now() < hoverFollowDeadline) {
        await sleep(80)
        layerHover = await h.page.eval(probes.hoverState)
        if (layerHover !== null
          && Math.abs(layerHover.rect.x - layerRect.x) <= 2
          && Math.abs(layerHover.rect.width - layerRect.width) <= 2
          && Math.abs(layerHover.rect.height - layerRect.height) <= 2) break
        layerHover = null
      }
      assert(layerHover !== null, 'F3: the hover outline did not follow the floating layer inserted under the stationary pointer within 2s')
      assertRectNear(layerHover.rect, layerRect, 2, 'F3: hover outline rect does not match the inserted floating layer')
      const layerStatus = await h.page.eval(probes.selectionState)
      assertEqual(layerStatus.popover, null, 'F3: inserting a floating layer opened a popover')
      await h.page.eval(probes.removeFloatingProbeLayer)
      const backDeadline = Date.now() + 2000
      let backHover = null
      while (Date.now() < backDeadline) {
        await sleep(80)
        backHover = await h.page.eval(probes.hoverState)
        if (backHover !== null
          && Math.abs(backHover.rect.x - ordinaryHover.rect.x) <= 2
          && Math.abs(backHover.rect.width - ordinaryHover.rect.width) <= 2) break
        backHover = null
      }
      assert(backHover !== null, 'F3: the hover outline did not return to the page element after the layer was removed')

      /**
       * Save one evidence clip around a viewport rect (gated on PSA_SURFACE_EVIDENCE_DIR).
       * @param {string} name - file name.
       * @param {{ x: number, y: number, width: number, height: number }} rect - region to frame.
       * @returns {Promise<void>}
       */
      const captureSurfaceClip = async (name, rect) => {
        const dir = process.env.PSA_SURFACE_EVIDENCE_DIR
        if (!dir || rect === null) return
        await mkdir(dir, { recursive: true })
        const pad = 16
        const x = Math.max(0, Math.floor(rect.x - pad))
        const y = Math.max(0, Math.floor(rect.y - pad))
        const clip = {
          x,
          y,
          width: Math.min(VIEWPORT.width - x, Math.ceil(rect.width + pad * 2)),
          height: Math.min(VIEWPORT.height - y, Math.ceil(rect.height + pad * 2)),
          scale: 1
        }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(dir, name), Buffer.from(data.data, 'base64'))
      }

      /**
       * Activate the popover Parent/Child control without pointer coordinates: the
       * popover may re-clamp after a level change, so a real pointer click on a stale
       * rect could miss it and select a page element behind it. A DOM click is the
       * same React handler and is deterministic.
       * @param {'up' | 'down'} direction - level direction.
       * @returns {Promise<void>}
       */
      const activateLevel = async (direction) => {
        const clicked = await h.page.evaluate(`(() => {
          const button = document.querySelector('[data-psa-level-${direction}]')
          if (button === null) return false
          button.focus()
          button.click()
          return true
        })()`)
        assert(clicked, `the Parent/Child (${direction}) control is missing`)
        await sleep(320)
      }

      // ---- F1/F2: native hover card — leaf-first hover, whole card via background/Parent ----
      await h.page.moveTo(700, 160)
      await sleep(200)
      const rowPoint = await h.page.eval(probes.workspaceRowPoint) ?? await h.page.eval(probes.sessionRowPoint, null)
      assert(rowPoint, 'no sidebar row available for the native hover-card probe')
      await h.page.moveTo(rowPoint.x, rowPoint.y)
      const cardDeadline = Date.now() + 5000
      let nativeCard = null
      while (Date.now() < cardDeadline) {
        await sleep(150)
        nativeCard = await h.page.eval(probes.nativeHoverCard)
        if (nativeCard !== null) break
      }
      assert(nativeCard !== null, 'the native hover preview card did not appear over a sidebar row within 5s')
      const paintLayer = await h.page.eval(probes.paintLayerState)
      assert(Number(paintLayer.computedZ) > nativeCard.z,
        `F1: annotation paint layer z=${paintLayer.computedZ} is not above the native card z=${nativeCard.z}`)
      // A3/T18 leaf-first: a hit on the card's inner text previews that deepest
      // element (span included), not the whole card.
      const innerCardPoint = await h.page.eval(probes.nativeHoverCardInnerPoint)
      assert(innerCardPoint !== null, 'no inner text element found in the native hover card')
      await h.page.moveTo(innerCardPoint.centerX, innerCardPoint.centerY)
      const innerDeadline = Date.now() + 3000
      let innerCardHover = null
      while (Date.now() < innerDeadline) {
        await sleep(100)
        const hover = await h.page.eval(probes.hoverState)
        if (hover === null) continue
        const rect = hover.rect
        const inside = rect.x >= nativeCard.rect.x - 2 && rect.y >= nativeCard.rect.y - 2
          && rect.x + rect.width <= nativeCard.rect.x + nativeCard.rect.width + 2
          && rect.y + rect.height <= nativeCard.rect.y + nativeCard.rect.height + 2
        const smaller = rect.width <= nativeCard.rect.width - 8 || rect.height <= nativeCard.rect.height - 8
        if (inside && smaller) {
          innerCardHover = hover
          break
        }
      }
      assert(innerCardHover !== null,
        `A3/T18: hovering a native card inner text element did not preview the leaf element (card ${nativeCard.rect.width}x${nativeCard.rect.height})`)
      assertEqual(innerCardHover.borderStyle, ordinaryHover.borderStyle, 'A3/T18: leaf hover outline border style differs from an ordinary control')
      assertEqual(innerCardHover.borderWidth, ordinaryHover.borderWidth, 'A3/T18: leaf hover outline border width differs from an ordinary control')
      assertEqual(innerCardHover.borderColor, ordinaryHover.borderColor, 'A3/T18: leaf hover outline border color differs from an ordinary control')
      await captureSurfaceClip('native-card-leaf-hover.png', innerCardHover.rect)
      // Background/padding hover still previews the whole surface.
      const cardPaddingPoint = { x: nativeCard.rect.x + 6, y: nativeCard.rect.y + 6 }
      await h.page.moveTo(cardPaddingPoint.x, cardPaddingPoint.y)
      const cardHoverDeadline = Date.now() + 3000
      let cardHover = null
      while (Date.now() < cardHoverDeadline) {
        await sleep(100)
        const hoverCandidate = await h.page.eval(probes.hoverState)
        if (hoverCandidate !== null
          && Math.abs(hoverCandidate.rect.x - nativeCard.rect.x) <= 3
          && Math.abs(hoverCandidate.rect.width - nativeCard.rect.width) <= 3
          && Math.abs(hoverCandidate.rect.height - nativeCard.rect.height) <= 3) {
          cardHover = hoverCandidate
          break
        }
      }
      assert(cardHover !== null, 'A3/T18: hovering the native card background/padding did not preview the whole card')
      await captureSurfaceClip('native-card-whole-hover.png', cardHover.rect)
      const layerAboveCard = await h.page.eval(probes.paintLayerState)
      assert(Number(layerAboveCard.computedZ) > nativeCard.z, 'paint layer no longer above the native card after hovering it')
      // Click the background: the WHOLE card becomes the selection.
      await h.page.clickAt(cardPaddingPoint.x, cardPaddingPoint.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover after clicking the hover-card background' })
      await sleep(250)
      const cardSelection = await h.page.eval(probes.selectionState)
      assertEqual(cardSelection.popover.surface, 'floating', 'clicking the hover-card background did not mark the record as a floating surface')
      assertEqual(cardSelection.popover.ephemeral, 'true', 'the floating-surface record is not marked ephemeral')
      assert(cardSelection.popover.ephemeralHint && cardSelection.popover.ephemeralHint.length > 0, 'the popover is missing the transient-surface hint')
      assertEqual(cardSelection.popover.copyLocator, true, 'the popover is missing the copy-locator action')
      assertNear(cardSelection.outlines.length, 1, 0, 'expected exactly one selection outline for the hover card')
      assertRectNear(cardSelection.outlines[0], nativeCard.rect, 3, 'the whole-card selection outline does not match the card rect')
      assert(String(cardSelection.popover.title || '').length > 0, 'the hover-card popover has no element title')
      await h.clearSelection()
      // Click the leaf: the popover opens for that deepest element.
      await h.page.moveTo(innerCardPoint.centerX, innerCardPoint.centerY)
      await sleep(150)
      await h.page.clickAt(innerCardPoint.centerX, innerCardPoint.centerY)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover after clicking an inner hover-card leaf' })
      await sleep(250)
      const leafCardSelection = await h.page.eval(probes.selectionState)
      assertEqual(leafCardSelection.popover.surface, 'floating', 'the inner hover-card element is not marked as a floating-surface record')
      assertRectNear(leafCardSelection.outlines[0], innerCardHover.rect, 4, 'clicking an inner card leaf did not select that leaf')
      const leafCardTitle = String(leafCardSelection.popover.title || '')
      assert(leafCardTitle.length > 0, 'the leaf popover has no element title')
      // Parent walks the full ancestor chain up to the whole card, Child walks back.
      const nativeWalk = []
      for (let step = 0; step < 6; step += 1) {
        const before = await h.page.eval(probes.selectionState)
        await activateLevel('up')
        const after = await h.page.eval(probes.selectionState)
        nativeWalk.push(after.outlines[0])
        if (Math.abs(after.outlines[0].x - nativeCard.rect.x) <= 3
          && Math.abs(after.outlines[0].width - nativeCard.rect.width) <= 3
          && Math.abs(after.outlines[0].height - nativeCard.rect.height) <= 3) break
        assert(after.outlines[0].width >= before.outlines[0].width - 1 || after.outlines[0].height >= before.outlines[0].height - 1,
          `A3/T18: Parent step ${step + 1} did not move up the ancestor chain (before ${JSON.stringify(before.outlines[0])}, after ${JSON.stringify(after.outlines[0])}, walk ${JSON.stringify(nativeWalk)}, popover ${JSON.stringify(after.popover)})`)
      }
      assertRectNear(nativeWalk[nativeWalk.length - 1], nativeCard.rect, 3, 'A3/T18: Parent did not reach the whole card')
      const parentedCardTitle = (await h.page.eval(probes.selectionState)).popover.title
      for (let step = 0; step < 6; step += 1) {
        const current = await h.page.eval(probes.selectionState)
        if (Math.abs(current.outlines[0].x - innerCardHover.rect.x) <= 4
          && Math.abs(current.outlines[0].width - innerCardHover.rect.width) <= 4
          && Math.abs(current.outlines[0].height - innerCardHover.rect.height) <= 4) break
        await activateLevel('down')
      }
      const childedCard = await h.page.eval(probes.selectionState)
      assertRectNear(childedCard.outlines[0], innerCardHover.rect, 4, 'A3/T18: Child did not walk back down to the leaf element')
      assertEqual(childedCard.popover.title, leafCardTitle, 'A3/T18: Child did not restore the leaf popover')
      assert(parentedCardTitle !== leafCardTitle, 'A3/T18: Parent and leaf must name different elements')
      await h.clearSelection()
      await h.page.moveTo(700, 160)
      await sleep(200)

      // ---- F2 leaf-first + full Parent/Child walk: deterministic dropdown fixture ----
      const panel = await h.page.eval(probes.createSurfaceProbePanel)
      const leafSpecs = [
        ['title', panel.title],
        ['subtitle', panel.subtitle],
        ['time', panel.time],
        ['token', panel.token],
        ['icon', panel.chevronPath]
      ]
      const measuredLeaves = []
      for (const [name, rect] of leafSpecs) {
        await h.page.moveTo(rect.centerX, rect.centerY)
        const deadline = Date.now() + 3000
        let hover = null
        while (Date.now() < deadline) {
          await sleep(80)
          const state = await h.page.eval(probes.hoverState)
          if (state === null) continue
          if (Math.abs(state.rect.x - rect.x) <= 3
            && Math.abs(state.rect.y - rect.y) <= 3
            && Math.abs(state.rect.width - rect.width) <= 3
            && Math.abs(state.rect.height - rect.height) <= 3) {
            hover = state
            break
          }
        }
        assert(hover !== null, `A3/T18: hovering the dropdown-like leaf "${name}" did not preview that leaf (${rect.width}x${rect.height})`)
        measuredLeaves.push({ name, rect, hover: hover.rect })
        if (name === 'title') {
          assertEqual(hover.borderStyle, ordinaryHover.borderStyle, 'A3/T18: leaf outline style differs from an ordinary control')
          assertEqual(hover.borderWidth, ordinaryHover.borderWidth, 'A3/T18: leaf outline width differs from an ordinary control')
          assertEqual(hover.borderColor, ordinaryHover.borderColor, 'A3/T18: leaf outline color differs from an ordinary control')
        }
      }
      const leafKeys = new Set(measuredLeaves.map((leaf) => JSON.stringify(leaf.rect)))
      assertEqual(leafKeys.size, measuredLeaves.length, 'A3/T18: the dropdown-like leaves must have distinct hover rects')
      await captureSurfaceClip('dropdown-leaves-panel.png', panel.panel)
      await h.page.moveTo(panel.subtitle.centerX, panel.subtitle.centerY)
      await sleep(120)
      await captureSurfaceClip('dropdown-subtitle-leaf-hover.png', panel.subtitle)
      // Click the subtitle leaf: its own popover opens.
      await h.page.clickAt(panel.subtitle.centerX, panel.subtitle.centerY)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover after clicking the dropdown-like subtitle leaf' })
      await sleep(250)
      const leafPanel = await h.page.eval(probes.selectionState)
      assertRectNear(leafPanel.outlines[0], panel.subtitle, 4, 'A3/T18: clicking the subtitle leaf did not select that leaf')
      const leafPanelTitle = String(leafPanel.popover.title || '')
      assert(leafPanelTitle.length > 0, 'A3/T18: the leaf popover has no element title')
      assertEqual(leafPanel.popover.surface, 'floating', 'A3/T18: the leaf record lost its floating-surface metadata')
      // Parent: leaf → left column → row → whole panel (full ancestor chain).
      const panelWalk = []
      let reachedRow = false
      for (let step = 0; step < 8; step += 1) {
        await activateLevel('up')
        const state = await h.page.eval(probes.selectionState)
        const outline = state.outlines[0]
        panelWalk.push(outline)
        if (Math.abs(outline.x - panel.row.x) <= 4 && Math.abs(outline.width - panel.row.width) <= 4
          && Math.abs(outline.height - panel.row.height) <= 4) reachedRow = true
        if (Math.abs(outline.x - panel.panel.x) <= 3 && Math.abs(outline.width - panel.panel.width) <= 3
          && Math.abs(outline.height - panel.panel.height) <= 3) break
      }
      assert(reachedRow, 'A3/T18: Parent did not walk through the row level on its way to the surface')
      assertRectNear(panelWalk[panelWalk.length - 1], panel.panel, 3, 'A3/T18: Parent did not reach the whole floating surface')
      await captureSurfaceClip('dropdown-parent-row-level.png', panel.row)
      // Child: walk back down to the subtitle leaf.
      for (let step = 0; step < 8; step += 1) {
        const state = await h.page.eval(probes.selectionState)
        if (Math.abs(state.outlines[0].x - panel.subtitle.x) <= 4
          && Math.abs(state.outlines[0].width - panel.subtitle.width) <= 4
          && Math.abs(state.outlines[0].height - panel.subtitle.height) <= 4) break
        await activateLevel('down')
      }
      const childBack = await h.page.eval(probes.selectionState)
      assertRectNear(childBack.outlines[0], panel.subtitle, 4, 'A3/T18: Child did not walk back down to the subtitle leaf')
      assertEqual(childBack.popover.title, leafPanelTitle, 'A3/T18: Child did not restore the leaf popover')
      // Background/padding → whole surface; Child at the root is clamped.
      await h.clearSelection()
      const panelPaddingPoint = { x: panel.panel.x + 6, y: panel.panel.y + 6 }
      await h.page.moveTo(panelPaddingPoint.x, panelPaddingPoint.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-hover]')`, { timeout: 4000, label: 'hover outline on the dropdown-panel background' })
      await sleep(150)
      const panelHover = await h.page.eval(probes.hoverState)
      assertRectNear(panelHover.rect, panel.panel, 2, 'A3/T18: the floating-panel background was not picked as the whole surface')
      await captureSurfaceClip('dropdown-panel-whole-hover.png', panel.panel)
      await h.page.clickAt(panelPaddingPoint.x, panelPaddingPoint.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover after clicking the floating-panel background' })
      await sleep(250)
      const wholePanel = await h.page.eval(probes.selectionState)
      assertEqual(wholePanel.popover.surface, 'floating', 'the synthetic panel was not recorded as a floating surface')
      assertRectNear(wholePanel.outlines[0], panel.panel, 3, 'the synthetic panel selection is not the whole surface')
      await activateLevel('down')
      const rootChild = await h.page.eval(probes.selectionState)
      assertRectNear(rootChild.outlines[0], panel.panel, 3, 'A3/T18: Child at the surface root must be clamped (no leaf under a background hit)')
      await h.clearSelection()
      await h.page.eval(probes.removeSurfaceProbePanel)
      await sleep(250)
      const leafSummary = measuredLeaves.map((leaf) => `${leaf.name} ${leaf.rect.width}x${leaf.rect.height}`).join(', ')
      const surfaceEvidence = `leaf-first: native card leaf ${innerCardHover.rect.width}x${innerCardHover.rect.height} of ${nativeCard.rect.width}x${nativeCard.rect.height}; dropdown leaves ${leafSummary} (distinct); click leaf -> leaf popover; Parent ${panelWalk.length} step(s) via row -> whole surface; Child back to leaf; background -> whole surface (Child clamped); ordinary-page/F3/F4 regressions intact`

      // ---- A3/T30: pin a hover-triggered floating surface while editing its annotation ----
      const hoverMenu = await h.page.eval(probes.createHoverMenuFixture)
      assert(hoverMenu, 'hover-menu fixture missing')
      const readHoverMenu = () => h.page.eval(probes.hoverMenuFixtureState)
      const readNotePopover = () => h.page.evaluate(`(() => {
        const popover = document.querySelector('[data-psa-popover]')
        if (popover === null) return null
        const locator = popover.querySelector('[data-psa-popover-ref] .psa-truncate')?.textContent ?? ''
        return { status: popover.querySelector('[data-psa-popover-status]')?.getAttribute('data-psa-status') ?? null, locator: locator.trim(), title: popover.querySelector('[data-psa-popover-title]')?.innerText ?? '' }
      })()`)
      await h.page.moveTo(900, 160)
      await sleep(120)
      await h.page.moveTo(hoverMenu.trigger.centerX, hoverMenu.trigger.centerY)
      let menuState = null
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(80)
        menuState = await readHoverMenu()
        if (menuState !== null && menuState.open) break
      }
      assert(menuState !== null && menuState.open, 'the synthetic hover menu did not open on trigger hover')
      await h.page.moveTo(menuState.leaf.centerX, menuState.leaf.centerY)
      await sleep(250)
      await h.page.clickAt(menuState.leaf.centerX, menuState.leaf.centerY)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the hover-menu leaf' })
      await sleep(250)
      const pinnedBefore = await readNotePopover()
      assert(pinnedBefore !== null, 'hover-menu leaf popover missing')
      assertEqual(pinnedBefore.status, 'resolved', `hover-menu leaf did not start Resolved: ${JSON.stringify(pinnedBefore)}`)
      // Move the pointer into our requirement textarea — without the pin the native
      // hover menu would close here.
      const pinnedNoteRect = await h.page.findRect('[data-psa-note]')
      assert(pinnedNoteRect, 'requirement textarea missing for the pin assertion')
      await h.page.moveTo(pinnedNoteRect.x, pinnedNoteRect.y)
      await h.page.clickAt(pinnedNoteRect.x, pinnedNoteRect.y)
      await sleep(450)
      const pinnedMenu = await readHoverMenu()
      const pinnedDuring = await readNotePopover()
      assert(pinnedMenu !== null && pinnedMenu.open, 'A3/T30: the hover surface closed while editing the annotation (pin failed)')
      assertEqual(pinnedDuring.status, 'resolved', 'A3/T30: the target stopped resolving while the surface stayed pinned')
      assertEqual(pinnedDuring.locator, pinnedBefore.locator, 'A3/T30: the displayed locator changed while editing')
      if (process.env.PSA_PIN_EVIDENCE_DIR) {
        await mkdir(process.env.PSA_PIN_EVIDENCE_DIR, { recursive: true })
        const clip = { x: 280, y: 200, width: 640, height: 380, scale: 1 }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(process.env.PSA_PIN_EVIDENCE_DIR, 'pinned-surface-while-editing.png'), Buffer.from(data.data, 'base64'))
      }
      // Closing the popover releases the pin; the surface closes and the hand-off is honest.
      await h.click('[data-psa-popover-close]')
      await sleep(500)
      const unpinnedMenu = await readHoverMenu()
      assert(unpinnedMenu !== null && unpinnedMenu.open === false, 'A3/T30: releasing the pin did not let the surface close')
      // Re-open, select the leaf again, then close the surface directly (simulating a
      // genuine disappearance): status may change, but the captured locator stays.
      await h.page.moveTo(900, 160)
      await sleep(150)
      await h.page.moveTo(hoverMenu.trigger.centerX, hoverMenu.trigger.centerY)
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(80)
        menuState = await readHoverMenu()
        if (menuState !== null && menuState.open) break
      }
      assert(menuState !== null && menuState.open, 'hover menu did not reopen')
      await h.page.moveTo(menuState.leaf.centerX, menuState.leaf.centerY)
      await sleep(220)
      await h.page.clickAt(menuState.leaf.centerX, menuState.leaf.centerY)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the second hover-menu selection' })
      await sleep(250)
      const honestBefore = await readNotePopover()
      await h.page.eval(probes.vanishHoverMenuFixture)
      await sleep(300)
      const honestNoteRect = await h.page.findRect('[data-psa-note]')
      if (honestNoteRect !== null) {
        await h.page.clickAt(honestNoteRect.x, honestNoteRect.y)
        await sleep(250)
      }
      const honestAfter = await readNotePopover()
      assert(honestAfter !== null, 'popover disappeared after the surface vanished')
      assert(honestAfter.status !== 'resolved', `A3/T30: status must change honestly after the surface disappeared: ${JSON.stringify(honestAfter)}`)
      assertEqual(honestAfter.locator, honestBefore.locator, 'A3/T30: locator display must stay the captured one after disappearance')
      await h.page.pressKey('escape')
      await sleep(250)
      await h.page.eval(probes.removeHoverMenuFixture)
      await h.page.moveTo(900, 160)
      await sleep(200)

      // ---- A2: verified unique locator resolves the duplicate-label control ----      // ---- A2: verified unique locator resolves the duplicate-label control ----
      const newSession = await h.page.eval(pageProbe.newSessionButton)
      assert(newSession, 'native New session button not found for the A2 probe')
      await h.page.moveTo(newSession.x, newSession.y)
      await sleep(150)
      await h.page.clickAt(newSession.x, newSession.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the New session control' })
      await sleep(250)
      const pageSelection = await h.page.eval(probes.selectionState)
      assertEqual(pageSelection.popover.surface, 'page', 'the New session control was recorded as a floating surface')
      assertEqual(pageSelection.popover.status, 'resolved', `A2: duplicate-label control did not resolve uniquely (status ${pageSelection.popover.status})`)
      // A3/T18 leaf-first: clicking the control selects the deepest eligible element
      // inside it, so the anchored locator is the leaf selector (which still anchors
      // to the labelled control / sidebar) rather than the control itself.
      const leafLocator = String(pageSelection.popover.ref || '')
      assert(
        /data-slot="sidebar"/.test(leafLocator) || /aria-label="New session"/.test(leafLocator),
        `A2: leaf popover locator is not anchored to the labelled control (${short(leafLocator)})`
      )
      await h.click('[data-psa-popover-copy-locator]')
      await sleep(500)
      const copyFeedback = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
      assert(/(copied|could not copy|已复制|复制失败)/i.test(copyFeedback),
        `D10: copy-locator produced no success/failure toast (got ${short(copyFeedback)})`)
      // Write a note and add the control to the collection.
      await h.assertBlankForInput('scenario 10 note typing')
      const noteRect = await h.page.findRect('[data-psa-note]')
      assert(noteRect, 'popover note textarea missing')
      await h.page.clickAt(noteRect.x, noteRect.y)
      await h.page.insertText('Keep this note')
      await sleep(200)
      await h.click('[data-psa-add]')
      await sleep(400)
      // A floating-surface record is persisted too (missing after its panel is gone).
      const selfCard = await h.page.eval(probes.createSurfaceProbePanel)
      await h.page.moveTo(selfCard.panel.centerX, selfCard.panel.centerY)
      await sleep(200)
      await h.page.clickAt(selfCard.panel.centerX, selfCard.panel.centerY)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the floating record' })
      await sleep(200)
      await h.click('[data-psa-add]')
      await sleep(400)
      await h.page.eval(probes.removeSurfaceProbePanel)
      await sleep(400)
      const stored = await h.page.eval(probes.annotationStorage)
      assert(stored.present, 'D1: no annotation document was persisted after adding records')
      assertEqual(stored.version, 3, 'D1: the persisted document is not version 3 (singles+groups)')
      assert(stored.count >= 2, `D1: expected at least two persisted records, got ${stored.count}`)
      const pageRecord = stored.records.find((record) => record.surface === 'page')
      const floatingRecord = stored.records.find((record) => record.surface === 'floating')
      assert(pageRecord, 'D1: no page record persisted')
      assert(floatingRecord, 'D1: no floating record persisted')
      assertEqual(pageRecord.version, 2, 'A2: the persisted record is not ElementRef v2')
      assertEqual(pageRecord.uniqueVerified, true, 'A2: the persisted leaf record has no verified unique selector')
      const pageUniqueSelector = String(pageRecord.uniqueSelector || '')
      assert(
        pageUniqueSelector.includes('data-slot') || pageUniqueSelector.includes('aria-label="New session"'),
        `A2: leaf uniqueSelector is not anchored to the labelled control (${short(pageUniqueSelector)})`
      )
      assert((pageRecord.ancestorCount ?? 0) >= 1, 'A2: the persisted record has no stable ancestors')
      assert((pageRecord.candidateCount ?? 0) >= 1, 'A2: the persisted record has no locator candidates')
      assertEqual(pageRecord.note, 'Keep this note', 'D1: the user note did not survive serialization')
      assertEqual(floatingRecord.ephemeral, true, 'A2: the floating record is not marked ephemeral')
      // A3/T32: xpath/jsPath are intended stored anchors now; HTML/styles/input values remain forbidden.
      for (const forbidden of ['outerHTML', 'innerHTML', 'computedStyle', 'value']) {
        assert(!JSON.stringify(pageRecord).includes(forbidden), `D11: the persisted record leaks ${forbidden}`)
      }
      // A2/F-2: Session identity must actually resolve (cwd + workspace basename),
      // not silently persist nulls; bounds/viewport are real capture data.
      const sessionCwd = String(pageRecord.session?.cwd ?? '')
      const workspaceLabel = String(pageRecord.session?.workspaceLabel ?? '')
      const recordSessionId = String(pageRecord.session?.sessionId ?? '')
      assert(recordSessionId.length > 0, 'A2/F-2: the persisted record has no sessionId')
      assertEqual(recordSessionId, await h.refreshSession(), 'A2/F-2: the persisted record belongs to another Session')
      assert(sessionCwd.length > 0, 'A2/F-2: the persisted record has no session.cwd (identity enrichment did not resolve)')
      assert(sessionCwd.startsWith('/'), `A2/F-2: session.cwd is not an absolute path (${short(sessionCwd)})`)
      assert(workspaceLabel.length > 0, 'A2/F-2: the persisted record has no workspaceLabel')
      assertEqual(workspaceLabel, sessionCwd.split('/').filter(Boolean).pop(), 'A2/F-2: workspaceLabel is not the cwd basename')
      const bounds = pageRecord.bounds
      assert(bounds !== null && typeof bounds === 'object', 'A2/D11: the persisted record has no bounds')
      assert(Number.isFinite(bounds.width) && bounds.width > 0, `A2/D11: bounds.width is not plausible (${JSON.stringify(bounds)})`)
      assert(Number.isFinite(bounds.height) && bounds.height > 0, `A2/D11: bounds.height is not plausible (${JSON.stringify(bounds)})`)
      assert(Number.isFinite(bounds.x) && Number.isFinite(bounds.y), `A2/D11: bounds x/y are not finite (${JSON.stringify(bounds)})`)
      assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= VIEWPORT.width + 1 && bounds.y + bounds.height <= VIEWPORT.height + 1,
        `A2/D11: bounds are outside the captured viewport (${JSON.stringify(bounds)})`)
      const captureViewport = pageRecord.viewport
      assert(captureViewport !== null && typeof captureViewport === 'object', 'A2/D11: the persisted record has no viewport')
      assertEqual(captureViewport.width, VIEWPORT.width, 'A2/D11: captured viewport width')
      assertEqual(captureViewport.height, VIEWPORT.height, 'A2/D11: captured viewport height')
      const routePath = String(pageRecord.route || '')
      assert(routePath.startsWith('/') && !routePath.includes('?') && !routePath.includes('#'), `D11: route is not a query-free pathname (${short(routePath)})`)

      // ---- D1: records and their statuses survive a reload ----
      // A3/T29: do not exit the mode here (a confirmed exit clears records by spec);
      // reload the page directly so the persisted v3 document is restored.
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after the persistence reload' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the persistence reload' })
      await sleep(700)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const reloadTargetSession = (await h.page.eval(probes.annotationStorage)).records.find((record) => record.note === 'Keep this note')?.session?.sessionId ?? null
      await h.ensureSessionFor(reloadTargetSession)
      await h.ensureActivatedStable()
      await h.openCollection()
      await sleep(400)
      const reloadedEntries = await h.page.eval(probes.entries)
      assert(reloadedEntries.length >= 2, `D1: persisted records were not restored after reload (${reloadedEntries.length} rows)`)
      assert(reloadedEntries.some((entry) => entry.note === 'Keep this note'), 'D1: the note did not survive the reload')
      const statuses = reloadedEntries.map((entry) => entry.status)
      if (!statuses.includes('resolved')) {
        const sessionDiagnostics = {
          currentSession: await h.refreshSession(),
          storage: (await h.page.eval(probes.annotationStorage)).records.map((record) => ({ id: record.id, note: record.note, sessionId: record.session?.sessionId ?? null, surface: record.surface })),
          marks: await h.page.eval(probes.marksState),
        }
        throw new Error(`D1: the page record did not re-resolve after reload (statuses ${short(JSON.stringify(statuses))}) | diagnostics=${short(JSON.stringify(sessionDiagnostics), 800)}`)
      }
      assert(statuses.includes('missing'), `D1: the removed floating target is not reported missing after reload (statuses ${short(JSON.stringify(statuses))})`)
      await h.clickBack()
      await sleep(200)

      // ---- D15: the 101st record is refused explicitly and the store stays capped ----
      await h.page.eval(probes.clearAnnotationStorage)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready before the cap seed' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher before the cap seed' })
      await sleep(700)
      await h.page.eval(probes.installAnnotationStateRecorder)
      await h.ensureActivatedStable()
      // Capture one real record, then clone the persisted document to the 100-record cap.
      const seedTarget = await h.page.eval(pageProbe.newSessionButton)
      await h.page.moveTo(seedTarget.x, seedTarget.y)
      await sleep(150)
      await h.page.clickAt(seedTarget.x, seedTarget.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover before the cap seed' })
      await h.click('[data-psa-add]')
      await sleep(400)
      // A3/T29: exiting with records now clears them, and the page's unload flush
      // would overwrite a seeded doc. Seed the 100-record document from an init
      // script (runs before the plugin boots on the next load) instead.
      await h.page.addInitScript(`(() => {
        try {
          if (localStorage.getItem('psa-cap-seed') !== 'pending') return
          const key = 'power-suite.ui-annotation.annotations'
          const doc = JSON.parse(localStorage.getItem(key) || 'null')
          const base = doc !== null && Array.isArray(doc.records) && doc.records.length > 0 ? doc.records[0] : null
          if (base === null) return
          const records = []
          for (let index = 0; index < 100; index += 1) {
            const clone = JSON.parse(JSON.stringify(base))
            clone.id = 'psa-seed-' + index
            clone.order = index
            records.push(clone)
          }
          localStorage.setItem(key, JSON.stringify({ version: 3, updatedAt: Date.now(), records, groups: [] }))
          localStorage.setItem('psa-cap-seed', 'done')
        } catch {}
      })()`)
      await h.page.evaluate(`localStorage.setItem('psa-cap-seed', 'pending')`)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after the cap seed' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the cap seed' })
      await sleep(700)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      await h.ensureActivatedStable()
      await h.openCollection()
      const cappedEntries = await h.page.eval(probes.entries)
      assertEqual(cappedEntries.length, 100, `D1/D15: the capped document did not load 100 rows (got ${cappedEntries.length})`)
      await h.clickBack()
      await sleep(200)
      const rowForCap = await h.page.eval(probes.workspaceRowPoint) ?? await h.page.eval(probes.sessionRowPoint, null)
      assert(rowForCap, 'no sidebar row available for the cap refusal probe')
      await h.page.moveTo(rowForCap.x, rowForCap.y)
      await sleep(150)
      await h.page.clickAt(rowForCap.x, rowForCap.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the cap refusal probe' })
      await sleep(200)
      await h.click('[data-psa-add]')
      await sleep(600)
      const capFeedback = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
      assert(/(full|100|已满)/i.test(capFeedback), `D15: the 101st record was not refused with a visible message (got ${short(capFeedback)})`)
      await sleep(400)
      const stillCapped = await h.page.eval(probes.annotationStorage)
      assertEqual(stillCapped.count, 100, 'D15: a refused add changed the persisted record count')

      // ---- cleanup: leave a clean page for the remaining scenarios/screenshots ----
      // Cancel Annotation confirms, clears the seeded records and exits the mode.
      await h.openCollection()
      await h.page.waitFor(`!!document.querySelector('[data-psa-cancel-annotation]')`, { timeout: 6000, label: 'cancel annotation action' })
      await h.click('[data-psa-cancel-annotation]')
      await h.page.waitFor(`!!document.querySelector('[data-psa-exit-clear]')`, { timeout: 4000, label: 'clear-and-exit confirmation' })
      await h.click('[data-psa-exit-clear]')
      await h.page.waitFor(`document.documentElement.getAttribute('data-psa-active') === null`, { timeout: 8000, label: 'mode off after cleanup clear' })
      await sleep(300)
      await h.page.eval(probes.clearAnnotationStorage)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after the scenario cleanup' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the scenario cleanup' })
      await sleep(600)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const cleanStorage = await h.page.eval(probes.annotationStorage)
      assertEqual(cleanStorage.count, 0, 'the scenario cleanup left annotation records behind')
      const finalOverlay = await h.page.eval(probes.paintLayerState)
      assertEqual(finalOverlay.raised, null, 'the scenario cleanup left data-psa-raised behind')
      const finalHovercard = await h.page.eval(probes.syntheticHovercardStyle)
      assertEqual(finalHovercard, null, 'the synthetic hovercard leaked after cleanup')
      return `F1 z=150/restore exact; F2 ${surfaceEvidence}; F3 stationary recompute; F4 state events + [data-psd-hovercard] pe/z (real card ${realHovercardPresent ? 'present' : 'absent in this branch'}); A2 uniqueSelector ${short(String(pageRecord.uniqueSelector).slice(0, 48))}; D1 reload kept ${reloadedEntries.length} records with resolved+missing; D15 refused at ${cappedEntries.length}`
    },

    11: async () => {
      // F4 cross-branch: the dynamic-workspaces branch owns the hover-card pin and
      // lifetime. On this branch the DW side is absent, so the scenario detects the
      // capability and records an explicit SKIP row (never a fake PASS); after the
      // branches merge the same code runs the real pin/select + no-mode regression.
      await h.ensureModeOff()
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(300)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const support = await detectDwHovercardSupport(h)
      if (support.merged !== true) {
        // The merged F4 pin contract is genuinely not installed: SKIP with the exact
        // reason (never a fake PASS). This covers both "no DW hovercard at all" and
        // "legacy DW card without the [data-psd-hovercard] marker".
        h.state.s11Absent = true
        h.state.s11SkipReason = support.reason
        return `F4 merged pin contract absent in this build: ${support.reason}; real PASS after the branches merge`
      }
      // DW IS installed on this build: a missing pin/select must surface as a real
      // FAILURE (with one retry for live-GUI timing), never as a SKIP row. Only the
      // genuinely-absent capability branch above may set `s11Absent`.
      const first = await runCrossBranchHovercardCheck(h)
      if (first.verified === true) return first.reason
      const retry = await runCrossBranchHovercardCheck(h)
      if (retry.verified === true) return `${retry.reason} (verified on retry; first attempt: ${first.reason})`
      throw new Error(
        `dynamic-workspaces feature is present but the F4 pin/select regression was not observed ` +
        `(first attempt: ${first.reason}; retry: ${retry.reason})`
      )
    },

    12: async () => {
      await h.ensureModeOff()
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(300)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      // Clean persisted document so the mark assertions are exact.
      await h.page.eval(probes.clearAnnotationStorage)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready before the marks scenario' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the clean reload' })
      await sleep(600)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const cleanBlank = await h.blankState()
      if (cleanBlank.ok !== true) {
        const fresh = await h.createBlankSessionViaHover()
        assert(fresh && typeof fresh.sessionId === 'string', 'could not create a blank session for the marks scenario')
        await sleep(500)
        await h.ensureSidebarExpanded()
      }
      const sessionId = await h.refreshSession()
      h.track(sessionId, 's12-session')
      await h.ensureActivatedStable()
      await h.ensureStatusPanel()
      await h.clearSelection()

      const popoverMetricsDir = process.env.PSA_POPOVER_METRICS_DIR
      const popoverOldLayout = process.env.PSA_POPOVER_OLD_LAYOUT === '1'
      /**
       * Persist one popover layout sample for the before/after comparison.
       * @param {string} name - sample name.
       * @param {object | null} layout - probe result.
       * @returns {Promise<void>}
       */
      const recordPopoverLayout = async (name, layout) => {
        if (!popoverMetricsDir) return
        await mkdir(popoverMetricsDir, { recursive: true })
        await writeFile(path.join(popoverMetricsDir, `${name}.json`), JSON.stringify(layout, null, 2))
      }
      /**
       * Capture one evidence clip around a viewport rect (gated).
       * @param {string} name - file name.
       * @param {{ x: number, y: number, width: number, height: number }} rect - clip.
       * @returns {Promise<void>}
       */
      const capturePopoverClip = async (name, rect) => {
        const dir = process.env.PSA_POPOVER_EVIDENCE_DIR
        if (!dir || rect === null) return
        await mkdir(dir, { recursive: true })
        const clip = {
          x: Math.max(0, Math.floor(rect.x)),
          y: Math.max(0, Math.floor(rect.y)),
          width: Math.max(1, Math.ceil(rect.width)),
          height: Math.max(1, Math.ceil(rect.height)),
          scale: 1
        }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(dir, name), Buffer.from(data.data, 'base64'))
      }
      /**
       * A3/T23: the footer keeps exactly the two primary buttons on one row and the
       * rainbow ring still hugs the textarea.
       * @param {object} layout - popoverLayout probe result.
       * @returns {void}
       */
      const assertFooterAndRing = (layout) => {
        assert(layout !== null, 'the requirement popover layout probe returned nothing')
        assertEqual(layout.footer.buttons.length, 2, `the footer must keep exactly two buttons, got ${JSON.stringify(layout.footer.buttons.map((button) => button.text))}`)
        const tops = layout.footer.buttons.map((button) => button.top)
        assert(Math.max(...tops) - Math.min(...tops) <= 1, `the footer buttons are not on one row: tops ${JSON.stringify(tops)}`)
        assertEqual(layout.footer.flexWrap, 'nowrap', 'the footer must not wrap')
        for (const button of layout.footer.buttons) {
          assert(button.scrollWidth <= button.clientWidth + 1, `footer button "${button.text}" wraps its label (${button.scrollWidth} > ${button.clientWidth})`)
        }
        assert(layout.ring !== null && layout.ring.exact === true, 'the rainbow ring no longer hugs the requirement textarea exactly')
        assert(layout.gap !== null && layout.gap >= 7 && layout.gap <= 16, `the caption-to-textarea gap ${layout.gap}px is outside the widened 7..16px range`)
      }
      /**
       * A3/T23: assert the new popover layout (trash in the caption row, two-button footer).
       * @param {object} layout - popoverLayout probe result.
       * @param {boolean} marked - whether the selection is already marked.
       * @returns {void}
       */
      const assertPopoverLayout = (layout, marked) => {
        assertFooterAndRing(layout)
        if (marked) {
          assert(layout.trash !== null, 'a marked selection is missing the trash button')
          assertEqual(layout.trash.inHead, true, 'the trash is not inside the Requirement caption row')
          assertEqual(layout.trash.rightAligned, true, 'the trash is not right-aligned in the caption row')
          assert(Math.abs(layout.trash.centerY - layout.caption.centerY) <= 4,
            `the trash is not on the caption line (trash centerY ${layout.trash.centerY}, caption centerY ${layout.caption.centerY})`)
          assert(/Delete|删除/.test(String(layout.trash.title || '')), `the trash lost its delete tooltip: ${layout.trash.title}`)
          assert(layout.head !== null && layout.head.height >= 14 && layout.head.height <= 32, `the caption row height is off: ${JSON.stringify(layout.head)}`)
        } else {
          assertEqual(layout.trash, null, 'an unmarked selection must not show the trash')
        }
      }

      /**
       * Select one page element, type its requirement, and commit it.
       * @param {{ x: number, y: number }} point - element centre.
       * @param {string} note - requirement text.
       * @param {Function} [observe] - optional observer run while the popover is open.
       * @returns {Promise<void>}
       */
      const annotateAt = async (point, note, observe) => {
        await h.page.moveTo(point.x, point.y)
        await sleep(140)
        await h.page.clickAt(point.x, point.y)
        await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: `popover before "${note}"` })
        if (typeof observe === 'function') await observe()
        const noteRect = await h.page.findRect('[data-psa-note]')
        assert(noteRect, 'popover requirement textarea missing')
        await h.page.clickAt(noteRect.x, noteRect.y)
        await sleep(120)
        await h.page.insertText(note)
        await sleep(200)
        await h.click('[data-psa-add]')
        await sleep(350)
        const afterCommit = await h.ui()
        assertEqual(afterCommit.popover, false, 'the commit did not auto-dismiss the popover')
        assertEqual(afterCommit.selection + afterCommit.multi, 0, 'the commit did not clear the selection')
      }

      const targetA = await h.page.eval(pageProbe.newSessionButton)
      assert(targetA, 'native New session button not found for the marks scenario')
      await annotateAt(targetA, 'Req one', async () => {
        const unmarkedLayout = await h.page.eval(probes.popoverLayout)
        await recordPopoverLayout('unmarked', unmarkedLayout)
        if (!popoverOldLayout) assertPopoverLayout(unmarkedLayout, false)
      })
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 1`, { timeout: 6000, label: 'first page mark' })
      const targetB = await h.page.eval(probes.pluginNavRect)
      assert(targetB, 'native Plugins navigation button not found for the marks scenario')
      await annotateAt(targetB, 'Req two')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 2`, { timeout: 6000, label: 'two page marks' })
      const marks = await h.page.eval(probes.marksState)
      assertEqual(marks.length, 2, 'expected exactly two page marks')
      for (const mark of marks) {
        assertEqual(mark.pointerEvents, 'none', 'a page mark must not intercept pointer events')
        assertEqual(mark.inLayer, true, 'a page mark was rendered outside the annotation layer')
        assert(mark.badge !== null && mark.badge.includes(`#${mark.index}`), `mark badge is missing its index: ${JSON.stringify(mark)}`)
        assert(/Req (one|two)/.test(mark.badge || ''), `mark badge is missing its requirement excerpt: ${JSON.stringify(mark)}`)
        assert(mark.rect.width > 0 && mark.rect.height > 0, 'mark has no geometry')
      }
      const stored = await h.page.eval(probes.annotationStorage)
      assertEqual(stored.count, 2, 'two records must be persisted')
      const recordA = stored.records.find((record) => record.note === 'Req one')
      assert(recordA, 'the first requirement was not persisted')

      // Hover the first mark: the card appears after the ~120 ms hover intent.
      const markA = (await h.page.eval(probes.marksState)).find((mark) => mark.id === recordA.id)
      assert(markA, 'no mark for the first record')
      await h.page.moveTo(markA.rect.x + Math.round(markA.rect.width / 2), markA.rect.y + Math.round(markA.rect.height / 2))
      await h.page.waitFor(`!!document.querySelector('[data-psa-detail]')`, { timeout: 4000, label: 'hover detail card' })
      await sleep(250)
      const detail = await h.page.eval(probes.detailState)
      assert(detail, 'detail card disappeared right after opening')
      assertEqual(detail.ref, recordA.id, 'the detail card shows the wrong record')
      assertEqual(detail.role, 'dialog', 'the detail card is not a dialog')
      assert(detail.title && detail.title.length > 0, 'the detail card has no element title')
      assertEqual(detail.requirement, 'Req one', 'the detail card is missing the full requirement')
      assertEqual(detail.status, 'resolved', 'the detail card status is not resolved')
      assert(/^\d+, \d+ · \d+×\d+$/.test(detail.position || ''), `the detail card position box is malformed: ${detail.position}`)
      const sessionShort = String(sessionId || '').startsWith('session-')
        ? String(sessionId).slice('session-'.length).replace(/[^0-9A-Za-z]/g, '').slice(0, 8)
        : String(sessionId || '').slice(0, 8)
      assert(detail.session && detail.session.includes(sessionShort), `the detail card session label is wrong: ${detail.session}`)
      assert(detail.workspace && detail.workspace.length > 0, 'the detail card is missing the workspace label')
      assert(detail.workspace !== '—', 'the detail card shows the empty workspace placeholder for a captured record (F-2)')
      assert(recordA.session && recordA.session.workspaceLabel, 'the persisted record has no workspaceLabel (F-2)')
      assertEqual(detail.workspace, recordA.session.workspaceLabel, 'detail workspace label mismatch')
      assert(detail.buttons.quickRef && detail.buttons.edit && detail.buttons.relocate && detail.buttons.copy && detail.buttons.delete,
        `the detail card is missing actions: ${JSON.stringify(detail.buttons)}`)
      assert(detail.rect.x >= 0 && detail.rect.y >= 0, `the detail card overflows the viewport: ${JSON.stringify(detail.rect)}`)
      assert(detail.rect.right <= detail.rect.viewport.width && detail.rect.bottom <= detail.rect.viewport.height,
        `the detail card overflows the viewport: ${JSON.stringify(detail.rect)}`)
      // Keep-open union: the pointer may enter the card without dismissing it.
      await h.page.moveTo(detail.rect.x + Math.round(detail.rect.width / 2), detail.rect.y + 12)
      await sleep(420)
      assertEqual((await h.page.eval(probes.detailState)) !== null, true, 'the detail card closed when the pointer entered it')
      // Hover-open must never steal focus.
      const focusStolen = await h.page.evaluate(`(() => { const active = document.activeElement; if (active === null) return false; if (!(active instanceof Element)) return false; return active.closest('[data-psa-detail]') !== null })()`)
      assertEqual(focusStolen, false, 'the hover detail card stole focus')

      // Edit mode: rainbow-wrapped textarea, save persists and bumps updatedAt.
      await h.click('[data-psa-detail-edit]')
      await h.page.waitFor(`!!document.querySelector('[data-psa-detail-note]')`, { timeout: 4000, label: 'detail edit textarea' })
      const editedRect = await h.page.findRect('[data-psa-detail-note]')
      assert(editedRect, 'detail requirement textarea missing')
      await h.page.clickAt(editedRect.x, editedRect.y)
      await h.page.evaluate(`(() => { const input = document.querySelector('[data-psa-detail-note]'); if (input !== null) input.select(); return true })()`)
      await h.page.insertText('Req one edited')
      await sleep(150)
      await h.click('[data-psa-detail-save]')
      await sleep(450)
      const afterEdit = await h.page.eval(probes.detailState)
      assert(afterEdit && afterEdit.requirement === 'Req one edited', `the edited requirement did not reach the detail card: ${JSON.stringify(afterEdit && afterEdit.requirement)}`)
      const storedAfterEdit = await h.page.eval(probes.annotationStorage)
      const editedRecord = storedAfterEdit.records.find((record) => record.id === recordA.id)
      assert(editedRecord && editedRecord.note === 'Req one edited', 'the edited requirement was not persisted')
      assert(typeof editedRecord.updatedAt === 'number' && editedRecord.updatedAt >= recordA.updatedAt, 'the edit did not bump updatedAt')

      // Delete from the detail card: mark disappears, 5 s undo toast restores it.
      await h.click('[data-psa-detail-delete]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 1`, { timeout: 5000, label: 'mark removal after delete' })
      const toast = await h.page.eval(probes.undoToast)
      assertEqual(toast.present, true, 'no undo toast after the delete')
      assertEqual(toast.role, 'status', 'the undo toast is not a status region')
      assertEqual(toast.live, 'polite', 'the undo toast is not polite')
      assert(/deleted|已删除/.test(toast.text || ''), `unexpected undo toast text: ${toast.text}`)
      assert(toast.undo, 'the undo toast has no Undo button')
      await h.click('[data-psa-undo]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 2`, { timeout: 5000, label: 'mark restore after undo' })
      await sleep(250)
      assertEqual((await h.page.eval(probes.undoToast)).present, false, 'the undo toast did not disappear after undo')

      // Other-Session records are never drawn on the page (survives a reload).
      // A3/T29: exiting would clear the records, and the unload flush would overwrite
      // a direct localStorage seed — seed from an init script before the next boot.
      const otherRecordId = 'psa-other-seed-1'
      await h.page.addInitScript(`(() => {
        try {
          if (localStorage.getItem('psa-other-seed') !== 'pending') return
          const key = 'power-suite.ui-annotation.annotations'
          const doc = JSON.parse(localStorage.getItem(key) || 'null')
          const base = doc !== null && Array.isArray(doc.records) && doc.records.length > 0 ? doc.records[0] : null
          if (base === null) return
          const clone = JSON.parse(JSON.stringify(base))
          clone.id = ${JSON.stringify(otherRecordId)}
          clone.order = 999
          clone.session = { sessionId: ${JSON.stringify(SESSION_ID_OTHER)}, cwd: '/tmp/other-session', workspaceLabel: 'other-session' }
          doc.records.push(clone)
          doc.updatedAt = Date.now()
          localStorage.setItem(key, JSON.stringify(doc))
          localStorage.setItem('psa-other-seed', 'done')
        } catch {}
      })()`)
      await h.page.evaluate(`localStorage.setItem('psa-other-seed', 'pending')`)
      const appended = { id: otherRecordId }
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after the marks reload' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the marks reload' })
      await sleep(700)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      await h.ensureActivatedStable()
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 2`, { timeout: 8000, label: 'marks after reload' })
      await sleep(300)
      const restoredMarks = await h.page.eval(probes.marksState)
      assertEqual(restoredMarks.length, 2, `other-Session records must not be drawn (got ${restoredMarks.length} marks)`)
      assert(!restoredMarks.some((mark) => mark.id === appended.id), 'the other-Session record was drawn as a page mark')
      await h.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      await sleep(200)
      const markAnimation = await h.page.evaluate(`(() => { const mark = document.querySelector('[data-psa-mark]'); return mark === null ? null : getComputedStyle(mark).animationName })()`)
      await h.page.send('Emulation.setEmulatedMedia', { features: [] })
      assertEqual(markAnimation, 'none', 'reduced motion still animates the page marks')
      await h.openCollection()
      const rows = await h.page.eval(probes.entries)
      assertEqual(rows.length, 3, `the collection should hold 3 records with one other-Session entry (got ${rows.length})`)
      assertEqual(rows.filter((entry) => entry.scope === 'other').length, 1, 'the other-Session scope badge is missing')
      // 5. Floating tooltip-like surfaces must use the native DSH session-row hover
      // CARD recipe in BOTH themes (fixed #2C2C2E + --dsw-shadow-lv3) — computed-style
      // assertion (task-13 correction).
      const tooltipRecipe = await checkAnnotationHovercardRecipe(h)
      // A3/T23: marked popover layout: trash lives in the Requirement caption row,
      // the footer keeps two buttons on one row, and delete still deletes + undoes.
      const popoverTarget = await h.page.eval(pageProbe.newSessionButton)
      assert(popoverTarget, 'native New Session button not found for the popover layout check')
      await h.page.moveTo(popoverTarget.x, popoverTarget.y)
      await sleep(150)
      await h.page.clickAt(popoverTarget.x, popoverTarget.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the layout check' })
      await sleep(250)
      const markedLayout = await h.page.eval(probes.popoverLayout)
      await recordPopoverLayout('marked', markedLayout)
      if (!popoverOldLayout) assertPopoverLayout(markedLayout, true)
      if (process.env.PSA_POPOVER_EVIDENCE_DIR && markedLayout !== null) {
        const clipOf = (layout) => ({
          x: layout.popover.left - 10,
          y: layout.popover.top - 10,
          width: layout.popover.width + 20,
          height: layout.popover.height + 20
        })
        const originalDark = await h.page.evaluate(`document.body.getAttribute('data-ds-dark-theme')`)
        await h.page.evaluate(`document.body.removeAttribute('data-ds-dark-theme')`)
        await sleep(650)
        const lightLayout = await h.page.eval(probes.popoverLayout)
        await recordPopoverLayout('marked-light', lightLayout)
        if (lightLayout !== null) await capturePopoverClip('popover-marked-light.png', clipOf(lightLayout))
        await h.page.evaluate(`document.body.setAttribute('data-ds-dark-theme', 'true')`)
        await sleep(650)
        const darkLayout = await h.page.eval(probes.popoverLayout)
        await recordPopoverLayout('marked-dark', darkLayout)
        if (darkLayout !== null) await capturePopoverClip('popover-marked-dark.png', clipOf(darkLayout))
        if (originalDark === null) {
          await h.page.evaluate(`document.body.removeAttribute('data-ds-dark-theme')`)
        } else {
          await h.page.evaluate(`document.body.setAttribute('data-ds-dark-theme', ${JSON.stringify(originalDark)})`)
        }
        await sleep(400)
      }
      assertEqual(await h.page.evaluate(`document.querySelectorAll('[data-psa-mark]').length`), 2,
        'the popover layout check needs both page marks')
      await h.click('[data-psa-popover-delete]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 1`, { timeout: 5000, label: 'mark removal after popover delete' })
      const popoverDeleteToast = await h.page.eval(probes.undoToast)
      assertEqual(popoverDeleteToast.present, true, 'no undo toast after the popover delete')
      assertEqual(popoverDeleteToast.role, 'status', 'the popover-delete toast is not a status region')
      assert(/deleted|已删除/.test(popoverDeleteToast.text || ''), `unexpected popover-delete toast text: ${popoverDeleteToast.text}`)
      await h.click('[data-psa-undo]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 2`, { timeout: 5000, label: 'mark restore after popover undo' })
      await sleep(200)
      await h.clearSelection()
      // ---- A3/T32: multi-strategy anchors (XPath / text quote fallback + copy actions) ----
      const anchorPhrase = 'Anchor phrase UNIQUE-T32-' + Math.round(Date.now() % 100000)
      await h.page.evaluate(`(() => {
        document.getElementById('psa-anchor-fixture')?.remove()
        const wrap = document.createElement('div')
        wrap.id = 'psa-anchor-fixture'
        Object.assign(wrap.style, { position: 'fixed', left: '360px', top: '300px', width: '360px', padding: '10px', zIndex: '400', background: 'rgb(44, 46, 52)', color: 'rgb(235, 238, 245)', borderRadius: '8px', fontSize: '13px' })
        const section = document.createElement('section')
        section.id = 'psa-anchor-section'
        const paragraph = document.createElement('p')
        paragraph.style.margin = '0'
        const leaf = document.createElement('span')
        leaf.setAttribute('data-anchor-leaf', '')
        leaf.textContent = ${JSON.stringify(anchorPhrase)}
        paragraph.append(leaf)
        section.append(paragraph)
        wrap.append(section)
        document.body.append(wrap)
        return true
      })()`)
      const anchorLeafRect = await h.page.findRect('[data-anchor-leaf]')
      assert(anchorLeafRect, 'anchor fixture leaf missing')
      await h.page.moveTo(anchorLeafRect.x, anchorLeafRect.y)
      await sleep(150)
      await h.page.clickAt(anchorLeafRect.x, anchorLeafRect.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the anchor fixture' })
      await sleep(250)
      const readAnchorPopover = () => h.page.evaluate(`(() => {
        const popover = document.querySelector('[data-psa-popover]')
        if (popover === null) return null
        const locator = popover.querySelector('[data-psa-popover-ref] .psa-truncate')?.textContent ?? ''
        const via = popover.querySelector('[data-psa-via]')?.getAttribute('data-psa-via') ?? null
        return { status: popover.querySelector('[data-psa-popover-status]')?.getAttribute('data-psa-status') ?? null, via, locator: locator.trim() }
      })()`)
      const anchorBefore = await readAnchorPopover()
      assertEqual(anchorBefore.status, 'resolved', `anchor fixture did not start Resolved: ${JSON.stringify(anchorBefore)}`)
      assertEqual(anchorBefore.via, 'css', `initial resolution should be via CSS: ${JSON.stringify(anchorBefore)}`)
      // Copy XPath / Copy JS path actions.
      await h.click('[data-psa-popover-copy-xpath]')
      await sleep(300)
      let copyToast = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
      assert(/XPath copied|已复制 XPath/.test(copyToast), `copy XPath toast missing: ${short(copyToast)}`)
      await h.click('[data-psa-popover-copy-js-path]')
      await sleep(300)
      copyToast = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
      assert(/JS path copied|已复制 JS 路径/.test(copyToast), `copy JS path toast missing: ${short(copyToast)}`)
      // Commit the annotation so the captured anchors are persisted, then re-select
      // the leaf for the fallback-resolution assertions.
      await h.click('[data-psa-add]')
      await sleep(450)
      const anchorRecords = (await h.page.eval(probes.annotationStorage)).records.filter((record) => String(record.textQuote?.exact ?? '').includes('UNIQUE-T32'))
      assert(anchorRecords.length >= 1, 'captured record does not carry the text quote anchor')
      assert(typeof anchorRecords[0].xpath === 'string' && anchorRecords[0].xpath.length > 0, 'captured record has no XPath')
      assert(typeof anchorRecords[0].jsPath === 'string' && anchorRecords[0].jsPath.length > 0, 'captured record has no JS path')
      const reselectRect = await h.page.findRect('[data-anchor-leaf]')
      assert(reselectRect, 'anchor leaf missing for re-selection')
      await h.page.moveTo(reselectRect.x, reselectRect.y)
      await sleep(150)
      await h.page.clickAt(reselectRect.x, reselectRect.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'anchor popover after commit re-select' })
      await sleep(250)
      // Break the structural/CSS path (and absolute XPath) by reparenting + inserting a
      // sibling section; the unique text quote must keep the target Resolved.
      await h.page.evaluate(`(() => {
        const wrap = document.getElementById('psa-anchor-fixture')
        const section = document.getElementById('psa-anchor-section')
        const holder = document.createElement('div')
        const extra = document.createElement('section')
        extra.textContent = 'unrelated sibling'
        holder.append(extra)
        const paragraph = section.querySelector('p')
        section.removeChild(paragraph)
        holder.append(paragraph)
        wrap.replaceChildren(holder)
        return true
      })()`)
      const anchorNote = await h.page.findRect('[data-psa-note]')
      assert(anchorNote, 'anchor popover note missing')
      await h.page.clickAt(anchorNote.x, anchorNote.y)
      await sleep(350)
      const anchorFallback = await readAnchorPopover()
      assertEqual(anchorFallback.status, 'resolved', `A3/T32: text-quote fallback did not resolve after the path broke: ${JSON.stringify(anchorFallback)}`)
      assert(anchorFallback.via !== 'css', `A3/T32: fallback did not report a non-css via hint: ${JSON.stringify(anchorFallback)}`)
      assertEqual(anchorFallback.locator, anchorBefore.locator, 'A3/T32: locator display changed on fallback resolution')
      if (process.env.PSA_ANCHOR_EVIDENCE_DIR) {
        await mkdir(process.env.PSA_ANCHOR_EVIDENCE_DIR, { recursive: true })
        const clip = { x: 300, y: 220, width: 620, height: 300, scale: 1 }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(process.env.PSA_ANCHOR_EVIDENCE_DIR, 'fallback-anchor-resolved.png'), Buffer.from(data.data, 'base64'))
      }
      // P2: copy parity from the rail row and the detail card (live-first anchors).
      await h.click('[data-psa-popover-close]')
      await sleep(250)
      await h.openCollection()
      await sleep(300)
      const copyFromRail = await h.page.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-psa-entry]')].find((entry) => entry.innerText.includes('Anchor phrase UNIQUE-T32'))
        if (!row) return null
        row.querySelector('[data-psa-entry-copy-xpath]')?.click()
        return !!row.querySelector('[data-psa-entry-copy-js-path]')
      })()`)
      assert(copyFromRail, 'A3/T34: rail row copy XPath/JS path actions missing')
      await sleep(250)
      let anchorCopyToast = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
      assert(/XPath copied|已复制 XPath|saved XPath/.test(anchorCopyToast), `A3/T34: rail copy XPath toast missing: ${short(anchorCopyToast)}`)
      await h.page.evaluate(`(() => { const row = [...document.querySelectorAll('[data-psa-entry]')].find((entry) => entry.innerText.includes('Anchor phrase UNIQUE-T32')); row?.querySelector('[data-psa-entry-copy-js-path]')?.click(); return true })()`)
      await sleep(250)
      anchorCopyToast = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
      assert(/JS path copied|已复制 JS 路径|saved JS path/.test(anchorCopyToast), `A3/T34: rail copy JS path toast missing: ${short(anchorCopyToast)}`)
      await h.page.evaluate(`(() => { const row = [...document.querySelectorAll('[data-psa-entry]')].find((entry) => entry.innerText.includes('Anchor phrase UNIQUE-T32')); row?.querySelector('[data-psa-entry-preview]')?.click(); return true })()`)
      await h.page.waitFor(`!!document.querySelector('[data-psa-detail]')`, { timeout: 8000, label: 'anchor detail card for copy parity' })
      await sleep(250)
      for (const [selector, pattern] of [
        ['[data-psa-detail-copy-xpath]', /XPath copied|已复制 XPath|saved XPath/],
        ['[data-psa-detail-copy-full-xpath]', /Full XPath copied|已复制完整 XPath/],
        ['[data-psa-detail-copy-js-path]', /JS path copied|已复制 JS 路径|saved JS path/]
      ]) {
        await h.click(selector)
        await sleep(300)
        const toast = await h.page.evaluate(`document.querySelector('[data-psa-feedback]')?.innerText ?? ''`)
        assert(pattern.test(toast), `A3/T34: detail copy toast for ${selector} missing: ${short(toast)}`)
      }
      await h.click('[data-psa-detail-close]')
      await sleep(200)
      await h.clickBack()
      await sleep(200)
      // Content change is honest (small edit → Changed, not Missing): the captured
      // locator display does not change.
      await h.page.evaluate(`(() => { const leaf = document.querySelector('[data-anchor-leaf]'); if (leaf !== null) leaf.textContent = 'Anchor phrase UNIQXE-T32 edit'; return true })()`)
      await h.page.pressKey('escape')
      await sleep(250)
      await h.openCollection()
      await sleep(350)
      const anchorEntries = await h.entries()
      const anchorEntry = anchorEntries.find((entry) => String(entry.name).includes('Anchor phrase UNIQUE-T32'))
      assert(anchorEntry, `the anchor record is missing from the collection: ${JSON.stringify(anchorEntries.map((entry) => entry.name))}`)
      assert(anchorEntry.status !== 'resolved', `A3/T32: the captured record stayed Resolved after its content changed: ${JSON.stringify(anchorEntry)}`)
      assert(String(anchorEntry.locator).includes(anchorBefore.locator), `A3/T32: locator display changed after the content changed (${short(anchorEntry.locator)})`)
      await h.clickBack()
      await sleep(150)
      const anchorChanged = { status: anchorEntry.status, locator: anchorEntry.locator }
      assert(anchorChanged.status !== 'resolved', `A3/T32: changed content must not stay Resolved: ${JSON.stringify(anchorChanged)}`)
      // ---- A3/T33: duplicate labels resolve via a unique lower-tier candidate ----
      await h.page.evaluate(`(() => {
        document.getElementById('psa-duplicate-fixture')?.remove()
        const fixture = document.createElement('div')
        fixture.id = 'psa-duplicate-fixture'
        fixture.style.cssText = 'position:fixed;left:360px;top:340px;width:360px;padding:10px;z-index:400;background:rgb(44,46,52);color:rgb(235,238,245);border-radius:8px'
        const makeRow = (tag) => {
          const row = document.createElement('div')
          row.className = 'row ' + tag
          const button = document.createElement('button')
          button.setAttribute('aria-label', 'New session')
          button.textContent = 'New session'
          button.style.cssText = 'width:150px;height:28px;display:block'
          row.append(button)
          return row
        }
        const first = makeRow('first')
        const second = makeRow('second')
        fixture.append(first, second)
        document.body.append(fixture)
        return true
      })()`)
      const duplicateButtons = await h.page.evaluate(`[...document.querySelectorAll('#psa-duplicate-fixture button')].map((button) => { const rect = button.getBoundingClientRect(); return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } })`)
      assertEqual(duplicateButtons.length, 2, 'duplicate-label fixture buttons missing')
      await h.page.moveTo(duplicateButtons[0].x, duplicateButtons[0].y)
      await sleep(150)
      await h.page.clickAt(duplicateButtons[0].x, duplicateButtons[0].y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the duplicate-label button' })
      await sleep(300)
      const duplicateStatus = await h.page.evaluate(`(() => {
        const popover = document.querySelector('[data-psa-popover]')
        if (popover === null) return null
        return {
          status: popover.querySelector('[data-psa-popover-status]')?.getAttribute('data-psa-status') ?? null,
          via: popover.querySelector('[data-psa-via]')?.getAttribute('data-psa-via') ?? null,
          locator: popover.querySelector('[data-psa-popover-ref] .psa-truncate')?.textContent?.trim() ?? ''
        }
      })()`)
      assert(duplicateStatus !== null, 'duplicate-label popover missing')
      assertEqual(duplicateStatus.status, 'resolved', `A3/T33: duplicate-label target must resolve via a unique candidate, not be Ambiguous: ${JSON.stringify(duplicateStatus)}`)
      assertEqual(duplicateStatus.via, 'css', `A3/T33: duplicate-label resolution should stay on CSS candidates: ${JSON.stringify(duplicateStatus)}`)
      // Measure candidate hit counts from the persisted record: the high-tier
      // aria-label candidate matches both buttons, the structural candidate matches one.
      await h.click('[data-psa-add]')
      await sleep(450)
      const candidateHits = await h.page.evaluate(`(() => {
        const record = JSON.parse(localStorage.getItem('power-suite.ui-annotation.annotations') || '{}')
        for (const item of record.records ?? []) {
          const candidates = item.locator?.candidates ?? []
          if (!candidates.some((candidate) => candidate.kind === 'label')) continue
          const measured = candidates.map((candidate) => ({ kind: candidate.kind, value: candidate.value, hits: document.querySelectorAll(candidate.value).length }))
          if (measured.some((candidate) => candidate.hits > 1) && measured.some((candidate) => candidate.hits === 1)) return measured
        }
        return null
      })()`)
      assert(candidateHits !== null, 'candidate hit measurement failed')
      const nonUniqueCandidate = candidateHits.find((candidate) => candidate.hits > 1)
      const uniqueCandidate = candidateHits.find((candidate) => candidate.hits === 1)
      assert(nonUniqueCandidate, `A3/T33: expected a non-unique high-tier candidate: ${JSON.stringify(candidateHits)}`)
      assert(uniqueCandidate, `A3/T33: expected a unique lower-tier candidate: ${JSON.stringify(candidateHits)}`)
      await h.page.pressKey('escape')
      await sleep(250)
      await h.page.evaluate(`document.getElementById('psa-duplicate-fixture')?.remove()`)
      await h.ensureStatusPanel()
      await h.exit()
      return `2 marks (#index + requirement excerpt), popover trash in the Requirement caption row + two-button one-row footer (gap ${markedLayout && markedLayout.gap}px), popover delete -> undo toast -> restored, hover detail card (requirement/session/workspace/position/actions, keep-open, no focus steal), edit saved (updatedAt bumped), delete -> role=status undo toast -> restored, other-Session record not drawn after reload, reduced-motion static, native hover-card recipe matched in light+dark (bg ${tooltipRecipe.light.native.backgroundColor} / ${tooltipRecipe.dark.native.backgroundColor}, fixed #2C2C2E)`
    },

    13: async () => {
      await h.ensureModeOff()
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(300)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      await h.page.eval(probes.clearAnnotationStorage)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready before the chip scenario' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the clean reload' })
      await sleep(600)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const cleanBlank = await h.blankState()
      if (cleanBlank.ok !== true) {
        const fresh = await h.createBlankSessionViaHover()
        assert(fresh && typeof fresh.sessionId === 'string', 'could not create a blank session for the chip scenario')
        await sleep(500)
        await h.ensureSidebarExpanded()
      }
      const sessionId = await h.refreshSession()
      h.track(sessionId, 's13-session')
      await h.assertBlankForInput('scenario 13 chip insertion')
      await h.ensureActivatedStable()
      await h.ensureStatusPanel()
      await h.clearSelection()

      /**
       * Select one element and type its requirement (popover left open).
       * @param {{ x: number, y: number }} point - element centre.
       * @param {string} note - requirement text.
       * @returns {Promise<void>}
       */
      const selectAndType = async (point, note) => {
        await h.page.moveTo(point.x, point.y)
        await sleep(140)
        await h.page.clickAt(point.x, point.y)
        await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: `popover before "${note}"` })
        const noteRect = await h.page.findRect('[data-psa-note]')
        assert(noteRect, 'popover requirement textarea missing')
        await h.page.clickAt(noteRect.x, noteRect.y)
        await sleep(120)
        await h.page.insertText(note)
        await sleep(200)
      }

      // Record 1: normal requirement commit.
      const targetA = await h.page.eval(pageProbe.newSessionButton)
      assert(targetA, 'native New session button not found for the chip scenario')
      await selectAndType(targetA, 'Chip requirement one')
      const unmarkedActions = await h.page.evaluate(`({
        add: document.querySelector('[data-psa-add]')?.innerText ?? '',
        hasDelete: document.querySelector('[data-psa-popover-delete]') !== null
      })`)
      assert(/Mark requirement|标记需求/.test(unmarkedActions.add),
        `A3/T22: an unmarked selection must offer Mark requirement, got "${unmarkedActions.add}"`)
      assertEqual(unmarkedActions.hasDelete, false,
        'A3/T22: an unmarked selection must not show a delete button (nothing to delete yet)')
      await h.click('[data-psa-add]')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 1`, { timeout: 6000, label: 'first page mark for the chip scenario' })

      // Record 2: Quick reference — commits the annotation AND inserts the native chip.
      const composerRegion = await h.page.findRect('[data-conversation-region="composer"]')
      assert(composerRegion, 'composer region not found for the chip scenario')
      await selectAndType(composerRegion, 'Chip requirement two')
      await h.click('[data-psa-quick-ref]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length >= 1`,
        { timeout: 8000, label: 'single reference chip after Quick reference' }
      )
      await sleep(350)
      const afterQuickRef = await h.ui()
      assertEqual(afterQuickRef.popover, false, 'the quick reference did not auto-dismiss the popover')
      assertEqual(afterQuickRef.selection + afterQuickRef.multi, 0, 'the quick reference did not clear the selection')
      assertEqual((await h.page.eval(probes.marksState)).length, 2, 'the quick reference did not keep/refresh both page marks')
      const singleChip = await h.page.eval(probes.chipState)
      assertEqual(singleChip.chips.length, 1, 'the quick reference must insert exactly one native chip (occurrence=1)')
      const singleChipText = String(singleChip.chips[0].text || '')
      assert(singleChipText.includes('@'), `the single chip lost its @ glyph: ${short(singleChipText)}`)
      assert(singleChipText.replace(/^@/, '').trim().length > 0, `the single chip label is empty: ${short(singleChipText)}`)
      assert(!/UI annotation ·|Reference:|Note:|Status:/.test(singleChip.text || ''), `the draft still contains the plain 4-line block: ${short(singleChip.text, 260)}`)
      const transcriptBefore = await h.transcript()
      assertEqual(transcriptBefore.messages, 0, 'the chip insertion sent a message')

      // A3/T21: hovering the annotation chip shows the custom detail preview.
      const singleChipCenter = { x: singleChip.chips[0].x, y: singleChip.chips[0].y }
      await h.page.moveTo(singleChipCenter.x, singleChipCenter.y)
      try {
        await h.page.waitFor(`!!document.querySelector('[data-psa-chip-preview]')`, { timeout: 4000, label: 'chip hover preview' })
      } catch (error) {
        const debug = await h.page.evaluate(`(() => {
          const chips = [...document.querySelectorAll('[data-composer-chip="ui-annotation"]')]
          const chip = chips[0] || null
          const rect = chip === null ? null : chip.getBoundingClientRect()
          const hit = chip === null ? null : document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return {
            chips: chips.length,
            rect,
            hitTag: hit === null ? null : hit.tagName,
            hitInChip: hit !== null && hit.closest !== undefined && hit.closest('[data-composer-chip]') !== null,
            hitInEditor: hit !== null && hit.closest !== undefined && hit.closest('[data-conversation-region="composer"] [data-lexical-editor="true"]') !== null,
            preview: !!document.querySelector('[data-psa-chip-preview]'),
            hooks: !!window.__POWER_SUITE_TEST_HOOKS__,
            events: window.__psaChipHoverEvents ?? null,
            storePreview: window.__POWER_SUITE_TEST_HOOKS__?.annotationController?.store?.getSnapshot?.().chipPreview ?? null,
            overlays: document.querySelectorAll('[data-psa-layer]').length,
            previewMarkers: document.querySelectorAll('.psa-chip-preview').length
          }
        })()`)
        throw new Error(`${error.message} | debug=${JSON.stringify(debug)}`)
      }
      await sleep(150)
      const chipPreview = await h.page.eval(probes.chipPreview)
      assert(chipPreview !== null, 'the chip hover preview did not render')
      assertEqual(chipPreview.role, 'tooltip', 'the chip hover preview is not a tooltip')
      assertEqual(chipPreview.pointerEvents, 'none', 'the chip hover preview must not intercept the pointer')
      assert(/Chip requirement two/.test(chipPreview.text), `the chip preview is missing the requirement text: ${short(chipPreview.text)}`)
      assert(/Locator|Reference|定位/.test(chipPreview.text), `the chip preview is missing the locator label: ${short(chipPreview.text)}`)
      assert(/\d+, \d+ · \d+×\d+/.test(chipPreview.text), `the chip preview is missing the position box: ${short(chipPreview.text)}`)
      assert(/Session|会话/.test(chipPreview.text) && /Workspace|工作区/.test(chipPreview.text), `the chip preview is missing session/workspace: ${short(chipPreview.text)}`)
      assert(/Resolved|已解析/.test(chipPreview.text), `the chip preview is missing the live status: ${short(chipPreview.text)}`)
      if (process.env.PSA_CHIP_EVIDENCE_DIR) {
        await mkdir(process.env.PSA_CHIP_EVIDENCE_DIR, { recursive: true })
        const pad = 14
        const left = Math.max(0, Math.min(singleChipCenter.x, chipPreview.rect.x) - pad)
        const top = Math.max(0, Math.min(singleChipCenter.y, chipPreview.rect.y) - pad)
        const right = Math.min(VIEWPORT.width, Math.max(singleChipCenter.x, chipPreview.rect.x + chipPreview.rect.width) + pad)
        const bottom = Math.min(VIEWPORT.height, Math.max(singleChipCenter.y, chipPreview.rect.y + chipPreview.rect.height) + pad)
        const data = await h.page.send('Page.captureScreenshot', {
          format: 'png',
          clip: { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), scale: 1 }
        })
        await writeFile(path.join(process.env.PSA_CHIP_EVIDENCE_DIR, 'chip-hover-preview-single.png'), Buffer.from(data.data, 'base64'))
      }
      assert(chipPreview.rect.x >= 0 && chipPreview.rect.y >= 0, `chip preview overflows the viewport: ${JSON.stringify(chipPreview.rect)}`)
      assert(chipPreview.rect.x + chipPreview.rect.width <= chipPreview.rect.viewport.width + 1
        && chipPreview.rect.y + chipPreview.rect.height <= chipPreview.rect.viewport.height + 1,
        `chip preview overflows the viewport: ${JSON.stringify(chipPreview.rect)}`)
      // Leaves the chip → hidden; Esc → hidden; scroll → hidden.
      await h.page.moveTo(700, 160)
      await sleep(250)
      assertEqual(await h.page.eval(probes.chipPreview), null, 'the chip hover preview did not hide on pointer leave')
      await h.page.moveTo(singleChipCenter.x, singleChipCenter.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-chip-preview]')`, { timeout: 4000, label: 'chip hover preview again' })
      await h.page.pressKey('escape')
      await sleep(200)
      assertEqual(await h.page.eval(probes.chipPreview), null, 'Esc did not hide the chip hover preview')
      assertEqual(await h.page.evaluate(`document.documentElement.getAttribute('data-psa-active')`), 'true',
        'Esc on the chip hover preview must not also leave the annotation mode')
      await h.page.moveTo(singleChipCenter.x, singleChipCenter.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-chip-preview]')`, { timeout: 4000, label: 'chip hover preview before scroll' })
      await h.page.wheel(700, 400, 320)
      await sleep(250)
      // Unrelated inner scroll containers (chat auto-scroll) must NOT flicker the
      // preview away; a document/window scroll (the chip moves with content) does.
      assert(await h.page.eval(probes.chipPreview) !== null,
        'an unrelated inner scroll container hid the chip hover preview')
      await h.page.evaluate(`document.dispatchEvent(new Event('scroll'))`)
      await sleep(250)
      assertEqual(await h.page.eval(probes.chipPreview), null, 'a document scroll did not hide the chip hover preview')

      // Chip click (through the pass-through modifier) opens the record's detail card.
      await h.page.keyDown('alt')
      try {
        await h.page.clickAt(singleChip.chips[0].x, singleChip.chips[0].y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await h.page.waitFor(`!!document.querySelector('[data-psa-detail]')`, { timeout: 5000, label: 'detail card after chip click' })
      const chipDetail = await h.page.eval(probes.detailState)
      assert(chipDetail !== null, 'the chip click did not open the detail card')
      assertEqual(chipDetail.requirement, 'Chip requirement two', 'the chip click opened the wrong record detail card')
      await h.page.pressKey('escape')
      await sleep(250)

      // A3/T22: add a SECOND annotation chip so the × can be proven to remove exactly
      // one chip and leave the other one a real chip.
      await h.page.moveTo(targetA.x, targetA.y)
      await sleep(150)
      await h.page.clickAt(targetA.x, targetA.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover before the second chip' })
      const markedActions = await h.page.evaluate(`({
        add: document.querySelector('[data-psa-add]')?.innerText ?? '',
        hasDelete: document.querySelector('[data-psa-popover-delete]') !== null
      })`)
      assert(/Update requirement|更新需求/.test(markedActions.add),
        `A3/T22: an already-marked selection must offer Update requirement, got "${markedActions.add}"`)
      assertEqual(markedActions.hasDelete, true,
        'A3/T22: an already-marked selection must show the delete (trash) button')
      await h.click('[data-psa-quick-ref]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === 2`,
        { timeout: 8000, label: 'two reference chips' }
      )
      await sleep(350)
      const twoChips = await h.page.eval(probes.chipState)
      assertEqual(twoChips.chips.length, 2, 'the second quick reference did not insert a second chip')
      const keptChipText = String(twoChips.chips[0].text || '')
      const removedChipText = String(twoChips.chips[1].text || '')
      const transcriptBeforeChipRemove = await h.transcript()
      // Hover the second chip: the × affordance appears over it.
      await h.page.moveTo(twoChips.chips[1].x, twoChips.chips[1].y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-chip-delete]')`, { timeout: 4000, label: 'chip remove affordance' })
      await sleep(120)
      const chipDelete = await h.page.eval(probes.chipDelete)
      assert(chipDelete !== null, 'the chip × affordance did not render')
      assertEqual(chipDelete.ariaLabel, 'Remove reference', 'the chip × affordance has the wrong accessible name')
      assertEqual(chipDelete.pointerEvents, 'auto', 'the chip × affordance must receive pointer input')
      assert(chipDelete.rect.width >= 12 && chipDelete.rect.height >= 12, `the chip × box is too small: ${JSON.stringify(chipDelete.rect)}`)
      await h.click('[data-psa-chip-delete]')
      try {
        await h.page.waitFor(
          `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === 1`,
          { timeout: 5000, label: 'exactly one chip after × removal' }
        )
      } catch (error) {
        const debug = await h.page.evaluate(`(() => ({
          remove: window.__psaChipRemoveDebug ?? null,
          chips: [...document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]')].map((node) => node.outerHTML.slice(0, 160)),
          feedback: document.querySelector('[data-psa-feedback]')?.innerText ?? null,
          popover: !!document.querySelector('[data-psa-popover]'),
          action: !!document.querySelector('[data-psa-chip-delete]')
        }))()`)
        throw new Error(`${error.message} | debug=${JSON.stringify(debug)}`)
      }
      await sleep(300)
      const afterChipDelete = await h.page.eval(probes.chipState)
      assertEqual(afterChipDelete.chips.length, 1, 'the × did not remove exactly one chip')
      assertEqual(String(afterChipDelete.chips[0].text || ''), keptChipText, 'the × removed the wrong chip (the kept chip changed)')
      assert(!String(afterChipDelete.text || '').includes(removedChipText.replace(/^@/, '')) || removedChipText === keptChipText,
        `the removed chip text still appears in the draft: ${short(afterChipDelete.text)}`)
      assertEqual((await h.transcript()).messages, transcriptBeforeChipRemove.messages,
        'chip removal sent a message')
      assertEqual(await h.page.eval(probes.chipDelete), null, 'the × affordance stayed visible after removal')
      // The editor mutation is one undo step (Lexical history): Ctrl+Z restores it.
      await h.page.evaluate(`(() => { const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]'); if (editor !== null) editor.focus(); return true })()`)
      await h.page.dispatchKey('z', 'KeyZ', 90, MOD.meta)
      await sleep(450)
      const afterUndo = await h.page.eval(probes.chipState)
      assertEqual(afterUndo.chips.length, 2, 'undo did not restore the chip removed by the × (not one undo step)')
      // Remove it again so the rest of the scenario keeps its expected chip count.
      await h.page.moveTo(afterUndo.chips[1].x, afterUndo.chips[1].y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-chip-delete]')`, { timeout: 4000, label: 'chip remove affordance after undo' })
      await sleep(120)
      if (process.env.PSA_CHIP_EVIDENCE_DIR) {
        await mkdir(process.env.PSA_CHIP_EVIDENCE_DIR, { recursive: true })
        const pad = 20
        const chipRect = twoChips.chips[1]
        const clip = {
          x: Math.max(0, Math.floor(chipRect.x - 90 - pad)),
          y: Math.max(0, Math.floor(chipRect.y - 30 - pad)),
          width: 320,
          height: 110,
          scale: 1
        }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(process.env.PSA_CHIP_EVIDENCE_DIR, 'chip-x-remove-hover.png'), Buffer.from(data.data, 'base64'))
      }
      await h.click('[data-psa-chip-delete]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === 1`,
        { timeout: 5000, label: 'one chip after the second × removal' }
      )
      await sleep(250)
      // Backspace removes the remaining chip atomically (one or two presses; never the draft text).
      const editorRect = await h.page.findRect('[data-conversation-region="composer"] [data-lexical-editor="true"]')
      assert(editorRect, 'composer editor not found for chip removal')
      await h.page.keyDown('alt')
      try {
        await h.page.clickAt(editorRect.left + editorRect.width - 8, editorRect.y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await sleep(200)
      await h.page.pressKey('end')
      await sleep(100)
      let removed = false
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await h.page.pressKey('backspace')
        await sleep(150)
        const state = await h.page.eval(probes.chipState)
        if (state.chips.length === 0) {
          removed = true
          break
        }
      }
      assert(removed, 'Backspace did not remove the native chip')
      await h.page.waitFor(`document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === 0`, { timeout: 4000, label: 'chip removed from the draft' })

      // Batch: select the current Session and insert ONE group chip.
      await h.openCollection()
      const rowsBefore = await h.page.eval(probes.entries)
      assertEqual(rowsBefore.length, 2, 'the chip scenario must have two collection records before the batch')
      // Records start included (Phase 1 semantics); select-all is then a no-op and
      // stays disabled. Assert the enabled state explicitly, then only click when it
      // actually has work to do.
      const selectAllDisabled = await h.page.evaluate(`document.querySelector('[data-psa-select-all]')?.disabled === true`)
      if (selectAllDisabled) {
        const includedCount = await h.page.evaluate(`document.querySelector('[data-psa-scope-counts]')?.getAttribute('data-psa-included-count') ?? null`)
        assertEqual(includedCount, '2', 'records are not selected for the batch')
      } else {
        await h.click('[data-psa-select-all]')
        await sleep(250)
        const includedCount = await h.page.evaluate(`document.querySelector('[data-psa-scope-counts]')?.getAttribute('data-psa-included-count') ?? null`)
        assertEqual(includedCount, '2', 'select-all did not include both current-Session records')
      }
      await h.click('[data-psa-insert-batch]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === 1`,
        { timeout: 8000, label: 'ONE batch group chip' }
      )
      await sleep(350)
      const batchChip = await h.page.eval(probes.chipState)
      assertEqual(batchChip.chips.length, 1, 'D2: the batch insert must produce exactly one group chip')
      assert(/UI annotations|UI 标注/.test(batchChip.chips[0].text || ''), `the group chip label is wrong: ${short(batchChip.chips[0].text)}`)
      assert(!/^(\d+)\. /m.test(batchChip.text || ''), 'the batch chip must not insert the plain numbered blocks')
      // A3/T21: hovering the grouped batch chip shows the counted preview.
      await h.page.moveTo(batchChip.chips[0].x, batchChip.chips[0].y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-chip-preview]')`, { timeout: 4000, label: 'group chip hover preview' })
      await sleep(150)
      const groupPreview = await h.page.eval(probes.chipPreview)
      assert(groupPreview !== null, 'the group chip hover preview did not render')
      assert(/(2).*(annotations|标注)|UI annotations × 2|UI 标注 × 2/.test(groupPreview.text),
        `the group chip preview is missing the count summary: ${short(groupPreview.text)}`)
      assert(groupPreview.listItems.length >= 1, `the group chip preview is missing the record list: ${short(groupPreview.text)}`)
      if (process.env.PSA_CHIP_EVIDENCE_DIR) {
        await mkdir(process.env.PSA_CHIP_EVIDENCE_DIR, { recursive: true })
        const pad = 14
        const chipPoint = { x: batchChip.chips[0].x, y: batchChip.chips[0].y }
        const left = Math.max(0, Math.min(chipPoint.x, groupPreview.rect.x) - pad)
        const top = Math.max(0, Math.min(chipPoint.y, groupPreview.rect.y) - pad)
        const right = Math.min(VIEWPORT.width, Math.max(chipPoint.x, groupPreview.rect.x + groupPreview.rect.width) + pad)
        const bottom = Math.min(VIEWPORT.height, Math.max(chipPoint.y, groupPreview.rect.y + groupPreview.rect.height) + pad)
        const data = await h.page.send('Page.captureScreenshot', {
          format: 'png',
          clip: { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), scale: 1 }
        })
        await writeFile(path.join(process.env.PSA_CHIP_EVIDENCE_DIR, 'chip-hover-preview-group.png'), Buffer.from(data.data, 'base64'))
      }
      await h.page.moveTo(700, 160)
      await sleep(250)
      assertEqual(await h.page.eval(probes.chipPreview), null, 'the group chip hover preview did not hide on pointer leave')
      await h.page.moveTo(batchChip.chips[0].x, batchChip.chips[0].y)
      await sleep(150)
      const afterBatch = await h.ui()
      assertEqual(afterBatch.panel, 'collection', 'the batch insert must keep the collection view (spec 4.4)')
      assertEqual((await h.transcript()).messages, 0, 'the batch chip insertion sent a message')
      // The group chip also opens the collection view on click (preview path).
      await h.page.keyDown('alt')
      try {
        await h.page.clickAt(batchChip.chips[0].x, batchChip.chips[0].y, { modifiers: MOD.alt })
      } finally {
        await h.page.keyUp('alt')
      }
      await sleep(300)
      assertEqual((await h.ui()).panel, 'collection', 'the group chip click did not keep/open the collection view')
      // A3/T22: the group chip's × removes the whole group chip in one step.
      await h.page.moveTo(batchChip.chips[0].x, batchChip.chips[0].y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-chip-delete]')`, { timeout: 4000, label: 'group chip remove affordance' })
      await sleep(120)
      await h.click('[data-psa-chip-delete]')
      await h.page.waitFor(
        `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length === 0`,
        { timeout: 5000, label: 'group chip removed by its ×' }
      )
      await sleep(250)
      assertEqual((await h.ui()).panel, 'collection', 'removing the group chip closed the collection view')
      assertEqual((await h.transcript()).messages, 0, 'removing the group chip sent a message')
      // A3/T22: a markdown list leaf inside a wrapper carrying the REAL chat stable
      // attributes captures a chat-node-anchored selector (not a chat-region nth path).
      const fixtureRect = await h.page.evaluate(`(() => {
        const wrapper = document.createElement('div')
        wrapper.id = 'psa-e2e-chat-fixture'
        wrapper.setAttribute('data-chat-flow', 'assistant')
        wrapper.setAttribute('data-chat-flow-key', 'flow-fixture')
        wrapper.setAttribute('data-chat-node-key', 'node-fixture')
        Object.assign(wrapper.style, {
          position: 'fixed', left: '360px', top: '300px', width: '320px',
          padding: '8px', background: 'rgb(54, 56, 60)', color: 'rgb(235, 238, 245)',
          zIndex: '400', borderRadius: '8px', fontSize: '13px'
        })
        const list = document.createElement('ul')
        list.style.margin = '0'
        list.style.paddingLeft = '18px'
        const item = document.createElement('li')
        item.setAttribute('role', 'listitem')
        item.textContent = 'Fixture markdown list item'
        list.append(item)
        wrapper.append(list)
        document.body.append(wrapper)
        const rect = item.getBoundingClientRect()
        return {
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2)
        }
      })()`)
      await h.page.clickAt(fixtureRect.centerX, fixtureRect.centerY)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the synthetic chat leaf' })
      const fixtureNoteRect = await h.page.findRect('[data-psa-note]')
      assert(fixtureNoteRect, 'the synthetic chat leaf popover has no requirement textarea')
      await h.page.clickAt(fixtureNoteRect.x, fixtureNoteRect.y)
      await sleep(120)
      await h.page.insertText('Chat anchor fixture')
      await sleep(200)
      await h.click('[data-psa-add]')
      await sleep(500)
      const chatFixtureRecord = (await h.page.eval(probes.annotationStorage)).records.find((record) => record.note === 'Chat anchor fixture')
      assert(chatFixtureRecord, 'the synthetic chat leaf was not persisted')
      assert(String(chatFixtureRecord.uniqueSelector || '').includes('data-chat-node-key="node-fixture"'),
        `the chat leaf locator did not anchor to the real chat node key: ${short(String(chatFixtureRecord.uniqueSelector))}`)
      await h.page.evaluate(`document.getElementById('psa-e2e-chat-fixture')?.remove()`)
      await sleep(300)

      // Cleanup: clear the draft, leave the rail on the collection view for the next
      // scenario's own reset, and exit the mode.
      await h.page.evaluate(`(() => { const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]'); if (editor !== null) editor.focus(); return true })()`)
      await h.page.dispatchKey('a', 'KeyA', 65, MOD.meta)
      await h.page.pressKey('backspace')
      await sleep(250)
      await h.exit()
      return `Quick reference -> 1 native chip "@${short(singleChipText.replace(/^@/, ''), 28)}" (occurrence=1, no plain 4-line block), chip click -> detail card, Backspace removed it, batch -> ONE group chip "${short(batchChip.chips[0].text, 28)}" (no numbered blocks), collection view kept, transcript 0, not sent`
    },

    14: async () => {
      await h.ensureModeOff()
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(300)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      await h.page.eval(probes.clearAnnotationStorage)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready before the persistence-marks scenario' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the clean reload' })
      await sleep(600)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const cleanBlank = await h.blankState()
      if (cleanBlank.ok !== true) {
        const fresh = await h.createBlankSessionViaHover()
        assert(fresh && typeof fresh.sessionId === 'string', 'could not create a blank session for the persistence-marks scenario')
        await sleep(500)
        await h.ensureSidebarExpanded()
      }
      const sessionId = await h.refreshSession()
      h.track(sessionId, 's14-session')
      const synthetic = await h.page.eval(probes.createSyntheticTarget)
      assert(synthetic && typeof synthetic.x === 'number', 'could not create the synthetic missing target')
      await h.ensureActivatedStable()
      await h.ensureStatusPanel()
      await h.clearSelection()

      /**
       * Select one page element, type its requirement, and commit it.
       * @param {{ x: number, y: number }} point - element centre.
       * @param {string} note - requirement text.
       * @returns {Promise<void>}
       */
      const annotateAt = async (point, note) => {
        await h.page.moveTo(point.x, point.y)
        await sleep(140)
        await h.page.clickAt(point.x, point.y)
        await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: `popover before "${note}"` })
        const noteRect = await h.page.findRect('[data-psa-note]')
        assert(noteRect, 'popover requirement textarea missing')
        await h.page.clickAt(noteRect.x, noteRect.y)
        await sleep(120)
        await h.page.insertText(note)
        await sleep(200)
        await h.click('[data-psa-add]')
        await sleep(350)
      }

      await annotateAt(synthetic, 'Synthetic removed requirement')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 1`, { timeout: 6000, label: 'synthetic page mark' })
      const syntheticMark = (await h.page.eval(probes.marksState))[0]
      assert(syntheticMark && syntheticMark.badge.includes('Synthetic'), `the synthetic mark badge is wrong: ${JSON.stringify(syntheticMark)}`)
      const persistentTarget = await h.page.eval(pageProbe.newSessionButton)
      assert(persistentTarget, 'native New session button not found for the persistence-marks scenario')
      await annotateAt(persistentTarget, 'Persistent requirement')
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 2`, { timeout: 6000, label: 'two page marks before reload' })
      const syntheticMarkId = syntheticMark.id
      const storedBefore = await h.page.eval(probes.annotationStorage)
      assertEqual(storedBefore.count, 2, 'two records must be persisted before the reload')
      const syntheticRecord = storedBefore.records.find((record) => record.note === 'Synthetic removed requirement')
      const persistentRecord = storedBefore.records.find((record) => record.note === 'Persistent requirement')
      assert(syntheticRecord && persistentRecord, 'the two records were not persisted individually')
      const persistentMarkId = (await h.page.eval(probes.marksState)).find((mark) => mark.id !== syntheticMarkId)?.id
      assert(typeof persistentMarkId === 'string', 'the persistent mark was not recorded')

      // Reload: the synthetic element disappears with the page, the real one stays.
      await h.exit()
      await h.page.eval(probes.removeSyntheticTarget)
      await h.page.reload()
      await h.page.waitForFn(pageProbe.appReady, [], { timeout: 60000, label: 'app ready after the persistence-marks reload' })
      await h.page.waitFor(`!!document.querySelector('[data-psa-launcher]')`, { timeout: 20000, label: 'launcher after the persistence-marks reload' })
      await sleep(700)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()
      const storedAfter = await h.page.eval(probes.annotationStorage)
      assertEqual(storedAfter.count, 2, 'the persisted records were not restored after the reload')
      await h.ensureSessionFor(syntheticRecord.session?.sessionId ?? sessionId)
      await h.ensureActivatedStable()
      await h.page.waitFor(`document.querySelectorAll('[data-psa-mark]').length === 1`, { timeout: 8000, label: 'only the live mark after reload' }).catch(async (error) => {
        // Diagnostics instead of a bare timeout: which records came back, which
        // ones are drawn, and which Session the page considers current.
        const diagnostics = {
          storage: await h.page.eval(probes.annotationStorage),
          marks: await h.page.eval(probes.marksState),
          sessionId: await h.refreshSession(),
          ui: await h.ui(),
        }
        throw new Error(`${error.message} | diagnostics=${short(JSON.stringify(diagnostics), 900)}`)
      })
      await sleep(300)
      const marksAfter = await h.page.eval(probes.marksState)
      assertEqual(marksAfter.length, 1, `the removed target must not be drawn (got ${marksAfter.length} marks)`)
      assertEqual(marksAfter[0].id, persistentMarkId, 'the surviving page mark belongs to the wrong record')
      assertEqual(marksAfter[0].badge.includes('Persistent'), true, 'the restored mark badge lost its requirement excerpt')
      // The rail reports the removed target as missing and the live one as resolved.
      await h.openCollection()
      const rows = await h.page.eval(probes.entries)
      assertEqual(rows.length, 2, 'both restored records must be listed in the rail')
      const missingRow = rows.find((entry) => entry.ref === syntheticRecord.id)
      const liveRow = rows.find((entry) => entry.ref === persistentRecord.id)
      assert(missingRow, 'the removed target is missing from the rail collection')
      assertEqual(missingRow.status, 'missing', `the removed target rail status is not missing (got ${missingRow.status})`)
      assert(liveRow, 'the live record is missing from the rail collection')
      assert(['resolved', 'changed'].includes(liveRow.status), `the live record rail status is wrong (got ${liveRow.status})`)
      await h.clickBack()
      await h.ensureStatusPanel()
      await h.exit()
      return `2 records -> reload -> storage restored (2), 1 page mark (removed target not drawn), rail statuses: missing / ${liveRow.status}`
    },

    15: async () => {
      await h.ensureModeOff()
      await h.page.setViewport(VIEWPORT.width, VIEWPORT.height)
      await sleep(350)
      await h.ensureSidebarExpanded()
      await h.ensureConversation()

      /** Wait for one rainbow ring state. @param {string} selector - input selector. @returns {Promise<object>} state. */
      const waitRing = async (selector) => {
        const deadline = Date.now() + 4000
        while (Date.now() < deadline) {
          const state = await h.page.eval(probes.rainbowFocusState, selector)
          const opacity = Number.parseFloat(String(state.ringOpacity ?? '0'))
          if (state.found === true && state.focused === true && Number.isFinite(opacity) && opacity >= 0.99) return state
          await sleep(80)
        }
        return h.page.eval(probes.rainbowFocusState, selector)
      }
      /**
       * Wait until an element's rect is stable across two reads (popovers reclamp
       * once their measured size arrives, which must not be mistaken for a focus
       * layout shift).
       * @param {string} selector - element selector.
       * @returns {Promise<object | null>} stable rect.
       */
      const stableRect = async (selector) => {
        let previous = null
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
          const rect = await h.page.findRect(selector)
          if (rect !== null && previous !== null && rect.x === previous.x && rect.y === previous.y) return rect
          previous = rect
          await sleep(150)
        }
        return previous
      }
      /** Convert one findRect centre result into a rect. @param {object} hit - findRect result. @returns {object} rect. */
      const rectOfHit = (hit) => ({ x: hit.left, y: hit.top, width: hit.width, height: hit.height })
      await h.ensureActivatedStable()
      const target = await h.page.eval(pageProbe.newSessionButton)
      assert(target, 'native New session button not found for the rainbow-focus scenario')
      await h.page.moveTo(target.x, target.y)
      await sleep(150)
      await h.page.clickAt(target.x, target.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-note]')`, { timeout: 8000, label: 'popover for the rainbow-focus scenario' })
      const noteRect = await stableRect('[data-psa-note]')
      assert(noteRect, 'popover note textarea missing for focus')
      const noteIdle = await h.page.eval(probes.rainbowFocusState, '[data-psa-note]')
      assertEqual(noteIdle.wrapper, true, 'B3: the popover textarea is not inside a .psa-rainbow-field wrapper')
      assertEqual(noteIdle.ringOpacity, '0', 'B3: the popover ring is visible before focus')
      await h.page.clickAt(noteRect.x, noteRect.y)
      const noteFocused = await waitRing('[data-psa-note]')
      assertEqual(noteFocused.focused, true, 'B3: the popover textarea did not take focus')
      assertEqual(noteFocused.outlineStyle, 'none', 'B3: the popover textarea still paints a solid focus outline')
      assertEqual(noteFocused.ringOpacity, '1', 'B3: the popover rainbow ring is not visible on focus')
      assert(String(noteFocused.ringAnimation).includes('psa-ring-spin'), `B3: the rainbow ring spin animation is missing (animation ${noteFocused.ringAnimation})`)
      assert(String(noteFocused.ringAnimation).includes('psa-ring-hue'), `B3: the shared-recipe hue drift animation is missing (animation ${noteFocused.ringAnimation})`)
      assertEqual(noteFocused.ringDuration, '3.2s, 14s', 'B3: ring animation durations do not match the shared plugin recipe')
      // A3/T21: the ring wrapper must hug the control's border box exactly (no
      // bottom baseline gap that would expose the textarea's own bottom border).
      const ringGeometry = await h.page.evaluate(`(() => {
        const input = document.querySelector('[data-psa-note]')
        if (input === null) return null
        const wrapper = input.closest('.psa-rainbow-field')
        if (wrapper === null) return null
        const a = input.getBoundingClientRect()
        const b = wrapper.getBoundingClientRect()
        const after = getComputedStyle(wrapper, '::after')
        return {
          input: { left: Math.round(a.left), top: Math.round(a.top), width: Math.round(a.width), height: Math.round(a.height) },
          wrapper: { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) },
          gaps: { top: Math.round(a.top - b.top), left: Math.round(a.left - b.left), right: Math.round(b.right - a.right), bottom: Math.round(b.bottom - a.bottom) },
          display: getComputedStyle(input).display,
          inset: after.inset,
        }
      })()`)
      assert(ringGeometry !== null, 'the rainbow wrapper geometry could not be measured')
      assertEqual(ringGeometry.display, 'block', 'A3/T21: the wrapped textarea is not display:block (baseline gap risk)')
      for (const [edge, gap] of Object.entries(ringGeometry.gaps)) {
        assert(Math.abs(gap) <= 1, `A3/T21: rainbow wrapper does not hug the textarea on the ${edge} edge (gap ${gap}px)`)
      }
      assertEqual(ringGeometry.input.width, ringGeometry.wrapper.width, 'A3/T21: wrapper width differs from the textarea width')
      assertEqual(ringGeometry.input.height, ringGeometry.wrapper.height, 'A3/T21: wrapper height differs from the textarea height')
      if (process.env.PSA_RING_EVIDENCE_DIR) {
        await mkdir(process.env.PSA_RING_EVIDENCE_DIR, { recursive: true })
        const pad = 16
        const clip = {
          x: Math.max(0, ringGeometry.input.left - pad),
          y: Math.max(0, ringGeometry.input.top - pad),
          width: Math.ceil(ringGeometry.input.width + pad * 2),
          height: Math.ceil(ringGeometry.input.height + pad * 2),
          scale: 1
        }
        const data = await h.page.send('Page.captureScreenshot', { format: 'png', clip })
        await writeFile(path.join(process.env.PSA_RING_EVIDENCE_DIR, 'rainbow-ring-alignment.png'), Buffer.from(data.data, 'base64'))
      }
      assertRectNear(noteFocused.rect, rectOfHit(noteRect), 1, 'B3: focusing the popover textarea shifted its layout')

      // Settings selects share the same wrapper treatment.
      await h.page.pressKey('escape')
      await sleep(200)
      await h.click('[data-psa-open-settings]')
      await h.page.waitFor(`!!document.querySelector('[data-psa-setting-passthrough]')`, { timeout: 6000, label: 'settings view for the rainbow-focus scenario' })
      const selectRect = await stableRect('[data-psa-setting-passthrough]')
      assert(selectRect, 'settings select missing')
      const selectIdle = await h.page.eval(probes.rainbowFocusState, '[data-psa-setting-passthrough]')
      assertEqual(selectIdle.wrapper, true, 'B3: the settings select is not inside a .psa-rainbow-field wrapper')
      await h.page.clickAt(selectRect.x, selectRect.y)
      const selectFocused = await waitRing('[data-psa-setting-passthrough]')
      assertEqual(selectFocused.focused, true, 'B3: the settings select did not take focus')
      assertEqual(selectFocused.outlineStyle, 'none', 'B3: the settings select still paints a solid focus outline')
      assertEqual(selectFocused.ringOpacity, '1', 'B3: the settings select rainbow ring is not visible on focus')
      assert(String(selectFocused.ringAnimation).includes('psa-ring-spin'), 'B3: the settings select ring is not animating')
      assertRectNear(selectFocused.rect, rectOfHit(selectRect), 1, 'B3: focusing the settings select shifted its layout')

      // Reduced motion: static rainbow ring, still visible, no animation. Keep the
      // settings view open; blur/re-focus through the real pointer to re-evaluate.
      await h.page.evaluate(`document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null`)
      await h.page.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
      })
      await sleep(300)
      await h.page.moveTo(selectRect.x, selectRect.y)
      await sleep(80)
      await h.page.clickAt(selectRect.x, selectRect.y)
      await sleep(300)
      const reducedSelect = await h.page.eval(probes.rainbowFocusState, '[data-psa-setting-passthrough]')
      assertEqual(reducedSelect.ringOpacity, '1', 'B3: the reduced-motion rainbow ring is not visible')
      assertEqual(reducedSelect.ringAnimation, 'none', `B3: reduced motion still animates the ring (${reducedSelect.ringAnimation})`)
      assert(String(reducedSelect.ringBackground || '').includes('conic-gradient'), 'B3: the reduced-motion ring lost its rainbow gradient')
      await h.page.send('Emulation.setEmulatedMedia', { features: [] })
      await sleep(200)
      await h.page.evaluate(`document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null`)
      await h.page.pressKey('escape')
      await sleep(200)
      await h.ensureStatusPanel()
      await sleep(150)

      // Collection inline note and expanded note editor share the same treatment.
      const targetAgain = await h.page.eval(pageProbe.newSessionButton)
      await h.page.moveTo(targetAgain.x, targetAgain.y)
      await sleep(150)
      await h.page.clickAt(targetAgain.x, targetAgain.y)
      await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover before the collection rainbow check' })
      await sleep(200)
      await h.click('[data-psa-add]')
      await sleep(400)
      await h.openCollection()
      await h.page.waitFor(`!!document.querySelector('[data-psa-entry-note]')`, { timeout: 6000, label: 'collection note for the rainbow check' })
      const entryRect = await stableRect('[data-psa-entry-note]')
      assert(entryRect, 'collection note missing')
      const entryIdle = await h.page.eval(probes.rainbowFocusState, '[data-psa-entry-note]')
      assertEqual(entryIdle.wrapper, true, 'B3: the collection note is not inside a .psa-rainbow-field wrapper')
      await h.page.clickAt(entryRect.x, entryRect.y)
      const entryFocused = await waitRing('[data-psa-entry-note]')
      assertEqual(entryFocused.outlineStyle, 'none', 'B3: the collection note still paints a solid focus outline')
      assertEqual(entryFocused.ringOpacity, '1', 'B3: the collection note rainbow ring is not visible on focus')
      assertRectNear(entryFocused.rect, rectOfHit(entryRect), 1, 'B3: focusing the collection note shifted its layout')
      await h.click('[data-psa-entry-expand]')
      await h.page.waitFor(`!!document.querySelector('[data-psa-entry-note-editor]')`, { timeout: 6000, label: 'expanded note editor for the rainbow check' })
      const editor = await waitRing('[data-psa-entry-note-editor] textarea')
      assertEqual(editor.wrapper, true, 'B3: the expanded note editor is not inside a .psa-rainbow-field wrapper')
      assertEqual(editor.focused, true, 'B3: the expanded note editor did not autofocus')
      assertEqual(editor.ringOpacity, '1', 'B3: the expanded note editor rainbow ring is not visible on focus')
      assertEqual(editor.outlineStyle, 'none', 'B3: the expanded note editor still paints a solid focus outline')
      await h.page.pressKey('escape')
      await sleep(200)
      await h.ensureStatusPanel()
      await h.exit()
      // Buttons keep their own focus treatment: the ring is only for inputs.
      const noteStateAfter = await h.page.eval(probes.paintLayerState)
      assertEqual(noteStateAfter.raised, null, 'B3: data-psa-raised leaked after exiting the mode')
      return 'rainbow wrapper + ::after ring (shared recipe: 3.2s spin + 14s hue) on popover/collection/editor textareas and settings select; outline none; rect stable; reduced motion static ring; mode exit restored'
    },
  }
}

/**
 * Detect whether the *merged* dynamic-workspaces F4 contract is installed.
 *
 * The base dynamic-workspaces feature lives in this same bundle, so static
 * `psd-*` class presence cannot tell "merged pin contract" from "legacy card".
 * The merged branch marks its hover card with `[data-psd-hovercard]`; this probe
 * actually hovers the DW-rendered sidebar rows (and degrades to session/workspace
 * rows) and reports what appeared:
 *   - `merged: true`       → the pinned-card contract is installed; run the real check.
 *   - `merged: false, baseOnly: true` → base DW card exists but without the merged
 *     marker; a SKIP with that exact reason is honest.
 *   - `merged: false, baseOnly: false` → no DW hovercard behavior observed at all.
 * @param {object} h - harness.
 * @returns {Promise<{ merged: boolean, baseOnly: boolean, reason: string }>} support state.
 */
async function detectDwHovercardSupport(h) {
  await h.ensureActivatedStable()
  await h.ensureStatusPanel()
  const candidates = []
  const psdPoint = await h.page.evaluate(`(() => {
    for (const selector of ['.psd-group-toggle', '.psd-item', '.psd-panel-toggle', '.psd-panel']) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight) {
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
        }
      }
    }
    return null
  })()`)
  if (psdPoint !== null) candidates.push(psdPoint)
  const workspace = await h.page.eval(probes.workspaceRowPoint)
  if (workspace !== null) candidates.push(workspace)
  const session = await h.page.eval(probes.sessionRowPoint, null)
  if (session !== null) candidates.push(session)
  let baseOnly = false
  let sawAnyRow = false
  for (const point of candidates) {
    sawAnyRow = true
    await h.page.moveTo(point.x, point.y)
    const deadline = Date.now() + 2500
    while (Date.now() < deadline) {
      const state = await h.page.evaluate(`(() => ({
        merged: document.querySelector('[data-psd-hovercard]') !== null,
        base: document.querySelector('.psd-hovercard, [class*="psd-hovercard"]') !== null
      }))()`)
      if (state.merged === true) {
        return { merged: true, baseOnly: false, reason: 'merged [data-psd-hovercard] marker observed' }
      }
      if (state.base === true) baseOnly = true
      await sleep(120)
    }
  }
  if (baseOnly) {
    return {
      merged: false,
      baseOnly: true,
      reason: 'a legacy dynamic-workspaces hover card exists but it carries no merged [data-psd-hovercard] pin marker, so the F4 pin/lifetime contract is not installed in this build'
    }
  }
  return {
    merged: false,
    baseOnly: false,
    reason: sawAnyRow
      ? 'no dynamic-workspaces hover card appeared over the probed sidebar rows; the F4 pin/lifetime contract is not installed in this build'
      : 'no sidebar row was available to probe dynamic-workspaces support'
  }
}

/**
 * F4 cross-branch check: pinned dynamic-workspaces hover card in annotation mode,
 * plus the no-mode 140 ms close regression. Only meaningful once the DW branch is
 * merged (the annotation side of the contract is asserted in scenario 10).
 * @param {object} h - harness.
 * @returns {Promise<{ verified: boolean, reason: string }>} outcome.
 */
async function runCrossBranchHovercardCheck(h) {
  await h.ensureActivatedStable()
  await h.ensureStatusPanel()
  /**
   * Hover a sidebar row until the DW hover card appears.
   * @returns {Promise<{ card: object, point: object } | null>} the card and anchor.
   */
  const findCard = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const point = (await h.page.eval(probes.workspaceRowPoint)) ?? (await h.page.eval(probes.sessionRowPoint, null))
      if (point === null || point === undefined) {
        await sleep(250)
        continue
      }
      await h.page.moveTo(point.x, point.y)
      const deadline = Date.now() + 4000
      while (Date.now() < deadline) {
        const card = await h.page.eval(probes.psdHovercardState)
        if (card !== null && card.visible) return { card, point }
        await sleep(120)
      }
    }
    return null
  }
  const found = await findCard()
  if (found === null) return { verified: false, reason: 'no [data-psd-hovercard] appeared over a sidebar row within the probe window' }
  await h.page.moveTo(found.card.centerX, found.card.centerY)
  await sleep(650)
  const held = await h.page.eval(probes.psdHovercardState)
  assert(held !== null, 'F4: the dynamic-workspaces hover card closed while the pointer rested on it in annotation mode')
  assertEqual(held.pointerEvents, 'auto', 'F4: the hover card is not pointer-interactive in annotation mode')
  assertEqual(held.zIndex, '120', 'F4: the hover card z-index is not 120 in annotation mode')
  assert(Number(held.zIndex) < 150, 'F4: the hover card must stay below the annotation paint layer')
  await h.page.clickAt(held.centerX, held.centerY, { appliedWhen: async () => (await h.ui()).popover === true })
  await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 6000, label: 'popover after selecting the pinned hover card' })
  const pinnedPopover = await h.page.eval(probes.popover)
  assert(pinnedPopover !== null, 'F4: clicking the pinned hover card did not select it')
  await h.page.pressKey('escape')
  await sleep(250)
  // No-mode regression: without the mode, leaving the anchor closes the card again.
  await h.ensureModeOff()
  await h.page.moveTo(700, 160)
  await sleep(200)
  const again = await findCard()
  assert(again !== null, 'F4 regression: the dynamic-workspaces hover card no longer appears with the mode off')
  await h.page.moveTo(again.card.centerX, again.card.centerY)
  const closeDeadline = Date.now() + 900
  let closed = false
  while (Date.now() < closeDeadline) {
    const current = await h.page.eval(probes.psdHovercardState)
    if (current === null) {
      closed = true
      break
    }
    await sleep(120)
  }
  assert(closed, 'F4 regression: with the mode off the hover card did not close within 900 ms of leaving its anchor')
  return { verified: true, reason: 'pinned card stays pointer-interactive at z=120 and is selectable; closes within 900 ms with the mode off' }
}

/**
 * Measure the native DSH session-row hover-preview CARD recipe and the annotation
 * floating tooltip-like surfaces in light and dark themes, then assert they agree.
 *
 * The native target is the shell's hover preview card (`._card_bgejw_9`): it
 * defines `--dsw-hovercard-bg:#2C2C2E` on itself (fixed in BOTH themes), paints
 * `var(--dsw-shadow-lv3)`, and has no border. The class name is discovered from
 * the real stylesheet rule, applied to a temporary probe node, and its computed
 * style is read in both themes (dark = `body[data-ds-dark-theme]`). Our surfaces
 * are the real mounted `.psa-popover`, `.psa-detail-card` and
 * `.psa-note-editor`. Light/dark close-up clips are written when
 * `PSA_HOVERCARD_EVIDENCE_DIR` is set.
 * @param {object} h - harness.
 * @returns {Promise<{ light: object, dark: object }>} measured recipe per theme.
 */
async function checkAnnotationHovercardRecipe(h) {
  const evidenceDir = process.env.PSA_HOVERCARD_EVIDENCE_DIR
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true })
  const originalDark = await h.page.evaluate(`document.body.hasAttribute('data-ds-dark-theme')`)
  /**
   * Switch the shell theme for measurement (restored by the caller).
   * @param {boolean} dark - whether to set the dark theme attribute.
   * @returns {Promise<void>}
   */
  const setTheme = async (dark) => {
    await h.page.evaluate(`(() => { document.body.toggleAttribute('data-ds-dark-theme', ${dark === true}); return true })()`)
    await sleep(180)
  }
  /**
   * Computed recipe of one mounted surface.
   * @param {string} selector - surface selector.
   * @returns {Promise<object | null>} computed values.
   */
  const styleOf = async (selector) => h.page.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (element === null) return null
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderTopWidth: style.borderTopWidth,
      borderTopStyle: style.borderTopStyle,
      borderTopColor: style.borderTopColor,
      borderRadius: style.borderTopLeftRadius,
      boxShadow: style.boxShadow,
      backdropFilter: style.backdropFilter,
      color: style.color,
    }
  })()`)
  /**
   * Computed recipe of the shell's native session-row hover preview card: find the
   * stylesheet rule that defines/paints `--dsw-hovercard-bg`, clone its class onto a
   * probe node, read style.
   * @returns {Promise<object | null>} native computed values, or null if the real
   *   hover-card rule cannot be discovered (an honest failure for the assertion).
   */
  const nativeRecipe = async () => h.page.evaluate(`(() => {
    let className = null
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      for (const rule of rules) {
        const text = rule.cssText || ''
        if (!text.includes('--dsw-hovercard-bg')) continue
        const selector = rule.selectorText || ''
        const match = selector.match(/\\.(_card_[A-Za-z0-9_-]+)/)
        if (match !== null) { className = match[1]; break }
      }
      if (className !== null) break
    }
    if (className === null) return null
    const probe = document.createElement('div')
    probe.id = 'psa-e2e-native-hovercard-probe'
    probe.className = className
    probe.textContent = 'Native hover preview card'
    probe.style.position = 'fixed'
    probe.style.left = '-9000px'
    probe.style.top = '0'
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    const result = {
      className,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderTopWidth: style.borderTopWidth,
      borderTopStyle: style.borderTopStyle,
      borderTopColor: style.borderTopColor,
      borderRadius: style.borderTopLeftRadius,
      boxShadow: style.boxShadow,
      backdropFilter: style.backdropFilter,
      color: style.color,
    }
    probe.remove()
    return result
  })()`)
  /**
   * Save one close-up clip around a selector (evidence only).
   * @param {string} name - file name stem.
   * @param {string} selector - element to frame.
   * @returns {Promise<void>}
   */
  const clipShot = async (name, selector) => {
    if (!evidenceDir) return
    const rect = await h.page.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (element === null) return null
      const r = element.getBoundingClientRect()
      const pad = 10
      return {
        x: Math.max(0, Math.floor(r.left - pad)),
        y: Math.max(0, Math.floor(r.top - pad)),
        width: Math.min(innerWidth, Math.ceil(r.width + pad * 2)),
        height: Math.min(innerHeight, Math.ceil(r.height + pad * 2)),
      }
    })()`)
    if (rect === null) return
    const data = await h.page.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
    })
    await writeFile(path.join(evidenceDir, name), Buffer.from(data.data, 'base64'))
  }
  /**
   * Put a visible native hover-card probe on screen for the evidence capture.
   * @param {boolean} show - create or remove it.
   * @returns {Promise<void>}
   */
  const nativeProbeVisible = async (show) => {
    await h.page.evaluate(`(() => {
      const existing = document.getElementById('psa-e2e-native-hovercard-visible')
      if (${show === true} === false) { if (existing !== null) existing.remove(); return true }
      if (existing !== null) return true
      let className = null
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        for (const rule of rules) {
          const text = rule.cssText || ''
          if (!text.includes('--dsw-hovercard-bg')) continue
          const selector = rule.selectorText || ''
          const match = selector.match(/\\.(_card_[A-Za-z0-9_-]+)/)
          if (match !== null) { className = match[1]; break }
        }
        if (className !== null) break
      }
      if (className === null) return false
      const probe = document.createElement('div')
      probe.id = 'psa-e2e-native-hovercard-visible'
      probe.className = className
      probe.textContent = 'Native DSH hover card'
      probe.style.position = 'fixed'
      probe.style.left = '560px'
      probe.style.top = '120px'
      document.body.appendChild(probe)
      return true
    })()`)
  }
  const light = {}
  const dark = {}
  // 1. Note editor (a separate floating tooltip-like card).
  await h.openCollection()
  await h.click('[data-psa-entry-expand]')
  await h.page.waitFor(`!!document.querySelector('[data-psa-entry-note-editor]')`, { timeout: 6000, label: 'note editor for the hover-card recipe check' })
  await setTheme(false)
  light.noteEditor = await styleOf('.psa-note-editor')
  light.native = await nativeRecipe()
  await nativeProbeVisible(true)
  await clipShot('hovercard-light-native-note-editor.png', '#psa-e2e-native-hovercard-visible')
  await clipShot('hovercard-light-note-editor.png', '.psa-note-editor')
  await nativeProbeVisible(false)
  await setTheme(true)
  dark.noteEditor = await styleOf('.psa-note-editor')
  dark.native = await nativeRecipe()
  await nativeProbeVisible(true)
  await clipShot('hovercard-dark-native-note-editor.png', '#psa-e2e-native-hovercard-visible')
  await clipShot('hovercard-dark-note-editor.png', '.psa-note-editor')
  await nativeProbeVisible(false)
  await setTheme(originalDark)
  await h.page.pressKey('escape')
  await sleep(250)
  // 2. Requirement popover.
  await h.ensureStatusPanel()
  const target = await h.page.eval(pageProbe.newSessionButton)
  assert(target, 'native New session button not found for the hover-card recipe check')
  await h.page.moveTo(target.x, target.y)
  await sleep(150)
  await h.page.clickAt(target.x, target.y)
  await h.page.waitFor(`!!document.querySelector('[data-psa-popover]')`, { timeout: 8000, label: 'popover for the hover-card recipe check' })
  await setTheme(false)
  light.popover = await styleOf('.psa-popover')
  const nativeLight = await nativeRecipe()
  light.native = nativeLight
  await nativeProbeVisible(true)
  await clipShot('hovercard-light-native-popover.png', '#psa-e2e-native-hovercard-visible')
  await clipShot('hovercard-light-popover.png', '.psa-popover')
  await nativeProbeVisible(false)
  await setTheme(true)
  dark.popover = await styleOf('.psa-popover')
  dark.native = await nativeRecipe()
  await nativeProbeVisible(true)
  await clipShot('hovercard-dark-native-popover.png', '#psa-e2e-native-hovercard-visible')
  await clipShot('hovercard-dark-popover.png', '.psa-popover')
  await nativeProbeVisible(false)
  await setTheme(originalDark)
  await h.page.pressKey('escape')
  await sleep(250)
  // 3. Hover detail card.
  const marks = await h.page.eval(probes.marksState)
  assert(marks.length > 0, 'no page mark available for the detail-card tooltip recipe check')
  await h.page.moveTo(marks[0].rect.x + Math.round(marks[0].rect.width / 2), marks[0].rect.y + Math.round(marks[0].rect.height / 2))
  await h.page.waitFor(`!!document.querySelector('[data-psa-detail]')`, { timeout: 5000, label: 'detail card for the hover-card recipe check' })
  await setTheme(false)
  light.detailCard = await styleOf('.psa-detail-card')
  await nativeProbeVisible(true)
  await clipShot('hovercard-light-native-detail.png', '#psa-e2e-native-hovercard-visible')
  await clipShot('hovercard-light-detail.png', '.psa-detail-card')
  await nativeProbeVisible(false)
  await setTheme(true)
  dark.detailCard = await styleOf('.psa-detail-card')
  await nativeProbeVisible(true)
  await clipShot('hovercard-dark-native-detail.png', '#psa-e2e-native-hovercard-visible')
  await clipShot('hovercard-dark-detail.png', '.psa-detail-card')
  await nativeProbeVisible(false)
  await setTheme(originalDark)
  await h.page.pressKey('escape')
  await sleep(250)
  // 4. Assert both themes against the native session-row hover-card recipe.
  const expectedBackground = 'rgb(44, 44, 46)' // #2C2C2E, fixed by the native card in BOTH themes
  for (const [themeName, measured] of [['light', light], ['dark', dark]]) {
    const native = measured.native
    assert(native !== null, `the native DSH hover-card rule (--dsw-hovercard-bg) was not found in the ${themeName} theme`)
    assertEqual(native.backgroundColor, expectedBackground, `${themeName}: the native hover card must paint #2C2C2E`)
    assert(native.boxShadow !== 'none', `${themeName}: the native hover card must paint --dsw-shadow-lv3`)
    for (const [surfaceName, surface] of [['popover', measured.popover], ['detailCard', measured.detailCard], ['noteEditor', measured.noteEditor]]) {
      assert(surface !== null, `${surfaceName} is missing in the ${themeName} theme`)
      assertEqual(surface.backgroundColor, native.backgroundColor, `${themeName}: ${surfaceName} background must match the native hover-card recipe`)
      assertEqual(surface.color, 'rgb(255, 255, 255)', `${themeName}: ${surfaceName} content color must stay near-white on the hover-card background`)
      assertEqual(surface.borderTopWidth, '0px', `${themeName}: ${surfaceName} must not paint the old 1px border`)
      assertEqual(surface.boxShadow, native.boxShadow, `${themeName}: ${surfaceName} must paint the native --dsw-shadow-lv3 shadow`)
      assertEqual(surface.backdropFilter, 'none', `${themeName}: ${surfaceName} must not add a backdrop filter`)
    }
  }
  assertEqual(dark.native.backgroundColor, light.native.backgroundColor, 'the native hover-card background is fixed (#2C2C2E) in both themes')
  assertEqual(light.popover.backgroundColor, expectedBackground, 'light theme popover background must be the native #2C2C2E')
  assertEqual(dark.popover.backgroundColor, expectedBackground, 'dark theme popover background must stay the native #2C2C2E (no theme flip)')
  return { light, dark }
}

async function runScenarios(harness, results, opts) {
  const scenarios = buildScenarios(harness)
  for (const id of SCENARIO_ORDER) {
    // --scenario N runs exactly that scenario; it is intended for debugging the
    // state-independent scenarios (7, 8, 9) one at a time.
    if (opts.scenario !== null && id !== opts.scenario) continue
    if (opts.from !== null && id < opts.from) continue
    await results.check(id, SCENARIO_TITLES[id], async () => {
      try {
        return await scenarios[id]()
      } catch (error) {
        // Attach the live mode/rail/session state so a failure can be classified as
        // harness/live-GUI vs product immediately.
        try {
          const env = await harness.environmentSnapshot()
          error.message = `${error.message} | env: ${JSON.stringify(env)}`
        } catch {
          /* best effort: keep the original error */
        }
        throw error
      }
    })
    if (id === 10) {
      // F4 is split across branches (D3): this branch ships the annotation-side state
      // event and [data-psd-hovercard] CSS; the dynamic-workspaces branch owns the pin
      // and lifetime. Run the real pin check when the DW feature is installed, and
      // record an explicit SKIP (never a fake PASS) when it is absent.
      const scenarioRow = results.rows.find((row) => row.id === id)
      if (scenarioRow !== undefined && scenarioRow.pass === true) {
        let support = { merged: false, baseOnly: false, reason: 'support detection unavailable' }
        try {
          support = await detectDwHovercardSupport(harness)
        } catch (error) {
          support = { merged: false, baseOnly: false, reason: `support detection failed: ${error?.message || error}` }
        }
        if (support.merged === true) {
          await results.check('10b', 'plugin hovercard pin (F4 merged: pin + selectable in annotation mode)', async () => {
            const outcome = await runCrossBranchHovercardCheck(harness)
            if (outcome.verified !== true) throw new Error(outcome.reason)
            return outcome.reason
          })
        } else {
          results.skip(
            '10b',
            'plugin hovercard pin (F4 cross-branch, owned by the dynamic-workspaces branch)',
            `F4 merged pin contract absent in this build: ${support.reason}; the annotation-side event + [data-psd-hovercard] CSS are asserted in scenario 10, and the real pin row runs after the branches merge`
          )
        }
      }
    }
    if (id === 11) {
      const scenarioRow = results.rows.find((row) => row.id === id)
      if (scenarioRow !== undefined && scenarioRow.pass === true && harness.state.s11Absent === true) {
        results.replaceWithSkip(
          id,
          'F4 cross-branch: pinned dynamic-workspaces hover card is selectable in annotation mode',
          `F4 merged pin contract absent in this build: ${harness.state.s11SkipReason ?? 'no [data-psd-hovercard] marker observed'}; ` +
            'the pin/select + no-mode close regression cannot be observed here and the same scenario runs for real after the branches merge. ' +
            'A present marker with a failing pin/select would FAIL this row, never SKIP it.'
        )
      }
    }
    if (id === 13) {
      results.skip(
        '13f',
        'chip plain-text fallback (D9) when the composer chip services are unavailable',
        'this live GUI always installs conversation/inputTriggers, so the fallback branch cannot be forced end-to-end without stubbing DSH services; the fallback text + toast and the serializers are unit-tested in test/ui-annotation.test.js'
      )
    }
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
      // Phase 2-B: the normal insertion is ONE native group chip (the plain batch
      // text is only the D9 fallback); accept either shape in the capture assertion.
      const chip = await h.page.eval(probes.chipState)
      const hasChip = chip.chips.length >= 1 && /UI annotations|UI 标注/.test(String(chip.chips[0].text || ''))
      assert(
        hasChip || /^(Please adjust the UI elements below|请调整以下 UI 元素)/.test(composerText),
        `[${name}] composer must contain only the inserted structured request (group chip or plain fallback): ${short(composerText, 220)}`
      )
    } else {
      assertEqual(composerText, '', `[${name}] refusing capture: composer draft is not empty: ${draftPreview(composerText)}`)
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
      // A3/T19: while active the launcher is docked INSIDE the rail (it must not float
      // over page content and must not overlap the rail footer actions).
      const footerState = await h.page.eval(probes.railFooterState)
      assert(footerState.launcher !== null && footerState.rail !== null, `[${name}] launcher/rail missing for the docked check`)
      assert(
        footerState.launcher.left >= footerState.rail.left - 1
          && footerState.launcher.top >= footerState.rail.top - 1
          && footerState.launcher.right <= footerState.rail.right + 1
          && footerState.launcher.bottom <= footerState.rail.bottom + 1,
        `[${name}] active launcher is not docked inside the rail: ${JSON.stringify(footerState)}`
      )
      assert(!footerState.overlapsFooter, `[${name}] docked launcher overlaps the rail footer: ${JSON.stringify(footerState)}`)
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
        `(messages=${blank.messages}, draft=${draftPreview(blank.draft)}, attachments=${blank.attachments}); ` +
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
  // Phase 2-B inserts one native group chip; keep a plain-text fallback wait for
  // builds where the chip services are unavailable (D9).
  await h.page.waitFor(
    `document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-editor="true"] [data-lexical-decorator="true"]').length >= 1`,
    { timeout: 8000, label: 'batch group chip for the composer screenshot' }
  ).catch(async () => {
    const headerPattern = /Please adjust the UI elements below|请调整以下 UI 元素/
    await h.page.waitFor(
      `(${headerPattern.toString()}).test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || '')`,
      { timeout: 4000, label: 'plain-text batch fallback for the composer screenshot' }
    ).catch(() => {})
  })
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
    failures.push(
      `${action.label}: opened ${sessionId} but it is not blank ` +
        `(messages=${blank.messages}, draft=${draftPreview(blank.draft)}, attachments=${blank.attachments})`
    )
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
        `(messages=${blank.messages}, turns=${blank.turns}, draft=${draftPreview(blank.draft)}, ` +
        `editorImages=${blank.editorImages}, attachments=${blank.attachments}); creating a fresh blank session`
    )
    blank = await createBlankSessionViaHover(page, state)
    state.blankStateSource = 'created via native "New session in <workspace>" (restored session was not blank)'
  }
  assert(
    blank.ok,
    `the harness could not confirm a blank session before typing/inserting ` +
      `(requires session root + composer + lexical editor + Chat view + 0 messages/turns + empty draft + no attachments): ` +
      `${JSON.stringify({ ...blank, draft: draftPreview(blank.draft) })}`
  )
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
    if (!page.networkEnabled) {
      results.recordFailure(
        'gate-network',
        'Network domain enabled for the failure oracle',
        `Network.enable failed: ${page.networkEnableError || 'unknown error'} — the network oracle would be blind`
      )
    }
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

  const passed = results.rows.filter((row) => row.pass && row.skipped !== true).length
  const skipped = results.rows.filter((row) => row.skipped === true).length
  const failed = results.failures.length
  const pageErrors = page !== null ? page.pageErrors : []
  const networkProblems = page !== null ? page.networkProblems : []
  const nonJsErrors = page !== null ? page.logEntries : []

  log('\n=== Results ===')
  for (const row of results.rows) {
    log(`${row.pass ? (row.skipped === true ? 'SKIP' : 'PASS') : 'FAIL'}  ${row.id}  ${row.title}${row.pass ? '' : `\n        ↳ ${short(row.detail, 700)}`}`)
  }
  log(`\nPASS ${passed} / SKIP ${skipped} / FAIL ${failed}`)
  log(`page errors: ${pageErrors.length}`)
  for (const error of pageErrors.slice(0, 8)) log(`  ! ${error}`)
  log(`real network failures: ${networkProblems.length} (${NETWORK_PREDICATE_TEXT})`)
  for (const problem of networkProblems.slice(0, 10)) log(`  ! ${problem}`)
  log(`network domain: ${page !== null && page.networkEnabled ? 'enabled' : `NOT ENABLED — ${page?.networkEnableError || 'unknown'}`}`)
  log(`ignored network noise (third-party/favicon/other): ${page !== null ? page.networkIgnored : 0}`)
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
  // Usage/argument errors are exit 2 with a concise message; everything else is a harness
  // failure and must exit 1 (N6), never look like a successful or usage run.
  if (error?.exitCode === 2 && typeof error.message === 'string') {
    console.error(`error: ${error.message}`)
    process.exit(2)
  }
  console.error(redact(error?.stack || String(error)))
  process.exit(1)
})
