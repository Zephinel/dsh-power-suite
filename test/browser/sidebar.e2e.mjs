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
 * no errors; 1 on any failure; 2 on usage errors; explicit SKIP rows (documented Host
 * pre-restart state) do not fail the run. The `--pin` mode additionally pins two live
 * Sessions through the card's real pin button. Pin state is the CARD's own state — the
 * DSH shell's native sidebar pin (`WorkspaceSnapshot.pinnedSessionIds` /
 * `uiWorkspace.pinSession`) is never read or written. The client keeps a versioned local
 * cache/queue (`power-suite.dynamic-workspaces.pinned`) and shares it through the Host
 * route `/api/power-suite.session-pins`; before the DSH Web service is restarted with the
 * merged plugin that route is absent (`pinShared === false`), so the Host-sync and
 * second-profile cross-device checks are explicit SKIP rows and the reload proof covers
 * the authoritative local cache. The run unpins its own ids through the UI in a
 * `finally` block and reports the residual local cache/queue and Host document honestly.
 * The native sidebar pin and the user's old native pins are never touched and never
 * surface in the card. The atmosphere regression rows (`r3-10`/`r3-11`) additionally open
 * one existing main card row and one existing nested subagent Session (real row clicks, no
 * typing) to make them current, then switch back to a main Session for the native
 * current-row checks. The `--live` mode is read-only: it loads the shipped GUI in two
 * fresh throwaway profiles WITHOUT injecting this worktree's client, to prove the merged
 * install serves the normal card (ordinary rows + children, zero prefilled pins).
 *
 * Usage:
 *   node test/browser/sidebar.e2e.mjs                 # full run (screenshots into .tmp-work/)
 *   node test/browser/sidebar.e2e.mjs --smoke         # pipeline smoke only
 *   node test/browser/sidebar.e2e.mjs --pin           # pin / hover-dot / native-figure acceptance
 *   node test/browser/sidebar.e2e.mjs --live          # shipped-install check, no client injection
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

/** Extra diagnostics for the --pin targeting helpers (set PSD_E2E_DEBUG=1). */
function debugLog(msg) {
  if (process.env.PSD_E2E_DEBUG === '1') log(`DEBUG ${msg}`)
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
    else if (arg === '--pin') opts.mode = 'pin'
    else if (arg === '--live') opts.mode = 'live'
    else if (arg === '--no-shots') opts.shots = false
    else if (arg === '--keep-open') opts.keepOpen = true
    else if (arg === '--headful') opts.headful = true
    else if (arg === '--client') opts.clientPath = path.resolve(argv[++i])
    else if (arg.startsWith('--client=')) opts.clientPath = path.resolve(arg.slice('--client='.length))
    else if (arg === '--url') opts.url = argv[++i]
    else if (arg.startsWith('--url=')) opts.url = arg.slice('--url='.length)
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node test/browser/sidebar.e2e.mjs [--smoke] [--pin] [--live] [--no-shots] [--client path] [--keep-open] [--headful] [--url TOKEN_URL]')
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
  static async open(cdp, url, initScript, options = {}) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new Page(cdp, sessionId)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable').catch(() => {})
    page.origin = new URL(url).origin
    if (options.trackNetwork === true) await page.enableNetworkTracking()
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

  // ---- optional Network-domain failure oracle (--pin mode) -----------------------------

  /**
   * Enable CDP `Network` and record real same-origin API/document failures with the
   * same predicate the annotation harness documents (H10): a failure counts only for a
   * same-origin http(s) URL, either an HTTP >= 400 for a Document/Fetch/XHR response or
   * for any `/api/`/`/plugins/` path, or a non-canceled load failure for
   * Document/Fetch/XHR/Script/Stylesheet. Third-party origins, favicon/data/blob URLs and
   * same-origin static assets outside those types/routes are ignored noise.
   * @returns {Promise<boolean>} whether the Network domain was enabled.
   */
  async enableNetworkTracking() {
    this.networkEnabled = false
    this.networkError = null
    this.networkFailures = []
    this.pinRouteFailures = []
    this.ignoredNetworkNoise = 0
    this._networkRequests = new Map()
    this._subscriptions.push(this.cdp.on('Network.requestWillBeSent', (params, eventSession) => {
      if (eventSession !== this.sessionId || !params.request) return
      this._networkRequests.set(params.requestId, { url: params.request.url, type: params.type })
    }))
    this._subscriptions.push(this.cdp.on('Network.responseReceived', (params, eventSession) => {
      if (eventSession !== this.sessionId || !params.response) return
      const response = params.response
      if (!this._sameOriginHttp(response.url)) {
        this.ignoredNetworkNoise += 1
        return
      }
      let pathname = ''
      try {
        pathname = new URL(response.url).pathname
      } catch {
        /* leave empty */
      }
      const type = params.type
      const meaningful = type === 'Document' || type === 'Fetch' || type === 'XHR' ||
        pathname.startsWith('/api/') || pathname.startsWith('/plugins/')
      if (!meaningful) {
        this.ignoredNetworkNoise += 1
        return
      }
      if (response.status >= 400) {
        // The card's own pin route is expected to be absent until the Host process is
        // restarted with the merged plugin; its 404s are reported separately (a SKIP
        // reason), never swallowed as a product network failure.
        if (pathname === '/api/power-suite.session-pins') this.pinRouteFailures.push(`HTTP ${response.status} ${type} ${redact(response.url)}`)
        else this.networkFailures.push(`HTTP ${response.status} ${type} ${redact(response.url)}`)
      }
    }))
    this._subscriptions.push(this.cdp.on('Network.loadingFailed', (params, eventSession) => {
      if (eventSession !== this.sessionId) return
      if (params.canceled === true || params.errorText === 'net::ERR_ABORTED') {
        this.ignoredNetworkNoise += 1
        return
      }
      const request = this._networkRequests.get(params.requestId)
      const type = params.type ?? request?.type
      if (!['Document', 'Fetch', 'XHR', 'Script', 'Stylesheet'].includes(type)) {
        this.ignoredNetworkNoise += 1
        return
      }
      if (request !== undefined && !this._sameOriginHttp(request.url)) {
        this.ignoredNetworkNoise += 1
        return
      }
      const failure = `FAILED ${type} ${params.errorText ?? 'unknown'} ${redact(request?.url ?? '')}`
      let requestPath = ''
      try {
        requestPath = request === undefined ? '' : new URL(request.url).pathname
      } catch {
        requestPath = ''
      }
      if (requestPath === '/api/power-suite.session-pins') this.pinRouteFailures.push(failure)
      else this.networkFailures.push(failure)
    }))
    try {
      await this.send('Network.enable', {}, 15000)
      this.networkEnabled = true
      return true
    } catch (error) {
      this.networkError = error?.message || String(error)
      return false
    }
  }

  /**
   * @param {string} url - candidate URL.
   * @returns {boolean} whether the URL is a same-origin http(s) URL.
   */
  _sameOriginHttp(url) {
    if (!this.origin || typeof url !== 'string' || url.length === 0) return false
    try {
      const parsed = new URL(url)
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === this.origin
    } catch {
      return false
    }
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
  window.__POWER_SUITE_TEST_HOOKS__ = window.__POWER_SUITE_TEST_HOOKS__ || {}
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

  /** Record an explicit, honest SKIP (not a PASS, does not fail the run). */
  skip(id, title, reason) {
    this.rows.push({ id, title, pass: true, skip: true, detail: reason ? short(reason) : '', ms: 0 })
    log(`SKIP  ${id}  ${title}${reason ? ` — ${short(reason, 400)}` : ''}`)
  }

  get failures() {
    return this.rows.filter((row) => !row.pass)
  }

  get skips() {
    return this.rows.filter((row) => row.skip === true)
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
      borderStyle: style.borderTopStyle,
      boxShadow: style.boxShadow,
      padding: style.padding,
      background: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
      color: style.color,
      opacity: style.opacity,
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
      borderStyle: style.borderTopStyle,
      boxShadow: style.boxShadow,
      padding: style.padding,
      background: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
      color: style.color,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      pinned: card.getAttribute('data-psd-pinned'),
      title: inner('.psd-hovercard-title'),
      path: inner('.psd-hovercard-path'),
      status: inner('.psd-hovercard-status'),
      statusText: text(card.querySelector('.psd-hovercard-status')),
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

  /** Current-Session atmosphere facts: card row + native Workspace/Session rows. */
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
        animationName: s.animationName,
        opacity: s.opacity,
        filter: s.filter,
        zIndex: s.zIndex,
      }
    }
    // The absolute wrapper's containing block is the row's padding box: that is
    // the border box minus the native row's transparent inline borders.
    const clientRect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        left: Math.round(r.left + el.clientLeft),
        top: Math.round(r.top + el.clientTop),
        right: Math.round(r.left + el.clientLeft + el.clientWidth),
        bottom: Math.round(r.top + el.clientTop + el.clientHeight),
        width: el.clientWidth,
        height: el.clientHeight,
      }
    }
    /** Facts of one .psd-atmos wrapper: clipped box, canvas and contrast scrim. */
    const atmosphere = (host) => {
      if (!host) return null
      const wrapper = [...host.children].find((node) => node instanceof HTMLElement && node.classList.contains('psd-atmos')) ?? null
      if (wrapper === null) return null
      const s = getComputedStyle(wrapper)
      const canvas = wrapper.querySelector('canvas.psd-atmos-canvas')
      const scrim = wrapper.querySelector('.psd-atmos-scrim')
      const canvasStyle = canvas ? getComputedStyle(canvas) : null
      const scrimStyle = scrim ? getComputedStyle(scrim) : null
      let painted = -1
      let avgSaturation = 0
      let avgSaturationStrong = 0
      let strongPainted = 0
      let strongSaturationSum = 0
      if (canvas !== null) {
        try {
          const ctx = canvas.getContext('2d')
          if (ctx !== null && canvas.width > 0 && canvas.height > 0) {
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
            painted = 0
            let saturationSum = 0
            for (let index = 0; index + 3 < data.length; index += 4) {
              if (data[index + 3] <= 4) continue
              painted += 1
              const r = data[index]
              const g = data[index + 1]
              const b = data[index + 2]
              const max = Math.max(r, g, b)
              const min = Math.min(r, g, b)
              const saturation = max === 0 ? 0 : (max - min) / max
              saturationSum += saturation
              if (data[index + 3] >= 64) {
                strongPainted += 1
                strongSaturationSum += saturation
              }
            }
            avgSaturation = painted === 0 ? 0 : saturationSum / painted
            avgSaturationStrong = strongPainted === 0 ? 0 : strongSaturationSum / strongPainted
          }
        } catch {
          painted = -1
        }
      }
      return {
        rect: rect(wrapper),
        radius: s.borderRadius,
        overflow: s.overflow,
        pointerEvents: s.pointerEvents,
        zIndex: s.zIndex,
        opacity: Number(s.opacity),
        kind: wrapper.getAttribute('data-psd-atmos'),
        running: wrapper.getAttribute('data-psd-atmos-running'),
        motion: wrapper.getAttribute('data-psd-atmos-motion'),
        canvas: canvas === null ? null : {
          width: canvas.width,
          height: canvas.height,
          rect: rect(canvas),
          filter: canvasStyle.filter,
          mixBlendMode: canvasStyle.mixBlendMode,
          pointerEvents: canvasStyle.pointerEvents,
          painted,
          avgSaturation: Number(avgSaturation.toFixed(3)),
          avgSaturationStrong: Number(avgSaturationStrong.toFixed(3)),
        },
        scrim: scrim === null ? null : {
          rect: rect(scrim),
          zIndex: scrimStyle.zIndex,
          pointerEvents: scrimStyle.pointerEvents,
          backgroundImage: scrimStyle.backgroundImage,
        },
      }
    }
    /** First non-atmosphere child and its stacking facts (content layer). */
    const content = (host) => {
      if (!host) return null
      const child = [...host.children].find((node) => node instanceof HTMLElement && !node.classList.contains('psd-atmos')) ?? null
      if (child === null) return null
      const s = getComputedStyle(child)
      return { className: String(child.className), position: s.position, zIndex: s.zIndex }
    }
    const proxy = document.querySelector('[data-psd-current-workspace="true"]')
    const sessionProxy = document.querySelector('[data-psd-current-session="true"]')
    const row = document.querySelector('.psd-run-current, .psd-child-current')
    const sessionId = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null
    const rowPseudoAnimations = row === null ? '' : [
      getComputedStyle(row, '::before').animationName,
      getComputedStyle(row, '::after').animationName,
    ].join(',')
    return {
      row: row === null ? null : {
        kind: row.classList.contains('psd-run-current') ? 'parent' : 'child',
        className: String(row.className),
        rect: rect(row),
        clientRect: clientRect(row),
        radius: getComputedStyle(row).borderRadius,
        current: row.getAttribute('aria-current'),
        pseudoAnimations: rowPseudoAnimations,
      },
      card: row === null ? null : atmosphere(row),
      cardContent: row === null ? null : content(row),
      legacyWave: document.querySelector('.psd-child-wave') !== null,
      legacyRing: document.querySelector('.psd-child-ring') !== null,
      oldAnimation: (() => {
        if (row === null) return false
        const names = [rowPseudoAnimations, atmosphere(row)?.canvas?.filter ?? '']
        return names.some((value) => /psd-(smoke|glow|wave)/.test(value))
      })(),
      marker: proxy === null ? null : {
        rowKey: proxy.getAttribute('data-row-key'),
        rect: rect(proxy),
        clientRect: clientRect(proxy),
        radius: getComputedStyle(proxy).borderRadius,
        atmos: atmosphere(proxy),
        content: content(proxy),
        before: pseudo(proxy, '::before'),
        after: pseudo(proxy, '::after'),
      },
      sessionMarker: sessionProxy === null ? null : {
        rowKey: sessionProxy.getAttribute('data-row-key'),
        rect: rect(sessionProxy),
        clientRect: clientRect(sessionProxy),
        radius: getComputedStyle(sessionProxy).borderRadius,
        isOpenSession: sessionId !== null && sessionProxy.getAttribute('data-row-key') === `session:${sessionId}`,
        atmos: atmosphere(sessionProxy),
        content: content(sessionProxy),
      },
      markerCount: document.querySelectorAll('[data-psd-current-workspace="true"]').length,
      sessionMarkerCount: document.querySelectorAll('[data-psd-current-session="true"]').length,
      atmosCount: document.querySelectorAll('.psd-atmos').length,
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
      afterContent: s.content,
      afterOpacity: s.opacity,
      afterBorderRadius: s.borderRadius,
      afterAnimation: s.animationName,
      afterAnimationDuration: s.animationDuration,
      afterBackground: s.backgroundImage,
      afterMask: `${s.maskImage || s.webkitMaskImage || ''} ${s.maskComposite || s.webkitMaskComposite || ''}`.trim(),
      afterFilter: s.filter,
      afterPadding: s.padding,
      afterInset: s.inset,
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
    const result = {
      borderWidth: s.borderTopWidth,
      borderStyle: s.borderTopStyle,
      radius: s.borderRadius,
      boxShadow: s.boxShadow,
      background: s.backgroundColor,
      backgroundImage: s.backgroundImage,
      backdropFilter: s.backdropFilter || s.webkitBackdropFilter || 'none',
      color: s.color,
      opacity: s.opacity,
    }
    el.remove()
    return result
  },

  /** Theme + resolved tooltip tokens, for both-theme alignment assertions. */
  themeSnapshot: () => {
    const root = document.documentElement
    const body = document.body
    const style = body ? getComputedStyle(body) : null
    return {
      rootClass: root.className,
      rootTheme: root.getAttribute('data-theme') ?? root.getAttribute('data-ds-dark-theme') ?? null,
      bodyDark: body ? body.hasAttribute('data-ds-dark-theme') : null,
      darkScheme: window.matchMedia('(prefers-color-scheme: dark)').matches,
      colorScheme: style ? style.colorScheme : null,
      tooltipBgToken: style ? style.getPropertyValue('--dsw-alias-tooltip-bg').trim() : null,
      hovercardBgToken: style ? style.getPropertyValue('--dsw-hovercard-bg').trim() : null,
      bodyBackground: style ? style.backgroundColor : null,
    }
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
/**
 * Expand the card's five-row default through its own "View all" control.
 *
 * The product intentionally keeps the five-row limit over the combined list, and with
 * the Host-shared pin the user's pre-existing pins can fill that entire default view
 * (pinned rows count as rows). The harness must expand like a user would so row-level
 * checks see the live/subagent rows too; this is a prerequisite, not an oracle change.
 * @param {object} page - Page wrapper.
 * @returns {Promise<boolean>} whether the card was expanded (or was already fully shown).
 */
async function expandPanelRows(page) {
  const link = await page.eval(() => {
    const element = document.querySelector('.psd-panel-link')
    if (element === null) return null
    const text = (element.innerText || '').trim()
    if (!/^(View all|查看全部)/.test(text)) return null
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return { text, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  })
  if (link === null) return false
  const before = await page.count('.psd-run')
  await page.clickAt(link.x, link.y)
  const deadline = Date.now() + 5000
  let after = before
  while (Date.now() < deadline) {
    await sleep(120)
    after = await page.count('.psd-run')
    if (after > before) break
  }
  if (after > before) log(`expanded card via "${link.text}": ${before} -> ${after} rows`)
  else log(`card expansion via "${link.text}" produced no new rows (${before})`)
  return after > before
}

/**
 * @returns {Promise<number>} the number of running/recent card rows, with the
 *   five-row default expanded through "View all" when the control is present.
 */
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
  await expandPanelRows(page)
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

  await results.check('b1-7', 'row highlight pills keep comfortable horizontal text insets', async () => {
    const rows = await page.eval(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect()
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }
      }
      return [...document.querySelectorAll('.psd-run, .psd-child')].map((el) => {
        const kind = el.classList.contains('psd-run') ? 'parent' : 'child'
        const main = el.querySelector('.psd-run-main, .psd-child-main')
        const title = el.querySelector('.psd-run-title, .psd-child-title')
        const time = el.querySelector('.psd-run-time, .psd-child-time')
        const toggle = el.querySelector('.psd-run-toggle, .psd-run-toggle-spacer')
        const style = getComputedStyle(main)
        const pill = box(main)
        const titleBox = box(title)
        return {
          kind,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          pill,
          title: titleBox,
          textRightInset: pill.right - titleBox.right,
          leftInset: parseFloat(style.paddingLeft),
          clipped: title.getAttribute('data-clipped') === 'true',
          row: box(el),
          timeRight: time ? box(time).right : null,
          toggleRight: toggle ? box(toggle).right : null,
        }
      })
    })
    assert(rows.length >= 3, 'need parent and child rows to measure the pill insets')
    const parents = rows.filter((row) => row.kind === 'parent')
    const children = rows.filter((row) => row.kind === 'child')
    assert(parents.length >= 1 && children.length >= 1, 'need at least one parent and one child row')
    const report = []
    for (const row of rows) {
      const expectedLeft = row.kind === 'parent' ? 14 : 10
      const expectedRight = row.kind === 'parent' ? 10 : 8
      assert(parseFloat(row.paddingLeft) >= expectedLeft, `${row.kind} pill left padding must be >= ${expectedLeft}px (today was parent 8 / child 4), got ${row.paddingLeft}`)
      assert(parseFloat(row.paddingRight) >= expectedRight, `${row.kind} pill right padding must be >= ${expectedRight}px (today was 0), got ${row.paddingRight}`)
      assert(row.textRightInset >= 8, `${row.kind} title text must sit >= 8px inside the pill's right edge, got ${row.textRightInset}px (pill right ${row.pill.right}, text right ${row.title.right})`)
      assertEqual(row.toggleRight, row.row.right, `${row.kind} disclosure column must stay right-anchored on the row edge`)
      assertNear(row.timeRight, row.row.right - 50, 1, `${row.kind} time column must stay right-anchored`)
      report.push(`${row.kind} ${row.pill.width}px pad ${row.paddingLeft}/${row.paddingRight} text-right-inset ${row.textRightInset}px`)
    }
    const parentHeights = parents.map((row) => row.row.height)
    const childHeights = children.map((row) => row.row.height)
    assert(parentHeights.every((height) => height === parentHeights[0]) && childHeights.every((height) => height === childHeights[0]), 'row heights must stay uniform')
    return report.join('; ')
  })

  await results.check('b1-5', 'trailing grid stays right-anchored at every card width (parent + child)', async () => {
    const widths = [null, 320, 400]
    const samples = []
    try {
      for (const width of widths) {
        const sample = await page.eval((w) => {
          const panel = document.querySelector('.psd-panel')
          if (!panel) return null
          panel.style.width = w === null ? '' : `${w}px`
          const box = (el) => {
            const r = el.getBoundingClientRect()
            return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom) }
          }
          const rows = [...document.querySelectorAll('.psd-run, .psd-child')].map((el) => {
            const time = el.querySelector('.psd-run-time, .psd-child-time')
            const toggle = el.querySelector('.psd-run-toggle, .psd-run-toggle-spacer')
            const title = el.querySelector('.psd-run-title, .psd-child-title')
            return {
              kind: el.classList.contains('psd-run') ? 'parent' : 'child',
              row: box(el),
              time: time ? box(time) : null,
              toggle: toggle ? box(toggle) : null,
              title: title ? { rect: box(title), clipped: title.getAttribute('data-clipped') === 'true' } : null,
            }
          })
          return { rows }
        }, width)
        assert(sample, `panel missing at width ${width ?? 'natural'}`)
        samples.push({ width: width ?? 'natural', rows: sample.rows })
      }
    } finally {
      await page.eval(() => {
        const panel = document.querySelector('.psd-panel')
        if (panel) panel.style.width = ''
      })
      await sleep(350)
    }
    const rowWidths = [...new Set(samples.flatMap((sample) => sample.rows.map((row) => row.row.width)))]
    assert(rowWidths.length >= 3, `need at least three distinct row widths to prove the invariant, got ${rowWidths.join(', ')}`)
    const details = []
    for (const sample of samples) {
      const parents = sample.rows.filter((row) => row.kind === 'parent')
      const children = sample.rows.filter((row) => row.kind === 'child')
      assert(parents.length >= 1 && children.length >= 1, `need parent and child rows at width ${sample.width}`)
      const timeRights = sample.rows.map((row) => row.time.right)
      assertNear(Math.max(...timeRights) - Math.min(...timeRights), 0, 1, `at width ${sample.width} parent/child time right edges must be identical (${JSON.stringify(timeRights)})`)
      for (const row of sample.rows) {
        assertEqual(row.toggle.right, row.row.right, `at width ${sample.width} a ${row.kind} row's disclosure column must sit on the row's right edge (toggle ${row.toggle.right}, row ${row.row.right})`)
        assertNear(row.time.right, row.row.right - 50, 1, `at width ${sample.width} a ${row.kind} row's time must be right-anchored (time ${row.time.right}, row right ${row.row.right}, expected ${row.row.right - 50})`)
        if (row.title.clipped) {
          const pillRightPad = row.kind === 'parent' ? 10 : 8
          assert(row.title.rect.right <= row.time.left - 4 - pillRightPad + 1, `at width ${sample.width} a clipped ${row.kind} title must fade before the pill's ${pillRightPad}px right padding and never run under the trailing columns (title ${row.title.rect.right}, time left ${row.time.left})`)
        }
      }
      details.push(`${sample.width}: row ${sample.rows[0].row.width}px, time right ${timeRights[0]}`)
    }
    return `${details.join(' / ')}; identical parent/child time rights and right-anchored trailing grid at all widths`
  })

  await results.check('b1-6', 'rows get a comfortable vertical gap and the tree connectors stay coherent', async () => {
    const spacing = await page.eval(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect()
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }
      }
      const body = document.querySelector('.psd-panel-body')
      if (!body) return null
      const items = [...body.children].filter((el) => el.classList.contains('psd-item'))
      const itemGaps = []
      for (let index = 1; index < items.length; index += 1) {
        itemGaps.push(Math.round(items[index].getBoundingClientRect().top - items[index - 1].getBoundingClientRect().bottom))
      }
      const groups = []
      for (const item of items) {
        const run = item.querySelector('.psd-run')
        for (const container of item.querySelectorAll('.psd-children')) {
          const kids = [...container.children].filter((el) => el.classList.contains('psd-child'))
          const gaps = []
          for (let index = 1; index < kids.length; index += 1) {
            gaps.push(Math.round(kids[index].getBoundingClientRect().top - kids[index - 1].getBoundingClientRect().bottom))
          }
          const parentGap = run !== null && kids.length > 0 ? Math.round(kids[0].getBoundingClientRect().top - run.getBoundingClientRect().bottom) : null
          const style = getComputedStyle(container)
          const last = kids[kids.length - 1]
          const mask = last ? getComputedStyle(last, '::after') : null
          groups.push({
            kids: kids.length,
            gaps,
            parentGap,
            trunkWidth: style.borderLeftWidth,
            trunkColor: style.borderLeftColor,
            lastMaskContent: mask ? mask.content : null,
            lastRow: last ? box(last) : null,
            firstRow: kids.length > 0 ? box(kids[0]) : null,
            parentRow: run ? box(run) : null,
            container: box(container),
          })
        }
      }
      return { itemGaps, groups }
    })
    assert(spacing, 'panel body not found')
    for (const gap of spacing.itemGaps) assert(gap >= 4, `top-level item gap must be at least 4 px, got ${gap}`)
    assert(spacing.groups.length >= 1, 'no nested child group to measure')
    for (const group of spacing.groups) {
      if (group.parentGap !== null) assert(group.parentGap >= 3, `parent row to first child gap must be at least 3 px, got ${group.parentGap}`)
      for (const gap of group.gaps) assert(gap >= 4, `child row gap must be at least 4 px, got ${gap}`)
      assertEqual(group.trunkWidth, '1px', 'tree trunk border must stay 1 px wide')
      assert(group.lastMaskContent !== 'none', 'the last child must keep its trunk-end mask pseudo-element')
      if (group.lastRow !== null) {
        assert(group.lastRow.bottom <= group.container.bottom + 1, 'last child must sit inside the children container so the trunk ends cleanly')
      }
    }
    // The gap must not create a dead hover strip: moving from one row across the
    // gap to the next row must still leave a row hovered (hover intents work).
    const points = await page.eval(() => {
      const rows = [...document.querySelectorAll('.psd-run')]
      const children = [...document.querySelectorAll('.psd-child')]
      if (rows.length === 0) return null
      // Prefer two top-level rows; with a single top-level row walk from the
      // parent into its first child so the new parent->child gap is crossed.
      const first = rows[0].getBoundingClientRect()
      const secondEl = rows.length > 1 ? rows[1] : children[0] ?? null
      if (secondEl === null) return null
      const second = secondEl.getBoundingClientRect()
      return {
        from: { x: Math.round(first.left + 60), y: Math.round(first.top + first.height / 2) },
        gap: { x: Math.round(first.left + 60), y: Math.round((first.bottom + second.top) / 2) },
        to: { x: Math.round(second.left + 60), y: Math.round(second.top + second.height / 2) },
      }
    })
    assert(points, 'need a second card row (or a nested child row) for the hover-across-gap probe')
    await page.moveTo(900, 500)
    await sleep(250)
    await page.moveTo(points.from.x, points.from.y)
    await sleep(350)
    const firstHover = await page.eval(probe.hoverHighlight)
    assert(firstHover.hovered, 'first card row did not register hover')
    await page.moveTo(points.gap.x, points.gap.y)
    await sleep(120)
    await page.moveTo(points.to.x, points.to.y)
    await sleep(350)
    const secondHover = await page.eval(probe.hoverHighlight)
    assert(secondHover.hovered, 'row hover did not survive crossing the new gap')
    await page.moveTo(900, 500)
    await sleep(300)
    return `item gaps ${spacing.itemGaps.join('/')} px; child gaps ${spacing.groups.map((group) => group.gaps.join('/') || 'n/a').join(' / ')}; parent-child ${spacing.groups.map((group) => group.parentGap).join('/')} px; trunk 1px; hover crosses gap`
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
      const pillRightPad = row.kind === 'parent' ? 10 : 8
      assertNear(row.title.rect.right, row.time.rect.left - 4 - pillRightPad, 1, `clipped ${row.kind} title must fade inside the pill's ${pillRightPad}px right padding (title ${row.title.rect.right}, time left ${row.time.rect.left})`)
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
    assertNear(measured.probeRight, measured.mainRight + 2, 1, `Continue overlay must sit on the faded title-tail end (overlay ${measured.probeRight}, title tail ${measured.mainRight} + 2 px spacer gap)`)
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

/**
 * Assert one row paints the clipped internal rainbow atmosphere: the wrapper is
 * the row box clipped to the row radius, the canvas fills it and painted pixels
 * exist, the dark scrim sits above the canvas, and the real content is raised
 * above both layers. All injected layers stay pointer-events:none.
 * @param {string} label - row description for failure messages.
 * @param {object} row - row facts ({ rect, radius }).
 * @param {object} atmos - atmosphere wrapper facts.
 * @param {object | null} content - first real content child stacking facts.
 * @param {object} [options] - { motion: 'animated' | 'static' } expectation.
 * @returns {string} measured summary.
 */
function assertAtmosphereRow(label, row, atmos, content, options = {}) {
  assert(atmos, `${label}: no .psd-atmos layer inside the row`)
  const box = row.clientRect ?? row.rect
  for (const side of ['left', 'right', 'top', 'bottom']) {
    assertNear(atmos.rect[side], box[side], 1, `${label}: atmosphere must cover the row's paint box exactly (${side}: ${atmos.rect[side]} vs ${box[side]})`)
  }
  assertEqual(atmos.radius, row.radius, `${label}: atmosphere must inherit the row's rounded-rectangle radius`)
  assertEqual(atmos.overflow, 'hidden', `${label}: atmosphere wrapper must clip to the rounded rect`)
  assertEqual(atmos.pointerEvents, 'none', `${label}: atmosphere wrapper must not capture the pointer`)
  assertEqual(atmos.zIndex, '0', `${label}: atmosphere must sit on the background layer (z-index 0)`)
  assert(atmos.opacity >= 0.7 && atmos.opacity <= 1, `${label}: atmosphere must be visible and vivid (opacity ${atmos.opacity}; baseline .78)`)
  assert(atmos.canvas, `${label}: atmosphere has no canvas`)
  assert(atmos.canvas.width > 0 && atmos.canvas.height > 0, `${label}: atmosphere canvas has no drawing buffer (${atmos.canvas.width}x${atmos.canvas.height})`)
  assert(atmos.canvas.painted > 0, `${label}: atmosphere canvas painted no rainbow pixels`)
  assert(atmos.canvas.filter.includes('blur'), `${label}: atmosphere canvas must keep the gas blur (${atmos.canvas.filter})`)
  assert(atmos.canvas.filter.includes('saturate(1.5)'), `${label}: atmosphere canvas must keep the vivid saturate(1.5) baseline (${atmos.canvas.filter})`)
  const saturationMin = options.saturationMin ?? 0.38
  debugLog(`atmosphere ${label}: canvas ${atmos.canvas.width}x${atmos.canvas.height} painted=${atmos.canvas.painted} strong=${atmos.canvas.avgSaturationStrong} all=${atmos.canvas.avgSaturation} motion=${atmos.motion} blend=${atmos.canvas.mixBlendMode}`)
  assert(atmos.canvas.avgSaturationStrong >= saturationMin, `${label}: atmosphere colours must stay vivid, not grey (blob-core saturation ${atmos.canvas.avgSaturationStrong}, all-pixel ${atmos.canvas.avgSaturation}, minimum ${saturationMin}; grey baseline was ~0.25)`)
  assert(['multiply', 'screen'].includes(atmos.canvas.mixBlendMode), `${label}: atmosphere canvas must keep a vivid blend mode (${atmos.canvas.mixBlendMode})`)
  assertEqual(atmos.canvas.pointerEvents, 'none', `${label}: atmosphere canvas must not capture the pointer`)
  assert(atmos.scrim, `${label}: atmosphere has no contrast scrim`)
  for (const side of ['left', 'right', 'top', 'bottom']) {
    assertNear(atmos.scrim.rect[side], box[side], 1, `${label}: scrim must cover the row's paint box (${side})`)
  }
  assertEqual(atmos.scrim.pointerEvents, 'none', `${label}: scrim must not capture the pointer`)
  assert(atmos.scrim.backgroundImage.includes('linear-gradient'), `${label}: scrim must be the faint dark gradient (${short(atmos.scrim.backgroundImage, 90)})`)
  const scrimAlphas = [...atmos.scrim.backgroundImage.matchAll(/rgba\([^)]*?,\s*([0-9.]+)\)/g)].map((match) => Number(match[1]))
  assert(scrimAlphas.length > 0, `${label}: scrim alpha could not be read (${atmos.scrim.backgroundImage})`)
  assert(Math.max(...scrimAlphas) <= 0.24, `${label}: scrim must stay light enough to keep the gas vivid (max alpha ${Math.max(...scrimAlphas)})`)
  assert(content, `${label}: row content element missing`)
  assertEqual(content.position, 'relative', `${label}: real content must be positioned above the atmosphere`)
  assert(Number(content.zIndex) >= 2, `${label}: real content must stack above the atmosphere/scrim (z-index ${content.zIndex})`)
  const wantMotion = options.motion ?? 'animated'
  assertEqual(atmos.motion, wantMotion, `${label}: atmosphere motion state must be ${wantMotion} (${atmos.motion})`)
  assertEqual(atmos.running, wantMotion === 'animated' ? 'true' : 'false', `${label}: atmosphere rAF state must match ${wantMotion} (running=${atmos.running})`)
  return `${label}: ${row.rect.width}x${row.rect.height} r=${row.radius}, canvas ${atmos.canvas.width}x${atmos.canvas.height} painted=${atmos.canvas.painted}, content z=${content.zIndex}, motion=${atmos.motion}`
}

async function runCurrentHighlightChecks({ page, results, state }) {
  log('\n=== B4: current-Session rainbow atmosphere inside the row pill ===')
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

  await results.check('b4-1', 'card row, owning Workspace row and open Session row paint the clipped internal atmosphere', async () => {
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
        await sleep(700)
        highlight = await page.eval(probe.currentHighlight)
        state.highlight = highlight
      }
    }
    assert(highlight.row, 'current card row has no .psd-run-current/.psd-child-current class')
    assertEqual(highlight.row.current, 'true', 'current card row must expose aria-current')
    assert(!highlight.legacyWave, 'the old bottom-face .psd-child-wave layer is still rendered')
    assert(!highlight.legacyRing, 'the old .psd-child-ring element is still rendered')
    assert(!highlight.oldAnimation, 'an old psd-smoke/psd-glow/psd-wave animation is still applied')
    const cardSummary = assertAtmosphereRow('card current row', highlight.row, highlight.card, highlight.cardContent)
    assert(highlight.marker, 'no native Workspace row carries data-psd-current-workspace')
    assertEqual(highlight.markerCount, 1, 'exactly one native Workspace row must be marked')
    assert(!/linear-gradient/.test(highlight.marker.before?.backgroundImage ?? ''), 'the native Workspace row still paints the old bottom-face pseudo layer')
    const workspaceSummary = assertAtmosphereRow('native Workspace row', { rect: highlight.marker.rect, clientRect: highlight.marker.clientRect, radius: highlight.marker.radius }, highlight.marker.atmos, highlight.marker.content)
    assert(highlight.sessionMarker, 'no native Session row carries data-psd-current-session')
    assertEqual(highlight.sessionMarkerCount, 1, 'exactly one native Session row must be marked')
    assertEqual(highlight.sessionMarker.isOpenSession, true, `the marked native Session row must be the open Session ${highlight.sessionId}`)
    const sessionSummary = assertAtmosphereRow('native Session row', { rect: highlight.sessionMarker.rect, clientRect: highlight.sessionMarker.clientRect, radius: highlight.sessionMarker.radius }, highlight.sessionMarker.atmos, highlight.sessionMarker.content)
    assertEqual(highlight.atmosCount, 3, `exactly three atmosphere renderers expected (card row + Workspace row + Session row), got ${highlight.atmosCount}`)
    return `${cardSummary}; ${workspaceSummary}; ${sessionSummary}`
  })

  await results.check('b4-2', 'opening another sidebar Session moves the marker and the atmosphere with it', async () => {
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
    assert(highlight.marker && highlight.marker.rowKey, 'the native Workspace marker disappeared after switching Sessions')
    assertEqual(highlight.markerCount, 1, 'exactly one native Workspace row must stay marked')
    assertEqual(highlight.sessionMarkerCount, 1, 'exactly one native Session row must stay marked')
    assertEqual(highlight.sessionMarker?.isOpenSession, true, `the marked native Session row must follow the new open Session ${highlight.sessionId}`)
    assert(highlight.marker.atmos && highlight.sessionMarker.atmos, 'the moved native rows lost their atmosphere layers')
    assertEqual(highlight.sessionId === before.sessionId, rows <= 1, 'opening another card row did not change the main-view Session')
    assertEqual(highlight.atmosCount, 3, `exactly three atmosphere renderers expected after the move, got ${highlight.atmosCount}`)
    return `markers follow ${highlight.sessionId} on ${highlight.sessionMarker.rowKey}; workspace ${highlight.marker.rowKey}`
  })

  await results.check('b4-3', 'reduced motion keeps the static internal rainbow fill and stops the renderer', async () => {
    await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    try {
      await sleep(700)
      const highlight = await page.eval(probe.currentHighlight)
      const rows = [
        ['card row', highlight.row, highlight.card, highlight.cardContent],
        ['Workspace row', highlight.marker ? { rect: highlight.marker.rect, clientRect: highlight.marker.clientRect, radius: highlight.marker.radius } : null, highlight.marker?.atmos, highlight.marker?.content],
        ['Session row', highlight.sessionMarker ? { rect: highlight.sessionMarker.rect, clientRect: highlight.sessionMarker.clientRect, radius: highlight.sessionMarker.radius } : null, highlight.sessionMarker?.atmos, highlight.sessionMarker?.content],
      ]
      const details = []
      for (const [label, row, atmos, content] of rows) {
        assert(row && atmos, `${label}: atmosphere missing under reduced motion`)
        details.push(assertAtmosphereRow(label, row, atmos, content, { motion: 'static', saturationMin: 0.28 }))
      }
      return details.join('; ')
    } finally {
      await page.emulateMedia([])
      await sleep(500)
    }
  })

  await results.check('b4-4', 'a nested child current row paints the same atmosphere inside its own rounded rect', async () => {
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
    const summary = assertAtmosphereRow('child current row', highlight.row, highlight.card, highlight.cardContent)
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
    return `${summary}; child row radius ${highlight.row.radius}`
  })
}

/**
 * Hover a native sidebar session row and return the live native tooltip facts.
 * The native tooltip has its own show delay/heuristic, so retry once.
 * @param {object} page - Page wrapper.
 * @param {string | null} evidenceName - optional close-up evidence file name.
 * @returns {Promise<{ row: object, tooltip: object | null }>} native row + tooltip.
 */
async function measureNativeTooltip(page, evidenceName = null) {
  const row = await ensureNativeSessionRow(page)
  const hover = async () => {
    await page.moveTo(700, 400)
    await sleep(400)
    await page.moveTo(row.rect.left + 40, row.rect.top + Math.round(row.rect.height / 2))
    await sleep(1500)
    return page.eval(probe.nativeTooltip)
  }
  let tooltip = await hover()
  if (tooltip === null) tooltip = await hover()
  if (tooltip !== null && evidenceName !== null) await writeEvidenceShot(page, evidenceName, tooltip.rect)
  await page.moveTo(900, 500)
  await sleep(300)
  return { row, tooltip }
  await results.check('b4-5', 'dark theme keeps the atmosphere vivid (screen blend, high saturation, light scrim)', async () => {
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
    try {
      await sleep(900)
      const highlight = await page.eval(probe.currentHighlight)
      const rows = [
        ['card row', highlight.row, highlight.card, highlight.cardContent],
        ['Workspace row', highlight.marker ? { rect: highlight.marker.rect, clientRect: highlight.marker.clientRect, radius: highlight.marker.radius } : null, highlight.marker?.atmos, highlight.marker?.content],
        ['Session row', highlight.sessionMarker ? { rect: highlight.sessionMarker.rect, clientRect: highlight.sessionMarker.clientRect, radius: highlight.sessionMarker.radius } : null, highlight.sessionMarker?.atmos, highlight.sessionMarker?.content],
      ]
      const details = []
      for (const [label, row, atmos, content] of rows) {
        assert(row && atmos, `${label}: atmosphere missing in dark theme`)
        assertEqual(atmos.canvas.mixBlendMode, 'screen', `${label}: dark theme must use the light-adding screen blend`)
        assert(atmos.canvas.filter.includes('saturate(1.5)'), `${label}: dark theme must keep the vivid saturate baseline (${atmos.canvas.filter})`)
        assert(atmos.canvas.avgSaturationStrong >= 0.38, `${label}: dark theme atmosphere must stay vivid (blob-core saturation ${atmos.canvas.avgSaturationStrong})`)
        assert(atmos.opacity >= 0.7, `${label}: dark theme atmosphere opacity must stay vivid (${atmos.opacity})`)
        details.push(`${label} sat ${atmos.canvas.avgSaturation} blend ${atmos.canvas.mixBlendMode}`)
      }
      return details.join('; ')
    } finally {
      await page.emulateMedia([])
      await sleep(500)
    }
  })

}

async function runHoverCardChecks({ page, results, state }) {
  log('\n=== B5/C2/C3: row hover card vs the native tooltip oracle ===')
  await results.check('b5-1', 'native sidebar tooltip measured live as the alignment oracle (light + dark)', async () => {
    const light = await measureNativeTooltip(page, state.shotsEnabled ? '09-native-tooltip-light' : null)
    assert(light.tooltip, 'native hover tooltip did not appear over a native session row (light theme)')
    state.nativeTooltip = light.tooltip
    state.nativeRow = light.row
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
    await sleep(800)
    const dark = await measureNativeTooltip(page, state.shotsEnabled ? '09-native-tooltip-dark' : null)
    await page.emulateMedia([])
    await sleep(500)
    assert(dark.tooltip, 'native hover tooltip did not appear over a native session row (dark theme)')
    state.nativeTooltipDark = dark.tooltip
    assertEqual(light.tooltip.offsetFromSidebarRight, 0, 'native tooltip must sit flush on the sidebar right edge')
    assertEqual(light.tooltip.borderWidth, '0px', 'native tooltip must be borderless')
    // The native hover card recipe is theme-invariant (the shell pins its own
    // --dsw-hovercard-bg to #2C2C2E); both themes must compute the same surface.
    assertEqual(dark.tooltip.background, light.tooltip.background, `native tooltip surface must be the same in light and dark (light ${light.tooltip.background}, dark ${dark.tooltip.background})`)
    assertEqual(dark.tooltip.boxShadow, light.tooltip.boxShadow, 'native tooltip elevation must be the same in light and dark')
    assertEqual(light.tooltip.backgroundImage, 'none', 'native tooltip surface is a flat colour, no gradient layer')
    assertEqual(light.tooltip.backdropFilter, 'none', 'native tooltip has no backdrop filter')
    for (const [label, tooltip] of [['light', light.tooltip], ['dark', dark.tooltip]]) {
      assertEqual(tooltip.background, 'rgb(44, 44, 46)', `native ${label} tooltip surface must resolve to the shell hover-card colour rgb(44, 44, 46)`)
      assertEqual(tooltip.radius, '16px', `native ${label} tooltip radius`)
    }
    return `oracle ${light.tooltip.background} both themes, radius ${light.tooltip.radius}, padding ${light.tooltip.padding}, border ${light.tooltip.borderWidth}`
  })

  await results.check('b5-2', 'our hover card reproduces the native tooltip recipe in light and dark', async () => {
    const native = state.nativeTooltip
    const nativeDark = state.nativeTooltipDark
    // The live card re-sorts under a stationary pointer; retry until the card is
    // actually showing instead of a single timed hover.
    const target = await hoverRowStable(page, 0)
    let card = await page.eval(probe.hoverCard)
    assert(card, 'our hover card did not appear after the hover delay (light theme)')
    state.hoverCard = card
    const compare = (actual, expected, label) => {
      assertEqual(actual.offsetFromSidebarRight, expected.offsetFromSidebarRight, `${label}: hover card left edge must be flush on the sidebar edge like the native tooltip`)
      assertNear(actual.rect.top, target.rowTop, 1, `${label}: hover card top must align to the hovered row top`)
      assertEqual(actual.rect.width, 320, `${label}: hover card keeps the native chrome and grows to its documented 320 px so the B6 figure sections fit on one line each`)
      assertEqual(actual.radius, expected.radius, `${label}: hover card radius must match the native tooltip`)
      assertEqual(actual.borderWidth, expected.borderWidth, `${label}: hover card must be borderless like the native tooltip`)
      assertEqual(actual.padding, expected.padding, `${label}: hover card padding must match the native tooltip`)
      assertEqual(actual.background, expected.background, `${label}: hover card background must match the native tooltip surface`)
      assertEqual(actual.backgroundImage, expected.backgroundImage, `${label}: hover card background image layer must match the native tooltip`)
      assertEqual(actual.backdropFilter, expected.backdropFilter, `${label}: hover card backdrop filter must match the native tooltip`)
      assertEqual(actual.boxShadow, expected.boxShadow, `${label}: hover card elevation must match the native tooltip exactly`)
      assertEqual(actual.pointerEvents, 'none', `${label}: hover card must not capture the pointer in normal mode`)
      assertEqual(actual.pinned, null, `${label}: normal mode must not pin (data-psd-pinned) the hover card`)
      assertEqual(actual.title.fontSize, expected.title.fontSize, `${label}: hover card title font-size vs native`)
      assertEqual(actual.title.lineHeight, expected.title.lineHeight, `${label}: hover card title line-height vs native`)
      assertEqual(actual.title.fontWeight, expected.title.fontWeight, `${label}: hover card title font-weight vs native`)
      assertEqual(actual.title.color, expected.title.color, `${label}: hover card title colour vs native title`)
      assertEqual(actual.path.color, expected.path.color, `${label}: hover card path colour vs native path`)
      assertEqual(actual.status.color, expected.status.color, `${label}: hover card status colour vs native status`)
      assertEqual(actual.status.fontSize, expected.status.fontSize, `${label}: hover card status font-size vs native`)
      assertEqual(actual.status.lineHeight, expected.status.lineHeight, `${label}: hover card status line-height vs native`)
    }
    if (state.shotsEnabled) await writeEvidenceShot(page, '10-our-hovercard-light', card.rect)
    compare(card, native, 'light')
    assertEqual(card.background, 'rgb(44, 44, 46)', `our light hover card must resolve to the native hover-card surface #2C2C2E, got ${card.background}`)
    const lastLight = card
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
    await sleep(800)
    try {
      await page.moveTo(900, 500)
      await sleep(300)
      await hoverRowStable(page, 0)
      card = await page.eval(probe.hoverCard)
      assert(card, 'our hover card did not appear after the hover delay (dark theme)')
      if (state.shotsEnabled) await writeEvidenceShot(page, '10-our-hovercard-dark', card.rect)
      compare(card, nativeDark, 'dark')
      assertEqual(card.background, 'rgb(44, 44, 46)', `our dark hover card must resolve to the native hover-card surface #2C2C2E (not the theme-dependent --dsw-alias-tooltip-bg), got ${card.background}`)
      assertEqual(card.background, lastLight.background, 'our hover card surface must be the same in light and dark, like the native tooltip')
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
    await page.moveTo(900, 500)
    return `light ${lastLight.background} / dark ${card.background}; radius ${card.radius}, border ${card.borderWidth}, elevation matched`
  })

  await results.check('b5-3', 'hover card dismisses on pointer leave (normal mode unchanged)', async () => {
    await page.moveTo(900, 500)
    await sleep(700)
    const present = await page.eval(() => document.querySelector('[data-psd-hovercard]') !== null)
    assert(!present, 'hover card did not dismiss after the pointer left the row')
    return 'card closed on leave (140 ms delay preserved)'
  })

  await results.check('c2-1', 'every plugin tooltip-like card uses the native tooltip surface in both themes', async () => {
    const native = state.nativeTooltip
    assert(native, 'the native tooltip oracle was not measured earlier')
    const surfaces = ['psd-hovercard', 'dsa-quicklook', 'psp-rail-card', 'psp-search-card']
    const measured = {}
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
        await sleep(700)
      }
      for (const surface of surfaces) {
        const card = await page.eval(probe.computedForClass, surface)
        measured[`${theme}:${surface}`] = card
        assertEqual(card.background, 'rgb(44, 44, 46)', `${surface} (${theme}) must resolve to the native hover-card surface #2C2C2E, got ${card.background}`)
        assertEqual(card.background, native.background, `${surface} (${theme}) background must equal the live native hover-card background (${native.background}), got ${card.background}`)
        assertEqual(card.backgroundImage, native.backgroundImage, `${surface} (${theme}) must not add a background-image layer`)
        assertEqual(card.backdropFilter, native.backdropFilter, `${surface} (${theme}) backdrop filter must match the native tooltip`)
        assertEqual(card.borderWidth, '0px', `${surface} (${theme}) must be borderless`)
        assertEqual(card.radius, native.radius, `${surface} (${theme}) radius must match the native tooltip`)
        assertEqual(card.boxShadow, native.boxShadow, `${surface} (${theme}) elevation must match the native tooltip exactly`)
      }
    }
    await page.emulateMedia([])
    await sleep(300)
    const unique = new Set(surfaces.map((surface) => measured[`light:${surface}`].background))
    assertEqual(unique.size, 1, `all plugin tooltip surfaces must share one background: ${[...unique].join(' / ')}`)
    return `4 surfaces x 2 themes on ${native.background}; radius ${native.radius}; native elevation`
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
  await results.check('b6-7', 'a live Session hover card refreshes its figures in place while open', async () => {
    const candidates = await page.eval(() => {
      const rows = []
      for (const child of document.querySelectorAll('.psd-child')) {
        if (child.dataset.state !== 'running') continue
        const title = (child.querySelector('.psd-child-title')?.innerText ?? '').trim()
        if (title.length > 0) rows.push({ kind: 'child', title })
      }
      for (const parent of document.querySelectorAll('.psd-run')) {
        if (parent.dataset.state !== 'running') continue
        const title = (parent.querySelector('.psd-run-title')?.innerText ?? '').trim()
        if (title.length > 0) rows.push({ kind: 'parent', title })
      }
      return rows.slice(0, 2)
    })
    assert(candidates.length > 0, 'no running card row to probe for live figures')
    const readFigures = async () => {
      const card = await page.eval(probe.hoverCard)
      if (card === null) return null
      return {
        statusText: card.statusText,
        sections: card.sections.map((section) => `${section.title}|${section.value}`),
      }
    }
    const attempts = []
    for (const candidate of candidates) {
      const opened = await openHoverCard(page, candidate.kind, candidate.title, { attempts: 6, timeoutMs: 3200 })
      if (!opened) {
        attempts.push(`${candidate.kind} "${short(candidate.title, 30)}": card did not open`)
        continue
      }
      const first = await readFigures()
      if (first === null) {
        attempts.push(`${candidate.kind} "${short(candidate.title, 30)}": no card`)
        continue
      }
      // Resolve the row to a Session id through the documented live test seam.
      const live = await page.eval(() => (globalThis.__POWER_SUITE_TEST_HOOKS__?.dynamicWorkspacesLive
        ? globalThis.__POWER_SUITE_TEST_HOOKS__.dynamicWorkspacesLive.snapshot()
        : null))
      if (live === null || typeof live !== 'object') {
        attempts.push('live projection seam unavailable')
        break
      }
      const match = (live.rows ?? []).find((row) => row.title === candidate.title)
      if (!match) {
        attempts.push(`${candidate.kind} "${short(candidate.title, 30)}": no Session id match (${short(JSON.stringify(live.rows?.slice(0, 3)), 120)})`)
        await page.moveTo(900, 500)
        await sleep(350)
        continue
      }
      const patched = await page.eval((sessionId) => {
        const seam = globalThis.__POWER_SUITE_TEST_HOOKS__?.dynamicWorkspacesLive
        return seam && typeof seam.patchStats === 'function' ? seam.patchStats(sessionId, 7, 11) : false
      }, match.id)
      let latest = first
      let changed = false
      if (patched) {
        const deadline = Date.now() + 6000
        while (Date.now() < deadline) {
          await sleep(700)
          latest = await readFigures()
          if (latest !== null && JSON.stringify(latest.sections) !== JSON.stringify(first.sections)) {
            changed = true
            break
          }
        }
      }
      await page.eval((sessionId) => {
        const seam = globalThis.__POWER_SUITE_TEST_HOOKS__?.dynamicWorkspacesLive
        if (seam && typeof seam.restoreStats === 'function') seam.restoreStats(sessionId)
      }, match.id)
      await page.moveTo(900, 500)
      await sleep(350)
      if (changed) {
        return `${candidate.kind} "${short(candidate.title, 32)}": open card re-read the patched live projection frame in place (${short(first.sections.join(' | '), 70)} -> ${short(latest.sections.join(' | '), 70)}); status "${first.statusText}" -> "${latest.statusText}"; no polling/request involved`
      }
      attempts.push(`${candidate.kind} "${short(candidate.title, 30)}": open card did not re-render the patched frame (status "${first.statusText}")`)
    }
    throw new Error(`a live Session's open hover card must refresh its figures from the pushed projection snapshot; probe results: ${attempts.join('; ')}`)
  })

}

async function runFocusChecks({ page, results, state }) {
  log('\n=== B3: rainbow focus highlight for plugin inputs ===')
  await results.check('b3-1', 'prompt-history search card shows the calm rainbow ring on focus (input stays ringless)', async () => {
    const toggle = await page.findRect('[data-psp-search-toggle]')
    assert(toggle, 'prompt-history search toggle not found (the prompt rail is not mounted)')
    await page.clickAt(toggle.x, toggle.y)
    await sleep(800)
    const ring = await page.eval(probe.focusRing, '.psp-search-card')
    assert(ring.present, 'search card missing')
    assert(ring.focused, 'the search card did not enter focus-within when it opened')
    assert(ring.afterContent !== 'none', 'the search card has no rainbow ring pseudo-element')
    // The calm variant now wraps the whole card: visible but quiet.
    const opacity = Number(ring.afterOpacity)
    assert(opacity >= 0.5 && opacity <= 0.68, `card ring must be the calm variant (opacity ${ring.afterOpacity}, expected 0.5-0.68)`)
    assert(ring.afterFilter.includes('saturate(0.8)'), `card ring must stay slightly desaturated (filter ${ring.afterFilter})`)
    assert(ring.afterFilter.includes('2.5px'), `card ring outer glow must stay soft at 2.5px (filter ${ring.afterFilter})`)
    assertEqual(ring.afterPadding, '1.5px', 'card ring must keep the thinner 1.5 px track')
    assertEqual(ring.afterInset, '-3px', 'card ring must hug the card border box on all edges (inset -3px)')
    assertNear(parseFloat(ring.afterBorderRadius), 19, 0.5, `card ring radius must be the card radius + 3 px (got ${ring.afterBorderRadius})`)
    assert(ring.afterBackground.includes('conic-gradient'), `card ring must be the rainbow conic track, got ${short(ring.afterBackground, 100)}`)
    assert(ring.afterAnimation.includes('psf-ring'), `card ring animation missing (${ring.afterAnimation})`)
    assert(ring.afterAnimationDuration.includes('4.6s'), `card ring should drift slowly (durations ${ring.afterAnimationDuration})`)
    assert(ring.afterMask.includes('exclude') || ring.afterMask.includes('xor'), `card ring must use the mask-composite track recipe (${ring.afterMask})`)
    const card = await page.eval(() => {
      const node = document.querySelector('.psp-search-card')
      const r = node.getBoundingClientRect()
      return {
        rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
        overflow: getComputedStyle(node).overflow,
      }
    })
    assertEqual(card.overflow, 'visible', 'search card must not clip its own rainbow ring (overflow visible)')
    assert(card.rect.width >= 200 && card.rect.height >= 40, `unexpected card box ${JSON.stringify(card.rect)}`)
    // The inner input must be ringless and keep a clean focus state.
    const field = await page.eval(probe.focusRing, '.psp-search-field')
    assert(field.present, 'search field wrapper missing')
    assertEqual(field.afterContent, 'none', 'the inner search field must NOT carry the rainbow ring anymore')
    const input = await page.eval(() => {
      const node = document.querySelector('.psp-search-input')
      if (node === null) return null
      const s = getComputedStyle(node)
      return { outlineStyle: s.outlineStyle, focused: document.activeElement === node }
    })
    assert(input && input.focused, 'the inner search input must keep keyboard focus')
    assertEqual(input.outlineStyle, 'none', 'the inner search input must keep a clean (ringless/outline-less) focus state')
    await page.pressEscape()
    await sleep(400)
    const closed = await page.eval(() => document.querySelector('.psp-search-card') === null)
    assertEqual(closed, true, 'search card did not close on Escape')
    return `calm conic ring on the card (opacity ${ring.afterOpacity}, ${ring.afterPadding} track, radius ${ring.afterBorderRadius}), input ringless, Esc closes`
  })

  await results.check('b3-2', 'settings choice pills replaced their solid focus outline with the same ring', async () => {
    const rules = await page.evaluate(`(() => {
      const result = { ringRule: false, fieldWired: false, solidChoiceOutline: false, calmScoped: false, sharedDefault: false }
      for (const sheet of document.styleSheets) {
        let rules2
        try { rules2 = sheet.cssRules } catch { continue }
        if (!rules2) continue
        for (const rule of rules2) {
          const text = rule.cssText || ''
          if (text.includes('.psf-rainbow-focus') && text.includes('conic-gradient')) result.ringRule = true
          if (text.includes('.psp-search-card.psf-rainbow-focus')) result.calmScoped = true
          if (text.includes('.psf-rainbow-focus.psp-search-field')) result.fieldWired = true
          if (text.includes('dps-choice-option') && text.includes('focus-visible') && text.includes('outline')) result.solidChoiceOutline = true
          if (text.includes('.psf-rainbow-focus.psp-search-field') && /--psf-ring-opacity\\s*:\\s*[.0-9]*58/.test(text)) result.calmScoped = true
          if (/\.psf-rainbow-focus\\s*\\{/.test(text) && /--psf-ring-opacity\\s*:\\s*1\\b/.test(text)) result.sharedDefault = true
        }
      }
      return result
    })()`)
    assert(rules.ringRule, 'shared rainbow-focus stylesheet is missing')
    assert(!rules.fieldWired, 'the inner search field must not carry the shared rainbow ring anymore')
    assert(!rules.solidChoiceOutline, 'a solid focus outline rule still targets the settings choice pills')
    assert(rules.calmScoped, 'the calmer ring variant is not scoped to the prompt-history search card')
    assert(rules.sharedDefault, 'the shared rainbow ring lost its strong default for the other plugin inputs')
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
  // Force the LIGHT theme for the light-theme evidence even when the machine's
  // system appearance is dark (DSH follows prefers-color-scheme).
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.moveTo(900, 500)
  await sleep(500)
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
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(500)
  await shot('06-reduced-motion')
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
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
  // B4 v3 atmosphere close-ups: card row + native Workspace row + native Session
  // row, in both themes.
  await captureAtmosphereEvidence(page, shot, 'light')
  await captureLayoutEvidence(page, shot, 'light')
  await capturePillEvidence(page, shot, 'light')
  await captureFocusEvidence(page, shot, 'light')
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
  await sleep(800)
  await captureAtmosphereEvidence(page, shot, 'dark')
  await captureLayoutEvidence(page, shot, 'dark')
  await capturePillEvidence(page, shot, 'dark')
  await captureFocusEvidence(page, shot, 'dark')
  await page.emulateMedia([])
  await sleep(300)
  return shots
}

/**
 * Photograph the internal rainbow atmosphere on the three highlighted rows.
 * @param {object} page - Page wrapper.
 * @param {Function} shot - screenshot(name, clip) helper.
 * @param {'light' | 'dark'} theme - theme label used in the file names.
 * @returns {Promise<void>}
 */
async function captureAtmosphereEvidence(page, shot, theme) {
  try {
    // The fold checks reload the page with persisted folds: unfold both buckets
    // and the marked Workspace section so the native rows are photographable.
    const expanded = await page.eval(() => {
      for (const group of ['active', 'inactive']) {
        const toggle = document.querySelector(`[data-psd="group"][data-group="${group}"] .psd-group-toggle`)
        if (toggle instanceof HTMLElement && toggle.getAttribute('aria-expanded') === 'false') toggle.click()
      }
      return true
    })
    if (!expanded) return
    await sleep(700)
    const rowsReady = await page.eval(() => {
      const row = document.querySelector('[data-psd-current-workspace="true"]')
      if (row instanceof HTMLElement && row.getAttribute('aria-expanded') === 'false') row.click()
      return true
    })
    if (!rowsReady) return
    await sleep(900)
    const targets = [
      ['11-card-atmosphere', '.psd-run-current, .psd-child-current'],
      ['12-workspace-atmosphere', '[data-psd-current-workspace="true"]'],
      ['13-session-atmosphere', '[data-psd-current-session="true"]'],
    ]
    for (const [name, selector] of targets) {
      const scrolled = await page.eval((sel) => {
        const el = document.querySelector(sel)
        if (!el) return false
        el.scrollIntoView({ block: 'center', behavior: 'instant' })
        return true
      }, selector)
      if (!scrolled) continue
      await page.moveTo(900, 500)
      await sleep(400)
      const rect = await page.eval((sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      }, selector)
      console.log(`ATMOSRECT ${name} ${theme} ${rect === null ? 'null' : JSON.stringify(rect)}`)
      if (rect === null || rect.width < 8 || rect.height < 8) continue
      const clip = clipAroundRect(rect)
      if (clip === null) continue
      await shot(`${name}-${theme}`, clip)
    }
  } catch (error) {
    console.log(`ATMOSSHOT ${theme} skipped: ${error?.message || String(error)}`)
  }
}

/**
 * Photograph the whole "Running & recent" card close-up so the new inter-row gaps
 * and the trailing-column alignment are visible in light and dark. (The live
 * sidebar shell clips a card forced wider than the sidebar column, so wide-width
 * alignment is asserted numerically by b1-5 instead of via a wide screenshot.)
 * @param {object} page - Page wrapper.
 * @param {Function} shot - screenshot(name, clip) helper.
 * @param {'light' | 'dark'} theme - theme label used in the file name.
 * @returns {Promise<void>}
 */
async function captureLayoutEvidence(page, shot, theme) {
  try {
    const rect = await page.eval(() => {
      const panel = document.querySelector('.psd-panel')
      if (!panel) return null
      const row = document.querySelector('.psd-run-current, .psd-child-current') ?? document.querySelector('.psd-run')
      if (row) row.scrollIntoView({ block: 'center', behavior: 'instant' })
      const r = panel.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.min(Math.round(r.height), 340) }
    })
    if (rect !== null) {
      await page.moveTo(900, 500)
      await sleep(500)
      const clip = clipAroundRect(rect)
      if (clip !== null) await shot(`14-card-spacing-${theme}`, clip)
    }
  } finally {
    await sleep(150)
  }
}

/**
 * Photograph the hover-highlight pill of a parent and a child row so the new
 * horizontal text padding is visible in light and dark.
 * @param {object} page - Page wrapper.
 * @param {Function} shot - screenshot(name, clip) helper.
 * @param {'light' | 'dark'} theme - theme label used in the file name.
 * @returns {Promise<void>}
 */
async function capturePillEvidence(page, shot, theme) {
  const capture = async (name, index) => {
    try {
      await page.moveTo(900, 500)
      await sleep(250)
      const target = await hoverRow(page, index)
      if (!target) return
      await sleep(450)
      const rect = await page.eval(() => {
        const row = document.querySelector('.psd-run:hover, .psd-child:hover')
        if (!row) return null
        const r = row.getBoundingClientRect()
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      })
      if (rect === null) return
      const clip = clipAroundRect(rect)
      if (clip !== null) await shot(name, clip)
    } catch {
      // best-effort evidence
    }
  }
  const childIndex = await page.eval(() => {
    const rows = [...document.querySelectorAll('.psd-run, .psd-child')]
    return rows.findIndex((row) => row.classList.contains('psd-child'))
  })
  await capture(`15-pill-parent-${theme}`, 0)
  if (childIndex > 0) await capture(`15-pill-child-${theme}`, childIndex)
  await page.moveTo(900, 500)
  await sleep(300)
}

/**
 * Photograph the focused prompt-history search field's rainbow ring close-up.
 * @param {object} page - Page wrapper.
 * @param {Function} shot - screenshot(name, clip) helper.
 * @param {'light' | 'dark'} theme - theme label used in the file name.
 * @returns {Promise<void>}
 */
async function captureFocusEvidence(page, shot, theme) {
  try {
    const toggle = await page.findRect('[data-psp-search-toggle]')
    if (!toggle) return
    await page.clickAt(toggle.x, toggle.y)
    await sleep(800)
    const rect = await page.eval(() => {
      const card = document.querySelector('.psp-search-card')
      if (!card) return null
      const r = card.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    })
    if (rect !== null) {
      await page.moveTo(900, 700)
      await sleep(450)
      const clipRect = { left: rect.left - 16, top: rect.top - 16, width: rect.width + 32, height: rect.height + 32 }
      const clip = clipAroundRect(clipRect)
      if (clip !== null) await shot(`16-focus-ring-${theme}`, clip)
    }
    await page.pressEscape()
    await sleep(450)
  } catch {
    // best-effort evidence
  }
}

/** Viewport-clamped clip around a floating card rect for evidence close-ups. */
function clipAroundRect(rect) {
  const pad = 10
  if (rect === null || rect === undefined) return null
  const x = Math.max(0, rect.left - pad)
  const y = Math.max(0, rect.top - pad)
  const width = Math.min(rect.width + pad * 2, VIEWPORT.width - x)
  const height = Math.min(rect.height + pad * 2, VIEWPORT.height - y)
  if (width < 20 || height < 20) return null
  return { x, y, width, height }
}

/**
 * Write a close-up evidence PNG of one floating card while it is on screen.
 * @param {object} page - Page wrapper.
 * @param {string} name - evidence file name (without extension).
 * @param {object} rect - card viewport rect.
 * @returns {Promise<string | null>} the written path, or null when clipped away.
 */
async function writeEvidenceShot(page, name, rect) {
  const clip = clipAroundRect(rect)
  if (clip === null) return null
  await mkdir(SHOTS_DIR, { recursive: true })
  const file = path.join(SHOTS_DIR, `${name}.png`)
  await page.screenshot(file, clip)
  log(`wrote ${file}`)
  return file
}

// ---------------------------------------------------------------------------------------------
// --pin mode: hover-card dot circle (R1), native hover figures (R2), running-panel pin (R3)
//
// These checks target the session-pin-stats contract (`.tmp-work/pin-stats-contract.md`) and
// run against the same live scrape/injection pipeline as the rest of this harness. They are
// append-only: the full-mode checks above are not modified, only their helpers are reused.
// ---------------------------------------------------------------------------------------------

/** How many card/native rows are probed before a check reports failure. */
const PIN_ROW_ATTEMPTS = 5

/**
 * The user's old native sidebar pin titles (from the rejected native-pin build).
 * They must never surface as pinned rows of the running card; sampled only when a
 * matching ordinary title happens to be listed so the failure message is explicit.
 */
const OLD_NATIVE_PIN_TITLES = [
  'DSH 内嵌 UI 实验性富文本开关',
  '帮我去调查一下：有哪些用于',
  '熄灭当前 mac 的屏幕，但是像',
  '同一个帖子，在 Windows 上的进',
  '自定义模板生成与问答式创建菜单',
  'DSH 扩展发布与国际化-上架第三方市场'
]

/** Shared page probes for the --pin checks (plain serializable functions). */
const probePin = {
  /** The plugin running-card hover card's status dot (R1). */
  dotStyle: () => {
    const card = document.querySelector('[data-psd-hovercard]')
    if (card === null) return null
    const dot = card.querySelector('.psd-hovercard-dot')
    if (dot === null) return null
    const style = getComputedStyle(dot)
    const rect = dot.getBoundingClientRect()
    // Chrome normalizes the `corner-shape: round` keyword to `superellipse(1)` in
    // computed style; a synthetic control with the same declaration proves the
    // normalized value the dot must match.
    const control = document.createElement('span')
    control.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:10px;height:10px;border-radius:50%;corner-shape:round')
    document.body.appendChild(control)
    const roundComputed = String(getComputedStyle(control).cornerShape ?? getComputedStyle(control).getPropertyValue('corner-shape') ?? '').trim()
    control.remove()
    const shellDefault = getComputedStyle(document.documentElement).getPropertyValue('--dsw-corner-shape').trim()
    return {
      cornerShape: style.cornerShape ?? null,
      cornerShapeRaw: style.getPropertyValue('corner-shape') || '',
      roundComputed,
      shellDefault,
      borderRadius: style.borderTopLeftRadius,
      width: style.width,
      height: style.height,
      backgroundColor: style.backgroundColor,
      dataState: dot.getAttribute('data-state'),
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      },
      cardRect: (() => {
        const r = card.getBoundingClientRect()
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      })(),
    }
  },

  /**
   * The **native** sidebar session hover card (the shell `HoverCard`), including the
   * figure sections the plugin injects through `sidebar.session.row.hover` (R2).
   */
  nativeCard: () => {
    const rect = (element) => {
      const r = element.getBoundingClientRect()
      return {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    }
    const text = (node) => (node ? (node.innerText || node.textContent || '').trim() : '')
    const card = [...document.querySelectorAll('div[class*="_card_"]')].find((element) => {
      const style = getComputedStyle(element)
      const r = element.getBoundingClientRect()
      return style.position === 'fixed' && r.width >= 200 && r.width <= 320 && r.height >= 40
    })
    if (card === undefined) return null
    const sectionFacts = (section) => ({
      title: text(section.querySelector('.psd-hovercard-section-title')),
      value: text(section.querySelector('.psd-hovercard-section-value')),
      rows: [...section.querySelectorAll('.psd-hovercard-row')].map((row) => ({
        key: text(row.querySelector('.psd-hovercard-key')),
        value: text(row.querySelector('.psd-hovercard-row-value')),
      })),
    })
    const style = getComputedStyle(card)
    const content = card.querySelector('[class*="hoverContent"]')
    const wrapper = card.querySelector('[data-psd-native-figures]')
    const timeLine = card.querySelector('[class*="hoverTime"]')
    const firstStatus = card.querySelector('[class*="hoverStatus"]')
    const wrapperSections = wrapper === null ? [] : [...wrapper.querySelectorAll('.psd-hovercard-section')].map(sectionFacts)
    const allSections = [...card.querySelectorAll('.psd-hovercard-section')].map(sectionFacts)
    return {
      found: true,
      rect: rect(card),
      width: style.width,
      padding: style.padding,
      borderRadius: style.borderRadius,
      position: style.position,
      background: style.backgroundColor,
      content: content === null
        ? null
        : { rect: rect(content), width: Math.round(content.getBoundingClientRect().width), gap: getComputedStyle(content).gap },
      title: text(card.querySelector('[class*="hoverTitle"]')),
      path: text(card.querySelector('[class*="hoverPath"]')),
      time: text(timeLine),
      statuses: [...card.querySelectorAll('[class*="hoverStatus"]')].map(text),
      children: content === null ? [] : [...content.children].map((element) => ({
        className: String(element.className || ''),
        isFigures: element.matches('[data-psd-native-figures]'),
        containsFigures: element.matches('[data-psd-native-figures]') || element.querySelector('[data-psd-native-figures]') !== null,
      })),
      figuresWrapper: wrapper === null
        ? null
        : {
            rect: rect(wrapper),
            sectionCount: wrapperSections.length,
            width: Math.round(wrapper.getBoundingClientRect().width),
            empty: wrapper.children.length === 0,
            visible: wrapper.getBoundingClientRect().width > 0 && wrapper.getBoundingClientRect().height > 0 &&
              getComputedStyle(wrapper).display !== 'none' && getComputedStyle(wrapper).visibility !== 'hidden',
            afterTime: timeLine === null ? null : Boolean(timeLine.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING),
            beforeStatus: firstStatus === null ? null : Boolean(wrapper.compareDocumentPosition(firstStatus) & Node.DOCUMENT_POSITION_FOLLOWING),
          },
      wrapperSections,
      sectionsOutsideWrapper: allSections.length - wrapperSections.length,
      insideRunningCard: card.closest('[data-psd-hovercard]') !== null,
    }
  },

  /** One native sidebar session row: geometery, text and its non-interactive pin marker. */
  nativeRowState: (sessionId) => {
    const row = document.querySelector(`[data-row-key="session:${sessionId}"]`)
    if (row === null) return { found: false }
    const rect = (element) => {
      const r = element.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const text = (node) => (node ? (node.innerText || node.textContent || '').trim() : '')
    const indicators = [...row.querySelectorAll('[role="img"], [class*="pinIndicator"], [aria-label], [title]')].map((element) => ({
      className: String(element.className || ''),
      role: element.getAttribute('role'),
      label: element.getAttribute('aria-label'),
      title: element.getAttribute('title'),
      rect: rect(element),
    }))
    const pin = indicators.filter((entry) =>
      /pinn|置顶/i.test(`${entry.label ?? ''} ${entry.title ?? ''}`) || /pinIndicator/i.test(entry.className))
    const sessionRows = [...document.querySelectorAll('[data-row-key^="session:"]')]
    // Position inside its own Workspace group (the shell fronts a pinned Session's
    // saved order, which shows up as the row leading its group's pinned partition).
    let groupContainer = row.parentElement
    let groupRows = null
    while (groupContainer !== null && groupContainer !== document.body) {
      const siblings = [...groupContainer.querySelectorAll('[data-row-key^="session:"]')]
      if (siblings.length > 1) {
        groupRows = siblings
        break
      }
      groupContainer = groupContainer.parentElement
    }
    return {
      found: true,
      key: row.getAttribute('data-row-key'),
      rect: rect(row),
      text: text(row).slice(0, 120),
      order: sessionRows.indexOf(row),
      groupIndex: groupRows === null ? -1 : groupRows.indexOf(row),
      groupSize: groupRows === null ? -1 : groupRows.length,
      indicators,
      pin,
      pinVisible: pin.some((entry) => entry.rect.width > 0 && entry.rect.height > 0),
    }
  },

  /**
   * The Session's native Workspace-group siblings and their pin markers, so the
   * pin-to-native saved-order fronting can be verified positively (the pinned row
   * must lead its group's pinned partition).
   */
  nativeGroupFacts: (sessionId) => {
    const row = document.querySelector(`[data-row-key="session:${sessionId}"]`)
    if (row === null) return null
    let container = row.parentElement
    let groupRows = null
    while (container !== null && container !== document.body) {
      const siblings = [...container.querySelectorAll('[data-row-key^="session:"]')]
      if (siblings.length > 1) {
        groupRows = siblings
        break
      }
      container = container.parentElement
    }
    if (groupRows === null) return null
    const hasPinMarker = (candidate) => [...candidate.querySelectorAll('[role="img"], [class*="pinIndicator"]')]
      .some((element) => /pinn|置顶/i.test(`${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`)
        || /pinIndicator/i.test(String(element.className || '')))
    const entries = groupRows.map((candidate) => ({
      key: candidate.getAttribute('data-row-key'),
      pinned: hasPinMarker(candidate),
    }))
    const index = groupRows.indexOf(row)
    return {
      entries,
      index,
      size: groupRows.length,
      leadingPinned: index >= 0 && entries.slice(0, index + 1).every((entry) => entry.pinned),
    }
  },

  /** Every currently rendered native sidebar session row. */
  nativeRows: () => {    const tree = document.querySelector('[role="tree"]')
    const treeRect = tree ? tree.getBoundingClientRect() : null
    return [...document.querySelectorAll('[data-row-key^="session:"]')]
      .map((row) => {
        const r = row.getBoundingClientRect()
        return {
          key: row.getAttribute('data-row-key'),
          text: (row.innerText || '').trim().slice(0, 90),
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
          inTree: treeRect !== null && r.top >= treeRect.top && r.bottom <= Math.min(treeRect.bottom, innerHeight),
        }
      })
      .filter((row) => row.width > 0 && row.height > 0 && row.inTree)
  },

  /**
   * Running-card main-row pin facts (R3): the fixed pin slot, the pin button state and
   * the title geometry, for every `.psd-run` row currently rendered.
   */
  cardPinState: () => {
    const rect = (element) => {
      if (element === null) return null
      const r = element.getBoundingClientRect()
      return {
        left: Number(r.left.toFixed(2)),
        top: Number(r.top.toFixed(2)),
        right: Number(r.right.toFixed(2)),
        bottom: Number(r.bottom.toFixed(2)),
        width: Number(r.width.toFixed(2)),
        height: Number(r.height.toFixed(2)),
      }
    }
    const text = (node) => (node ? (node.innerText || node.textContent || '').trim() : '')
    // Resolve the shell business-primary token to its used colour once per read.
    const tokenProbe = document.createElement('span')
    tokenProbe.setAttribute('style', 'position:fixed;left:-9999px;top:0;color:var(--dsw-alias-state-business-primary)')
    document.body.appendChild(tokenProbe)
    const businessColor = getComputedStyle(tokenProbe).color
    tokenProbe.remove()
    const childRows = [...document.querySelectorAll('.psd-child')]
    const rows = [...document.querySelectorAll('.psd-run')].map((row) => {
      const pinButton = row.querySelector('.psd-run-pin')
      const slot = row.querySelector('.psd-run-pin-slot')
      const titleElement = row.querySelector('.psd-run-title')
      const openButton = row.querySelector('.psd-run-open')
      const head = row.querySelector('.psd-run-head')
      const buttonStyle = pinButton === null ? null : getComputedStyle(pinButton)
      const svg = pinButton === null ? null : pinButton.querySelector('svg')
      const path = svg === null ? null : svg.querySelector('path')
      const order = [head, slot, openButton].filter((element) => element !== null)
      let ordered = order.length === 3
      for (let index = 1; index < order.length && ordered; index += 1) {
        ordered = Boolean(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING)
      }
      const titleRect = rect(titleElement)
      return {
        title: text(titleElement),
        state: row.getAttribute('data-state'),
        titleLeft: titleRect === null ? null : titleRect.left,
        titleTop: titleRect === null ? null : titleRect.top,
        titleClipped: titleElement !== null && titleElement.getAttribute('data-clipped') === 'true',
        rowRect: rect(row),
        hovered: row.matches(':hover'),
        focusWithin: row.matches(':focus-within'),
        pinned: row.getAttribute('data-pinned'),
        rowBackground: getComputedStyle(row).backgroundColor,
        hasSlot: slot !== null,
        slotPinned: slot === null ? null : slot.getAttribute('data-pinned'),
        slotWidth: slot === null ? null : Number(slot.getBoundingClientRect().width.toFixed(2)),
        slotRect: rect(slot),
        headRect: rect(head),
        headChildCount: head === null ? 0 : head.children.length,
        headFirstChildWidth: head === null || head.firstElementChild === null
          ? null
          : Number(head.firstElementChild.getBoundingClientRect().width.toFixed(2)),
        gapHeadToSlot: head === null || slot === null
          ? null
          : Number((slot.getBoundingClientRect().left - head.getBoundingClientRect().right).toFixed(2)),
        orderHeadSlotTitle: ordered,
        hasPinButton: pinButton !== null,
        buttonPinned: pinButton === null ? null : pinButton.getAttribute('data-pinned'),
        ariaPressed: pinButton === null ? null : pinButton.getAttribute('aria-pressed'),
        ariaLabel: pinButton === null ? null : pinButton.getAttribute('aria-label'),
        titleAttr: pinButton === null ? null : pinButton.getAttribute('title'),
        opacity: buttonStyle === null ? null : buttonStyle.opacity,
        visibility: buttonStyle === null ? null : buttonStyle.visibility,
        pointerEvents: buttonStyle === null ? null : buttonStyle.pointerEvents,
        color: buttonStyle === null ? null : buttonStyle.color,
        buttonRect: rect(pinButton),
        svgCount: pinButton === null ? 0 : pinButton.querySelectorAll('svg').length,
        svgPathCount: pinButton === null ? 0 : pinButton.querySelectorAll('svg path').length,
        svgIcon: svg === null ? null : svg.getAttribute('data-icon'),
        svgUseHref: svg === null || svg.querySelector('use') === null
          ? null
          : (svg.querySelector('use').getAttribute('href') || svg.querySelector('use').getAttribute('xlink:href')),
        buttonHtml: pinButton === null ? null : String(pinButton.innerHTML || '').slice(0, 260),
        pathD: path === null ? null : String(path.getAttribute('d') || '').slice(0, 120),
        pathFill: path === null ? null : getComputedStyle(path).fill,
      }
    })
    const childPinCount = childRows.reduce((count, child) =>
      count + child.querySelectorAll('.psd-run-pin, .psd-run-pin-slot, [data-pinned]').length, 0)
    const childPinSamples = []
    for (const child of childRows) {
      for (const node of child.querySelectorAll('.psd-run-pin, .psd-run-pin-slot, [data-pinned]')) {
        if (childPinSamples.length >= 8) break
        childPinSamples.push(String(node.className || node.tagName))
      }
    }
    const childRowsWithPinAttr = childRows.filter((child) => child.querySelector('[data-pinned]') !== null).length
    return {
      businessColor,
      rows,
      mainRows: rows.length,
      childRows: childRows.length,
      childPinCount,
      childPinSamples,
      childRowsWithPinAttr,
      pinnedCount: rows.filter((row) => row.pinned === 'true').length,
    }
  },

  /** The card's current-Session atmosphere row (parent or nested child). */
  currentCardRow: () => {
    const rectOf = (element) => {
      const r = element.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const row = document.querySelector('.psd-run-current, .psd-child-current')
    if (row === null) return null
    const kind = row.classList.contains('psd-run-current') ? 'parent' : 'child'
    const main = row.querySelector(kind === 'parent' ? '.psd-run-main' : '.psd-child-main')
    const atmos = row.querySelector('.psd-atmos')
    const pin = row.querySelector('.psd-run-pin')
    const titleNode = row.querySelector('.psd-run-title, .psd-child-title')
    return {
      kind,
      title: (titleNode ? (titleNode.innerText || '') : '').trim(),
      pinned: row.getAttribute('data-pinned'),
      hovered: row.matches(':hover'),
      rowBackground: getComputedStyle(row).backgroundColor,
      mainBackground: main === null ? null : getComputedStyle(main).backgroundColor,
      atmos: atmos === null
        ? { present: false }
        : {
            present: true,
            kind: atmos.getAttribute('data-psd-atmos'),
            opacity: getComputedStyle(atmos).opacity,
            canvas: atmos.querySelector('canvas.psd-atmos-canvas') !== null
          },
      pin: pin === null
        ? null
        : {
            opacity: getComputedStyle(pin).opacity,
            visibility: getComputedStyle(pin).visibility,
            pointerEvents: getComputedStyle(pin).pointerEvents,
            rect: rectOf(pin)
          },
      contentFilters: [...row.children]
        .filter((child) => child instanceof HTMLElement && !child.classList.contains('psd-atmos'))
        .map((child) => {
          const style = getComputedStyle(child)
          return {
            className: String(child.className || ''),
            filter: style.filter,
            transition: style.transition,
            transitionProperty: style.transitionProperty,
            transitionDuration: style.transitionDuration
          }
        }),
      rect: rectOf(row)
    }
  },

  /** A plain card main row (no atmosphere) for the hover-affordance comparison. */
  ordinaryCardRow: () => {
    const rectOf = (element) => {
      const r = element.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const row = [...document.querySelectorAll('.psd-run')]
      .find((element) => !element.classList.contains('psd-run-current')
        && element.querySelector('.psd-atmos') === null
        && element.querySelector('.psd-run-title') !== null)
    if (row === undefined) return null
    const main = row.querySelector('.psd-run-main')
    return {
      title: (row.querySelector('.psd-run-title')?.innerText || '').trim(),
      pinned: row.getAttribute('data-pinned'),
      hovered: row.matches(':hover'),
      mainBackground: main === null ? null : getComputedStyle(main).backgroundColor,
      rowBackground: getComputedStyle(row).backgroundColor,
      atmosPresent: row.querySelector('.psd-atmos') !== null,
      contentFilters: [...row.children]
        .filter((child) => child instanceof HTMLElement && !child.classList.contains('psd-atmos'))
        .map((child) => {
          const style = getComputedStyle(child)
          return { className: String(child.className || ''), filter: style.filter }
        }),
      rect: rectOf(row)
    }
  },

  /** The native sidebar current Session/Workspace atmosphere rows + an ordinary control row. */
  nativeCurrentAtmosphereRows: () => {
    const rectOf = (element) => {
      const r = element.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const facts = (row) => {
      if (row === null) return null
      const atmos = row.querySelector('.psd-atmos')
      return {
        key: row.getAttribute('data-row-key'),
        background: getComputedStyle(row).backgroundColor,
        hovered: row.matches(':hover'),
        atmosPresent: atmos !== null,
        atmosCanvas: atmos === null ? false : atmos.querySelector('canvas.psd-atmos-canvas') !== null,
        contentFilters: [...row.children]
          .filter((child) => child instanceof HTMLElement && !child.classList.contains('psd-atmos') && !child.hasAttribute('data-psd-atmos'))
          .map((child) => {
            const style = getComputedStyle(child)
            return {
              className: String(child.className || ''),
              filter: style.filter,
              transition: style.transition,
              transitionProperty: style.transitionProperty,
              transitionDuration: style.transitionDuration
            }
          }),
        rect: rectOf(row)
      }
    }
    const sessionId = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null
    const sessionRow = sessionId === null ? null : document.querySelector(`[data-row-key="session:${sessionId}"]`)
    const workspaceRow = document.querySelector('[data-psd-current-workspace="true"]')
    return {
      sessionId,
      session: facts(sessionRow),
      workspace: facts(workspaceRow)
    }
  },

  /** Small read of the dynamic-Workspaces live test seam (id/title/state + pin state). */
  liveSnapshot: () => {
    const seam = globalThis.__POWER_SUITE_TEST_HOOKS__?.dynamicWorkspacesLive
    if (seam === null || seam === undefined || typeof seam.snapshot !== 'function') {
      return { ok: false, reason: 'dynamicWorkspacesLive.snapshot is unavailable' }
    }
    try {
      const snapshot = seam.snapshot()
      return {
        ok: true,
        currentSessionId: snapshot.currentSessionId ?? null,
        rows: Array.isArray(snapshot.rows)
          ? snapshot.rows.map((row) => ({ id: row.id, title: row.title ?? null, state: row.state ?? null }))
          : [],
        pinnedIds: Array.isArray(snapshot.pinnedIds) ? [...snapshot.pinnedIds] : null,
        pinShared: snapshot.pinShared === true,
        pinSupported: typeof snapshot.pinSupported === 'boolean' ? snapshot.pinSupported : null,
      }
    } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
  },

  /** The card's own client-side pin document (`DW_PIN_KEY` localStorage). */
  pinDocument: () => {
    try {
      return { ok: true, raw: window.localStorage.getItem('power-suite.dynamic-workspaces.pinned') }
    } catch (error) {
      return { ok: false, raw: null, reason: String((error && error.message) || error) }
    }
  },

  /** Session summaries from the live `ctx.sessions` list (title/updatedAt cross-check). */
  sessionSummaries: () => {    const panel = document.querySelector('.psd-panel')
    if (panel === null) return { ok: false, reason: 'no .psd-panel' }
    const fiberKey = Object.keys(panel).find((key) => key.startsWith('__reactFiber$'))
    if (fiberKey === undefined) return { ok: false, reason: 'no react fiber on .psd-panel' }
    let fiber = panel[fiberKey]
    let sessions = null
    for (let index = 0; index < 80 && fiber !== null && fiber !== undefined; index += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps
      if (props === null || typeof props !== 'object') continue
      if (sessions === null && props.parentSessions !== null && typeof props.parentSessions === 'object'
        && typeof props.parentSessions.refreshProjections === 'function') {
        sessions = props.parentSessions
      }
    }
    if (sessions === null) return { ok: false, reason: 'ctx.sessions not found on the fiber chain' }
    const snapshot = sessions.list !== null && sessions.list !== undefined && typeof sessions.list.getSnapshot === 'function'
      ? sessions.list.getSnapshot()
      : null
    if (snapshot === null) return { ok: false, reason: 'session list snapshot unavailable' }
    const summaries = {}
    for (const id of snapshot.ids ?? []) {
      const summary = snapshot.byId?.[id]
      summaries[id] = summary === undefined
        ? null
        : {
            displayTitle: summary.displayTitle ?? null,
            updatedAt: typeof summary.updatedAt === 'number' && Number.isFinite(summary.updatedAt) ? summary.updatedAt : null,
            blank: summary.blank === true,
            origin: summary.origin ?? null,
          }
    }
    return { ok: true, ids: [...(snapshot.ids ?? [])], summaries }
  },
}

/**
 * Classify one hover-card figure section title into its contract category.
 * @param {string} title - rendered section title.
 * @returns {string} `stats` | `usage` | `context` | `other:<title>`.
 */
function sectionCategory(title) {
  if (/^(Session statistics|会话统计)$/.test(title)) return 'stats'
  if (/^(Token usage|Token 用量)$/.test(title)) return 'usage'
  if (/^\d+% of context used$/.test(title) || /^上下文已用 \d+%$/.test(title)) return 'context'
  return `other:${title}`
}

/**
 * Assert a hover card renders the contract's three figure sections with non-empty
 * titles and headline values.
 * @param {Array<object>} sections - measured sections (title/value/rows).
 * @param {string} label - assertion label.
 * @returns {string[]} section categories in DOM order.
 */
function assertSectionTitlesAndValues(sections, label) {
  assertEqual(sections.length, 3, `${label}: expected exactly three figure sections, got ${JSON.stringify(sections.map((section) => section.title))}`)
  for (const section of sections) {
    assert(section.title.length > 0, `${label}: a figure section has an empty title`)
    assert(section.value.length > 0, `${label}: figure section "${section.title}" has an empty headline value`)
    assertFigureRows(section, label)
  }
  const categories = sections.map((section) => sectionCategory(section.title))
  for (const expected of ['stats', 'usage', 'context']) {
    assert(categories.includes(expected), `${label}: missing the ${expected} figure section (titles ${JSON.stringify(sections.map((section) => section.title))})`)
  }
  assertEqual(new Set(categories).size, 3, `${label}: duplicate or unknown figure sections (${JSON.stringify(sections.map((section) => section.title))})`)
  return categories
}

/**
 * A figure section must expose at least its label/value rows (the native card shape).
 * @param {object} section - measured section.
 * @param {string} label - assertion label.
 * @returns {void}
 */
function assertFigureRows(section, label) {
  assert(Array.isArray(section.rows) && section.rows.length >= 1, `${label}: section "${section.title}" has no label/value rows`)
  for (const row of section.rows) {
    assert(row.key.length > 0, `${label}: section "${section.title}" has a row with an empty label`)
    assert(row.value.length > 0, `${label}: section "${section.title}" has a row with an empty value`)
  }
}

/**
 * @param {string} colour - computed CSS colour (`rgb(...)`/`rgba(...)`).
 * @returns {{ r: number, g: number, b: number } | null} parsed channels.
 */
function parseColour(colour) {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(colour || ''))
  return match === null ? null : { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
}

/**
 * @param {string} colour - computed CSS colour.
 * @returns {boolean} whether the colour reads as a violet/blue accent.
 */
function isVioletOrBlue(colour) {
  const rgb = parseColour(colour)
  if (rgb === null) return false
  return rgb.b >= 80 && rgb.b >= rgb.g + 20 && rgb.b + 15 >= rgb.r
}

/**
 * Assert every non-atmosphere content child of an atmosphere row carries the requested
 * brightness filter (the follow-up affordance that replaces the stacked background).
 * @param {object} facts - row facts with `contentFilters`.
 * @param {string} expected - expected computed filter (`brightness(...)` or `none`).
 * @param {string} label - assertion label.
 * @param {object} [options] - `expectTransition` for the 140 ms filter transition.
 * @returns {void}
 */
function assertContentBrightness(facts, expected, label, { expectTransition = false } = {}) {
  assert(facts !== null, `${label}: row facts are missing`)
  assert(Array.isArray(facts.contentFilters) && facts.contentFilters.length > 0,
    `${label}: no non-atmosphere content children were measured`)
  for (const child of facts.contentFilters) {
    assertEqual(child.filter, expected,
      `${label}: content child "${short(child.className, 40)}" filter must be ${expected} (got ${child.filter})`)
    if (expectTransition) {
      const transitionText = `${child.transition} ${child.transitionProperty} ${child.transitionDuration}`
      assert(/filter/.test(transitionText) && /0\.14s|140ms/.test(transitionText),
        `${label}: content child "${short(child.className, 40)}" must transition its filter (140 ms; got "${short(transitionText, 120)}")`)
    }
  }
}

// ---- native-sidebar helpers ----------------------------------------------------------------

/**
 * Expand the first collapsed native Workspace row (the fresh profile starts collapsed).
 * @returns {Promise<boolean>} whether one collapsed Workspace row was expanded.
 */
async function expandNativeWorkspaceRow(page) {
  const scrolled = await page.eval(() => {
    const tree = document.querySelector('[role="tree"]')
    if (tree === null) return false
    const collapsed = [...tree.querySelectorAll('[data-row-key^="workspace:"]')]
      .filter((element) => element.getAttribute('aria-expanded') === 'false' && element.getBoundingClientRect().height > 0)
    if (collapsed.length === 0) return false
    collapsed[0].scrollIntoView({ block: 'center' })
    return true
  })
  if (!scrolled) return false
  await sleep(260)
  const point = await page.eval(() => {
    const tree = document.querySelector('[role="tree"]')
    const collapsed = [...(tree === null ? [] : tree.querySelectorAll('[data-row-key^="workspace:"]'))]
      .filter((element) => element.getAttribute('aria-expanded') === 'false' && element.getBoundingClientRect().height > 0)
    const element = collapsed[0]
    if (element === undefined) return null
    const rect = element.getBoundingClientRect()
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  })
  if (point === null || point.x <= 0 || point.y <= 0 || point.x >= VIEWPORT.width || point.y >= VIEWPORT.height) return false
  await page.clickAt(point.x, point.y)
  await sleep(450)
  return true
}

/**
 * Make at least `target` native sidebar session rows visible.
 * @param {number} target - wanted visible session-row count.
 * @returns {Promise<Array<object>>} visible native session rows.
 */
async function ensureNativeSessionRowsVisible(page, target = 4) {
  const read = () => page.eval(probePin.nativeRows)
  let rows = await read()
  for (let pass = 0; pass < 9 && rows.length < target; pass += 1) {
    if (!(await expandNativeWorkspaceRow(page))) break
    rows = await read()
  }
  if (rows.length < target) {
    await page.eval(() => {
      const tree = document.querySelector('[role="tree"]')
      if (tree !== null) tree.scrollTop = tree.scrollHeight
    })
    await sleep(400)
    rows = await read()
  }
  return rows
}

/**
 * Scroll one native session row into view, expanding collapsed Workspace rows as needed.
 * @param {string} sessionId - target Session id.
 * @param {object} [options] - probe options.
 * @returns {Promise<object | null>} the visible row, or null.
 */
async function ensureNativeRowForSession(page, sessionId, { attempts = 10 } = {}) {
  const selector = `[data-row-key="session:${sessionId}"]`
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await page.eval((sel) => {
      const row = document.querySelector(sel)
      if (row === null) return { present: false }
      row.scrollIntoView({ block: 'center' })
      const rect = row.getBoundingClientRect()
      return {
        present: true,
        key: row.getAttribute('data-row-key'),
        rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
        visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight,
      }
    }, selector)
    if (state.present && state.visible) {
      await page.moveTo(900, 500)
      await sleep(220)
      return state
    }
    if (state.present) {
      await sleep(320)
      continue
    }
    if (!(await expandNativeWorkspaceRow(page))) {
      await page.eval(() => {
        const tree = document.querySelector('[role="tree"]')
        if (tree !== null) tree.scrollTop = tree.scrollHeight
      })
      await sleep(380)
    }
  }
  return null
}

/**
 * Move the real pointer onto one native sidebar session row.
 * @param {object} row - row facts with `key`.
 * @returns {Promise<object>} the hover point.
 */
async function hoverNativeSessionRow(page, row) {
  await page.moveTo(900, 500)
  await sleep(320)
  const point = await page.eval((key) => {
    const element = document.querySelector(`[data-row-key="${key}"]`)
    if (element === null) return null
    element.scrollIntoView({ block: 'center' })
    const rect = element.getBoundingClientRect()
    return {
      x: Math.round(rect.left + Math.min(80, Math.max(24, rect.width * 0.4))),
      y: Math.round(rect.top + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  }, row.key)
  assert(point !== null, `native row ${row.key} disappeared before the hover`)
  assert(point.y > 4 && point.y < VIEWPORT.height - 4, `native row ${row.key} is outside the viewport (y=${point.y})`)
  await page.moveTo(point.x, point.y)
  return point
}

/**
 * Hover a native sidebar session row and wait for the shell's hover card.
 * @param {object} row - row facts with `key`.
 * @param {object} [options] - retry/timeout options.
 * @returns {Promise<object | null>} the measured native card, or null.
 */
async function openNativeHoverCard(page, row, { attempts = 2, timeoutMs = 4000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await hoverNativeSessionRow(page, row)
    } catch {
      await sleep(300)
      continue
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await sleep(140)
      const card = await page.eval(probePin.nativeCard)
      if (card !== null) return card
    }
    await page.moveTo(900, 500)
    await sleep(250)
  }
  return null
}

// ---- running-card helpers ------------------------------------------------------------------

/**
 * @returns {Promise<Array<object>>} running-card main-row pin facts.
 */
async function readCardPinState(page) {
  const state = await page.eval(probePin.cardPinState)
  assert(state !== null && Array.isArray(state.rows), 'the card pin probe returned no rows')
  return state
}

/**
 * Read the card's own pin document from localStorage.
 * @returns {Promise<{ ok: boolean, raw: string | null, reason?: string }>} the raw document.
 */
async function readPinDocument(page) {
  try {
    return await page.eval(probePin.pinDocument)
  } catch (error) {
    return { ok: false, raw: null, reason: (error && error.message) || String(error) }
  }
}

/**
 * Read the native sidebar row's pin-marker state for one Session (expanding/scrolling as needed).
 * @param {string} sessionId - target Session id.
 * @returns {Promise<object | null>} the native row state, or null when not reachable.
 */
async function readNativePinState(page, sessionId) {
  try {
    const row = await ensureNativeRowForSession(page, sessionId)
    if (row === null) return null
    const state = await page.eval(probePin.nativeRowState, sessionId)
    return state !== null && state.found === true ? state : null
  } catch {
    return null
  }
}

/**
 * Read the documented Host-shared pin document directly from the page (same-origin
 * authenticated GET `/api/power-suite.session-pins`). `ok:false`/`status:404` means the
 * running Host process does not serve the merged route yet (pre service restart).
 * @param {object} page - Page wrapper.
 * @returns {Promise<{ ok: boolean, status: number | null, doc?: object | null, error?: string }>} the read.
 */
async function readHostPinDocument(page) {
  try {
    return await page.eval(async () => {
      try {
        const response = await fetch('/api/power-suite.session-pins', {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        let payload = null
        try {
          payload = await response.json()
        } catch {
          payload = null
        }
        return { ok: response.ok, status: response.status, doc: payload }
      } catch (error) {
        return { ok: false, status: null, error: String((error && error.message) || error) }
      }
    })
  } catch (error) {
    return { ok: false, status: null, error: String((error && error.message) || error) }
  }
}

/**
 * Parse the client's pin cache document
 * (`power-suite.dynamic-workspaces.pinned`: `{version, rev, pinned, pending, migrated}`).
 * @param {string | null} raw - localStorage value.
 * @returns {object | null} normalized cache state, or null when absent/corrupt.
 */
function parsePinCache(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const value = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    return {
      version: value.version ?? null,
      rev: typeof value.rev === 'number' && Number.isFinite(value.rev) && value.rev >= 0 ? Math.floor(value.rev) : 0,
      pinned: Array.isArray(value.pinned) ? value.pinned.filter((id) => typeof id === 'string' && id.length > 0) : [],
      pending: Array.isArray(value.pending)
        ? value.pending.filter((entry) => entry !== null && typeof entry === 'object'
          && (entry.op === 'pin' || entry.op === 'unpin')
          && typeof entry.id === 'string' && entry.id.length > 0)
        : [],
      migrated: value.migrated === true
    }
  } catch {
    return null
  }
}

/**
 * The card's effective pin ids as painted (Host document + queued local ops).
 * @param {object} page - Page wrapper.
 * @returns {Promise<string[] | null>} effective ids, or null when the seam is missing.
 */
async function readEffectivePins(page) {
  const live = await readLiveSnapshot(page)
  return live.ok && Array.isArray(live.pinnedIds) ? [...live.pinnedIds] : null
}

/**
 * Poll the card's effective pin ids until a predicate holds.
 * @param {object} page - Page wrapper.
 * @param {Function} predicate - receives the id array.
 * @param {object} [options] - timeout/interval/label.
 * @returns {Promise<string[]>} the matching ids.
 */
async function waitForEffectivePins(page, predicate, { timeout = 10000, interval = 150, label = 'effective card pin ids' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const ids = await readEffectivePins(page)
    if (ids !== null) {
      last = ids
      if (predicate(ids)) return ids
    }
    await sleep(interval)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label} (last effective ids ${short(JSON.stringify(last), 240)})`)
}

/**
 * Whether the cache records the id (confirmed set or queued pin op).
 * @param {object | null} cache - parsed cache state.
 * @param {string} sessionId - target Session id.
 * @returns {boolean} whether the local cache explains the pin.
 */
function cacheHasPin(cache, sessionId) {
  if (cache === null) return false
  return cache.pinned.includes(sessionId) || cache.pending.some((entry) => entry.op === 'pin' && entry.id === sessionId)
}

/**
 * The ids the cache would paint: confirmed set with the queued operations replayed.
 * This is the same rule the client's `dwPinEffectiveIds` uses.
 * @param {object | null} cache - parsed cache state.
 * @returns {Set<string>} effective pinned ids.
 */
function cacheEffectiveIds(cache) {
  const ids = new Set(cache === null ? [] : cache.pinned)
  if (cache !== null) {
    for (const entry of cache.pending) {
      if (entry.op === 'pin') ids.add(entry.id)
      else if (entry.op === 'unpin') ids.delete(entry.id)
    }
  }
  return ids
}

/**
 * Open the GUI in a SECOND fresh throwaway Chrome profile and run `fn` against it, then
 * always terminate that browser and delete its profile. Used for the cross-device proof:
 * the second profile shares only the Host, so any pin seen there is Host-shared state.
 * @param {string} url - token GUI URL (redacted in logs).
 * @param {string} clientSource - this worktree's client source to inject.
 * @param {Function} fn - receives the second page wrapper.
 * @returns {Promise<*>} the callback result.
 */
async function withSecondProfile(url, clientSource, fn) {
  let chrome = null
  let page = null
  try {
    chrome = await launchChrome({ headful: false })
    log(`cross-device: second fresh Chrome profile pid ${chrome.proc.pid}, CDP port ${chrome.port}`)
    const cdp = await CdpConnection.connect(chrome.wsUrl)
    page = await Page.open(cdp, url, injectorSource(clientSource))
    await ensureAppReady(page)
    return await fn(page)
  } finally {
    if (page !== null) page.dispose()
    if (chrome !== null) await chrome.close()
  }
}

/**
 * @returns {Promise<object>} the dynamic-Workspaces live seam snapshot (never throws).
 */
async function readLiveSnapshot(page) {
  try {
    return await page.eval(probePin.liveSnapshot)
  } catch (error) {
    return { ok: false, reason: (error && error.message) || String(error) }
  }
}

/**
 * @param {string} title - exact row title.
 * @returns {Promise<Array<string>>} current running-card main-row titles in DOM order.
 */
async function mainRowTitles(page) {
  return page.eval(() => [...document.querySelectorAll('.psd-run-title')]
    .map((element) => (element.innerText || '').trim())
    .filter((text) => text.length > 0))
}

/**
 * Hover one element by CSS selector with a real CDP pointer, scrolling it into view
 * first (the native tree is virtualized/collapsible; scrollIntoView reveals it like a
 * user would).
 * @param {string} selector - target selector.
 * @returns {Promise<object>} the hover point.
 */
async function hoverSelector(page, selector) {
  for (let attempt = 0; attempt < PIN_ROW_ATTEMPTS; attempt += 1) {
    await resetPointer(page)
    const revealed = await page.eval((sel) => {
      const element = document.querySelector(sel)
      if (element === null) return false
      element.scrollIntoView({ block: 'center', behavior: 'instant' })
      return true
    }, selector).catch(() => false)
    if (!revealed) {
      await sleep(250)
      continue
    }
    await sleep(160)
    const point = await page.eval((sel) => {
      const element = document.querySelector(sel)
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: Math.round(rect.left + Math.min(60, Math.max(16, rect.width * 0.35))),
        y: Math.round(rect.top + rect.height / 2)
      }
    }, selector).catch(() => null)
    if (point === null) {
      await sleep(250)
      continue
    }
    await page.moveTo(point.x, point.y)
    await sleep(160)
    const hovered = await page.eval((sel) => {
      const element = document.querySelector(sel)
      return element === null ? false : element.matches(':hover')
    }, selector).catch(() => false)
    if (hovered) return point
    debugLog(`hoverSelector "${selector}" pointer at ${point.x},${point.y} did not hover`)
  }
  throw new Error(`could not hover "${short(selector, 80)}" (the element is clipped/virtualized or the pointer did not land)`)
}

/** Blur the focused element and park the pointer away from rows/cards. */
async function resetPointer(page) {
  try {
    await page.eval(() => {
      const active = document.activeElement
      if (active !== null && typeof active.blur === 'function') active.blur()
    })
  } catch {
    /* the page may be mid-reload */
  }
  await page.moveTo(900, 500)
  await sleep(380)
}

/**
 * Hover one running-card main row identified by its exact title (retries on live re-sorts).
 * @param {string} title - exact row title.
 * @returns {Promise<object>} the hover point.
 */
async function hoverMainRowByTitle(page, title) {
  for (let attempt = 0; attempt < PIN_ROW_ATTEMPTS; attempt += 1) {
    await resetPointer(page)
    // The expanded card scrolls internally (the panel has a 560 px clamp), so the row y
    // can be inside the viewport while the row itself is clipped by the panel body.
    // Always scroll it to the panel's centre first, then measure the real pointer point.
    const scrolled = await page.eval((rowTitle) => {
      const row = [...document.querySelectorAll('.psd-run')]
        .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === rowTitle)
      if (row === undefined) return false
      row.scrollIntoView({ block: 'center', behavior: 'instant' })
      return true
    }, title).catch(() => false)
    if (!scrolled) {
      await sleep(250)
      continue
    }
    await sleep(160)
    const target = await page.eval((rowTitle) => {
      const row = [...document.querySelectorAll('.psd-run')]
        .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === rowTitle)
      if (row === undefined) return null
      const rect = row.getBoundingClientRect()
      const titleRect = row.querySelector('.psd-run-title')?.getBoundingClientRect() ?? rect
      // The clickable body: prefer a point inside the title button, fall back to the pill.
      const title = row.querySelector('.psd-run-open')?.getBoundingClientRect() ?? titleRect
      return {
        x: Math.round(title.left + Math.min(30, Math.max(8, title.width / 2))),
        y: Math.round(rect.top + rect.height / 2),
        rowTop: Math.round(rect.top),
        rowBottom: Math.round(rect.bottom),
        rowLeft: Math.round(rect.left),
      }
    }, title).catch(() => null)
    if (target === null) {
      await sleep(250)
      continue
    }
    const visible = await page.eval(() => {
      const panel = document.querySelector('.psd-panel')
      if (panel === null) return null
      const body = panel.querySelector('.psd-panel-body') ?? panel
      const rect = body.getBoundingClientRect()
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) }
    })
    const outsidePanel = visible !== null &&
      (target.y < visible.top || target.y > visible.bottom || target.x < visible.left || target.x > visible.right)
    if (outsidePanel || target.y <= 4 || target.y >= VIEWPORT.height - 4) {
      await sleep(250)
      continue
    }
    await page.moveTo(target.x, target.y)
    await sleep(140)
    const hovered = await page.eval((rowTitle) => {
      const row = [...document.querySelectorAll('.psd-run')]
        .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === rowTitle)
      return row === undefined ? false : row.matches(':hover')
    }, title).catch(() => false)
    if (hovered) return target
    debugLog(`hoverMainRowByTitle "${short(title, 40)}" pointer at ${target.x},${target.y} did not hover (panel ${short(JSON.stringify(visible), 100)})`)
  }
  throw new Error(`could not hover the card main row "${short(title, 60)}" (the live list kept re-sorting or the row is clipped)`)
}

/**
 * Read one running-card row's pin facts; retries while the live list re-renders.
 * @param {string} title - exact row title.
 * @returns {Promise<{ state: object, row: object }>} the full probe and the matched row.
 */
async function readRowPinState(page, title) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await readCardPinState(page)
    const row = state.rows.find((candidate) => candidate.title === title)
    if (row !== undefined) return { state, row }
    await sleep(200)
  }
  throw new Error(`card main row "${short(title, 60)}" is not in the rendered card`)
}

/**
 * Poll one row's pin facts until a predicate holds.
 * @param {string} title - exact row title.
 * @param {Function} predicate - receives `(row, state)`.
 * @param {object} [options] - timeout/label.
 * @returns {Promise<{ state: object, row: object }>} the matching read.
 */
async function waitForRowPinState(page, title, predicate, { timeout = 2500, label = 'pin state' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const read = await readRowPinState(page, title).catch(() => null)
    if (read !== null) {
      last = read
      if (predicate(read.row, read.state)) return read
    }
    await sleep(90)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label} on "${short(title, 50)}" (last: ${short(JSON.stringify(last === null ? null : last.row), 400)})`)
}

/**
 * Pin or unpin one running-card row through its real hover-revealed pin button.
 * @param {string} title - exact row title.
 * @param {'pin' | 'unpin'} expected - required end state.
 * @returns {Promise<{ state: object, row: object }>} the read after the click.
 */
async function clickRowPin(page, title, expected) {
  const wantPinned = expected === 'pin'
  const isExpected = (row) => (row.pinned === 'true') === wantPinned
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // Idempotent start: if the Host round-trip from a previous attempt already landed,
    // do not click again (a second click would toggle the pin straight back).
    const before = await readRowPinState(page, title).catch(() => null)
    debugLog(`clickRowPin attempt ${attempt} "${short(title, 40)}" expected=${expected} before=${before === null ? 'row-missing' : `pinned=${before.row.pinned} hovered=${before.row.hovered} op=${before.row.opacity} pe=${before.row.pointerEvents}`}`)
    if (before !== null && isExpected(before.row)) return before
    try {
      await hoverMainRowByTitle(page, title)
    } catch (error) {
      debugLog(`clickRowPin hover failed: ${short((error && error.message) || String(error), 160)}`)
      await sleep(300)
      continue
    }
    try {
      await waitForRowPinState(page, title,
        (row) => row.hovered && row.opacity === '1' && row.visibility === 'visible' && row.pointerEvents === 'auto',
        { timeout: 2500, label: 'interactive pin button on hover' })
    } catch (error) {
      debugLog(`clickRowPin interactive wait failed: ${short((error && error.message) || String(error), 300)}`)
      await sleep(250)
      continue
    }
    const point = await page.eval((rowTitle) => {
      const row = [...document.querySelectorAll('.psd-run')]
        .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === rowTitle)
      const button = row === undefined ? null : row.querySelector('.psd-run-pin')
      if (button === null) return null
      const rect = button.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height) }
    }, title).catch(() => null)
    if (point === null || point.width <= 0 || point.height <= 0) {
      await sleep(250)
      continue
    }
    // Stable-geometry precondition: two consecutive identical rects immediately before
    // the real click (the live card can re-sort under the pointer between measure/click).
    const geometry = () => page.eval((rowTitle) => {
      const row = [...document.querySelectorAll('.psd-run')]
        .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === rowTitle)
      if (row === undefined) return null
      const rowRect = row.getBoundingClientRect()
      const button = row.querySelector('.psd-run-pin')
      if (button === null) return null
      const rect = button.getBoundingClientRect()
      return {
        rowTop: Math.round(rowRect.top),
        rowLeft: Math.round(rowRect.left),
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }, title).catch(() => null)
    const firstSample = await geometry()
    await sleep(160)
    const secondSample = await geometry()
    if (firstSample === null || secondSample === null ||
      firstSample.rowTop !== secondSample.rowTop || firstSample.rowLeft !== secondSample.rowLeft) {
      debugLog(`clickRowPin geometry not stable for "${short(title, 40)}": ${short(JSON.stringify(firstSample), 120)} -> ${short(JSON.stringify(secondSample), 120)}`)
      await sleep(200)
      continue
    }
    debugLog(`clickRowPin clicking at ${secondSample.x},${secondSample.y} (button ${secondSample.width}x${secondSample.height}, row ${secondSample.rowLeft},${secondSample.rowTop}) for "${short(title, 40)}"`)
    await page.clickAt(secondSample.x, secondSample.y)
    // The card pin writes the Host snapshot; the DOM flips only after the pushed
    // WorkspaceSnapshot arrives. Poll for the expected state instead of re-clicking, so
    // a slow Host round-trip cannot turn the retry into an accidental toggle-back.
    const deadline = Date.now() + 5000
    let after = null
    while (Date.now() < deadline) {
      await sleep(150)
      after = await readRowPinState(page, title).catch(() => null)
      if (after !== null && isExpected(after.row)) return after
    }
    const snapshotNow = await readLiveSnapshot(page)
    debugLog(`clickRowPin post-click state "${short(title, 40)}": ${after === null ? 'row-missing' : `pinned=${after.row.pinned} hovered=${after.row.hovered}`}; hostPins=${snapshotNow.ok ? short(JSON.stringify(snapshotNow.pinnedIds), 200) : 'n/a'}`)
    await sleep(200)
  }
  throw new Error(`could not ${expected} the card row "${short(title, 60)}" through its pin button (the click did not land or the live list re-sorted)`)
}

/**
 * Resolve one card row's Session id through the live seat seam (or the session list).
 * @param {string} title - exact row title.
 * @returns {Promise<{ id: string | null, source: string }>} resolved id.
 */
async function sessionIdByTitle(page, title) {
  const snapshot = await readLiveSnapshot(page)
  if (snapshot.ok) {
    const match = (snapshot.rows ?? []).find((row) => row.title === title && typeof row.id === 'string')
    if (match !== undefined) return { id: match.id, source: 'dynamicWorkspacesLive seam' }
  }
  const summaries = await page.eval(probePin.sessionSummaries).catch(() => null)
  if (summaries !== null && summaries.ok) {
    for (const [id, entry] of Object.entries(summaries.summaries)) {
      if (entry !== null && entry.displayTitle === title) return { id, source: 'session list' }
    }
  }
  return { id: null, source: 'unresolved' }
}

/**
 * Pick a pin target from the live card: prefer finished (`data-state="done"`) rows whose
 * activity is stable, never the current Session (the harness itself runs inside it and its
 * row keeps re-sorting), and skip titles already used by the run.
 * @param {object} page - Page wrapper.
 * @param {object} [options] - `excludeTitles` already-pinned target titles.
 * @returns {Promise<object>} `{ ordered, currentTitle }` (done rows first).
 */
async function choosePinTargets(page, { excludeTitles = [] } = {}) {
  const pin = await readCardPinState(page)
  const live = await readLiveSnapshot(page)
  const currentId = live.ok ? live.currentSessionId : null
  const currentTitle = live.ok && currentId !== null
    ? (live.rows ?? []).find((row) => row.id === currentId)?.title ?? null
    : null
  const excluded = new Set([...excludeTitles, ...(currentTitle === null ? [] : [currentTitle])])
  const unpinned = pin.rows.filter((row) => row.pinned !== 'true' && row.title.length > 0 && !excluded.has(row.title))
  const done = unpinned.filter((row) => row.state === 'done')
  const running = unpinned.filter((row) => row.state !== 'done')
  debugLog(`choosePinTargets: ${pin.rows.length} rows, ${done.length} done, ${running.length} running/other, current="${short(currentTitle ?? 'n/a', 40)}", excluded=${short(JSON.stringify([...excluded]), 120)}`)
  return { ordered: [...done, ...running], currentTitle, doneCount: done.length, runningCount: running.length }
}

/**
 * Resolve the live title of a tracked Session id (the card may re-sort across reloads).
 * @param {string} sessionId - tracked Session id.
 * @returns {Promise<string | null>} the current display title, or null.
 */
async function titleForRunId(page, sessionId) {
  const live = await readLiveSnapshot(page)
  if (live.ok) {
    const row = (live.rows ?? []).find((candidate) => candidate.id === sessionId)
    if (row !== undefined && typeof row.title === 'string' && row.title.length > 0) return row.title
  }
  return null
}

/**
 * Capture a viewport-clamped close-up PNG for evidence.
 * @param {string} name - file name without extension.
 * @param {object} clip - raw clip box (may exceed the viewport).
 * @returns {Promise<string | null>} the written path, or null when too small.
 */
async function writeClipShot(page, name, clip) {
  const x = Math.max(0, Math.round(clip.x))
  const y = Math.max(0, Math.round(clip.y))
  const width = Math.min(Math.round(clip.width), VIEWPORT.width - x)
  const height = Math.min(Math.round(clip.height), VIEWPORT.height - y)
  if (width < 8 || height < 8) return null
  await mkdir(SHOTS_DIR, { recursive: true })
  const file = path.join(SHOTS_DIR, `${name}.png`)
  await page.screenshot(file, { x, y, width, height })
  log(`wrote ${file}`)
  return file
}

/**
 * Unpin every Session this run pinned, through the real UI, and record the residual
 * card pin document / native sidebar state honestly.
 * @returns {Promise<void>}
 */
async function cleanupPinnedSessions(page, state) {
  if (state.mode !== 'pin') return
  const issues = []
  try {
    await ensurePanelRows(page).catch(() => 0)
    for (const entry of [...(state.pinned ?? [])].reverse()) {
      try {
        // Resolve the row title from the tracked Session id (the card may have re-sorted).
        const title = (await titleForRunId(page, entry.id)) ?? entry.title
        const pinnedNow = () => page.eval((rowTitle) => [...document.querySelectorAll('.psd-run')]
          .some((row) => ((row.querySelector('.psd-run-title')?.innerText ?? '').trim()) === rowTitle && row.getAttribute('data-pinned') === 'true'), title).catch(() => false)
        if (!(await pinnedNow())) {
          log(`cleanup: id ${entry.id} ("${short(title, 48)}") is not a pinned card row any more; skipping UI unpin`)
          state.pinned = state.pinned.filter((item) => item.id !== entry.id)
          continue
        }
        await clickRowPin(page, title, 'unpin')
        state.pinned = state.pinned.filter((item) => item.id !== entry.id)
        log(`cleanup: unpinned id ${entry.id} ("${short(title, 48)}")`)
      } catch (error) {
        issues.push(`id ${entry.id} ("${short(entry.title, 40)}"): ${(error && error.message) || String(error)}`)
      }
    }
    const runIds = [state.pinTargetA?.id, state.pinTargetB?.id].filter((id) => typeof id === 'string')
    // Effective ids are the painted set (Host document + queued local ops).
    let effective = await readEffectivePins(page)
    if (effective !== null) {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline && runIds.some((id) => effective.includes(id))) {
        await sleep(250)
        effective = await readEffectivePins(page)
      }
    }
    const residual = effective === null ? null : runIds.filter((id) => effective.includes(id))
    const cacheRaw = (await readPinDocument(page)).raw
    const cache = parsePinCache(cacheRaw)
    const host = await readHostPinDocument(page)
    const hostPinned = host.ok && host.doc !== null && typeof host.doc === 'object' && Array.isArray(host.doc.pinned)
      ? host.doc.pinned
      : null
    const hostResidual = hostPinned === null ? null : runIds.filter((id) => hostPinned.includes(id))
    const nativeChecks = []
    for (const [label, entry] of [['A', state.pinTargetA], ['B', state.pinTargetB]]) {
      if (entry === undefined || typeof entry.nativePinCount !== 'number') continue
      const native = await readNativePinState(page, entry.id)
      nativeChecks.push({ label, id: entry.id, before: entry.nativePinCount, after: native === null ? null : native.pin.length })
    }
    const pinnedRowsLeft = await page.count('.psd-run[data-pinned="true"]')
    state.pinCleanup = {
      unpinned: (state.pinned ?? []).length === 0,
      issues,
      runIds,
      effectiveIds: effective,
      residual,
      cacheRaw,
      cacheEffectiveIds: [...cacheEffectiveIds(cache)],
      cachePending: cache === null ? null : cache.pending,
      cacheMigrated: cache === null ? null : cache.migrated,
      pinShared: state.pinShared === true,
      hostStatus: host.status ?? null,
      hostPinned,
      hostResidual,
      pinnedRowsLeft,
      nativePinChecks: nativeChecks
    }
    log(`cleanup: effective pins ${short(JSON.stringify(effective), 220)}; residual run pins ${short(JSON.stringify(residual), 120)}; pinned rows left ${pinnedRowsLeft}; cache effective ${short(JSON.stringify([...cacheEffectiveIds(cache)]), 160)}; cache ${short(cacheRaw, 220)}`)
    log(`cleanup: host route ${host.ok ? `ok pinned=${short(JSON.stringify(hostPinned), 200)}` : `unavailable (${host.status ?? host.error ?? 'unknown'})`}; host residual run pins ${short(JSON.stringify(hostResidual), 120)}`)
    log(`cleanup: native sidebar pin markers for run targets ${short(JSON.stringify(nativeChecks), 240)} (the card pin never touches the native pin)`)
    if (state.pinShared !== true) log('cleanup: pinShared=false — the local cache is authoritative; the Host route appears after the DSH Web service restart')
    if (issues.length > 0) log(`cleanup: ${issues.length} issue(s): ${short(issues.join('; '), 500)}`)
  } catch (error) {
    log(`cleanup error: ${short((error && error.message) || String(error), 400)}`)
    state.pinCleanup = { ...(state.pinCleanup ?? {}), cleanupError: (error && error.message) || String(error) }
  }
}

// ---------------------------------------------------------------------------------------------
// --pin checks
// ---------------------------------------------------------------------------------------------

async function runPinChecks({ page, results, state }) {
  log('\n=== --pin: hover dot / native figures / card-owned Host-shared pin ===')
  state.mode = 'pin'
  state.pinned = []
  state.pinShared = null

  await results.check('pin-net', 'CDP Network domain enabled (real network-failure oracle)', async () => {
    assert(page.networkEnabled === true, `Network.enable failed: ${page.networkError || 'unknown error'}`)
    return 'Network domain enabled; same-origin API/document failures are counted (the card pin route probes are classified separately)'
  })

  // `ensurePanelRows` also expands the five-row default through "View all" when present.
  await ensurePanelRows(page)
  await resetPointer(page)
  const baselineLive = await readLiveSnapshot(page)
  assertEqual(baselineLive.ok, true, `the dynamic-Workspaces live seat is unavailable: ${short(baselineLive.reason || 'unknown')}`)
  state.pinShared = baselineLive.pinShared === true
  const cacheRaw = (await readPinDocument(page)).raw
  const cache = parsePinCache(cacheRaw)
  const baselineRows = await readCardPinState(page)
  const baselinePinned = baselineRows.rows.filter((row) => row.pinned === 'true')
  const bridge = await page.eval(probe.projectionBridge).catch(() => null)
  const expectedChildren = bridge !== null && bridge.ok ? (bridge.children ?? []).length : 0
  const hostBaseline = await readHostPinDocument(page)
  const hostBaselinePinned = hostBaseline.ok && hostBaseline.doc !== null && typeof hostBaseline.doc === 'object' && Array.isArray(hostBaseline.doc.pinned)
    ? hostBaseline.doc.pinned
    : null
  state.pinBaseline = {
    pinShared: state.pinShared,
    effectiveIds: Array.isArray(baselineLive.pinnedIds) ? [...baselineLive.pinnedIds] : null,
    pinnedRows: baselinePinned.length,
    pinnedTitles: baselinePinned.map((row) => row.title),
    cacheRaw,
    cache,
    mainRows: baselineRows.rows.length,
    expectedChildren,
    domChildRows: await page.count('.psd-child'),
    hostStatus: hostBaseline.status ?? null,
    hostPinned: hostBaselinePinned,
    rowBackgrounds: Object.fromEntries(baselineRows.rows.map((row) => [row.title, row.rowBackground]))
  }
  log(`pin baseline: pinShared=${state.pinShared}; main rows ${baselineRows.rows.length}; dom children ${state.pinBaseline.domChildRows} (expected ${expectedChildren}); effective pins ${short(JSON.stringify(state.pinBaseline.effectiveIds), 160)}; card pinned rows ${baselinePinned.length}; cache ${short(cacheRaw, 220)}; host route ${hostBaseline.ok ? `ok pinned=${short(JSON.stringify(hostBaselinePinned), 160)}` : `unavailable (${hostBaseline.status ?? hostBaseline.error ?? 'unknown'})`}`)

  await results.check('r3-1', 'default card is the normal running/recent surface (zero prefilled pins, no tint, subagent children included)', async () => {
    assertEqual(baselinePinned.length, 0,
      `the default card must start with no pinned rows (found ${short(JSON.stringify(baselinePinned.map((row) => row.title)), 220)}; effective ids ${short(JSON.stringify(state.pinBaseline.effectiveIds), 120)})`)
    assertEqual(await page.count('.psd-run[data-pinned="true"]'), 0, 'no main row may carry data-pinned on the default card')
    assertEqual(await page.count('[data-pinned]'), 0, 'no card node may carry data-pinned on the default card (no default tint)')
    for (const row of baselineRows.rows) {
      assert(row.pinned !== 'true', `row "${short(row.title, 40)}" must not be pinned by default`)
    }
    // The user's old (native sidebar) pins must never surface as pinned card rows.
    const oldPinRows = baselineRows.rows.filter((row) => OLD_NATIVE_PIN_TITLES.some((title) => row.title.includes(title)))
    for (const row of oldPinRows) assert(row.pinned !== 'true', `old native-pin Session "${short(row.title, 40)}" must not be a pinned card row`)
    assert(baselineRows.rows.length > 0, 'the default card has no main rows')
    // The normal card keeps the running Session's subagent children.
    if (expectedChildren > 0) {
      const domChildren = await page.count('.psd-child')
      assert(domChildren > 0, `the default card must render the running Session's subagent child rows (expected ${expectedChildren}, found ${domChildren})`)
    }
    assertEqual(state.pinBaseline.effectiveIds === null ? 0 : state.pinBaseline.effectiveIds.length, 0,
      `the effective card pin set must be empty on the default card (got ${short(JSON.stringify(state.pinBaseline.effectiveIds), 160)})`)
    return `${baselineRows.rows.length} ordinary main rows, ${state.pinBaseline.domChildRows} child row(s) (expected ${expectedChildren}); 0 pinned rows/tint; effective pins []; ${oldPinRows.length} old native-pin title sample(s) present but never pinned; pinShared ${state.pinShared}`
  })

  await results.check('r3-2', 'main rows reserve the fixed 16 px pin slot; subagent child rows expose none; clipped-title glyph is not squeezed', async () => {
    await resetPointer(page)
    const pin = await readCardPinState(page)
    assert(pin.mainRows > 0, 'the "Running & recent" card has no main rows')
    assertEqual(pin.rows.filter((row) => row.hasSlot).length, pin.mainRows, 'every main row must reserve the pin slot')
    assertEqual(pin.rows.filter((row) => row.hasPinButton).length, pin.mainRows, 'every main row must render the pin button')
    for (const row of pin.rows) {
      assertNear(row.slotWidth, 16, 0.75, `row "${short(row.title, 40)}" pin slot must be 16 px wide (got ${row.slotWidth})`)
      assertEqual(row.orderHeadSlotTitle, true, `row "${short(row.title, 40)}" must order the glyph, the pin slot, then the title`)
      assertEqual(row.pinned, null, `row "${short(row.title, 40)}" must not be pinned during the scope check`)
      assertEqual(row.opacity, '0', `unpinned+not-hovered row "${short(row.title, 30)}" pin must be hidden (opacity ${row.opacity})`)
      assertEqual(row.visibility, 'hidden', `unpinned+not-hovered row "${short(row.title, 30)}" pin must be visibility:hidden (${row.visibility})`)
      assertEqual(row.pointerEvents, 'none', `unpinned+not-hovered row "${short(row.title, 30)}" pin must be pointer-events:none (${row.pointerEvents})`)
      assertEqual(row.ariaPressed, 'false', `unpinned row "${short(row.title, 30)}" pin must expose aria-pressed=false`)
    }
    assertEqual(pin.childPinCount, 0, `subagent child rows must expose no pin slot/button/attribute (found ${pin.childPinCount} pin-ish nodes in ${pin.childRows} child row(s))`)
    assertEqual(pin.childRowsWithPinAttr, 0, 'subagent child rows must not carry data-pinned')
    const squeezedCandidates = pin.rows.filter((row) => row.titleClipped && row.headChildCount === 1 && row.headRect !== null)
    let glyphGuard = 'no clipped-title main row was available for the glyph-squeeze guard'
    if (squeezedCandidates.length > 0) {
      for (const row of squeezedCandidates) {
        assert(row.headFirstChildWidth !== null, `clipped-title row "${short(row.title, 40)}" has no glyph child to measure`)
        assertNear(row.headRect.width, row.headFirstChildWidth, 0.6,
          `clipped-title row "${short(row.title, 40)}" glyph cell must not be flex-squeezed (head ${row.headRect.width} px vs glyph ${row.headFirstChildWidth} px)`)
        assertNear(row.gapHeadToSlot, 8, 1,
          `clipped-title row "${short(row.title, 40)}" pin slot must start one 8 px flex gap after the glyph cell (head.right ${row.headRect.right}, slot.left ${row.slotRect.left}, gap ${row.gapHeadToSlot})`)
      }
      const sample = squeezedCandidates[0]
      glyphGuard = `${squeezedCandidates.length} clipped-title row(s): glyph cell ${sample.headRect.width} px = glyph ${sample.headFirstChildWidth} px, pin-slot gap ${sample.gapHeadToSlot} px`
    }
    state.pinStructure = { mainRows: pin.mainRows, childRows: pin.childRows }
    return `${pin.mainRows} main rows with a 16 px pin slot; ${pin.childRows} subagent child rows with no pin DOM; ${glyphGuard}`
  })

  // ---- R1: running-card hover-card status dot ----------------------------------------------

  await results.check('r1-1', 'running-card hover status dot is a perfect circle (corner-shape round, 50%, square box)', async () => {
    const titles = await mainRowTitles(page)
    assert(titles.length > 0, 'the "Running & recent" card has no main row to hover (start a Session first)')
    let opened = null
    let openedTitle = null
    for (const title of titles.slice(0, 3)) {
      opened = await openHoverCard(page, 'parent', title)
      if (opened !== null) {
        openedTitle = title
        break
      }
    }
    assert(opened !== null, 'the plugin hover card did not open over any card main row')
    const dot = await page.eval(probePin.dotStyle)
    assert(dot !== null, 'the plugin hover card has no .psd-hovercard-dot status dot')
    const cornerShape = String(dot.cornerShape ?? dot.cornerShapeRaw ?? '').trim()
    // Chrome serializes `corner-shape: round` as `superellipse(1)`, so the oracle
    // is the normalized computed value of a `corner-shape: round` control, and the
    // dot must also differ from the shell's inherited squircle default.
    assert(dot.roundComputed.length > 0, 'the synthetic corner-shape:round control produced no computed value')
    assert(cornerShape === dot.roundComputed,
      `dot corner-shape must be the round shape (dot computed ${JSON.stringify(cornerShape)}, round control ${JSON.stringify(dot.roundComputed)}, shell default ${JSON.stringify(dot.shellDefault)}; Chrome normalizes the round keyword to superellipse(1))`)
    assert(dot.shellDefault.length === 0 || cornerShape !== dot.shellDefault,
      `dot must not inherit the shell's squircle corner-shape (${JSON.stringify(dot.shellDefault)})`)
    assertEqual(dot.borderRadius, '50%', `dot border-radius must stay 50% (got ${dot.borderRadius})`)
    assertEqual(dot.width, dot.height, `dot computed box must be square (width ${dot.width}, height ${dot.height})`)
    assertNear(dot.rect.width, dot.rect.height, 0.5, `dot rendered box must be square (${dot.rect.width}x${dot.rect.height})`)
    assert(dot.rect.width >= 6 && dot.rect.width <= 14, `unexpected dot size ${dot.rect.width}px`)
    state.dot = dot
    state.r1Title = openedTitle
    return `corner-shape ${cornerShape}, border-radius ${dot.borderRadius}, ${dot.width}x${dot.height} css / ${dot.rect.width}x${dot.rect.height} px, ${dot.dataState} dot on ${dot.backgroundColor}`
  })

  await results.check('r1-2', 'status-dot region screenshots captured as visual evidence', async () => {
    assert(state.dot !== undefined, 'the dot was not measured (r1-1 failed first)')
    if (!state.shotsEnabled) return 'SKIP (--no-shots): no screenshot written'
    const dot = state.dot
    const file = await writeClipShot(page, 'pin-r1-dot', {
      x: dot.rect.left - 24,
      y: dot.rect.top - 24,
      width: dot.rect.width + 48,
      height: dot.rect.height + 48,
    })
    assert(file !== null, 'could not capture the dot-region screenshot')
    state.screenshots.push(file)
    const card = await page.eval(probe.hoverCard)
    if (card !== null) {
      const cardFile = await writeClipShot(page, 'pin-r1-hovercard', {
        x: card.rect.left - 8,
        y: card.rect.top - 8,
        width: card.rect.width + 16,
        height: card.rect.height + 16,
      })
      if (cardFile !== null) state.screenshots.push(cardFile)
    }
    await resetPointer(page)
    return file
  })

  // ---- R2: native sidebar session hover card shows the same figures -----------------------

  await results.check('r2-1', 'native sidebar session hover card shows the three figure sections with non-empty titles and values', async () => {
    const live = await readLiveSnapshot(page)
    assert(live.ok, `the dynamic-Workspaces live seat is unavailable: ${short(live.reason || 'unknown')}`)
    const cardTitles = await mainRowTitles(page)
    // With a non-empty Host pinned prefix the default card view is pinned-only; prefer
    // unpinned (running/recent) rows as the native-hover candidates, then fall back to
    // pinned rows. Everything is probed with a cold-read wait anyway.
    const pinNow = await readCardPinState(page)
    const unpinnedTitles = new Set(pinNow.rows.filter((row) => row.pinned !== 'true').map((row) => row.title))
    const orderedTitles = [
      ...cardTitles.filter((title) => unpinnedTitles.has(title)),
      ...cardTitles.filter((title) => !unpinnedTitles.has(title)),
    ]
    const idByTitle = new Map()
    for (const row of live.rows ?? []) {
      if (typeof row.id === 'string' && typeof row.title === 'string' && row.title.length > 0) idByTitle.set(row.title, row.id)
    }
    const candidates = []
    for (const title of orderedTitles) {
      const id = idByTitle.get(title)
      if (id === undefined || id === state.sessionId || candidates.some((candidate) => candidate.id === id)) continue
      candidates.push({ id, title })
      if (candidates.length >= PIN_ROW_ATTEMPTS) break
    }
    assert(candidates.length > 0, 'no card main row maps to a live Session id through the test seam; cannot pick a native row with real activity')
    const attempts = []
    for (const candidate of candidates) {
      const row = await ensureNativeRowForSession(page, candidate.id)
      if (row === null) {
        attempts.push(`${candidate.id.slice(0, 8)}… "${short(candidate.title, 26)}": native row not rendered/visible`)
        continue
      }
      let card = await openNativeHoverCard(page, row, { attempts: 1, timeoutMs: 4200 })
      if (card === null) {
        attempts.push(`${candidate.id.slice(0, 8)}… "${short(candidate.title, 26)}": native hover card did not open`)
        await page.moveTo(900, 500)
        await sleep(300)
        continue
      }
      // Cold projection values fill in asynchronously after the slot's one-shot read.
      const deadline = Date.now() + 9000
      while (Date.now() < deadline && (card.figuresWrapper === null || card.figuresWrapper.sectionCount < 3)) {
        await sleep(250)
        const next = await page.eval(probePin.nativeCard)
        if (next === null) {
          card = await openNativeHoverCard(page, row, { attempts: 1, timeoutMs: 3800 })
          if (card === null) break
        } else {
          card = next
        }
        if (card !== null && card.figuresWrapper !== null && card.figuresWrapper.sectionCount >= 3) break
      }
      if (card === null) {
        attempts.push(`${candidate.id.slice(0, 8)}… "${short(candidate.title, 26)}": native hover card closed while waiting for the figures`)
        continue
      }
      if (card.figuresWrapper === null || card.figuresWrapper.sectionCount < 3) {
        attempts.push(`${candidate.id.slice(0, 8)}… "${short(candidate.title, 26)}": ${card.figuresWrapper === null ? 'no [data-psd-native-figures] wrapper' : `${card.figuresWrapper.sectionCount} section(s)`}`)
        await page.moveTo(900, 500)
        await sleep(300)
        continue
      }
      assertSectionTitlesAndValues(card.wrapperSections, 'native session hover card')
      assertEqual(card.sectionsOutsideWrapper, 0, 'every native figure section must live inside [data-psd-native-figures]')
      assertEqual(card.insideRunningCard, false, 'the native hover card must not be inside [data-psd-hovercard]')
      assertEqual(card.figuresWrapper.afterTime, true, 'the figure wrapper must sit after the native relative-time line')
      assertEqual(card.figuresWrapper.beforeStatus, true, 'the figure wrapper must sit before the first native status line')
      assert(card.content !== null && card.content.width >= 200, `the native hover content could not be measured (${short(JSON.stringify(card.content), 120)})`)
      state.r2Native = {
        id: candidate.id,
        title: candidate.title,
        rowKey: row.key,
        card,
        sections: card.wrapperSections,
        categories: card.wrapperSections.map((section) => sectionCategory(section.title)),
      }
      if (state.shotsEnabled) {
        const file = await writeClipShot(page, 'pin-r2-native-hover', {
          x: card.rect.left - 12,
          y: card.rect.top - 12,
          width: card.rect.width + 24,
          height: card.rect.height + 24,
        })
        if (file !== null) state.screenshots.push(file)
      }
      await page.moveTo(900, 500)
      await sleep(300)
      return `${candidate.id.slice(0, 8)}… "${short(candidate.title, 34)}": ${card.wrapperSections.map((section) => `${section.title} = ${section.value}`).join(' | ')}`
    }
    throw new Error(`no native session hover card rendered the three figure sections; probes: ${attempts.join('; ')}`)
  })

  await results.check('r2-2', 'running-card hover card renders the same section label set (alignment oracle)', async () => {
    assert(state.r2Native !== undefined, 'the native figure card was not measured (r2-1 failed first)')
    const native = state.r2Native
    const titles = await mainRowTitles(page)
    let opened = null
    let matchedTitle = null
    const exactTitle = titles.find((title) => title === native.title)
    if (exactTitle !== undefined) {
      opened = await openHoverCard(page, 'parent', exactTitle)
      if (opened !== null) matchedTitle = exactTitle
    }
    if (opened === null) {
      for (const title of titles.slice(0, 4)) {
        const attempt = await openHoverCard(page, 'parent', title)
        if (attempt !== null && attempt.card.sections.length === 3) {
          opened = attempt
          matchedTitle = title
          break
        }
      }
    }
    assert(opened !== null, 'the plugin hover card did not render three figure sections on any card main row')
    const card = opened.card
    const categories = assertSectionTitlesAndValues(card.sections, 'running-card hover card')
    const nativeCategories = native.categories
    assert(categories.slice().sort().join(',') === nativeCategories.slice().sort().join(','),
      `figure section label categories differ (running card ${JSON.stringify(card.sections.map((section) => section.title))} vs native ${JSON.stringify(native.sections.map((section) => section.title))})`)
    const sameSession = matchedTitle === native.title
    let valueMode = 'same-session exact'
    if (sameSession) {
      assertEqual(JSON.stringify(card.sections.map((section) => section.title)),
        JSON.stringify(native.sections.map((section) => section.title)),
        'the same Session must render identical section titles in both hover cards')
      const exactValues = JSON.stringify(card.sections.map((section) => [section.value, section.rows])) ===
        JSON.stringify(native.sections.map((section) => [section.value, section.rows]))
      if (exactValues) {
        valueMode = 'same-session exact values'
      } else {
        // A live/running Session's projections advance between the two hover reads, so the
        // numbers can legitimately drift while the label structure stays identical. Require
        // the same per-section row key sets and non-empty values, and record the drift.
        valueMode = 'same-session label structure (live projection drift accepted)'
        for (let index = 0; index < card.sections.length; index += 1) {
          const liveSection = native.sections[index]
          assertEqual(JSON.stringify(card.sections[index].rows.map((row) => row.key)),
            JSON.stringify(liveSection.rows.map((row) => row.key)),
            `section "${card.sections[index].title}" must keep the same row labels in both hover cards`)
          assert(card.sections[index].value.length > 0 && liveSection.value.length > 0, 'section headline values must stay non-empty')
          for (const row of card.sections[index].rows) assert(row.value.length > 0, `row "${row.key}" must stay non-empty`)
          for (const row of liveSection.rows) assert(row.value.length > 0, `row "${row.key}" must stay non-empty`)
        }
        log(`r2-2: live projection drift between the two hover reads (accepted; labels/structure identical): card ${short(JSON.stringify(card.sections.map((section) => section.value)), 160)} vs native ${short(JSON.stringify(native.sections.map((section) => section.value)), 160)}`)
      }
    }
    state.r2Card = { title: matchedTitle, sameSession, valueMode, sections: card.sections }
    if (state.shotsEnabled) {
      const file = await writeClipShot(page, 'pin-r2-card-hover', {
        x: card.rect.left - 8,
        y: card.rect.top - 8,
        width: card.rect.width + 16,
        height: card.rect.height + 16,
      })
      if (file !== null) state.screenshots.push(file)
    }
    await resetPointer(page)
    return `${sameSession ? 'same Session' : 'label-set fallback'} (${valueMode}): running card ${JSON.stringify(card.sections.map((section) => section.title))} matches native ${JSON.stringify(native.sections.map((section) => section.title))}`
  })

  await results.check('r2-3', 'native hover card keeps its 244 px frame and native child order (no layout regression)', async () => {
    assert(state.r2Native !== undefined, 'the native figure card was not measured (r2-1 failed first)')
    const native = state.r2Native
    const row = await ensureNativeRowForSession(page, native.id)
    assert(row !== null, `the native row for ${native.id} is no longer visible`)
    const card = await openNativeHoverCard(page, row, { attempts: 2, timeoutMs: 4400 })
    assert(card !== null, 'the native hover card did not reopen for the layout check')
    assertEqual(card.width, '244px', `native hover card width must stay 244 px, got ${card.width}`)
    assertEqual(card.rect.width, 244, `native hover card rendered width must be 244 px, got ${card.rect.width}`)
    assert(card.content !== null, 'the native hover content was not found')
    assertNear(card.content.width, 212, 1, `native hover card content width must stay 212 px, got ${card.content.width}`)
    assertEqual(card.padding, '12px 16px', `native hover card padding must stay 12px 16px, got ${card.padding}`)
    assert(card.figuresWrapper !== null, 'the injected figure wrapper disappeared on reopen')
    assertEqual(card.figuresWrapper.afterTime, true, 'the figure wrapper is not after the native hover time line')
    assertEqual(card.figuresWrapper.beforeStatus, true, 'the figure wrapper is not before the native status line')
    const figureIndex = card.children.findIndex((child) => child.containsFigures)
    const timeIndex = card.children.findIndex((child) => /hoverTime/.test(child.className))
    const statusIndex = card.children.findIndex((child) => /hoverStatus/.test(child.className))
    assert(figureIndex >= 0 && timeIndex >= 0 && statusIndex >= 0,
      `the native hover card lost its native children (${short(JSON.stringify(card.children), 260)})`)
    assert(figureIndex > timeIndex && figureIndex < statusIndex,
      `the figure wrapper must stay between the native time and status lines (children ${short(JSON.stringify(card.children.map((child) => child.containsFigures ? 'figures' : child.className)), 260)})`)
    assertEqual(card.title, native.card.title, 'the native hover title changed when the figures were injected')
    if (state.shotsEnabled) {
      const file = await writeClipShot(page, 'pin-r2-native-layout', {
        x: card.rect.left - 12,
        y: card.rect.top - 12,
        width: card.rect.width + 24,
        height: card.rect.height + 24,
      })
      if (file !== null) state.screenshots.push(file)
    }
    await page.moveTo(900, 500)
    await sleep(300)
    return `244 px frame / ${card.content.width} px content, padding ${card.padding}, wrapper between native time and status (cards children: ${card.children.map((child) => child.containsFigures ? 'figures' : child.className.split('_').pop()).join(' > ')})`
  })

  await results.check('r2-4', 'a blank Session shows no figure sections in its native hover card', async () => {
    assert(state.sessionId, 'the smoke pass did not record a blank Session id')
    const row = await ensureNativeRowForSession(page, state.sessionId)
    assert(row !== null, `the blank Session ${state.sessionId} has no visible native sidebar row; cannot hover it`)
    let card = await openNativeHoverCard(page, row, { attempts: 2, timeoutMs: 4400 })
    assert(card !== null, 'the native hover card did not open over the blank Session row')
    // A blank Session has no projection values; a cold read must not grow a figure block.
    await sleep(900)
    const later = await page.eval(probePin.nativeCard)
    if (later !== null) card = later
    assertEqual(card.wrapperSections.length, 0, 'the blank Session must not show figure sections')
    assert(card.figuresWrapper === null || card.figuresWrapper.visible === false,
      `the blank Session must not show a visible figure wrapper (got ${short(JSON.stringify(card.figuresWrapper), 180)})`)
    assertEqual(card.width, '244px', `the blank Session native hover card must keep its 244 px frame (got ${card.width})`)
    if (state.shotsEnabled) {
      const file = await writeClipShot(page, 'pin-r2-blank', {
        x: card.rect.left - 12,
        y: card.rect.top - 12,
        width: card.rect.width + 24,
        height: card.rect.height + 24,
      })
      if (file !== null) state.screenshots.push(file)
    }
    await page.moveTo(900, 500)
    await sleep(300)
    return `blank Session ${state.sessionId}: native hover card ${card.rect.width}x${card.rect.height}, no [data-psd-native-figures], ${card.wrapperSectionCount ?? card.wrapperSections.length} sections`
  })


  // ---- R3-3..: card-owned pin flow -------------------------------------------------------

  await results.check('r3-3', 'hover reveals the pin with no title layout jump; leaving hides it again', async () => {
    await resetPointer(page)
    const selection = await choosePinTargets(page)
    assert(selection.ordered.length > 0,
      'no unpinned, non-current card row is available to exercise the pin hover (the card has no ordinary row)')
    const target = selection.ordered[0]
    debugLog(`r3-3 target "${short(target.title, 40)}" state=${target.state} (done ${selection.doneCount}, running ${selection.runningCount}, current "${short(selection.currentTitle ?? 'n/a', 40)}")`)
    const resolved = await sessionIdByTitle(page, target.title)
    assert(resolved.id !== null, `could not resolve the Session id of the card row "${short(target.title, 50)}" (${resolved.source})`)
    state.pinTargetA = {
      title: target.title,
      id: resolved.id,
      idSource: resolved.source,
      titleLeft: target.titleLeft,
      slotLeft: target.slotRect === null ? null : target.slotRect.left,
      rowBackgroundBefore: target.rowBackground,
      outlineIcon: target.svgIcon,
      outlineUseHref: target.svgUseHref,
      outlineColor: target.color,
      outlinePathFill: target.pathFill
    }
    await hoverMainRowByTitle(page, target.title)
    const during = await waitForRowPinState(page, target.title,
      (row) => row.hovered && row.opacity === '1' && row.visibility === 'visible',
      { timeout: 2500, label: 'pin visible on hover' })
    assertEqual(during.row.pointerEvents, 'auto', `the revealed pin must be interactive on hover (pointer-events ${during.row.pointerEvents})`)
    assertNear(during.row.titleLeft, target.titleLeft, 0.5,
      `the title left edge must not move when the pin appears (before ${target.titleLeft}, during ${during.row.titleLeft})`)
    await resetPointer(page)
    const hidden = await readRowPinState(page, target.title)
    assertEqual(hidden.row.hovered, false, 'the real pointer did not leave the row')
    assertEqual(hidden.row.opacity, '0', `the pin must hide when the pointer leaves (opacity ${hidden.row.opacity})`)
    assertEqual(hidden.row.visibility, 'hidden', `the pin must be visibility:hidden when the pointer leaves (${hidden.row.visibility})`)
    assertEqual(hidden.row.pointerEvents, 'none', 'the hidden pin must not capture the pointer')
    assertNear(hidden.row.titleLeft, target.titleLeft, 0.5,
      `the title left edge must stay identical after the pin hides (before ${target.titleLeft}, after ${hidden.row.titleLeft})`)
    return `title x ${target.titleLeft} before/during/after hover; pin opacity 0 -> 1 (interactive) -> 0 with visibility hidden`
  })

  await results.check('r3-4', 'clicking the pin keeps the pin in the card only: DOM, local cache/effective ids, native sidebar untouched', async () => {
    const target = state.pinTargetA
    assert(target !== undefined, 'no pin target was prepared (r3-3 failed first)')
    const nativeBefore = await readNativePinState(page, target.id)
    target.nativePinCount = nativeBefore === null ? null : nativeBefore.pin.length
    const cacheBefore = parsePinCache((await readPinDocument(page)).raw)
    const after = await clickRowPin(page, target.title, 'pin')
    assertEqual(after.row.pinned, 'true', 'the row must expose data-pinned="true" after the pin click')
    assertEqual(after.row.slotPinned, 'true', 'the pin slot must mirror data-pinned')
    assertEqual(after.row.buttonPinned, 'true', 'the pin button must mirror data-pinned')
    await resetPointer(page)
    const calm = await readRowPinState(page, target.title)
    assertEqual(calm.row.pinned, 'true', 'the row must stay pinned without hover')
    assertEqual(calm.row.ariaPressed, 'true', 'the pin button must expose aria-pressed="true"')
    assert(/^(Unpin session|取消固定)$/.test(calm.row.ariaLabel ?? ''),
      `the pinned pin must offer the localised unpin label, got ${JSON.stringify(calm.row.ariaLabel)}`)
    assertEqual(calm.row.titleAttr, calm.row.ariaLabel, 'the pin title must mirror its aria-label')
    assertEqual(calm.row.opacity, '1', 'the filled pin must stay visible without hover')
    assertEqual(calm.row.visibility, 'visible', 'the filled pin must stay visibility:visible without hover')
    assertEqual(calm.row.pointerEvents, 'none', 'the calm filled marker must not be interactive until hover')
    assert(calm.row.svgPathCount > 0 || calm.row.svgIcon !== null || calm.row.svgUseHref !== null,
      `the pin button must render the shell pin glyph (svg ${calm.row.svgCount}, icon ${calm.row.svgIcon}, href ${calm.row.svgUseHref})`)
    const glyphDescriptor = `${calm.row.svgIcon ?? ''} ${calm.row.svgUseHref ?? ''}`
    assert(/pin[-_]fill|fill[-_]pin/i.test(glyphDescriptor),
      `the pinned marker must use the filled shell pin glyph, got "${short(glyphDescriptor, 120)}"`)
    assert(calm.row.color !== target.outlineColor || calm.row.pathFill !== target.outlinePathFill,
      `the pinned marker must switch from the outline colour to the filled accent (colour ${target.outlineColor} -> ${calm.row.color})`)
    assert(isVioletOrBlue(calm.row.pathFill ?? calm.row.color) || isVioletOrBlue(calm.row.color),
      `the pinned marker must read as the violet/blue fixed accent (fill ${calm.row.pathFill}, colour ${calm.row.color}, business token ${calm.state.businessColor})`)
    assert(calm.row.rowBackground !== 'rgba(0, 0, 0, 0)' && calm.row.rowBackground !== 'transparent',
      `the pinned row must carry a subtle tint (row background ${calm.row.rowBackground})`)
    // Only this row is pinned/tinted.
    const pinNow = await readCardPinState(page)
    for (const row of pinNow.rows) {
      if (row.title === target.title) continue
      assertEqual(row.pinned, null, `only the clicked row may be pinned, got "${short(row.title, 40)}"`)
      assertEqual(row.rowBackground, state.pinBaseline.rowBackgrounds[row.title] ?? row.rowBackground,
        `unpinned row "${short(row.title, 40)}" must keep its normal background (${row.rowBackground})`)
    }
    // The card's own effective set (local cache + queue) paints the pin immediately.
    const effective = await waitForEffectivePins(page, (ids) => ids.includes(target.id),
      { timeout: 6000, label: 'card effective pin ids include the clicked id' })
    target.effectiveAfter = [...effective]
    assertEqual(effective.length, 1, `effective card pins must be exactly the run pin (got ${short(JSON.stringify(effective), 160)})`)
    const cacheAfterRaw = (await readPinDocument(page)).raw
    const cacheAfter = parsePinCache(cacheAfterRaw)
    assert(cacheAfter !== null, `the card pin cache document must exist after pinning (raw ${short(cacheAfterRaw, 160)})`)
    assertEqual(cacheAfter.version, 1, `the cache document version must be 1 (got ${cacheAfter.version})`)
    assert(cacheHasPin(cacheAfter, target.id), `the local cache must record the pin (pinned ${short(JSON.stringify(cacheAfter.pinned), 120)}, pending ${short(JSON.stringify(cacheAfter.pending), 120)})`)
    if (cacheBefore !== null) assert(!cacheHasPin(cacheBefore, target.id), 'the pin must not pre-exist in the cache before the click')
    target.cacheAfterRaw = cacheAfterRaw
    // Negative: the card pin never touches the native sidebar pin.
    const nativeAfter = await readNativePinState(page, target.id)
    if (nativeBefore !== null && nativeAfter !== null) {
      assertEqual(nativeAfter.pin.length, nativeBefore.pin.length,
        `the card pin must not change the native sidebar pin state (native markers ${nativeBefore.pin.length} -> ${nativeAfter.pin.length})`)
    }
    target.rowBackground = calm.row.rowBackground
    target.nativePinCountAfter = nativeAfter === null ? null : nativeAfter.pin.length
    state.pinned.push({ id: target.id, title: target.title })
    if (state.shotsEnabled) {
      const rowFile = await writeClipShot(page, 'pin-r3-pinned-row', {
        x: calm.row.rowRect.left - 6,
        y: calm.row.rowRect.top - 6,
        width: calm.row.rowRect.width + 12,
        height: calm.row.rowRect.height + 12
      })
      if (rowFile !== null) state.screenshots.push(rowFile)
    }
    return `"${short(target.title, 36)}" pinned: effective ids ${short(JSON.stringify(effective), 120)}, cache ${short(cacheAfterRaw, 220)}, native markers ${target.nativePinCount ?? 'n/a'} -> ${target.nativePinCountAfter ?? 'n/a'} (untouched); filled ${calm.row.svgIcon ?? 'inline'} glyph in ${calm.row.color}`
  })

  if (state.pinShared !== true) {
    results.skip('r3-host', 'Host-shared pin document contains the card pin', `pinShared === false: the running Host process does not serve /api/power-suite.session-pins yet (baseline GET ${state.pinBaseline.hostStatus === null ? 'unreachable' : `status ${state.pinBaseline.hostStatus}`}); the new Host feature ships with the merged plugin and only appears after a DSH Web service restart. The local cache/queue is authoritative until then - this row is an explicit SKIP, not a pass; re-run after the restart for the Host + cross-device proof.`)
  } else {
    await results.check('r3-host', 'Host-shared pin document contains the card pin', async () => {
      const target = state.pinTargetA
      assert(target !== undefined, 'no pin target was prepared (r3-3 failed first)')
      const read = await readHostPinDocument(page)
      assertEqual(read.ok, true, `GET /api/power-suite.session-pins failed (status ${read.status ?? 'n/a'} ${read.error ?? ''})`)
      const doc = read.doc
      assert(doc !== null && typeof doc === 'object' && !Array.isArray(doc), `the Host pin document is not an object (${short(JSON.stringify(doc), 160)})`)
      assertEqual(doc.version, 1, `Host pin document version must be 1 (got ${doc.version})`)
      assert(Array.isArray(doc.pinned), `Host pin document pinned must be an array (${short(JSON.stringify(doc.pinned), 160)})`)
      assert(doc.pinned.includes(target.id), `the Host document must list the pinned Session id (pinned ${short(JSON.stringify(doc.pinned), 200)})`)
      if (state.pinBaseline.hostPinned !== null && typeof doc.rev === 'number') {
        assert(doc.rev >= 1, `the Host document rev must advance after the pin (got ${doc.rev})`)
      }
      state.pinTargetA.hostPinnedAfter = [...doc.pinned]
      return `Host document rev ${doc.rev}, pinned ${short(JSON.stringify(doc.pinned), 220)}`
    })
  }

  await results.check('r3-5', 'the pinned row leads the card as a one-row pinned prefix (newest activity first)', async () => {
    await ensurePanelRows(page)
    await resetPointer(page)
    const target = state.pinTargetA
    assert(target !== undefined, 'no pin target was prepared (r3-3 failed first)')
    const pin = await readCardPinState(page)
    const pinnedRows = pin.rows.filter((row) => row.pinned === 'true')
    assertEqual(pinnedRows.length, 1, `exactly the run pin must lead the card (pinned rows ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 200)})`)
    assertEqual(pinnedRows[0].title, target.title, 'the pinned row must be the clicked row')
    assertEqual(pin.rows[0].title, target.title, 'the pinned row must be first in the card')
    assertEqual(pin.rows.findIndex((row) => row.pinned === 'true'), 0, 'the pinned prefix must start at index 0')
    const effective = await readEffectivePins(page)
    assert(effective !== null && effective.length === 1 && effective[0] === target.id,
      `effective card pins must be exactly the run pin (got ${short(JSON.stringify(effective), 160)})`)
    if (state.pinBaseline.expectedChildren > 0) {
      const domChildren = await page.count('.psd-child')
      assert(domChildren > 0, `the ordinary child rows must keep rendering beside the pinned prefix (found ${domChildren})`)
    }
    return `pinned prefix 1/${pin.rows.length}: "${short(pinnedRows[0].title, 36)}" first; effective pins [${target.id.slice(0, 8)}…]`
  })

  await results.check('r3-6', 'a second pin keeps both pinned first, newest activity first; children stay normal and unpinned', async () => {
    await resetPointer(page)
    const targetA = state.pinTargetA
    assert(targetA !== undefined, 'no first pin target (r3-3 failed first)')
    const selection = await choosePinTargets(page, { excludeTitles: [targetA.title] })
    assert(selection.ordered.length > 0, 'no second unpinned, non-current main row is available for the second pin')
    const second = selection.ordered[0]
    const orderBefore = (await readCardPinState(page)).rows.map((row) => row.title)
    const aIndex = orderBefore.indexOf(targetA.title)
    const bIndex = orderBefore.indexOf(second.title)
    assert(aIndex >= 0 && bIndex > aIndex, `harness precondition: the first pin target must precede the second in the newest-first order (a=${aIndex}, b=${bIndex})`)
    const resolved = await sessionIdByTitle(page, second.title)
    assert(resolved.id !== null, `could not resolve the Session id of "${short(second.title, 50)}" (${resolved.source})`)
    const nativeBefore = await readNativePinState(page, resolved.id)
    state.pinTargetB = {
      title: second.title,
      id: resolved.id,
      preIndex: bIndex,
      nativePinCount: nativeBefore === null ? null : nativeBefore.pin.length
    }
    await clickRowPin(page, second.title, 'pin')
    state.pinned.push({ id: resolved.id, title: second.title })
    await ensurePanelRows(page)
    await resetPointer(page)
    const pin = await readCardPinState(page)
    const pinnedRows = pin.rows.filter((row) => row.pinned === 'true')
    assertEqual(pinnedRows.length, 2, `both run pins must lead the card (pinned ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 220)})`)
    const aPinnedIndex = pinnedRows.findIndex((row) => row.title === targetA.title)
    const bPinnedIndex = pinnedRows.findIndex((row) => row.title === second.title)
    assert(aPinnedIndex >= 0 && bPinnedIndex >= 0 && aPinnedIndex < bPinnedIndex,
      `pinned rows must keep newest-activity-first order ("${short(targetA.title, 30)}" before "${short(second.title, 30)}"; got ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 220)})`)
    const firstUnpinned = pin.rows.findIndex((row) => row.pinned !== 'true')
    assert(firstUnpinned === -1 ? pinnedRows.length === pin.rows.length : firstUnpinned === 2,
      `the pinned prefix must be exactly the two run pins, then ordinary rows (first unpinned index ${firstUnpinned}, rows ${pin.rows.length}, pinned ${pinnedRows.length})`)
    if (firstUnpinned === -1) log('r3-6: every visible card row is pinned (the card currently lists only the two run pinned mains) - prefix is the whole list')
    const effective = await waitForEffectivePins(page, (ids) => ids.includes(targetA.id) && ids.includes(resolved.id),
      { timeout: 6000, label: 'effective pins include both run pins' })
    assertEqual(effective.length, 2, `effective pins must be exactly the two run pins (got ${short(JSON.stringify(effective), 160)})`)
    const cache = parsePinCache((await readPinDocument(page)).raw)
    assert(cache !== null && cacheHasPin(cache, targetA.id) && cacheHasPin(cache, resolved.id),
      `the local cache must record both pins (cache ${short((await readPinDocument(page)).raw, 220)})`)
    const nativeAfter = await readNativePinState(page, resolved.id)
    if (nativeBefore !== null && nativeAfter !== null) {
      assertEqual(nativeAfter.pin.length, nativeBefore.pin.length,
        `the second card pin must not change the native sidebar pin state (native markers ${nativeBefore.pin.length} -> ${nativeAfter.pin.length})`)
    }
    if (state.pinBaseline.expectedChildren > 0) {
      const domChildren = await page.count('.psd-child')
      assert(domChildren > 0, `ordinary child rows must keep rendering after both pins (found ${domChildren})`)
    }
    if (state.shotsEnabled) {
      const cardRect = await page.eval(() => {
        const panel = document.querySelector('.psd-panel')
        if (panel === null) return null
        const rect = panel.getBoundingClientRect()
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.min(Math.round(rect.height), 380) }
      })
      if (cardRect !== null) {
        const file = await writeClipShot(page, 'pin-r3-two-pinned', {
          x: cardRect.left - 6,
          y: cardRect.top - 6,
          width: cardRect.width + 12,
          height: cardRect.height + 12
        })
        if (file !== null) state.screenshots.push(file)
      }
    }
    return `pinned prefix 2/${pin.rows.length}: "${short(targetA.title, 30)}" then "${short(second.title, 30)}"; effective [${targetA.id.slice(0, 8)}…, ${resolved.id.slice(0, 8)}…]; children unpinned`
  })

  await results.check('r3-7', 'the card pins survive a reload (local cache; Host document once reachable)', async () => {
    const ours = [...state.pinned]
    assertEqual(ours.length, 2, 'the reload check needs both pins from r3-4/r3-6')
    await reloadFresh(page)
    await ensureAppReady(page)
    await ensurePanelRows(page)
    // The effective set is painted from the local cache immediately (and from the Host
    // document once the route exists); either way it must contain both run ids.
    const effective = await waitForEffectivePins(page, (ids) => ours.every((entry) => ids.includes(entry.id)),
      { timeout: 25000, label: 'effective card pins restored after the reload' })
    const cacheAfter = parsePinCache((await readPinDocument(page)).raw)
    assert(cacheAfter !== null, 'the local pin cache must exist after the reload')
    for (const entry of ours) {
      assert(cacheHasPin(cacheAfter, entry.id), `the local cache must still explain pinned id ${entry.id} after the reload (pinned ${short(JSON.stringify(cacheAfter.pinned), 160)}, pending ${short(JSON.stringify(cacheAfter.pending), 160)})`)
    }
    state.pinTargetA.title = (await titleForRunId(page, state.pinTargetA.id)) ?? state.pinTargetA.title
    state.pinTargetB.title = (await titleForRunId(page, state.pinTargetB.id)) ?? state.pinTargetB.title
    const deadline = Date.now() + 15000
    let pin = null
    let settled = false
    while (Date.now() < deadline) {
      pin = await readCardPinState(page).catch(() => null)
      if (pin !== null) {
        const pinnedRows = pin.rows.filter((row) => row.pinned === 'true')
        const oursPinned = pinnedRows.filter((row) => ours.some((entry) => entry.title === row.title))
        const prefixOk = pinnedRows.length === 2 && pin.rows.slice(0, 2).every((row) => row.pinned === 'true')
        if (oursPinned.length === 2 && prefixOk) {
          settled = true
          break
        }
      }
      await sleep(300)
    }
    assert(pin !== null, 'the card did not render after the reload')
    assert(settled, `the reloaded page did not restore both pins pinned-first within 15 s (rows ${short(JSON.stringify((pin?.rows ?? []).map((row) => `${row.title}${row.pinned === 'true' ? '*' : ''}`)), 260)})`)
    const pinnedRows = pin.rows.filter((row) => row.pinned === 'true')
    const aPinnedIndex = pinnedRows.findIndex((row) => row.title === state.pinTargetA.title)
    const bPinnedIndex = pinnedRows.findIndex((row) => row.title === state.pinTargetB.title)
    assert(aPinnedIndex >= 0 && bPinnedIndex >= 0 && aPinnedIndex < bPinnedIndex,
      `the restored pinned order must keep newest activity first (pinned ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 220)})`)
    let hostNote = 'local cache authoritative (pinShared=false)'
    if (state.pinShared === true) {
      const read = await readHostPinDocument(page)
      assertEqual(read.ok, true, `GET the Host pin document after reload failed (status ${read.status ?? 'n/a'})`)
      const doc = read.doc
      assert(doc !== null && typeof doc === 'object' && Array.isArray(doc.pinned), 'the Host pin document is unavailable after reveal')
      for (const entry of ours) assert(doc.pinned.includes(entry.id), `the Host document lost pinned id ${entry.id} across the reload`)
      hostNote = `Host document also lists both ids (rev ${doc.rev})`
    }
    if (state.shotsEnabled) {
      const cardRect = await page.eval(() => {
        const panel = document.querySelector('.psd-panel')
        if (panel === null) return null
        const rect = panel.getBoundingClientRect()
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.min(Math.round(rect.height), 380) }
      })
      if (cardRect !== null) {
        const file = await writeClipShot(page, 'pin-r3-reloaded', {
          x: cardRect.left - 6,
          y: cardRect.top - 6,
          width: cardRect.width + 12,
          height: cardRect.height + 12
        })
        if (file !== null) state.screenshots.push(file)
      }
    }
    await resetPointer(page)
    return `reloaded: effective ${short(JSON.stringify(effective), 120)}; pinned prefix ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 180)}; cache migrated=${cacheAfter.migrated}; ${hostNote}`
  })

  if (state.pinShared !== true) {
    results.skip('r3-8', 'the card pins are visible from a second fresh browser profile (cross-device Host proof)', 'pinShared === false: the running Host process does not serve /api/power-suite.session-pins yet, so there is nothing to share across profiles until the DSH Web service is restarted with the merged plugin. This row is an explicit SKIP, not a pass; the local cache/reload proof (r3-7) covers the pre-restart behavior.')
  } else {
    await results.check('r3-8', 'the card pins are visible from a second fresh browser profile (cross-device Host proof)', async () => {
      const ours = [...state.pinned]
      assertEqual(ours.length, 2, 'the cross-device check needs both run pins')
      const url = state.guiUrl
      const clientSource = state.clientSource
      assert(typeof url === 'string' && /[?&]token=/.test(url), 'the GUI token URL is not available for the second profile')
      assert(typeof clientSource === 'string' && clientSource.length > 0, 'the worktree client source is not available for the second profile')
      const facts = await withSecondProfile(url, clientSource, async (secondPage) => {
        await ensurePanelRows(secondPage)
        await resetPointer(secondPage)
        // A fresh profile has an empty cache; it must adopt the Host document on mount.
        const effective = await waitForEffectivePins(secondPage, (ids) => ours.every((entry) => ids.includes(entry.id)),
          { timeout: 30000, label: 'second profile: effective card pins include both run ids' })
        const live = await readLiveSnapshot(secondPage)
        assertEqual(live.ok && live.pinShared === true, true, 'the second profile must report pinShared=true for the Host document')
        const pin = await readCardPinState(secondPage)
        const pinnedRows = pin.rows.filter((row) => row.pinned === 'true')
        for (const entry of ours) {
          const resolvedTitle = (live.rows ?? []).find((row) => row.id === entry.id)?.title ?? entry.title
          const row = pin.rows.find((candidate) => candidate.title === resolvedTitle)
          assert(row !== undefined, `the second profile's card does not list the pinned id ${entry.id} ("${short(resolvedTitle, 40)}")`)
          assertEqual(row.pinned, 'true', `the second profile must show id ${entry.id} as pinned`)
        }
        const aIndex = pinnedRows.findIndex((row) => row.title === state.pinTargetA.title)
        const bIndex = pinnedRows.findIndex((row) => row.title === state.pinTargetB.title)
        assert(aIndex >= 0 && bIndex >= 0 && aIndex < bIndex,
          `the second profile must show the same newest-activity-first pinned prefix (pinned ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 240)})`)
        const docRead = await readHostPinDocument(secondPage)
        assertEqual(docRead.ok, true, 'the second profile must reach the Host pin document')
        for (const entry of ours) assert(docRead.doc.pinned.includes(entry.id), `the Host document in the second profile lost id ${entry.id}`)
        if (state.shotsEnabled) {
          const cardRect = await secondPage.eval(() => {
            const panel = document.querySelector('.psd-panel')
            if (panel === null) return null
            const rect = panel.getBoundingClientRect()
            return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.min(Math.round(rect.height), 380) }
          })
          if (cardRect !== null) {
            const file = await writeClipShot(secondPage, 'pin-r3-cross-device', {
              x: cardRect.left - 6,
              y: cardRect.top - 6,
              width: cardRect.width + 12,
              height: cardRect.height + 12
            })
            if (file !== null) state.screenshots.push(file)
          }
        }
        return {
          effective,
          pinnedTitles: pinnedRows.map((row) => row.title),
          hostPinned: [...docRead.doc.pinned],
          pageErrors: [...secondPage.pageErrors]
        }
      })
      state.crossDevice = facts
      assertEqual(facts.pageErrors.length, 0, `second profile page errors: ${short(JSON.stringify(facts.pageErrors), 200)}`)
      log(`cross-device: second fresh profile effective pins ${short(JSON.stringify(facts.effective), 160)}; pinned prefix ${short(JSON.stringify(facts.pinnedTitles), 240)}; Host pinned ${short(JSON.stringify(facts.hostPinned), 200)}`)
      return `second fresh profile: Host pinned ${short(JSON.stringify(facts.hostPinned), 200)}; card pinned prefix ${short(JSON.stringify(facts.pinnedTitles), 220)}; 0 page errors`
    })
  }

  await results.check('r3-9', 'unpinning removes the tint and returns the rows to the normal card (baseline restored)', async () => {
    const targetA = state.pinTargetA
    const targetB = state.pinTargetB
    assert(targetA !== undefined && targetB !== undefined, 'the two pin targets are not available (earlier checks failed)')
    await ensurePanelRows(page)
    await resetPointer(page)
    targetA.title = (await titleForRunId(page, targetA.id)) ?? targetA.title
    targetB.title = (await titleForRunId(page, targetB.id)) ?? targetB.title
    const unpinnedA = await clickRowPin(page, targetA.title, 'unpin')
    assertEqual(unpinnedA.row.pinned, null, 'data-pinned must be removed from the row after unpinning')
    assertEqual(unpinnedA.row.ariaPressed, 'false', 'aria-pressed must flip back to false after unpinning')
    assert(/^(Pin session|固定会话)$/.test(unpinnedA.row.ariaLabel ?? ''),
      `the unpinned pin must offer the localised pin label, got ${JSON.stringify(unpinnedA.row.ariaLabel)}`)
    await resetPointer(page)
    const calmA = await readRowPinState(page, targetA.title)
    assertEqual(calmA.row.opacity, '0', 'the unpinned pin must hide when the pointer is away')
    assertEqual(calmA.row.visibility, 'hidden', 'the unpinned pin must be visibility:hidden when the pointer is away')
    assertEqual(calmA.row.rowBackground, targetA.rowBackgroundBefore ?? state.pinBaseline.rowBackgrounds[targetA.title],
      `the violet row tint must be gone after unpinning (row background ${calmA.row.rowBackground})`)
    const firstUnpinned = (await readCardPinState(page)).rows.findIndex((row) => row.pinned !== 'true')
    assert(firstUnpinned >= 0, 'no unpinned row remains after the first unpin')
    const firstUnpinnedTitle = (await readCardPinState(page)).rows[firstUnpinned].title
    assertEqual(firstUnpinnedTitle, targetA.title,
      `the unpinned row must return to the head of the normal queue immediately (first unpinned is "${short(firstUnpinnedTitle, 40)}")`)
    const effectiveAfterA = await waitForEffectivePins(page, (ids) => !ids.includes(targetA.id),
      { timeout: 6000, label: 'effective pins lose the first unpinned id' })
    assert(effectiveAfterA.length === 1 && effectiveAfterA[0] === targetB.id,
      `after the first unpin the effective set must be exactly the remaining run pin (got ${short(JSON.stringify(effectiveAfterA), 160)})`)
    const unpinnedB = await clickRowPin(page, targetB.title, 'unpin')
    assertEqual(unpinnedB.row.pinned, null, 'the second row must be unpinned')
    await resetPointer(page)
    const effectiveFinal = await waitForEffectivePins(page, (ids) => ids.length === 0,
      { timeout: 8000, label: 'effective pins empty after both unpins' })
    assertEqual(effectiveFinal.length, 0, `effective pins must be empty after unpinning both (got ${short(JSON.stringify(effectiveFinal), 120)})`)
    await ensurePanelRows(page)
    const pin = await readCardPinState(page)
    assertEqual(pin.rows.filter((row) => row.pinned === 'true').length, state.pinBaseline.pinnedRows,
      `the card pinned count must return to the baseline ${state.pinBaseline.pinnedRows} (found ${pin.rows.filter((row) => row.pinned === 'true').length})`)
    const normalRows = pin.rows.filter((row) => row.pinned !== 'true')
    const indexA = normalRows.findIndex((row) => row.title === targetA.title)
    const indexB = normalRows.findIndex((row) => row.title === targetB.title)
    assert(indexA >= 0 && indexB >= 0, 'both unpinned rows must be back in the normal queue')
    assert(indexA < indexB, `the normal-queue order must keep newest activity first ("${short(targetA.title, 30)}" ${indexA} before "${short(targetB.title, 30)}" ${indexB})`)
    if (state.pinBaseline.expectedChildren > 0) {
      const domChildren = await page.count('.psd-child')
      assert(domChildren > 0, `ordinary child rows must still render after the unpins (found ${domChildren})`)
    }
    // Residual local cache / Host document, reported honestly (not asserted away).
    const cacheRaw = (await readPinDocument(page)).raw
    const cache = parsePinCache(cacheRaw)
    const cacheEffective = cacheEffectiveIds(cache)
    assertEqual(state.pinned.filter((entry) => cacheEffective.has(entry.id)).length, 0,
      `the local cache must not still paint a run pin (cache effective ${short(JSON.stringify([...cacheEffective]), 160)}; raw ${short(cacheRaw, 220)})`)
    let hostNote = 'Host route absent (pinShared=false): local cache authoritative'
    if (state.pinShared === true) {
      const read = await readHostPinDocument(page)
      assertEqual(read.ok, true, 'the Host pin document must be readable during cleanup')
      const doc = read.doc
      assert(doc !== null && typeof doc === 'object' && Array.isArray(doc.pinned), 'the Host pin document is unavailable during cleanup')
      for (const entry of state.pinned) assert(!doc.pinned.includes(entry.id), `the Host pin document still lists run id ${entry.id}`)
      hostNote = `Host document cleared run ids (pinned now ${short(JSON.stringify(doc.pinned), 160)}, rev ${doc.rev})`
    }
    state.pinned = []
    await resetPointer(page)
    if (state.shotsEnabled) {
      const cardRect = await page.eval(() => {
        const panel = document.querySelector('.psd-panel')
        if (panel === null) return null
        const rect = panel.getBoundingClientRect()
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.min(Math.round(rect.height), 380) }
      })
      if (cardRect !== null) {
        const file = await writeClipShot(page, 'pin-r3-unpinned', {
          x: cardRect.left - 6,
          y: cardRect.top - 6,
          width: cardRect.width + 12,
          height: cardRect.height + 12
        })
        if (file !== null) state.screenshots.push(file)
      }
    }
    return `unpinned both: effective pins []; card back to ${state.pinBaseline.pinnedRows} pinned row(s); first normal-queue row "${short(targetA.title, 36)}"; ${hostNote}; cache ${short(cacheRaw, 200)}`
  })
  // ---- atmosphere rows: no stacked extra highlight (follow-up fix #2) --------------------

  await results.check('r3-10', 'atmosphere card rows keep only the rainbow surface (no stacked hover/pin highlight) while the pin still reveals', async () => {
    // Ensure a current parent card row exists (open the first ordinary row like a user if needed).
    let current = await page.eval(probePin.currentCardRow)
    if (current === null || current.kind !== 'parent') {
      const opener = await page.eval(() => {
        const row = [...document.querySelectorAll('.psd-run')]
          .find((element) => !element.classList.contains('psd-run-current') && element.querySelector('.psd-run-open') !== null)
        if (row === undefined) return null
        const button = row.querySelector('.psd-run-open')
        const rect = button.getBoundingClientRect()
        return { x: Math.round(rect.left + Math.min(40, Math.max(10, rect.width / 2))), y: Math.round(rect.top + rect.height / 2) }
      })
      assert(opener !== null, 'no ordinary card row whose title button can be clicked to make it current')
      await resetPointer(page)
      await page.clickAt(opener.x, opener.y)
      await page.waitForFn(() => !!document.querySelector('.psd-run-current'), [], { timeout: 15000, label: 'card atmosphere current row' })
      await sleep(900)
      current = await page.eval(probePin.currentCardRow)
    }
    // Park the pointer: the previous check may have left it on the row, and a hovered
    // atmosphere row is already at the brightness(1.5) hover step.
    await resetPointer(page)
    await sleep(320)
    current = await page.eval(probePin.currentCardRow)
    assert(current !== null && current.kind === 'parent',
      `the current-Session card row is not a parent atmosphere row (${short(JSON.stringify(current), 220)})`)
    assertEqual(current.hovered, false, 'the current card row must not be hovered for the resting brightness assertion')
    const currentTitle = current.title
    // Fix #3: the affordance is a content brightness lift, not a background.
    assertContentBrightness(current, 'brightness(1.15)', 'current card row at rest', { expectTransition: true })
    await hoverCardRowByTitle(page, 'parent', currentTitle)
    await sleep(350)
    const hovered = await page.eval(probePin.currentCardRow)
    assert(hovered !== null && hovered.hovered === true, `the current card row was not hovered (${short(JSON.stringify(hovered), 200)})`)
    assertEqual(hovered.atmos.present, true, 'the current card row must keep its rainbow atmosphere')
    assertEqual(hovered.atmos.canvas, true, 'the current card row atmosphere must keep its canvas')
    assertEqual(hovered.mainBackground, 'rgba(0, 0, 0, 0)',
      `the current row body must not stack the ordinary hover pill inside the rainbow (main background ${hovered.mainBackground})`)
    assertEqual(hovered.rowBackground, 'rgba(0, 0, 0, 0)',
      `the current row surface must stay transparent (row background ${hovered.rowBackground})`)
    assert(hovered.pin !== null, 'the current card row must still render the pin control')
    assertEqual(hovered.pin.opacity, '1', `the pin control must still reveal on hover over the atmosphere row (opacity ${hovered.pin.opacity})`)
    assertEqual(hovered.pin.visibility, 'visible', `the pin control must be visible on hover over the atmosphere row (${hovered.pin.visibility})`)
    assertContentBrightness(hovered, 'brightness(1.5)', 'hovered current card row', { expectTransition: true })
    // Pinning the current row must not add the violet tint under the rainbow.
    const resolved = await sessionIdByTitle(page, currentTitle)
    assert(resolved.id !== null, `could not resolve the current card row Session id (${resolved.source})`)
    const pinned = await clickRowPin(page, currentTitle, 'pin')
    assertEqual(pinned.row.pinned, 'true', 'the current row must accept the pin')
    state.pinned.push({ id: resolved.id, title: currentTitle })
    await resetPointer(page)
    const pinnedCalm = await page.eval(probePin.currentCardRow)
    assert(pinnedCalm !== null && pinnedCalm.pinned === 'true', 'the current row must report data-pinned after pinning')
    assertEqual(pinnedCalm.rowBackground, 'rgba(0, 0, 0, 0)',
      `a pinned current row must not paint the violet tint under the rainbow (row background ${pinnedCalm.rowBackground})`)
    await hoverCardRowByTitle(page, 'parent', currentTitle)
    await sleep(300)
    const pinnedHovered = await page.eval(probePin.currentCardRow)
    assertEqual(pinnedHovered.mainBackground, 'rgba(0, 0, 0, 0)',
      `a pinned+hovered current row must not paint the hover pill under the rainbow (${pinnedHovered.mainBackground})`)
    await clickRowPin(page, currentTitle, 'unpin')
    state.pinned = state.pinned.filter((entry) => entry.id !== resolved.id)
    await resetPointer(page)
    assertEqual((await page.eval(probePin.currentCardRow)).pinned, null, 'the current row must be unpinned again')
    // Ordinary rows keep their hover affordance.
    const ordinary = await page.eval(probePin.ordinaryCardRow)
    assert(ordinary !== null, 'no ordinary (non-atmosphere) card row is available for the affordance check')
    assertContentBrightness(ordinary, 'none', 'ordinary card row at rest')
    await hoverCardRowByTitle(page, 'parent', ordinary.title)
    await sleep(300)
    const ordinaryHovered = await page.eval(probePin.ordinaryCardRow)
    assert(ordinaryHovered !== null && ordinaryHovered.hovered === true, 'the ordinary card row was not hovered')
    assertEqual(ordinaryHovered.atmosPresent, false, 'the affordance comparison row must not carry an atmosphere')
    assert(ordinaryHovered.mainBackground !== 'rgba(0, 0, 0, 0)',
      `an ordinary card row must keep its hover pill (main background ${ordinaryHovered.mainBackground})`)
    assertContentBrightness(ordinaryHovered, 'none', 'hovered ordinary card row')
    // Nested subagent current row: open one child like a user, then hover it.
    const childTarget = await page.eval(() => {
      const child = [...document.querySelectorAll('.psd-child')]
        .find((element) => element.querySelector('.psd-child-main') !== null && !element.classList.contains('psd-child-current'))
      if (child === undefined) return null
      const main = child.querySelector('.psd-child-main')
      const rect = main.getBoundingClientRect()
      return {
        title: (child.querySelector('.psd-child-title')?.innerText || '').trim(),
        x: Math.round(rect.left + Math.min(30, Math.max(10, rect.width / 2))),
        y: Math.round(rect.top + rect.height / 2)
      }
    })
    assert(childTarget !== null, 'no nested subagent row is rendered to make current for the child atmosphere check')
    await resetPointer(page)
    await page.clickAt(childTarget.x, childTarget.y)
    await page.waitForFn(() => !!document.querySelector('.psd-child-current'), [], { timeout: 15000, label: 'child atmosphere current row' })
    await sleep(900)
    // Park the pointer: the click leaves it on the child row (already at the hover step).
    await resetPointer(page)
    await sleep(320)
    const childCurrent = await page.eval(probePin.currentCardRow)
    assert(childCurrent !== null && childCurrent.kind === 'child',
      `the current child atmosphere row is missing (${short(JSON.stringify(childCurrent), 220)})`)
    assertEqual(childCurrent.hovered, false, 'the current child row must not be hovered for the resting brightness assertion')
    assertContentBrightness(childCurrent, 'brightness(1.15)', 'current child row at rest', { expectTransition: true })
    await hoverCardRowByTitle(page, 'child', childCurrent.title)
    await sleep(350)
    const childHovered = await page.eval(probePin.currentCardRow)
    assertEqual(childHovered.atmos.present, true, 'the current child row must keep its rainbow atmosphere')
    assertEqual(childHovered.mainBackground, 'rgba(0, 0, 0, 0)',
      `the current child body must not stack the ordinary hover pill inside the rainbow (background ${childHovered.mainBackground})`)
    assertContentBrightness(childHovered, 'brightness(1.5)', 'hovered current child row', { expectTransition: true })
    return `parent "${short(currentTitle, 30)}": atmosphere + transparent body on hover, pin revealed, pinned tint suppressed; ordinary "${short(ordinary.title, 26)}" hover ${ordinaryHovered.mainBackground}; child "${short(childCurrent.title, 26)}" body transparent with atmosphere`
  })

  await results.check('r3-11', 'native current Session/Workspace atmosphere rows keep only the rainbow surface (no stacked hover background)', async () => {
    let initial = await page.eval(probePin.nativeCurrentAtmosphereRows)
    if (initial.sessionId === null || initial.session === null) {
      // The open Session may be a subagent (native sidebar rows only list main Sessions):
      // switch back to a main card row like a user before checking the native rows.
      const opener = await page.eval(() => {
        const row = [...document.querySelectorAll('.psd-run')].find((element) => element.querySelector('.psd-run-open') !== null)
        if (row === undefined) return null
        const button = row.querySelector('.psd-run-open')
        const rect = button.getBoundingClientRect()
        return { x: Math.round(rect.left + Math.min(40, Math.max(10, rect.width / 2))), y: Math.round(rect.top + rect.height / 2) }
      })
      assert(opener !== null, 'no main card row is available to switch back to a main Session')
      await resetPointer(page)
      await page.clickAt(opener.x, opener.y)
      await page.waitForFn(() => {
        const id = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session')
        return typeof id === 'string' && id.length > 0 && document.querySelector(`[data-row-key="session:${id}"]`) !== null
      }, [], { timeout: 20000, label: 'main current Session with a native sidebar row' })
      await sleep(700)
      initial = await page.eval(probePin.nativeCurrentAtmosphereRows)
    }
    assert(initial.sessionId !== null, 'no open Session id is available for the native current-row check')
    if (initial.session === null) {
      const row = await ensureNativeRowForSession(page, initial.sessionId)
      assert(row !== null, `the native sidebar row for the current Session ${initial.sessionId} could not be revealed`)
    }
    if (initial.workspace === null) {
      await page.eval(() => {
        const marker = document.querySelector('[data-psd-current-workspace="true"]')
        if (marker !== null) marker.scrollIntoView({ block: 'center' })
      })
      await sleep(400)
    }
    // Fix #3: atmosphere-row content sits at brightness(1.15) while highlighted, before
    // any hover lift; the native current Session/Workspace rows get the same treatment.
    const initialFacts = await page.eval(probePin.nativeCurrentAtmosphereRows)
    assert(initialFacts.session !== null && initialFacts.workspace !== null,
      `the native current Session/Workspace rows are not both rendered before the brightness checks (${short(JSON.stringify(initialFacts), 240)})`)
    assertContentBrightness(initialFacts.session, 'brightness(1.15)', 'native current Session at rest', { expectTransition: true })
    assertContentBrightness(initialFacts.workspace, 'brightness(1.15)', 'native current Workspace at rest', { expectTransition: true })
    await hoverSelector(page, `[data-row-key="session:${initial.sessionId}"]`)
    await sleep(350)
    let facts = await page.eval(probePin.nativeCurrentAtmosphereRows)
    assert(facts.session !== null, 'the native current Session row disappeared while hovering')
    assertEqual(facts.session.hovered, true, 'the native current Session row was not hovered')
    assertEqual(facts.session.background, 'rgba(0, 0, 0, 0)',
      `the native current Session row must not stack its own hover background into the rainbow (background ${facts.session.background})`)
    assertEqual(facts.session.atmosPresent, true, 'the native current Session row must carry the atmosphere wrapper')
    assertEqual(facts.session.atmosCanvas, true, 'the native current Session row atmosphere must keep its canvas')
    assertContentBrightness(facts.session, 'brightness(1.5)', 'hovered native current Session', { expectTransition: true })
    const workspacePresent = await page.eval(() => document.querySelector('[data-psd-current-workspace="true"]') !== null)
    assertEqual(workspacePresent, true, 'no native current Workspace row marker is rendered')
    assertContentBrightness(facts.workspace, 'brightness(1.15)', 'native current Workspace at rest (Session hover must not affect it)', { expectTransition: true })
    await hoverSelector(page, '[data-psd-current-workspace="true"]')
    await sleep(350)
    facts = await page.eval(probePin.nativeCurrentAtmosphereRows)
    assert(facts.workspace !== null, 'the native current Workspace row disappeared while hovering')
    assertEqual(facts.workspace.hovered, true, 'the native current Workspace row was not hovered')
    assertEqual(facts.workspace.background, 'rgba(0, 0, 0, 0)',
      `the native current Workspace row must not stack its own hover background into the rainbow (background ${facts.workspace.background})`)
    assertEqual(facts.workspace.atmosPresent, true, 'the native current Workspace row must carry the atmosphere wrapper')
    assertEqual(facts.workspace.atmosCanvas, true, 'the native current Workspace row atmosphere must keep its canvas')
    assertContentBrightness(facts.workspace, 'brightness(1.5)', 'hovered native current Workspace', { expectTransition: true })
    let ordinaryNote = 'no ordinary native session row was available for the affordance comparison'
    const ordinarySelector = `[data-row-key^="session:"]:not([data-row-key="session:${initial.sessionId}"]):not([data-psd-current-session="true"])`
    const hasOrdinary = await page.eval((sel) => {
      const element = document.querySelector(sel)
      return element !== null && element.getBoundingClientRect().height > 0
    }, ordinarySelector)
    if (hasOrdinary) {
      await hoverSelector(page, ordinarySelector)
      await sleep(300)
      const ordinary = await page.eval((sel) => {
        const row = document.querySelector(sel)
        if (row === null) return null
        return {
          hovered: row.matches(':hover'),
          background: getComputedStyle(row).backgroundColor,
          contentFilters: [...row.children]
            .filter((child) => child instanceof HTMLElement && !child.classList.contains('psd-atmos') && !child.hasAttribute('data-psd-atmos'))
            .map((child) => ({ className: String(child.className || ''), filter: getComputedStyle(child).filter }))
        }
      }, ordinarySelector)
      if (ordinary !== null && ordinary.hovered) {
        assert(ordinary.background !== 'rgba(0, 0, 0, 0)',
          `an ordinary native session row must keep its native hover background (${ordinary.background})`)
        assertContentBrightness(ordinary, 'none', 'hovered ordinary native session row')
        ordinaryNote = `ordinary native row hover ${ordinary.background}, content filter none`
      }
    }
    return `native current Session transparent + atmosphere + content brightness 1.15->1.5 on hover; native current Workspace transparent + atmosphere + brightness 1.15->1.5; ${ordinaryNote}`
  })

  await results.check('r3-12', 'atmosphere content brightness transition is disabled under reduced motion while the static lift stays', async () => {
    // Make sure a current parent atmosphere row exists (same user-like switch as r3-10).
    let current = await page.eval(probePin.currentCardRow)
    if (current === null || current.kind !== 'parent') {
      const opener = await page.eval(() => {
        const row = [...document.querySelectorAll('.psd-run')].find((element) => element.querySelector('.psd-run-open') !== null)
        if (row === undefined) return null
        const button = row.querySelector('.psd-run-open')
        const rect = button.getBoundingClientRect()
        return { x: Math.round(rect.left + Math.min(40, Math.max(10, rect.width / 2))), y: Math.round(rect.top + rect.height / 2) }
      })
      assert(opener !== null, 'no main card row is available to create a current atmosphere row')
      await resetPointer(page)
      await page.clickAt(opener.x, opener.y)
      await page.waitForFn(() => !!document.querySelector('.psd-run-current'), [], { timeout: 15000, label: 'current card row for the reduced-motion check' })
      await sleep(900)
      current = await page.eval(probePin.currentCardRow)
    }
    assert(current !== null && current.kind === 'parent', 'no current parent atmosphere row is available for the reduced-motion check')
    await resetPointer(page)
    await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    try {
      await sleep(350)
      const reduced = await page.eval(probePin.currentCardRow)
      assert(reduced !== null && Array.isArray(reduced.contentFilters) && reduced.contentFilters.length > 0,
        'the current atmosphere row has no content children under reduced motion')
      for (const child of reduced.contentFilters) {
        assertEqual(child.filter, 'brightness(1.15)',
          `reduced motion must keep the static brightness lift (child "${short(child.className, 30)}" filter ${child.filter})`)
        const transitionText = `${child.transition} ${child.transitionProperty} ${child.transitionDuration}`
        assert(child.transitionProperty === 'none' || child.transitionDuration === '0s' || /^0s/.test(child.transitionDuration),
          `reduced motion must disable the brightness transition (child "${short(child.className, 30)}": "${short(transitionText, 120)}")`)
      }
      return `reduced motion: ${reduced.contentFilters.length} current-row content child(ren) keep brightness(1.15) with the filter transition disabled (property ${reduced.contentFilters[0].transitionProperty}, duration ${reduced.contentFilters[0].transitionDuration})`
    } finally {
      await page.emulateMedia([])
      await sleep(300)
    }
  })

}

// ---------------------------------------------------------------------------------------------
// --live mode: shipped-install proof (no client injection, read-only, two fresh profiles)
// ---------------------------------------------------------------------------------------------

/**
 * Read the shipped Running & recent card in one plain (non-injected) Chrome profile.
 * Read-only: the only interaction is the card's own "View all" control (local view state).
 * @param {string} url - token GUI URL (redacted in logs).
 * @param {string} label - profile label for logs.
 * @returns {Promise<object>} shipped-client facts + page/log errors.
 */
async function collectLiveInstallFacts(url, label) {
  let chrome = null
  let page = null
  try {
    chrome = await launchChrome({ headful: false })
    log(`live install [${label}]: fresh Chrome profile pid ${chrome.proc.pid}, CDP port ${chrome.port}`)
    const cdp = await CdpConnection.connect(chrome.wsUrl)
    page = await Page.open(cdp, url, null)
    await page.waitForFn(
      () => document.readyState === 'complete' && !!document.querySelector('[data-slot="main"]'),
      [],
      { timeout: 60000, label: `live install [${label}]: DSH shell` }
    )
    await page.waitForFn(() => !!document.querySelector('.psd-panel'), [], { timeout: 30000, label: `live install [${label}]: Running & recent card` })
    await page.waitForFn(() => document.querySelectorAll('.psd-run').length > 0, [], { timeout: 20000, label: `live install [${label}]: card rows` })
    await sleep(900)
    const expanded = await expandPanelRows(page)
    await resetPointer(page)
    const facts = await page.eval(() => {
      const text = (node) => (node ? (node.innerText || node.textContent || '').trim() : '')
      const rows = [...document.querySelectorAll('.psd-run')]
      const pinnedRowTitles = rows.filter((row) => row.getAttribute('data-pinned') === 'true')
        .map((row) => text(row.querySelector('.psd-run-title')))
      let pinCache = null
      try {
        pinCache = window.localStorage.getItem('power-suite.dynamic-workspaces.pinned')
      } catch {
        pinCache = 'storage-denied'
      }
      return {
        cardRows: rows.length,
        childRows: document.querySelectorAll('.psd-child').length,
        pinButtons: document.querySelectorAll('.psd-run-pin').length,
        pinSlots: document.querySelectorAll('.psd-run-pin-slot').length,
        pinnedNodes: document.querySelectorAll('[data-pinned]').length,
        pinnedRows: pinnedRowTitles.length,
        pinnedTitles: pinnedRowTitles,
        pinCache,
        hasInjectedFactory: window.__psInjectedFactoryRan === true,
        panelPresent: document.querySelector('.psd-panel') !== null
      }
    })
    facts.viewAllExpanded = expanded
    const pageErrors = [...page.pageErrors]
    const logErrors = [...page.logEntries]
    log(`live install [${label}]: cardRows ${facts.cardRows}, childRows ${facts.childRows}, pinButtons ${facts.pinButtons}, pinnedRows ${facts.pinnedRows}, injected ${facts.hasInjectedFactory}, page errors ${pageErrors.length}, pin cache ${short(facts.pinCache, 200)}`)
    return { label, facts, pageErrors, logErrors }
  } finally {
    if (page !== null) page.dispose()
    if (chrome !== null) await chrome.close()
  }
}

/**
 * `--live`: prove the merged linked checkout serves the final client with the normal
 * running-card content (ordinary rows + children, zero prefilled pins) without injection.
 * Read-only; two fresh profiles must agree. The Host pin route is not asserted here: the
 * served Host only gains it after the user restarts the service.
 * @param {object} input - `{ url, results, state }`.
 * @returns {Promise<void>}
 */
async function runLiveChecks({ url, results, state }) {
  log('\n=== --live: shipped install (no client injection, read-only) ===')
  const first = await collectLiveInstallFacts(url, 'profile A')
  const second = await collectLiveInstallFacts(url, 'profile B')
  state.live = true
  state.livePageErrors = [
    ...first.pageErrors.map((text) => `profile A: ${text}`),
    ...second.pageErrors.map((text) => `profile B: ${text}`)
  ]

  await results.check('live-1', 'the shipped (non-injected) GUI serves the normal Running & recent card with the pin control on every main row', async () => {
    assertEqual(first.facts.hasInjectedFactory, false, 'the live-install check must not inject the worktree client')
    assert(first.facts.panelPresent, 'the shipped GUI does not mount the Running & recent card')
    assert(first.facts.cardRows > 0, 'the shipped card has no main rows')
    assertEqual(first.facts.pinButtons, first.facts.cardRows,
      `every shipped main row must render the .psd-run-pin control (${first.facts.pinButtons}/${first.facts.cardRows})`)
    assertEqual(first.facts.pinSlots, first.facts.cardRows, 'every shipped main row must reserve the pin slot')
    assert(first.facts.childRows > 0,
      `the normal shipped card must include the running Session's subagent child rows (found ${first.facts.childRows})`)
    return `served client: ${first.facts.cardRows} main rows, ${first.facts.childRows} child row(s), ${first.facts.pinButtons} pin buttons, no injection (profile A)`
  })

  await results.check('live-2', 'a fresh shipped profile starts with zero prefilled pinned rows and no default tint', async () => {
    assertEqual(first.facts.pinnedRows, 0,
      `a fresh profile must not start with prefilled pinned card rows (found ${short(JSON.stringify(first.facts.pinnedTitles), 220)})`)
    assertEqual(first.facts.pinnedNodes, 0, `no card node may carry data-pinned in a fresh profile (found ${first.facts.pinnedNodes})`)
    const cache = parsePinCache(first.facts.pinCache)
    const effective = cache === null ? [] : [...cache.pinned]
    for (const entry of cache === null ? [] : cache.pending) {
      if (entry.op === 'pin') effective.push(entry.id)
      else if (entry.op === 'unpin') {
        const index = effective.indexOf(entry.id)
        if (index >= 0) effective.splice(index, 1)
      }
    }
    assertEqual(effective.length, 0,
      `a fresh profile must not paint pins from a prefilled local cache (cache ${short(first.facts.pinCache, 240)})`)
    return `fresh shipped profile: 0 pinned rows/nodes, effective pins 0 (cache ${cache === null ? 'absent' : `rev ${cache.rev}, migrated ${cache.migrated}`}); ordinary rows ${first.facts.cardRows} + children ${first.facts.childRows}`
  })

  await results.check('live-3', 'two fresh shipped profiles agree on the normal card (no pinned prefix, same ordinary content)', async () => {
    assertEqual(second.facts.pinnedRows, 0, 'the second fresh profile must also start unpinned')
    assertEqual(second.facts.pinnedNodes, 0, 'the second fresh profile must not carry data-pinned nodes')
    assertEqual(second.facts.pinButtons, second.facts.cardRows, 'the second profile must render the pin control on every main row')
    assert(second.facts.childRows > 0, 'the second profile must show the subagent child rows too')
    const firstCache = parsePinCache(first.facts.pinCache)
    const secondCache = parsePinCache(second.facts.pinCache)
    const cachePins = (cache) => cache === null ? 0 : cache.pinned.length + cache.pending.filter((entry) => entry.op === 'pin').length
    assertEqual(cachePins(firstCache), 0, 'the first profile cache must not hold prefilled pins')
    assertEqual(cachePins(secondCache), 0, 'the second profile cache must not hold prefilled pins')
    return `profiles agree: main rows A ${first.facts.cardRows} / B ${second.facts.cardRows}; children A ${first.facts.childRows} / B ${second.facts.childRows}; pinned A ${first.facts.pinnedRows} / B ${second.facts.pinnedRows}`
  })

  await results.check('live-4', 'the shipped-install pages report no page errors', async () => {
    const errors = [...first.pageErrors, ...second.pageErrors]
    assertEqual(errors.length, 0, `live-install page errors: ${short(JSON.stringify(errors), 300)}`)
    return `0 page errors across both profiles (${first.logErrors.length + second.logErrors.length} non-JS console/log entries)`
  })

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
  const state = { screenshots: [], shotsEnabled: opts.shots, guiUrl: url, clientSource }
  const results = new Results()
  if (opts.mode === 'live') {
    // Read-only shipped-install proof: the page loads the merged linked checkout with
    // NO client injection, in two fresh throwaway profiles.
    try {
      await runLiveChecks({ url, results, state })
    } catch (error) {
      fatal = error
      log(`\nFATAL  ${error?.stack ? short(error.stack, 1800) : String(error)}`)
      exitCode = error?.exitCode === 2 ? 2 : 1
    }
  } else {
  try {
    chrome = await launchChrome(opts)
    log(`chrome: headless pid ${chrome.proc.pid}, CDP port ${chrome.port}`)
    const cdp = await CdpConnection.connect(chrome.wsUrl)
    page = await Page.open(cdp, url, injectorSource(clientSource), { trackNetwork: opts.mode === 'pin' })
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
    } else if (opts.mode === 'pin') {
      try {
        await runPinChecks({ page, results, state })
      } finally {
        await cleanupPinnedSessions(page, state)
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
  }

  const skipped = results.skips.length
  const passed = results.rows.filter((row) => row.pass && row.skip !== true).length
  const failed = results.failures.length
  const pageErrors = page !== null ? page.pageErrors : (state.livePageErrors ?? [])
  log('\n=== Results ===')
  for (const row of results.rows) {
    const status = row.skip === true ? 'SKIP' : row.pass ? 'PASS' : 'FAIL'
    log(`${status}  ${row.id}  ${row.title}${row.pass ? '' : `\n        ↳ ${short(row.detail, 700)}`}${row.skip === true ? `\n        ↳ ${short(row.detail, 700)}` : ''}`)
  }
  log(`\nPASS ${passed} / SKIP ${skipped} / FAIL ${failed}`)
  log(`page errors: ${pageErrors.length}`)
  for (const error of pageErrors.slice(0, 8)) log(`  ! ${error}`)
  log(`non-JS console/log errors: ${page !== null ? page.logEntries.length : 0}`)
  for (const entry of (page !== null ? page.logEntries : []).slice(0, 8)) log(`  ! ${entry}`)
  if (page !== null && page.networkFailures !== undefined) {
    log(`network domain: ${page.networkEnabled === true ? 'ENABLED' : `NOT ENABLED — ${page.networkError || 'unknown error'}`}`)
    log(`real network failures: ${page.networkFailures.length}`)
    for (const failure of page.networkFailures.slice(0, 8)) log(`  ! ${failure}`)
    log(`ignored network noise: ${page.ignoredNetworkNoise ?? 0}`)
    const pinRouteFailures = page.pinRouteFailures ?? []
    log(`card pin-route probe failures (expected while the Host route is absent): ${pinRouteFailures.length}`)
    for (const failure of pinRouteFailures.slice(0, 8)) log(`  ! ${failure}`)
    if (page.networkEnabled !== true) exitCode = exitCode || 1
    if (page.networkFailures.length > 0) exitCode = exitCode || 1
    // While the Host route is absent (pinShared=false) its 404s are the documented
    // pre-restart probe; once pinShared=true any pin-route failure is a real defect.
    if (pinRouteFailures.length > 0 && state.pinShared === true) exitCode = exitCode || 1
  }
  if (state.mode === 'pin') {
    log(`pin baseline: pinShared=${state.pinBaseline?.pinShared ?? 'n/a'}; effective pins ${short(JSON.stringify(state.pinBaseline?.effectiveIds ?? null), 200)}; card pinned rows ${state.pinBaseline?.pinnedRows ?? 'n/a'}; cache ${short(state.pinBaseline?.cacheRaw ?? null, 200)}; host route ${state.pinBaseline?.hostStatus === null ? 'unreachable' : `status ${state.pinBaseline?.hostStatus}`}`)
    log(`pin cleanup: ${state.pinCleanup ? short(JSON.stringify(state.pinCleanup), 1600) : 'not run'}`)
  }
  if (state.live === true) {
    log(`live install: non-injected shipped GUI in two fresh profiles; page errors across profiles ${(state.livePageErrors ?? []).length}`)
  }
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
