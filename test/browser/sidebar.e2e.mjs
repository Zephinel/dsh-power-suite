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
 * shell's `@zephinel/dsh-power-suite` registration is loaded from this worktree instead of
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
 *   B2  hover highlight geometry: full-row hover surface like the native rows, fixed-size control highlights
 *       (22 px New session button, 24 px chevron) on the same columns in every row;
 *       revealing the actions moves no column, the main-row New session action
 *       still creates and opens a blank Session, and the 48 px time slot swaps to
 *       the "…" row-menu trigger on highlight (every top-level row including the
 *       current rainbow one; the trigger paints no hover background) and back on
 *       leaving.
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
 *   task-72 the Files header exposes the Artifacts toggle and its animated in-pane
 *       view (enter/exit transition, Back/Esc/theme/reduced-motion/cleanup).
 *   task-74 the composer's multiple pasted screenshots open one continuous gallery
 *       (counter, buttons, arrows, wheel debounce, focus return, clamp on removal,
 *       single-image native lightbox unchanged).
 *
 * Side effects: one blank Session is created through the native New Session button per
 * injected run (full / pin / smoke) and one more through the card's main-row New session
 * action (b2-4; both blank and never typed into); the `--layout` mode is the exception —
 * it needs only the Session the shell already restored, creates none and never types;
 * two tiny generated PNGs are pasted into (and removed again from)
 * that blank Session's composer for the gallery checks; one existing Session row is opened
 * (from the card) to exercise the
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
 * install serves the normal card (ordinary rows + children, zero prefilled pins). The
 * `--layout` mode drags the native sidebar resize handle with real CDP pointer input and
 * checks the persisted/synced sidebar width: handle + measured width (lw-1), live
 * atmosphere canvas on the current row (lw-2), the flicker oracle over a ~10-step drag
 * (lw-3: stable canvas element identity, ≥1 backing-store resize, 0 blank bitmap
 * samples, with `prefers-reduced-motion` forced to no-preference so the oracle always
 * exercises the animated renderer), the localStorage cache + seam `probe()` after the
 * drag (lw-4), reload persistence (lw-5), the Host route + second-fresh-profile
 * cross-device adoption (lw-6, explicit SKIP while the running Host predates the merged
 * route), the collapse→reopen restore of the stored width instead of the native 280 px
 * default (lw-8), and the restore of the pre-run width through the same drag (lw-7). It
 * restores the pre-run width in a `finally` block and reports the residual browser cache /
 * Host document honestly; while the Host route is absent only the throwaway profile's
 * localStorage is written.
 * `--interrupted` mode accepts the interrupted-state consistency fix: through the
 * documented `__POWER_SUITE_TEST_HOOKS__.interruptedSessions` seam it seeds one
 * interrupted-idle record on Sessions the live GUI renders as running, then asserts the
 * card row shows the amber mark + Continue + relative time (iw-1), the stale-running
 * native row reveals the badge and the hover Continue CTA (iw-2, real CDP pointer, never
 * clicked), the composer shows the play control (iw-3), clearing the record restores every
 * surface (iw-4), and real Host-interrupted rows are consistent with their rendered
 * marks (iw-5). It creates no Session and types nothing; every controlled record is
 * cleared in a `finally` block. The `--row-menu` mode accepts the card row "…" menu
 * alignment: it opens the native DSH Session row menu through the native row's own
 * trigger and the card row menu through `.psd-run-more`, captures both, and asserts the
 * card menu is the same native shared popup (surface material/classes, computed material,
 * icon markup, shortcut hints, separators and the afterContent footer) with exactly the
 * Pin/Unpin entry filtered out; it dismisses both with Escape only (no action item is
 * ever clicked) and restores focus to the trigger.
 *
 * Usage:
 *   node test/browser/sidebar.e2e.mjs                 # full run (screenshots into .tmp-work/)
 *   node test/browser/sidebar.e2e.mjs --smoke         # pipeline smoke only
 *   node test/browser/sidebar.e2e.mjs --pin           # pin / hover-dot / native-figure acceptance
 *   node test/browser/sidebar.e2e.mjs --live          # shipped-install check, no client injection
 *   node test/browser/sidebar.e2e.mjs --layout        # sidebar-width drag flicker + persistence + Host sync
 *   node test/browser/sidebar.e2e.mjs --interrupted   # interrupted-state consistency acceptance (controlled seam)
 *   node test/browser/sidebar.e2e.mjs --row-menu      # card row "…" menu = native shared popup parity acceptance
 *   node test/browser/sidebar.e2e.mjs --readme-shots  # raw README/Bento captures (2x, privacy-masked, demo stubs)
 *   node test/browser/sidebar.e2e.mjs --readme-chat   # real-model chat + annotation captures only (clean page, light theme)
 *   node test/browser/sidebar.e2e.mjs --readme-dashboard  # README dashboard poses only (isolated demo instance)
 *   node test/browser/sidebar.e2e.mjs --readme-sidebar-annotation  # sidebar-target annotation raws
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
import { readClientForInjection } from './bundle-client.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKTREE = path.resolve(HERE, '..', '..')
const CLIENT_PATH = path.join(WORKTREE, 'src', 'client.js')
const SHOTS_DIR = path.join(WORKTREE, '.tmp-work', 'sidebar-e2e')
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DSH_WEB_BIN = path.join(homedir(), '.local', 'bin', 'dsh-web')
const VIEWPORT = { width: 1728, height: 900 }

/** Active capture viewport height (the sidebar-annotation pose uses a taller one). */
let README_VIEWPORT_HEIGHT = VIEWPORT.height

// CSS recipe copied from the annotation spec for the F4 simulation: the annotation
// implementer ships the real rule inside ANNOTATION_CSS; the harness injects the same
// rule only while testing the pinned card on this worktree (which predates it).
const ANNOTATION_PIN_CSS =
  "html[data-psa-active='true'] [data-psd-hovercard]{pointer-events:auto;z-index:120!important}"

// --layout mode: persisted, Host-synced sidebar width. The route is owned by the
// `src/features/sidebar-width/` Host half; `SIDEBAR_WIDTH_ROUTE_PATH` is the pathname the
// CDP network oracle classifies separately while the running Host predates it (pre-restart
// 404 probes are the documented missing-route state, never real network failures).
const SIDEBAR_WIDTH_ROUTE_PATH = '/api/power-suite.sidebar-width'
const SIDEBAR_WIDTH_STORAGE_KEY = 'power-suite.sidebar-width'
const SIDEBAR_WIDTH_MIN = 264
const SIDEBAR_WIDTH_MAX = 420
const SIDEBAR_DRAG_TOTAL_PX = 40
const SIDEBAR_DRAG_STEPS = 10
const SIDEBAR_DRAG_STEP_SETTLE_MS = 26
const LAYOUT_EVIDENCE_DIR = path.join(WORKTREE, '.tmp-work', 'sidebar-width', 'e2e')
// --interrupted mode: the live Host route that reports one Session's last-turn state and
// the gitignored evidence directory for the controlled-seam logs/screenshots.
const INTERRUPTED_ROUTE_PATH = '/api/power-suite.interrupted'
const INTERRUPTED_EVIDENCE_DIR = path.join(WORKTREE, '.tmp-work', 'interrupted-state', 'e2e')
// Localized Continue labels from the plugin's interrupted dictionaries (en / zh). The
// composer play control and the row CTAs use the same `continue.aria` string.
const INTERRUPTED_CONTINUE_LABEL = /^(Continue the unfinished task|继续未完成的任务)$/
const INTERRUPTED_BADGE_LABEL = /^(Task did not finish|任务未完成)$/

// --row-menu mode: the card row "…" menu must be the native shared context-menu popup.
// Evidence (captured menu facts + comparison) is written to this gitignored directory.
const ROW_MENU_EVIDENCE_DIR = path.join(WORKTREE, '.tmp-work', 'row-menu', 'e2e')
// Pin/Unpin label shapes in the native session menu (EN / ZH); the card menu must filter
// exactly these entries out because its title-left pin button owns pinning.
const ROW_MENU_PIN_LABEL = /^((un)?pin( session)?|(取消)?(固定|置顶))$/iu

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
    else if (arg === '--layout') opts.mode = 'layout'
    else if (arg === '--interrupted') opts.mode = 'interrupted'
    else if (arg === '--row-menu') opts.mode = 'row-menu'
    else if (arg === '--readme-shots') opts.mode = 'readme-shots'
    else if (arg === '--readme-chat') opts.mode = 'readme-chat'
    else if (arg === '--readme-dashboard') { opts.mode = 'readme-shots'; opts.dashboardOnly = true }
    else if (arg === '--readme-sidebar-annotation') opts.mode = 'readme-sidebar-annotation'
    else if (arg === '--no-shots') opts.shots = false
    else if (arg === '--keep-open') opts.keepOpen = true
    else if (arg === '--headful') opts.headful = true
    else if (arg === '--client') opts.clientPath = path.resolve(argv[++i])
    else if (arg.startsWith('--client=')) opts.clientPath = path.resolve(arg.slice('--client='.length))
    else if (arg === '--url') opts.url = argv[++i]
    else if (arg.startsWith('--url=')) opts.url = arg.slice('--url='.length)
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node test/browser/sidebar.e2e.mjs [--smoke] [--pin] [--live] [--layout] [--interrupted] [--row-menu] [--readme-shots] [--readme-chat] [--readme-dashboard] [--readme-sidebar-annotation] [--no-shots] [--client path] [--keep-open] [--headful] [--url TOKEN_URL]')
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
      height: options.viewportHeight ?? VIEWPORT.height,
      deviceScaleFactor: options.deviceScaleFactor ?? 1,
      mobile: false,
    })
    if (initScript) await page.addInitScript(initScript)
    if (typeof options.beforeNavigate === 'function') await options.beforeNavigate(page)
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
    this.sidebarWidthRouteFailures = []
    this.sidebarWidthRouteWrites = []
    this.shellProbeFailures = []
    this.ignoredNetworkNoise = 0
    this._networkRequests = new Map()
    this.pinRouteWrites = []
    this._subscriptions.push(this.cdp.on('Network.requestWillBeSent', (params, eventSession) => {
      if (eventSession !== this.sessionId || !params.request) return
      this._networkRequests.set(params.requestId, { url: params.request.url, type: params.type })
      // Pin-route writes are the only state mutation this run performs; log each one so a
      // residual Host pin can be attributed to an action in the run log.
      let pathname = ''
      try {
        pathname = new URL(params.request.url).pathname
      } catch {
        pathname = ''
      }
      if (pathname === '/api/power-suite.session-pins' && params.request.method === 'POST') {
        const write = { at: Date.now(), postData: String(params.request.postData ?? '') }
        this.pinRouteWrites.push(write)
        log(`pin route POST ${write.postData}`)
      }
      // `--layout` writes only the sidebar width; log every POST so a residual Host
      // document change (route live) is attributable to an action in the run log.
      if (pathname === SIDEBAR_WIDTH_ROUTE_PATH && params.request.method === 'POST') {
        const write = { at: Date.now(), postData: String(params.request.postData ?? '') }
        this.sidebarWidthRouteWrites.push(write)
        log(`sidebar-width route POST ${write.postData}`)
      }
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
        else if (pathname === SIDEBAR_WIDTH_ROUTE_PATH) this.sidebarWidthRouteFailures.push(`HTTP ${response.status} ${type} ${redact(response.url)}`)
        else if (pathname === '/api/changes.summary' && response.status === 404) this.shellProbeFailures.push(`HTTP ${response.status} ${type} ${redact(response.url)}`)
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
      else if (requestPath === SIDEBAR_WIDTH_ROUTE_PATH) this.sidebarWidthRouteFailures.push(failure)
      else if (requestPath === '/api/changes.summary') this.shellProbeFailures.push(failure)
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
    const ID = '@zephinel/dsh-power-suite'
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

/**
 * Internal signal: one check discovered it cannot run in this live data state.
 * Throwing it from a check callback records exactly ONE SKIP row (never a SKIP
 * plus a PASS under the same id).
 */
class CheckSkip extends Error {
  constructor(reason) {
    super(reason)
    this.name = 'CheckSkip'
  }
}

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
      if (error instanceof CheckSkip) {
        this.rows.push({ id, title, pass: true, skipped: true, detail: error.message, ms: Date.now() - started })
        log(`SKIP  ${id}  ${title} — ${error.message}`)
        return
      }
      const detail = error?.message || String(error)
      this.rows.push({ id, title, pass: false, detail, ms: Date.now() - started })
      log(`FAIL  ${id}  ${title} — ${short(detail, 400)}`)
    }
  }

  /**
   * Record an explicit SKIP row: the check could not run in this live data state.
   * Skipped rows count as neither pass nor fail; the run stays green but the
   * reason is printed and the summary shows the SKIP count.
   * @param {string} id - check id.
   * @param {string} title - check title.
   * @param {string} reason - human-readable skip reason.
   * @returns {Promise<void>} resolves when the row is recorded.
   */
  async skip(id, title, reason) {
    this.rows.push({ id, title, pass: true, skipped: true, detail: reason, ms: 0 })
    log(`SKIP  ${id}  ${title} — ${reason}`)
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
    const rows = [...document.querySelectorAll('.psd-run, .psd-child')].map((el) => {
      const titleElement = el.querySelector('.psd-run-title, .psd-child-title')
      const openButton = el.querySelector('.psd-run-open')
      return {
      kind: el.classList.contains('psd-run') ? 'parent' : 'child',
      state: el.dataset.state,
      dataActions: el.getAttribute('data-actions'),
      rect: rect(el),
      title: titleOf(el, '.psd-run-title, .psd-child-title'),
      titleShift: titleElement === null ? null : (Number.parseFloat(getComputedStyle(titleElement).getPropertyValue('--psd-title-shift')) || 0),
      titleMarginLeft: openButton === null ? null : Number.parseFloat(getComputedStyle(openButton).marginLeft),
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
      }
    })
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
      rowBackground: hoveredRow ? getComputedStyle(hoveredRow).backgroundColor : null,
      rowRect: rect(hoveredRow),
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

  /**
   * Light/dark contrast facts for atmosphere rows: reconstructs the rendered
   * backdrop from the canvas pixel + multiply/screen blend + wrapper opacity +
   * scrim, then compares it with the computed text/icon colours (WCAG sRGB
   * relative luminance). Documented estimate: three canvas samples per row.
   */
  atmosContrast: () => {
    const parseColor = (text) => {
      const match = text === null || text === undefined ? null : text.match(/rgba?\(([^)]+)\)/)
      if (match === null) return null
      const parts = match[1].split(',').map((part) => Number(part.trim()))
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts.length > 3 ? parts[3] : 1 }
    }
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const c = Math.max(0, Math.min(255, value)) / 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const contrast = (a, b) => {
      const la = luminance(a)
      const lb = luminance(b)
      return Number(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2))
    }
    const mix = (base, layer, alpha) => ({
      r: Math.round(layer.r * alpha + base.r * (1 - alpha)),
      g: Math.round(layer.g * alpha + base.g * (1 - alpha)),
      b: Math.round(layer.b * alpha + base.b * (1 - alpha)),
    })
    const blendChannel = (base, layer, mode) => {
      const b = Math.max(0, Math.min(255, base))
      const l = Math.max(0, Math.min(255, layer))
      if (mode === 'multiply') return (b * l) / 255
      if (mode === 'screen') return 255 - ((255 - b) * (255 - l)) / 255
      return l
    }
    const backdropOf = (row, panel) => {
      const wrapper = [...row.children].find((node) => node instanceof HTMLElement && node.classList.contains('psd-atmos'))
      if (wrapper === undefined) return null
      const canvas = wrapper.querySelector('canvas.psd-atmos-canvas')
      const scrim = wrapper.querySelector('.psd-atmos-scrim')
      if (canvas === null || scrim === null) return null
      const ctx = canvas.getContext('2d')
      if (ctx === null || canvas.width === 0 || canvas.height === 0) return null
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const mode = getComputedStyle(canvas).mixBlendMode
      const wrapperStyle = getComputedStyle(wrapper)
      const opacity = Number(wrapperStyle.opacity)
      const scrimColor = parseColor(getComputedStyle(scrim).backgroundImage) ?? { r: 255, g: 255, b: 255, a: 0 }
      const panelBg = parseColor(getComputedStyle(panel).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }
      const samples = [0.2, 0.5, 0.78].map((fx) => {
        const x = Math.min(canvas.width - 1, Math.floor(canvas.width * fx))
        const y = Math.floor(canvas.height / 2)
        const index = (y * canvas.width + x) * 4
        return { r: image[index], g: image[index + 1], b: image[index + 2], a: image[index + 3] / 255 }
      })
      const backdrops = samples.map((pixel) => {
        const blended = {
          r: blendChannel(panelBg.r, pixel.r, mode),
          g: blendChannel(panelBg.g, pixel.g, mode),
          b: blendChannel(panelBg.b, pixel.b, mode),
        }
        const afterCanvas = mix(panelBg, blended, pixel.a)
        const afterOpacity = mix(panelBg, afterCanvas, opacity)
        return mix(afterOpacity, scrimColor, scrimColor.a)
      })
      const average = {
        r: Math.round((backdrops[0].r + backdrops[1].r + backdrops[2].r) / 3),
        g: Math.round((backdrops[0].g + backdrops[1].g + backdrops[2].g) / 3),
        b: Math.round((backdrops[0].b + backdrops[1].b + backdrops[2].b) / 3),
      }
      return { wrapper, canvas, scrim, mode, opacity, scrimColor, backdrops, average, panelBg }
    }
    const colorOf = (node) => node === null ? null : parseColor(getComputedStyle(node).color)
    const describe = (node) => node === null ? null : String(node.className ?? node.tagName).slice(0, 48)
    const panel = document.querySelector('.psd-panel')
    if (panel === null) return null
    const perHost = (host, kind) => {
      const backdrop = backdropOf(host, panel)
      if (backdrop === null) return null
      const titleNode = host.querySelector('.psd-run-title, .psd-child-title')
      const timeNode = host.querySelector('.psd-run-time, .psd-child-time')
      const toggleNode = host.querySelector('.psd-run-toggle, .psd-run-toggle-spacer')
      const actionNode = host.querySelector('.psd-row-action')
      const glyphNode = host.querySelector('.psd-run-glyph, .psd-child-glyph')
      const named = (node) => {
        const color = colorOf(node)
        return color === null ? null : { color: [color.r, color.g, color.b], contrast: Math.min(...backdrop.backdrops.map((bg) => contrast(color, bg))) }
      }
      // Native rows: collect the worst-contrast text colour among descendants.
      let minText = null
      for (const node of host.querySelectorAll('*')) {
        if (node.closest('.psd-atmos') !== null) continue
        const color = colorOf(node)
        if (color === null || color.a === 0) continue
        const hasText = [...node.childNodes].some((child) => child.nodeType === 3 && (child.textContent ?? '').trim().length > 0)
        if (!hasText) continue
        const nodeRect = node.getBoundingClientRect()
        if (nodeRect.width < 4 || nodeRect.height < 4) continue
        const value = Math.min(...backdrop.backdrops.map((bg) => contrast(color, bg)))
        if (minText === null || value < minText.contrast) minText = { color: [color.r, color.g, color.b], contrast: value, className: describe(node), text: (node.textContent ?? '').trim().slice(0, 24) }
      }
      return {
        kind,
        rowRect: { width: Math.round(host.getBoundingClientRect().width), height: Math.round(host.getBoundingClientRect().height) },
        blend: backdrop.mode,
        opacity: backdrop.opacity,
        scrim: [backdrop.scrimColor.r, backdrop.scrimColor.g, backdrop.scrimColor.b, backdrop.scrimColor.a],
        backdrop: backdrop.average,
        panelBg: [backdrop.panelBg.r, backdrop.panelBg.g, backdrop.panelBg.b],
        title: named(titleNode),
        time: named(timeNode),
        toggle: named(toggleNode),
        action: named(actionNode),
        glyph: named(glyphNode),
        minText,
      }
    }
    const card = document.querySelector('.psd-run-current, .psd-child-current')
    const workspace = document.querySelector('[data-psd-current-workspace="true"]')
    const session = document.querySelector('[data-psd-current-session="true"]')
    return {
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      card: card === null ? null : perHost(card, card.classList.contains('psd-run-current') ? 'parent' : 'child'),
      workspace: workspace === null ? null : perHost(workspace, 'workspace'),
      session: session === null ? null : perHost(session, 'session'),
    }
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

async function runSmoke({ page, results, state, opts }) {
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
  if (opts !== undefined && (opts.mode === 'layout' || opts.mode === 'interrupted' || opts.mode === 'row-menu')) {
    // `--layout` / `--interrupted` only need the Session the shell already restored;
    // they never type and must not create a Session — `ensureBlankSession` can open a
    // new blank Session on the Host and switch the live GUI, which these modes avoid.
    await results.check('smoke-3', 'a current Session is open; the mode leaves it untouched (never creates or types into a Session)', async () => {
      // The shell restores the last-viewed Session asynchronously after the shell mounts.
      await page.waitForFn(() => !!document.querySelector('[data-conversation-session]'), [], { timeout: 15000, label: 'restored current Session' }).catch(() => {})
      const current = await page.eval(() => {
        const session = document.querySelector('[data-conversation-session]')
        const editor = document.querySelector('[data-lexical-editor="true"]')
        return {
          sessionId: session === null ? null : session.getAttribute('data-conversation-session'),
          hasComposer: editor !== null,
          messages: document.querySelectorAll('[data-conversation-message]').length,
          draftLength: editor === null ? 0 : (editor.innerText || '').trim().length,
        }
      })
      assert(current.sessionId !== null,
        'no Session is open in the live GUI. The current-row / composer surfaces need one; start or keep a Session open and rerun (this mode never creates or types into Sessions).')
      state.sessionId = current.sessionId
      return `current Session ${current.sessionId} (${current.messages} transcript message(s), draft ${current.draftLength} char(s), composer ${current.hasComposer ? 'present' : 'absent'}) — untouched`
    })
  } else {
    await results.check('smoke-3', 'blank Session open/verified (never typed into)', async () => {
      const blank = await ensureBlankSession(page)
      state.sessionId = blank.sessionId
      return `blank Session ${blank.sessionId}, 0 messages, empty draft`
    })
  }
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
    assert(parentHeights.every((height) => height === parentHeights[0]) && childHeights.every((height) => height === childHeights[0]), `row heights must stay uniform (parents ${JSON.stringify(parentHeights)}, children ${JSON.stringify(childHeights)})`)
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

  await results.check('b2-1', 'hover reveals a fixed-size New session highlight on a full-row surface', async () => {
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
    const row = hovered.rowRect
    assert(row, 'hovered row rect missing')
    assert(hovered.rowBackground !== 'rgba(0, 0, 0, 0)', 'hovered row has no surface background (full-row hover)')
    assert(row.width >= state.geometry.panel.width - 16, `the hover surface must span the row, not just the title (row ${row.width}px vs panel ${state.geometry.panel.width}px)`)
    assertEqual(hovered.mainBackground, 'rgba(0, 0, 0, 0)', 'the inner body must stay transparent (no nested second pill)')
    state.hover = hovered
    return `row surface ${row.width}x${row.height} ${hovered.rowBackground}, New session ${action.width}x${action.height} at right ${action.right} of slot ${hovered.slotRect.right}, top ${target.rowTop}`
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

  await results.check('b2-3', 'the time↔"…" row-menu swap follows highlight on every top-level row; only the rainbow row suppresses the trigger hover paint', async () => {
    await page.moveTo(900, 500)
    await sleep(250)
    const before = await page.eval(probe.panelGeometry)
    const parentIndex = state.geometry.rows.findIndex((row) => row.kind === 'parent')
    // `panelGeometry` returns a title OBJECT ({rect, style, text, ...}); the row
    // helpers match on the plain title string, so pass `.text` (a JSON-stringified
    // object can never equal the rendered row title).
    const parentTitle = state.geometry.rows[parentIndex]?.title?.text ?? ''
    assert(parentTitle.length > 0, 'the parent row title text is missing for the row-menu check')
    const hoveredIndex = before.rows.findIndex((row) => row.kind === 'parent')
    const parentRowIndex = before.rows.slice(0, hoveredIndex).filter((row) => row.kind === 'parent').length
    const menuFactsOf = (rowIndex) => page.eval((index) => {
      const row = [...document.querySelectorAll('.psd-run')][index]
      if (row === undefined) return null
      const styleOf = (node) => (node === null ? null : getComputedStyle(node))
      const time = row.querySelector('.psd-run-time')
      const more = row.querySelector('.psd-run-more')
      return {
        current: row.classList.contains('psd-run-current'),
        timeOpacity: time === null ? null : styleOf(time).opacity,
        morePresent: more !== null,
        moreOpacity: more === null ? null : styleOf(more).opacity,
        moreVisibility: more === null ? null : styleOf(more).visibility,
        morePointerEvents: more === null ? null : styleOf(more).pointerEvents,
      }
    }, rowIndex)
    // At rest every top-level row keeps its time and hides the "…" trigger.
    const rest = await menuFactsOf(parentRowIndex)
    assert(rest !== null, 'the resting parent row was not found for the row-menu check')
    assert(rest.morePresent, 'every top-level row must render the "…" trigger')
    assertEqual(rest.timeOpacity, '1', `a resting top-level row must keep its time (opacity ${rest.timeOpacity})`)
    assertEqual(rest.moreOpacity, '0', `the "…" trigger must be hidden at rest (opacity ${rest.moreOpacity})`)
    assertEqual(rest.moreVisibility, 'visible', `the "…" trigger stays focusable; only its opacity hides it (${rest.moreVisibility})`)
    await hoverRow(page, parentIndex)
    await sleep(650)
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
      // Fixed trailing columns never move (the reveal widens the pill into the title).
      for (const key of ['time', 'actions', 'toggle']) {
        if (was[key] === null || now[key] === null) continue
        assertNear(now[key][0], was[key][0], 0.5, `row ${index} ${key} left edge moved on hover (${was[key][0]} -> ${now[key][0]})`)
        assertNear(now[key][1], was[key][1], 0.5, `row ${index} ${key} right edge moved on hover (${was[key][1]} -> ${now[key][1]})`)
      }
      if (was.title === null || now.title === null) continue
      if (index === hoveredIndex) {
        // The hovered row's title slides right as the pin slot expands (16 px slot +
        // 9 px gap) while the default-state first-character centring shift (1–3 px) is
        // removed, so the derived slide is 25 − shift rather than a fixed 25.
        const restMargin = Number(before.rows[hoveredIndex].titleMarginLeft ?? before.rows[hoveredIndex].titleShift ?? 0)
        assertNear(now.title[0] - was.title[0], 25 - restMargin, 1,
          `the hovered row title must slide 25 − measured rest marginLeft = ${(25 - restMargin).toFixed(2)} px (marginLeft ${restMargin}; ${was.title[0]} -> ${now.title[0]})`)
      } else {
        assertNear(now.title[0], was.title[0], 0.5, `row ${index} title left edge moved on hover (${was.title[0]} -> ${now.title[0]})`)
      }
    }
    // Uniform row-menu rule: on highlight the time hides and the "…" trigger appears
    // (same for the current rainbow row); the swap is kept while the menu is open.
    const hoveredMenu = await menuFactsOf(parentRowIndex)
    assert(hoveredMenu !== null, 'the hovered parent row disappeared during the row-menu check')
    assertEqual(hoveredMenu.timeOpacity, '0', `a highlighted top-level row must hide its time (opacity ${hoveredMenu.timeOpacity})`)
    assertEqual(hoveredMenu.moreOpacity, '1', `the "…" trigger must reveal on highlight (opacity ${hoveredMenu.moreOpacity})`)
    assertEqual(hoveredMenu.moreVisibility, 'visible', `the "…" trigger must be visible on highlight (${hoveredMenu.moreVisibility})`)
    assertEqual(hoveredMenu.morePointerEvents, 'auto', `the "…" trigger must be interactive on highlight (${hoveredMenu.morePointerEvents})`)
    // Ordinary rows paint the same soft hover background as their New session
    // control; the rainbow row suppresses it and keeps only brightness(1.2).
    const trigger = await hoverCardControl(page, 'parent', parentTitle, '.psd-run-more')
    if (hoveredMenu.current) {
      assertEqual(trigger.background, 'rgba(0, 0, 0, 0)', `the rainbow row's "…" trigger must paint no hover background (${trigger.background})`)
      assertEqual(trigger.filter, 'brightness(1.2)', `the rainbow row's "…" trigger hover must keep its brightness suppression (filter ${trigger.filter})`)
    } else {
      assert(trigger.background !== 'rgba(0, 0, 0, 0)', `an ordinary row's "…" trigger must keep its soft hover background (${trigger.background})`)
      assertEqual(trigger.filter, 'none', `an ordinary row's "…" trigger must not carry the atmosphere lift (filter ${trigger.filter})`)
    }
    assertEqual(await page.eval(() => document.querySelectorAll('.psd-child .psd-run-more').length), 0,
      'subagent rows must not render the "…" trigger')
    await page.moveTo(900, 500)
    await sleep(500)
    const restored = await page.eval((title) => {
      const row = [...document.querySelectorAll('.psd-run')]
        .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === title)
      if (row === undefined) return null
      const time = row.querySelector('.psd-run-time')
      const more = row.querySelector('.psd-run-more')
      return {
        timeOpacity: time === null ? null : getComputedStyle(time).opacity,
        moreVisibility: more === null ? null : getComputedStyle(more).visibility,
      }
    }, parentTitle)
    assert(restored !== null, `the hovered row "${short(parentTitle, 40)}" disappeared after the pointer left`)
    assertEqual(restored.timeOpacity, '1', `the time must return after the pointer leaves (opacity ${restored.timeOpacity})`)
    const hoveredMargin = Number(before.rows[hoveredIndex].titleMarginLeft ?? before.rows[hoveredIndex].titleShift ?? 0)
    return `rest: time visible / "…" hidden; hover: time hidden / "…" visible with the ordinary hover paint${hoveredMenu.current ? ' suppressed on the rainbow row (brightness(1.2))' : ''}; columns fixed (time ${before.rows[0].time.rect.right}, action ${before.rows[0].actions.rect.right}, disclosure ${before.rows[0].toggle.right}); hovered title slid ${before.rows[hoveredIndex].title.rect.left} -> ${during.rows[hoveredIndex].title.rect.left} = 25 − rest marginLeft ${hoveredMargin} (two-phase reveal); subagent rows have no trigger; leaving restores the time`
  })

  await results.check('b2-5', 'the interrupted Continue triangle sits immediately after the badge and never moves the time column', async () => {
    const measured = await page.eval(() => {
      const row = document.querySelector('.psd-run')
      if (!row) return null
      const time = row.querySelector('.psd-run-time')
      const main = row.querySelector('.psd-run-main')
      const head = row.querySelector('.psd-run-head')
      if (!time || !main || !head) return null
      const before = time.getBoundingClientRect()
      // The real inline button only renders for an interrupted Session. Probe the
      // shipped CSS contract with a stand-in that mirrors the real row head order:
      // a 16 px leading cell holding the badge, then the 22 px Continue slot
      // (badge and triangle separated by the leading cell's 9 px rest margin), then
      // the untouched real head content. Everything is removed again.
      const badge = document.createElement('span')
      badge.className = 'psd-interrupted'
      const probeGlyph = document.createElement('span')
      probeGlyph.className = 'psd-run-glyph-cell'
      probeGlyph.appendChild(badge)
      const slot = document.createElement('span')
      slot.className = 'psd-continue-slot'
      slot.style.width = '22px'
      slot.style.opacity = '1'
      slot.style.marginLeft = '0px'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'psd-continue-inline'
      slot.appendChild(button)
      head.insertBefore(probeGlyph, head.firstChild)
      head.insertBefore(slot, probeGlyph.nextSibling)
      const glyphRect = probeGlyph.getBoundingClientRect()
      const badgeRect = badge.getBoundingClientRect()
      const probeRect = button.getBoundingClientRect()
      const timeRect = time.getBoundingClientRect()
      const mainRect = main.getBoundingClientRect()
      probeGlyph.remove()
      slot.remove()
      const after = time.getBoundingClientRect()
      return {
        rowRight: Math.round(row.getBoundingClientRect().right),
        probeLeft: Math.round(probeRect.left),
        probeRight: Math.round(probeRect.right),
        probeWidth: Math.round(probeRect.width),
        probeHeight: Math.round(probeRect.height),
        badgeLeft: Math.round(badgeRect.left),
        badgeRight: Math.round(badgeRect.right),
        glyphRight: Math.round(glyphRect.right),
        timeLeft: Math.round(timeRect.left),
        mainLeft: Math.round(mainRect.left),
        timeShift: Math.round(after.left - before.left),
      }
    })
    assert(measured, 'no parent card row to probe the inline Continue button against')
    assertEqual(measured.probeWidth, 22, 'inline Continue width')
    assertEqual(measured.probeHeight, 22, 'inline Continue height')
    assert(measured.probeLeft >= measured.badgeRight - 0.5, `inline Continue must not overlap the interrupted badge (triangle left ${measured.probeLeft}, badge right ${measured.badgeRight})`)
    assertNear(measured.probeLeft, measured.glyphRight + 9, 1.5, `inline Continue must start after the leading cell's 9 px rest gap (triangle left ${measured.probeLeft}, leading cell right ${measured.glyphRight})`)
    assertNear(measured.probeLeft - measured.badgeRight, 10, 1, `inline Continue must sit immediately after the interrupted badge (9 px cell rest gap + 1 px badge centring; gap ${measured.probeLeft - measured.badgeRight})`)
    assert(measured.probeRight < measured.timeLeft, `inline Continue (right ${measured.probeRight}) must stay left of the time column (${measured.timeLeft})`)
    assertEqual(measured.timeShift, 0, 'inline Continue must not move the time column')
    return `inline Continue 22x22 at ${measured.probeLeft}-${measured.probeRight} after badge ${measured.badgeLeft}-${measured.badgeRight} (leading cell right ${measured.glyphRight}); time column ${measured.timeLeft} unmoved`
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
  const lightGas = atmos.canvas !== null && atmos.canvas.mixBlendMode === 'multiply'
  if (lightGas) {
    assert(atmos.opacity >= 0.5 && atmos.opacity <= 0.72, `${label}: light-mode atmosphere must stay an airy veil (opacity ${atmos.opacity}; light baseline .56 active / .68 hover)`)
  } else {
    assert(atmos.opacity >= 0.7 && atmos.opacity <= 1, `${label}: atmosphere must be visible and vivid (opacity ${atmos.opacity}; dark baseline .78)`)
  }
  assert(atmos.canvas, `${label}: atmosphere has no canvas`)
  assert(atmos.canvas.width > 0 && atmos.canvas.height > 0, `${label}: atmosphere canvas has no drawing buffer (${atmos.canvas.width}x${atmos.canvas.height})`)
  assert(atmos.canvas.painted > 0, `${label}: atmosphere canvas painted no rainbow pixels`)
  assert(atmos.canvas.filter.includes('blur'), `${label}: atmosphere canvas must keep the gas blur (${atmos.canvas.filter})`)
  if (lightGas) {
    assert(atmos.canvas.filter.includes('saturate(1.22)') && atmos.canvas.filter.includes('brightness(1.22)'), `${label}: light-mode canvas must keep the brighter/softer pastel filter (${atmos.canvas.filter})`)
  } else {
    assert(atmos.canvas.filter.includes('saturate(1.5)'), `${label}: atmosphere canvas must keep the vivid saturate(1.5) baseline (${atmos.canvas.filter})`)
  }
  const saturationMin = options.saturationMin ?? (lightGas ? 0.3 : 0.38)

  assert(atmos.canvas.avgSaturationStrong >= saturationMin, `${label}: atmosphere colours must stay vivid, not grey (blob-core saturation ${atmos.canvas.avgSaturationStrong}, all-pixel ${atmos.canvas.avgSaturation}, minimum ${saturationMin}; grey baseline was ~0.25)`)
  assert(['multiply', 'screen'].includes(atmos.canvas.mixBlendMode), `${label}: atmosphere canvas must keep a vivid blend mode (${atmos.canvas.mixBlendMode})`)
  assertEqual(atmos.canvas.pointerEvents, 'none', `${label}: atmosphere canvas must not capture the pointer`)
  assert(atmos.scrim, `${label}: atmosphere has no contrast scrim`)
  for (const side of ['left', 'right', 'top', 'bottom']) {
    assertNear(atmos.scrim.rect[side], box[side], 1, `${label}: scrim must cover the row's paint box (${side})`)
  }
  assertEqual(atmos.scrim.pointerEvents, 'none', `${label}: scrim must not capture the pointer`)
  assert(atmos.scrim.backgroundImage.includes('linear-gradient'), `${label}: scrim must be a gradient (${short(atmos.scrim.backgroundImage, 90)})`)
  const scrimAlphas = [...atmos.scrim.backgroundImage.matchAll(/rgba\([^)]*?,\s*([0-9.]+)\)/g)].map((match) => Number(match[1]))
  assert(scrimAlphas.length > 0, `${label}: scrim alpha could not be read (${atmos.scrim.backgroundImage})`)
  if (lightGas) {
    assert(/rgba\(255,\s*255,\s*255,/.test(atmos.scrim.backgroundImage), `${label}: light-mode scrim must be the white readability veil (${short(atmos.scrim.backgroundImage, 90)})`)
    assert(Math.max(...scrimAlphas) >= 0.4 && Math.max(...scrimAlphas) <= 0.75, `${label}: light-mode veil alpha must sit in the readable range (max alpha ${Math.max(...scrimAlphas)})`)
  } else {
    assert(Math.max(...scrimAlphas) <= 0.24, `${label}: dark-mode scrim must stay light enough to keep the gas vivid (max alpha ${Math.max(...scrimAlphas)})`)
  }
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
  // Live-data skip: with no Running & recent card row the whole B4 block cannot
  // run; skipping explicitly beats a 15 s b4-0 timeout plus cascading failures.
  // A row that exists but cannot be opened still fails below (real product issue).
  const cardRows = await page.eval(() => document.querySelectorAll('.psd-run').length)
  if (cardRows === 0) {
    const reason = 'no Running & recent card rows in this live data state — B4 atmosphere block explicitly skipped (retry with a data state that lists a row)'
    const skipped = [
      ['b4-0', 'open a card row to make its Session current'],
      ['b4-1', 'card row, owning Workspace row and open Session row paint the clipped internal atmosphere (light mode)'],
      ['b4-2', 'opening another sidebar Session moves the marker and the atmosphere with it'],
      ['b4-3', 'reduced motion keeps the static internal rainbow fill and stops the renderer'],
      ['b4-4', 'a nested child current row paints the same atmosphere inside its own rounded rect'],
      ['b4-5', 'dark theme keeps the atmosphere vivid (screen blend, high saturation, light scrim)'],
      ['b4-9', 'light-mode atmosphere rows keep readable text/icons (dark mode unchanged)'],
      ['b4-13', 'running-panel row text uses the native Workspace tokens in light mode (dark unchanged)'],
      ['b4-14', 'running-panel icon colours match or beat the native Workspace icon weight in light mode'],
      ['b4-15', 'highlighted-row New-session action darkens on hover like the pin control (light + dark)'],
    ]
    for (const [id, title] of skipped) await results.skip(id, title, reason)
    return
  }
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

  await results.check('b4-1', 'card row, owning Workspace row and open Session row paint the clipped internal atmosphere (light mode)', async () => {
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(600)
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
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
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

  await results.check('b4-5', 'dark theme keeps a soft luminous atmosphere (screen blend, pastel veil)', async () => {
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
        assertEqual(atmos.canvas.mixBlendMode, 'screen', `${label}: dark theme must keep the light-adding screen blend`)
        assert(atmos.canvas.filter.includes('saturate(1.15)'), `${label}: dark theme must keep the rainbow chroma (${atmos.canvas.filter})`)
        assert(atmos.canvas.filter.includes('brightness(1.45)'), `${label}: dark theme must stay luminous without graying out (${atmos.canvas.filter})`)
        assert(atmos.canvas.avgSaturationStrong >= 0.20, `${label}: lighter pastel atmosphere must stay colorful (blob-core saturation ${atmos.canvas.avgSaturationStrong})`)
        assert(atmos.opacity >= 0.54 && atmos.opacity <= 0.70, `${label}: dark theme atmosphere opacity must be the lighter range (${atmos.opacity})`)
        assert(atmos.scrim !== null && /rgba\(255, 255, 255/.test(atmos.scrim.backgroundImage), `${label}: dark theme scrim must be a light veil, not a dark one (${atmos.scrim?.backgroundImage})`)
        details.push(`${label} sat ${atmos.canvas.avgSaturation} opacity ${atmos.opacity} blend ${atmos.canvas.mixBlendMode}`)
      }
      return details.join('; ')
    } finally {
      await page.emulateMedia([])
      await sleep(500)
    }
  })

  await results.check('b4-9', 'light-mode atmosphere rows keep readable text/icons (dark softened)', async () => {
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(900)
      // Make the marked native Workspace row visible (expand it if collapsed).
      await page.eval(() => {
        const row = document.querySelector('[data-psd-current-workspace="true"]')
        if (row instanceof HTMLElement && row.getAttribute('aria-expanded') === 'false') row.click()
      })
      await sleep(700)
      const light = await page.eval(probe.atmosContrast)
      assert(light && light.card, 'no current card row to measure in light mode')
      const assertHost = (label, host, thresholds) => {
        assert(host, `${label}: atmosphere contrast facts missing`)
        const backdropText = `rgb(${host.backdrop.r},${host.backdrop.g},${host.backdrop.b})`
        assertEqual(host.blend, 'multiply', `${label}: light theme must keep the multiply gas blend`)
        assert(host.scrim[0] >= 200 && host.scrim[1] >= 200 && host.scrim[2] >= 200, `${label}: light-mode scrim must be a light veil (got rgb(${host.scrim.slice(0, 3).join(',')}))`)
        assert(host.scrim[3] >= 0.35, `${label}: light-mode scrim alpha must be >= 0.35 to lift the pastel (got ${host.scrim[3]})`)
        assert(host.opacity <= 0.72, `${label}: light-mode atmosphere opacity must stay <= 0.72 (got ${host.opacity})`)
        if (host.title !== null) {
          assert(host.title.contrast >= thresholds.title, `${label}: title contrast ${host.title.contrast}:1 must be >= ${thresholds.title}:1 against the local backdrop ${backdropText}`)
        }
        if (host.time !== null) {
          assert(host.time.contrast >= thresholds.time, `${label}: time contrast ${host.time.contrast}:1 must be >= ${thresholds.time}:1 against the local backdrop ${backdropText}`)
        }
        if (host.minText !== null) {
          assert(host.minText.contrast >= thresholds.minText, `${label}: worst text contrast ${host.minText.contrast}:1 ("${short(host.minText.text, 24)}") must be >= ${thresholds.minText}:1`)
        }
        for (const key of ['toggle', 'action', 'glyph']) {
          if (host[key] !== null) {
            assert(host[key].contrast >= thresholds.control, `${label}: ${key} contrast ${host[key].contrast}:1 must be >= ${thresholds.control}:1`)
          }
        }
        return `${label} title ${host.title?.contrast ?? 'n/a'}:1, time ${host.time?.contrast ?? 'n/a'}:1, worst text ${host.minText?.contrast ?? 'n/a'}:1 (backdrop rgb(${host.backdrop.r},${host.backdrop.g},${host.backdrop.b}))`
      }
      const summaries = [assertHost('card row', light.card, { title: 4.5, time: 4.5, minText: 4.5, control: 3 })]
      if (light.workspace !== null) summaries.push(assertHost('native Workspace row', light.workspace, { title: 4.5, time: 3, minText: 3, control: 3 }))
      if (light.session !== null) summaries.push(assertHost('native Session row', light.session, { title: 4.5, time: 3, minText: 3, control: 3 }))
      await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
      await sleep(900)
      const dark = await page.eval(probe.atmosContrast)
      assert(dark && dark.card, 'no current card row to measure in dark mode')
      assertEqual(dark.card.blend, 'screen', 'dark theme must keep the screen gas blend')
      assert(dark.card.scrim[0] >= 200 && dark.card.scrim[1] >= 200, `dark theme must use the softened light veil scrim (got rgb(${dark.card.scrim.slice(0, 3).join(',')}))`)
      assert(dark.card.opacity >= 0.54 && dark.card.opacity <= 0.70, `dark theme atmosphere opacity must be in the lighter range (got ${dark.card.opacity})`)
      // The owner asked for a lighter dark pill; keep the readability floor at 2.5:1.
      assert(dark.card.title.contrast >= 2.5, `dark title contrast ${dark.card.title.contrast}:1 must stay readable on the lighter pill`)
      return `${summaries.join('; ')}; dark softened: blend ${dark.card.blend}, scrim rgb(${dark.card.scrim.slice(0, 3).join(',')}), opacity ${dark.card.opacity}, title ${dark.card.title.contrast}:1`
    } finally {
      await page.emulateMedia([])
      await sleep(500)
    }
  })



  await results.check('b4-13', 'running-panel row text uses the native Workspace tokens in light mode (dark unchanged)', async () => {
    const read = () => page.eval(() => {
      const colorOf = (selector) => {
        const node = document.querySelector(selector)
        return node === null ? null : getComputedStyle(node).color
      }
      return {
        titles: [...document.querySelectorAll('.psd-run-title, .psd-child-title')].map((node) => getComputedStyle(node).color),
        times: [...document.querySelectorAll('.psd-run-time, .psd-child-time')].map((node) => getComputedStyle(node).color),
        childRows: [...document.querySelectorAll('.psd-child')].map((node) => getComputedStyle(node).color),
        nativeTitle: colorOf('[class*="sessionRow"] [class*="title"]'),
        nativeTime: colorOf('[class*="sessionRow"] [class*="time"]'),
      }
    })
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(700)
      const light = await read()
      assert(light.titles.length > 0, 'no running-panel rows to compare against the native Workspace rows')
      assert(light.nativeTitle, 'no native Workspace session row title to compare against')
      for (const color of light.titles) {
        assertEqual(color, light.nativeTitle, `light mode: every running-panel row title must use the native Workspace title token (got ${color}, native ${light.nativeTitle})`)
      }
      assertEqual(light.nativeTitle, 'rgb(15, 17, 21)', `native light Workspace title must be the primary label token, got ${light.nativeTitle}`)
      // Times keep the native tertiary label outside the highlighted row; the
      // highlighted row keeps the earlier secondary-label lift for contrast on
      // the pastel atmosphere.
      for (const color of light.times) {
        assert(color === light.nativeTime || color === 'rgb(97, 102, 107)', `light mode: running-panel time must stay native tertiary (${light.nativeTime}) or the highlighted-row secondary lift, got ${color}`)
      }
      await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
      await sleep(700)
      const dark = await read()
      if (dark.childRows.length > 0) {
        for (const color of dark.childRows) {
          assertEqual(color, 'rgb(207, 211, 214)', `dark mode: child rows must keep the unchanged secondary label token (got ${color})`)
        }
      }
      return `light: titles all ${light.nativeTitle}, times ${[...new Set(light.times)].join(' / ')}; dark child rows ${[...new Set(dark.childRows)].join(' / ') || 'none'}`
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
  })

  await results.check('b4-14', 'running-panel icon colours match or beat the native Workspace icon weight in light mode', async () => {
    const read = () => page.eval(() => {
      const colors = (selector) => [...document.querySelectorAll(selector)].map((node) => getComputedStyle(node).color)
      return {
        secondaryIcons: {
          action: colors('.psd-row-action'),
          toggle: colors('.psd-run-toggle'),
          chevron: colors('.psd-chevron'),
          panelChevron: colors('.psd-panel-chevron'),
        },

        primaryIcons: {
          brand: colors('.psd-run-brand'),
          indicator: colors('.psd-indicator'),
          spark: colors('.psd-spark'),
        },
        nativeIcons: {
          slot: colors('[class*="YDXeBa_slot"]'),
          folder: colors('[class*="YDXeBa_folder"]'),
          action: colors('[class*="YDXeBa_iconButton"]'),
        },
      }
    })
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(800)
      const light = await read()
      const secondary = light.secondaryIcons
      assert(secondary.action.length > 0, 'no running-panel row action icons to measure')
      for (const [name, list] of Object.entries(secondary)) {
        for (const color of list) {
          assertEqual(color, 'rgb(97, 102, 107)', `light mode: ${name} icon must use the secondary label token (#61666b) so icons read darker than the native tertiary row icons, got ${color}`)
        }
      }
      const primaryBrand = [...light.primaryIcons.brand, ...light.primaryIcons.indicator, ...light.primaryIcons.spark]
      for (const color of primaryBrand) {
        assertEqual(color, 'rgb(15, 17, 21)', `light mode: brand/sparkle/indicator glyphs must keep the primary label token, got ${color}`)
      }
      const nativeColors = new Set([...light.nativeIcons.slot, ...light.nativeIcons.folder, ...light.nativeIcons.action])
      assert(nativeColors.size > 0, 'no native Workspace icons to compare against')
      // Native icon tokens in light: row slot/folder + action buttons use the
      // tertiary label (#81858c); disclosure/pin indicators use label-caption
      // (#adb2b8); project-row folder glyphs use the business state colour
      // (#4176e6) and branded glyphs can be primary.
      const nativeAllowed = new Set(['rgb(129, 133, 140)', 'rgb(173, 178, 184)', 'rgb(15, 17, 21)', 'rgb(65, 118, 230)'])
      for (const color of nativeColors) {
        assert(nativeAllowed.has(color), `native Workspace icon colours unexpectedly changed (got ${color})`)
      }
      await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
      await sleep(800)
      const dark = await read()
      // Dark mode is unchanged: minor icons stay the tertiary label (#adb2b8)
      // and child glyphs inherit the unchanged secondary child-row colour
      // (#cfd3d6).
      const darkAllowed = new Set(['rgb(173, 178, 184)', 'rgb(207, 211, 214)'])
      for (const [name, list] of Object.entries(dark.secondaryIcons)) {
        for (const color of list) {
          assert(darkAllowed.has(color), `dark mode: ${name} icon must keep its unchanged dark colour, got ${color}`)
        }
      }
      return `light: row/action/toggle/chevron/child glyph ${secondary.action[0]}, brand ${light.primaryIcons.brand[0] ?? 'n/a'}, native ${[...nativeColors].join(' / ')}; dark unchanged ${dark.secondaryIcons.action[0] ?? 'no rows'}`
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
  })

  await results.check('b4-15', 'highlighted-row New-session action darkens on hover/focus like the pin control (light + dark)', async () => {
    const measure = () => page.eval(() => {
      const colorOf = (node) => node === null ? null : getComputedStyle(node).color
      const rectOf = (node) => {
        if (node === null) return null
        const r = node.getBoundingClientRect()
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      }
      const stateOf = (node) => {
        if (node === null) return null
        const s = getComputedStyle(node)
        return {
          color: s.color,
          glyph: node.querySelector('svg') === null ? null : getComputedStyle(node.querySelector('svg')).color,
          rect: rectOf(node),
          background: s.backgroundColor,
          filter: s.filter,
          focusVisible: node.matches(':focus-visible'),
        }
      }
      const currentRow = document.querySelector('.psd-run-current, .psd-child-current')
      const currentAction = currentRow === null ? null : currentRow.querySelector('.psd-row-action')
      const otherRow = [...document.querySelectorAll('.psd-run, .psd-child')].find((row) => !row.classList.contains('psd-run-current') && !row.classList.contains('psd-child-current') && row.querySelector('.psd-row-action'))
      const otherAction = otherRow === undefined ? null : otherRow.querySelector('.psd-row-action')
      const pin = document.querySelector('[class*="pinnedAction"], [class*="pinIndicator"]')
      const probe = document.createElement('div')
      probe.style.background = 'var(--dsw-alias-interactive-bg-hover)'
      document.body.appendChild(probe)
      const hoverBackground = getComputedStyle(probe).backgroundColor
      probe.remove()
      return {
        bodyDark: document.body.hasAttribute('data-ds-dark-theme'),
        hoverBackground,
        currentRow: rectOf(currentRow),
        currentAction: stateOf(currentAction),
        otherAction: stateOf(otherAction),
        pin: stateOf(pin),
      }
    })
    const hover = async (rect) => {
      await page.moveTo(900, 500)
      await sleep(250)
      await page.moveTo(rect.left + Math.round(rect.width / 2), rect.top + Math.round(rect.height / 2))
      await sleep(400)
    }
    const moveAway = async () => {
      await page.moveTo(900, 500)
      await sleep(300)
      await page.eval(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
      await sleep(200)
    }
    const focusActionViaKeyboard = async () => {
      // A real Tab keydown sets the browser's keyboard modality, then focusing the
      // action must match :focus-visible (no pointer involved).
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
      await sleep(150)
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const focused = await page.eval(() => {
          const action = document.querySelector('.psd-run-current .psd-row-action, .psd-child-current .psd-row-action')
          if (action === null) return false
          action.focus()
          return document.activeElement === action
        })
        if (focused) break
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await sleep(80)
      }
      await sleep(250)
      return measure()
    }
    const sameRect = (a, b) => a !== null && b !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
    const expectedPrimary = { light: 'rgb(15, 17, 21)', dark: 'rgb(249, 250, 251)' }
    const expectedRest = { light: 'rgb(97, 102, 107)', dark: 'rgb(173, 178, 184)' }
    const notes = []
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(800)
      const lightBase = await measure()
      assert(lightBase.currentAction, 'no current card row with a New-session action to measure (light)')
      assertEqual(lightBase.currentAction.color, expectedRest.light, `light: the highlighted row action must start on the secondary label before hover, got ${lightBase.currentAction.color}`)
      assertEqual(lightBase.currentAction.background, 'rgba(0, 0, 0, 0)', `light: the action must start with a transparent background, got ${lightBase.currentAction.background}`)
      assertEqual(lightBase.currentAction.filter, 'none', `light: the action itself must not carry a filter at rest (the row-level atmosphere lift sits on the row's children, not on the button), got ${lightBase.currentAction.filter}`)
      await hover(lightBase.currentAction.rect)
      const lightHover = await measure()
      assertEqual(lightHover.currentAction.color, expectedPrimary.light, `light: the highlighted row New-session action must darken to the primary label on hover (like the pin), got ${lightHover.currentAction.color}`)
      assertEqual(lightHover.currentAction.glyph, expectedPrimary.light, `light: the + glyph itself must inherit the darkened hover colour, got ${lightHover.currentAction.glyph}`)
      assert(sameRect(lightBase.currentAction.rect, lightHover.currentAction.rect), `light: the action geometry must not move on hover (${JSON.stringify(lightBase.currentAction.rect)} vs ${JSON.stringify(lightHover.currentAction.rect)})`)
      assertEqual(lightHover.currentAction.background, 'rgba(0, 0, 0, 0)', `light: an atmosphere-row action must not paint its own hover block inside the rainbow (transparent; the row lifts brightness instead), got ${lightHover.currentAction.background}`)
      assertEqual(lightHover.currentAction.filter, 'brightness(1.2)', `light: an atmosphere-row action hover must brighten one step instead of painting a block (filter ${lightHover.currentAction.filter})`)
      // Keyboard focus: primary label through real focus-visible, no pointer involved.
      const lightFocus = await focusActionViaKeyboard()
      assert(lightFocus.currentAction && lightFocus.currentAction.focusVisible, 'light: the + action did not match :focus-visible after a real Tab-keyboard focus')
      assertEqual(lightFocus.currentAction.color, expectedPrimary.light, `light: keyboard focus must darken the + action to the primary label, got ${lightFocus.currentAction.color}`)
      await moveAway()
      if (state.shotsEnabled && lightBase.currentRow) await writeEvidenceShot(page, '21-action-hover-light', { left: lightBase.currentRow.left - 12, top: lightBase.currentRow.top - 6, width: lightBase.currentRow.width + 24, height: lightBase.currentRow.height + 12 })
      const lightRest = await measure()
      assertEqual(lightRest.currentAction.color, expectedRest.light, `light: the action colour must return to normal after the pointer leaves, got ${lightRest.currentAction.color}`)
      assertEqual(lightRest.currentAction.focusVisible, false, 'light: the action must not stay focus-visible after blur')
      let otherRest = null
      if (lightRest.otherAction !== null) {
        otherRest = lightRest.otherAction.color
        await hover(lightRest.otherAction.rect)
        const otherHover = await measure()
        assertEqual(otherHover.otherAction.color, expectedPrimary.light, `light: non-current row action hover must stay unchanged (primary), got ${otherHover.otherAction.color}`)
        await moveAway()
      }
      let pinNote = 'pin not present in this data state'
      if (lightRest.pin !== null) {
        const pinRest = lightRest.pin.color
        await hover(lightRest.pin.rect)
        const pinHovered = (await measure()).pin.color
        await moveAway()
        if (pinHovered !== pinRest) {
          pinNote = `pin ${pinRest} -> ${pinHovered}`
        } else {
          pinNote = `pin did NOT darken in this data state (${pinRest} both states)`
        }
      }
      notes.push(pinNote)
      await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
      await sleep(800)
      const darkBase = await measure()
      assert(darkBase.currentAction, 'no current card row with a New-session action to measure (dark)')
      assertEqual(darkBase.currentAction.color, expectedRest.dark, `dark: the highlighted row action must start on the tertiary label before hover, got ${darkBase.currentAction.color}`)
      await hover(darkBase.currentAction.rect)
      const darkHover = await measure()
      assertEqual(darkHover.currentAction.color, expectedPrimary.dark, `dark: the highlighted row New-session action must darken to the primary label on hover, got ${darkHover.currentAction.color}`)
      assert(sameRect(darkBase.currentAction.rect, darkHover.currentAction.rect), 'dark: the action geometry must not move on hover')
      assertEqual(darkHover.currentAction.filter, 'brightness(1.2)', `dark: an atmosphere-row action hover must brighten one step instead of painting a block (filter ${darkHover.currentAction.filter})`)
      if (state.shotsEnabled && darkBase.currentRow) await writeEvidenceShot(page, '21-action-hover-dark', { left: darkBase.currentRow.left - 12, top: darkBase.currentRow.top - 6, width: darkBase.currentRow.width + 24, height: darkBase.currentRow.height + 12 })
      await moveAway()
      return `light ${lightBase.currentAction.color} -> hover ${lightHover.currentAction.color} / focus ${lightFocus.currentAction.color} (glyph ${lightHover.currentAction.glyph}, rect stable, bg ${lightHover.currentAction.background}, filter none); dark ${darkBase.currentAction.color} -> ${darkHover.currentAction.color}; non-current hover ${otherRest === null ? 'n/a' : otherRest + ' -> primary'}; ${notes.join('; ')}`
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
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

}

async function runHoverCardChecks({ page, results, state }) {
  log('\n=== B5/C2/C3: row hover card vs the native tooltip oracle ===')
  await results.check('b5-1', 'native sidebar tooltip measured live as the alignment oracle (light + dark)', async () => {
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    await sleep(800)
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
    // The theme-following light-mode override makes the native session info card a
    // light surface with dark theme-text; dark mode keeps the shell's own
    // #2C2C2E + static light palette recipe byte-identical.
    assertEqual(light.tooltip.background, 'rgb(255, 255, 255)', `native light tooltip surface must follow the light theme, got ${light.tooltip.background}`)
    assertEqual(light.tooltip.title.color, 'rgb(15, 17, 21)', `native light tooltip title must use the light primary label, got ${light.tooltip.title.color}`)
    assertEqual(light.tooltip.path.color, 'rgb(97, 102, 107)', `native light tooltip path must use the light secondary label, got ${light.tooltip.path.color}`)
    assertEqual(light.tooltip.status.color, 'rgb(129, 133, 140)', `native light tooltip status must use the light tertiary label, got ${light.tooltip.status.color}`)
    assertEqual(dark.tooltip.background, 'rgb(44, 44, 46)', `native dark tooltip surface must stay the shell hover-card colour, got ${dark.tooltip.background}`)
    assertEqual(dark.tooltip.title.color, 'rgb(255, 255, 255)', `native dark tooltip title must stay white, got ${dark.tooltip.title.color}`)
    assertEqual(dark.tooltip.path.color, 'rgb(207, 211, 214)', `native dark tooltip path must stay #cfd3d6, got ${dark.tooltip.path.color}`)
    assertEqual(dark.tooltip.status.color, 'rgb(173, 178, 184)', `native dark tooltip status must stay #adb2b8, got ${dark.tooltip.status.color}`)
    assertEqual(dark.tooltip.boxShadow, light.tooltip.boxShadow, 'native tooltip elevation must be the same in light and dark')
    assertEqual(light.tooltip.backgroundImage, 'none', 'native tooltip surface is a flat colour, no gradient layer')
    assertEqual(light.tooltip.backdropFilter, 'none', 'native tooltip has no backdrop filter')
    for (const [label, tooltip] of [['light', light.tooltip], ['dark', dark.tooltip]]) {
      assertEqual(tooltip.radius, '16px', `native ${label} tooltip radius`)
    }
    return `oracle light ${light.tooltip.background}/${light.tooltip.title.color}, dark ${dark.tooltip.background}/#fff, radius ${light.tooltip.radius}, padding ${light.tooltip.padding}`
  })

  await results.check('b5-2', 'our hover card follows the theme like the native tooltip, with the same chrome', async () => {
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    await sleep(700)
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
    assertEqual(card.background, native.background, 'light: our hover card background must match the live light native hover card surface')
    assertEqual(card.background, 'rgb(255, 255, 255)', `our light hover card must follow the light theme, got ${card.background}`)
    assertEqual(card.title.color, 'rgb(15, 17, 21)', `our light hover card title must use the light primary label, got ${card.title.color}`)
    assertEqual(card.path.color, 'rgb(97, 102, 107)', `our light hover card path must use the light secondary label, got ${card.path.color}`)
    assertEqual(card.status.color, 'rgb(129, 133, 140)', `our light hover card status must use the light tertiary label, got ${card.status.color}`)
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
      assertEqual(card.background, 'rgb(44, 44, 46)', `our dark hover card must keep the native hover-card surface #2C2C2E, got ${card.background}`)
      assert(card.background !== lastLight.background, 'our hover card must follow the active theme (light surface in light, #2C2C2E in dark)')
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
    await page.moveTo(900, 500)
    return `light ${lastLight.background} / dark ${card.background}; radius ${card.radius}, border ${card.borderWidth}, elevation matched`
  })

  await results.check('b5-5', 'plugin popover surfaces follow the light theme and keep the dark recipe unchanged', async () => {
    const readSearch = async () => {
      const toggle = await page.findRect('[data-psp-search-toggle]')
      if (!toggle) return null
      await page.clickAt(toggle.x, toggle.y)
      await sleep(800)
      const facts = await page.eval(() => {
        const card = document.querySelector('.psp-search-card')
        if (card === null) return null
        const s = getComputedStyle(card)
        const count = card.querySelector('.psp-search-count')
        return { bg: s.backgroundColor, color: s.color, count: count === null ? null : getComputedStyle(count).color }
      })
      await page.pressEscape()
      await sleep(400)
      return facts
    }
    const readCard = async () => {
      await page.moveTo(900, 500)
      await sleep(250)
      await hoverRow(page, 0)
      await sleep(1200)
      const card = await page.eval(probe.hoverCard)
      await page.moveTo(900, 500)
      await sleep(250)
      return card
    }
    const ruleText = await page.evaluate(`(() => {
      let found = { themeRule: false, rail: false, quicklook: false }
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        if (!rules) continue
        for (const rule of rules) {
          const text = rule.cssText || ''
          if (text.includes('body:not([data-ds-dark-theme])') && (text.includes('.psd-hovercard') || text.includes('.psp-search-card'))) found.themeRule = true
          if (text.includes('.psp-rail-card')) found.rail = true
          if (text.includes('.dsa-quicklook')) found.quicklook = true
        }
      }
      return found
    })()`)
    assert(ruleText.themeRule, 'the light-mode theme-following card rule is missing')
    assert(ruleText.rail && ruleText.quicklook, 'the prompt-history rail card / quick-look surface are not covered by the theme-following rule')
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(800)
      const lightCard = await readCard()
      assert(lightCard, 'no hover card in light mode')
      assertEqual(lightCard.background, 'rgb(255, 255, 255)', `light hover card must use the light surface, got ${lightCard.background}`)
      assertEqual(lightCard.title.color, 'rgb(15, 17, 21)', `light hover card title must use the light primary label, got ${lightCard.title.color}`)
      const lightSearch = await readSearch()
      assert(lightSearch, 'search card did not open in light mode')
      assertEqual(lightSearch.bg, 'rgb(255, 255, 255)', `light search card must use the light surface, got ${lightSearch.bg}`)
      assertEqual(lightSearch.count, 'rgb(129, 133, 140)', `light search card count must use the light tertiary label, got ${lightSearch.count}`)
      await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
      await sleep(800)
      const darkCard = await readCard()
      assert(darkCard, 'no hover card in dark mode')
      assertEqual(darkCard.background, 'rgb(44, 44, 46)', `dark hover card must keep the shell hover-card surface, got ${darkCard.background}`)
      assertEqual(darkCard.title.color, 'rgb(255, 255, 255)', `dark hover card title must stay white, got ${darkCard.title.color}`)
      const darkSearch = await readSearch()
      assert(darkSearch, 'search card did not open in dark mode')
      assertEqual(darkSearch.bg, 'rgb(44, 44, 46)', `dark search card must keep the shell hover-card surface, got ${darkSearch.bg}`)
      return `hover card light ${lightCard.background} / dark ${darkCard.background}; search light ${lightSearch.bg} / dark ${darkSearch.bg}; rail+quick-look rules present`
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
  })

  await results.check('b5-7', 'plugin and native session-info hover cards share the same width (no early truncation)', async () => {
    const ourCard = () => page.eval(() => {
      const card = document.querySelector('.psd-hovercard')
      if (card === null) return null
      const sections = [...card.querySelectorAll('.psd-hovercard-section-head')].map((head) => {
        const title = head.querySelector('.psd-hovercard-section-title')
        const value = head.querySelector('.psd-hovercard-section-value')
        return {
          title: title?.textContent ?? null,
          titleFits: title ? title.scrollWidth <= title.clientWidth + 1 : null,
          value: value?.textContent ?? null,
          valueFits: value ? value.scrollWidth <= value.clientWidth + 1 : null,
        }
      })
      return { width: Math.round(card.getBoundingClientRect().width), sections }
    })
    const nativeCard = () => page.eval(() => {
      const card = document.querySelector('._card_bgejw_9')
      if (card === null) return null
      const title = card.querySelector('[class*="hoverTitle"]')
      const path = card.querySelector('[class*="hoverPath"]')
      return {
        width: Math.round(card.getBoundingClientRect().width),
        title: title?.textContent ?? null,
        titleFits: title ? title.scrollWidth <= title.clientWidth + 1 : null,
        path: path?.textContent ?? null,
        pathFits: path ? path.scrollWidth <= path.clientWidth + 1 : null,
      }
    })
    const hoverOurs = async () => {
      await page.moveTo(900, 500)
      await sleep(250)
      await hoverRow(page, 0)
      await sleep(1200)
      return ourCard()
    }
    const hoverNative = async () => {
      await page.moveTo(900, 500)
      await sleep(300)
      const row = await ensureNativeSessionRow(page)
      await page.moveTo(row.rect.left + 40, row.rect.top + Math.round(row.rect.height / 2))
      await sleep(1600)
      return nativeCard()
    }
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(800)
      const oursLight = await hoverOurs()
      assert(oursLight, 'our hover card did not appear (light)')
      assertEqual(oursLight.width, 320, `our session-info card must be the documented 320 px wide, got ${oursLight.width}`)
      assert(oursLight.sections.length > 0, 'our hover card has no figure sections to check for truncation')
      for (const section of oursLight.sections) {
        assert(section.titleFits !== false, `light: section label "${section.title}" is truncated`)
        assert(section.valueFits !== false, `light: section value "${section.value}" is truncated`)
      }
      const stats = oursLight.sections.find((section) => /Session statistics|会话统计/.test(section.title ?? ''))
      assert(stats, `the Session statistics section is missing (${oursLight.sections.map((section) => section.title).join(' / ')})`)
      assert(/turns|轮/.test(stats.value ?? ''), `Session statistics value looks truncated: "${stats.value}"`)
      const nativeLight = await hoverNative()
      assert(nativeLight, 'native session-info hover card did not appear (light)')
      assertEqual(nativeLight.width, oursLight.width, `native Workspace card width (${nativeLight.width}) must equal our session-info card width (${oursLight.width})`)
      assert(nativeLight.titleFits !== false, `light: native card title truncated ("${nativeLight.title}")`)
      assert(nativeLight.pathFits !== false, `light: native card path truncated ("${nativeLight.path}")`)
      await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
      await sleep(800)
      const oursDark = await hoverOurs()
      assert(oursDark, 'our hover card did not appear (dark)')
      const nativeDark = await hoverNative()
      assert(nativeDark, 'native session-info hover card did not appear (dark)')
      assertEqual(nativeDark.width, oursDark.width, `dark: native Workspace card width (${nativeDark.width}) must equal our card width (${oursDark.width})`)
      return `ours light/dark ${oursLight.width}/${oursDark.width}px, native light/dark ${nativeLight.width}/${nativeDark.width}px; stats value "${stats.value}" fits; native title/path fit`
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
  })

  await results.check('b5-3', 'hover card dismisses on pointer leave (normal mode unchanged)', async () => {
    await page.moveTo(900, 500)
    await sleep(700)
    const present = await page.eval(() => document.querySelector('[data-psd-hovercard]') !== null)
    assert(!present, 'hover card did not dismiss after the pointer left the row')
    return 'card closed on leave (140 ms delay preserved)'
  })

  await results.check('c2-1', 'every plugin tooltip-like card follows the active theme and matches the native tooltip chrome', async () => {
    const native = state.nativeTooltip
    const nativeDark = state.nativeTooltipDark
    assert(native && nativeDark, 'the native tooltip oracle was not measured earlier')
    const surfaces = ['psd-hovercard', 'dsa-quicklook', 'psp-rail-card', 'psp-search-card']
    const measured = {}
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(800)
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') {
          await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
          await sleep(900)
        }
        const expected = theme === 'light' ? native : nativeDark
        const expectedBg = theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(44, 44, 46)'
        for (const surface of surfaces) {
          const card = await page.eval(probe.computedForClass, surface)
          measured[`${theme}:${surface}`] = card
          assertEqual(card.background, expectedBg, `${surface} (${theme}) must follow the theme surface (${expectedBg}), got ${card.background}`)
          assertEqual(card.background, expected.background, `${surface} (${theme}) background must equal the live native hover card background (${expected.background}), got ${card.background}`)
          assertEqual(card.backgroundImage, expected.backgroundImage, `${surface} (${theme}) must not add a background-image layer`)
          assertEqual(card.backdropFilter, expected.backdropFilter, `${surface} (${theme}) backdrop filter must match the native tooltip`)
          assertEqual(card.borderWidth, '0px', `${surface} (${theme}) must be borderless`)
          assertEqual(card.radius, expected.radius, `${surface} (${theme}) radius must match the native tooltip`)
          assertEqual(card.boxShadow, expected.boxShadow, `${surface} (${theme}) elevation must match the native tooltip exactly`)
        }
      }
      const lightUniques = new Set(surfaces.map((surface) => measured[`light:${surface}`].background))
      const darkUniques = new Set(surfaces.map((surface) => measured[`dark:${surface}`].background))
      assertEqual(lightUniques.size, 1, `all plugin tooltip surfaces must share the light background: ${[...lightUniques].join(' / ')}`)
      assertEqual(darkUniques.size, 1, `all plugin tooltip surfaces must share the dark background: ${[...darkUniques].join(' / ')}`)
      return `4 surfaces x 2 themes: light ${[...lightUniques][0]} / dark ${[...darkUniques][0]}; radius ${native.radius}; native elevation`
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
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

  await results.check('b3-3', 'prompt-history rail lists the oldest tick first with the newest visible at its foot', async () => {
    const rail = await page.eval(() => {
      const railElement = document.querySelector('[data-psp-rail]')
      const marksElement = document.querySelector('.psp-marks')
      if (railElement === null || marksElement === null) return { present: false }
      const rectOf = (element) => {
        const r = element.getBoundingClientRect()
        return { top: Number(r.top.toFixed(2)), bottom: Number(r.bottom.toFixed(2)), height: Number(r.height.toFixed(2)) }
      }
      const marks = [...marksElement.querySelectorAll('[data-psp-mark]')].map((mark) => ({
        index: Number(mark.getAttribute('data-psp-index')),
        ...rectOf(mark),
        visible: mark.getBoundingClientRect().height > 0 && getComputedStyle(mark).visibility !== 'hidden'
      }))
      return {
        present: true,
        marks,
        marksRect: rectOf(marksElement),
        scrollTop: Number(marksElement.scrollTop.toFixed(2)),
        scrollHeight: marksElement.scrollHeight,
        clientHeight: marksElement.clientHeight
      }
    })
    if (rail.present !== true || rail.marks.length < 2) {
      // Throw the SKIP signal so the wrapping results.check records exactly one
      // SKIP row for b3-3 (previously results.skip() inside the callback added a
      // second, passing row under the same id).
      throw new CheckSkip(`the prompt-history rail currently has ${rail.present === true ? rail.marks.length : 0} tick(s) in this environment; at least two are needed to verify the reversed order. Explicit SKIP, not a pass.`)
    }
    const indices = rail.marks.map((mark) => mark.index)
    for (let index = 1; index < indices.length; index += 1) {
      assertEqual(indices[index], indices[index - 1] + 1,
        `data-psp-index must ascend in DOM order (oldest first): got ${short(JSON.stringify(indices), 160)}`)
    }
    for (let index = 1; index < rail.marks.length; index += 1) {
      assert(rail.marks[index].top > rail.marks[index - 1].top,
        `mark ${indices[index - 1]} must sit above mark ${indices[index]} (oldest at the top)`)
    }
    const newest = rail.marks[rail.marks.length - 1]
    assertEqual(newest.index, Math.max(...indices), 'the DOM-last tick must carry the highest prompt index (newest)')
    assert(newest.visible, 'the newest tick is not visible in the rail')
    assert(rail.marks[0].visible, 'the oldest tick is not visible in the rail')
    const overflowing = rail.scrollHeight > rail.clientHeight + 2
    if (overflowing) {
      assertNear(rail.scrollTop, rail.scrollHeight - rail.clientHeight, 2,
        `an overflowing prompt-history rail must be scrolled to its bottom (scrollTop ${rail.scrollTop}, max ${rail.scrollHeight - rail.clientHeight})`)
    }
    assert(newest.bottom <= rail.marksRect.bottom + 2,
      `the newest tick must be visible at the rail foot (newest bottom ${newest.bottom}, rail bottom ${rail.marksRect.bottom})`)
    return `${rail.marks.length} ticks, data-psp-index ${indices[0]}..${indices[indices.length - 1]} ascending in DOM order, oldest first; newest tick at the foot (bottom ${newest.bottom} vs rail ${rail.marksRect.bottom}); ${overflowing ? `scrolled to bottom (${rail.scrollTop}/${rail.scrollHeight - rail.clientHeight})` : 'list fits without overflow'}`
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

async function runInterruptedChecks({ page, results, state }) {
  log('\n=== F6: interrupted badge vs loading state + icon-only Continue ===')
  const factsScript = `(key) => {
    const row = document.querySelector('[data-row-key="' + key + '"]')
    const hook = globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions
    const record = hook ? hook.record(key.replace(/^session:/, '')) : null
    if (row === null) return { missing: true, record }
    const badges = [...row.querySelectorAll('.dps-row-interrupted')]
    const lead = [...row.children].find((child) => !child.hasAttribute('data-psd-atmos')) ?? null
    // Exclude the interrupted Continue CTA's play glyph too: since the stale-running
    // consistency fix, an interrupted-idle record on a row the shell still renders as
    // running legitimately shows the warning badge AND the Continue slot side by side.
    const peerSvgs = lead === null ? [] : [...lead.querySelectorAll('svg')].filter((svg) => svg.closest('.dps-row-interrupted') === null && svg.closest('.dps-row-continue-slot') === null)
    // Only the shell's RUNNING indicator may coexist with the interrupted badge.
    // The shell paints a themed state DOT on idle rows; counting every peer SVG
    // therefore reported a false second indicator. The spinner carries the shell's
    // _spinner_* class (and data-state="ongoing").
    const spinnerSvgs = peerSvgs.filter((svg) => {
      const className = String(svg.getAttribute('class') ?? '')
      return className.includes('_spinner') || svg.getAttribute('data-state') === 'ongoing'
    })
    return {
      record,
      interruptedAttr: row.hasAttribute('data-power-suite-interrupted'),
      badges: badges.length,
      badgeText: badges.map((badge) => (badge.textContent || '').trim()).join('|'),
      peerSvgDisplays: peerSvgs.map((svg) => getComputedStyle(svg).display),
      spinnerCount: spinnerSvgs.filter((svg) => getComputedStyle(svg).display !== 'none').length,
    }
  }`
  const apply = async (key, patch) => page.eval(
    `(payload) => {
      const hook = globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions
      if (!hook) return { unavailable: true }
      hook.set(payload.key.replace(/^session:/, ''), payload.patch)
      return (${factsScript})(payload.key)
    }`,
    { key, patch }
  )
  const applyContinue = async (key) => page.eval(
    `(key) => {
      const hook = globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions
      if (!hook) return { unavailable: true }
      const row = document.querySelector('[data-row-key="' + key + '"]')
      const sessionId = key.replace(/^session:/, '')
      // Mirrors the plugin's optimistic Continue settle (markContinued).
      hook.set(sessionId, { interrupted: false, running: true })
      return (${factsScript})(key)
    }`,
    key
  )
  // Read-only facts (does not re-seed the record). `hook.set` updates the external
  // store synchronously, but the React row (useSyncExternalStore) commits on a later
  // frame: an immediate read can still observe the previous badge for ~16 ms.
  const read = async (key) => page.eval(`(key) => (${factsScript})(key)`, key)
  /**
   * Poll the rendered row until the predicate holds, bounded by the given timeout.
   * Used so every assertion samples AFTER the React commit, never in the same JS
   * task that seeded the record.
   * @param {string} key - native row key.
   * @param {(facts: object) => boolean} predicate - expected rendered state.
   * @param {{ timeout?: number, label?: string }} options - poll bound/label.
   * @returns {Promise<object>} the last facts.
   */
  const waitSettled = async (key, predicate, { timeout = 800, label = 'interrupted row commit' } = {}) => {
    const deadline = Date.now() + timeout
    let facts = await read(key)
    while (!predicate(facts) && Date.now() < deadline) {
      await sleep(16)
      facts = await read(key)
    }
    return facts
  }
  const settledFacts = {
    interrupted: (facts) => facts.interruptedAttr === true && facts.badges >= 1,
    cleared: (facts) => facts.interruptedAttr === false && facts.badges === 0,
  }
  const clear = async (key) => page.eval(
    `(key) => { globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions?.clear(key.replace(/^session:/, '')) }`,
    key
  )
  const pickRow = () => page.eval(() => {
    const rows = [...document.querySelectorAll('[data-row-key^="session:"]')].filter((row) => {
      const text = (row.innerText || '').trim()
      return text.length > 0 && text.length < 200
    })
    const runningLike = rows.find((row) => (row.innerText || '').includes('Running'))
    return (runningLike ?? rows[0])?.getAttribute('data-row-key') ?? null
  })
  // Note: this sample drives the plugin record with a stale `running: true`, which
  // is the "no badge while the record claims running" branch. The decorator's
  // stale-NATIVE-running branch (record idle, shell still renders its spinner) is now
  // implemented and covered by the `--interrupted` mode's iw-2, not by this live-data
  // check (full mode does not run that mode). The leading-indicator count excludes the
  // interrupted Continue CTA's play glyph (`.dps-row-continue-slot`): the fix
  // legitimately shows the warning badge and that CTA together on a stale-running row.
  await results.check('f6-1', 'a running plugin record never renders a badge and leaves the native spinner alone (incl. after Continue)', async () => {
    const key = await pickRow()
    assert(key, 'no native Session row to seed an interrupted record on')
    try {
      await apply(key, { interrupted: true, running: false })
      const idle = await waitSettled(key, settledFacts.interrupted)
      assert(!idle.unavailable, 'interrupted test seam unavailable')
      assertEqual(idle.interruptedAttr, true, 'before Continue: the interrupted row must carry the interrupted attribute')
      assert(idle.badges >= 1, `before Continue: exactly one interrupted indicator expected, got ${idle.badges}`)
      await applyContinue(key)
      // The optimistic settle clears the attribute synchronously, but an idle row's
      // persistent leading-slot badge unmounts only after the external-store commit.
      // Bound the wait (500-800 ms) and then assert the committed state.
      const continued = await waitSettled(key, settledFacts.cleared, { timeout: 800, label: 'Continue commit' })
      assertEqual(continued.interruptedAttr, false, 'after Continue: the interrupted attribute must be cleared')
      assertEqual(continued.badges, 0, `after Continue: the interrupted badge must be gone, got ${continued.badges}`)
      await apply(key, { interrupted: true, running: true })
      const stale = await waitSettled(key, settledFacts.cleared)
      assertEqual(stale.interruptedAttr, false, 'stale-Host (interrupted while running): attribute must stay cleared — the two indicators must never coexist')
      assertEqual(stale.badges, 0, `stale-Host (interrupted while running): no interrupted badge may render while running, got ${stale.badges}`)
      for (const display of stale.peerSvgDisplays) {
        assert(display !== 'none', 'while running, the native loading indicator must not be hidden by the stale-spinner rule')
      }
      await apply(key, { interrupted: false, running: false })
      const done = await waitSettled(key, settledFacts.cleared)
      assertEqual(done.interruptedAttr, false, 'completed: no interrupted attribute')
      assertEqual(done.badges, 0, 'completed: no interrupted badge')
      // Poll-style sampling across the Continue transition: never both indicators.
      // Each sample is taken AFTER the record's commit (the previous sample cannot
      // leak its badge into the next one), and only the shell spinner counts as the
      // second indicator — an idle row's state dot does not.
      let coexist = 0
      let sampledSpinner = 0
      for (let i = 0; i < 20; i += 1) {
        const patch = i % 2 === 0 ? { interrupted: true, running: false } : { interrupted: false, running: true }
        await apply(key, patch)
        const sample = await waitSettled(key, patch.running ? settledFacts.cleared : settledFacts.interrupted, { timeout: 500, label: `transition sample ${i}` })
        if (sample.spinnerCount > 0) sampledSpinner += 1
        if (sample.badges > 0 && sample.spinnerCount > 0) coexist += 1
        await sleep(60)
      }
      assertEqual(coexist, 0, `poll sampling caught ${coexist} sample(s) with the interrupted badge and the shell spinner at once`)
      return `idle interrupted: badge ${idle.badges} + attr; after Continue (post-commit): badge ${continued.badges} no attr; stale interrupted+running: badge ${stale.badges} no attr (peer svg ${stale.peerSvgDisplays.join(',') || 'n/a'}); completed: badge ${done.badges}; 20 post-commit transition samples (spinner seen ${sampledSpinner}), 0 coexistence`
    } finally {
      await clear(key)
      await sleep(250)
    }
  })
  await results.check('f6-2', 'interrupted Continue action is an icon-only play button in both row surfaces', async () => {
    const seedFor = (sessionId) => page.eval((id) => {
      const hook = globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions
      if (!hook) return null
      hook.set(id, { interrupted: true, running: false })
      return hook.record(id)
    }, sessionId)
    const clearFor = (sessionId) => page.eval((id) => globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions?.clear(id) ?? null, sessionId)
    const readButton = (selector) => page.eval((sel) => {
      const button = document.querySelector(sel)
      if (button === null) return null
      const r = button.getBoundingClientRect()
      const s = getComputedStyle(button)
      return {
        text: (button.textContent || '').trim(),
        aria: button.getAttribute('aria-label'),
        title: button.getAttribute('title'),
        svgs: button.querySelectorAll('svg').length,
        display: s.display,
        rect: { width: Math.round(r.width), height: Math.round(r.height) },
      }
    }, selector)
    const rows = await page.eval(() => (globalThis.__POWER_SUITE_TEST_HOOKS__?.dynamicWorkspacesLive?.snapshot() ?? { rows: [] }).rows)
    const target = rows.find((row) => row.state !== 'running') ?? rows[0] ?? null
    assert(target, 'no running-panel row available to seed an interrupted record on')
    // The fixed client now also renders the card Continue CTA on a row the card shows
    // as running (the `--interrupted` mode's iw-1 covers that); this full-mode sample
    // keeps its historical idle-row focus so its icon-only assertions stay unchanged.
    const panelSurfaceAvailable = target.state !== 'running'
    const nativeKey = await page.eval(() => {
      const row = [...document.querySelectorAll('[data-row-key^="session:"]')].find((node) => (node.innerText || '').trim().length > 0)
      return row?.getAttribute('data-row-key') ?? null
    })
    assert(nativeKey, 'no native Session row to seed an interrupted record on')
    const nativeId = nativeKey.replace(/^session:/, '')
    try {
      let panelButton = null
      if (panelSurfaceAvailable) {
        for (let attempt = 0; attempt < 10 && panelButton === null; attempt += 1) {
          await seedFor(target.id)
          await seedFor(nativeId)
          await sleep(250)
          panelButton = await readButton('.psd-continue-inline')
        }
        assert(panelButton, 'running-panel row Continue action did not render for the interrupted record')
        assertEqual(panelButton.text, '', `running-panel Continue must have no visible text, got "${panelButton.text}"`)
        assert(panelButton.aria && panelButton.title, `running-panel Continue must keep its accessible label/tooltip (aria "${panelButton.aria}", title "${panelButton.title}")`)
        assertEqual(panelButton.svgs, 1, `running-panel Continue must render exactly one play glyph, got ${panelButton.svgs}`)
      } else {
        // Every visible card row is currently running. The fixed client renders the card
        // continuation there too (covered by `--interrupted` iw-1); this full-mode sample
        // keeps its historical idle-row focus, and the native Workspace-row surface below
        // still exercises the same icon-only action.
        await seedFor(nativeId)
      }
      const nativeRowRect = await page.eval((key) => {
        const row = document.querySelector('[data-row-key="' + key + '"]')
        if (row === null) return null
        const r = row.getBoundingClientRect()
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      }, nativeKey)
      assert(nativeRowRect, 'native row rect missing for hover')
      await page.moveTo(900, 500)
      await sleep(200)
      // Seed every visible native Session row: only idle rows mount the custom
      // leading slot (a row the shell still reports as running shows its spinner
      // and no badge/CTA), so try all of them instead of only the first row.
      const nativeIds = await page.eval(() => [...document.querySelectorAll('[data-row-key^="session:"]')]
        .map((row) => row.getAttribute('data-row-key').replace(/^session:/, '')))
      let nativeButton = null
      let nativeRect = nativeRowRect
      for (let attempt = 0; attempt < 10 && nativeButton === null; attempt += 1) {
        for (const id of nativeIds) await seedFor(id)
        for (const id of nativeIds) {
          const rect = await page.eval((key) => {
            const row = document.querySelector('[data-row-key="session:' + key + '"]')
            if (row === null) return null
            const r = row.getBoundingClientRect()
            return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
          }, id)
          if (rect === null) continue
          await page.moveTo(rect.left + 60, rect.top + Math.round(rect.height / 2))
          await sleep(220)
          nativeButton = await readButton('.dps-row-continue')
          if (nativeButton !== null) { nativeRect = rect; break }
        }
        if (nativeButton === null) await sleep(250)
      }
      assert(nativeButton, 'native Workspace row Continue action did not render for any interrupted idle row')
      assertEqual(nativeButton.text, '', `native-row Continue must have no visible text, got "${nativeButton.text}"`)
      assert(nativeButton.aria && nativeButton.title, 'native-row Continue must keep its accessible label/tooltip')
      assertEqual(nativeButton.svgs, 1, `native-row Continue must render exactly one play glyph, got ${nativeButton.svgs}`)
      assertEqual(nativeButton.rect.width, 22, `native-row Continue must fit the 22 px action slot, got ${nativeButton.rect.width}`)
      assertEqual(nativeButton.rect.height, 22, `native-row Continue must be a 22 px hit target, got ${nativeButton.rect.height}`)
      // Click contract: a synthetic click must be default-prevented and must issue
      // exactly one continue request (fetch stubbed in-page; restored afterwards).
      const click = await page.eval(() => {
        window.__f6ContinueCalls = 0
        window.__f6OriginalFetch = window.fetch
        window.fetch = (input, init) => {
          const url = String(input && input.url ? input.url : input)
          if (/power-suite\.continue/.test(url)) window.__f6ContinueCalls += 1
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
        }
        const button = document.querySelector('.dps-row-continue')
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
        const notPrevented = button.dispatchEvent(event)
        return { notPrevented, callsImmediate: window.__f6ContinueCalls }
      })
      await sleep(1800)
      const callsAfter = await page.eval(() => {
        const calls = window.__f6ContinueCalls ?? 0
        if (typeof window.__f6OriginalFetch === 'function') { window.fetch = window.__f6OriginalFetch; window.__f6OriginalFetch = null }
        return calls
      })
      assertEqual(click.notPrevented, false, 'Continue click must be default-prevented')
      assert(click.callsImmediate >= 1 || (callsAfter ?? 0) >= 1, 'Continue click did not issue a continue request')
      if (state.shotsEnabled && nativeRowRect) await writeEvidenceShot(page, '31-continue-native-light', { left: nativeRowRect.left - 10, top: nativeRowRect.top - 4, width: nativeRowRect.width + 20, height: nativeRowRect.height + 8 })
      const panelRowRect = await page.eval(() => {
        const main = document.querySelector('.psd-row-action[data-variant="continue"]')?.closest('.psd-run, .psd-child')
        if (!main) return null
        const r = main.getBoundingClientRect()
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      })
      if (state.shotsEnabled && panelRowRect) {
        await page.moveTo(900, 500)
        await sleep(200)
        await page.moveTo(panelRowRect.left + 80, panelRowRect.top + Math.round(panelRowRect.height / 2))
        await sleep(400)
        await writeEvidenceShot(page, '31-continue-panel-light', { left: panelRowRect.left - 10, top: panelRowRect.top - 4, width: panelRowRect.width + 20, height: panelRowRect.height + 8 })
      }
      const panelDetail = panelButton === null
        ? 'panel surface not sampled: every visible card row is running; the card CTA on a running row is covered by the --interrupted mode (iw-1), so this full-mode row only asserts the native surface below'
        : `panel button: text "${panelButton.text}", aria "${panelButton.aria}", ${panelButton.svgs} glyph`
      return `${panelDetail}; native button: ${nativeButton.rect.width}x${nativeButton.rect.height}, text "${nativeButton.text}", aria "${nativeButton.aria}", click prevented=${!click.notPrevented}, continue POST ${click.callsImmediate}`
    } finally {
      await clearFor(target.id)
      await clearFor(nativeId)
      await sleep(300)
    }
  })

  await results.check('f6-3', 'completed/running status dots keep their semantic shell colours in the panel rows', async () => {
    const read = () => page.eval(() => {
      const resolve = (name) => {
        const probe = document.createElement('div')
        probe.style.background = `var(${name})`
        document.body.appendChild(probe)
        const value = getComputedStyle(probe).backgroundColor
        probe.remove()
        return value
      }
      const dots = [...document.querySelectorAll('.psd-run-glyph, .psd-child-glyph')].map((wrapper) => {
        const dot = wrapper.matches('[data-state]') ? wrapper : wrapper.querySelector('[data-state]')
        if (dot === null) return null
        return { state: dot.getAttribute('data-state'), color: getComputedStyle(dot).color }
      }).filter(Boolean)
      return {
        success: resolve('--dsw-alias-state-success-primary'),
        business: resolve('--dsw-alias-state-business-primary'),
        idle: resolve('--dsw-alias-state-idle-primary'),
        labelSecondary: resolve('--dsw-alias-label-secondary'),
        dots,
      }
    })
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    try {
      await sleep(800)
      const light = await read()
      assert(light.success !== light.labelSecondary, 'success token unexpectedly equals the secondary label')
      for (const dot of light.dots) {
        if (dot.state === 'done') assertEqual(dot.color, light.success, `light: live completed dot must be success green, got ${dot.color}`)
        if (dot.state === 'ongoing') assertEqual(dot.color, light.business, `light: live running dot must be the business colour, got ${dot.color}`)
        assert(dot.color !== light.labelSecondary, `light: live status dot repainted to the secondary label (${dot.color})`)
      }
      await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
      await sleep(800)
      const dark = await read()
      for (const dot of dark.dots) {
        if (dot.state === 'done') assertEqual(dot.color, dark.success, `dark: live completed dot must be success green, got ${dot.color}`)
        // The dark running dot's shell colour is not part of this fix's contract;
        // record it honestly instead of asserting a token the shell owns.
        assert(dot.color !== dark.labelSecondary, `dark: live status dot repainted to the secondary label (${dot.color})`)
      }
      const summary = light.dots.map((dot) => `${dot.state}=${dot.color}`).join(', ') || 'no live dot in this data state'
      return `light live dots ${summary}; dark live dots ${dark.dots.map((dot) => `${dot.state}=${dot.color}`).join(', ') || 'no live dot in this data state'}`
    } finally {
      await page.emulateMedia([])
      await sleep(400)
    }
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

  // A cold subagent row needs an unseeded projection; a long verification session warms
  // every visible subagent, so the check becomes an explicit SKIP (never a fake pass).
  let b62Bridge = await page.eval(probe.projectionBridge).catch(() => null)
  const pickCold = (bridge) => {
    if (bridge === null || bridge.ok !== true) return null
    const visible = new Set(((bridge.domRows) ?? []).filter((row) => row.kind === 'child').map((row) => row.title))
    return (bridge.children ?? []).find((child) => child.needsRead && visible.has(child.title)) ?? null
  }
  let b62Cold = pickCold(b62Bridge)
  if (b62Cold === null && b62Bridge !== null && b62Bridge.ok === true) {
    // A collapsed parent row may hide cold children: expand the card rows like a user and
    // re-check, so a warm-but-collapsed card is not misreported as "no cold subagent".
    const expanded = await page.eval(() => {
      const collapsed = [...document.querySelectorAll('.psd-run-toggle[aria-expanded="false"]')]
      for (const toggle of collapsed) toggle.click()
      return collapsed.length
    }).catch(() => 0)
    if (expanded > 0) {
      await sleep(700)
      b62Bridge = await page.eval(probe.projectionBridge).catch(() => null)
      b62Cold = pickCold(b62Bridge)
    }
  }
  if (b62Bridge === null || b62Bridge.ok !== true) {
    await results.check('b6-2', 'a cold subagent row triggers exactly one projection read, then fills its figures', async () => {
      throw new Error(`projection bridge unavailable: ${short((b62Bridge && b62Bridge.reason) || 'unknown')}`)
    })
  } else if (b62Cold === null) {
    results.skip('b6-2', 'a cold subagent row triggers exactly one projection read, then fills its figures', 'no cold subagent row is visible in the live card: every visible subagent projection was already seeded by this long verification session (the one-shot read can only be observed on an unseeded child). This is an explicit SKIP, not a pass; re-run on a fresh GUI session with a newly created subagent to cover it.')
  } else {
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
  }

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
// Files pane ↔ Artifacts toggle (task-72)
// ---------------------------------------------------------------------------------------------

/** Page-side probes for the Files-header Artifacts action and its overlay. */
const filesProbe = {
  /** The Files page header and the new tool button inside its actions row. */
  header: () => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    }
    const button = document.querySelector('[data-files-artifacts-button]')
    const reload = document.querySelector('[data-files-reload]')
    const page = document.querySelector('[data-files-page]')
    const header = page ? page.firstElementChild : null
    const glyph = button ? button.querySelector('svg') : null
    return {
      page: rect(page),
      header: rect(header),
      button: button
        ? {
            rect: rect(button),
            label: button.getAttribute('aria-label'),
            pressed: button.getAttribute('aria-pressed'),
            className: button.className,
            glyph: rect(glyph),
          }
        : null,
      buttonCount: document.querySelectorAll('[data-files-artifacts-button]').length,
      reload: rect(reload),
      standaloneGuideEntry: document.querySelector('[data-sidebar-right-guide-entry="session-artifacts"]') !== null,
      artifactsTab: [...document.querySelectorAll('[role="tab"]')].some((el) => /^(Artifacts|产物)\b/.test((el.innerText || '').trim())),
    }
  },

  /** One snapshot of the Files/Artifacts view: overlay, marker, navigator fade. */
  view: () => {
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    }
    const overlay = document.querySelector('[data-psfa-overlay]')
    const content = document.querySelector('[data-files-content]')
    const page = document.querySelector('[data-files-page]')
    const button = document.querySelector('[data-files-artifacts-button]')
    const back = document.querySelector('[data-artifacts-back]')
    const panel = document.querySelector('.psfa-view .dsa-root')
    const navigator = content ? content.querySelector(':scope > :not([data-psfa-overlay])') : null
    const backgroundToken = (() => {
      const probe = document.createElement('div')
      probe.style.background = 'var(--dsw-alias-bg-base)'
      document.body.appendChild(probe)
      const value = getComputedStyle(probe).backgroundColor
      probe.remove()
      return value
    })()
    const overlayStyle = overlay ? getComputedStyle(overlay) : null
    return {
      overlayCount: document.querySelectorAll('[data-psfa-overlay]').length,
      overlay: overlay
        ? {
            rect: rect(overlay),
            state: overlay.getAttribute('data-psfa-state'),
            animation: overlayStyle.animationName,
            background: overlayStyle.backgroundColor,
            zIndex: overlayStyle.zIndex,
            insideContent: content !== null && content.contains(overlay),
          }
        : null,
      content: rect(content),
      pageMarker: page ? page.getAttribute('data-psfa-active') : null,
      navigatorOpacity: navigator ? Number(getComputedStyle(navigator).opacity) : null,
      button: button
        ? {
            pressed: button.getAttribute('aria-pressed'),
            expanded: button.getAttribute('aria-expanded'),
            focused: document.activeElement === button,
          }
        : null,
      back: back ? { rect: rect(back), focused: document.activeElement === back } : null,
      panel: panel
        ? {
            phase: panel.getAttribute('data-artifacts-phase'),
            rows: panel.querySelectorAll('.dsa-row').length,
            empty: panel.querySelector('.dsa-empty') !== null,
            loading: panel.querySelector('.dsa-loading') !== null,
            error: panel.querySelector('.dsa-retry') !== null,
            count: (panel.querySelector('.dsa-count')?.textContent || '').trim(),
          }
        : null,
      backgroundToken,
      markerCount: document.querySelectorAll('[data-psfa-active]').length,
    }
  },
}

/**
 * Open the right Sidebar and its Files tab (the Start guide's Workspace files
 * entry), so the Files page with the new header action is mounted.
 * @param {object} page - Page wrapper.
 * @returns {Promise<void>}
 */
async function openFilesTab(page) {
  const open = await page.eval(() => {
    if (document.querySelector('[data-sidebar-right-open]') !== null) return true
    const button = [...document.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === 'Open right sidebar')
    if (!(button instanceof HTMLElement)) return false
    button.click()
    return true
  })
  assert(open, 'right Sidebar could not be opened (no "Open right sidebar" control)')
  await page.waitForFn(() => document.querySelector('[data-sidebar-right-open]') !== null, [], { timeout: 10000, label: 'right Sidebar open' })
  const already = await page.eval(() => document.querySelector('[data-files-page]') !== null)
  if (already) {
    await page.waitForFn(() => document.querySelector('[data-files-artifacts-button]') !== null, [], { timeout: 8000, label: 'Files header action mounted' })
    return
  }
  // The right Sidebar slides open; wait until the Start-guide entry is laid out
  // and then activate it through its own handler, so a still-animating row can
  // never move the click onto a different guide entry.
  await page.waitForFn(
    () => {
      const el = document.querySelector('[data-sidebar-right-guide-entry="files"]')
      return el instanceof HTMLElement && el.getBoundingClientRect().height > 0
    },
    [],
    { timeout: 10000, label: 'Files Start-guide entry' }
  )
  const activated = await page.eval(() => {
    const el = document.querySelector('[data-sidebar-right-guide-entry="files"]')
    if (!(el instanceof HTMLElement)) return false
    el.scrollIntoView({ block: 'center' })
    el.click()
    return true
  })
  assert(activated, 'Files entry is missing from the right Sidebar Start guide')
  await page.waitForFn(() => document.querySelector('[data-files-page]') !== null, [], { timeout: 12000, label: 'Files page mounted' })
  await page.waitForFn(() => document.querySelector('[data-files-artifacts-button]') !== null, [], { timeout: 8000, label: 'Files header action mounted' })
  await sleep(400)
}

/** Collapse the right Sidebar when it is open (best effort). */
async function closeRightSidebar(page) {
  try {
    const at = await page.eval(() => {
      const el = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Collapse right sidebar')
      if (!(el instanceof HTMLElement)) return null
      const r = el.getBoundingClientRect()
      if (r.width <= 0) return null
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    if (at === null) return
    await page.clickAt(at.x, at.y)
    await sleep(500)
  } catch {
    // Collapsing is best effort; the checks run with the pane either way.
  }
}

/**
 * Click the Files-header Artifacts button and sample the overlay one animation
 * frame later, so the enter/exit phase and CSS animation are observable.
 * @param {object} page - Page wrapper.
 * @returns {Promise<object | null>} sampled overlay state, or null when missing.
 */
function clickArtifactsButtonSampled(page) {
  return page.evaluate(`new Promise((resolve) => {
    const button = document.querySelector('[data-files-artifacts-button]')
    if (!(button instanceof HTMLElement)) { resolve(null); return }
    button.click()
    let frames = 0
    const sample = () => {
      frames += 1
      const overlay = document.querySelector('[data-psfa-overlay]')
      if (overlay !== null) {
        const style = getComputedStyle(overlay)
        resolve({
          state: overlay.getAttribute('data-psfa-state'),
          animation: style.animationName,
          opacity: style.opacity,
          transform: style.transform,
          count: document.querySelectorAll('[data-psfa-overlay]').length
        })
        return
      }
      if (frames >= 4) { resolve(null); return }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })`)
}

async function waitArtifactsOpen(page) {
  await page.waitForFn(
    () => document.querySelector('[data-psfa-overlay]')?.getAttribute('data-psfa-state') === 'open',
    [],
    { timeout: 5000, label: 'Artifacts view settled open' }
  )
}

async function waitArtifactsClosed(page) {
  await page.waitForFn(
    () => document.querySelector('[data-psfa-overlay]') === null,
    [],
    { timeout: 5000, label: 'Artifacts view removed (Files back)' }
  )
}

async function waitArtifactsPanelSettled(page) {
  await page.waitForFn(
    () => {
      const phase = document.querySelector('.psfa-view .dsa-root')?.getAttribute('data-artifacts-phase')
      return phase === 'ready' || phase === 'error'
    },
    [],
    { timeout: 12000, label: 'artifacts list response settled' }
  )
}

/** Open the overlay through a real pointer click on the header button. */
async function openArtifactsByPointer(page) {
  const at = await page.findRect('[data-files-artifacts-button]')
  assert(at, 'Files-header Artifacts button is not visible')
  await page.moveTo(900, 500)
  await sleep(150)
  await page.clickAt(at.x, at.y)
  await waitArtifactsOpen(page)
}

/**
 * The task-72 acceptance checks: the Files-header button exists in the native
 * actions row, the overlay replaces the Files content with the animated
 * transition, and click-again/Back/Esc/tab-close/session-switch all return to a
 * clean Files view in both themes and under reduced motion.
 * @param {object} context - checks context.
 * @returns {Promise<void>}
 */
async function runFilesArtifactsChecks({ page, results, state }) {
  log('\n=== Files pane ↔ Artifacts toggle (task-72) ===')
  let filesReady = false
  await results.check('files-1', 'Files header exposes exactly one native-style Artifacts tool left of reload', async () => {
    await openFilesTab(page)
    filesReady = true
    const header = await page.eval(filesProbe.header)
    assert(header.page, 'Files page is not mounted')
    assert(header.button, 'data-files-artifacts-button is missing from the Files header')
    assertEqual(header.buttonCount, 1, 'exactly one Artifacts tool must exist in the Files header')
    assert(/^(Artifacts|产物)$/.test(header.button.label || ''), `button aria-label must be "Artifacts"/"产物", got ${header.button.label}`)
    assertEqual(header.button.rect.width, 28, 'button width must match the native 28 px header tools')
    assertEqual(header.button.rect.height, 28, 'button height must match the native 28 px header tools')
    assertEqual(header.button.glyph.width, 18, 'glyph must match the native tool glyph weight')
    assert(header.reload, 'reload tool not found for the ordering check')
    assert(header.button.rect.right <= header.reload.left + 1, 'Artifacts tool must sit immediately left of the reload control')
    assert(header.reload.left - header.button.rect.right <= 24, `Artifacts tool must hug the reload control (gap ${header.reload.left - header.button.rect.right}px)`)
    assert(header.page.top <= header.button.rect.top && header.button.rect.bottom <= header.page.top + 42, 'button must stay inside the 38 px Files header band')
    assert(!header.standaloneGuideEntry, 'the standalone Artifacts Start-guide entry must be removed (single entry point)')
    assert(!header.artifactsTab, 'no standalone Artifacts page type/tab must remain')
    state.filesHeader = header
    return `button ${header.button.rect.left}..${header.button.rect.right} (reload ${header.reload.left}..${header.reload.right}), glyph ${header.button.glyph.width}px`
  })

  if (!filesReady) {
    for (const id of ['files-2', 'files-3', 'files-4', 'files-5', 'files-6', 'files-7', 'files-8', 'files-9']) {
      await results.skip(id, 'Files-pane Artifacts checks', 'skipped: the Files page did not mount')
    }
    return
  }

  await results.check('files-2', 'clicking the button cross-fades the Files content into the Artifacts list', async () => {
    const sample = await clickArtifactsButtonSampled(page)
    assert(sample, 'Artifacts overlay did not render after the button click')
    assertEqual(sample.state, 'opening', `overlay must start in the opening phase, got ${sample.state}`)
    assert(sample.animation.includes('psfa-view-enter'), `enter animation missing (${sample.animation})`)
    assertEqual(sample.count, 1, 'exactly one overlay must be mounted')
    await waitArtifactsOpen(page)
    await waitArtifactsPanelSettled(page)
    await sleep(350)
    const view = await page.eval(filesProbe.view)
    assertEqual(view.overlayCount, 1, 'exactly one overlay while open')
    assert(view.overlay, 'overlay disappeared after settling')
    assert(view.overlay.insideContent, 'overlay must be a portal inside [data-files-content]')
    for (const edge of ['left', 'top', 'right', 'bottom']) {
      assertNear(view.overlay.rect[edge], view.content[edge], 1, `overlay ${edge} must match the Files content box`)
    }
    assertEqual(view.overlay.zIndex, '2', 'overlay z-index inside the pane content')
    assertEqual(view.pageMarker, 'true', 'Files page must carry the data-psfa-active marker while open')
    assertEqual(view.button.pressed, 'true', 'the header button must show its active pressed state')
    assertEqual(view.markerCount, 1, 'exactly one Files page marker')
    assert(view.navigatorOpacity !== null && view.navigatorOpacity < 0.05, `Files navigator must fade behind the overlay (opacity ${view.navigatorOpacity})`)
    assert(view.panel, 'the artifacts panel did not render inside the overlay')
    assertEqual(view.panel.phase, 'ready', 'artifacts list request must settle ready')
    assert(!view.panel.error, 'artifacts list request failed')
    assert(view.panel.rows > 0 || view.panel.empty, 'the artifacts view must show a list or its empty state')
    state.filesOpen = view
    return `opening animation ${sample.animation}; overlay ${view.overlay.rect.width}x${view.overlay.rect.height} == content; panel ${view.panel.rows} rows / empty=${view.panel.empty}`
  })

  await results.check('files-3', 'clicking again reverses the transition and restores Files', async () => {
    const sample = await clickArtifactsButtonSampled(page)
    assert(sample, 'closing did not render the overlay')
    assertEqual(sample.state, 'closing', `overlay must start in the closing phase, got ${sample.state}`)
    assert(sample.animation.includes('psfa-view-exit'), `exit animation missing (${sample.animation})`)
    await waitArtifactsClosed(page)
    await page.waitForFn(
      () => {
        const content = document.querySelector('[data-files-content]')
        const navigator = content ? content.querySelector(':scope > :not([data-psfa-overlay])') : null
        return navigator !== null && Number(getComputedStyle(navigator).opacity) > 0.95
      },
      [],
      { timeout: 3000, label: 'Files navigator restored' }
    )
    const view = await page.eval(filesProbe.view)
    assertEqual(view.overlayCount, 0, 'overlay must be unmounted after closing')
    assertEqual(view.pageMarker, null, 'the Files page marker must be removed after closing')
    assertEqual(view.button.pressed, 'false', 'button pressed state must clear')
    assertEqual(view.button.focused, true, 'focus must return to the header button')
    state.filesClosed = view
    return `closing animation ${sample.animation}; overlay removed, Files navigator opacity ${view.navigatorOpacity}`
  })

  await results.check('files-4', 'the in-panel Back control returns to Files', async () => {
    await openArtifactsByPointer(page)
    await waitArtifactsPanelSettled(page)
    const back = await page.findRect('[data-artifacts-back]')
    assert(back, 'Back button is missing from the artifacts panel header')
    await page.clickAt(back.x, back.y)
    await waitArtifactsClosed(page)
    const view = await page.eval(filesProbe.view)
    assertEqual(view.overlayCount, 0, 'Back did not close the artifacts view')
    assertEqual(view.pageMarker, null, 'Back left the Files page marker behind')
    return `Back at ${back.x},${back.y} closed the view`
  })

  await results.check('files-5', 'Escape returns to Files', async () => {
    await openArtifactsByPointer(page)
    await waitArtifactsPanelSettled(page)
    await page.pressEscape()
    await waitArtifactsClosed(page)
    const view = await page.eval(filesProbe.view)
    assertEqual(view.overlayCount, 0, 'Escape did not close the artifacts view')
    assertEqual(view.button.pressed, 'false', 'Escape left the header button pressed')
    return 'Esc closed the artifacts view'
  })

  await results.check('files-6', 'the view is theme-correct in light and dark', async () => {
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    await sleep(300)
    await openArtifactsByPointer(page)
    await waitArtifactsPanelSettled(page)
    await sleep(250)
    const light = await page.eval(filesProbe.view)
    assertEqual(light.overlay.background, light.backgroundToken, 'overlay must use the shell surface color in light theme')
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
    await sleep(600)
    const dark = await page.eval(filesProbe.view)
    assertEqual(dark.overlay.background, dark.backgroundToken, 'overlay must use the shell surface color in dark theme')
    assert(light.overlay.background !== dark.overlay.background, 'the overlay background must follow the theme')
    await page.emulateMedia([])
    await sleep(300)
    const closeAt = await page.findRect('[data-files-artifacts-button]')
    assert(closeAt, 'Artifacts button disappeared before the theme check could close the view')
    await page.clickAt(closeAt.x, closeAt.y)
    await waitArtifactsClosed(page)
    return `light ${light.overlay.background} / dark ${dark.overlay.background}`
  })

  await results.check('files-7', 'reduced motion swaps instantly with no animations', async () => {
    await waitArtifactsClosed(page)
    await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await sleep(300)
    // The 0 ms settlement can win the race against the first animation frame, so
    // a missed sample is expected; when a sample is caught it must carry no
    // animation. Both directions must complete quickly (no 160-180 ms transition).
    const openedSample = await clickArtifactsButtonSampled(page)
    if (openedSample !== null) {
      assertEqual(openedSample.animation, 'none', 'no enter animation under reduced motion')
      assert(['opening', 'open'].includes(openedSample.state), `unexpected open phase ${openedSample.state}`)
    }
    const openStarted = Date.now()
    await waitArtifactsOpen(page)
    assert(Date.now() - openStarted < 1500, 'reduced-motion open did not swap promptly')
    const button = await page.findRect('[data-files-artifacts-button]')
    assert(button, 'Artifacts button disappeared under reduced motion')
    const closeStarted = Date.now()
    await page.clickAt(button.x, button.y)
    await waitArtifactsClosed(page)
    assert(Date.now() - closeStarted < 1500, 'reduced-motion close did not swap promptly')
    await page.emulateMedia([])
    await sleep(300)
    return `enter sample ${openedSample === null ? 'settled before first frame' : openedSample.animation}; both swaps prompt`
  })

  await results.check('files-8', 'closing the Files tab tears the overlay down (no leaks)', async () => {
    await openArtifactsByPointer(page)
    await waitArtifactsPanelSettled(page)
    const closeTab = await page.eval(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((el) => /^(Files|文件)\b/.test((el.innerText || '').trim()))
      if (!(tab instanceof HTMLElement)) return null
      const buttons = [...tab.querySelectorAll('button')].filter((el) => el.getBoundingClientRect().width > 0)
      const hit = buttons[buttons.length - 1]
      if (!(hit instanceof HTMLElement)) return null
      const r = hit.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    assert(closeTab, 'Files tab close button not found')
    await page.clickAt(closeTab.x, closeTab.y)
    await page.waitForFn(
      () => document.querySelector('[data-files-page]') === null && document.querySelector('[data-psfa-overlay]') === null,
      [],
      { timeout: 8000, label: 'Files tab closed and overlay removed' }
    )
    const leftovers = await page.evaluate(`({
      overlays: document.querySelectorAll('[data-psfa-overlay]').length,
      buttons: document.querySelectorAll('[data-files-artifacts-button]').length,
      markers: document.querySelectorAll('[data-psfa-active]').length
    })`)
    assertEqual(leftovers.overlays, 0, 'overlay leaked after the tab closed')
    assertEqual(leftovers.buttons, 0, 'header button leaked after the tab closed')
    assertEqual(leftovers.markers, 0, 'Files page marker leaked after the tab closed')
    return 'tab close removed overlay, button and marker'
  })

  await results.check('files-9', 'a Session switch closes the right-pane view without leftovers', async () => {
    const rows = await page.count('.psd-run')
    if (rows === 0) {
      await results.skip('files-9', 'a Session switch closes the right-pane view', 'no running/recent card rows in this live GUI')
      return
    }
    await openFilesTab(page)
    await openArtifactsByPointer(page)
    await waitArtifactsPanelSettled(page)
    const before = await page.eval(() => document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null)
    assert(before, 'no open Session id could be read before the switch')
    // Prefer a card row that is not the current Session; when every row is the
    // current one, create a fresh Session through the native flow instead.
    const target = await page.eval(() => {
      const rows = [...document.querySelectorAll('.psd-run')]
      const row = rows.find((candidate) => !candidate.classList.contains('psd-run-current')) ?? null
      if (row !== null) {
        const main = row.querySelector('.psd-run-main')
        if (main instanceof HTMLElement) {
          const r = main.getBoundingClientRect()
          return { kind: 'row', x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }
        }
      }
      const newSession = [...document.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === 'New session' && el.getBoundingClientRect().top < 200)
      if (!(newSession instanceof HTMLElement)) return null
      const r = newSession.getBoundingClientRect()
      return { kind: 'new-session', x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    assert(target, 'no card row or new-Session control available for the session-switch check')
    await page.moveTo(900, 500)
    await sleep(150)
    await page.clickAt(target.x, target.y)
    await page.waitForFn(
      (previous) => {
        const current = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null
        return current !== null && current !== previous
      },
      [before],
      { timeout: 15000, label: 'main Session switched' }
    )
    await page.waitForFn(
      () => document.querySelectorAll('[data-psfa-overlay]').length === 0,
      [],
      { timeout: 10000, label: 'artifacts overlay gone after the session switch' }
    )
    const leftovers = await page.evaluate(`({
      overlays: document.querySelectorAll('[data-psfa-overlay]').length,
      buttons: document.querySelectorAll('[data-files-artifacts-button]').length,
      markers: document.querySelectorAll('[data-psfa-active]').length
    })`)
    assertEqual(leftovers.overlays, 0, 'overlay survived the Session switch')
    assertEqual(leftovers.markers, 0, 'Files page marker survived the Session switch')
    return `session ${before} → switched; overlay gone (buttons ${leftovers.buttons})`
  })

  await closeRightSidebar(page)
  await page.emulateMedia([])
}

// ---------------------------------------------------------------------------------------------
// Composer image gallery (task-74)
// ---------------------------------------------------------------------------------------------

// Two valid in-memory PNGs (40x30 red, 30x40 blue) used to seed the composer
// attachment rail through a synthetic paste. Generated locally, no network.
const GALLERY_PNG_A = 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAKklEQVR42u3NMQ0AAAgDsAmb/yALGXA06d9MeyJisVgsFovFYrFYLP4bL9HP3EyYzxBrAAAAAElFTkSuQmCC'
const GALLERY_PNG_B = 'iVBORw0KGgoAAAANSUhEUgAAAB4AAAAoCAIAAABmcd1FAAAALElEQVR42u3MQQkAAAgEsAtmRCMaxhQ+hMHeS/UciVqtVqvVarVarVar/9cL6UyxKjg4CB8AAAAASUVORK5CYII='

/** Page-side probes for the composer attachment rail and the gallery overlay. */
const galleryProbe = {
  /** Openable pasted-image thumbnails in rail order (title + img, no aria label). */
  composerThumbs: () => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const composer = document.querySelector('[data-conversation-region="composer"]')
    if (!(composer instanceof HTMLElement)) return []
    return [...composer.querySelectorAll('button')]
      .filter((button) => {
        if (!(button instanceof HTMLElement)) return false
        const img = button.querySelector('img')
        if (!(img instanceof HTMLImageElement)) return false
        if (button.querySelector('svg') !== null) return false
        if (button.hasAttribute('aria-label')) return false
        if (button.children.length !== 1 || button.firstElementChild !== img) return false
        return typeof button.getAttribute('title') === 'string' && button.getAttribute('title').length > 0
      })
      .map((button) => {
        const img = button.querySelector('img')
        return {
          ...rect(button),
          src: img.getAttribute('src'),
          alt: img.getAttribute('alt'),
          title: button.getAttribute('title'),
          focused: document.activeElement === button,
        }
      })
  },

  /** Gallery overlay state. */
  gallery: () => {
    const root = document.querySelector('[data-psg-gallery]')
    const counter = document.querySelector('[data-psg-counter]')
    const image = document.querySelector('[data-psg-image]')
    const prev = document.querySelector('[data-psg-prev]')
    const next = document.querySelector('[data-psg-next]')
    const close = document.querySelector('[data-psg-close]')
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: Math.round(r.width), height: Math.round(r.height) }
    }
    return {
      present: root !== null,
      count: document.querySelectorAll('[data-psg-gallery]').length,
      role: root ? root.getAttribute('role') : null,
      modal: root ? root.getAttribute('aria-modal') : null,
      index: root ? Number(root.getAttribute('data-psg-index')) : null,
      total: root ? Number(root.getAttribute('data-psg-total')) : null,
      counter: counter ? (counter.textContent || '').trim() : null,
      imageSrc: image ? image.getAttribute('src') : null,
      imageAlt: image ? image.getAttribute('alt') : null,
      prev: prev ? { ...rect(prev), disabled: prev.disabled, label: prev.getAttribute('aria-label') } : null,
      next: next ? { ...rect(next), disabled: next.disabled, label: next.getAttribute('aria-label') } : null,
      close: rect(close),
      closeFocused: close !== null && document.activeElement === close,
      nativeDialogs: [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
        .filter((el) => !el.hasAttribute('data-psg-gallery')).length,
      pageScrollY: window.scrollY,
    }
  },
}

/** Seed the composer attachment rail with two pasted PNGs (synthetic paste). */
async function pasteComposerImages(page) {
  const result = await page.eval((args) => {
    const editor = document.querySelector('[data-lexical-editor="true"]')
    if (!(editor instanceof HTMLElement)) return { ok: false, error: 'no composer editor' }
    const make = (name, b64) => {
      const bytes = Uint8Array.from(atob(b64), (character) => character.charCodeAt(0))
      return new File([bytes], name, { type: 'image/png' })
    }
    const transfer = new DataTransfer()
    transfer.items.add(make('gallery-one.png', args.a))
    transfer.items.add(make('gallery-two.png', args.b))
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
    return { ok: true, files: transfer.files.length }
  }, { a: GALLERY_PNG_A, b: GALLERY_PNG_B })
  assert(result.ok, `synthetic image paste failed: ${result.error || 'unknown'}`)
}

async function waitComposerThumbs(page, count, timeout = 15000) {
  await page.waitForFn(
    (expected) => {
      const composer = document.querySelector('[data-conversation-region="composer"]')
      if (!(composer instanceof HTMLElement)) return false
      const thumbs = [...composer.querySelectorAll('button')].filter((button) => {
        const img = button.querySelector('img')
        if (!(img instanceof HTMLImageElement)) return false
        if (button.querySelector('svg') !== null || button.hasAttribute('aria-label')) return false
        if (button.children.length !== 1 || button.firstElementChild !== img) return false
        return typeof button.getAttribute('title') === 'string' && button.getAttribute('title').length > 0
      })
      return thumbs.length === expected
    },
    [count],
    { timeout, label: `${count} openable composer image thumbnails` }
  )
  await sleep(300)
}

async function waitGalleryOpen(page) {
  await page.waitForFn(() => document.querySelector('[data-psg-gallery]') !== null, [], { timeout: 5000, label: 'composer gallery open' })
}

async function waitGalleryClosed(page) {
  await page.waitForFn(() => document.querySelector('[data-psg-gallery]') === null, [], { timeout: 5000, label: 'composer gallery closed' })
}

/** Click one composer thumbnail through real CDP input. */
async function clickComposerThumb(page, index) {
  const thumbs = (await page.eval(galleryProbe.composerThumbs)) || []
  assert(thumbs[index], `composer thumbnail ${index} is missing (have ${thumbs.length})`)
  await page.moveTo(900, 500)
  await sleep(120)
  await page.clickAt(thumbs[index].x, thumbs[index].y)
  await waitGalleryOpen(page)
  await sleep(220)
}

/** Click one of the gallery's icon buttons through real CDP input. */
async function clickGalleryControl(page, selector) {
  const target = await page.findRect(selector)
  assert(target, `gallery control ${selector} is missing`)
  await page.clickAt(target.x, target.y)
  await sleep(260)
}

/** Remove every openable pasted attachment again (best effort cleanup). */
async function removeComposerAttachments(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const remaining = await page.evaluate(`(() => {
      const composer = document.querySelector('[data-conversation-region="composer"]')
      if (!(composer instanceof HTMLElement)) return 0
      const items = [...composer.querySelectorAll('button')].filter((button) => {
        const img = button.querySelector('img')
        return img instanceof HTMLImageElement && button.querySelector('svg') === null && !button.hasAttribute('aria-label') && button.children.length === 1 && button.firstElementChild === img && (button.getAttribute('title') || '').length > 0
      })
      const item = items[0] ? items[0].parentElement : null
      const remove = item ? [...item.querySelectorAll('button')].find((button) => !button.querySelector('img')) : null
      if (!(remove instanceof HTMLElement)) return items.length
      remove.click()
      return items.length - 1
    })()`)
    await sleep(400)
    if (remaining === 0) break
  }
}

/**
 * Task-74 checks: a continuous viewer for the composer's pasted screenshots.
 * Runs right after the blank-Session smoke, seeds two real PNG pastes through a
 * synthetic DataTransfer paste, exercises every navigation input, then removes
 * the attachments again so later checks see a clean composer.
 * @param {object} context - checks context.
 * @returns {Promise<void>}
 */
async function runComposerGalleryChecks({ page, results, state, opts }) {
  log('\n=== Composer image gallery (task-74) ===')
  let seeded = false
  try {
    await results.check('gallery-1', 'two pasted screenshots seed the composer rail in order', async () => {
      await page.moveTo(900, 500)
      await removeComposerAttachments(page)
      await pasteComposerImages(page)
      await waitComposerThumbs(page, 2)
      const thumbs = await page.eval(galleryProbe.composerThumbs)
      assertEqual(thumbs.length, 2, 'expected exactly two openable pasted thumbnails')
      assertEqual(thumbs[0].alt, 'gallery-one.png', 'first thumbnail keeps the paste order')
      assertEqual(thumbs[1].alt, 'gallery-two.png', 'second thumbnail keeps the paste order')
      assert(thumbs[0].src.startsWith('blob:'), 'composer thumbnail uses its blob preview URL')
      assert(thumbs[0].title.length > 0, 'thumbnail has the native open-original title')
      state.galleryThumbs = thumbs
      seeded = true
      return `names ${thumbs.map((thumb) => thumb.alt).join(' → ')}, src blob previews`
    })

    if (!seeded) {
      for (const id of ['gallery-2', 'gallery-3', 'gallery-4', 'gallery-5', 'gallery-6', 'gallery-7', 'gallery-8', 'gallery-9']) {
        await results.skip(id, 'Composer image gallery checks', 'skipped: the composer rail could not be seeded')
      }
      return
    }

    await results.check('gallery-2', 'clicking one screenshot opens the gallery instead of the native lightbox', async () => {
      await clickComposerThumb(page, 0)
      const view = await page.eval(galleryProbe.gallery)
      assert(view.present, 'plugin gallery did not open')
      assertEqual(view.count, 1, 'exactly one gallery overlay')
      assertEqual(view.role, 'dialog', 'gallery must be a dialog')
      assertEqual(view.modal, 'true', 'gallery must be modal')
      assertEqual(view.counter, '1 / 2', 'counter must show the position in the rail')
      assertEqual(view.imageSrc, state.galleryThumbs[0].src, 'gallery shows the clicked screenshot first')
      assertEqual(view.imageAlt, 'gallery-one.png', 'gallery image accessible name')
      assertEqual(view.nativeDialogs, 0, 'the native single-image lightbox must not open')
      assertEqual(view.prev.disabled, true, 'Previous is disabled on the first image')
      assertEqual(view.next.disabled, false, 'Next is enabled on the first image')
      assert(view.close !== null, 'gallery close control missing')
      assertEqual(view.closeFocused, true, 'focus moves into the gallery')
      state.galleryOpen = view
      return `counter ${view.counter}, no native dialog, first image ${view.imageAlt}`
    })

    await results.check('gallery-3', 'Previous/Next buttons walk the pasted images in rail order', async () => {
      await clickGalleryControl(page, '[data-psg-next]')
      const second = await page.eval(galleryProbe.gallery)
      assertEqual(second.counter, '2 / 2', 'Next moves to the second image')
      assertEqual(second.imageSrc, state.galleryThumbs[1].src, 'Next shows the second rail image')
      assertEqual(second.next.disabled, true, 'Next is disabled on the last image')
      assertEqual(second.prev.disabled, false, 'Previous is enabled on the last image')
      await clickGalleryControl(page, '[data-psg-prev]')
      const first = await page.eval(galleryProbe.gallery)
      assertEqual(first.counter, '1 / 2', 'Previous returns to the first image')
      assertEqual(first.imageSrc, state.galleryThumbs[0].src, 'Previous shows the first rail image')
      assertEqual(first.prev.disabled, true, 'Previous disables again at the start (no wrap)')
      return '2 / 2 → 1 / 2 with clamped buttons'
    })

    await results.check('gallery-4', 'keyboard arrows navigate the same list', async () => {
      const press = async (key, code, vk) => {
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
        await sleep(30)
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
        await sleep(220)
      }
      await press('ArrowRight', 'ArrowRight', 39)
      const right = await page.eval(galleryProbe.gallery)
      assertEqual(right.index, 1, 'ArrowRight moves to the next image')
      await press('ArrowLeft', 'ArrowLeft', 37)
      const left = await page.eval(galleryProbe.gallery)
      assertEqual(left.index, 0, 'ArrowLeft moves to the previous image')
      return 'ArrowRight 1→2, ArrowLeft 2→1'
    })

    await results.check('gallery-5', 'mouse wheel steps once per gesture', async () => {
      const view = await page.eval(galleryProbe.gallery)
      assertEqual(view.index, 0, 'wheel check starts from the first image')
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 864, y: 450, deltaX: 0, deltaY: 120 })
      await sleep(120)
      const firstStep = await page.eval(galleryProbe.gallery)
      assertEqual(firstStep.index, 1, 'one wheel gesture advances exactly one image')
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 864, y: 450, deltaX: 0, deltaY: 120 })
      await sleep(120)
      const duringCooldown = await page.eval(galleryProbe.gallery)
      assertEqual(duringCooldown.index, 1, 'a second event inside the cooldown must not skip another image')
      await sleep(360)
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 864, y: 450, deltaX: 0, deltaY: -120 })
      await sleep(200)
      const back = await page.eval(galleryProbe.gallery)
      assertEqual(back.index, 0, 'a later gesture steps backward')
      assertEqual(back.pageScrollY, 0, 'the gallery must not scroll the page behind it')
      return 'one step per gesture, cooldown swallows momentum, reverse gesture works'
    })

    if (opts.shots) {
      await results.check('gallery-6', 'light and dark gallery screenshots', async () => {
        await mkdir(SHOTS_DIR, { recursive: true })
        await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
        await sleep(350)
        const lightFile = path.join(SHOTS_DIR, '30-composer-gallery-light.png')
        await page.screenshot(lightFile)
        const light = await page.eval(() => {
          const counter = document.querySelector('[data-psg-counter]')
          return counter ? getComputedStyle(counter).backgroundColor : null
        })
        await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
        await sleep(600)
        const darkFile = path.join(SHOTS_DIR, '31-composer-gallery-dark.png')
        await page.screenshot(darkFile)
        const dark = await page.eval(() => {
          const counter = document.querySelector('[data-psg-counter]')
          return counter ? getComputedStyle(counter).backgroundColor : null
        })
        await page.emulateMedia([])
        await sleep(300)
        assert(light !== dark, 'gallery controls must follow the shell theme')
        state.screenshots.push(lightFile, darkFile)
        return `counter light ${light} / dark ${dark}; shots ${path.basename(lightFile)}, ${path.basename(darkFile)}`
      })
    } else {
      await results.skip('gallery-6', 'light and dark gallery screenshots', 'screenshots disabled')
    }

    await results.check('gallery-7', 'Escape closes the gallery and returns focus to the clicked thumbnail', async () => {
      await page.pressEscape()
      await waitGalleryClosed(page)
      await sleep(120)
      const focus = await page.eval(galleryProbe.composerThumbs)
      const focused = focus.find((thumb) => thumb.focused === true)
      assert(focused, 'focus did not return to the clicked composer thumbnail')
      assertEqual(focused.alt, 'gallery-one.png', 'focus returns to the thumbnail that opened the gallery')
      const after = await page.eval(galleryProbe.gallery)
      assertEqual(after.count, 0, 'gallery overlay removed after Escape')
      assertEqual(after.nativeDialogs, 0, 'Escape did not leak a native lightbox')
      return `focus back on ${focused.alt}, overlay removed`
    })

    await results.check('gallery-9', 'clicking the backdrop dismisses the gallery', async () => {
      await clickComposerThumb(page, 0)
      await waitGalleryOpen(page)
      const open = await page.eval(galleryProbe.gallery)
      assert(open.present, 'gallery did not reopen for the backdrop check')
      await page.clickAt(80, 400)
      await waitGalleryClosed(page)
      const after = await page.eval(galleryProbe.gallery)
      assertEqual(after.count, 0, 'backdrop click must dismiss the gallery')
      return 'left backdrop click closed the gallery'
    })

    await results.check('gallery-8', 'attachment removal while open clamps the viewer, and a single image is not intercepted', async () => {
      await clickComposerThumb(page, 0)
      const openView = await page.eval(galleryProbe.gallery)
      assertEqual(openView.total, 2, 'gallery opened on two images before removal')
      await page.evaluate(`(() => {
        const composer = document.querySelector('[data-conversation-region="composer"]')
        const items = [...composer.querySelectorAll('button')].filter((button) => {
          const img = button.querySelector('img')
          return img instanceof HTMLImageElement && button.querySelector('svg') === null && !button.hasAttribute('aria-label') && button.children.length === 1 && button.firstElementChild === img && (button.getAttribute('title') || '').length > 0
        })
        const second = items[1]
        if (second) {
          const remove = [...second.parentElement.querySelectorAll('button')].find((button) => !button.querySelector('img'))
          if (remove) remove.click()
        }
      })()`)
      await page.waitForFn(
        () => document.querySelector('[data-psg-gallery]')?.getAttribute('data-psg-total') === '1',
        [],
        { timeout: 5000, label: 'gallery clamps to the remaining image' }
      )
      const clamped = await page.eval(galleryProbe.gallery)
      assertEqual(clamped.total, 1, 'removal clamps the gallery to the remaining image')
      assertEqual(clamped.counter, '1 / 1', 'counter follows the clamped list')
      assertEqual(clamped.prev.disabled, true, 'Previous disabled with one image')
      assertEqual(clamped.next.disabled, true, 'Next disabled with one image')
      await page.pressEscape()
      await waitGalleryClosed(page)
      await sleep(200)
      // One image left: the plugin must NOT intercept its click, so the shell's
      // own single-image lightbox stays in charge. The native lightbox is opened
      // through the real React handler in a production browser, but its
      // full-screen backdrop blur wedges this headless software renderer, so the
      // check observes the click decision instead of opening it: a guard listener
      // registered after ours records whether our interceptor cancelled the click
      // and then stops the native handler from running.
      const single = await page.evaluate(`new Promise((resolve) => {
        const composer = document.querySelector('[data-conversation-region="composer"]')
        const thumb = composer ? [...composer.querySelectorAll('button')].find((button) => {
          const img = button.querySelector('img')
          return img instanceof HTMLImageElement && button.querySelector('svg') === null && !button.hasAttribute('aria-label') && button.children.length === 1 && button.firstElementChild === img && (button.getAttribute('title') || '').length > 0
        }) : null
        if (!(thumb instanceof HTMLElement)) { resolve({ ok: false, reason: 'no single thumbnail' }); return }
        let seen = null
        const guard = (event) => {
          seen = { prevented: event.defaultPrevented }
          event.stopImmediatePropagation()
          event.preventDefault()
        }
        document.addEventListener('click', guard, true)
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
        try { thumb.dispatchEvent(event) } finally { document.removeEventListener('click', guard, true) }
        resolve({ ok: true, seen, gallery: document.querySelectorAll('[data-psg-gallery]').length, preventedAfter: event.defaultPrevented })
      })`)
      assert(single.ok, `single-image probe failed: ${single.reason || 'unknown'}`)
      assert(single.seen !== null, 'the single-image click never reached the guard listener')
      assertEqual(single.seen.prevented, false, 'the plugin must not prevent the single-image click (native lightbox stays)')
      assertEqual(single.gallery, 0, 'the plugin gallery must not open for a single image')
      await removeComposerAttachments(page)
      const cleaned = await page.eval(galleryProbe.composerThumbs)
      assertEqual(cleaned.length, 0, 'pasted attachments are removed again after the checks')
      return '2 → 1 clamp, single-image click not intercepted, composer cleaned'
    })
  } finally {
    // Never leave a stray overlay or pasted attachment behind for later checks.
    try {
      await page.evaluate(`(() => {
        for (const close of document.querySelectorAll('[data-psg-close]')) close.click()
        for (const dialog of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) {
          if (dialog.hasAttribute('data-psg-gallery')) continue
          const close = [...dialog.querySelectorAll('button')].find((button) => button.getAttribute('aria-label'))
          if (close) close.click()
        }
      })()`)
      await sleep(400)
      await removeComposerAttachments(page)
      await page.emulateMedia([])
    } catch {
      // Cleanup is best effort.
    }
  }
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
  await captureFilesArtifactsEvidence(page, shot)
  await page.emulateMedia([])
  await sleep(300)
  return shots
}

/**
 * Photograph the Files-header Artifacts tool and the open artifacts view inside
 * the right Sidebar, in both themes. Best effort: the screenshot pass must not
 * fail on a live-data hiccup.
 * @param {object} page - Page wrapper.
 * @param {Function} shot - screenshot(name, clip) helper.
 * @returns {Promise<void>}
 */
async function captureFilesArtifactsEvidence(page, shot) {
  try {
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    await openFilesTab(page)
    await page.waitForFn(
      () => {
        const panel = document.querySelector('[data-sidebar-right-panel]')
        return panel instanceof HTMLElement && panel.getBoundingClientRect().width > 100
      },
      [],
      { timeout: 8000, label: 'right Sidebar laid out for evidence' }
    )
    await sleep(400)
    const filesClip = await page.eval(() => {
      const page = document.querySelector('[data-files-page]')
      const panel = document.querySelector('[data-sidebar-right-panel]')
      if (!(page instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null
      const r = panel.getBoundingClientRect()
      const header = page.firstElementChild.getBoundingClientRect()
      return {
        x: Math.max(0, Math.round(r.left)),
        y: Math.max(0, Math.round(r.top)),
        width: Math.min(Math.round(r.width), window.innerWidth - Math.max(0, Math.round(r.left))),
        height: Math.min(Math.round(header.height + 120), 220),
      }
    })
    if (filesClip !== null && filesClip.width > 0) await shot('20-files-header-light', filesClip)
    await openArtifactsByPointer(page)
    await waitArtifactsPanelSettled(page)
    await sleep(350)
    await shot('21-files-artifacts-light')
    const clip = await page.eval(() => {
      const panel = document.querySelector('[data-sidebar-right-panel]')
      if (!(panel instanceof HTMLElement)) return null
      const r = panel.getBoundingClientRect()
      return {
        x: Math.max(0, Math.round(r.left)),
        y: Math.max(0, Math.round(r.top)),
        width: Math.min(Math.round(r.width), window.innerWidth - Math.max(0, Math.round(r.left))),
        height: Math.min(Math.round(r.height), window.innerHeight),
      }
    })
    if (clip !== null && clip.width > 0) await shot('22-files-artifacts-pane-light', clip)
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'dark' }])
    await sleep(700)
    await shot('23-files-artifacts-dark')
    if (clip !== null && clip.width > 0) await shot('24-files-artifacts-pane-dark', clip)
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    await sleep(300)
    await page.pressEscape()
    await waitArtifactsClosed(page)
    await closeRightSidebar(page)
  } catch (error) {
    // Evidence capture is best effort; surface the reason for the run log.
    log(`files-artifacts evidence skipped: ${short(error?.message || String(error), 240)}`)
  }
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
    // Advance width of the title's first non-space character (used by the default-state
    // first-character centring assertion: titleLeft + firstCharWidth / 2 ≈ the dot column).
    const firstGlyphWidth = (element) => {
      if (element === null) return null
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node !== null && (node.nodeValue ?? '').trim().length === 0) node = walker.nextNode()
      if (node === null) return null
      const value = node.nodeValue ?? ''
      const index = value.search(/\S/)
      if (index < 0) return null
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const box = range.getBoundingClientRect()
      return Number(box.width.toFixed(2))
    }
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
      const rowRectValue = rect(row)
      return {
        title: text(titleElement),
        state: row.getAttribute('data-state'),
        titleLeft: titleRect === null ? null : titleRect.left,
        titleTop: titleRect === null ? null : titleRect.top,
        titleLeftRel: titleRect === null || rowRectValue === null ? null : Number((titleRect.left - rowRectValue.left).toFixed(2)),
        titleShift: titleElement === null ? null : (Number.parseFloat(getComputedStyle(titleElement).getPropertyValue('--psd-title-shift')) || 0),
        titleMarginLeft: openButton === null ? null : Number.parseFloat(getComputedStyle(openButton).marginLeft),
        firstCharWidth: firstGlyphWidth(titleElement),
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

  /** Hoverable controls inside one card row (New session / Continue / disclosure / pin). */
  cardRowControls: (kind, title) => {
    const rowSelector = kind === 'child' ? '.psd-child' : '.psd-run'
    const titleSelector = kind === 'child' ? '.psd-child-title' : '.psd-run-title'
    const row = [...document.querySelectorAll(rowSelector)]
      .find((element) => ((element.querySelector(titleSelector)?.innerText ?? '').trim()) === title)
    if (row === undefined) return null
    const controls = [...row.querySelectorAll('.psd-row-action, .psd-row-continue, .psd-run-toggle, .psd-run-pin')]
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          className: String(element.className || ''),
          variant: element.getAttribute('data-variant'),
          label: element.getAttribute('aria-label'),
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0,
          hovered: element.matches(':hover'),
          background: style.backgroundColor,
          filter: style.filter,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
        }
      })
      .filter((control) => control.visible)
    return {
      rowBackground: getComputedStyle(row).backgroundColor,
      rowHovered: row.matches(':hover'),
      controls
    }
  },

  /** Hoverable native action buttons inside one native session/workspace row. */
  nativeRowControls: (rowSelector) => {
    const row = document.querySelector(rowSelector)
    if (row === null) return null
    const controls = [...row.querySelectorAll('button, [role="button"]')]
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          className: String(element.className || ''),
          label: element.getAttribute('aria-label'),
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
          hovered: element.matches(':hover'),
          background: style.backgroundColor,
          filter: style.filter,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
        }
      })
      .filter((control) => control.visible)
    return {
      rowBackground: getComputedStyle(row).backgroundColor,
      rowHovered: row.matches(':hover'),
      controls
    }
  },

  /** Row-height facts for the card rows + the native Workspace/Session reference rows. */
  rowHeights: () => {
    const rectOf = (element) => {
      const r = element.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const centerY = (element) => {
      const r = element.getBoundingClientRect()
      return r.top + r.height / 2
    }
    const visible = (element) => {
      const r = element.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const workspaceRows = [...document.querySelectorAll('[data-row-key^="workspace:"]')].filter(visible)
    const sessionRows = [...document.querySelectorAll('[data-row-key^="session:"]')].filter(visible)
    const rows = [...document.querySelectorAll('.psd-run, .psd-child')].map((row) => {
      const kind = row.classList.contains('psd-run') ? 'parent' : 'child'
      const main = row.querySelector(kind === 'parent' ? '.psd-run-main' : '.psd-child-main')
      const title = row.querySelector(kind === 'parent' ? '.psd-run-title' : '.psd-child-title')
      const time = row.querySelector(kind === 'parent' ? '.psd-run-time' : '.psd-child-time')
      const rowRect = rectOf(row)
      const mainRect = main === null ? null : rectOf(main)
      const titleStyle = title === null ? null : getComputedStyle(title)
      const rowCenter = rowRect.top + rowRect.height / 2
      return {
        kind,
        title: (title ? (title.innerText || '') : '').trim(),
        row: rowRect,
        main: mainRect,
        mainBoxSizing: main === null ? null : getComputedStyle(main).boxSizing,
        mainCssHeight: main === null ? null : getComputedStyle(main).height,
        titleCenterDelta: title === null ? null : Number((centerY(title) - rowCenter).toFixed(1)),
        timeCenterDelta: time === null ? null : Number((centerY(time) - rowCenter).toFixed(1)),
        titleWhiteSpace: titleStyle === null ? null : titleStyle.whiteSpace,
        titleLineHeight: titleStyle === null ? null : titleStyle.lineHeight,
        titleRect: title === null ? null : rectOf(title),
        timeRect: time === null ? null : rectOf(time)
      }
    })
    const panel = document.querySelector('.psd-panel')
    const body = panel === null ? null : (panel.querySelector('.psd-panel-body') ?? panel)
    return {
      workspaceHeights: workspaceRows.map((element) => ({ key: element.getAttribute('data-row-key'), rect: rectOf(element) })),
      sessionHeights: sessionRows.map((element) => ({ key: element.getAttribute('data-row-key'), rect: rectOf(element) })),
      rows,
      panel: panel === null
        ? null
        : {
            rect: rectOf(panel),
            bodyScrollHeight: body === null ? null : body.scrollHeight,
            bodyClientHeight: body === null ? null : body.clientHeight,
            bodyScrollTop: body === null ? null : body.scrollTop
          }
    }
  },

  /** Leading-glyph cell / child-tree trunk / pin column alignment facts for main rows. */
  glyphAlignment: () => {
    const rectOf = (element) => {
      const r = element.getBoundingClientRect()
      return { left: Number(r.left.toFixed(2)), right: Number(r.right.toFixed(2)), top: Number(r.top.toFixed(2)), bottom: Number(r.bottom.toFixed(2)), width: Number(r.width.toFixed(2)), height: Number(r.height.toFixed(2)) }
    }
    const centreX = (element) => {
      const r = element.getBoundingClientRect()
      return Number(((r.left + r.right) / 2).toFixed(2))
    }
    const rows = [...document.querySelectorAll('.psd-run')].map((row) => {
      const cell = row.querySelector('.psd-run-glyph-cell')
      const glyph = cell === null ? null : cell.firstElementChild
      const glyphKind = glyph === null ? null : glyph.classList.contains('psd-run-brand') ? 'brand' : 'dot'
      const svg = glyph === null ? null : glyph.querySelector('svg')
      const pinSlot = row.querySelector('.psd-run-pin-slot')
      const pin = row.querySelector('.psd-run-pin')
      const titleButton = row.querySelector('.psd-run-open')
      const parent = row.parentElement
      const children = parent === null
        ? null
        : (parent.querySelector(':scope > .psd-children') ?? parent.querySelector('.psd-children'))
      let trunkCentre = null
      if (children !== null) {
        const childrenRect = children.getBoundingClientRect()
        const borderLeft = parseFloat(getComputedStyle(children).borderLeftWidth) || 0
        trunkCentre = Number((childrenRect.left + borderLeft / 2).toFixed(2))
      }
      let childGlyph = null
      if (children !== null) {
        const child = [...children.querySelectorAll('.psd-child')].find((element) => element.querySelector('.psd-child-glyph') !== null)
        if (child !== undefined) {
          const glyphElement = child.querySelector('.psd-child-glyph')
          const glyphRect = rectOf(glyphElement)
          childGlyph = {
            centre: centreX(glyphElement),
            width: glyphRect.width,
            height: glyphRect.height,
            isBrand: glyphElement.querySelector('.psd-child-brand') !== null
          }
        }
      }
      return {
        title: (row.querySelector('.psd-run-title')?.innerText || '').trim(),
        state: row.getAttribute('data-state'),
        rowLeft: Number(row.getBoundingClientRect().left.toFixed(2)),
        cell: cell === null ? null : { ...rectOf(cell), centre: centreX(cell) },
        glyphKind,
        glyph: glyph === null
          ? null
          : {
              ...rectOf(glyph),
              centre: centreX(glyph),
              className: String(glyph.className || ''),
              svg: svg === null
                ? null
                : {
                    width: Number(svg.getBoundingClientRect().width.toFixed(2)),
                    height: Number(svg.getBoundingClientRect().height.toFixed(2)),
                    centre: centreX(svg)
                  }
            },
        pinSlot: pinSlot === null
          ? null
          : {
              ...rectOf(pinSlot),
              centre: centreX(pinSlot),
              marginLeft: getComputedStyle(pinSlot).marginLeft,
              marginRight: getComputedStyle(pinSlot).marginRight
            },
        pin: pin === null ? null : { ...rectOf(pin), centre: centreX(pin) },
        titleLeft: titleButton === null ? null : rectOf(titleButton).left,
        gapLeft: cell === null || pinSlot === null ? null : Number((pinSlot.getBoundingClientRect().left - cell.getBoundingClientRect().right).toFixed(2)),
        gapRight: pinSlot === null || titleButton === null ? null : Number((titleButton.getBoundingClientRect().left - pinSlot.getBoundingClientRect().right).toFixed(2)),
        trunkCentre,
        childGlyph
      }
    })
    return { rows }
  },

  /** Background/tint facts for one card row (single-highlight-layer check). */
  pinnedRowFacts: (title) => {
    const row = [...document.querySelectorAll('.psd-run')]
      .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === title)
    if (row === undefined) return null
    const main = row.querySelector('.psd-run-main')
    const factsOf = (element) => {
      if (element === null) return null
      const style = getComputedStyle(element)
      return {
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        filter: style.filter,
        hovered: element.matches(':hover')
      }
    }
    return {
      pinned: row.getAttribute('data-pinned'),
      rowHovered: row.matches(':hover'),
      row: factsOf(row),
      main: factsOf(main)
    }
  },

  /** Two-phase pin-reveal facts for one main row (slot width, title start, columns). */
  revealFacts: (title) => {
    const row = [...document.querySelectorAll('.psd-run')]
      .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === title)
    if (row === undefined) return null
    const rectOf = (element) => {
      if (element === null) return null
      const r = element.getBoundingClientRect()
      return { left: Number(r.left.toFixed(2)), right: Number(r.right.toFixed(2)), width: Number(r.width.toFixed(2)) }
    }
    const rowRect = row.getBoundingClientRect()
    const titleEl = row.querySelector('.psd-run-title')
    const slot = row.querySelector('.psd-run-pin-slot')
    const pin = row.querySelector('.psd-run-pin')
    const time = row.querySelector('.psd-run-time')
    const actions = row.querySelector('.psd-run-actions')
    const toggle = row.querySelector('.psd-run-toggle, .psd-run-toggle-spacer')
    const pinStyle = pin === null ? null : getComputedStyle(pin)
    const slotStyle = slot === null ? null : getComputedStyle(slot)
    const open = row.querySelector('.psd-run-open')
    const firstGlyphWidth = (element) => {
      if (element === null) return null
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node !== null && (node.nodeValue ?? '').trim().length === 0) node = walker.nextNode()
      if (node === null) return null
      const value = node.nodeValue ?? ''
      const index = value.search(/\S/)
      if (index < 0) return null
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      return Number(range.getBoundingClientRect().width.toFixed(2))
    }
    return {
      title,
      rowLeft: Number(rowRect.left.toFixed(2)),
      rowHovered: row.matches(':hover'),
      focusWithin: row.matches(':focus-within'),
      pinned: row.getAttribute('data-pinned'),
      titleLeftRel: titleEl === null ? null : Number((titleEl.getBoundingClientRect().left - rowRect.left).toFixed(2)),
      titleShift: titleEl === null ? null : (Number.parseFloat(getComputedStyle(titleEl).getPropertyValue('--psd-title-shift')) || 0),
      titleMarginLeft: open === null ? null : Number.parseFloat(getComputedStyle(open).marginLeft),
      firstCharWidth: firstGlyphWidth(titleEl),
      slotWidth: slot === null ? null : Number(slot.getBoundingClientRect().width.toFixed(2)),
      slotMarginRight: slotStyle === null ? null : slotStyle.marginRight,
      slotRect: rectOf(slot),
      pinRect: rectOf(pin),
      pinOpacity: pinStyle === null ? null : pinStyle.opacity,
      pinVisibility: pinStyle === null ? null : pinStyle.visibility,
      pinPointerEvents: pinStyle === null ? null : pinStyle.pointerEvents,
      timeLeft: time === null ? null : Number(time.getBoundingClientRect().left.toFixed(2)),
      actionsLeft: actions === null ? null : Number(actions.getBoundingClientRect().left.toFixed(2)),
      toggleLeft: toggle === null ? null : Number(toggle.getBoundingClientRect().left.toFixed(2))
    }
  },

  /**
   * Start an in-page 10 ms sampler for one row's two-phase reveal state (sampling from the
   * page catches the ~160-380 ms phases regardless of CDP round-trip latency).
   */
  startRevealSampler: (title, durationMs) => {
    const row = [...document.querySelectorAll('.psd-run')]
      .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === title)
    if (row === undefined) return false
    const now = () => performance.now()
    const start = now()
    const samples = []
    const collect = () => {
      const rowRect = row.getBoundingClientRect()
      const titleEl = row.querySelector('.psd-run-title')
      const slot = row.querySelector('.psd-run-pin-slot')
      const pin = row.querySelector('.psd-run-pin')
      const time = row.querySelector('.psd-run-time')
      const actions = row.querySelector('.psd-run-actions')
      const toggle = row.querySelector('.psd-run-toggle, .psd-run-toggle-spacer')
      const pinStyle = pin === null ? null : getComputedStyle(pin)
      samples.push({
        t: Math.round(now() - start),
        rowHovered: row.matches(':hover'),
        titleLeftRel: titleEl === null ? null : Number((titleEl.getBoundingClientRect().left - rowRect.left).toFixed(2)),
        slotWidth: slot === null ? null : Number(slot.getBoundingClientRect().width.toFixed(2)),
        pinOpacity: pinStyle === null ? null : Number(Number(pinStyle.opacity).toFixed(3)),
        pinVisibility: pinStyle === null ? null : pinStyle.visibility,
        timeLeft: time === null ? null : Number(time.getBoundingClientRect().left.toFixed(2)),
        actionsLeft: actions === null ? null : Number(actions.getBoundingClientRect().left.toFixed(2)),
        toggleLeft: toggle === null ? null : Number(toggle.getBoundingClientRect().left.toFixed(2))
      })
    }
    collect()
    const interval = window.setInterval(collect, 10)
    const timer = window.setTimeout(() => window.clearInterval(interval), Math.max(300, Number(durationMs) || 1200))
    window.__psdRevealSampler = { interval, timer, samples }
    return true
  },

  /** Stop the reveal sampler and return its samples. */
  stopRevealSampler: () => {
    const sampler = window.__psdRevealSampler
    if (sampler === null || sampler === undefined) return null
    window.clearInterval(sampler.interval)
    window.clearTimeout(sampler.timer)
    window.__psdRevealSampler = null
    return sampler.samples
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
            running: summary.running === true,
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
 * The expected newest-activity-first order of two pinned rows, derived from the card's
 * unpinned ordering captured before the run started (running rows first = newest activity,
 * then the recent window in activity order).
 * @param {object} state - harness state with `pinBaseline.unpinnedOrder`.
 * @param {object} targetA - first run pin.
 * @param {object} targetB - second run pin.
 * @returns {'A_BEFORE_B' | 'B_BEFORE_A' | null} expected relative order, or null when the
 *   baseline order is unavailable.
 */
function expectedPinnedRelativeOrder(state, targetA, targetB) {
  const order = state.pinBaseline?.unpinnedOrder ?? []
  const aIndex = order.indexOf(targetA.title)
  const bIndex = order.indexOf(targetB.title)
  if (aIndex < 0 || bIndex < 0) return null
  return aIndex < bIndex ? 'A_BEFORE_B' : 'B_BEFORE_A'
}

/**
 * Read the Host's true last-activity ledger (`$DSH_HOME/dsh-power-suite/session-activity.json`),
 * the same source the card's pinned ordering uses. Read-only; used as the live
 * newest-activity-first oracle (the observable "Last active" text is relative and cannot
 * break ties between concurrently running Sessions).
 * @returns {Promise<{ ok: boolean, file: string | null, sessions: Record<string, number> }>} ledger data.
 */
async function readHostActivityMap() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : path.join(homedir(), '.dsh')
  const file = path.join(home, 'dsh-power-suite', 'session-activity.json')
  try {
    const raw = await readFile(file, 'utf8')
    const doc = JSON.parse(raw)
    if (doc !== null && typeof doc === 'object' && doc.sessions !== null && typeof doc.sessions === 'object') {
      const sessions = {}
      for (const [id, value] of Object.entries(doc.sessions)) {
        if (typeof value === 'number' && Number.isFinite(value)) sessions[id] = value
      }
      return { ok: true, file, sessions }
    }
  } catch {
    /* missing/corrupt ledger: the caller falls back to the baseline card order */
  }
  return { ok: false, file, sessions: {} }
}

/**
 * Expected newest-activity-first order of the run pins, from the Host activity ledger +
 * session summaries (the same effective time the card sorts by).
 * @param {object} page - Page wrapper.
 * @param {Array<{ id: string, title: string }>} entries - run pins.
 * @returns {Promise<{ order: string[], source: string, detail: string } | null>} expected ids.
 */
async function expectedPinOrder(page, entries) {
  const ids = entries.map((entry) => entry.id).filter((id) => typeof id === 'string')
  if (ids.length === 0) return null
  const summaries = await page.eval(probePin.sessionSummaries).catch(() => null)
  const activity = await readHostActivityMap()
  if (summaries === null || summaries.ok !== true) return null
  const effective = new Map()
  for (const id of ids) {
    const summary = summaries.summaries[id]
    const summaryAt = summary !== null && summary !== undefined && typeof summary.updatedAt === 'number' ? summary.updatedAt : 0
    const hostAt = typeof activity.sessions[id] === 'number' ? activity.sessions[id] : 0
    effective.set(id, Math.max(summaryAt, hostAt))
  }
  const order = [...ids].sort((left, right) => effective.get(right) - effective.get(left))
  return {
    order,
    source: activity.ok ? 'Host activity ledger + session summaries' : 'session summaries only (Host ledger unavailable)',
    detail: order.map((id) => `${id.slice(0, 8)}…=${effective.get(id)}`).join(', ')
  }
}

/**
 * Expected normal-queue order of two unpinned rows: running rows first, then the recent
 * window, each in activity order (the card's own derivation).
 * @param {object} page - Page wrapper.
 * @param {Array<{ id: string }>} entries - rows to order.
 * @returns {Promise<{ order: string[], source: string, detail: string } | null>} expected ids.
 */
async function expectedNormalQueueOrder(page, entries) {
  const ids = entries.map((entry) => entry.id).filter((id) => typeof id === 'string')
  if (ids.length === 0) return null
  const summaries = await page.eval(probePin.sessionSummaries).catch(() => null)
  const activity = await readHostActivityMap()
  if (summaries === null || summaries.ok !== true) return null
  const running = new Map()
  const effective = new Map()
  for (const id of ids) {
    const summary = summaries.summaries[id]
    running.set(id, summary !== null && summary !== undefined && summary.running === true)
    const summaryAt = summary !== null && summary !== undefined && typeof summary.updatedAt === 'number' ? summary.updatedAt : 0
    const hostAt = typeof activity.sessions[id] === 'number' ? activity.sessions[id] : 0
    effective.set(id, Math.max(summaryAt, hostAt))
  }
  const order = [...ids].sort((left, right) => {
    if (running.get(left) !== running.get(right)) return running.get(left) ? -1 : 1
    return effective.get(right) - effective.get(left)
  })
  return {
    order,
    source: activity.ok ? 'Host activity ledger + session summaries' : 'session summaries only (Host ledger unavailable)',
    detail: order.map((id) => `${id.slice(0, 8)}…=${running.get(id) ? 'running' : 'idle'}/${effective.get(id)}`).join(', ')
  }
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

/**
 * Hover one trailing control of a card row with a real CDP pointer (the row itself is
 * hovered first so the actions/chevron reveal), then read the control's computed
 * background/filter.
 * @param {'parent'|'child'} kind - row kind.
 * @param {string} title - exact row title.
 * @param {string} controlSelector - control selector inside the row.
 * @returns {Promise<object>} the hovered control facts.
 */
async function hoverCardControl(page, kind, title, controlSelector) {
  for (let attempt = 0; attempt < PIN_ROW_ATTEMPTS; attempt += 1) {
    try {
      await hoverCardRowByTitle(page, kind, title)
    } catch {
      await sleep(250)
      continue
    }
    await sleep(260)
    const point = await page.eval((rowKind, rowTitle, selector) => {
      const rowSelector = rowKind === 'child' ? '.psd-child' : '.psd-run'
      const titleSelector = rowKind === 'child' ? '.psd-child-title' : '.psd-run-title'
      const row = [...document.querySelectorAll(rowSelector)]
        .find((element) => ((element.querySelector(titleSelector)?.innerText ?? '').trim()) === rowTitle)
      if (row === undefined) return null
      const control = [...row.querySelectorAll(selector)].find((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0
      })
      if (control === undefined) return null
      const rect = control.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    }, kind, title, controlSelector).catch(() => null)
    if (point === null) {
      await sleep(250)
      continue
    }
    await page.moveTo(point.x, point.y)
    await sleep(260)
    const facts = await page.eval((rowKind, rowTitle, selector) => {
      const rowSelector = rowKind === 'child' ? '.psd-child' : '.psd-run'
      const titleSelector = rowKind === 'child' ? '.psd-child-title' : '.psd-run-title'
      const row = [...document.querySelectorAll(rowSelector)]
        .find((element) => ((element.querySelector(titleSelector)?.innerText ?? '').trim()) === rowTitle)
      if (row === undefined) return null
      const controls = [...row.querySelectorAll(selector)].map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          className: String(element.className || ''),
          variant: element.getAttribute('data-variant'),
          label: element.getAttribute('aria-label'),
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0,
          hovered: element.matches(':hover'),
          background: style.backgroundColor,
          filter: style.filter
        }
      })
      return { rowHovered: row.matches(':hover'), controls }
    }, kind, title, controlSelector).catch(() => null)
    if (facts !== null) {
      const hovered = facts.controls.find((control) => control.hovered)
      if (hovered !== undefined) return hovered
    }
  }
  throw new Error(`could not hover control "${short(controlSelector, 40)}" on the card ${kind} row "${short(title, 50)}"`)
}

/**
 * Hover one native action button of a native session/workspace row (the row is hovered
 * first so its actions reveal), then read the button's computed background/filter.
 * @param {string} rowSelector - native row selector.
 * @returns {Promise<object | null>} the hovered button facts, or null when the row has no
 *   visible action button (e.g. a placeholder row).
 */
async function hoverNativeRowControl(page, rowSelector) {
  for (let attempt = 0; attempt < PIN_ROW_ATTEMPTS; attempt += 1) {
    try {
      await hoverSelector(page, rowSelector)
    } catch {
      await sleep(250)
      continue
    }
    await sleep(280)
    const point = await page.eval((selector) => {
      const row = document.querySelector(selector)
      if (row === null) return null
      const button = [...row.querySelectorAll('button, [role="button"]')].find((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
      })
      if (button === undefined) return null
      const rect = button.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    }, rowSelector).catch(() => null)
    if (point === null) return null
    await page.moveTo(point.x, point.y)
    await sleep(260)
    const facts = await page.eval((selector) => {
      const row = document.querySelector(selector)
      if (row === null) return null
      const buttons = [...row.querySelectorAll('button, [role="button"]')].map((element) => {
        const style = getComputedStyle(element)
        return {
          className: String(element.className || ''),
          label: element.getAttribute('aria-label'),
          hovered: element.matches(':hover'),
          background: style.backgroundColor,
          filter: style.filter
        }
      })
      return { rowHovered: row.matches(':hover'), buttons }
    }, rowSelector).catch(() => null)
    if (facts !== null) {
      const hovered = facts.buttons.find((button) => button.hovered)
      if (hovered !== undefined) return hovered
    }
  }
  return null
}

/**
 * Poll one row's two-phase reveal facts until a predicate holds (the reveal animates in
 * two phases: slot expansion ~150 ms, then the button fades in ~120 ms).
 * @param {string} title - exact main-row title.
 * @param {Function} predicate - receives the reveal facts.
 * @param {object} [options] - timeout/interval/label.
 * @returns {Promise<object>} the matching facts.
 */
async function waitRevealPhase(page, title, predicate, { timeout = 2500, interval = 25, label = 'pin reveal phase' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const facts = await page.eval(probePin.revealFacts, title).catch(() => null)
    if (facts !== null) {
      last = facts
      if (predicate(facts)) return facts
    }
    await sleep(interval)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label} on "${short(title, 50)}" (last ${short(JSON.stringify(last), 320)})`)
}

/**
 * Move the pointer away without the settle pause, so a short CSS phase-out can be
 * sampled immediately (the two-phase reveal reverses in ~380 ms).
 * @param {object} page - Page wrapper.
 * @returns {Promise<void>}
 */
async function parkPointerFast(page) {
  await page.moveTo(900, 500)
}

/**
 * Wait until the current card atmosphere row's non-atmosphere content has settled on the
 * requested brightness filter (the 140 ms filter transition can restart on live re-sorts).
 * @param {string} expected - expected computed filter.
 * @param {object} [options] - timeout/label.
 * @returns {Promise<object>} the matching current-row facts.
 */
async function waitCardContentBrightness(page, expected, { timeout = 3000, label = 'card content brightness' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const facts = await page.eval(probePin.currentCardRow).catch(() => null)
    if (facts !== null && Array.isArray(facts.contentFilters) && facts.contentFilters.length > 0) {
      last = facts
      if (facts.contentFilters.every((child) => child.filter === expected)) return facts
    }
    await sleep(60)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label} (${expected}; last ${short(JSON.stringify(last === null ? null : last.contentFilters), 260)})`)
}

/**
 * Wait until one native current atmosphere row's content settles on the requested filter.
 * @param {'session'|'workspace'} target - which native current row.
 * @param {string} expected - expected computed filter.
 * @param {object} [options] - timeout/label.
 * @returns {Promise<object>} the matching native facts.
 */
async function waitNativeContentBrightness(page, target, expected, { timeout = 3000, label = 'native content brightness' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const facts = await page.eval(probePin.nativeCurrentAtmosphereRows).catch(() => null)
    if (facts !== null && facts[target] !== null && Array.isArray(facts[target].contentFilters) && facts[target].contentFilters.length > 0) {
      last = facts
      if (facts[target].contentFilters.every((child) => child.filter === expected)) return facts
    }
    await sleep(60)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label} (${target} ${expected}; last ${short(JSON.stringify(last === null ? null : last[target]), 280)})`)
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
  const height = Math.min(Math.round(clip.height), README_VIEWPORT_HEIGHT - y)
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
        // The card renders the pin only after the Host push lands; give it a moment before
        // concluding the row is not pinned (a skip here used to leave a Host residual).
        let pinnedVisible = await pinnedNow()
        for (let attempt = 0; attempt < 12 && !pinnedVisible; attempt += 1) {
          await sleep(250)
          title = (await titleForRunId(page, entry.id)) ?? title
          pinnedVisible = await pinnedNow()
        }
        if (!pinnedVisible) {
          log(`cleanup: id ${entry.id} ("${short(title, 48)}") is not a pinned card row any more; leaving it to the Host fallback below`)
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
    // Last-resort fallback: if a UI unpin could not be performed (e.g. the card had not
    // rendered the pushed pin yet), publish an unpin for the run ids through the documented
    // route so the user's Host pin document never keeps a test pin. Logged honestly.
    const directUnpin = async (ids) => {
      if (ids.length === 0) return null
      return page.eval(async (targetIds) => {
        try {
          const response = await fetch('/api/power-suite.session-pins', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify({ ops: targetIds.map((id) => ({ op: 'unpin', id })) })
          })
          return { ok: response.ok, status: response.status, doc: await response.json() }
        } catch (error) {
          return { ok: false, status: null, error: String((error && error.message) || error) }
        }
      }, ids)
    }
    let effectiveProbe = await readEffectivePins(page)
    let residualProbe = effectiveProbe === null ? [] : runIds.filter((id) => effectiveProbe.includes(id))
    if (residualProbe.length > 0) {
      const fallback = await directUnpin(residualProbe)
      log(`cleanup: UI unpin left ${short(JSON.stringify(residualProbe), 120)}; direct-route fallback ${short(JSON.stringify(fallback), 200)}`)
      state.pinned = (state.pinned ?? []).filter((item) => !residualProbe.includes(item.id))
      await sleep(400)
    }
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
    unpinnedOrder: baselineRows.rows.filter((row) => row.pinned !== 'true').map((row) => row.title),
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

  await results.check('r3-2', 'pin slot is collapsed at rest (0 px) and expands only on hover/focus; child rows expose none', async () => {
    await resetPointer(page)
    const pin = await readCardPinState(page)
    assert(pin.mainRows > 0, 'the "Running & recent" card has no main rows')
    assertEqual(pin.rows.filter((row) => row.hasSlot).length, pin.mainRows, 'every main row must render the pin slot (collapsed while the control is hidden)')
    assertEqual(pin.rows.filter((row) => row.hasPinButton).length, pin.mainRows, 'every main row must render the pin button')
    for (const row of pin.rows) {
      assertEqual(row.orderHeadSlotTitle, true, `row "${short(row.title, 40)}" must order the glyph, the pin slot, then the title`)
      const titleLeftRel = row.titleLeft === null || row.rowRect === null ? null : Number((row.titleLeft - row.rowRect.left).toFixed(2))
      if (row.pinned === 'true') {
        // A pinned row keeps the revealed space permanently.
        assertNear(row.slotWidth, 16, 0.75, `pinned row "${short(row.title, 30)}" must keep the 16 px slot at rest (got ${row.slotWidth})`)
        assertNear(titleLeftRel, 71, 0.75, `pinned row "${short(row.title, 30)}" title must start at 71 px at rest (got ${titleLeftRel})`)
        assertNear(row.titleMarginLeft, 0, 0.25, `pinned row "${short(row.title, 30)}" must force the title shift to 0 (margin-left ${row.titleMarginLeft})`)
        assertEqual(row.ariaPressed, 'true', `pinned row "${short(row.title, 30)}" must expose aria-pressed=true`)
        assertEqual(row.opacity, '1', `pinned row "${short(row.title, 30)}" must keep its filled marker visible without hover (opacity ${row.opacity})`)
        assertEqual(row.visibility, 'visible', `pinned row "${short(row.title, 30)}" marker must stay visibility:visible without hover (${row.visibility})`)
        assertEqual(row.pointerEvents, 'none', `pinned+not-hovered row "${short(row.title, 30)}" marker must be pointer-events:none (${row.pointerEvents})`)
      } else {
        // Unpinned rest: the slot is collapsed and the default-state title is shifted by
        // the measured half-advance of its first glyph so that the first character is
        // centred on the child status-dot column (54 px from the row's left edge).
        assertNear(row.slotWidth, 0, 0.25, `unpinned row "${short(row.title, 30)}" pin slot must be collapsed at rest (got ${row.slotWidth})`)
        assert(titleLeftRel > 48 && titleLeftRel < 53, `unpinned row "${short(row.title, 30)}" rest title must sit between 48 and 53 px (got ${titleLeftRel})`)
        assert(row.firstCharWidth !== null && row.firstCharWidth > 0, `unpinned row "${short(row.title, 30)}" first-glyph width could not be measured`)
        assertNear(titleLeftRel + row.firstCharWidth / 2, 56, 0.7,
          `unpinned row "${short(row.title, 30)}" first character centre must align with the requested right-biased column 56 (titleLeft ${titleLeftRel} + firstCharWidth/2 ${(row.firstCharWidth / 2).toFixed(2)})`)
        assertNear(row.titleShift, 10 - row.firstCharWidth / 2, 0.75,
          `unpinned row "${short(row.title, 30)}" shift must be 10 − firstGlyph/2 (shift ${row.titleShift}, firstGlyph ${row.firstCharWidth})`)
        assertNear(titleLeftRel, 46 + row.titleShift, 0.75,
          `unpinned row "${short(row.title, 30)}" rest title must be 46 + the measured shift (got ${titleLeftRel}, shift ${row.titleShift})`)
        assert(row.titleShift > 1.5 && row.titleShift < 6, `unpinned row "${short(row.title, 30)}" biased shift must stay in the ~2–5 px family (got ${row.titleShift})`)
        assertNear(row.titleMarginLeft, row.titleShift, 0.75,
          `unpinned row "${short(row.title, 30)}" rest margin-left must equal the shift (got ${row.titleMarginLeft})`)
        assertEqual(row.opacity, '0', `unpinned+not-hovered row "${short(row.title, 30)}" pin must be hidden (opacity ${row.opacity})`)
        assertEqual(row.visibility, 'hidden', `unpinned+not-hovered row "${short(row.title, 30)}" pin must be visibility:hidden (${row.visibility})`)
        assertEqual(row.pointerEvents, 'none', `unpinned+not-hovered row "${short(row.title, 30)}" pin must be pointer-events:none (${row.pointerEvents})`)
        assertEqual(row.ariaPressed, 'false', `unpinned row "${short(row.title, 30)}" pin must expose aria-pressed=false`)
      }
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
        assertNear(row.gapHeadToSlot, 9, 1,
          `clipped-title row "${short(row.title, 40)}" must keep the 9 px head gap before the collapsed slot (head.right ${row.headRect.right}, slot.left ${row.slotRect.left}, gap ${row.gapHeadToSlot})`)
      }
      const sample = squeezedCandidates[0]
      glyphGuard = `${squeezedCandidates.length} clipped-title row(s): glyph cell ${sample.headRect.width} px = glyph ${sample.headFirstChildWidth} px, head-to-slot gap ${sample.gapHeadToSlot} px`
    }
    state.pinStructure = { mainRows: pin.mainRows, childRows: pin.childRows }
    const collapsed = pin.rows.filter((row) => row.pinned !== 'true').length
    return `${pin.mainRows} main rows (${collapsed} unpinned: slot 0 px, right-biased first-character-centred rest title 46 + shift px, centre 56; pinned rows keep 16/71); ${pin.childRows} subagent child rows with no pin DOM; ${glyphGuard}`
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

  await results.check('r3-3', 'two-phase slowed pin reveal: layout first, button fade second; leave reverses; trailing columns never move', async () => {
    await resetPointer(page)
    const selection = await choosePinTargets(page)
    assert(selection.ordered.length > 0,
      'no unpinned, non-current card row is available to exercise the pin reveal (the card has no ordinary row)')
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
    // Rest: collapsed slot, title next to the leading glyph.
    const rest = await page.eval(probePin.revealFacts, target.title)
    assert(rest !== null, 'the reveal target row disappeared')
    assertEqual(rest.pinned, null, 'the reveal target must start unpinned')
    assertNear(rest.slotWidth, 0, 0.25, `rest slot width must be 0 (got ${rest.slotWidth})`)
    assert(rest.titleLeftRel > 48 && rest.titleLeftRel < 53, `rest title must sit between 48 and 53 px (got ${rest.titleLeftRel})`)
    assert(rest.firstCharWidth !== null && rest.firstCharWidth > 0, 'rest first-glyph width could not be measured')
    assertNear(rest.titleLeftRel + rest.firstCharWidth / 2, 56, 0.7,
      `rest first character centre must align with the requested right-biased column 56 (titleLeft ${rest.titleLeftRel} + ${(rest.firstCharWidth / 2).toFixed(2)})`)
    assertNear(rest.titleShift, 10 - rest.firstCharWidth / 2, 0.75,
      `rest shift must be 10 − firstGlyph/2 (shift ${rest.titleShift}, firstGlyph ${rest.firstCharWidth})`)
    const restTitle = rest.titleLeftRel
    assertEqual(rest.pinOpacity, '0', `rest pin must be hidden (opacity ${rest.pinOpacity})`)
    assertEqual(rest.pinVisibility, 'hidden', `rest pin must be visibility:hidden (${rest.pinVisibility})`)
    const restColumns = { timeLeft: rest.timeLeft, actionsLeft: rest.actionsLeft, toggleLeft: rest.toggleLeft }
    const assertColumnsFixed = (samples, label) => {
      for (const sample of samples) {
        assertNear(sample.timeLeft, restColumns.timeLeft, 0.5, `${label}: the time column must never move (${sample.timeLeft} vs ${restColumns.timeLeft})`)
        assertNear(sample.actionsLeft, restColumns.actionsLeft, 0.5, `${label}: the New session column must never move (${sample.actionsLeft} vs ${restColumns.actionsLeft})`)
        assertNear(sample.toggleLeft, restColumns.toggleLeft, 0.5, `${label}: the disclosure column must never move (${sample.toggleLeft} vs ${restColumns.toggleLeft})`)
      }
    }
    // Hover: sample every ~10 ms in the page so both phases are captured deterministically.
    assertEqual(await page.eval(probePin.startRevealSampler, target.title, 1000), true, 'could not start the hover reveal sampler')
    await hoverMainRowByTitle(page, target.title)
    await sleep(850)
    const hoverSamples = await page.eval(probePin.stopRevealSampler)
    assert(Array.isArray(hoverSamples) && hoverSamples.length > 5, 'the hover reveal sampler returned no samples')
    const hoverStart = hoverSamples.findIndex((sample) => sample.rowHovered === true)
    assert(hoverStart >= 0, 'the row never became hovered during the reveal sampling')
    const hoverWindow = hoverSamples.slice(hoverStart)
    // Phase 1 (~220 ms): the slot expands and the title slides right while the pin is hidden.
    const phase1 = hoverWindow.find((sample) => sample.slotWidth > 0.5 && sample.slotWidth < 15.5
      && sample.titleLeftRel > restTitle && sample.titleLeftRel < 71)
    assert(phase1 !== undefined,
      `the hover samples must include the slot-expansion phase (${short(JSON.stringify(hoverWindow.slice(0, 10)), 360)})`)
    assert(phase1.pinOpacity === 0 || phase1.pinVisibility === 'hidden',
      `during the slot-expansion phase the pin must still be hidden (opacity ${phase1.pinOpacity}, visibility ${phase1.pinVisibility})`)
    // Mid reveal (~250 ms after hover): slot fully expanded, button starting/leaving its fade.
    const mid = hoverWindow.find((sample) => sample.t >= phase1.t + 200)
    assert(mid !== undefined, 'no mid-reveal sample was captured')
    assertNear(mid.slotWidth, 16, 0.25, `mid-reveal slot width must be 16 px (got ${mid.slotWidth})`)
    assertNear(mid.titleLeftRel, 71, 0.75, `mid-reveal title must be at 71 px (got ${mid.titleLeftRel})`)
    assert(mid.pinOpacity >= 0 && mid.pinOpacity <= 1, `mid-reveal pin opacity must be a valid fade step (got ${mid.pinOpacity})`)
    const midNote = mid.pinOpacity < 1 ? `mid-reveal pin fading in (${mid.pinOpacity})` : 'mid-reveal pin already fully visible'
    // Settled hover (>~380 ms): expanded slot, title 71, button fully in and interactive.
    const settledSample = hoverWindow[hoverWindow.length - 1]
    assertNear(settledSample.slotWidth, 16, 0.25, `settled slot width must be 16 px (got ${settledSample.slotWidth})`)
    assertNear(settledSample.titleLeftRel, 71, 0.75, `settled title must start at 71 px (got ${settledSample.titleLeftRel})`)
    // 0.99 tolerance: a live re-sort can re-start the 160 ms fade one last time under the
    // stationary pointer; the exact 1 is then asserted on the settled live read below.
    assert(Number(settledSample.pinOpacity) >= 0.99, `settled pin opacity must be ~1 (got ${settledSample.pinOpacity})`)
    assertEqual(settledSample.pinVisibility, 'visible', 'settled pin must be visible')
    assertColumnsFixed(hoverWindow, 'hover reveal')
    const settled = await waitRevealPhase(page, target.title,
      (facts) => facts.rowHovered && facts.slotWidth === 16 && facts.pinOpacity === '1' && facts.pinVisibility === 'visible',
      { timeout: 2000, label: 'settled expanded reveal' })
    assertEqual(settled.pinPointerEvents, 'auto', 'the settled pin must be interactive on hover')
    assertNear(settled.titleLeftRel, 71, 0.75, `settled title must start at 71 px (got ${settled.titleLeftRel})`)
    assertEqual(settled.slotMarginRight, '9px', `settled slot must keep the 9 px trailing gap (got ${settled.slotMarginRight})`)
    // Leave: the button fades out first with the slot still expanded, then the slot collapses.
    assertEqual(await page.eval(probePin.startRevealSampler, target.title, 1000), true, 'could not start the leave reveal sampler')
    await parkPointerFast(page)
    await sleep(850)
    const leaveSamples = await page.eval(probePin.stopRevealSampler)
    assert(Array.isArray(leaveSamples) && leaveSamples.length > 5, 'the leave reveal sampler returned no samples')
    const leaveStart = leaveSamples.findIndex((sample) => sample.rowHovered === false)
    assert(leaveStart >= 0, 'the pointer never left the row during the leave sampling')
    const leaveWindow = leaveSamples.slice(leaveStart)
    const fade = leaveWindow.find((sample) => sample.slotWidth === 16 && sample.pinOpacity > 0 && sample.pinOpacity < 1)
    assert(fade !== undefined,
      `the leave samples must include the button fade-out while the slot is still expanded (${short(JSON.stringify(leaveWindow.slice(0, 12)), 380)})`)
    assertNear(fade.titleLeftRel, 71, 0.75, `during the fade-out the title must stay at 71 px (got ${fade.titleLeftRel})`)
    const collapsedSample = leaveWindow[leaveWindow.length - 1]
    assertNear(collapsedSample.slotWidth, 0, 0.25, `collapsed slot width must be 0 (got ${collapsedSample.slotWidth})`)
    assertNear(collapsedSample.titleLeftRel, restTitle, 0.75,
      `collapsed title must return to its first-character-centred rest position (${collapsedSample.titleLeftRel} vs ${restTitle})`)
    const collapsedFirstChar = typeof collapsedSample.firstCharWidth === 'number' && collapsedSample.firstCharWidth > 0
      ? collapsedSample.firstCharWidth
      : rest.firstCharWidth
    assertNear(collapsedSample.titleLeftRel + collapsedFirstChar / 2, 56, 0.7,
      'the collapsed rest first-character centre must stay on the requested right-biased column 56')
    assertEqual(collapsedSample.pinVisibility, 'hidden', 'collapsed pin must be hidden')
    assertColumnsFixed(leaveWindow, 'leave reveal')
    // Reduced motion: both phases are instant (no partial frames).
    await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    try {
      await sleep(150)
      await hoverMainRowByTitle(page, target.title)
      const reducedHover = await waitRevealPhase(page, target.title,
        (facts) => facts.rowHovered && facts.slotWidth === 16 && facts.pinOpacity === '1',
        { timeout: 700, interval: 20, label: 'instant expanded reveal under reduced motion' })
      assertNear(reducedHover.titleLeftRel, 71, 0.75, 'reduced motion must settle the title at 71 px immediately')
      await parkPointerFast(page)
      const reducedRest = await waitRevealPhase(page, target.title,
        (facts) => !facts.rowHovered && facts.slotWidth === 0 && facts.pinVisibility === 'hidden',
        { timeout: 700, interval: 20, label: 'instant collapse under reduced motion' })
      assertNear(reducedRest.titleLeftRel, restTitle, 0.75, 'reduced motion must collapse the title back to its rest position immediately')
    } finally {
      await page.emulateMedia([])
      await sleep(250)
      await resetPointer(page)
    }
    return `rest slot 0/title ${restTitle} (right-biased first-char centre 56, shift ${rest.titleShift} px)/pin hidden; hover phase 1 slot ${phase1.slotWidth} px/title ${phase1.titleLeftRel} px/pin hidden (slide ${(71 - restTitle).toFixed(2)} px); ${midNote}; settled slot 16/title 71/pin interactive; leave fade at ${fade.pinOpacity} with slot 16/title 71 then collapsed to 0/${restTitle}; trailing columns ${restColumns.timeLeft}/${restColumns.actionsLeft}/${restColumns.toggleLeft} unchanged; reduced motion instant`
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
    assertNear(calm.row.slotWidth, 16, 0.75,
      `a pinned row must keep the expanded 16 px slot while the pointer is away (got ${calm.row.slotWidth})`)
    assertNear(calm.row.titleLeft - calm.row.rowRect.left, 71, 0.75,
      `a pinned row's title must stay at 71 px while the pointer is away (got ${calm.row.titleLeft - calm.row.rowRect.left})`)
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
    assert(aPinnedIndex >= 0 && bPinnedIndex >= 0, 'a run pin is missing from the pinned prefix')
    const expectedOrder = await expectedPinOrder(page, [
      { id: targetA.id, title: targetA.title },
      { id: resolved.id, title: second.title }
    ])
    assert(expectedOrder !== null, 'cannot derive the expected pinned order (session summaries unavailable)')
    if (expectedOrder.order[0] === targetA.id) {
      assert(aPinnedIndex < bPinnedIndex,
        `pinned rows must keep newest-activity-first order ("${short(targetA.title, 30)}" before "${short(second.title, 30)}"; observed ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 220)}; ${expectedOrder.source}: ${expectedOrder.detail})`)
    } else {
      assert(bPinnedIndex < aPinnedIndex,
        `pinned rows must keep newest-activity-first order ("${short(second.title, 30)}" before "${short(targetA.title, 30)}"; observed ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 220)}; ${expectedOrder.source}: ${expectedOrder.detail})`)
    }
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
    assert(aPinnedIndex >= 0 && bPinnedIndex >= 0, 'a pinned row lost its Host pin across the reload')
    const expectedReloadOrder = await expectedPinOrder(page, [state.pinTargetA, state.pinTargetB])
    assert(expectedReloadOrder !== null, 'cannot derive the expected restored pinned order (session summaries unavailable)')
    if (expectedReloadOrder.order[0] === state.pinTargetA.id) {
      assert(aPinnedIndex < bPinnedIndex,
        `the restored pinned order must keep newest activity first (pinned ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 220)}; ${expectedReloadOrder.source}: ${expectedReloadOrder.detail})`)
    } else {
      assert(bPinnedIndex < aPinnedIndex,
        `the restored pinned order must keep newest activity first (pinned ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 220)}; ${expectedReloadOrder.source}: ${expectedReloadOrder.detail})`)
    }
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
        const secondAIndex = pinnedRows.findIndex((row) => row.title === state.pinTargetA.title)
        const secondBIndex = pinnedRows.findIndex((row) => row.title === state.pinTargetB.title)
        assert(secondAIndex >= 0 && secondBIndex >= 0, 'the second profile is missing a run pin from its pinned prefix')
        const secondExpected = await expectedPinOrder(secondPage, [state.pinTargetA, state.pinTargetB])
        assert(secondExpected !== null, 'cannot derive the expected cross-device pinned order (session summaries unavailable in the second profile)')
        if (secondExpected.order[0] === state.pinTargetA.id) {
          assert(secondAIndex < secondBIndex,
            `the second profile must show the same newest-activity-first pinned prefix (pinned ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 240)}; ${secondExpected.source}: ${secondExpected.detail})`)
        } else {
          assert(secondBIndex < secondAIndex,
            `the second profile must show the same newest-activity-first pinned prefix (pinned ${short(JSON.stringify(pinnedRows.map((row) => row.title)), 240)}; ${secondExpected.source}: ${secondExpected.detail})`)
        }
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
    assertNear(calmA.row.slotWidth, 0, 0.25, `an unpinned row must collapse its slot back to 0 px when the pointer is away (got ${calmA.row.slotWidth})`)
    assert(calmA.row.titleLeftRel > 48 && calmA.row.titleLeftRel < 53,
      `an unpinned row's title must return to its right-biased first-character-centred rest position (got ${calmA.row.titleLeftRel})`)
    assertNear(calmA.row.titleLeftRel + calmA.row.firstCharWidth / 2, 56, 0.7,
      `an unpinned row's first character must return to the requested right-biased column 56 (titleLeft ${calmA.row.titleLeftRel} + ${(calmA.row.firstCharWidth / 2).toFixed(2)})`)
    assertEqual(calmA.row.rowBackground, targetA.rowBackgroundBefore ?? state.pinBaseline.rowBackgrounds[targetA.title],
      `the violet row tint must be gone after unpinning (row background ${calmA.row.rowBackground})`)
    const firstUnpinned = (await readCardPinState(page)).rows.findIndex((row) => row.pinned !== 'true')
    assert(firstUnpinned >= 0, 'no unpinned row remains after the first unpin')
    const firstUnpinnedTitle = (await readCardPinState(page)).rows[firstUnpinned].title
    // The unpin removes the pin/tint immediately (asserted above) and the row is back in
    // the normal queue. Its exact head position there is pre-existing live-activity
    // ordering: the running Session itself and the Host activity poll (up to 30 s stale)
    // can legitimately re-sort it, so record the head position instead of hard-failing.
    const queueHeadNote = firstUnpinnedTitle === targetA.title
      ? 'head of the normal queue'
      : `back in the normal queue behind newest live activity "${short(firstUnpinnedTitle, 30)}"`
    debugLog(`r3-9 requeue: "${short(targetA.title, 40)}" -> ${queueHeadNote}`)
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

    // The rows must both be back in the normal queue; their relative order there is the
    // card's ordinary activity ordering, which can legitimately change while the run is
    // in progress (the client's Host-activity poll is up to 30 s stale and the running
    // Session keeps updating). The immediate requeue is asserted above via the head row;
    // here we record the observed vs live-oracle order instead of hard-failing on a
    // transient live-activity race (pin ordering itself is asserted in r3-6/r3-7/r3-8).
    const expectedQueueOrder = await expectedNormalQueueOrder(page, [
      { id: targetA.id, title: targetA.title },
      { id: targetB.id, title: targetB.title }
    ])
    let queueNote = `normal-queue order A@${indexA}/B@${indexB}`
    if (expectedQueueOrder !== null) {
      const expectedFirst = expectedQueueOrder.order[0] === targetA.id ? 'A' : 'B'
      const observedFirst = indexA < indexB ? 'A' : 'B'
      queueNote += ` (live activity oracle: first ${expectedFirst} — ${expectedQueueOrder.source}: ${expectedQueueOrder.detail}; ${expectedFirst === observedFirst ? 'matches' : 'diverged: the client activity poll may be up to 30 s stale'})`
    } else {
      queueNote += ' (activity oracle unavailable)'
    }
    debugLog(`r3-9 ${queueNote}`)
    for (const row of normalRows) {
      assertNear(row.slotWidth, 0, 0.25, `unpinned row "${short(row.title, 30)}" must keep the collapsed 0 px slot (got ${row.slotWidth})`)
      assert(row.titleLeftRel > 48 && row.titleLeftRel < 53,
        `unpinned row "${short(row.title, 30)}" title must sit in its right-biased first-character-centred rest range (got ${row.titleLeftRel})`)
      assertNear(row.titleLeftRel + row.firstCharWidth / 2, 56, 0.7,
        `unpinned row "${short(row.title, 30)}" first-character centre must stay on the requested right-biased column 56 (titleLeft ${row.titleLeftRel})`)
    }
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
    return `unpinned both: effective pins []; card back to ${state.pinBaseline.pinnedRows} pinned row(s); first normal-queue row "${short(targetA.title, 36)}"; ${queueNote}; ${hostNote}; cache ${short(cacheRaw, 200)}`
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
    current = await waitCardContentBrightness(page, 'brightness(1.15)', { label: 'resting atmosphere brightness' })
    assert(current !== null && current.kind === 'parent',
      `the current-Session card row is not a parent atmosphere row (${short(JSON.stringify(current), 220)})`)
    assertEqual(current.hovered, false, 'the current card row must not be hovered for the resting brightness assertion')
    const currentTitle = current.title
    // The current rainbow row follows the same row-menu rule as every top-level row:
    // at rest the time is visible and the "…" trigger hidden; hover swaps them.
    const currentMenu = await page.eval(() => {
      const row = document.querySelector('.psd-run-current')
      if (row === null) return null
      const styleOf = (node) => (node === null ? null : getComputedStyle(node))
      const time = row.querySelector('.psd-run-time')
      const more = row.querySelector('.psd-run-more')
      return {
        timeOpacity: time === null ? null : styleOf(time).opacity,
        morePresent: more !== null,
        moreOpacity: more === null ? null : styleOf(more).opacity,
        moreVisibility: more === null ? null : styleOf(more).visibility,
      }
    })
    assert(currentMenu !== null, 'the current atmosphere row disappeared before the row-menu check')
    assert(currentMenu.morePresent, 'the current rainbow row must render the "…" trigger')
    assertEqual(currentMenu.timeOpacity, '1', `the current rainbow row must keep its time at rest (opacity ${currentMenu.timeOpacity})`)
    assertEqual(currentMenu.moreOpacity, '0', `the current rainbow row's trigger must be hidden at rest (opacity ${currentMenu.moreOpacity})`)
    assertEqual(currentMenu.moreVisibility, 'visible', `the current rainbow row's trigger must stay focusable; only its opacity hides it (${currentMenu.moreVisibility})`)
    // Fix #3: the affordance is a content brightness lift, not a background.
    assertContentBrightness(current, 'brightness(1.15)', 'current card row at rest', { expectTransition: true })
    await hoverCardRowByTitle(page, 'parent', currentTitle)
    // The two-phase reveal settles at ~380 ms; wait for the button to be fully in.
    await waitRevealPhase(page, currentTitle,
      (facts) => facts.rowHovered && facts.pinOpacity === '1' && facts.pinVisibility === 'visible',
      { timeout: 4000, label: 'pin settled on the atmosphere row' })
    await waitCardContentBrightness(page, 'brightness(1.5)', { label: 'hovered atmosphere brightness' })
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
    const currentMenuHover = await page.eval(() => {
      const row = document.querySelector('.psd-run-current')
      if (row === null) return null
      const styleOf = (node) => (node === null ? null : getComputedStyle(node))
      const time = row.querySelector('.psd-run-time')
      const more = row.querySelector('.psd-run-more')
      return {
        timeOpacity: time === null ? null : styleOf(time).opacity,
        moreOpacity: more === null ? null : styleOf(more).opacity,
        moreVisibility: more === null ? null : styleOf(more).visibility,
      }
    })
    assert(currentMenuHover !== null, 'the current rainbow row disappeared during the hover row-menu check')
    assertEqual(currentMenuHover.timeOpacity, '0', `the highlighted current row must hide its time (opacity ${currentMenuHover.timeOpacity})`)
    assertEqual(currentMenuHover.moreOpacity, '1', `the "…" trigger must show on the highlighted current row (opacity ${currentMenuHover.moreOpacity})`)
    assertEqual(currentMenuHover.moreVisibility, 'visible', `the "…" trigger must be visible on the highlighted current row (${currentMenuHover.moreVisibility})`)
    // Fix #4: trailing controls on an atmosphere row keep a transparent background and
    // brighten their icon (extra brightness(1.2)) instead of painting the hover block.
    const controlChecks = []
    for (const selector of ['.psd-row-action', '.psd-run-toggle', '.psd-run-pin', '.psd-run-more']) {
      let control = null
      try {
        control = await hoverCardControl(page, 'parent', currentTitle, selector)
      } catch (error) {
        if (selector === '.psd-run-toggle') {
          // A childless row has no interactive disclosure (only its reserved spacer).
          const spacerOnly = await page.eval((rowTitle) => {
            const row = [...document.querySelectorAll('.psd-run')]
              .find((element) => ((element.querySelector('.psd-run-title')?.innerText ?? '').trim()) === rowTitle)
            return row !== undefined && row.querySelector('.psd-run-toggle') === null && row.querySelector('.psd-run-toggle-spacer') !== null
          }, currentTitle).catch(() => false)
          if (spacerOnly) {
            controlChecks.push('.psd-run-toggle=spacer-only (childless row: no disclosure control)')
            continue
          }
        }
        throw error
      }
      assertEqual(control.background, 'rgba(0, 0, 0, 0)',
        `atmosphere-row control "${selector}" must keep a transparent background on hover (got ${control.background})`)
      assertEqual(control.filter, 'brightness(1.2)',
        `atmosphere-row control "${selector}" must brighten its icon on hover (filter ${control.filter})`)
      controlChecks.push(`${selector}${control.variant === null ? '' : `[${control.variant}]`}=transparent+brightness(1.2)`)
    }
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
    assertEqual(pinnedHovered.rowBackground, 'rgba(0, 0, 0, 0)',
      `a pinned+hovered current row must keep its transparent surface under the rainbow (row background ${pinnedHovered.rowBackground})`)
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
    assert(ordinaryHovered.rowBackground !== 'rgba(0, 0, 0, 0)',
      `an ordinary card row must keep its full-row hover surface (row background ${ordinaryHovered.rowBackground})`)
    assertEqual(ordinaryHovered.mainBackground, 'rgba(0, 0, 0, 0)',
      `the ordinary row body must stay transparent (no nested pill, main background ${ordinaryHovered.mainBackground})`)
    assertContentBrightness(ordinaryHovered, 'none', 'hovered ordinary card row')
    const ordinaryControl = await hoverCardControl(page, 'parent', ordinary.title, '.psd-row-action')
    assert(ordinaryControl.background !== 'rgba(0, 0, 0, 0)',
      `an ordinary-row control must keep its normal hover block (background ${ordinaryControl.background})`)
    assertEqual(ordinaryControl.filter, 'none',
      `an ordinary-row control must not carry the atmosphere brightness filter (filter ${ordinaryControl.filter})`)
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
    const childCurrent = await waitCardContentBrightness(page, 'brightness(1.15)', { label: 'resting child atmosphere brightness' })
    assert(childCurrent !== null && childCurrent.kind === 'child',
      `the current child atmosphere row is missing (${short(JSON.stringify(childCurrent), 220)})`)
    assertEqual(childCurrent.hovered, false, 'the current child row must not be hovered for the resting brightness assertion')
    assertContentBrightness(childCurrent, 'brightness(1.15)', 'current child row at rest', { expectTransition: true })
    await hoverCardRowByTitle(page, 'child', childCurrent.title)
    await sleep(350)
    await waitCardContentBrightness(page, 'brightness(1.5)', { label: 'hovered child atmosphere brightness' })
    const childHovered = await page.eval(probePin.currentCardRow)
    assertEqual(childHovered.atmos.present, true, 'the current child row must keep its rainbow atmosphere')
    assertEqual(childHovered.mainBackground, 'rgba(0, 0, 0, 0)',
      `the current child body must not stack the ordinary hover pill inside the rainbow (background ${childHovered.mainBackground})`)
    assertEqual(childHovered.rowBackground, 'rgba(0, 0, 0, 0)',
      `the current child row must keep its transparent surface under the rainbow (row background ${childHovered.rowBackground})`)
    assertContentBrightness(childHovered, 'brightness(1.5)', 'hovered current child row', { expectTransition: true })
    let continueNote = 'no interrupted child Continue control was reachable'
    const childControls = await page.eval(probePin.cardRowControls, 'child', childCurrent.title).catch(() => null)
    if (childControls !== null && childControls.controls.some((control) => control.className.includes('psd-row-continue'))) {
      const control = await hoverCardControl(page, 'child', childCurrent.title, '.psd-row-continue')
      assertEqual(control.background, 'rgba(0, 0, 0, 0)',
        `the child Continue overlay on an atmosphere row must keep a transparent background on hover (got ${control.background})`)
      assertEqual(control.filter, 'brightness(1.2)',
        `the child Continue overlay on an atmosphere row must brighten its icon on hover (filter ${control.filter})`)
      continueNote = `child Continue ${control.background} + ${control.filter}`
    }
    return `parent "${short(currentTitle, 30)}": atmosphere + transparent body on hover, "…" trigger hidden at rest / shown on highlight (hover-free), pin revealed/works, pinned tint suppressed; controls ${controlChecks.join(', ')}; ordinary "${short(ordinary.title, 26)}" hover ${ordinaryHovered.mainBackground} (control ${ordinaryControl.background}/${ordinaryControl.filter}); child "${short(childCurrent.title, 26)}" body transparent with atmosphere; ${continueNote}`
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
    await waitNativeContentBrightness(page, 'session', 'brightness(1.15)', { label: 'resting native Session brightness' })
    await waitNativeContentBrightness(page, 'workspace', 'brightness(1.15)', { label: 'resting native Workspace brightness' })
    const initialFacts = await page.eval(probePin.nativeCurrentAtmosphereRows)
    assert(initialFacts.session !== null && initialFacts.workspace !== null,
      `the native current Session/Workspace rows are not both rendered before the brightness checks (${short(JSON.stringify(initialFacts), 240)})`)
    assertContentBrightness(initialFacts.session, 'brightness(1.15)', 'native current Session at rest', { expectTransition: true })
    assertContentBrightness(initialFacts.workspace, 'brightness(1.15)', 'native current Workspace at rest', { expectTransition: true })
    await hoverSelector(page, `[data-row-key="session:${initial.sessionId}"]`)
    await sleep(350)
    await waitNativeContentBrightness(page, 'session', 'brightness(1.5)', { label: 'hovered native Session brightness' })
    let facts = await page.eval(probePin.nativeCurrentAtmosphereRows)
    assert(facts.session !== null, 'the native current Session row disappeared while hovering')
    assertEqual(facts.session.hovered, true, 'the native current Session row was not hovered')
    assertEqual(facts.session.background, 'rgba(0, 0, 0, 0)',
      `the native current Session row must not stack its own hover background into the rainbow (background ${facts.session.background})`)
    assertEqual(facts.session.atmosPresent, true, 'the native current Session row must carry the atmosphere wrapper')
    assertEqual(facts.session.atmosCanvas, true, 'the native current Session row atmosphere must keep its canvas')
    assertContentBrightness(facts.session, 'brightness(1.5)', 'hovered native current Session', { expectTransition: true })
    const sessionControl = await hoverNativeRowControl(page, `[data-row-key="session:${initial.sessionId}"]`)
    if (sessionControl !== null) {
      assertEqual(sessionControl.background, 'rgba(0, 0, 0, 0)',
        `a native current-Session action button must keep a transparent background on hover (got ${sessionControl.background})`)
      assertEqual(sessionControl.filter, 'brightness(1.2)',
        `a native current-Session action button must brighten its icon on hover (filter ${sessionControl.filter})`)
    }
    const workspacePresent = await page.eval(() => document.querySelector('[data-psd-current-workspace="true"]') !== null)
    assertEqual(workspacePresent, true, 'no native current Workspace row marker is rendered')
    assertContentBrightness(facts.workspace, 'brightness(1.15)', 'native current Workspace at rest (Session hover must not affect it)', { expectTransition: true })
    await hoverSelector(page, '[data-psd-current-workspace="true"]')
    await sleep(350)
    await waitNativeContentBrightness(page, 'workspace', 'brightness(1.5)', { label: 'hovered native Workspace brightness' })
    facts = await page.eval(probePin.nativeCurrentAtmosphereRows)
    assert(facts.workspace !== null, 'the native current Workspace row disappeared while hovering')
    assertEqual(facts.workspace.hovered, true, 'the native current Workspace row was not hovered')
    assertEqual(facts.workspace.background, 'rgba(0, 0, 0, 0)',
      `the native current Workspace row must not stack its own hover background into the rainbow (background ${facts.workspace.background})`)
    assertEqual(facts.workspace.atmosPresent, true, 'the native current Workspace row must carry the atmosphere wrapper')
    assertEqual(facts.workspace.atmosCanvas, true, 'the native current Workspace row atmosphere must keep its canvas')
    assertContentBrightness(facts.workspace, 'brightness(1.5)', 'hovered native current Workspace', { expectTransition: true })
    const workspaceControl = await hoverNativeRowControl(page, '[data-psd-current-workspace="true"]')
    if (workspaceControl !== null) {
      assertEqual(workspaceControl.background, 'rgba(0, 0, 0, 0)',
        `a native current-Workspace action button must keep a transparent background on hover (got ${workspaceControl.background})`)
      assertEqual(workspaceControl.filter, 'brightness(1.2)',
        `a native current-Workspace action button must brighten its icon on hover (filter ${workspaceControl.filter})`)
    }
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
        const ordinaryControl = await hoverNativeRowControl(page, ordinarySelector)
        if (ordinaryControl !== null) {
          assertEqual(ordinaryControl.filter, 'none',
            `an ordinary native action button must not carry the atmosphere brightness filter (filter ${ordinaryControl.filter})`)
          ordinaryNote = `ordinary native row hover ${ordinary.background}, content filter none, control bg ${ordinaryControl.background}/filter ${ordinaryControl.filter}`
        } else {
          ordinaryNote = `ordinary native row hover ${ordinary.background}, content filter none`
        }
      }
    }
    return `native current Session transparent + atmosphere + content brightness 1.15->1.5 on hover${sessionControl === null ? '' : ` + action button ${sessionControl.background}/${sessionControl.filter}`}; native current Workspace transparent + atmosphere + brightness 1.15->1.5${workspaceControl === null ? '' : ` + action button ${workspaceControl.background}/${workspaceControl.filter}`}; ${ordinaryNote}`
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

  await results.check('r3-13', 'running-card rows match the native Workspace project row height and the pills fill the row', async () => {
    await ensurePanelRows(page)
    // The native height reference needs visible native rows: expand/reveal the tree like a user.
    await ensureNativeSessionRowsVisible(page, 2).catch(() => [])
    await resetPointer(page)
    // Reveal a native Workspace project row (the height reference) like a user would.
    const revealed = await page.eval(() => {
      const row = [...document.querySelectorAll('[data-row-key^="workspace:"]')].find((element) => element.getBoundingClientRect().height > 0)
      if (row === undefined) return false
      row.scrollIntoView({ block: 'center', behavior: 'instant' })
      return true
    }).catch(() => false)
    assert(revealed, 'no native Workspace project row is rendered to use as the height reference')
    await sleep(300)
    const facts = await page.eval(probePin.rowHeights)
    assert(facts !== null && Array.isArray(facts.rows) && facts.rows.length > 0, 'the card has no rows to measure')
    assert(facts.workspaceHeights.length > 0, 'no visible native Workspace project row could be measured')
    const workspaceHeights = facts.workspaceHeights.map((entry) => entry.rect.height)
    const reference = workspaceHeights[0]
    for (const height of workspaceHeights) {
      assertEqual(height, reference, `native Workspace project rows must share one height (got ${workspaceHeights.join('/')}px)`)
    }
    const parentRows = facts.rows.filter((row) => row.kind === 'parent')
    const childRows = facts.rows.filter((row) => row.kind === 'child')
    assert(parentRows.length > 0, 'the card has no main rows to measure')
    assert(childRows.length > 0, 'the card must render at least one nested subagent row so the child height is verified')
    for (const row of facts.rows) {
      assertEqual(row.row.height, reference,
        `${row.kind} row "${short(row.title, 30)}" height must equal the native Workspace project row height ${reference}px (got ${row.row.height}px)`)
      assert(row.main !== null, `${row.kind} row "${short(row.title, 30)}" has no body pill`)
      assertEqual(row.main.height, reference,
        `the ${row.kind} body pill must fill the row height ${reference}px (got ${row.main.height}px)`)
      assertEqual(row.mainBoxSizing, 'border-box', `${row.kind} body pill must use box-sizing:border-box so the highlight fills the row (got ${row.mainBoxSizing})`)
      assertNear(row.main.top, row.row.top, 1, `${row.kind} pill top must match the row top (${row.main.top} vs ${row.row.top})`)
      assertNear(row.main.bottom, row.row.bottom, 1, `${row.kind} pill bottom must match the row bottom (${row.main.bottom} vs ${row.row.bottom})`)
      assertNear(row.titleCenterDelta, 0, 1, `${row.kind} title must stay vertically centred in the row (delta ${row.titleCenterDelta}px)`)
      assertNear(row.timeCenterDelta, 0, 1, `${row.kind} time must stay vertically centred in the row (delta ${row.timeCenterDelta}px)`)
      assertEqual(row.titleWhiteSpace, 'nowrap', `${row.kind} title must stay single-line (white-space ${row.titleWhiteSpace})`)
      assert(row.titleRect.height <= 21, `${row.kind} title must not wrap/clip vertically (height ${row.titleRect.height}px, line-height ${row.titleLineHeight})`)
    }
    // The native Shell's own session rows are untouched by this card change.
    assert(facts.sessionHeights.length > 0, 'no visible native session row could be measured for the untouched-shell-height check')
    const sessionHeights = facts.sessionHeights.map((entry) => entry.rect.height)
    for (const height of sessionHeights) {
      assertEqual(height, 32, `native session rows must keep the shell's own 32 px height (got ${height}px; the card row-height rule must not restyle native rows)`)
    }
    // The taller rows must still scroll inside the clamped card body when it overflows.
    const panel = facts.panel
    assert(panel !== null, 'the card panel is missing')
    let scrollNote = `panel body ${panel.bodyClientHeight}px client / ${panel.bodyScrollHeight}px scroll`
    if (typeof panel.bodyScrollHeight === 'number' && typeof panel.bodyClientHeight === 'number' && panel.bodyScrollHeight > panel.bodyClientHeight + 2) {
      const scrolled = await page.eval(() => {
        const panelElement = document.querySelector('.psd-panel')
        const body = panelElement === null ? null : (panelElement.querySelector('.psd-panel-body') ?? panelElement)
        if (body === null) return null
        const before = body.scrollTop
        body.scrollTop = body.scrollHeight
        const after = body.scrollTop
        body.scrollTop = before
        return { before, after }
      })
      assert(scrolled !== null && scrolled.after > scrolled.before,
        `the card body must scroll with the taller rows (${short(JSON.stringify(scrolled), 140)})`)
      scrollNote += `, scrolled ${scrolled.before}->${scrolled.after}`
    } else {
      scrollNote += ' (rows fit without overflow; the five-row/View-all behavior is covered by the expansion log and full-mode checks)'
    }
    return `reference native Workspace project row ${reference}px; ${parentRows.length} main + ${childRows.length} child rows all ${reference}px, border-box pills fill the row and titles/times stay centred ±1 with no wrapping; native session rows ${sessionHeights.join('/')}px (shell 32 untouched); ${scrollNote}`
  })

  await results.check('r3-14', 'leading glyph cell, child-tree trunk and pin column share their centres; sparkle is enlarged', async () => {
    await ensurePanelRows(page)
    await ensureNativeSessionRowsVisible(page, 2).catch(() => [])
    await resetPointer(page)
    // The read-row sparkle only exists on an acknowledged row: open a finished row like a
    // user when the live card has none yet (this is the documented side effect).
    let currentTitleHint = null
    try {
      currentTitleHint = (await page.eval(probePin.currentCardRow))?.title ?? null
    } catch {
      currentTitleHint = null
    }
    const ensureReadRow = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const existing = await page.eval(probePin.glyphAlignment)
        if (existing.rows.some((row) => row.glyphKind === 'brand')) return existing
        const opener = await page.eval(() => {
          const row = [...document.querySelectorAll('.psd-run')]
            .find((element) => element.dataset.state === 'done' && element.querySelector('.psd-run-open') !== null)
          if (row === undefined) return null
          const button = row.querySelector('.psd-run-open')
          const rect = button.getBoundingClientRect()
          return { x: Math.round(rect.left + Math.min(40, Math.max(10, rect.width / 2))), y: Math.round(rect.top + rect.height / 2), title: (row.querySelector('.psd-run-title')?.innerText ?? '').trim() }
        }).catch(() => null)
        if (opener === null) {
          const summary = (await page.eval(probePin.glyphAlignment)).rows
            .map((row) => `${row.title.slice(0, 18)}:${row.state}:${row.glyphKind}${row.title === currentTitleHint ? ':current' : ''}`)
          debugLog(`r3-14: no done card row to open; main rows ${short(JSON.stringify(summary), 320)}`)
          await sleep(400)
          continue
        }
        await resetPointer(page)
        await page.clickAt(opener.x, opener.y)
        await sleep(1200)
        const read = await page.eval(probePin.glyphAlignment)
        if (read.rows.some((row) => row.glyphKind === 'brand')) return read
        debugLog(`r3-14: opening done row "${short(opener.title, 40)}" did not produce a read-row sparkle yet`)
      }
      // Fallback: the full-mode helper clicks a done card row's body when one exists.
      try {
        await arrangeReadDoneRow(page)
        await resetPointer(page)
        await sleep(600)
      } catch {
        /* best effort */
      }
      const afterBody = await page.eval(probePin.glyphAlignment)
      if (afterBody.rows.some((row) => row.glyphKind === 'brand')) return afterBody
      // Last fallback: open an existing Session from the native sidebar like a user, so a
      // finished+acknowledged row can appear in the card (documented side effect).
      try {
        const candidates = await page.eval(() => [...document.querySelectorAll('[data-row-key^="session:"]')]
          .filter((element) => element.getBoundingClientRect().height > 0)
          .map((element) => element.getAttribute('data-row-key'))
          .slice(0, 6))
        for (const key of candidates) {
          const sessionId = String(key).slice('session:'.length)
          if (sessionId === currentTitleHint) continue
          const row = await ensureNativeRowForSession(page, sessionId).catch(() => null)
          if (row === null) continue
          const point = await page.eval((rowKey) => {
            const element = document.querySelector(`[data-row-key="${rowKey}"]`)
            if (element === null) return null
            element.scrollIntoView({ block: 'center', behavior: 'instant' })
            const rect = element.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return null
            return { x: Math.round(rect.left + Math.min(60, Math.max(20, rect.width * 0.35))), y: Math.round(rect.top + rect.height / 2) }
          }, key).catch(() => null)
          if (point === null) continue
          await page.moveTo(point.x, point.y)
          await page.clickAt(point.x, point.y)
          for (let wait = 0; wait < 12; wait += 1) {
            await sleep(250)
            const read = await page.eval(probePin.glyphAlignment)
            if (read.rows.some((rowEntry) => rowEntry.glyphKind === 'brand')) return read
          }
        }
      } catch {
        /* best effort */
      }
      return page.eval(probePin.glyphAlignment)
    }
    let facts = await ensureReadRow()
    const restRows = facts.rows
    assert(Array.isArray(restRows) && restRows.length > 0, 'the card has no main rows to measure')
    const measuredCells = restRows.filter((row) => row.cell !== null)
    assertEqual(measuredCells.length, restRows.length, 'every main row must render the fixed .psd-run-glyph-cell')
    let brandObserved = false
    let brandSizes = []
    const dotSizes = []
    const referenceCentre = measuredCells[0].cell.centre
    const trunkCentres = []
    // Rest measurements: the glyph cell and its glyph never depend on the pin reveal.
    for (const row of restRows) {
      assert(row.cell.width === 16, `row "${short(row.title, 30)}" glyph cell width must be 16 px (got ${row.cell.width})`)
      assert(row.cell.height === 20, `row "${short(row.title, 30)}" glyph cell height must be 20 px (got ${row.cell.height})`)
      assertNear(row.cell.centre, referenceCentre, 0.5,
        `every main-row glyph cell must share one centre column (row "${short(row.title, 30)}" centre ${row.cell.centre}, reference ${referenceCentre})`)
      assert(row.glyph !== null, `row "${short(row.title, 30)}" has no leading glyph`)
      if (row.glyphKind === 'brand') {
        brandObserved = true
        assert(row.glyph.svg !== null, `read row "${short(row.title, 30)}" must render the sparkling svg`)
        assertEqual(row.glyph.svg.width, 16, `read-row sparkle svg width must be enlarged to 16 px (got ${row.glyph.svg.width})`)
        assertEqual(row.glyph.svg.height, 16, `read-row sparkle svg height must be 16 px (got ${row.glyph.svg.height})`)
        assertNear(row.glyph.svg.centre, row.cell.centre, 0.5, `the sparkle must stay visually centred in the glyph cell (svg ${row.glyph.svg.centre}, cell ${row.cell.centre})`)
        brandSizes.push(`${row.glyph.svg.width}x${row.glyph.svg.height}`)
      } else {
        assertEqual(row.glyph.width, 14, `state dot width must stay 14 px (row "${short(row.title, 30)}" got ${row.glyph.width})`)
        assertEqual(row.glyph.height, 14, `state dot height must stay 14 px (row "${short(row.title, 30)}" got ${row.glyph.height})`)
        assertNear(row.glyph.centre, row.cell.centre, 0.5, `the state dot must be centred in the glyph cell (dot ${row.glyph.centre}, cell ${row.cell.centre})`)
        dotSizes.push(`${row.glyph.width}x${row.glyph.height}`)
      }
      if (row.trunkCentre !== null) {
        assertNear(row.trunkCentre, row.cell.centre, 0.5,
          `the child-tree trunk must be centred under the glyph cell (trunk ${row.trunkCentre}, cell ${row.cell.centre})`)
        trunkCentres.push(row.trunkCentre)
      }
    }
    assert(trunkCentres.length > 0, 'no main row with nested child rows was rendered; cannot verify the trunk/child-dot alignment')
    // Expanded measurements: the alignment oracles are measured with the pin revealed
    // (the slot is collapsed at rest by the two-phase design).
    const withChildren = restRows.find((row) => row.trunkCentre !== null && row.childGlyph !== null
      && row.childGlyph.isBrand === false && row.childGlyph.width === 10)
      ?? restRows.find((row) => row.trunkCentre !== null)
    assert(withChildren !== undefined, 'no main row with nested child rows is available for the expanded alignment check')
    const expandedTitle = withChildren.title
    await hoverMainRowByTitle(page, expandedTitle)
    const expanded = await waitRevealPhase(page, expandedTitle,
      (reveal) => reveal.rowHovered && reveal.slotWidth === 16 && reveal.pinOpacity === '1',
      { timeout: 3000, label: 'expanded reveal for the alignment checks' })
    assertNear(expanded.titleLeftRel, 71, 0.75, `expanded title must start at 71 px (got ${expanded.titleLeftRel})`)
    assertNear(expanded.titleMarginLeft, 0, 0.25, `the expanded state must force the first-character shift to 0 (margin-left ${expanded.titleMarginLeft})`)
    const expandedFacts = await page.eval(probePin.glyphAlignment)
    const hoveredRow = expandedFacts.rows.find((row) => row.title === expandedTitle)
    assert(hoveredRow !== undefined, `the expanded alignment row "${short(expandedTitle, 50)}" disappeared`)
    assertNear(hoveredRow.cell.centre, referenceCentre, 0.5,
      `the expanded row must keep the shared glyph-cell centre (${hoveredRow.cell.centre} vs ${referenceCentre})`)
    assertNear(hoveredRow.trunkCentre, hoveredRow.cell.centre, 0.5,
      `the child-tree trunk must stay centred under the glyph cell when the pin is revealed (trunk ${hoveredRow.trunkCentre}, cell ${hoveredRow.cell.centre})`)
    assert(hoveredRow.pinSlot !== null && hoveredRow.pin !== null, 'the expanded row must render the pin slot and button')
    assertEqual(hoveredRow.pinSlot.marginLeft, '0px', `expanded pin slot margin-left must be 0 (got ${hoveredRow.pinSlot.marginLeft})`)
    assertEqual(hoveredRow.pinSlot.marginRight, '9px', `expanded pin slot margin-right must be 9 px (got ${hoveredRow.pinSlot.marginRight})`)
    assertNear(hoveredRow.pinSlot.centre, hoveredRow.pin.centre, 0.5,
      `the pin button must be centred in its slot (slot ${hoveredRow.pinSlot.centre}, button ${hoveredRow.pin.centre})`)
    assertNear(hoveredRow.gapLeft, 9, 0.5, `the gap left of the pin slot must be 9 px when revealed (got ${hoveredRow.gapLeft})`)
    assertNear(hoveredRow.gapRight, 9, 0.5, `the gap right of the pin slot must be 9 px when revealed (got ${hoveredRow.gapRight})`)
    assertNear(hoveredRow.gapLeft, hoveredRow.gapRight, 0.5, 'the revealed pin slot must be symmetrically spaced on both sides')
    let childDots = []
    const childGlyph = hoveredRow.childGlyph
    assert(childGlyph !== null, "no child glyph was rendered in the expanded row's nested children; the child/pin column alignment could not be verified")
    if (childGlyph.isBrand === false && childGlyph.width === 10) {
      assertNear(childGlyph.centre, hoveredRow.pin.centre, 0.5,
        `the child status-dot centre must align with the revealed pin centre (dot ${childGlyph.centre}, pin ${hoveredRow.pin.centre})`)
      childDots = [`${childGlyph.centre}@pin${hoveredRow.pin.centre}`]
    } else {
      // A read child row paints the 12 px sparkle instead of the 10 px state dot; its
      // wrapper is centred in the same child-glyph column, so allow the 1 px size delta
      // while still catching a column misalignment.
      const delta = Math.abs(childGlyph.centre - hoveredRow.pin.centre)
      assert(delta <= 1.5,
        `the child glyph column must stay within 1.5 px of the revealed pin column (glyph ${childGlyph.width}px centre ${childGlyph.centre}, pin ${hoveredRow.pin.centre}, Δ${delta.toFixed(2)}px)`)
      childDots = [`${childGlyph.centre}@pin${hoveredRow.pin.centre} (glyph ${childGlyph.width}px, Δ${delta.toFixed(2)})`]
    }
    state.glyphBrandObserved = brandObserved
    const uniqueJoins = (values) => [...new Set(values)].join('/')
    const cellCentreList = uniqueJoins(measuredCells.map((row) => Math.round(row.cell.centre)))
    const sparkleList = uniqueJoins(brandSizes)
    const dotList = uniqueJoins(dotSizes)
    log('r3-14: rest glyph-cell centres ' + cellCentreList + ' px (reference ' + referenceCentre +
      '); expanded row pin ' + hoveredRow.pin.centre + ' with gaps ' + hoveredRow.gapLeft + '/' + hoveredRow.gapRight +
      '; trunk ' + hoveredRow.trunkCentre + '; child dots ' + childDots.join(', ') +
      '; sparkle ' + sparkleList + '; state dots ' + dotList)
    return 'rest: glyph cell 16x20 centred at ' + referenceCentre + 'px across ' + restRows.length + ' main rows (sparkle ' +
      sparkleList + ', state dots ' + dotList + ' centred; trunk ' + uniqueJoins(trunkCentres) + ' = cell centre); expanded "' +
      short(expandedTitle, 30) + '": slot 16 px with 9/' + hoveredRow.gapRight + ' gaps and title at 71 px, pin centre ' +
      hoveredRow.pin.centre + ' = child dot ' + childDots.join(', ')
  })
  if (state.glyphBrandObserved === true) {
    await results.check('r3-14b', 'the read-row sparkle is 16x16 px and centred in the glyph cell', async () => {
      const facts = await page.eval(probePin.glyphAlignment)
      const brandRows = facts.rows.filter((row) => row.glyphKind === 'brand')
      assert(brandRows.length > 0, 'the read-row sparkle disappeared between the two reads')
      for (const row of brandRows) {
        assert(row.glyph.svg !== null, 'a read row must render the sparkling svg')
        assertEqual(row.glyph.svg.width, 16, `read-row sparkle svg width must be enlarged to 16 px (got ${row.glyph.svg.width})`)
        assertEqual(row.glyph.svg.height, 16, `read-row sparkle svg height must be 16 px (got ${row.glyph.svg.height})`)
        assertNear(row.glyph.svg.centre, row.cell.centre, 0.5, 'the sparkle must be visually centred in the glyph cell')
      }
      return `${brandRows.length} read row(s): sparkle ${brandRows[0].glyph.svg.width}x${brandRows[0].glyph.svg.height} px centred in the 16 px cell`
    })
  } else {
    results.skip('r3-14b', 'the read-row sparkle is 16x16 px and centred in the glyph cell', 'no finished/acknowledged card row was available to render the read-row sparkle in this environment (every visible main row is currently running), so the enlarged sparkle could not be observed live on this build. This is an explicit SKIP, not a pass: the alignment/size assertions for the state-dot rows and the 16 px glyph cell still run in r3-14, and the 16 px sparkle was observed on the previous build (53f159e). Re-run when a finished card row exists.')
  }

  await results.check('r3-15', 'a pinned row paints exactly one highlight layer (row tint, no inner body-pill tint)', async () => {
    await ensurePanelRows(page)
    await resetPointer(page)
    const selection = await choosePinTargets(page)
    assert(selection.ordered.length > 0, 'no unpinned, non-current card row is available for the single-tint check')
    const target = selection.ordered[0]
    const resolved = await sessionIdByTitle(page, target.title)
    assert(resolved.id !== null, `could not resolve the Session id of "${short(target.title, 50)}" (${resolved.source})`)
    const before = await page.eval(probePin.pinnedRowFacts, target.title)
    assert(before !== null, `the card row "${short(target.title, 50)}" is not rendered`)
    assertEqual(before.pinned, null, 'the single-tint target must start unpinned')
    const pinned = await clickRowPin(page, target.title, 'pin')
    assertEqual(pinned.row.pinned, 'true', 'the single-tint target must accept the pin')
    state.pinned.push({ id: resolved.id, title: target.title })
    await resetPointer(page)
    await sleep(320)
    const calm = await page.eval(probePin.pinnedRowFacts, target.title)
    assert(calm !== null && calm.pinned === 'true', 'the pinned row must report data-pinned while parked')
    assert(calm.row.background !== 'rgba(0, 0, 0, 0)' && calm.row.background !== 'transparent',
      `a pinned row must carry the row-level violet tint (row background ${calm.row.background})`)
    const calmReveal = await page.eval(probePin.revealFacts, target.title)
    assertNear(calmReveal.slotWidth, 16, 0.75, `a pinned row must keep the expanded slot at rest (got ${calmReveal.slotWidth})`)
    assertNear(calmReveal.titleLeftRel, 71, 0.75, `a pinned row's title must stay at 71 px at rest (got ${calmReveal.titleLeftRel})`)
    assertEqual(calm.main.background, 'rgba(0, 0, 0, 0)',
      `the pinned body pill must stay transparent — the row tint is the only highlight layer (main background ${calm.main.background})`)
    assertEqual(calm.row.backgroundImage, 'none', `no background-image layer on the pinned row (${calm.row.backgroundImage})`)
    assertEqual(calm.main.backgroundImage, 'none', `no background-image layer on the pinned body pill (${calm.main.backgroundImage})`)
    const rowTint = calm.row.background
    // Hovering a pinned row layers the full-row hover surface over the violet tint; the
    // body pill stays transparent (there is no second inner pill any more).
    await hoverCardRowByTitle(page, 'parent', target.title)
    await sleep(300)
    const hovered = await page.eval(probePin.pinnedRowFacts, target.title)
    assert(hovered !== null && hovered.rowHovered === true, 'the pinned row was not hovered for the hover-feedback check')
    assertEqual(hovered.main.background, 'rgba(0, 0, 0, 0)',
      `the pinned row body must stay transparent on hover (main background ${hovered.main.background})`)
    assert(hovered.row.background !== 'rgba(0, 0, 0, 0)',
      `hovering a pinned row must show hover feedback on the row surface (got ${hovered.row.background})`)
    assert(hovered.row.background !== rowTint,
      `the hover feedback must layer over, not replace, the row tint (hover ${hovered.row.background}, row tint ${rowTint})`)
    assertEqual(hovered.row.backgroundImage, 'none', 'hovering must not add a background-image layer on the pinned row')
    await clickRowPin(page, target.title, 'unpin')
    state.pinned = state.pinned.filter((entry) => entry.id !== resolved.id)
    await resetPointer(page)
    await sleep(320)
    const cleared = await page.eval(probePin.pinnedRowFacts, target.title)
    assert(cleared !== null && cleared.pinned === null, 'the row must be unpinned again after the single-tint check')
    assertEqual(cleared.row.background, before.row.background,
      `unpinning must clear the row tint (row background ${cleared.row.background}, baseline ${before.row.background})`)
    const clearedReveal = await page.eval(probePin.revealFacts, target.title)
    assertNear(clearedReveal.slotWidth, 0, 0.25, `unpinning must collapse the slot back to 0 px (got ${clearedReveal.slotWidth})`)
    assert(clearedReveal.titleLeftRel > 48 && clearedReveal.titleLeftRel < 53,
      `unpinning must return the title to its right-biased first-character-centred rest range (got ${clearedReveal.titleLeftRel})`)
    const clearedFirstChar = typeof clearedReveal.firstCharWidth === 'number' && clearedReveal.firstCharWidth > 0
      ? clearedReveal.firstCharWidth
      : 2 * (10 - clearedReveal.titleShift)
    assertNear(clearedReveal.titleLeftRel + clearedFirstChar / 2, 56, 0.7,
      `unpinning must put the first character back on the requested right-biased column 56 (titleLeft ${clearedReveal.titleLeftRel})`)
    assertEqual(cleared.main.background, 'rgba(0, 0, 0, 0)',
      `the unpinned body pill must stay transparent (main background ${cleared.main.background})`)
    return `pinned "${short(target.title, 30)}": row tint ${rowTint} only, body pill ${calm.main.background} at rest and no background-image; hover body ${hovered.main.background}; unpin restored the row to ${cleared.row.background}`
  })

  await results.check('r3-16', 'Power Suite surfaces are borderless (no outer border on the Running & recent panel card)', async () => {
    const surfaces = await page.eval(() => {
      const side = ['Top', 'Right', 'Bottom', 'Left']
      const read = (name, selector) => {
        const element = document.querySelector(selector)
        if (element === null) return { name, present: false }
        const style = getComputedStyle(element)
        return {
          name,
          present: true,
          widths: side.map((edge) => Number.parseFloat(style[`border${edge}Width`]) || 0),
          styles: side.map((edge) => style[`border${edge}Style`])
        }
      }
      return [
        read('Running & recent panel card', '.psd-panel'),
        read('plugin hover card', '.psd-hovercard'),
        read('prompt-history rail card', '.psp-rail-card')
      ]
    })
    const panel = surfaces.find((surface) => surface.name === 'Running & recent panel card' && surface.present)
    assert(panel !== undefined, 'the Running & recent panel card is not rendered')
    for (const surface of surfaces.filter((entry) => entry.present)) {
      assert(surface.widths.every((width) => width === 0),
        `${surface.name} must be borderless: intended rule is 0 outer border (got ${surface.widths.join('/')} px, styles ${surface.styles.join('/')})`)
    }
    return `intended borderless rule: ${surfaces.filter((entry) => entry.present).map((entry) => `${entry.name} ${entry.widths.join('/')} px`).join('; ')}`
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
// --layout mode: persisted, Host-synced sidebar width + the drag flicker oracle
// ---------------------------------------------------------------------------------------------

/** Page-side probes for the `--layout` checks (plain serializable functions). */
const probeLayout = {
  /**
   * Sidebar shell facts: grid track, drag handle, collapsed/dragging state and the
   * per-origin sidebar-width cache. The column width (not the 0x0 slot anchor) is the
   * rendered width the shell stores as `layoutInfo.sidebar`.
   */
  sidebarShell: () => {
    const box = (element) => {
      if (element === null || element === undefined) return null
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      }
    }
    const column = document.querySelector('[class*="_sidebarCol"]')
    const handle = document.querySelector('[data-side="sidebar"]')
    const frame = document.querySelector('[class*="_frame"]')
    let cacheRaw = null
    try {
      cacheRaw = window.localStorage.getItem('power-suite.sidebar-width')
    } catch {
      cacheRaw = null
    }
    return {
      column: box(column),
      handle: box(handle),
      handleLeftStyle: handle === null ? null : handle.style.left,
      frame: box(frame),
      grid: frame === null ? null : getComputedStyle(frame).gridTemplateColumns,
      collapsed: document.querySelector('[data-sidebar-collapsed]') !== null,
      dragging: document.querySelector('[data-dragging]') !== null,
      cacheRaw,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  },

  /** Painted-pixel + current-row facts for every atmosphere canvas on the page. */
  canvasPaint: () => {
    const pixelGrid = (canvas) => {
      if (!canvas.isConnected || canvas.width <= 0 || canvas.height <= 0) return 0
      let context = null
      try {
        context = canvas.getContext('2d', { willReadFrequently: true })
      } catch {
        context = null
      }
      if (context === null) return 0
      let sum = 0
      for (let gy = 0; gy < 7; gy += 1) {
        for (let gx = 0; gx < 7; gx += 1) {
          const x = Math.min(canvas.width - 1, Math.max(0, Math.round(((gx + 0.5) * canvas.width) / 7)))
          const y = Math.min(canvas.height - 1, Math.max(0, Math.round(((gy + 0.5) * canvas.height) / 7)))
          const data = context.getImageData(x, y, 1, 1).data
          sum += data[0] + data[1] + data[2] + data[3]
        }
      }
      return sum
    }
    return [...document.querySelectorAll('.psd-atmos-canvas')].map((canvas) => {
      const wrapper = canvas.parentElement
      const row = wrapper === null ? null : wrapper.parentElement
      const rect = canvas.getBoundingClientRect()
      return {
        wrapper: wrapper === null ? null : wrapper.getAttribute('data-psd-atmos'),
        rowKey: row === null ? null : row.getAttribute('data-row-key'),
        currentWorkspace: row !== null && row.getAttribute('data-psd-current-workspace') === 'true',
        currentSession: row !== null && row.getAttribute('data-psd-current-session') === 'true',
        running: wrapper === null ? null : wrapper.getAttribute('data-psd-atmos-running'),
        motion: wrapper === null ? null : wrapper.getAttribute('data-psd-atmos-motion'),
        width: canvas.width,
        height: canvas.height,
        painted: pixelGrid(canvas),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        visible: rect.width > 0 && rect.height > 0,
      }
    })
  },

  /** Browser cache raw value + the client's documented `sidebarWidth.probe()` seam read. */
  sidebarWidthState: () => {
    let cacheRaw = null
    try {
      cacheRaw = window.localStorage.getItem('power-suite.sidebar-width')
    } catch {
      cacheRaw = null
    }
    const hooks = globalThis.__POWER_SUITE_TEST_HOOKS__
    const seam = hooks !== null && typeof hooks === 'object' ? hooks.sidebarWidth : undefined
    let probeState = null
    let seamError = null
    if (seam !== undefined && seam !== null && typeof seam.probe === 'function') {
      try {
        probeState = seam.probe()
      } catch (error) {
        seamError = String((error && error.message) || error)
      }
    }
    return {
      cacheRaw,
      seamPresent: seam !== undefined && seam !== null,
      seamKeys: seam !== undefined && seam !== null && typeof seam === 'object' ? Object.keys(seam) : null,
      probe: probeState,
      seamError,
    }
  },

  /** Same-origin authenticated GET of the Host sidebar-width document. */
  hostSidebarWidth: async () => {
    try {
      const response = await fetch('/api/power-suite.sidebar-width', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      return { ok: response.ok, status: response.status, payload }
    } catch (error) {
      return { ok: false, status: null, error: String((error && error.message) || error) }
    }
  },

  /** Same-origin authenticated POST of one width (cleanup restore only). */
  postHostSidebarWidth: async (width) => {
    try {
      const response = await fetch('/api/power-suite.sidebar-width', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ sidebarWidth: width }),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      return { ok: response.ok, status: response.status, payload }
    } catch (error) {
      return { ok: false, status: null, error: String((error && error.message) || error) }
    }
  },

  /**
   * Arm the flicker instrumentation: tag every atmosphere canvas with a stable id and
   * register a ResizeObserver on it AFTER the client's own observer. The client's
   * observer (registered first, so notified first in the same batch) runs
   * `resize(); draw()`; this callback samples the bitmap in the same resize-notification
   * task, which is exactly the before-the-browser-paints contract of the fix. A blank
   * sample here means a resized canvas was left unpainted until a later animation tick.
   */
  armFlicker: () => {
    const pixelGrid = (canvas) => {
      if (!canvas.isConnected || canvas.width <= 0 || canvas.height <= 0) return 0
      let context = null
      try {
        context = canvas.getContext('2d', { willReadFrequently: true })
      } catch {
        context = null
      }
      if (context === null) return 0
      let sum = 0
      for (let gy = 0; gy < 7; gy += 1) {
        for (let gx = 0; gx < 7; gx += 1) {
          const x = Math.min(canvas.width - 1, Math.max(0, Math.round(((gx + 0.5) * canvas.width) / 7)))
          const y = Math.min(canvas.height - 1, Math.max(0, Math.round(((gy + 0.5) * canvas.height) / 7)))
          const data = context.getImageData(x, y, 1, 1).data
          sum += data[0] + data[1] + data[2] + data[3]
        }
      }
      return sum
    }
    const state = { armAt: Math.round(performance.now()), canvases: [], ro: [], observers: [] }
    globalThis.__psdLwFlicker = state
    let index = 0
    for (const canvas of document.querySelectorAll('.psd-atmos-canvas')) {
      const id = `atmos-${index}`
      index += 1
      canvas.setAttribute('data-psd-e2e-atmos', id)
      const wrapper = canvas.parentElement
      const row = wrapper === null ? null : wrapper.parentElement
      const record = {
        id,
        element: canvas,
        lastWidth: canvas.width,
        lastHeight: canvas.height,
      }
      state.canvases.push({
        id,
        wrapper: wrapper === null ? null : wrapper.getAttribute('data-psd-atmos'),
        rowKey: row === null ? null : row.getAttribute('data-row-key'),
        currentWorkspace: row !== null && row.getAttribute('data-psd-current-workspace') === 'true',
        currentSession: row !== null && row.getAttribute('data-psd-current-session') === 'true',
        width: canvas.width,
        height: canvas.height,
      })
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(() => {
          const width = canvas.width
          const height = canvas.height
          const resized = width !== record.lastWidth || height !== record.lastHeight
          record.lastWidth = width
          record.lastHeight = height
          state.ro.push({
            at: Math.round(performance.now()),
            id,
            resized,
            width,
            height,
            painted: pixelGrid(canvas),
            connected: canvas.isConnected,
          })
        })
        observer.observe(canvas)
        state.observers.push(observer)
      }
    }
    return { armAt: state.armAt, canvases: state.canvases, count: state.canvases.length }
  },

  /** One per-drag-step sample of the rendered width + every atmosphere canvas bitmap. */
  flickerStep: (tag) => {
    const pixelGrid = (canvas) => {
      if (!canvas.isConnected || canvas.width <= 0 || canvas.height <= 0) return 0
      let context = null
      try {
        context = canvas.getContext('2d', { willReadFrequently: true })
      } catch {
        context = null
      }
      if (context === null) return 0
      let sum = 0
      for (let gy = 0; gy < 7; gy += 1) {
        for (let gx = 0; gx < 7; gx += 1) {
          const x = Math.min(canvas.width - 1, Math.max(0, Math.round(((gx + 0.5) * canvas.width) / 7)))
          const y = Math.min(canvas.height - 1, Math.max(0, Math.round(((gy + 0.5) * canvas.height) / 7)))
          const data = context.getImageData(x, y, 1, 1).data
          sum += data[0] + data[1] + data[2] + data[3]
        }
      }
      return sum
    }
    const state = globalThis.__psdLwFlicker
    const column = document.querySelector('[class*="_sidebarCol"]')
    const columnWidth = column === null ? null : Math.round(column.getBoundingClientRect().width)
    return {
      tag,
      at: Math.round(performance.now()),
      dragging: document.querySelector('[data-dragging]') !== null,
      columnWidth,
      canvases: [...document.querySelectorAll('.psd-atmos-canvas')].map((canvas) => ({
        id: canvas.getAttribute('data-psd-e2e-atmos'),
        width: canvas.width,
        height: canvas.height,
        painted: pixelGrid(canvas),
        connected: canvas.isConnected,
      })),
      roCount: state === undefined || state === null ? 0 : state.ro.length,
    }
  },

  /** The in-frame resize samples collected by the armed observers. */
  flickerSummary: () => {
    const state = globalThis.__psdLwFlicker
    if (state === undefined || state === null) return { ok: false, ro: [], canvases: [] }
    return { ok: true, armAt: state.armAt, canvases: state.canvases, ro: state.ro }
  },

  /** Disconnect the observers and drop the instrumentation markers. */
  disarmFlicker: () => {
    const state = globalThis.__psdLwFlicker
    if (state === undefined || state === null) return false
    for (const observer of state.observers ?? []) {
      try {
        observer.disconnect()
      } catch {
        // A disconnected observer is fine.
      }
    }
    for (const canvas of document.querySelectorAll('.psd-atmos-canvas')) canvas.removeAttribute('data-psd-e2e-atmos')
    globalThis.__psdLwFlicker = null
    return true
  },
}

/**
 * Parse the client's sidebar-width cache document
 * (`power-suite.sidebar-width`: `{version:1, sidebarWidth, pending}`).
 * @param {string | null} raw - localStorage value.
 * @returns {{ version: 1, sidebarWidth: number | null, pending: boolean } | null} parsed document, or null when absent/malformed.
 */
function parseSidebarWidthCache(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  if (parsed.version !== 1) return null
  if (parsed.sidebarWidth !== null && !(Number.isInteger(parsed.sidebarWidth) && parsed.sidebarWidth >= SIDEBAR_WIDTH_MIN && parsed.sidebarWidth <= SIDEBAR_WIDTH_MAX)) return null
  if (typeof parsed.pending !== 'boolean') return null
  return { version: 1, sidebarWidth: parsed.sidebarWidth, pending: parsed.pending }
}

/**
 * @param {object | null} facts - `probeLayout.sidebarShell` result.
 * @returns {number | null} the rendered sidebar column width in px.
 */
function sidebarWidthOf(facts) {
  if (facts === null || facts === undefined) return null
  if (facts.column !== null && facts.column !== undefined && facts.column.width > 0) return facts.column.width
  if (facts.handle !== null && facts.handle !== undefined) return Math.round(facts.handle.left + facts.handle.width / 2)
  return null
}

/**
 * @returns {Promise<object | null>} sidebar shell facts (never throws).
 */
async function readSidebarShell(page) {
  try {
    return await page.eval(probeLayout.sidebarShell)
  } catch {
    return null
  }
}

/**
 * Poll the rendered sidebar width until it matches `expected`.
 * @param {object} page - Page wrapper.
 * @param {number | null} expected - target width; null returns the current width after the timeout.
 * @param {object} [options] - tolerance/timeout/label.
 * @returns {Promise<number | null>} the matching width, or the last rendered width when `expected` is null.
 */
async function waitSidebarWidth(page, expected, { tolerance = 1, timeout = 8000, label = 'sidebar width' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const facts = await readSidebarShell(page)
    const width = sidebarWidthOf(facts)
    if (width !== null) {
      last = width
      if (expected !== null && Math.abs(width - expected) <= tolerance) return width
    }
    if (Date.now() + 200 >= deadline) break
    await sleep(200)
  }
  if (expected === null) return last
  throw new Error(`timed out after ${timeout}ms waiting for ${label} to become ${expected}px ±${tolerance} (last rendered ${last === null ? 'n/a' : `${last}px`})`)
}

/**
 * @returns {Promise<{ ok: boolean, status: number | null, payload?: object | null, error?: string }>} the Host document read.
 */
async function readHostSidebarWidth(page) {
  try {
    return await page.eval(probeLayout.hostSidebarWidth)
  } catch (error) {
    return { ok: false, status: null, error: String((error && error.message) || error) }
  }
}

/**
 * @returns {Promise<{ ok: boolean, status: number | null, payload?: object | null, error?: string }>} the Host write result.
 */
async function postHostSidebarWidth(page, width) {
  try {
    return await page.eval(probeLayout.postHostSidebarWidth, width)
  } catch (error) {
    return { ok: false, status: null, error: String((error && error.message) || error) }
  }
}

/**
 * Reveal the current Workspace/Session atmosphere when the native tree starts collapsed.
 * The atmosphere mounts on the current Workspace row even while the tree is collapsed; a
 * missing canvas is retried after expanding one collapsed Workspace group like a user.
 * @returns {Promise<void>}
 */
async function ensureLayoutAtmosphere(page) {
  const canvasCount = () => page.eval(() => document.querySelectorAll('.psd-atmos-canvas').length).catch(() => 0)
  if ((await canvasCount()) > 0) return
  try {
    await page.waitForFn(() => document.querySelectorAll('.psd-atmos-canvas').length > 0, [], { timeout: 12000, label: 'sidebar atmosphere canvas' })
    return
  } catch {
    /* retry after revealing the native rows */
  }
  for (let pass = 0; pass < 3; pass += 1) {
    if (!(await expandNativeWorkspaceRow(page))) break
    if ((await canvasCount()) > 0) return
  }
  await page.waitForFn(() => document.querySelectorAll('.psd-atmos-canvas').length > 0, [], { timeout: 8000, label: 'sidebar atmosphere canvas after expanding a Workspace' }).catch(() => {})
}

/**
 * Drag the native sidebar resize handle with real CDP pointer input.
 * @param {object} page - Page wrapper.
 * @param {{ fromWidth: number, toWidth: number, steps?: number, settleMs?: number, onStep?: Function, label?: string }} options - gesture facts.
 * @returns {Promise<object>} gesture log.
 */
async function dragSidebarHandle(page, { fromWidth, toWidth, steps = SIDEBAR_DRAG_STEPS, settleMs = SIDEBAR_DRAG_STEP_SETTLE_MS, onStep = null, label = 'sidebar drag' } = {}) {
  const handle = await page.eval(() => {
    const element = document.querySelector('[data-side="sidebar"]')
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(Math.min(rect.bottom - 24, Math.max(rect.top + 24, rect.top + rect.height / 2))),
    }
  })
  assert(handle !== null, `the native sidebar resize handle [data-side="sidebar"] is not present/visible for the ${label}`)
  const delta = toWidth - fromWidth
  const path = []
  await page.mouse({ type: 'mouseMoved', x: handle.x, y: handle.y })
  await sleep(60)
  await page.mouse({ type: 'mousePressed', x: handle.x, y: handle.y, button: 'left', clickCount: 1 })
  await sleep(60)
  let released = false
  try {
    for (let step = 1; step <= steps; step += 1) {
      const x = handle.x + Math.round((delta * step) / steps)
      await page.mouse({ type: 'mouseMoved', x, y: handle.y, button: 'left', buttons: 1 })
      path.push(x)
      await sleep(settleMs)
      if (onStep !== null) await onStep(step, x)
    }
  } finally {
    try {
      await page.mouse({ type: 'mouseReleased', x: handle.x + delta, y: handle.y, button: 'left', clickCount: 1 })
      released = true
    } catch (error) {
      log(`warning: ${label} mouse release failed: ${short((error && error.message) || String(error), 200)}`)
    }
    await sleep(280)
  }
  return { label, beginX: handle.x, endX: handle.x + delta, y: handle.y, delta, steps, released, path }
}

/**
 * @param {Array<{ left: number, top: number, width: number, height: number } | null>} rects - candidate rects.
 * @returns {{ left: number, top: number, width: number, height: number } | null} padded union clip.
 */
function unionRect(rects) {
  const valid = rects.filter((rect) => rect !== null && rect !== undefined && rect.width > 0 && rect.height > 0)
  if (valid.length === 0) return null
  const left = Math.min(...valid.map((rect) => rect.left))
  const top = Math.min(...valid.map((rect) => rect.top))
  const right = Math.max(...valid.map((rect) => rect.left + rect.width))
  const bottom = Math.max(...valid.map((rect) => rect.top + rect.height))
  return { left: Math.max(0, left - 16), top: Math.max(0, top - 16), width: right - left + 32, height: bottom - top + 32 }
}

/**
 * Write one optional screenshot into the gitignored `--layout` evidence directory.
 * @returns {Promise<string | null>} the file path, or null when disabled/failed.
 */
async function writeLayoutShot(page, name, clip, state) {
  if (state.shotsEnabled !== true || clip === null || clip === undefined) return null
  try {
    await mkdir(LAYOUT_EVIDENCE_DIR, { recursive: true })
    const x = Math.max(0, Math.round(clip.left))
    const y = Math.max(0, Math.round(clip.top))
    const width = Math.min(Math.round(clip.width), VIEWPORT.width - x)
    const height = Math.min(Math.round(clip.height), VIEWPORT.height - y)
    if (width < 8 || height < 8) return null
    const file = path.join(LAYOUT_EVIDENCE_DIR, `${name}.png`)
    await page.screenshot(file, { x, y, width, height })
    log(`wrote ${file}`)
    state.layoutEvidence = [...(state.layoutEvidence ?? []), file]
    return file
  } catch (error) {
    log(`warning: layout screenshot ${name} failed: ${short((error && error.message) || String(error), 200)}`)
    return null
  }
}

/**
 * Write one JSON evidence file (drag steps / in-frame samples) into the gitignored
 * `--layout` evidence directory. The token is never included.
 * @returns {Promise<string | null>} the file path, or null when the write failed.
 */
async function writeLayoutEvidence(state, name, data) {
  try {
    await mkdir(LAYOUT_EVIDENCE_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
    const file = path.join(LAYOUT_EVIDENCE_DIR, `layout-${name}-${stamp}.json`)
    await writeFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...data }, null, 2)}\n`, 'utf8')
    log(`wrote ${file}`)
    state.layoutEvidence = [...(state.layoutEvidence ?? []), file]
    return file
  } catch (error) {
    log(`warning: could not write layout evidence ${name}: ${short((error && error.message) || String(error), 200)}`)
    return null
  }
}

/**
 * `--layout`: drive the native sidebar resize handle with real CDP input and verify the
 * persisted, Host-synced width plus the drag flicker fix.
 * @param {object} input - `{ page, results, state }`.
 * @returns {Promise<void>}
 */
async function runLayoutWidthChecks({ page, results, state }) {
  log('\n=== --layout: sidebar width drag flicker + persistence + Host sync ===')
  state.mode = 'layout'
  state.layout = { startedAt: Date.now() }
  state.sidebarWidthShared = null
  // The flicker oracle needs the animated renderer: the old renderer already
  // redrew synchronously under reduced motion, so a reduced-motion page would
  // pass lw-3 against the pre-fix client and silently weaken the oracle. Force
  // the standard motion preference for this mode only (throwaway profile).
  await page.emulateMedia([{ name: 'prefers-reduced-motion', value: 'no-preference' }]).catch(() => {})
  log('layout motion preference: prefers-reduced-motion=no-preference (flicker oracle needs the animated renderer)')

  await results.check('lw-1', 'native sidebar drag handle present; current sidebar column width measured', async () => {
    await page.waitForFn(() => document.querySelector('[class*="_sidebarCol"]') !== null, [], { timeout: 20000, label: 'sidebar column' })
    let facts = await readSidebarShell(page)
    if (facts === null || facts.handle === null) {
      // A fresh profile starts expanded; recover a collapsed sidebar through the shell's
      // own control (a normal user action) before declaring the handle missing. The
      // collapsed rail exposes `[data-sidebar-opener]`; the labels are a fallback for
      // shell builds without that attribute.
      const expand = await page.eval(() => {
        const labelled = ['Expand sidebar', 'Open sidebar', '展开侧边栏', '打开侧边栏', '展开边栏']
        const candidates = [
          ...document.querySelectorAll('[data-sidebar-opener]'),
          ...document.querySelectorAll('[data-sidebar-toggle]'),
          ...[...document.querySelectorAll('button')].filter((element) => labelled.includes((element.getAttribute('aria-label') ?? '').trim())),
        ]
        const button = candidates.find((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        if (button === undefined) return null
        const rect = button.getBoundingClientRect()
        return {
          label: button.getAttribute('aria-label') ?? button.getAttribute('data-sidebar-opener') ?? '',
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        }
      })
      if (expand !== null) {
        await page.clickAt(expand.x, expand.y)
        await sleep(500)
        facts = await readSidebarShell(page)
      }
    }
    assert(facts !== null, 'the sidebar shell facts could not be read')
    assert(facts.handle !== null, 'the native sidebar resize handle [data-side="sidebar"] is missing (collapsed sidebar or narrow viewport)')
    assert(facts.collapsed === false, 'the sidebar is collapsed; the resize handle is only rendered while it is expanded')
    const width = sidebarWidthOf(facts)
    assert(width !== null && width > 0, 'the rendered sidebar column width could not be measured')
    const handleCentre = Math.round(facts.handle.left + facts.handle.width / 2)
    assertNear(handleCentre, width, 1, `the drag handle must sit on the sidebar column's right edge (handle centre ${handleCentre}px vs column ${width}px)`)
    state.layout.preWidth = width
    state.layout.preGrid = facts.grid
    state.layout.preCache = facts.cacheRaw
    const preCache = parseSidebarWidthCache(facts.cacheRaw)
    return `handle ${facts.handle.width}px wide at x=${handleCentre}, column ${width}px, grid "${short(facts.grid, 60)}", pre-run cache ${preCache === null ? 'absent' : short(facts.cacheRaw, 120)}`
  })

  // Pre-run Host document: read as early as possible. With the route live the client
  // seeds the document at boot, so this is the earliest observable pre-run value.
  state.layout.hostBaseline = await readHostSidebarWidth(page)
  log(`layout baseline: pre-run width ${state.layout.preWidth ?? 'n/a'}px; host route ${state.layout.hostBaseline.ok === true || state.layout.hostBaseline.status === 200 ? `200 ${short(JSON.stringify(state.layout.hostBaseline.payload), 160)}` : `unavailable (${state.layout.hostBaseline.status ?? state.layout.hostBaseline.error ?? 'unknown'})`}`)

  await results.check('lw-2', 'the current Workspace row and/or native current Session row carries a live atmosphere canvas', async () => {
    await ensureLayoutAtmosphere(page)
    const facts = await page.eval(probeLayout.canvasPaint)
    const live = facts.filter((canvas) => canvas.visible && canvas.width > 0 && canvas.height > 0 && canvas.painted > 0)
    assert(live.length > 0, `no live .psd-atmos-canvas with painted pixels in the sidebar (${facts.length} canvas node(s); the current-row rainbow is not mounted)`)
    const current = live.filter((canvas) => (canvas.currentWorkspace === true && canvas.wrapper === 'workspace') || (canvas.currentSession === true && canvas.wrapper === 'session'))
    assert(current.length > 0,
      `no painted atmosphere canvas on a current Workspace/Session row (live canvases: ${short(JSON.stringify(live.map((canvas) => ({ wrapper: canvas.wrapper, rowKey: canvas.rowKey, currentWorkspace: canvas.currentWorkspace, currentSession: canvas.currentSession }))), 320)})`)
    for (const canvas of current) {
      assert(canvas.motion === 'animated' || canvas.motion === 'static', `the current-row atmosphere canvas must report its motion state (got ${canvas.motion})`)
      assert(canvas.running === 'true' || canvas.running === 'false', `the current-row atmosphere canvas must report its renderer state (got ${canvas.running})`)
    }
    state.layout.atmosphere = current.map((canvas) => ({ wrapper: canvas.wrapper, rowKey: canvas.rowKey, width: canvas.width, height: canvas.height, painted: canvas.painted, motion: canvas.motion }))
    for (const canvas of current) {
      await writeLayoutShot(page, `layout-atmosphere-${canvas.wrapper}-before-drag`, unionRect([canvas.rect]), state)
    }
    return current.map((canvas) => `${canvas.wrapper} canvas ${canvas.width}x${canvas.height} painted=${canvas.painted} motion=${canvas.motion}`).join('; ')
  })

  await results.check('lw-3', 'flicker oracle: a real ~10-step drag keeps the canvas element, resizes its backing store and never samples a blank bitmap', async () => {
    const pre = state.layout.preWidth
    assert(typeof pre === 'number' && pre > 0, 'the pre-run sidebar width was not measured (lw-1 failed first)')
    await ensureLayoutAtmosphere(page)
    // The oracle only discriminates the missing synchronous resize repaint while
    // the animated renderer runs; reduced motion already repainted synchronously in
    // the pre-fix client. The mode forces prefers-reduced-motion=no-preference above.
    const paint = await page.eval(probeLayout.canvasPaint)
    const animatedCurrent = paint.filter((canvas) => canvas.visible
      && canvas.motion === 'animated' && canvas.running === 'true'
      && (canvas.currentWorkspace === true || canvas.currentSession === true))
    assert(animatedCurrent.length > 0,
      `the flicker oracle needs an animated, running current-row atmosphere canvas (motion facts: ${short(JSON.stringify(paint.map((canvas) => ({ wrapper: canvas.wrapper, rowKey: canvas.rowKey, motion: canvas.motion, running: canvas.running }))), 320)})`)
    await page.eval(probeLayout.disarmFlicker).catch(() => false)
    const armed = await page.eval(probeLayout.armFlicker)
    state.layout.armed = armed
    assert(armed.count > 0, 'no atmosphere canvas exists to sample (the current-row rainbow is not mounted)')
    const oracle = armed.canvases.find((canvas) => canvas.currentWorkspace === true) ?? armed.canvases.find((canvas) => canvas.currentSession === true) ?? null
    assert(oracle !== null, `no atmosphere canvas on a current Workspace/Session row (armed: ${short(JSON.stringify(armed.canvases), 300)})`)
    const animatedOracle = animatedCurrent.find((canvas) => canvas.rowKey === oracle.rowKey && canvas.wrapper === oracle.wrapper) ?? null
    assert(animatedOracle !== null,
      `the selected oracle canvas (wrapper ${oracle.wrapper}, row ${oracle.rowKey}px) is not one of the animated current-row canvases (${short(JSON.stringify(animatedCurrent.map((canvas) => ({ wrapper: canvas.wrapper, rowKey: canvas.rowKey }))), 240)})`)
    state.layout.oracleId = oracle.id
    // Choose the ±40 px direction that stays inside the shell's 264..420 drag range.
    let delta = SIDEBAR_DRAG_TOTAL_PX
    if (pre + delta > SIDEBAR_WIDTH_MAX) delta = -SIDEBAR_DRAG_TOTAL_PX
    if (pre + delta < SIDEBAR_WIDTH_MIN) delta = Math.min(SIDEBAR_DRAG_TOTAL_PX, SIDEBAR_WIDTH_MAX - pre)
    assert(delta !== 0 && pre + delta >= SIDEBAR_WIDTH_MIN && pre + delta <= SIDEBAR_WIDTH_MAX,
      `cannot choose a ±${SIDEBAR_DRAG_TOTAL_PX}px drag direction from ${pre}px inside the shell's ${SIDEBAR_WIDTH_MIN}..${SIDEBAR_WIDTH_MAX} range`)
    const target = pre + delta
    const steps = []
    const gesture = await dragSidebarHandle(page, {
      fromWidth: pre,
      toWidth: target,
      steps: SIDEBAR_DRAG_STEPS,
      onStep: async (step) => {
        steps.push(await page.eval(probeLayout.flickerStep, `step-${step}`))
      },
    })
    await sleep(260)
    const summary = await page.eval(probeLayout.flickerSummary)
    state.layout.steps = steps
    state.layout.gesture = gesture
    state.layout.flicker = summary
    await writeLayoutEvidence(state, 'drag-samples', {
      preWidth: pre,
      targetWidth: target,
      delta,
      gesture,
      perStep: steps,
      inFrameResizeSamples: summary.ro,
      armedCanvases: summary.canvases,
    })
    const settled = await waitSidebarWidth(page, target, { tolerance: 1, timeout: 6000, label: 'sidebar width after the drag' })
    state.layout.draggedWidth = settled
    assertEqual(steps.length, SIDEBAR_DRAG_STEPS, `expected ${SIDEBAR_DRAG_STEPS} sampled drag steps`)
    for (const sample of steps) {
      const entry = sample.canvases.find((canvas) => canvas.id === oracle.id)
      assert(entry !== undefined, `the current-row atmosphere canvas ${oracle.id} disappeared during the drag (step ${sample.tag})`)
      assertEqual(entry.connected, true, `the current-row atmosphere canvas was detached during the drag (step ${sample.tag})`)
      assert(entry.width > 0 && entry.height > 0, `the current-row atmosphere canvas lost its drawing buffer during the drag (step ${sample.tag}: ${entry.width}x${entry.height})`)
    }
    const resizeSteps = []
    let previous = null
    for (const sample of steps) {
      const entry = sample.canvases.find((canvas) => canvas.id === oracle.id)
      if (previous !== null && entry !== undefined && (entry.width !== previous.width || entry.height !== previous.height)) {
        resizeSteps.push(`${sample.tag}:${previous.width}x${previous.height}->${entry.width}x${entry.height}`)
      }
      if (entry !== undefined) previous = entry
    }
    const inFrameResizes = (summary.ro ?? []).filter((sample) => sample.resized === true)
    assert(resizeSteps.length >= 1 || inFrameResizes.length >= 1,
      `no atmosphere backing-store resize was observed during the ${SIDEBAR_DRAG_STEPS}-step drag (canvas stayed ${previous === null ? 'unmeasured' : `${previous.width}x${previous.height}`}; ${(summary.ro ?? []).length} in-frame sample(s))`)
    const blankStepSamples = []
    for (const sample of steps) {
      for (const canvas of sample.canvases) {
        if (canvas.connected === true && canvas.width > 0 && canvas.height > 0 && canvas.painted === 0) {
          blankStepSamples.push({ tag: sample.tag, id: canvas.id, width: canvas.width, height: canvas.height })
        }
      }
    }
    assertEqual(blankStepSamples.length, 0, `blank atmosphere bitmap sample(s) during the drag (${short(JSON.stringify(blankStepSamples.slice(0, 6)), 400)})`)
    const blankFrameSamples = (summary.ro ?? []).filter((sample) => sample.connected === true && sample.width > 0 && sample.height > 0 && sample.painted === 0)
    assertEqual(blankFrameSamples.length, 0,
      `the atmosphere canvas stayed blank right after a backing-store resize (missing synchronous repaint; ${short(JSON.stringify(blankFrameSamples.slice(0, 6)), 400)})`)
    const nonBlankFrame = (summary.ro ?? []).filter((sample) => sample.connected === true && sample.painted > 0)
    assert(nonBlankFrame.length >= 1, 'no in-frame atmosphere pixel sample was collected (the ResizeObserver instrumentation did not observe a canvas)')
    const oracleWrapper = `${oracle.wrapper} on ${oracle.currentWorkspace === true ? 'the current Workspace row' : 'the current Session row'}`
    return `dragged ${pre}px -> ${settled}px (${delta > 0 ? '+' : ''}${delta}px over ${steps.length} CDP steps); canvas ${oracle.id} (${oracleWrapper}) identity stable; ${resizeSteps.length} per-step backing-store resize(s) + ${inFrameResizes.length} in-frame resize sample(s); 0 blank of ${steps.length} per-step and ${(summary.ro ?? []).length} in-frame bitmap samples`
  })

  await results.check('lw-4', 'the dragged width is cached in localStorage and the client seam reports the attached, same width', async () => {
    const expected = state.layout.draggedWidth ?? null
    let width = expected
    if (width === null) {
      const facts = await readSidebarShell(page)
      width = sidebarWidthOf(facts)
    } else {
      width = await waitSidebarWidth(page, expected, { tolerance: 1, timeout: 4000, label: 'dragged sidebar width' })
    }
    assert(typeof width === 'number' && width > 0, 'the rendered sidebar width could not be measured after the drag (lw-3 failed first)')
    // The client debounces the save by 300 ms; poll for the cache write.
    let stateFacts = null
    let cache = null
    const deadline = Date.now() + 7000
    while (Date.now() < deadline) {
      stateFacts = await page.eval(probeLayout.sidebarWidthState)
      cache = parseSidebarWidthCache(stateFacts.cacheRaw)
      if (cache !== null && cache.sidebarWidth !== null && Math.abs(cache.sidebarWidth - width) <= 1) break
      await sleep(200)
    }
    assert(cache !== null, `localStorage['${SIDEBAR_WIDTH_STORAGE_KEY}'] is missing or malformed after the drag (raw ${short(stateFacts?.cacheRaw, 240)})`)
    assert(cache.sidebarWidth !== null, `the cached sidebar width is null after a real drag (raw ${short(stateFacts?.cacheRaw, 240)})`)
    assertNear(cache.sidebarWidth, width, 1, `the cached sidebar width must match the rendered width (cache ${cache.sidebarWidth}px vs rendered ${width}px)`)
    assertEqual(typeof cache.pending, 'boolean', `the cache "pending" flag must be a boolean (got ${typeof cache.pending})`)
    stateFacts = await page.eval(probeLayout.sidebarWidthState)
    assert(stateFacts.seamPresent === true, `the sidebar-width test seam is missing (__POWER_SUITE_TEST_HOOKS__.sidebarWidth absent; hooks ${short(JSON.stringify(stateFacts.seamKeys), 200)})`)
    assert(stateFacts.probe !== null && typeof stateFacts.probe === 'object', `the sidebar-width seam probe() failed (${short(stateFacts.seamError ?? 'returned nothing', 240)})`)
    const probeState = stateFacts.probe
    assertEqual(probeState.attached, true, 'the client feature is not attached to the shell layout store (probe().attached is false)')
    assert(Number.isFinite(probeState.storeWidth) && Math.abs(probeState.storeWidth - width) <= 1,
      `probe().storeWidth must equal the rendered width (probe ${probeState.storeWidth}px vs rendered ${width}px)`)
    assert(probeState.desiredWidth === null || (Number.isFinite(probeState.desiredWidth) && Math.abs(probeState.desiredWidth - width) <= 1),
      `probe().desiredWidth must equal the rendered width (probe ${probeState.desiredWidth}px vs rendered ${width}px)`)
    assert(probeState.cache !== null && typeof probeState.cache === 'object', 'probe().cache is missing')
    assertNear(probeState.cache.sidebarWidth, width, 1, `probe().cache.sidebarWidth must equal the rendered width (probe cache ${probeState.cache.sidebarWidth}px)`)
    state.layout.cacheAfterDrag = { raw: stateFacts.cacheRaw, parsed: cache }
    state.layout.seamAfterDrag = probeState
    return `cache ${short(stateFacts.cacheRaw, 160)}; probe attached=${probeState.attached} storeWidth=${probeState.storeWidth} desiredWidth=${probeState.desiredWidth} syncState=${probeState.syncState}`
  })

  await results.check('lw-5', 'a page reload restores the dragged width and the client re-attaches', async () => {
    const expected = state.layout.draggedWidth
    assert(typeof expected === 'number' && expected > 0, 'no dragged width was recorded (lw-3/lw-4 failed first); reload persistence cannot be asserted')
    await reloadFresh(page)
    await ensureAppReady(page)
    const restored = await waitSidebarWidth(page, expected, { tolerance: 1, timeout: 15000, label: 'sidebar width after reload' })
    // Let the boot apply/sync settle before reading the seam.
    await sleep(600)
    const stateFacts = await page.eval(probeLayout.sidebarWidthState)
    assert(stateFacts.seamPresent === true, 'the sidebar-width test seam is missing after the reload')
    assert(stateFacts.probe !== null && typeof stateFacts.probe === 'object', `the sidebar-width probe() is missing after the reload (${short(stateFacts.seamError ?? 'unknown', 200)})`)
    assertEqual(stateFacts.probe.attached, true, 'the client feature did not re-attach to the layout store after the reload')
    assert(Number.isFinite(stateFacts.probe.storeWidth) && Math.abs(stateFacts.probe.storeWidth - restored) <= 1,
      `probe().storeWidth after reload must match the restored width (probe ${stateFacts.probe.storeWidth}px vs rendered ${restored}px)`)
    const cache = parseSidebarWidthCache(stateFacts.cacheRaw)
    assert(cache !== null && cache.sidebarWidth !== null, `the width cache did not survive the reload (raw ${short(stateFacts.cacheRaw, 200)})`)
    assertNear(cache.sidebarWidth, restored, 1, 'the cached width after reload must stay the dragged width')
    await writeLayoutShot(page, 'layout-atmosphere-after-reload', unionRect((await page.eval(probeLayout.canvasPaint)).map((canvas) => canvas.rect)), state)
    state.layout.afterReload = { restored, probe: stateFacts.probe, cache }
    return `reload: sidebar ${restored}px; probe attached=${stateFacts.probe.attached} storeWidth=${stateFacts.probe.storeWidth} syncState=${stateFacts.probe.syncState}; cache ${short(stateFacts.cacheRaw, 160)}`
  })

  const hostProbe = await readHostSidebarWidth(page)
  state.layout.host = hostProbe
  if (hostProbe.status === 404) {
    state.sidebarWidthShared = false
    await results.skip('lw-6', 'the Host route round-trips the dragged width and a second fresh profile adopts it',
      'Host route loads after the DSH Web service restart — GET /api/power-suite.sidebar-width returned 404 (the running Host process predates the merged plugin). Until the restart the per-origin browser cache is authoritative (covered by lw-4/lw-5); the route round-trip and second-profile cross-device adoption are re-checked on the post-restart run.')
  } else {
    await results.check('lw-6', 'the Host route round-trips the dragged width and a second fresh profile adopts it', async () => {
      const dragged = state.layout.draggedWidth ?? null
      assert(typeof dragged === 'number' && dragged > 0, 'no dragged width was recorded (lw-3 failed first); the Host round-trip cannot be asserted')
      // The debounced Host write may still be in flight; poll briefly for the pushed value.
      let host = hostProbe
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        if (host.ok === true && host.payload !== null && typeof host.payload === 'object' && Number.isInteger(host.payload.sidebarWidth) && Math.abs(host.payload.sidebarWidth - dragged) <= 1) break
        await sleep(250)
        host = await readHostSidebarWidth(page)
      }
      assert(host.status === 200 && host.ok === true,
        `GET ${SIDEBAR_WIDTH_ROUTE_PATH} must return 200 once the route is live (got ${host.status ?? host.error ?? 'no response'}: ${short(JSON.stringify(host.payload), 160)})`)
      assert(host.payload !== null && typeof host.payload === 'object', `GET ${SIDEBAR_WIDTH_ROUTE_PATH} returned no JSON document`)
      assertEqual(host.payload.version, 1, `the Host document must be version 1 (got ${host.payload.version})`)
      assert(Number.isInteger(host.payload.sidebarWidth), `the Host document must carry an integer sidebarWidth (got ${JSON.stringify(host.payload.sidebarWidth)})`)
      assertNear(host.payload.sidebarWidth, dragged, 1, `the Host document width must equal the dragged width (Host ${host.payload.sidebarWidth}px vs dragged ${dragged}px)`)
      state.sidebarWidthShared = true
      state.layout.host = host
      const second = await withSecondProfile(state.guiUrl, state.clientSource, async (secondPage) => {
        let adopted = null
        let lastWidth = null
        const secondDeadline = Date.now() + 20000
        while (Date.now() < secondDeadline) {
          const facts = await readSidebarShell(secondPage)
          const width = sidebarWidthOf(facts)
          if (width !== null) lastWidth = width
          if (width !== null && Math.abs(width - dragged) <= 1) {
            adopted = { width }
            break
          }
          await sleep(250)
        }
        const seamFacts = await secondPage.eval(probeLayout.sidebarWidthState).catch(() => null)
        return {
          adopted,
          lastWidth,
          seam: seamFacts,
          pageErrors: [...secondPage.pageErrors],
          logEntries: [...secondPage.logEntries],
        }
      })
      assert(second.adopted !== null,
        `the second fresh profile did not adopt the Host width ${dragged}px ±1 (last rendered ${second.lastWidth ?? 'n/a'}px; cache ${short(second.seam?.cacheRaw, 200)}; probe ${short(JSON.stringify(second.seam?.probe), 240)})`)
      assertEqual(second.pageErrors.length, 0, `the second fresh profile reported page errors: ${short(JSON.stringify(second.pageErrors.slice(0, 4)), 400)}`)
      const secondProbe = second.seam?.probe ?? null
      if (secondProbe !== null && typeof secondProbe === 'object') {
        assertEqual(secondProbe.attached, true, 'the client feature is not attached in the second fresh profile')
      }
      const secondCache = second.seam === null ? null : parseSidebarWidthCache(second.seam.cacheRaw)
      if (secondCache !== null && secondCache.sidebarWidth !== null) {
        assertNear(secondCache.sidebarWidth, dragged, 1, 'the second profile cache must record the adopted width')
      }
      state.layout.secondProfile = { adopted: second.adopted, lastWidth: second.lastWidth, probe: secondProbe, cacheRaw: second.seam?.cacheRaw ?? null, pageErrors: second.pageErrors }
      return `Host GET 200 ${short(JSON.stringify(host.payload), 120)}; second fresh profile adopted ${second.adopted.width}px (probe attached=${secondProbe?.attached ?? 'n/a'}, cache ${short(second.seam?.cacheRaw, 160)}), 0 page errors (${second.logEntries.length} non-JS console/log entries)`
    })
  }

  await results.check('lw-8', 'collapsing and reopening the sidebar restores the stored width instead of the native 280 px default', async () => {
    const persisted = state.layout.draggedWidth ?? null
    assert(typeof persisted === 'number' && persisted > 0, 'no dragged width was recorded (lw-3/lw-4 failed first); the collapse/reopen restore cannot be asserted')
    // The shell exposes different controls per platform/presentation: the frame's
    // `shell.leading` opener for a fully hidden sidebar (macOS), the collapsed rail's
    // own toggle otherwise. Accept the first visible one from an ordered candidate list.
    const controlCentre = async (selectors) => page.eval((sels) => {
      for (const sel of sels) {
        for (const button of document.querySelectorAll(sel)) {
          const rect = button.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            return { selector: sel, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
          }
        }
      }
      return null
    }, selectors)
    const waitCollapsed = async (expected) => {
      const deadline = Date.now() + 8000
      let collapsed = null
      while (Date.now() < deadline) {
        const facts = await readSidebarShell(page)
        if (facts !== null) {
          collapsed = facts.collapsed
          if (collapsed === expected) return true
        }
        await sleep(150)
      }
      return false
    }
    // Collapse through the shell's own toggle, then reopen through the shell's
    // opener (frame `shell.leading` on macOS, the collapsed rail's own toggle
    // otherwise); both are normal user actions and the shell writes 0 -> 280 on
    // that cycle, so a stored-width result can only come from the feature's restore.
    const toggle = await controlCentre(['[data-sidebar-toggle]'])
    assert(toggle !== null, 'the shell sidebar toggle [data-sidebar-toggle] is missing')
    await page.clickAt(toggle.x, toggle.y)
    assert(await waitCollapsed(true), 'the sidebar did not collapse after clicking the shell toggle')
    const openerSelectors = ['[data-sidebar-opener]', '[data-sidebar-toggle]']
    let opener = await controlCentre(openerSelectors)
    assert(opener !== null, 'the collapsed sidebar exposes neither [data-sidebar-opener] nor a rail [data-sidebar-toggle]')
    // The 56 px rail expands on hover with a transition, so the button can move
    // between press and release; settle the pointer first and re-measure before clicking.
    await page.mouse({ type: 'mouseMoved', x: opener.x, y: opener.y })
    await sleep(350)
    opener = await controlCentre(openerSelectors)
    assert(opener !== null, 'the collapsed sidebar control disappeared after the hover settle')
    await page.clickAt(opener.x, opener.y)
    let reopenedBy = `real pointer click on ${opener.selector}`
    if (!(await waitCollapsed(false))) {
      // Deterministic fallback for this rail transition: activate the same control
      // with a DOM click so the restore behavior under test is still exercised. The
      // row detail records the fallback honestly.
      const clicked = await page.eval((sels) => {
        for (const sel of sels) {
          for (const element of document.querySelectorAll(sel)) {
            const rect = element.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              element.click()
              return sel
            }
          }
        }
        return null
      }, openerSelectors)
      reopenedBy = clicked === null ? 'no visible shell control' : `DOM click fallback on ${clicked}`
    }
    assert(await waitCollapsed(false), `the sidebar did not reopen after activating the shell opener (${reopenedBy})`)
    const reopened = await waitSidebarWidth(page, persisted, { tolerance: 1, timeout: 8000, label: 'stored sidebar width after reopening' })
    const facts = await readSidebarShell(page)
    assert(facts !== null && facts.collapsed === false, 'the sidebar reported collapsed again after reopening')
    // The restore is a store write, not a drag: it must not persist the native 280.
    await sleep(900)
    const seam = await page.eval(probeLayout.sidebarWidthState).catch(() => null)
    const cache = seam === null ? null : parseSidebarWidthCache(seam.cacheRaw)
    if (cache !== null && cache.sidebarWidth !== null) {
      assertNear(cache.sidebarWidth, persisted, 1, 'reopening must not persist the native 280 px default over the stored width')
    }
    state.layout.reopen = { collapsed: true, reopened, via: reopenedBy, cacheRaw: seam?.cacheRaw ?? null }
    return `collapsed via ${toggle.selector}, reopened via ${opener.selector} (${reopenedBy}) at the stored ${reopened}px (the native 280 px default was not accepted), cache ${short(seam?.cacheRaw, 120)}`
  })

  await results.check('lw-7', 'cleanup restores the pre-run width through the same drag and reports the residuals honestly', async () => {
    const pre = state.layout.preWidth
    assert(typeof pre === 'number' && pre > 0, 'the pre-run width is unknown (lw-1 failed first); the restore cannot be verified')
    let facts = await readSidebarShell(page)
    let current = sidebarWidthOf(facts)
    let restored = current
    const delta = current === null ? 0 : pre - current
    let restoreGesture = null
    if (current !== null && Math.abs(delta) > 1) {
      assert(pre >= SIDEBAR_WIDTH_MIN && pre <= SIDEBAR_WIDTH_MAX, `the pre-run width ${pre}px is outside the shell's ${SIDEBAR_WIDTH_MIN}..${SIDEBAR_WIDTH_MAX} drag range and cannot be restored through the handle`)
      restoreGesture = await dragSidebarHandle(page, { fromWidth: current, toWidth: pre, steps: SIDEBAR_DRAG_STEPS, settleMs: 20, label: 'sidebar restore drag' })
      restored = await waitSidebarWidth(page, pre, { tolerance: 1, timeout: 6000, label: 'sidebar width after the restore drag' })
    }
    // The restored width is persisted by the client's own 300 ms debounce.
    await sleep(900)
    const stateFacts = await page.eval(probeLayout.sidebarWidthState).catch(() => null)
    const cache = stateFacts === null ? null : parseSidebarWidthCache(stateFacts.cacheRaw)
    let host = await readHostSidebarWidth(page)
    const baselinePayload = state.layout.hostBaseline !== null && state.layout.hostBaseline !== undefined && state.layout.hostBaseline.payload !== null && typeof state.layout.hostBaseline.payload === 'object' ? state.layout.hostBaseline.payload : null
    const baselineHostWidth = baselinePayload !== null && Number.isInteger(baselinePayload.sidebarWidth) ? baselinePayload.sidebarWidth : null
    const hostWidthOf = (read) => read !== null && read.payload !== null && typeof read.payload === 'object' && Number.isInteger(read.payload.sidebarWidth) ? read.payload.sidebarWidth : null
    let hostRestore = null
    if (host.status === 200 && baselineHostWidth !== null && hostWidthOf(host) !== baselineHostWidth) {
      // Direct-route fallback: restore the pre-run Host document value even if the
      // debounced client write did not land.
      hostRestore = await postHostSidebarWidth(page, baselineHostWidth)
      await sleep(300)
      host = await readHostSidebarWidth(page)
    }
    const hostAfterWidth = hostWidthOf(host)
    const residualPieces = []
    if (host.status === 200) {
      if (baselineHostWidth !== null) {
        assertEqual(hostAfterWidth, baselineHostWidth, `the Host document was not restored to the pre-run width ${baselineHostWidth}px (got ${hostAfterWidth})`)
        residualPieces.push(`Host document restored to the pre-run ${baselineHostWidth}px ${hostRestore === null ? '' : `(direct POST fallback ${hostRestore.status})`}`.trim())
      } else {
        residualPieces.push(`Host document now ${hostAfterWidth === null ? 'has no width' : `holds the pre-run width ${hostAfterWidth}px`} (it was read as ${short(JSON.stringify(baselinePayload), 120)} after boot; the route's POST contract has no delete, so a boot-seeded document cannot be cleared)`)
      }
    } else {
      residualPieces.push(`Host route unavailable (${host.status ?? host.error ?? 'unknown'}); no Host document was written`)
    }
    if (cache !== null) residualPieces.push(`throwaway-profile cache ${short(stateFacts.cacheRaw, 160)}`)
    state.layoutCleanup = {
      preWidth: pre,
      restoredWidth: restored,
      restoreGesture,
      cacheRaw: stateFacts === null ? null : stateFacts.cacheRaw,
      cache,
      hostBaseline: state.layout.hostBaseline,
      hostAfter: host,
      hostRestore,
    }
    assertNear(restored, pre, 1, `the sidebar width was not restored to the pre-run ${pre}px (rendered ${restored}px)`)
    return `restored ${current}px -> ${restored}px (pre-run ${pre}px); ${residualPieces.join('; ')}`
  })
}

/**
 * Restore the pre-run sidebar width after `--layout`, through the same drag, and report
 * the residual browser cache and Host document honestly. Idempotent: a run that already
 * restored in lw-7 only re-measures and reports.
 * @param {object} page - Page wrapper.
 * @param {object} state - harness state with `layout`.
 * @returns {Promise<void>}
 */
async function cleanupSidebarWidth(page, state) {
  if (state.mode !== 'layout') return
  const issues = []
  let current = null
  const pre = state.layout?.preWidth ?? null
  try {
    const facts = await readSidebarShell(page)
    current = sidebarWidthOf(facts)
    if (pre !== null && current !== null && Math.abs(current - pre) > 1) {
      if (pre < SIDEBAR_WIDTH_MIN || pre > SIDEBAR_WIDTH_MAX) {
        issues.push(`pre-run width ${pre}px is outside the shell's drag range; not restorable through the handle`)
      } else {
        await dragSidebarHandle(page, { fromWidth: current, toWidth: pre, steps: SIDEBAR_DRAG_STEPS, settleMs: 20, label: 'cleanup restore drag' })
        current = await waitSidebarWidth(page, pre, { tolerance: 1, timeout: 6000, label: 'cleanup restored sidebar width' })
      }
    }
  } catch (error) {
    issues.push(`restore drag failed: ${(error && error.message) || String(error)}`)
  }
  try {
    await sleep(700)
    const stateFacts = await page.eval(probeLayout.sidebarWidthState).catch(() => null)
    const cache = stateFacts === null ? null : parseSidebarWidthCache(stateFacts.cacheRaw)
    let host = await readHostSidebarWidth(page)
    const baseline = state.layout?.hostBaseline ?? null
    const baselineWidth = baseline !== null && baseline.payload !== null && typeof baseline.payload === 'object' && Number.isInteger(baseline.payload.sidebarWidth) ? baseline.payload.sidebarWidth : null
    const hostWidth = host.payload !== null && typeof host.payload === 'object' && Number.isInteger(host.payload.sidebarWidth) ? host.payload.sidebarWidth : null
    let hostRestore = null
    if (host.status === 200 && baselineWidth !== null && hostWidth !== baselineWidth) {
      hostRestore = await postHostSidebarWidth(page, baselineWidth)
      await sleep(300)
      host = await readHostSidebarWidth(page)
    }
    const hostAfterWidth = host.payload !== null && typeof host.payload === 'object' && Number.isInteger(host.payload.sidebarWidth) ? host.payload.sidebarWidth : null
    const widthRestored = pre !== null && current !== null && Math.abs(current - pre) <= 1
    const hostRestored = host.status !== 200 || baselineWidth === null || hostAfterWidth === baselineWidth
    state.layoutCleanup = {
      preWidth: pre,
      restoredWidth: current,
      widthRestored,
      issues,
      cacheRaw: stateFacts === null ? null : stateFacts.cacheRaw,
      cache,
      hostBaseline: baseline,
      hostAfter: host,
      hostRestore,
      hostRestored,
    }
    log(`cleanup: sidebar width ${current === null ? 'unreadable' : `${current}px`} (pre-run ${pre === null ? 'n/a' : `${pre}px`}), restored=${widthRestored}; cache ${short(stateFacts?.cacheRaw ?? null, 200)}; host route ${host.status === 200 ? `200 ${short(JSON.stringify(host.payload), 200)} restored=${hostRestored}` : `unavailable (${host.status ?? host.error ?? 'unknown'})`}; issues ${issues.length}`)
    if (issues.length > 0) log(`cleanup issues: ${short(issues.join('; '), 500)}`)
  } catch (error) {
    issues.push(`residual reporting failed: ${(error && error.message) || String(error)}`)
    state.layoutCleanup = { ...(state.layoutCleanup ?? {}), preWidth: pre, restoredWidth: current, issues }
    log(`cleanup: residual reporting failed: ${short((error && error.message) || String(error), 400)}`)
  }
}

// --interrupted mode: interrupted-state consistency (controlled seam + real Host state)
// ---------------------------------------------------------------------------------------------

/** Page-side probes for the `--interrupted` checks (plain serializable functions). */
const probeIw = {
  /**
   * One read of every surface the fix touches: card rows (amber mark / Continue / time),
   * native Session rows (badge, injected Continue slot, hover reveal, stale spinner) and
   * the composer play control, plus the controlled-seam records.
   * @returns {object} serializable view facts.
   */
  view: () => {
    const text = (element) => (element === null || element === undefined ? null : (element.innerText || element.textContent || '').trim())
    const hooks = globalThis.__POWER_SUITE_TEST_HOOKS__
    const snapshot = hooks?.dynamicWorkspacesLive?.snapshot?.() ?? null
    const cardRows = [...document.querySelectorAll('.psd-run, .psd-child')].map((row) => {
      const main = row.classList.contains('psd-run')
      const glyphCell = row.querySelector(main ? '.psd-run-glyph-cell' : '.psd-child-glyph')
      const glyph = glyphCell === null ? null : glyphCell.querySelector('.psd-interrupted')
      const titleNode = row.querySelector(main ? '.psd-run-title' : '.psd-child-title')
      const timeNode = row.querySelector(main ? '.psd-run-time' : '.psd-child-time')
      return {
        kind: main ? 'main' : 'child',
        title: text(titleNode),
        state: row.getAttribute('data-state'),
        actions: row.getAttribute('data-actions'),
        current: row.getAttribute('aria-current'),
        interruptedGlyph: glyph !== null,
        interruptedAria: glyph === null ? null : glyph.getAttribute('aria-label'),
        interruptedColor: glyph === null ? null : getComputedStyle(glyph).color,
        continueSlot: row.querySelector('.psd-continue-slot') !== null,
        continueButton: row.querySelector('.psd-continue-inline') !== null,
        timeText: text(timeNode),
      }
    })
    const nativeRows = [...document.querySelectorAll('[data-row-key^="session:"]')].map((row) => {
      const key = row.getAttribute('data-row-key')
      const sessionId = key === null ? null : key.replace(/^session:/, '')
      const leading = [...row.children].find((child) => !child.hasAttribute('data-psd-atmos')) ?? null
      const badges = [...row.querySelectorAll('.dps-row-interrupted')]
      const slot = row.querySelector('.dps-row-continue-slot')
      const slotStyle = slot === null ? null : getComputedStyle(slot)
      const button = row.querySelector('.dps-row-continue')
      const buttonBox = button === null ? null : button.getBoundingClientRect()
      return {
        key,
        id: sessionId,
        text: (text(row) ?? '').slice(0, 80),
        hovered: row.matches(':hover'),
        interruptedAttr: row.hasAttribute('data-power-suite-interrupted'),
        badges: badges.length,
        badgeAria: badges.length === 0 ? null : badges[0].getAttribute('aria-label'),
        badgeOutsideAtmos: badges.length > 0 && badges.every((badge) => badge.closest('[data-psd-atmos]') === null),
        dynamicBadges: row.querySelectorAll('[data-dynamic-badge="true"]').length,
        slots: row.querySelectorAll('.dps-row-continue-slot').length,
        dynamicSlots: row.querySelectorAll('[data-dynamic-continue="true"]').length,
        buttons: row.querySelectorAll('.dps-row-continue').length,
        slot: slotStyle === null ? null : {
          width: Number.parseFloat(slotStyle.width),
          opacity: slotStyle.opacity,
          pointerEvents: slotStyle.pointerEvents,
        },
        button: button === null || buttonBox === null ? null : {
          width: Math.round(buttonBox.width),
          height: Math.round(buttonBox.height),
          aria: button.getAttribute('aria-label'),
          title: button.getAttribute('title'),
          svgs: button.querySelectorAll('svg').length,
        },
        leadingRunning: leading !== null && leading.querySelector('svg[data-state="ongoing"], [class*="spinner"]') !== null,
        leadingHasSlot: leading !== null && leading.querySelector('[data-slot="sidebar.session.row.leading"]') !== null,
      }
    })
    const scope = document.querySelector('[data-conversation-region="composer"]')
    const primary = scope === null ? null : scope.querySelector('button[class$="_primary"]')
    const pseudo = primary === null ? null : getComputedStyle(primary, '::before')
    return {
      hooks: hooks ? Object.keys(hooks) : null,
      hasInterruptedSeam: hooks !== undefined && hooks !== null && typeof hooks.interruptedSessions === 'object' && hooks.interruptedSessions !== null,
      snapshotRows: snapshot?.rows ?? null,
      currentSession: document.querySelector('[data-conversation-session]') === null ? null : document.querySelector('[data-conversation-session]').getAttribute('data-conversation-session'),
      htmlInterrupted: document.documentElement.getAttribute('data-power-suite-interrupted'),
      cardRows,
      nativeRows,
      composer: primary === null ? null : {
        aria: primary.getAttribute('aria-label'),
        title: primary.getAttribute('title'),
        disabled: primary.disabled === true,
        svgDisplay: primary.querySelector('svg') === null ? null : getComputedStyle(primary.querySelector('svg')).display,
        pseudoContent: pseudo?.content ?? null,
        pseudoMask: pseudo?.maskImage ?? pseudo?.webkitMaskImage ?? null,
        pseudoWidth: pseudo?.width ?? null,
        pseudoHeight: pseudo?.height ?? null,
      },
    }
  },

  /** Resolve the shell colour tokens used by the interrupted mark (warn vs label). */
  tokens: () => {
    const resolve = (value) => {
      const element = document.createElement('span')
      element.style.color = value
      document.body.appendChild(element)
      const color = getComputedStyle(element).color
      element.remove()
      return color
    }
    return {
      warn: resolve('var(--dsw-alias-state-warn-primary)'),
      label: resolve('var(--dsw-alias-label-primary)'),
      warnMix: resolve('color-mix(in srgb, var(--dsw-alias-state-warn-primary) 72%, var(--dsw-alias-label-primary))'),
    }
  },

  /** Read the controlled-seam records for `ids`. */
  records: (ids) => {
    const hook = globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions
    if (hook === undefined || hook === null) return { unavailable: true }
    const records = {}
    for (const id of ids) records[id] = hook.record(id) ?? null
    return { unavailable: false, records }
  },

  /** Seed one controlled interrupted record through the documented seam. */
  set: (payload) => {
    const hook = globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions
    if (hook === undefined || hook === null) return { unavailable: true }
    return { unavailable: false, record: hook.set(payload.id, payload.patch) }
  },

  /** Clear every given controlled record through the documented seam. */
  clear: (ids) => {
    const hook = globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions
    if (hook === undefined || hook === null) return { unavailable: true }
    for (const id of ids) hook.clear(id)
    return { unavailable: false, cleared: ids.length }
  },

  /** Scroll one native Session row into view and return its geometry + a hover point. */
  nativeRowPoint: (id) => {
    const row = document.querySelector(`[data-row-key="session:${id}"]`)
    if (row === null) return null
    row.scrollIntoView({ block: 'center' })
    const rect = row.getBoundingClientRect()
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hoverX: Math.round(rect.left + 60),
      hoverY: Math.round(rect.top + Math.round(rect.height / 2)),
    }
  },

  /** Query the live Host interrupted route for the given Session ids (same-origin fetch). */
  hostStates: async (ids) => {
    const states = {}
    for (const id of ids) {
      try {
        const response = await fetch(`/api/power-suite.interrupted?sessionId=${encodeURIComponent(id)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
        let payload = null
        try {
          payload = await response.json()
        } catch {
          payload = null
        }
        states[id] = { status: response.status, payload }
      } catch (error) {
        states[id] = { status: null, error: String((error && error.message) || error) }
      }
    }
    return states
  },
}

/**
 * @param {object} page - Page wrapper.
 * @returns {Promise<object | null>} the interrupted view facts (never throws).
 */
async function readInterruptedView(page) {
  try {
    return await page.eval(probeIw.view)
  } catch {
    return null
  }
}

/**
 * Poll the interrupted view until `predicate` accepts it.
 * @param {object} page - Page wrapper.
 * @param {Function} predicate - receives the view facts.
 * @param {object} [options] - timeout/interval/label.
 * @returns {Promise<object>} the matching view facts.
 */
async function waitInterruptedView(page, predicate, { timeout = 6000, interval = 150, label = 'interrupted view state' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const view = await readInterruptedView(page)
    if (view !== null) {
      last = view
      if (predicate(view)) return view
    }
    await sleep(interval)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label} (last view ${short(JSON.stringify(last === null ? null : { htmlInterrupted: last.htmlInterrupted, cardRows: last.cardRows, nativeRows: last.nativeRows.map((row) => ({ id: row.id, attr: row.interruptedAttr, badges: row.badges, slots: row.slots, dynamicSlots: row.dynamicSlots })) }), 900)})`)
}

/**
 * @param {object} view - interrupted view facts.
 * @param {string} title - exact rendered card-row title.
 * @returns {object | null} the rendered card row.
 */
function cardRowByTitle(view, title) {
  if (view === null || title === null || title === undefined) return null
  return view.cardRows.find((row) => row.title === title) ?? null
}

/**
 * @param {object} view - interrupted view facts.
 * @param {string} sessionId - Session id.
 * @returns {object | null} the rendered native row.
 */
function nativeRowById(view, sessionId) {
  if (view === null || sessionId === null || sessionId === undefined) return null
  return view.nativeRows.find((row) => row.id === sessionId) ?? null
}

/**
 * Build the title -> Session id map from the card's live seam and projection bridge.
 * @param {object} view - interrupted view facts.
 * @param {object | null} bridge - `probe.projectionBridge()` result.
 * @returns {{ byTitle: Map<string, string>, unique: (title: string) => string | null }} id lookup.
 */
function buildInterruptedIdMap(view, bridge) {
  const candidateLists = [[], view?.snapshotRows ?? []]
  if (bridge !== null && bridge.ok === true) {
    candidateLists.push(bridge.rows ?? [], bridge.children ?? [], bridge.domRows ?? [])
  }
  const titles = new Map()
  for (const list of candidateLists) {
    for (const row of list) {
      if (row === null || typeof row !== 'object') continue
      if (typeof row.title !== 'string' || row.title.length === 0) continue
      if (typeof row.id !== 'string' || row.id.length === 0) continue
      if (!titles.has(row.title)) titles.set(row.title, new Set())
      titles.get(row.title).add(row.id)
    }
  }
  const byTitle = new Map()
  for (const [title, ids] of titles) {
    if (ids.size === 1) byTitle.set(title, [...ids][0])
  }
  return {
    byTitle,
    unique: (title) => (byTitle.has(title) ? byTitle.get(title) : null),
  }
}

/**
 * Pick the card row the fix must turn into the interrupted presentation: a row the card
 * renders as running (the combined running state is what used to suppress the mark).
 * @param {object} view - interrupted view facts.
 * @param {object} idMap - title/id map.
 * @returns {{ kind: string, title: string, id: string, state: string } | null} the target.
 */
function pickCardRunningTarget(view, idMap) {
  const running = view.cardRows.filter((row) => row.state === 'running')
  const ordered = [
    ...running.filter((row) => row.current === 'true'),
    ...running.filter((row) => row.kind === 'main'),
    ...running,
  ]
  for (const row of ordered) {
    const id = idMap.unique(row.title)
    if (id === null) continue
    return { kind: row.kind, title: row.title, id, state: row.state }
  }
  return null
}

/**
 * Pick a native Session row the shell still renders as running (its leading cell shows
 * the shell spinner and no custom leading slot) — the stale-running branch of the fix.
 * @param {object} view - interrupted view facts.
 * @param {string | null} preferredId - Session id to prefer (the card target).
 * @returns {object | null} the native row facts.
 */
function pickNativeStaleRunningTarget(view, preferredId) {
  const candidates = view.nativeRows.filter((row) => row.leadingRunning === true && row.leadingHasSlot === false)
  if (preferredId !== null) {
    const preferred = candidates.find((row) => row.id === preferredId)
    if (preferred !== undefined) return preferred
  }
  return candidates[0] ?? null
}

/**
 * Write one optional screenshot into the gitignored `--interrupted` evidence directory.
 * @returns {Promise<string | null>} the file path, or null when disabled/failed.
 */
async function writeInterruptedShot(page, name, clip, state) {
  if (state.shotsEnabled !== true || clip === null || clip === undefined) return null
  try {
    await mkdir(INTERRUPTED_EVIDENCE_DIR, { recursive: true })
    const x = Math.max(0, Math.round(clip.left))
    const y = Math.max(0, Math.round(clip.top))
    const width = Math.min(Math.round(clip.width), VIEWPORT.width - x)
    const height = Math.min(Math.round(clip.height), VIEWPORT.height - y)
    if (width < 8 || height < 8) return null
    const file = path.join(INTERRUPTED_EVIDENCE_DIR, `${name}.png`)
    await page.screenshot(file, { x, y, width, height })
    log(`wrote ${file}`)
    state.interruptedEvidence = [...(state.interruptedEvidence ?? []), file]
    return file
  } catch (error) {
    log(`warning: interrupted screenshot ${name} failed: ${short((error && error.message) || String(error), 200)}`)
    return null
  }
}

/**
 * Write one JSON evidence file (controlled-seam view snapshots) into the gitignored
 * `--interrupted` evidence directory. The token is never included.
 * @returns {Promise<string | null>} the file path, or null when the write failed.
 */
async function writeInterruptedEvidence(state, name, data) {
  try {
    await mkdir(INTERRUPTED_EVIDENCE_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
    const file = path.join(INTERRUPTED_EVIDENCE_DIR, `interrupted-${name}-${stamp}.json`)
    await writeFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...data }, null, 2)}\n`, 'utf8')
    log(`wrote ${file}`)
    state.interruptedEvidence = [...(state.interruptedEvidence ?? []), file]
    return file
  } catch (error) {
    log(`warning: could not write interrupted evidence ${name}: ${short((error && error.message) || String(error), 200)}`)
    return null
  }
}

/**
 * Assert the amber interrupted mark: the `.psd-interrupted` glyph is the warn-coloured
 * warning icon with the localized badge label. The current-row theme recipe mixes the
 * warn token with the label colour, so that variant is accepted there.
 * @param {object} row - rendered card row facts.
 * @param {object | null} tokens - resolved shell colour tokens.
 * @param {string} label - row description for failure messages.
 * @returns {string} measured summary.
 */
function assertInterruptedGlyph(row, tokens, label) {
  assert(row.interruptedGlyph === true, `${label}: the card row renders no amber .psd-interrupted glyph`)
  assert(INTERRUPTED_BADGE_LABEL.test(row.interruptedAria ?? ''), `${label}: the interrupted glyph must carry the localized Badge label (got ${JSON.stringify(row.interruptedAria)})`)
  if (tokens !== null && row.interruptedColor !== null) {
    const currentRow = row.current === 'true'
    const colours = currentRow ? [tokens.warn, tokens.warnMix] : [tokens.warn]
    assert(colours.includes(row.interruptedColor),
      `${label}: the interrupted glyph must use the warn token (got ${row.interruptedColor}; expected ${currentRow ? `${tokens.warn} or ${tokens.warnMix}` : tokens.warn})`)
    assert(row.interruptedColor !== tokens.label, `${label}: the interrupted glyph must not fall back to the label colour`)
  }
  return `.psd-interrupted "${row.interruptedAria}" ${row.interruptedColor}`
}

/**
 * Assert the card row's Continue affordance: the row exposes the continue action, and a
 * main row renders the hover-revealed `.psd-continue-slot` / `.psd-continue-inline`
 * button carrying the localized continue label and one play glyph.
 * @param {object} row - rendered card row facts.
 * @param {string} label - row description for failure messages.
 * @returns {string} measured summary.
 */
function assertInterruptedCardAction(row, label) {
  assert((row.actions ?? '').split(/[+,]/u).includes('continue'), `${label}: the card row must expose the continue action (data-actions ${JSON.stringify(row.actions)})`)
  if (row.kind !== 'main') return `data-actions ${row.actions}`
  assert(row.continueSlot === true, `${label}: the main card row must render the .psd-continue-slot affordance`)
  assert(row.continueButton === true, `${label}: the main card row must render the .psd-continue-inline Continue button`)
  return `data-actions ${row.actions} + .psd-continue-slot/.psd-continue-inline`
}

/**
 * `--interrupted`: accept the interrupted-state consistency fix through the documented
 * controlled seam and the live Host route.
 * @param {object} input - `{ page, results, state }`.
 * @returns {Promise<void>}
 */
async function runInterruptedModeChecks({ page, results, state }) {
  log('\n=== --interrupted: interrupted-state consistency (card / native row / composer) ===')
  state.mode = 'interrupted'
  state.interrupted = { controlled: [], cardTarget: null, nativeTarget: null, currentSession: state.sessionId ?? null }
  const tokens = await page.eval(probeIw.tokens).catch(() => null)
  state.interrupted.tokens = tokens

  await results.check('iw-net', 'CDP Network domain enabled (real network-failure oracle)', async () => {
    assert(page.networkEnabled === true, `Network.enable failed: ${page.networkError || 'unknown error'}`)
    return 'Network domain enabled; same-origin API/document failures are counted (the interrupted route must answer 200)'
  })

  // Expand the card's five-row default like a user, then read every surface.
  await ensurePanelRows(page)
  await resetPointer(page)
  const bridge = await page.eval(probe.projectionBridge).catch(() => null)
  const baselineView = await waitInterruptedView(page, (view) => view.hasInterruptedSeam === true && view.cardRows.length > 0, { timeout: 15000, label: 'interrupted seam + card rows' })
  const idMap = buildInterruptedIdMap(baselineView, bridge)
  const cardTarget = pickCardRunningTarget(baselineView, idMap)
  const nativeTarget = pickNativeStaleRunningTarget(baselineView, cardTarget === null ? null : cardTarget.id)
  state.interrupted.cardTarget = cardTarget
  state.interrupted.nativeTarget = nativeTarget === null ? null : { id: nativeTarget.id, key: nativeTarget.key }
  state.interrupted.currentSession = baselineView.currentSession ?? state.sessionId ?? null
  state.interrupted.baseline = {
    cardRow: cardTarget === null ? null : cardRowByTitle(baselineView, cardTarget.title),
    nativeRow: nativeTarget === null ? null : nativeTarget,
    composer: baselineView.composer,
    htmlInterrupted: baselineView.htmlInterrupted,
  }
  const seamState = await page.eval(() => {
    const hooks = globalThis.__POWER_SUITE_TEST_HOOKS__
    return {
      interruptedSessions: hooks !== undefined && hooks !== null && hooks.interruptedSessions !== undefined && hooks.interruptedSessions !== null ? Object.keys(hooks.interruptedSessions) : null,
    }
  }).catch(() => null)
  state.interrupted.seams = seamState
  log(`interrupted seams: ${short(JSON.stringify(seamState), 220)}`)
  log(`interrupted baseline: current Session ${state.interrupted.currentSession ?? 'n/a'}; card running target ${cardTarget === null ? 'none' : `${cardTarget.kind} "${short(cardTarget.title, 60)}" (${cardTarget.id})`}; native stale-running target ${nativeTarget === null ? 'none' : nativeTarget.id}; composer ${short(JSON.stringify(baselineView.composer), 220)}`)
  await writeInterruptedEvidence(state, 'baseline', { view: baselineView, cardTarget, nativeTarget })

  if (cardTarget === null) {
    const reason = 'no card row is rendered as running in this live data state, so the "interrupted mark beats the combined running state" scenario cannot be produced without fabricating activity; the mode creates no Session and types nothing. Start or keep a running Session and rerun.'
    await results.skip('iw-1', 'card interrupted mark beats the combined running state', reason)
    await results.skip('iw-2', 'native stale-running row shows the badge and the hover Continue CTA', reason)
    state.interrupted.skipped = true
  }

  if (cardTarget !== null) {
    await results.check('iw-1', 'card interrupted mark beats the combined running state (amber glyph + Continue + relative time)', async () => {
      assert(cardTarget.kind === 'main' || cardTarget.kind === 'child', 'card target has no row kind')
      const seeded = await page.eval(probeIw.set, { id: cardTarget.id, patch: { interrupted: true, running: false } })
      assert(seeded.unavailable !== true, 'the interrupted test seam is unavailable (window.__POWER_SUITE_TEST_HOOKS__.interruptedSessions)')
      state.interrupted.controlled.push(cardTarget.id)
      const view = await waitInterruptedView(page,
        (next) => {
          const row = cardRowByTitle(next, cardTarget.title)
          return row !== null && row.interruptedGlyph === true && (row.actions ?? '').includes('continue') && (row.kind !== 'main' || row.continueButton === true)
        },
        { timeout: 8000, label: `card interrupted mark on "${short(cardTarget.title, 50)}"` })
      const row = cardRowByTitle(view, cardTarget.title)
      assert(row !== null, `the card row "${short(cardTarget.title, 50)}" disappeared`)
      const glyphDetail = assertInterruptedGlyph(row, tokens, `${row.kind} card row "${short(row.title, 50)}"`)
      const actionDetail = assertInterruptedCardAction(row, `${row.kind} card row "${short(row.title, 50)}"`)
      let timeDetail = `child rows always show the relative last-activity time (${JSON.stringify(row.timeText)})`
      if (row.kind === 'main') {
        const relativePattern = /^(now|\d+min|\d+h|\d+d|刚刚|\d+分钟|\d+小时|\d+天)$/u
        const durationPattern = /^(\d+s|\d+m \d+s|\d+h \d+m|\d+秒|\d+分\d+秒|\d+时\d+分)$/u
        assert(relativePattern.test(row.timeText ?? ''), `main card row: the interrupted time must be a relative last-activity label, got ${JSON.stringify(row.timeText)}`)
        assert(!durationPattern.test(row.timeText ?? ''), `main card row: the interrupted time must not be a running duration, got ${JSON.stringify(row.timeText)}`)
        timeDetail = `time ${JSON.stringify(row.timeText)} (relative, not a running duration)`
      }
      const records = await page.eval(probeIw.records, [cardTarget.id])
      assert(records.unavailable !== true, 'the interrupted test seam is unavailable')
      const record = records.records[cardTarget.id]
      assert(record !== null && record !== undefined && record.status === 'ready' && record.interrupted === true && record.running === false,
        `the controlled record must stay interrupted-idle (got ${short(JSON.stringify(record), 240)})`)
      if (state.shotsEnabled) {
        const rect = await page.eval((title) => {
          const row = [...document.querySelectorAll('.psd-run, .psd-child')]
            .find((node) => ((node.querySelector('.psd-run-title, .psd-child-title')?.innerText ?? '').trim()) === title)
          if (row === null) return null
          const box = row.getBoundingClientRect()
          return { left: Math.round(box.left) - 8, top: Math.round(box.top) - 8, width: Math.round(box.width) + 16, height: Math.round(box.height) + 16 }
        }, cardTarget.title)
        await writeInterruptedShot(page, 'iw1-card-interrupted', rect, state)
      }
      return `${row.kind} row "${short(row.title, 60)}" (data-state=${row.state}, combined running): ${glyphDetail}; ${actionDetail}; ${timeDetail}; record ${record.status}/interrupted=${record.interrupted}/running=${record.running}`
    })

    if (nativeTarget === null) {
      await results.skip('iw-2', 'native stale-running row shows the badge and the hover Continue CTA', 'no native Session row is rendered as running (stale spinner) in this live data state, so the decoration branch cannot be exercised; the card-side iw-1 still covers the controlled record.')
    } else {
      await results.check('iw-2', 'native stale-running row shows the badge and the hover Continue CTA (real pointer, never clicked)', async () => {
        if (nativeTarget.id !== cardTarget.id) {
          await page.eval(probeIw.set, { id: nativeTarget.id, patch: { interrupted: true, running: false } })
          state.interrupted.controlled.push(nativeTarget.id)
        }
        state.interrupted.nativeTarget = { id: nativeTarget.id, key: nativeTarget.key }
        const seededView = await waitInterruptedView(page,
          (next) => {
            const row = nativeRowById(next, nativeTarget.id)
            return row !== null && row.interruptedAttr === true && row.badges >= 1 && row.dynamicBadges >= 1 && row.dynamicSlots >= 1
          },
          { timeout: 8000, label: `native interrupted badge + injected Continue slot on ${nativeTarget.id}` })
        const seededRow = nativeRowById(seededView, nativeTarget.id)
        assert(seededRow !== null, `the native row for ${nativeTarget.id} disappeared`)
        assert(seededRow.badgeOutsideAtmos === true, 'the interrupted badge must sit in the native leading cell, never inside the atmosphere layer')
        assert(INTERRUPTED_BADGE_LABEL.test(seededRow.badgeAria ?? ''), `the native badge must carry the localized interrupted label (got ${JSON.stringify(seededRow.badgeAria)})`)
        assert(seededRow.buttons >= 1, 'the injected Continue slot must contain the .dps-row-continue button')
        const point = await page.eval(probeIw.nativeRowPoint, nativeTarget.id)
        assert(point !== null, `the native row for ${nativeTarget.id} is not in the DOM`)
        assert(point.hoverY > 4 && point.hoverY < VIEWPORT.height - 4, `the native row for ${nativeTarget.id} is outside the viewport (y=${point.hoverY})`)
        await page.moveTo(900, 500)
        await sleep(220)
        // Real CDP pointer hover: the fix's reveal rule needs :hover. Never click.
        await page.moveTo(point.hoverX, point.hoverY)
        await sleep(420)
        const hoveredView = await waitInterruptedView(page,
          (next) => {
            const row = nativeRowById(next, nativeTarget.id)
            return row !== null && row.hovered === true && row.slot !== null && row.slot.opacity === '1'
          },
          { timeout: 5000, label: `native Continue CTA reveal on ${nativeTarget.id}` })
        const hovered = nativeRowById(hoveredView, nativeTarget.id)
        assert(hovered !== null, `the native row for ${nativeTarget.id} disappeared on hover`)
        assert(hovered.hovered === true, 'the real pointer must hover the native Session row')
        assert(hovered.slot !== null, 'the native row has no .dps-row-continue-slot on hover')
        assertNear(hovered.slot.width, 22, 0.5, 'the hover Continue slot must reveal to 22 px')
        assertEqual(hovered.slot.opacity, '1', 'the hover Continue slot must be fully visible (opacity 1)')
        assertEqual(hovered.slot.pointerEvents, 'auto', 'the hover Continue slot must accept the pointer (pointer-events auto)')
        assert(hovered.button !== null, 'the hovered Continue slot has no .dps-row-continue button')
        assertNear(hovered.button.width, 22, 0.5, 'the native Continue button must fill the 22 px slot')
        assertNear(hovered.button.height, 22, 0.5, 'the native Continue button must be a 22 px hit target')
        assert(INTERRUPTED_CONTINUE_LABEL.test(hovered.button.aria ?? ''), `the native Continue button must carry the localized label (got ${JSON.stringify(hovered.button.aria)})`)
        assertEqual(hovered.button.svgs, 1, 'the native Continue button must render exactly one play glyph')
        assert(hovered.interruptedAttr === true, 'the hovered native row must keep the interrupted marker attribute')
        assert(hovered.dynamicSlots >= 1, 'the Continue slot must be the decoration-injected one (data-dynamic-continue=true), proving the stale-running branch ran')
        if (state.shotsEnabled) {
          await writeInterruptedShot(page, 'iw2-native-hover-continue', {
            left: point.left - 10,
            top: point.top - 6,
            width: point.width + 20,
            height: point.height + 12,
          }, state)
        }
        await page.moveTo(900, 500)
        await sleep(200)
        return `native row ${nativeTarget.id} (${short(nativeTarget.text, 50)}): badge ${seededRow.badges} + ${seededRow.dynamicBadges} dynamic, Continue slot ${hovered.slot.width}px/opacity ${hovered.slot.opacity}/${hovered.slot.pointerEvents}, button ${hovered.button.width}x${hovered.button.height} "${hovered.button.aria}" 1 glyph; hover via real CDP pointer, never clicked`
      })
    }
  }

  await results.check('iw-3', 'composer shows the play (Continue) state for the controlled interrupted current Session', async () => {
    const currentSession = state.interrupted.currentSession
    assert(typeof currentSession === 'string' && currentSession.length > 0, 'no current Session is open (the composer seat needs one)')
    const seeded = await page.eval(probeIw.set, { id: currentSession, patch: { interrupted: true, running: false } })
    assert(seeded.unavailable !== true, 'the interrupted test seam is unavailable')
    if (!state.interrupted.controlled.includes(currentSession)) state.interrupted.controlled.push(currentSession)
    const view = await waitInterruptedView(page, (next) => next.htmlInterrupted === 'true' && next.composer !== null && next.composer.svgDisplay === 'none', {
      timeout: 8000,
      label: 'composer play state for the interrupted current Session',
    })
    assertEqual(view.htmlInterrupted, 'true', 'html[data-power-suite-interrupted="true"] must mark the interrupted composer state')
    assert(view.composer !== null, 'the composer primary submit control is missing')
    assertEqual(view.composer.disabled, false, 'the interrupted composer submit control must be enabled (the shell disables an empty draft)')
    assert(INTERRUPTED_CONTINUE_LABEL.test(view.composer.aria ?? ''), `the composer submit control must be relabelled Continue (got ${JSON.stringify(view.composer.aria)})`)
    assert(INTERRUPTED_CONTINUE_LABEL.test(view.composer.title ?? ''), `the composer submit control must carry the Continue tooltip (got ${JSON.stringify(view.composer.title)})`)
    assertEqual(view.composer.svgDisplay, 'none', 'the shell send glyph must be hidden while the play control is shown')
    assert(view.composer.pseudoMask !== null && view.composer.pseudoMask !== 'none', `the play triangle must be painted through the ::before mask (got ${JSON.stringify(view.composer.pseudoMask)})`)
    assertNear(Number.parseFloat(view.composer.pseudoWidth), 16, 0.5, 'the play triangle mask must be 16 px wide')
    assertNear(Number.parseFloat(view.composer.pseudoHeight), 16, 0.5, 'the play triangle mask must be 16 px tall')
    if (state.shotsEnabled) {
      const rect = await page.eval(() => {
        const scope = document.querySelector('[data-conversation-region="composer"]')
        if (scope === null) return null
        const box = scope.getBoundingClientRect()
        const send = scope.querySelector('button[class$="_primary"]')
        const sendBox = send === null ? null : send.getBoundingClientRect()
        const anchor = sendBox ?? box
        return {
          left: Math.round(anchor.left) - 90,
          top: Math.round(anchor.top) - 20,
          width: Math.round(anchor.width) + 120,
          height: Math.round(anchor.height) + 40,
        }
      })
      await writeInterruptedShot(page, 'iw3-composer-play', rect, state)
    }
    return `current Session ${currentSession}: html marker true, composer "${view.composer.aria}" enabled=${!view.composer.disabled}, shell svg ${view.composer.svgDisplay}, play mask ${view.composer.pseudoWidth}x${view.composer.pseudoHeight}`
  })

  await results.check('iw-4', 'clearing the controlled records restores the card, native row and composer surfaces', async () => {
    const controlled = [...state.interrupted.controlled]
    assert(controlled.length > 0, 'no controlled record was seeded (iw-1/iw-2/iw-3 failed or skipped first)')
    const cleared = await page.eval(probeIw.clear, controlled)
    assert(cleared.unavailable !== true, 'the interrupted test seam is unavailable')
    const view = await waitInterruptedView(page,
      (next) => {
        if (next.htmlInterrupted !== null) return false
        const recordsGone = controlled.every((id) => {
          const row = nativeRowById(next, id)
          return row === null || (row.interruptedAttr === false && row.badges === 0 && row.dynamicBadges === 0 && row.dynamicSlots === 0)
        })
        const cardGone = cardTarget === null || (() => {
          const row = cardRowByTitle(next, cardTarget.title)
          return row === null || (row.interruptedGlyph === false && row.continueSlot === false)
        })()
        const composerGone = next.composer === null || (next.composer.svgDisplay !== 'none' && next.composer.pseudoMask === 'none')
        return recordsGone && cardGone && composerGone
      },
      { timeout: 8000, label: 'cleared interrupted surfaces' })
    const records = await page.eval(probeIw.records, controlled)
    assert(records.unavailable !== true, 'the interrupted test seam is unavailable')
    // The client may re-fetch a row's real Host record right after the clear; that is the
    // authoritative behavior, so only a still-interrupted-idle record is a residual.
    const stillActive = []
    const refetched = []
    for (const id of controlled) {
      const record = records.records[id]
      if (record === null || record === undefined) continue
      refetched.push(id)
      if (record.status === 'ready' && record.interrupted === true && record.running !== true) stillActive.push({ id, record })
    }
    assertEqual(stillActive.length, 0, `controlled interrupted-idle record(s) survived the clear: ${short(JSON.stringify(stillActive), 600)}`)
    assertEqual(view.htmlInterrupted, null, 'the html interrupted marker must be removed after clear')
    for (const id of controlled) {
      const row = nativeRowById(view, id)
      if (row === null) continue
      assertEqual(row.interruptedAttr, false, `native row ${id} must drop the interrupted marker after clear`)
      assertEqual(row.badges, 0, `native row ${id} must not keep an interrupted badge after clear`)
      assertEqual(row.dynamicBadges, 0, `native row ${id} must not keep an injected badge after clear`)
      assertEqual(row.dynamicSlots, 0, `native row ${id} must not keep an injected Continue slot after clear`)
    }
    if (cardTarget !== null) {
      const row = cardRowByTitle(view, cardTarget.title)
      if (row !== null) {
        assertEqual(row.interruptedGlyph, false, 'the card row must drop the interrupted glyph after clear')
        assertEqual(row.continueSlot, false, 'the card row must drop the Continue affordance after clear')
        const baselineActions = state.interrupted.baseline.cardRow?.actions ?? null
        if (baselineActions !== null) assertEqual(row.actions, baselineActions, 'the card row action attribute must return to its baseline after clear')
      }
    }
    assert(view.composer !== null, 'the composer primary submit control is missing after clear')
    const baselineSvgDisplay = state.interrupted.baseline.composer?.svgDisplay ?? null
    assertEqual(view.composer.svgDisplay, baselineSvgDisplay === null ? 'block' : baselineSvgDisplay, 'the shell send glyph must return to its baseline display after clear')
    assertEqual(view.composer.pseudoMask, 'none', 'the play triangle mask must be gone after clear')
    // The seat's attribute restore relies on the shell's next render; report any residual
    // label honestly instead of asserting an ownership the fix does not claim.
    const composerResidual = {
      aria: view.composer.aria,
      title: view.composer.title,
      baselineAria: state.interrupted.baseline.composer?.aria ?? null,
    }
    await writeInterruptedEvidence(state, 'after-clear', { view, controlled, composerResidual })
    return `cleared ${controlled.length} controlled record(s); no interrupted marker/badge/injected slot on their native rows or the card row; html marker removed; composer shell glyph restored (${composerResidual.aria === composerResidual.baselineAria ? 'label back to baseline' : `label residual "${composerResidual.aria}" until the shell rerenders`}); ${refetched.length} record(s) re-fetched from the Host with the real state afterwards (the authoritative behavior)`
  })

  const realState = await collectInterruptedRealState(page)
  state.interrupted.realStateRows = realState.interruptedIdle
  await writeInterruptedEvidence(state, 'real-state', {
    hostStates: realState.hostStates,
    checks: realState.checks,
    problems: realState.problems,
    ids: realState.ids,
  })
  if (realState.interruptedIdle === 0) {
    await results.skip('iw-5', 'real-state consistency: Host-interrupted visible Sessions render the interrupted mark/CTA',
      `no Session the card/native sidebar renders is interrupted-idle in this live data state (checked ${realState.ids.length} visible Session(s) against GET ${INTERRUPTED_ROUTE_PATH}); the controlled iw-1/iw-2 rows cover the fix.`)
  } else {
    await results.check('iw-5', 'real-state consistency: Host-interrupted visible Sessions render the interrupted mark/CTA', async () => {
      assertEqual(realState.problems.length, 0, `Host-interrupted visible Session(s) without the rendered interrupted mark: ${short(JSON.stringify(realState.problems), 700)}`)
      return `Host route checked ${realState.ids.length} visible Session(s); ${realState.interruptedIdle} interrupted-idle: ${short(JSON.stringify(realState.checks), 900)}`
    })
  }
}

/**
 * Collect the real-state consistency facts for every Session the card/native sidebar
 * renders: query the Host interrupted route and verify each genuinely interrupted-idle
 * Session renders the interrupted mark (card glyph / native badge) on a rendered surface.
 * @param {object} page - Page wrapper.
 * @returns {Promise<object>} `{ ids, hostStates, checks, problems, interruptedIdle }`.
 */
async function collectInterruptedRealState(page) {
  const view = await waitInterruptedView(page, (next) => next.hasInterruptedSeam === true, { timeout: 5000, label: 'interrupted view for real-state consistency' })
  const bridge = await page.eval(probe.projectionBridge).catch(() => null)
  const idMap = buildInterruptedIdMap(view, bridge)
  const currentSession = view.currentSession ?? null
  const rendered = []
  for (const row of view.cardRows) {
    const id = idMap.unique(row.title)
    if (id === null) continue
    rendered.push({ surface: 'card', kind: row.kind, id, title: row.title })
  }
  for (const row of view.nativeRows) {
    if (typeof row.id !== 'string' || row.id.length === 0) continue
    rendered.push({ surface: 'native', kind: 'native', id: row.id, title: row.text })
  }
  if (typeof currentSession === 'string' && currentSession.length > 0 && !rendered.some((entry) => entry.id === currentSession)) {
    rendered.push({ surface: 'composer', kind: 'composer', id: currentSession, title: `current Session ${currentSession}` })
  }
  const ids = [...new Set(rendered.map((entry) => entry.id))]
  assert(ids.length > 0, 'the card/native sidebar renders no identifiable Session row in this live data state')
  const hostStates = await page.eval(probeIw.hostStates, ids)
  const checks = []
  const problems = []
  let interruptedIdle = 0
  for (const id of ids) {
    const hostState = hostStates[id]
    if (hostState === undefined || hostState.status !== 200 || hostState.payload === null || typeof hostState.payload !== 'object') {
      problems.push(`${id.slice(0, 12)}...: Host route ${hostState === undefined ? 'not probed' : hostState.status ?? hostState.error ?? 'no response'}`)
      continue
    }
    const isInterruptedIdle = hostState.payload.interrupted === true && hostState.payload.running === false
    if (!isInterruptedIdle) continue
    interruptedIdle += 1
    const marks = []
    for (const entry of rendered.filter((candidate) => candidate.id === id)) {
      if (entry.surface === 'card') {
        const row = cardRowByTitle(view, entry.title)
        if (row === null) continue
        marks.push({
          surface: `card-${row.kind}`,
          mark: row.interruptedGlyph === true,
          action: (row.actions ?? '').includes('continue'),
          detail: `card ${row.kind} glyph=${row.interruptedGlyph} actions=${JSON.stringify(row.actions)}`,
        })
      } else if (entry.surface === 'native') {
        const row = nativeRowById(view, id)
        if (row === null) continue
        marks.push({
          surface: 'native',
          mark: row.badges > 0 || row.dynamicBadges > 0,
          action: row.slots > 0 || row.dynamicSlots > 0 || row.leadingHasSlot === true,
          detail: `native attr=${row.interruptedAttr} badges=${row.badges}+${row.dynamicBadges} slots=${row.slots}+${row.dynamicSlots}`,
        })
      } else if (entry.surface === 'composer' && view.htmlInterrupted === 'true') {
        marks.push({ surface: 'composer', mark: true, action: true, detail: `composer html marker ${view.htmlInterrupted}` })
      }
    }
    if (marks.length === 0) {
      problems.push(`${id.slice(0, 12)}...: Host says interrupted-idle but no rendered surface was identifiable`)
      continue
    }
    if (!marks.some((mark) => mark.mark === true)) {
      problems.push(`${id.slice(0, 12)}...: Host says interrupted-idle but no rendered surface shows the interrupted mark (${marks.map((mark) => mark.detail).join('; ')})`)
      continue
    }
    const withAction = marks.filter((mark) => mark.action === true)
    checks.push(`${id.slice(0, 12)}... interrupted-idle -> ${marks.map((mark) => mark.detail).join('; ')}${withAction.length > 0 ? '' : ' (mark only on the rendered surface(s))'}`)
  }
  return { ids, hostStates, checks, problems, interruptedIdle }
}

/**
 * Clear every controlled interrupted record after `--interrupted` and report the residual
 * records/markers honestly. Idempotent (iw-4 already clears on the happy path).
 * @param {object} page - Page wrapper.
 * @param {object} state - harness state with `interrupted`.
 * @returns {Promise<void>}
 */
async function cleanupInterruptedMode(page, state) {
  if (state.mode !== 'interrupted') return
  const controlled = [...(state.interrupted?.controlled ?? [])]
  const issues = []
  try {
    if (controlled.length > 0) {
      const cleared = await page.eval(probeIw.clear, controlled)
      if (cleared.unavailable === true) issues.push('interrupted test seam unavailable during cleanup')
    }
    await sleep(500)
    const records = controlled.length === 0 ? { unavailable: false, records: {} } : await page.eval(probeIw.records, controlled)
    const residualRecords = controlled.filter((id) => {
      const record = records.unavailable === true ? null : records.records[id]
      return record !== null && record !== undefined && record.status === 'ready' && record.interrupted === true && record.running !== true
    })
    const view = await readInterruptedView(page)
    const markerResidual = view === null ? null : view.nativeRows
      .filter((row) => controlled.includes(row.id) && (row.badges > 0 || row.interruptedAttr === true || row.slots > 0))
      .map((row) => row.id)
    const cardResidual = view === null || state.interrupted?.cardTarget === null || state.interrupted?.cardTarget === undefined
      ? null
      : (() => {
          const row = cardRowByTitle(view, state.interrupted.cardTarget.title)
          return row !== null && (row.interruptedGlyph === true || row.continueSlot === true) ? row.title : null
        })()
    state.interruptedCleanup = {
      controlled,
      residualRecords,
      markerResidual,
      cardResidual,
      htmlInterrupted: view === null ? null : view.htmlInterrupted,
      issues,
    }
    log(`cleanup: controlled records ${short(JSON.stringify(controlled), 300)}; residual records ${short(JSON.stringify(residualRecords), 200)}; residual native markers ${short(JSON.stringify(markerResidual), 200)}; residual card mark ${short(JSON.stringify(cardResidual), 120)}; html marker ${view === null ? 'unreadable' : view.htmlInterrupted === null ? 'absent' : view.htmlInterrupted}; issues ${issues.length}`)
    if (issues.length > 0) log(`cleanup issues: ${short(issues.join('; '), 500)}`)
  } catch (error) {
    issues.push(`cleanup failed: ${(error && error.message) || String(error)}`)
    state.interruptedCleanup = { controlled, issues }
    log(`cleanup: ${short((error && error.message) || String(error), 500)}`)
  }
}

// ---------------------------------------------------------------------------------------------
// --row-menu mode: the card row "…" menu is the native shared context-menu popup
// ---------------------------------------------------------------------------------------------

/** Page-side probes for the `--row-menu` checks (plain serializable functions). */
const probeRm = {
  /** Top-level card rows: title, geometry, open state, time↔trigger swap, trigger centre. */
  cardRows: () => {
    const box = (element) => {
      const rect = element.getBoundingClientRect()
      return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    return [...document.querySelectorAll('.psd-run')].map((row) => {
      const boxed = box(row)
      const trigger = row.querySelector('.psd-run-more')
      const time = row.querySelector('.psd-run-time')
      const triggerRect = trigger === null ? null : box(trigger)
      return {
        title: (row.querySelector('.psd-run-title')?.innerText ?? '').trim(),
        current: row.getAttribute('aria-current') === 'true',
        menuable: row.getAttribute('data-menuable') === 'true',
        menuOpen: row.getAttribute('data-menu-open') === 'true',
        rect: boxed,
        timeOpacity: time === null ? null : getComputedStyle(time).opacity,
        moreOpacity: trigger === null ? null : getComputedStyle(trigger).opacity,
        triggerPresent: trigger !== null,
        triggerRect: triggerRect === null ? null : {
          left: triggerRect.left,
          top: triggerRect.top,
          width: triggerRect.width,
          height: triggerRect.height,
          x: triggerRect.left + Math.round(triggerRect.width / 2),
          y: triggerRect.top + Math.round(triggerRect.height / 2),
        },
      }
    })
  },

  /** Native Session rows: key/text/geometry and the native "…" menu trigger, when rendered. */
  nativeRows: () => {
    const box = (element) => {
      const rect = element.getBoundingClientRect()
      return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    return [...document.querySelectorAll('[data-row-key^="session:"]')].map((row) => {
      const boxed = box(row)
      const trigger = row.querySelector('button[data-context-menu-trigger]')
      const triggerRect = trigger === null ? null : box(trigger)
      return {
        key: row.getAttribute('data-row-key'),
        id: (row.getAttribute('data-row-key') ?? '').replace(/^session:/, ''),
        text: (row.innerText || '').trim().slice(0, 100),
        rect: boxed,
        hasTrigger: trigger !== null,
        triggerVisible: triggerRect !== null && triggerRect.width >= 8,
        triggerRect: triggerRect === null ? null : { ...triggerRect, x: triggerRect.left + Math.round(triggerRect.width / 2), y: triggerRect.top + Math.round(triggerRect.height / 2) },
      }
    })
  },

  /** Scroll one native Session row into view and return hover coordinates. */
  nativeRowPoint: (key) => {
    const row = document.querySelector(`[data-row-key="${key}"]`)
    if (row === null) return null
    row.scrollIntoView({ block: 'center' })
    const rect = row.getBoundingClientRect()
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hoverX: Math.round(rect.left + 70),
      hoverY: Math.round(rect.top + Math.round(rect.height / 2)),
    }
  },

  /**
   * Capture every comparable fact of the open menu: the shared native surface (material,
   * classes, computed styles, backing material layer), each `[role="menuitem"]` (label,
   * aria-keyshortcuts, kbd texts, icon SVG outerHTML, metrics, footer placement), the
   * separators and the afterContent footer region. Also detects the legacy custom
   * `.psd-menu` surface so the negative control can report exactly what it renders.
   */
  menu: () => {
    const box = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      }
    }
    const styleOf = (element) => {
      if (element === null) return null
      const style = getComputedStyle(element)
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
        border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        padding: style.padding,
        fontSize: style.fontSize,
      }
    }
    const surface = document.querySelector('[data-menu-material]')
    const material = surface === null ? null : surface.firstElementChild
    const footer = surface === null ? null : surface.lastElementChild
    const labelOf = (item) => ((item.innerText || item.textContent || '').trim().split('\n')[0] ?? '').trim()
    const items = [...document.querySelectorAll('[role="menuitem"]')]
    const describe = (item) => {
      const svgs = [...item.querySelectorAll('svg')]
      const keys = [...item.querySelectorAll('kbd')]
      const rect = item.getBoundingClientRect()
      const style = getComputedStyle(item)
      let inFooter = false
      for (let node = item.parentElement; node !== null && node !== surface && node !== document.body; node = node.parentElement) {
        if (String(node.className).includes('footer')) {
          inFooter = true
          break
        }
      }
      return {
        label: labelOf(item),
        text: (item.innerText || '').trim(),
        role: item.getAttribute('role'),
        keyshortcuts: item.getAttribute('aria-keyshortcuts'),
        kbdTexts: keys.map((key) => (key.textContent || '').trim()),
        icons: svgs.map((svg) => svg.outerHTML),
        svgCount: svgs.length,
        height: Math.round(rect.height),
        fontSize: style.fontSize,
        className: String(item.className),
        wrapperClass: item.parentElement === null ? null : String(item.parentElement.className),
        disabled: item.getAttribute('aria-disabled') === 'true' || item.disabled === true,
        inFooter,
      }
    }
    const described = items.map(describe)
    return {
      open: document.querySelectorAll('[role="menu"]').length > 0 || document.querySelector('.psd-menu') !== null,
      menuCount: document.querySelectorAll('[role="menu"]').length,
      customMenus: document.querySelectorAll('.psd-menu').length,
      nativeSurface: surface === null ? null : {
        material: surface.getAttribute('data-menu-material'),
        role: surface.getAttribute('role'),
        phase: surface.getAttribute('data-menu-phase'),
        classList: [...surface.classList],
        className: String(surface.className),
        rect: box(surface),
        style: styleOf(surface),
        materialClass: material === null ? null : String(material.className),
        materialStyle: styleOf(material),
      },
      itemLabels: described.map((item) => item.label),
      items: described,
      separators: document.querySelectorAll('[role="separator"]').length,
      footer: footer === null ? null : {
        className: String(footer.className),
        itemLabels: [...footer.querySelectorAll('[role="menuitem"]')].map(labelOf),
        separators: footer.querySelectorAll('[role="separator"]').length,
      },
    }
  },

  /** One card row's open state and time↔trigger swap, keyed by exact title. */
  rowState: (title) => {
    const row = [...document.querySelectorAll('.psd-run')]
      .find((node) => ((node.querySelector('.psd-run-title')?.innerText ?? '').trim()) === title)
    if (row === undefined) return { found: false }
    const trigger = row.querySelector('.psd-run-more')
    const time = row.querySelector('.psd-run-time')
    return {
      found: true,
      menuOpen: row.getAttribute('data-menu-open') === 'true',
      timeOpacity: time === null ? null : getComputedStyle(time).opacity,
      moreOpacity: trigger === null ? null : getComputedStyle(trigger).opacity,
      activeIsTrigger: trigger !== null && document.activeElement === trigger,
    }
  },

  /** Focus / popup / hover-card state read after dismissal. */
  focusState: () => ({
    tag: document.activeElement === null ? null : document.activeElement.tagName,
    className: document.activeElement === null ? null : String(document.activeElement.className),
    isCardTrigger: document.activeElement !== null && document.activeElement.classList.contains('psd-run-more'),
    isMenuItem: document.activeElement !== null && document.activeElement.getAttribute('role') === 'menuitem',
    hoverCards: document.querySelectorAll('.psd-hovercard').length,
    menus: document.querySelectorAll('[role="menu"]').length,
    customMenus: document.querySelectorAll('.psd-menu').length,
  }),
}

/**
 * @param {object} page - Page wrapper.
 * @returns {Promise<object | null>} the open-menu capture (never throws).
 */
async function readRowMenuState(page) {
  try {
    return await page.eval(probeRm.menu)
  } catch {
    return null
  }
}

/**
 * Poll the open-menu capture until the predicate accepts it.
 * @param {object} page - Page wrapper.
 * @param {Function} predicate - receives the capture.
 * @param {object} [options] - timeout/interval/label.
 * @returns {Promise<object>} the matching capture.
 */
async function waitRowMenuState(page, predicate, { timeout = 8000, interval = 120, label = 'row menu state' } = {}) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    const menu = await readRowMenuState(page)
    if (menu !== null) {
      last = menu
      if (predicate(menu)) return menu
    }
    await sleep(interval)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label} (last capture ${short(JSON.stringify(last === null ? null : { open: last.open, menuCount: last.menuCount, customMenus: last.customMenus, labels: last.itemLabels }), 500)})`)
}

/**
 * @param {object} page - Page wrapper.
 * @param {object} [options] - timeout/label.
 * @returns {Promise<object>} the open menu capture.
 */
async function waitRowMenuOpen(page, { timeout = 8000, label = 'shared context menu' } = {}) {
  return waitRowMenuState(page, (menu) => menu.open === true, { timeout, label })
}

/**
 * @param {object} page - Page wrapper.
 * @param {object} [options] - timeout/label.
 * @returns {Promise<object>} the closed-menu capture.
 */
async function waitRowMenuClosed(page, { timeout = 6000, label = 'shared context menu dismissal' } = {}) {
  return waitRowMenuState(page, (menu) => menu.open === false, { timeout, label })
}

/**
 * Whether one native menu entry is the Pin/Unpin action the card menu must filter.
 * @param {object} item - captured menu item.
 * @returns {boolean} whether it is a pin entry.
 */
function isRowMenuPinItem(item) {
  if (ROW_MENU_PIN_LABEL.test((item.label ?? '').trim())) return true
  return (item.icons ?? []).some((html) => /data-icon="[^"]*(pin|pushpin)/iu.test(html))
}

/**
 * Move the pointer over the open menu surface (a natural position while choosing an
 * item). This also lets the card row's hover card dismiss, so the shared popup — not the
 * hover card's own Escape handler — receives Escape.
 * @param {object} page - Page wrapper.
 * @param {object} menu - open-menu capture.
 * @returns {Promise<boolean>} whether the pointer was placed over the native surface.
 */
async function movePointerOntoRowMenu(page, menu) {
  const rect = menu === null ? null : menu.nativeSurface?.rect ?? null
  if (rect === null || rect.width < 8 || rect.height < 8) return false
  await page.moveTo(rect.left + Math.round(rect.width / 2), rect.top + Math.round(rect.height / 2))
  await sleep(450)
  return true
}

/**
 * Dismiss any open popup through Escape only (no action item is ever clicked). When a
 * native surface exists the pointer is placed over it first; the legacy custom popup (and
 * the negative control) gets the pointer parked off the row instead.
 * @param {object} page - Page wrapper.
 * @param {object} [options] - attempts.
 * @returns {Promise<boolean>} whether no popup is open afterwards.
 */
async function dismissRowMenu(page, { attempts = 4 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const menu = await readRowMenuState(page)
    if (menu !== null && menu.open === false) return true
    if (menu === null) return false
    if (menu.nativeSurface?.rect !== null && menu.nativeSurface?.rect !== undefined) {
      await movePointerOntoRowMenu(page, menu)
    } else {
      await page.moveTo(900, 500)
      await sleep(350)
    }
    await page.pressEscape()
    await sleep(500)
  }
  const menu = await readRowMenuState(page)
  return menu !== null && menu.open === false
}

/**
 * Hover one card row, then click its real "…" trigger with CDP input.
 * @param {object} page - Page wrapper.
 * @param {string} title - exact card row title.
 * @returns {Promise<object>} the open-menu capture.
 */
async function openCardRowMenu(page, title) {
  await page.moveTo(900, 500)
  await sleep(220)
  const initial = (await page.eval(probeRm.cardRows)).find((row) => row.title === title)
  assert(initial !== undefined, `the card row "${short(title, 50)}" disappeared before opening its menu`)
  await page.moveTo(initial.rect.left + 80, initial.rect.top + Math.round(initial.rect.height / 2))
  await sleep(700)
  const hovered = (await page.eval(probeRm.cardRows)).find((row) => row.title === title)
  assert(hovered !== undefined && hovered.triggerRect !== null, `the "${short(title, 50)}" row "…" trigger is not reachable on hover`)
  await page.moveTo(hovered.triggerRect.x, hovered.triggerRect.y)
  await sleep(280)
  await page.clickAt(hovered.triggerRect.x, hovered.triggerRect.y)
  return waitRowMenuOpen(page, { timeout: 8000, label: `card row menu for "${short(title, 40)}"` })
}

/**
 * Open the native DSH Session row menu through the row's own native "…" trigger with
 * real CDP input (right-clicking the row does not open this shell's row menu).
 * @param {object} page - Page wrapper.
 * @returns {Promise<{ row: object, menu: object }>} the native row and the captured menu.
 */
async function captureNativeSessionMenu(page) {
  // The native tree starts collapsed on a fresh profile: reveal the Workspace groups so
  // real Session rows (and their native "…" triggers) are rendered, like a user would.
  try {
    await ensureNativeSessionRowsVisible(page, 4)
  } catch {
    // The scan below reports the exact missing-row state instead.
  }
  const rows = await page.eval(probeRm.nativeRows)
  const candidates = rows.filter((row) => row.hasTrigger && row.text.length > 0)
  assert(candidates.length > 0, `no non-blank native Session row exposes its "…" menu trigger (rendered session rows: ${short(JSON.stringify(rows.map((row) => ({ key: row.key, text: row.text.slice(0, 40), hasTrigger: row.hasTrigger, rect: row.rect }))), 1100)}; start or open a Session and rerun)`)
  const problems = []
  for (const candidate of candidates) {
    const point = await page.eval(probeRm.nativeRowPoint, candidate.key)
    if (point === null) continue
    await page.moveTo(900, 500)
    await sleep(180)
    await page.moveTo(point.hoverX, point.hoverY)
    await sleep(750)
    const hovered = (await page.eval(probeRm.nativeRows)).find((row) => row.key === candidate.key)
    if (hovered === undefined || hovered.triggerRect === null || hovered.triggerRect.width < 8) {
      problems.push(`${candidate.key}: native menu trigger not reachable on hover`)
      continue
    }
    await page.moveTo(hovered.triggerRect.x, hovered.triggerRect.y)
    await sleep(250)
    await page.clickAt(hovered.triggerRect.x, hovered.triggerRect.y)
    try {
      const menu = await waitRowMenuOpen(page, { timeout: 8000, label: `native Session row menu for "${short(candidate.text, 40)}"` })
      if (menu.nativeSurface === null) {
        problems.push(`${candidate.key}: the native row opened no [data-menu-material] surface (custom menus ${menu.customMenus})`)
        await dismissRowMenu(page)
        continue
      }
      return { row: hovered, menu }
    } catch (error) {
      problems.push(`${candidate.key}: ${(error && error.message) || String(error)}`)
      await dismissRowMenu(page)
    }
  }
  throw new Error(`the native Session row menu did not open for any visible row (${short(JSON.stringify(problems), 900)})`)
}

/**
 * Plan the optional second-row replacement check: open the first row menu from the lower
 * row, then verify the other (upper) row's trigger is not covered by the open surface so a
 * safe replacement click cannot hit an action item.
 * @param {object} page - Page wrapper.
 * @returns {Promise<{ skipReason: string | null, first?: object, second?: object, menu?: object }>} the plan.
 */
async function planRowMenuReplacement(page) {
  await page.moveTo(900, 500)
  await sleep(250)
  const rows = (await page.eval(probeRm.cardRows)).filter((row) => row.menuable && row.triggerPresent)
  if (rows.length < 2) return { skipReason: `only ${rows.length} top-level card row(s) expose the "…" trigger in this live data state; a second-row replacement cannot be exercised` }
  const ordered = [...rows].sort((left, right) => left.rect.top - right.rect.top)
  const first = ordered[ordered.length - 1]
  const second = ordered[0]
  if (first.title === second.title) return { skipReason: 'the visible card rows do not provide two distinct rows' }
  let menu = null
  try {
    menu = await openCardRowMenu(page, first.title)
  } catch (error) {
    return { skipReason: `the first replacement row menu did not open: ${short((error && error.message) || String(error), 300)}` }
  }
  if (menu.nativeSurface === null) {
    await dismissRowMenu(page)
    return { skipReason: `the card row menu in this client is not the native shared popup (custom .psd-menu nodes: ${menu.customMenus}); replacement semantics are not applicable (see rm-2)` }
  }
  const initialSecondTrigger = second.triggerRect
  const surface = menu.nativeSurface.rect
  const overlaps = initialSecondTrigger !== null
    && initialSecondTrigger.left < surface.right
    && initialSecondTrigger.left + initialSecondTrigger.width > surface.left
    && initialSecondTrigger.top < surface.bottom
    && initialSecondTrigger.top + initialSecondTrigger.height > surface.top
  if (overlaps) {
    await dismissRowMenu(page)
    return { skipReason: 'the second row\'s "…" trigger is covered by the open menu surface, so a replacement click could land on an action item; the safe single-popup assertions are skipped' }
  }
  return { skipReason: null, first, second, menu }
}

/**
 * Write one optional screenshot into the gitignored `--row-menu` evidence directory.
 * @returns {Promise<string | null>} the file path, or null when disabled/failed.
 */
async function writeRowMenuShot(page, name, clip, state) {
  if (state.shotsEnabled !== true || clip === null || clip === undefined) return null
  try {
    await mkdir(ROW_MENU_EVIDENCE_DIR, { recursive: true })
    const x = Math.max(0, Math.round(clip.left) - 16)
    const y = Math.max(0, Math.round(clip.top) - 16)
    const width = Math.min(Math.round(clip.width) + 32, VIEWPORT.width - x)
    const height = Math.min(Math.round(clip.height) + 32, VIEWPORT.height - y)
    if (width < 8 || height < 8) return null
    const file = path.join(ROW_MENU_EVIDENCE_DIR, `${name}.png`)
    await page.screenshot(file, { x, y, width, height })
    log(`wrote ${file}`)
    state.rowMenuEvidence = [...(state.rowMenuEvidence ?? []), file]
    return file
  } catch (error) {
    log(`warning: row-menu screenshot ${name} failed: ${short((error && error.message) || String(error), 200)}`)
    return null
  }
}

/**
 * Write one JSON evidence file (captured menus + comparison) into the gitignored
 * `--row-menu` evidence directory. The token is never included.
 * @returns {Promise<string | null>} the file path, or null when the write failed.
 */
async function writeRowMenuEvidence(state, name, data) {
  try {
    await mkdir(ROW_MENU_EVIDENCE_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
    const file = path.join(ROW_MENU_EVIDENCE_DIR, `row-menu-${name}-${stamp}.json`)
    await writeFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...data }, null, 2)}\n`, 'utf8')
    log(`wrote ${file}`)
    state.rowMenuEvidence = [...(state.rowMenuEvidence ?? []), file]
    return file
  } catch (error) {
    log(`warning: could not write row-menu evidence ${name}: ${short((error && error.message) || String(error), 200)}`)
    return null
  }
}

/**
 * `--row-menu`: accept that the card row "…" menu is the native shared context-menu popup
 * (native material, icons, shortcut hints and footer) with only Pin/Unpin filtered out.
 * @param {object} input - `{ page, results, state }`.
 * @returns {Promise<void>}
 */
async function runRowMenuChecks({ page, results, state }) {
  log('\n=== --row-menu: card row "…" menu = native shared context-menu popup ===')
  state.mode = 'row-menu'
  state.rowMenu = { native: null, ours: null, comparison: null, target: null }

  await results.check('rm-net', 'CDP Network domain enabled (real network-failure oracle)', async () => {
    assert(page.networkEnabled === true, `Network.enable failed: ${page.networkError || 'unknown error'}`)
    return 'Network domain enabled; same-origin API/document failures are counted'
  })

  // Expand the card's five-row default like a user so every top-level row is reachable.
  await ensurePanelRows(page)
  await resetPointer(page)

  await results.check('rm-1', 'native DSH Session row menu is the shared popup: material, items, shortcut hints, icons, separators and footer captured', async () => {
    const captured = await captureNativeSessionMenu(page)
    const menu = captured.menu
    assert(menu.nativeSurface !== null, 'the native Session row menu rendered no [data-menu-material] shared surface')
    assertEqual(menu.nativeSurface.material, 'translucent', `the native Session row menu must use the translucent shared material (got ${menu.nativeSurface.material})`)
    assertEqual(menu.nativeSurface.role, 'menu', 'the shared surface must expose role="menu"')
    assert(menu.items.length >= 4, `the native Session row menu must carry the native Session actions (got ${menu.items.length})`)
    assert(menu.items.every((item) => typeof item.label === 'string' && item.label.length > 0), 'every native menu item must render a label')
    const shortcutItems = menu.items.filter((item) => (item.keyshortcuts ?? '') !== '' || item.kbdTexts.length > 0)
    assert(shortcutItems.length >= 1, `at least one native Session action must carry its shortcut hint (got ${shortcutItems.length})`)
    assert(menu.items.some((item) => item.icons.length === 1), 'the native menu must render keyed icon SVGs')
    assert(menu.footer !== null && menu.footer.itemLabels.length >= 1, 'the native menu must render its afterContent footer region (Archive)')
    assert(menu.items.some((item) => item.inFooter), 'at least one native action must sit in the afterContent footer')
    state.rowMenu.native = { row: { key: captured.row.key, text: captured.row.text }, menu }
    log(`native menu: ${menu.items.length} items ${short(JSON.stringify(menu.itemLabels), 400)}; material ${menu.nativeSurface.material}; ${menu.separators} separator(s); footer ${short(JSON.stringify(menu.footer.itemLabels), 160)}`)
    await writeRowMenuShot(page, 'rm1-native-session-menu', menu.nativeSurface.rect, state)
    await writeRowMenuEvidence(state, 'native-menu', { row: captured.row, menu })
    await page.pressEscape()
    await waitRowMenuClosed(page, { timeout: 6000, label: 'Escape dismissal of the native Session row menu' })
    return `native row "${short(captured.row.text, 50)}": ${menu.items.length} items, material ${menu.nativeSurface.material}/${menu.nativeSurface.className}, ${shortcutItems.map((item) => `${item.label}[${item.kbdTexts.join('')}]`).join(', ')}, ${menu.separators} separator(s), footer ${JSON.stringify(menu.footer.itemLabels)}`
  })

  await results.check('rm-2', 'card row "…" menu is the native shared popup with native material/icons/shortcut hints/footer, minus Pin/Unpin', async () => {
    const native = state.rowMenu?.native
    assert(native !== null && native !== undefined, 'the native Session row menu was not captured (rm-1 failed first)')
    await resetPointer(page)
    const rows = (await page.eval(probeRm.cardRows)).filter((row) => row.menuable && row.triggerPresent)
    assert(rows.length > 0, 'no top-level running/recent card row exposes the "…" trigger')
    // Prefer an ordinary (non-current) row: no atmosphere/hover-card noise beyond the tooltip.
    const target = rows.find((row) => row.current === false) ?? rows[0]
    state.rowMenu.target = target.title
    await openCardRowMenu(page, target.title)
    const opened = await readRowMenuState(page)
    await movePointerOntoRowMenu(page, opened)
    const menu = await readRowMenuState(page)
    const rowState = await page.eval(probeRm.rowState, target.title)
    const focusOpen = await page.eval(probeRm.focusState)
    state.rowMenu.ours = { target: target.title, menu, rowState }
    await writeRowMenuShot(page, 'rm2-card-row-menu', menu.nativeSurface?.rect ?? { left: 0, top: 0, width: VIEWPORT.width, height: VIEWPORT.height }, state)
    await writeRowMenuEvidence(state, 'ours-menu', { native: native.menu, ours: menu, rowState })
    // Aggregate the headline discrepancies first so a wrong-surface client (the negative
    // control's legacy custom `.psd-menu`) reports every missing native trait at once.
    const headlineProblems = []
    if (menu.nativeSurface === null) headlineProblems.push('no [data-menu-material] native shared surface')
    if (menu.customMenus > 0) headlineProblems.push(`legacy custom .psd-menu surface present (${menu.customMenus})`)
    if (menu.nativeSurface !== null && menu.nativeSurface.material !== native.menu.nativeSurface.material) {
      headlineProblems.push(`surface material ${JSON.stringify(menu.nativeSurface.material)} instead of ${JSON.stringify(native.menu.nativeSurface.material)}`)
    }
    const ourShortcutCount = menu.items.filter((item) => (item.keyshortcuts ?? '') !== '' || item.kbdTexts.length > 0).length
    const nativeShortcutCount = native.menu.items.filter((item) => (item.keyshortcuts ?? '') !== '' || item.kbdTexts.length > 0).length
    if (nativeShortcutCount > 0 && ourShortcutCount === 0) headlineProblems.push('no keyboard-shortcut hints rendered in the card menu')
    const nativeSharedForHeadline = native.menu.items.filter((item) => !isRowMenuPinItem(item))
    const iconProblems = nativeSharedForHeadline.filter((expected) => {
      const actual = menu.items.find((item) => item.label === expected.label)
      return actual === undefined || JSON.stringify(actual.icons) !== JSON.stringify(expected.icons)
    })
    if (iconProblems.length > 0) headlineProblems.push(`icon SVG markup differs for ${iconProblems.map((item) => item.label).join(', ')}`)
    assertEqual(headlineProblems.length, 0,
      `the card row menu does not match the native shared popup: ${headlineProblems.join('; ')} (card labels ${short(JSON.stringify(menu.itemLabels), 240)})`)
    // (a) the same native shared popup, not a custom surface.
    assert(menu.nativeSurface !== null, `the card row menu is not the native shared popup: no [data-menu-material] surface (custom .psd-menu nodes: ${menu.customMenus})`)
    assertEqual(menu.customMenus, 0, 'the legacy custom .psd-menu surface must be gone')
    assertEqual(menu.menuCount, 1, `exactly one shared popup may be open (got ${menu.menuCount})`)
    assertEqual(menu.nativeSurface.material, native.menu.nativeSurface.material, 'the card menu material must match the native Session row menu')
    assertEqual(menu.nativeSurface.material, 'translucent', 'the card menu must use the native translucent material')
    assertEqual(JSON.stringify(menu.nativeSurface.classList), JSON.stringify(native.menu.nativeSurface.classList),
      `the card menu surface classes must match the native surface (ours ${JSON.stringify(menu.nativeSurface.classList)}, native ${JSON.stringify(native.menu.nativeSurface.classList)})`)
    // (b) computed material/geometry matches the native surface exactly.
    for (const key of ['backgroundColor', 'backgroundImage', 'backdropFilter', 'border', 'borderRadius', 'boxShadow', 'padding']) {
      assertEqual(menu.nativeSurface.style[key], native.menu.nativeSurface.style[key], `the card menu surface ${key} must match the native menu (ours ${JSON.stringify(menu.nativeSurface.style[key])}, native ${JSON.stringify(native.menu.nativeSurface.style[key])})`)
    }
    assertEqual(menu.nativeSurface.materialClass, native.menu.nativeSurface.materialClass, 'the card menu backing material class must match the native menu')
    for (const key of ['backgroundColor', 'backgroundImage', 'backdropFilter']) {
      assertEqual(menu.nativeSurface.materialStyle[key], native.menu.nativeSurface.materialStyle[key], `the card menu material layer ${key} must match the native menu`)
    }
    // (c) items = native list in order, with exactly Pin/Unpin removed; no pin entry.
    const nativePin = native.menu.items.filter((item) => isRowMenuPinItem(item))
    const nativeShared = native.menu.items.filter((item) => !isRowMenuPinItem(item))
    assert(nativePin.length >= 1, `the native Session menu must carry the Pin/Unpin entry it filters (native labels ${JSON.stringify(native.menu.itemLabels)})`)
    assert(menu.items.every((item) => !isRowMenuPinItem(item)), `the card menu must not contain a Pin/Unpin entry (labels ${JSON.stringify(menu.itemLabels)})`)
    assertEqual(JSON.stringify(menu.itemLabels), JSON.stringify(nativeShared.map((item) => item.label)),
      `the card menu items must equal the native Session actions in order with exactly the Pin/Unpin entry removed (ours ${JSON.stringify(menu.itemLabels)}, native minus pin ${JSON.stringify(nativeShared.map((item) => item.label))})`)
    if (nativeShared.some((item) => item.label === 'Show in Finder')) {
      assert(menu.itemLabels.includes('Show in Finder'), 'the plugin-contributed "Show in Finder" action must stay in the card menu')
    }
    // (d)(e) shortcut hints and icon SVG markup match the native menu for every shared action.
    for (const expected of nativeShared) {
      const actual = menu.items.find((item) => item.label === expected.label)
      assert(actual !== undefined, `the card menu is missing the native action "${expected.label}"`)
      assertEqual(actual.keyshortcuts ?? null, expected.keyshortcuts ?? null, `"${expected.label}" aria-keyshortcuts must match the native menu`)
      assertEqual(JSON.stringify(actual.kbdTexts), JSON.stringify(expected.kbdTexts), `"${expected.label}" rendered shortcut keys must match the native menu (ours ${JSON.stringify(actual.kbdTexts)}, native ${JSON.stringify(expected.kbdTexts)})`)
      assertEqual(JSON.stringify(actual.icons), JSON.stringify(expected.icons), `"${expected.label}" icon SVG markup must match the native keyed icon`)
      assertEqual(actual.svgCount, expected.svgCount, `"${expected.label}" must render the same number of icon SVGs as the native menu`)
      assertEqual(actual.height, expected.height, `"${expected.label}" menu item height must match the native item`)
      assertEqual(actual.fontSize, expected.fontSize, `"${expected.label}" menu item font-size must match the native item`)
      assertEqual(actual.className, expected.className, `"${expected.label}" menu item classes must match the native item`)
      assertEqual(actual.inFooter, expected.inFooter, `"${expected.label}" footer placement must match the native menu`)
    }
    const shortcutItems = menu.items.filter((item) => (item.keyshortcuts ?? '') !== '' || item.kbdTexts.length > 0)
    assert(shortcutItems.length >= 2, `the card menu must expose the native shortcut hints (got ${shortcutItems.length}: ${JSON.stringify(shortcutItems.map((item) => `${item.label}[${item.kbdTexts.join('')}]`))})`)
    // (f) footer / afterContent placement matches the native menu.
    assert(menu.footer !== null, 'the card menu must render the native afterContent footer region')
    assertEqual(menu.footer.className, native.menu.footer.className, 'the card menu footer classes must match the native menu footer')
    assertEqual(JSON.stringify(menu.footer.itemLabels), JSON.stringify(native.menu.footer.itemLabels), 'the card menu footer actions must match the native footer actions')
    assertEqual(menu.footer.separators, native.menu.footer.separators, 'the card menu footer separator must match the native footer')
    assertEqual(menu.separators, native.menu.separators, 'the card menu separator structure must match the native menu')
    assert(menu.footer.itemLabels.length >= 1, 'the afterContent footer must carry at least one action (Archive)')
    // (g) the row keeps its open state and swap while the popup is open.
    assertEqual(rowState.found, true, `the card row "${short(target.title, 50)}" disappeared while its menu was open`)
    assertEqual(rowState.menuOpen, true, 'the row must keep data-menu-open="true" while the shared popup is open')
    assertEqual(rowState.timeOpacity, '0', `the row time must stay swapped for the "…" trigger while the menu is open (opacity ${rowState.timeOpacity})`)
    assertEqual(rowState.moreOpacity, '1', `the "…" trigger must stay visible while the menu is open (opacity ${rowState.moreOpacity})`)
    assertEqual(focusOpen.hoverCards, 0, 'the row hover card must be dismissed before Escape is asserted (pointer over the menu)')
    // (g) Escape dismisses and restores focus to the trigger; data-menu-open clears.
    await page.pressEscape()
    await waitRowMenuClosed(page, { timeout: 6000, label: 'Escape dismissal of the card row menu' })
    // The native popup animates out (~80 ms exit) and only unmounts afterwards; the shared
    // popup restores focus when the dismissal settles. Poll for that post-animation state
    // instead of reading a pre-animation snapshot (the restore is still strictly asserted).
    let dismissed = await page.eval(probeRm.rowState, target.title)
    let focusClosed = await page.eval(probeRm.focusState)
    const focusDeadline = Date.now() + 2500
    while (Date.now() < focusDeadline && dismissed.activeIsTrigger !== true) {
      await sleep(120)
      dismissed = await page.eval(probeRm.rowState, target.title)
      focusClosed = await page.eval(probeRm.focusState)
    }
    assertEqual(dismissed.menuOpen, false, 'data-menu-open must clear after Escape')
    assertEqual(dismissed.activeIsTrigger, true, `Escape must restore focus to the row "…" trigger after the exit animation (active element ${JSON.stringify(focusClosed.className)})`)
    assertEqual(focusClosed.menus, 0, 'no [role="menu"] may remain after Escape')
    await resetPointer(page)
    await sleep(400)
    const restored = await page.eval(probeRm.rowState, target.title)
    assertEqual(restored.timeOpacity, '1', 'the row time must return after the menu is dismissed and the pointer leaves')
    assertEqual(restored.moreOpacity, '0', 'the "…" trigger must hide again after dismissal')
    state.rowMenu.comparison = {
      surfaceClass: menu.nativeSurface.className,
      items: menu.itemLabels,
      nativeItems: native.menu.itemLabels,
      filteredPin: nativePin.map((item) => item.label),
      shortcutItems: shortcutItems.map((item) => `${item.label}[${item.kbdTexts.join('')}]`),
      footer: menu.footer.itemLabels,
    }
    await writeRowMenuEvidence(state, 'comparison', { native: native.menu, ours: menu, rowState, comparison: state.rowMenu.comparison })
    return `same surface ${menu.nativeSurface.className}; ${menu.items.length} items = native ${native.menu.items.length} minus ${JSON.stringify(nativePin.map((item) => item.label))}; shortcuts ${shortcutItems.map((item) => `${item.label}[${item.kbdTexts.join('')}]`).join(', ')}; icon markup equal for every shared action; footer ${JSON.stringify(menu.footer.itemLabels)}; row data-menu-open + time↔"…" swap held; Escape dismissed and restored focus to the trigger`
  })

  // A popup must not leak into the replacement check (rm-2 may have failed while one is
  // open, e.g. the legacy custom menu in the negative control).
  await dismissRowMenu(page)
  const oursMenu = state.rowMenu?.ours?.menu ?? null
  const oursIsNative = oursMenu !== null && oursMenu.nativeSurface !== null
  const replacementPlan = oursIsNative
    ? await planRowMenuReplacement(page)
    : { skipReason: `the card row menu in this client is not the native shared popup (no [data-menu-material] surface${oursMenu !== null && oursMenu.customMenus > 0 ? `; custom .psd-menu nodes: ${oursMenu.customMenus}` : ''}) — second-row replacement semantics are not applicable (see rm-2)` }
  if (replacementPlan.skipReason !== null) {
    await results.skip('rm-3', 'opening the menu from a second card row replaces the first (one shared popup)', replacementPlan.skipReason)
  } else {
    await results.check('rm-3', 'opening the menu from a second card row replaces the first (one shared popup)', async () => {
      const first = replacementPlan.first
      const second = replacementPlan.second
      const firstMenu = replacementPlan.menu
      assertEqual(firstMenu.menuCount, 1, 'exactly one shared popup must be open for the first row')
      const firstState = await page.eval(probeRm.rowState, first.title)
      assertEqual(firstState.menuOpen, true, `the first row "${short(first.title, 40)}" must be marked open`)
      // Move to the second (upper) row and open its menu; its trigger is not covered by the
      // first menu's surface (checked by planRowMenuReplacement).
      await page.moveTo(900, 500)
      await sleep(200)
      await page.moveTo(second.rect.left + 80, second.rect.top + Math.round(second.rect.height / 2))
      await sleep(700)
      const secondHovered = (await page.eval(probeRm.cardRows)).find((row) => row.title === second.title)
      assert(secondHovered !== undefined && secondHovered.triggerRect !== null, `the second row "${short(second.title, 40)}" trigger is not reachable`)
      const surfaceNow = (await readRowMenuState(page))?.nativeSurface?.rect ?? null
      assert(surfaceNow !== null, 'the first row menu surface disappeared before the replacement click')
      const overlapsNow = secondHovered.triggerRect.left < surfaceNow.right
        && secondHovered.triggerRect.left + secondHovered.triggerRect.width > surfaceNow.left
        && secondHovered.triggerRect.top < surfaceNow.bottom
        && secondHovered.triggerRect.top + secondHovered.triggerRect.height > surfaceNow.top
      assert(!overlapsNow, 'the second row "…" trigger moved under the open menu surface; refusing to click (an action item could be hit)')
      await page.moveTo(secondHovered.triggerRect.x, secondHovered.triggerRect.y)
      await sleep(280)
      await page.clickAt(secondHovered.triggerRect.x, secondHovered.triggerRect.y)
      const replaced = await waitRowMenuOpen(page, { timeout: 6000, label: 'replacement card row menu' })
      assert(replaced.nativeSurface !== null, 'the replacement menu must still be the native shared popup')
      assertEqual(replaced.menuCount, 1, `only one shared popup may exist after opening from a second row (got ${replaced.menuCount})`)
      const secondState = await page.eval(probeRm.rowState, second.title)
      const firstAfter = await page.eval(probeRm.rowState, first.title)
      assertEqual(secondState.menuOpen, true, 'the second row must own data-menu-open after the replacement')
      assertEqual(firstAfter.menuOpen, false, 'the first row must clear data-menu-open when the menu moves to the second row')
      await movePointerOntoRowMenu(page, replaced)
      await page.pressEscape()
      await waitRowMenuClosed(page, { timeout: 6000, label: 'Escape dismissal of the replacement menu' })
      return `menu moved from "${short(first.title, 40)}" to "${short(second.title, 40)}": 1 shared popup, data-menu-open follows the active row, Escape dismissed`
    })
  }
}

/**
 * Close any popup the `--row-menu` checks left open (Escape only) and report the residual
 * menu state honestly. Never clicks an action item.
 * @param {object} page - Page wrapper.
 * @param {object} state - harness state with `rowMenu`.
 * @returns {Promise<void>}
 */
async function cleanupRowMenu(page, state) {
  if (state.mode !== 'row-menu') return
  const issues = []
  try {
    const dismissed = await dismissRowMenu(page, { attempts: 4 })
    if (!dismissed) issues.push('could not dismiss the popup with Escape')
    const menu = await readRowMenuState(page)
    const openRows = await page.eval(() => [...document.querySelectorAll('.psd-run[data-menu-open="true"]')]
      .map((row) => (row.querySelector('.psd-run-title')?.innerText ?? '').trim()))
    state.rowMenuCleanup = {
      dismissed,
      open: menu === null ? null : menu.open === true,
      menuCount: menu === null ? null : menu.menuCount,
      customMenus: menu === null ? null : menu.customMenus,
      openRows,
      issues,
    }
    log(`cleanup: popup dismissed=${dismissed}; open ${state.rowMenuCleanup.open}; menus ${state.rowMenuCleanup.menuCount}; custom .psd-menu ${state.rowMenuCleanup.customMenus}; rows still marked open ${short(JSON.stringify(openRows), 200)}; issues ${issues.length}`)
    if (issues.length > 0) log(`cleanup issues: ${short(issues.join('; '), 400)}`)
  } catch (error) {
    issues.push(`cleanup failed: ${(error && error.message) || String(error)}`)
    state.rowMenuCleanup = { issues }
    log(`cleanup: ${short((error && error.message) || String(error), 500)}`)
  }
}

// ---------------------------------------------------------------------------------------------
// --readme-shots mode: raw README/Bento captures of the live GUI (privacy-masked + demo stubs)
// ---------------------------------------------------------------------------------------------

/** Output directory for the README capture pass (gitignored `.tmp-work/`). */
const README_SHOTS_DIR = path.join(WORKTREE, '.tmp-work', 'readme-shots')
/** Raw PNG directory the README Bento composer (`scripts/build-readme-bento.mjs`) reads. */
const README_RAW_DIR = path.join(README_SHOTS_DIR, 'raw')
/** Capture contract: device scale factor 2, viewport 1728x900, 12 px clip padding (design §3). */
const README_DPR = 2
const README_CLIP_PAD = 12
/** The raw files design §3 requires; the pass fails when any of them is missing. */
const README_DASHBOARD_FILES = [
  'workspaces.png',
  'card.png',
  'card-hover.png',
  'row-menu.png',
  'interrupted-row.png',
  'interrupted-composer.png',
  'artifacts.png',
  'artifacts-quicklook.png',
  'artifacts-filter.png',
  'settings.png',
]

const README_REQUIRED_FILES = [
  'workspaces.png',
  'card.png',
  'card-hover.png',
  'row-menu.png',
  'interrupted-row.png',
  'interrupted-composer.png',
  'artifacts.png',
  'artifacts-quicklook.png',
  'artifacts-filter.png',
  'composer-chat.png',
  'settings.png',
  'annotation-annotated.png',
  'annotation-inserted.png',
]
/** Allowlisted demo copy substituted for every user-identifying string in the page. */
const README_SESSION_TITLES = [
  'Release checklist',
  'Design review',
  'Docs pass',
  'Sidebar polish',
  'API cleanup',
  'Hover card pass',
  'Artifacts tour',
  'Composer polish',
  'Prompt history',
  'Settings pass',
  'Menu parity',
  'Interrupted state',
]
const README_WORKSPACE_TITLES = [
  'Power Suite',
  'Design system',
  'Docs site',
  'Release tooling',
  'Sandbox',
  'Infra',
  'CLI toolkit',
  'Marketing site',
  'Analytics',
  'Mobile client',
  'Payments',
  'Search service',
  'Data pipeline',
  'Auth',
  'Docs gallery',
]
const README_HOVER_WORKSPACE = 'Power Suite'
const README_HOVER_PATH = '~/Projects/Power Suite'
/** Canned English prompt the rail's hover preview card is masked to (demo copy, never user text). */
const README_PREVIEW_PROMPT = 'Draft the release checklist and summarize the risky files'
/**
 * Banned substrings that must never appear in a capture crop (design §3 privacy gate).
 * The page-side scanners compile the source strings; the Node-side assertion uses the regexes.
 */
const README_BANNED_PATTERNS = [
  ['/Users/', /\/Users\//u],
  ['rexxin', /rexxin/iu],
  ['http://', /http:\/\//iu],
  ['https://', /https:\/\//iu],
  ['token=', /token=/iu],
  ['dsh-power-suite/', /dsh-power-suite\//iu],
  ['CJK', /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u],
]
const README_BANNED_SOURCES = README_BANNED_PATTERNS.map(([label, pattern]) => [label, pattern.source])
/** Demo artifacts served by the CDP Fetch stub for the Artifacts poses (design §3 payload). */
const README_STUB_ARTIFACTS = {
  sessionId: 'readme-demo',
  origin: null,
  workspaceRoot: '/demo/readme-workspace',
  artifacts: [
    {
      path: '/demo/readme-workspace/release-checklist.md',
      name: 'release-checklist.md',
      turn: 4,
      mime: 'text/markdown',
      previewable: true,
      size: 4210,
      missing: false,
    },
    {
      path: '/demo/readme-workspace/revenue-chart.svg',
      name: 'revenue-chart.svg',
      turn: 4,
      mime: 'image/svg+xml',
      previewable: true,
      size: 1820,
      missing: false,
    },
    {
      provided: true,
      attachmentId: 'readme-demo-attachment-3',
      name: 'design-notes.md',
      mediaType: 'text/markdown',
      mime: 'text/markdown',
      previewable: true,
      bytes: 2310,
      size: 2310,
      promptOrdinal: 2,
      missing: false,
    },
    {
      provided: true,
      attachmentId: 'readme-demo-attachment-4',
      name: 'benchmark.csv',
      mediaType: 'text/csv',
      mime: 'text/csv',
      previewable: true,
      bytes: 940,
      size: 940,
      promptOrdinal: 2,
      missing: false,
    },
    {
      path: '/demo/readme-workspace/usage-notes.md',
      name: 'usage-notes.md',
      turn: 5,
      mime: 'text/markdown',
      previewable: true,
      size: 3840,
      missing: false,
    },
    {
      provided: true,
      attachmentId: 'readme-demo-attachment-5',
      name: 'flow-diagram.svg',
      mediaType: 'image/svg+xml',
      mime: 'image/svg+xml',
      previewable: true,
      bytes: 1640,
      size: 1640,
      promptOrdinal: 3,
      missing: false,
    },
    {
      path: '/demo/readme-workspace/meeting-notes.md',
      name: 'meeting-notes.md',
      turn: 5,
      mime: 'text/markdown',
      previewable: true,
      size: 2660,
      missing: false,
    },
    {
      path: '/demo/readme-workspace/roadmap.svg',
      name: 'roadmap.svg',
      turn: 6,
      mime: 'image/svg+xml',
      previewable: true,
      size: 2048,
      missing: false,
    },
    {
      provided: true,
      attachmentId: 'readme-demo-attachment-6',
      name: 'tokens.json',
      mediaType: 'application/json',
      mime: 'application/json',
      previewable: true,
      bytes: 1229,
      size: 1229,
      promptOrdinal: 3,
      missing: false,
    },
    {
      provided: true,
      attachmentId: 'readme-demo-attachment-7',
      name: 'screenshot.png',
      mediaType: 'image/png',
      mime: 'image/png',
      previewable: true,
      bytes: 188416,
      size: 188416,
      width: 1280,
      height: 720,
      promptOrdinal: 4,
      missing: false,
    },
  ],
}
/** Demo Markdown returned by the stubbed preview/raw routes (Quick Look pose). */
const README_STUB_MARKDOWN = [
  '# Release checklist',
  '',
  '- Confirm the CHANGELOG entry mirrors the diff',
  '- Run npm run check and npm test',
  '- Rebuild the README Bento assets',
  '',
  '```sh',
  'npm run build:readme-bento',
  '```',
  '',
].join('\n')
/** Demo SVG returned by the stubbed raw route for the generated image row (never hovered). */
const README_STUB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">' +
  '<rect width="320" height="180" fill="#15161a"/>' +
  '<text x="20" y="40" fill="#ffffff" font-family="sans-serif">demo chart</text></svg>'
/** Demo prompt history served by the CDP Fetch stub (privacy: canned English lines only). */
const README_STUB_PROMPTS = {
  sessionId: 'readme-demo',
  prompts: [
    { seq: 1, text: 'Draft the release checklist and summarize the risky files', at: Date.UTC(2026, 10, 8, 9, 30) },
    { seq: 2, text: 'Review the README Bento layout screenshots', at: Date.UTC(2026, 10, 8, 11, 15) },
    { seq: 3, text: 'Polish the sidebar hover card spacing', at: Date.UTC(2026, 10, 8, 14, 5) },
    { seq: 4, text: 'Check the release notes for the plugin', at: Date.UTC(2026, 10, 9, 8, 40) },
    { seq: 5, text: 'Trace the interrupted composer state', at: Date.UTC(2026, 10, 9, 10, 20) },
    { seq: 6, text: 'Compare the native and card row menus', at: Date.UTC(2026, 10, 9, 13, 50) },
    { seq: 7, text: 'Write the quick look artifact tour', at: Date.UTC(2026, 10, 9, 16, 10) },
    { seq: 8, text: 'Tighten the annotation rail copy', at: Date.UTC(2026, 10, 10, 9, 5) },
    { seq: 9, text: 'Verify the prompt history keyboard shortcut', at: Date.UTC(2026, 10, 10, 11, 45) },
    { seq: 10, text: 'Capture the artifacts filter menu', at: Date.UTC(2026, 10, 10, 15, 25) },
    { seq: 11, text: 'Summarize the docs pass findings', at: Date.UTC(2026, 10, 11, 8, 55) },
    { seq: 12, text: 'Audit the settings page layout', at: Date.UTC(2026, 10, 11, 10, 35) },
    { seq: 13, text: 'Check the folded project buckets', at: Date.UTC(2026, 10, 11, 14, 15) },
    { seq: 14, text: 'Rebuild the screenshot pipeline', at: Date.UTC(2026, 10, 11, 16, 5) },
    { seq: 15, text: 'Document the test seams', at: Date.UTC(2026, 10, 12, 9, 20) },
    { seq: 16, text: 'Review the session pin sync', at: Date.UTC(2026, 10, 12, 11, 0) },
    { seq: 17, text: 'Measure the sidebar resize handle', at: Date.UTC(2026, 10, 12, 13, 40) },
    { seq: 18, text: 'Fix the hover card fade timing', at: Date.UTC(2026, 10, 12, 16, 30) },
    { seq: 19, text: 'Inspect the subagent child rows', at: Date.UTC(2026, 10, 13, 9, 10) },
    { seq: 20, text: 'Update the changelog entry', at: Date.UTC(2026, 10, 13, 11, 30) },
    { seq: 21, text: 'Run the full browser harness', at: Date.UTC(2026, 10, 13, 14, 20) },
    { seq: 22, text: 'Verify the reduced motion path', at: Date.UTC(2026, 10, 14, 8, 45) },
    { seq: 23, text: 'Check the composer gallery wheel', at: Date.UTC(2026, 10, 14, 10, 55) },
    { seq: 24, text: 'Trim the README feature table', at: Date.UTC(2026, 10, 14, 15, 35) },
  ],
}
/** Demo preview descriptor for the generated Markdown artifact (Quick Look pose). */
const README_STUB_PREVIEW = {
  path: '/demo/readme-workspace/release-checklist.md',
  name: 'release-checklist.md',
  mime: 'text/markdown',
  size: README_STUB_MARKDOWN.length,
  previewable: true,
  kind: 'text',
  text: README_STUB_MARKDOWN,
  truncated: false,
}

/**
 * Page-side probes for the `--readme-shots` pass (plain serializable functions: they only
 * touch the throwaway page's DOM and never persist anything).
 */
const probeReadme = {
  /**
   * Install the capture stylesheet and mark the document as captured. The conversation
   * header/transcript stay hidden by default (sidebar/card poses); a real-chat pose calls
   * `setChatVisible(true)` to show the transcript while keeping the header hidden.
   */
  installStyle: () => {
    let style = document.getElementById('psd-readme-capture-style')
    if (style === null) {
      style = document.createElement('style')
      style.id = 'psd-readme-capture-style'
      document.head.appendChild(style)
    }
    style.textContent = [
      'html[data-psd-readme-capture] [data-slot="conversation.header"]{visibility:hidden!important}',
      'html[data-psd-readme-capture]:not([data-psd-readme-show-chat]) [data-slot="conversation.session"]{visibility:hidden!important}',
      'html[data-psd-readme-capture]:not([data-psd-readme-show-chat]) [data-slot="conversation.session"] [data-conversation-region="composer"]{visibility:visible!important}',
      'html[data-psd-readme-capture] [data-files-content] > :not([data-psfa-overlay]){visibility:hidden!important}',
    ].join('\n')
    document.documentElement.setAttribute('data-psd-readme-capture', 'true')
    return true
  },

  /** Show/hide the real conversation transcript for the composer/annotation poses. */
  setChatVisible: (visible) => {
    if (visible === true) document.documentElement.setAttribute('data-psd-readme-show-chat', 'true')
    else document.documentElement.removeAttribute('data-psd-readme-show-chat')
    return { visible: visible === true }
  },

  /**
   * Mask every visible user-identifying string in the captured page (design §3):
   * session/workspace titles in the native sidebar and the card, the card hover-card
   * workspace/session/path, and the composer workspace selector. A final scrub replaces
   * any leftover banned substring (CJK text, local paths, URLs) outside the hidden
   * transcript, so the crop and document scans cannot see real user text.
   * @param {object} copy - allowlisted demo strings for each surface.
   * @returns {object} per-surface mask counts.
   */
  maskAll: (copy) => {
    const masked = {}
    const bump = (key) => {
      masked[key] = (masked[key] ?? 0) + 1
    }
    /**
     * Replace the text of one element's direct text nodes, keeping its child elements
     * (icons, carets) intact: the first non-empty node carries the demo copy, the rest
     * are blanked.
     * @param {Element} element - target element.
     * @param {string} text - demo copy.
     * @returns {boolean} whether anything was replaced.
     */
    const setLeafText = (element, text) => {
      if (!(element instanceof Element)) return false
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      let replaced = false
      for (const node of nodes) {
        const value = node.nodeValue || ''
        if (value.trim().length === 0) continue
        if (!replaced) {
          node.nodeValue = text
          replaced = true
        } else {
          node.nodeValue = ''
        }
      }
      return replaced
    }
    const keepDemoTitles = copy.keepDemoTitles === true
    const cycle = (list, index) => list[index % list.length]
    if (keepDemoTitles !== true) {
      let index = 0
      for (const element of document.querySelectorAll('[data-row-key^="session:"] [class*="_title"]')) {
        if (setLeafText(element, cycle(copy.sessionTitles, index))) {
          bump('nativeSessionTitles')
          index += 1
        }
      }
      index = 0
      for (const element of document.querySelectorAll('[data-row-key^="workspace:"] [class*="_title"]')) {
        if (setLeafText(element, cycle(copy.workspaceTitles, index))) {
          bump('nativeWorkspaceTitles')
          index += 1
        }
      }
      index = 0
      for (const element of document.querySelectorAll('.psd-run-title, .psd-child-title')) {
        if (setLeafText(element, cycle(copy.sessionTitles, index))) {
          bump('cardTitles')
          index += 1
        }
      }
      for (const element of document.querySelectorAll('.psd-hovercard-title')) {
        if (setLeafText(element, copy.hoverWorkspace)) bump('hoverWorkspaceTitles')
      }
      index = 0
      for (const element of document.querySelectorAll('.psd-hovercard-session')) {
        if (setLeafText(element, cycle(copy.sessionTitles, index))) {
          bump('hoverSessionTitles')
          index += 1
        }
      }
      for (const element of document.querySelectorAll('.psd-hovercard-path')) {
        if (setLeafText(element, copy.hoverPath)) bump('hoverWorkspacePaths')
      }
      index = 0
      for (const element of document.querySelectorAll('[data-conversation-region="composer"] [aria-label="Choose workspace"]')) {
        if (setLeafText(element, cycle(copy.workspaceTitles, index))) {
          bump('composerWorkspace')
          index += 1
        }
      }
    }
    for (const element of document.querySelectorAll('.psp-rail-card-text')) {
      if (setLeafText(element, copy.previewPrompt)) bump('promptPreviewTexts')
    }
    index = 0
    for (const element of document.querySelectorAll('[data-conversation-region="composer"] [aria-label="Choose workspace"]')) {
      if (setLeafText(element, cycle(copy.workspaceTitles, index))) {
        bump('composerWorkspace')
        index += 1
      }
    }
    // Last-resort scrub: any remaining banned substring outside the hidden transcript is
    // replaced with neutral demo copy. Only the throwaway page is touched.
    const banned = copy.bannedSources
      .map(([, source]) => {
        try {
          return new RegExp(source, 'iu')
        } catch {
          return null
        }
      })
      .filter((pattern) => pattern !== null)
    const matchesBanned = (value) => banned.some((pattern) => pattern.test(value))
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    for (const node of nodes) {
      const value = node.nodeValue
      if (value === null || value === undefined || value.trim().length === 0) continue
      if (!matchesBanned(value)) continue
      const element = node.parentElement
      if (element === null) continue
      if (element.closest('[data-slot="conversation.session"], [data-slot="conversation.header"]') !== null) continue
      const filesContent = element.closest('[data-files-content]')
      if (filesContent !== null && element.closest('[data-psfa-overlay]') === null) continue
      node.nodeValue = 'Demo'
      bump('scrubbedBannedTextNodes')
    }
    return masked
  },

  /** Union rect of the visible matches of `selectors`, optionally including descendants. */
  boxes: (payload) => {
    const boxes = []
    const push = (element) => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      boxes.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }
    for (const selector of payload.selectors) {
      const nodes = [...document.querySelectorAll(selector)]
      const list = payload.first === true ? nodes.slice(0, 1) : nodes
      for (const element of list) {
        push(element)
        if (payload.descendants === true) {
          for (const child of element.querySelectorAll('*')) push(child)
        }
      }
    }
    if (boxes.length === 0) return null
    const left = Math.min(...boxes.map((box) => box.x))
    const top = Math.min(...boxes.map((box) => box.y))
    const right = Math.max(...boxes.map((box) => box.x + box.width))
    const bottom = Math.max(...boxes.map((box) => box.y + box.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
  },

  /**
   * Interrupted-composer pose geometry: the composer's visual rounded card (the input
   * card containing the attachment button, model / Intelligent-UI controls and the
   * play-triangle send control) plus the composer region itself.
   */
  composerCardParts: () => {
    const toBox = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const composer = document.querySelector('[data-conversation-region="composer"]')
    let card = null
    if (composer !== null) {
      // The visual card is the widest opaque, strongly rounded element inside the composer.
      for (const element of composer.querySelectorAll('*')) {
        const rect = element.getBoundingClientRect()
        if (rect.width < 500 || rect.height < 80) continue
        const style = getComputedStyle(element)
        const radius = Number.parseFloat(style.borderTopLeftRadius) || 0
        if (radius < 18) continue
        const background = style.backgroundColor
        if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent') continue
        const box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        if (card === null || box.width * box.height > card.width * card.height) card = box
      }
    }
    let overhangBottom = null
    if (card !== null) {
      const bandTop = card.y + card.height + 2
      const bandEnd = card.y + card.height + 64
      for (const element of document.querySelectorAll('*')) {
        if (element.childElementCount !== 0) continue
        const text = (element.innerText || '').trim()
        if (text.length < 4) continue
        const rect = element.getBoundingClientRect()
        if (rect.width < 40 || rect.height < 8) continue
        if (rect.top < bandTop || rect.top > bandEnd) continue
        if (overhangBottom === null || rect.bottom > overhangBottom) overhangBottom = rect.bottom
      }
    }
    return {
      composer: toBox(composer),
      card,
      send: toBox(composer === null ? null : composer.querySelector('button[class$="_primary"]')),
      editor: toBox(composer === null ? null : composer.querySelector('[data-lexical-editor="true"]')),
      overhangBottom,
    }
  },

  /**
   * Prompt-history pose geometry: the right-edge rail, its hover full-text preview card and
   * the optional search card, plus their tight union.
   */
  promptHistoryParts: () => {
    const toBox = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const preview = toBox(document.querySelector('[data-psp-preview-card]'))
    const rail = toBox(document.querySelector('[data-psp-rail]'))
    const divider = toBox(document.querySelector('[data-psp-rail-divider]'))
    const searchCard = toBox(document.querySelector('[data-psp-search-card]'))
    const parts = [preview, rail, divider, searchCard].filter((box) => box !== null)
    if (parts.length === 0) return { preview, rail, divider, searchCard, box: null }
    const left = Math.min(...parts.map((box) => box.x))
    const top = Math.min(...parts.map((box) => box.y))
    const right = Math.max(...parts.map((box) => box.x + box.width))
    const bottom = Math.max(...parts.map((box) => box.y + box.height))
    return { preview, rail, divider, searchCard, box: { x: left, y: top, width: right - left, height: bottom - top } }
  },

  /** Native Workspaces header + Inactive Projects geometry used to crop workspaces.png. */
  workspaceCropParts: () => {
    const toBox = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const sidebar = document.querySelector('[class$="_sidebarCol"]')
    let label = null
    if (sidebar !== null) {
      const walker = document.createTreeWalker(sidebar, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        if ((node.nodeValue || '').trim() !== 'Workspaces') continue
        const parent = node.parentElement
        const box = toBox(parent)
        if (box === null) continue
        label = box
        break
      }
    }
    const inactive = document.querySelector('[data-psd="group"][data-group="inactive"]')
    const inactiveHeader = toBox(inactive)
    const inactiveRows = inactiveHeader === null
      ? []
      : [...document.querySelectorAll('[data-row-key^="workspace:"]')]
          .map((row) => ({ row, box: toBox(row) }))
          .filter((entry) => entry.box !== null && entry.box.y > inactiveHeader.y)
          .slice(0, 2)
          .map((entry) => entry.box)
    return {
      sidebar: toBox(sidebar),
      panel: toBox(document.querySelector('.psd-panel')),
      tree: toBox(document.querySelector('[role="tree"]')),
      label,
      inactiveHeader,
      inactiveRows,
      currentWorkspace: toBox(document.querySelector('[data-psd-current-workspace="true"]')),
    }
  },

  /**
   * Scroll the native Workspaces tree just enough to keep the Inactive Projects header and
   * its first two rows inside the viewport (the Workspaces header itself never scrolls).
   */
  revealInactiveProjects: () => {
    const tree = document.querySelector('[role="tree"]')
    const inactive = document.querySelector('[data-psd="group"][data-group="inactive"]')
    if (tree === null || inactive === null) return null
    const inactiveRect = inactive.getBoundingClientRect()
    const rows = [...document.querySelectorAll('[data-row-key^="workspace:"]')]
      .map((row) => row.getBoundingClientRect())
      .filter((rect) => rect.top > inactiveRect.top && rect.width > 0)
      .slice(0, 2)
    const bottom = Math.max(inactiveRect.bottom, ...rows.map((rect) => rect.bottom))
    const limit = Math.min(tree.getBoundingClientRect().bottom, window.innerHeight) - 10
    const overflow = Math.max(0, Math.round(bottom - limit))
    if (overflow > 0) tree.scrollTop += overflow
    return { overflow, scrollTop: tree.scrollTop, rows: rows.length }
  },

  /** Artifacts panel content geometry: header row, list rows and their pitch. */
  artifactsContentParts: () => {
    const toBox = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const root = toBox(document.querySelector('.psfa-view .dsa-root'))
    const header = toBox(document.querySelector('.psfa-view .dsa-header'))
    const rows = [...document.querySelectorAll('.psfa-view .dsa-row')].map(toBox).filter((box) => box !== null)
    const rowHeight = rows.length === 0 ? 0 : rows.reduce((total, box) => total + box.height, 0) / rows.length
    return { root, header, rows, rowHeight }
  },

  /** Scroll the plugin settings section to the top of its scroller before measuring. */
  scrollSettingsIntoView: () => {
    const settings = document.querySelector('.dps-settings')
    if (settings === null) return false
    settings.scrollIntoView({ block: 'start' })
    return true
  },

  /**
   * Docs-asset privacy guard used by the annotation captures (same recipe as the annotation
   * harness): blur the native sidebar/conversation header and lay a theme-matched frosted
   * shield over the conversation above the composer. Passing `false` removes both.
   */
  annotationGuard: (enabled) => {
    const CLASS = 'psd-readme-annotation-privacy'
    if (enabled !== true) {
      document.documentElement.classList.remove(CLASS)
      const existing = document.getElementById('psd-readme-annotation-shield')
      if (existing !== null) existing.remove()
      return { active: false }
    }
    if (document.getElementById('psd-readme-annotation-guard-style') === null) {
      const style = document.createElement('style')
      style.id = 'psd-readme-annotation-guard-style'
      style.textContent =
        'html.' + CLASS + ' [class$="_sidebarCol"]{filter:blur(7px)!important}' +
        'html.' + CLASS + ' [data-slot="conversation.header"]{filter:blur(6px)!important}'
      document.head.appendChild(style)
    }
    document.documentElement.classList.add(CLASS)
    let shield = document.getElementById('psd-readme-annotation-shield')
    if (shield === null) {
      shield = document.createElement('div')
      shield.id = 'psd-readme-annotation-shield'
      document.body.appendChild(shield)
    }
    const sidebar = document.querySelector('[class$="_sidebarCol"]')
    const rail = document.querySelector('[data-psa-rail]')
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const sidebarRight = sidebar === null ? 0 : Math.round(sidebar.getBoundingClientRect().right)
    const railLeft = rail === null ? innerWidth : Math.round(rail.getBoundingClientRect().left)
    const composerTop = composer === null ? innerHeight : Math.round(composer.getBoundingClientRect().top)
    let background = 'rgba(20, 22, 28, 0.9)'
    for (const element of [document.querySelector('[data-conversation-region="chat"]'), document.querySelector('[data-slot="main"]'), document.body]) {
      if (element === null) continue
      const computed = getComputedStyle(element).backgroundColor || ''
      const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(computed)
      if (match === null) continue
      const alpha = match[4] === undefined ? 1 : Number(match[4])
      if (alpha < 0.5) continue
      background = 'rgba(' + match[1] + ', ' + match[2] + ', ' + match[3] + ', 0.9)'
      break
    }
    const width = Math.max(0, railLeft - sidebarRight)
    const height = Math.max(0, composerTop)
    Object.assign(shield.style, {
      position: 'fixed',
      left: sidebarRight + 'px',
      top: '0px',
      width: width + 'px',
      height: height + 'px',
      background,
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      pointerEvents: 'none',
      zIndex: '18'
    })
    return { active: true, sidebarRight, railLeft, composerTop, background, width, height }
  },

  /** Mask Session ids / workspace names shown in the annotation rail metadata. */
  maskAnnotationMeta: () => {
    let masked = 0
    for (const scope of ['[data-psa-rail]', '[data-psa-popover]']) {
      for (const root of document.querySelectorAll(scope)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        const nodes = []
        while (walker.nextNode()) nodes.push(walker.currentNode)
        for (const node of nodes) {
          const value = node.nodeValue
          if (value === null || value === undefined || value.length === 0) continue
          let next = value.replace(/Session\s+[0-9a-f][0-9a-f-]{5,}/gi, 'Session demo')
          next = next.replace(/Workspace\s+[^\s·]+/g, 'Workspace Power Suite')
          if (next === value) continue
          node.nodeValue = next
          masked += 1
        }
      }
    }
    return { masked }
  },

  /** Annotation mode facts used to pose the docs-asset captures. */
  annotationState: () => ({
    active: document.documentElement.getAttribute('data-psa-active'),
    rail: document.querySelector('[data-psa-rail]') !== null,
    railPanel: document.querySelector('[data-psa-rail-panel]')?.getAttribute('data-psa-rail-panel') ?? null,
    entries: document.querySelectorAll('[data-psa-entry]').length,
    popovers: document.querySelectorAll('[data-psa-popover]').length,
    add: document.querySelector('[data-psa-add]') !== null,
    insertBatch: document.querySelector('[data-psa-insert-batch]') !== null,
    chips: document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-decorator="true"]').length,
    launcher: document.querySelector('[data-psa-launcher]') !== null
  }),

  /** Find the click point of a native control by aria-label (`kind: 'aria'`) or text. */
  annotationTarget: (spec) => {
    for (const button of document.querySelectorAll('button')) {
      const aria = button.getAttribute('aria-label') || ''
      const text = (button.innerText || '').trim()
      const matches = spec.kind === 'aria' ? aria === spec.value : text === spec.value
      if (!matches) continue
      const rect = button.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        label: spec.kind === 'aria' ? aria : text
      }
    }
    return null
  },

  /** Hide/show the native left sidebar (all user workspace/session data) for dummy poses. */
  hideSidebar: (enabled) => {
    const ID = 'psd-readme-hide-sidebar-style'
    let style = document.getElementById(ID)
    if (enabled === true) {
      if (style === null) {
        style = document.createElement('style')
        style.id = ID
        style.textContent = 'html[data-psd-readme-hide-sidebar] [class$="_sidebarCol"]{display:none!important}' +
          'html[data-psd-readme-hide-sidebar] [class*="_sidebarRail"]{display:none!important}'
        document.head.appendChild(style)
      }
      document.documentElement.setAttribute('data-psd-readme-hide-sidebar', 'true')
    } else {
      document.documentElement.removeAttribute('data-psd-readme-hide-sidebar')
      if (style !== null) style.remove()
    }
    return { hidden: enabled === true }
  },

  /** Hide the blank-session hero ("Into the Unknown" / Preview) above the composer. */
  hideEmptyHomeState: () => {
    let hidden = 0
    for (const node of document.querySelectorAll('h1, h2, h3, div, span, p')) {
      if (node.childElementCount !== 0) continue
      if ((node.textContent || '').trim() !== 'Into the Unknown') continue
      let target = node
      // Climb only through hero-sized blocks (the composer stack is much taller).
      while (target.parentElement !== null && target.parentElement.getBoundingClientRect().height <= 160) {
        target = target.parentElement
      }
      target.setAttribute('data-psd-readme-hidden-hero', '')
      target.style.visibility = 'hidden'
      hidden += 1
    }
    return { hidden }
  },

  /**
   * Inject the dummy DSH answer card (client-side DOM only): "Weekend in Shanghai" with an
   * intro, date chips, three itinerary checklist rows, a budget/slider row and a primary
   * "Add to calendar" button. All colours come from the page's dark-theme tokens.
   */
  installDummyAnswer: () => {
    const STYLE_ID = 'psd-readme-dummy-style'
    if (document.getElementById(STYLE_ID) === null) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = [
        '#psd-readme-dummy-answer{position:fixed;z-index:9;font-family:inherit;color:var(--dsw-alias-label-primary,#f2f3f5)}',
        '.psd-dummy-card{box-sizing:border-box;width:100%;padding:22px 28px 20px;background:var(--dsw-alias-bg-layer-1,#17181b);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.45)}',
        'h2[data-psd-dummy-title]{margin:0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.01em}',
        '.psd-dummy-chips{display:flex;gap:6px;margin-top:8px}',
        '.psd-dummy-chips span{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b9bcc2)}',
        '.psd-dummy-intro{margin:10px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#b9bcc2)}',
        '.psd-dummy-section{margin-top:14px;font-size:11px;line-height:16px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8b8f96)}',
        '.psd-dummy-list{display:flex;flex-direction:column;gap:5px;margin:7px 0 0;padding:0;list-style:none}',
        '.psd-dummy-list li{display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07));border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03))}',
        '.psd-dummy-list label{display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer}',
        '.psd-dummy-list input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-state-business-primary,#4b8bff)}',
        '.psd-dummy-row-title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#f2f3f5)}',
        '.psd-dummy-row-meta{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8b8f96)}',
        '.psd-dummy-budget{display:flex;align-items:center;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07))}',
        '.psd-dummy-budget-label{flex:none;min-width:48px;font-size:12px;color:var(--dsw-alias-label-secondary,#b9bcc2)}',
        '.psd-dummy-budget input[type=range]{flex:1;max-width:240px;accent-color:var(--dsw-alias-state-business-primary,#4b8bff)}',
        '.psd-dummy-budget-value{flex:none;font-size:12px;color:var(--dsw-alias-label-primary,#f2f3f5)}',
        '.psd-dummy-budget-range{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8f96)}',
        '.psd-dummy-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}',
        '.psd-dummy-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8f96)}',
        'button[data-psd-dummy-action]{appearance:none;border:0;height:36px;padding:0 18px;border-radius:10px;background:var(--dsw-alias-state-business-primary,#4b8bff);color:#fff;font:inherit;font-weight:500;cursor:pointer}',
        'button[data-psd-dummy-action]:hover{filter:brightness(1.06)}'
      ].join('\n')
      document.head.appendChild(style)
    }
    let host = document.getElementById('psd-readme-dummy-answer')
    if (host === null) {
      host = document.createElement('div')
      host.id = 'psd-readme-dummy-answer'
      host.setAttribute('data-psd-readme-dummy', '')
      document.body.appendChild(host)
    }
    const rows = [
      { title: 'The Bund walk &amp; river ferry', meta: '2 h', checked: true },
      { title: 'Noodle breakfast in Jing&#39;an', meta: '1 h', checked: false },
      { title: 'French Concession gallery hop', meta: '3 h', checked: false }
    ]
    host.innerHTML = [
      '<div class="psd-dummy-card">',
      '<h2 data-psd-dummy-title>Weekend in Shanghai</h2>',
      '<div class="psd-dummy-chips"><span>Sat 12 Oct</span><span>Sun 13 Oct</span><span>2 days</span></div>',
      '<p class="psd-dummy-intro">Two unhurried days: the Bund at dusk, a noodle breakfast in Jing&#39;an, and an afternoon in the French Concession.</p>',
      '<div class="psd-dummy-section">Itinerary</div>',
      '<ul role="list" class="psd-dummy-list">',
      ...rows.map((row, index) => [
        '<li role="listitem" data-psd-dummy-row="' + index + '">',
        '<label><input type="checkbox"' + (row.checked ? ' checked' : '') + '><span class="psd-dummy-row-title">' + row.title + '</span></label>',
        '<span class="psd-dummy-row-meta">' + row.meta + '</span>',
        '</li>'
      ].join('')),
      '</ul>',
      '<div class="psd-dummy-budget">',
      '<span class="psd-dummy-budget-label">Budget</span>',
      '<input type="range" min="1200" max="3600" step="100" value="2400" aria-label="Trip budget">',
      '<span class="psd-dummy-budget-value">¥2,400 total</span>',
      '<span class="psd-dummy-budget-range">¥1,800–2,800</span>',
      '</div>',
      '<div class="psd-dummy-footer">',
      '<span class="psd-dummy-hint">Draft plan · nothing booked yet</span>',
      '<button type="button" data-psd-dummy-action>Add to calendar</button>',
      '</div>',
      '</div>'
    ].join('')
    return { installed: true }
  },

  /** Place/scale the dummy card inside the annotation-mode content column, above the composer. */
  positionDummyAnswer: () => {
    const host = document.getElementById('psd-readme-dummy-answer')
    if (host === null) return null
    const rail = document.querySelector('[data-psa-rail]')
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const railLeft = rail === null ? innerWidth : Math.round(rail.getBoundingClientRect().left)
    let composerTop = composer === null ? innerHeight : Math.round(composer.getBoundingClientRect().top)
    if (composer !== null) {
      // The composer region includes the (hidden) hero block; the visible composer card is
      // the opaque rounded element inside it. Keep the dummy card above that card.
      let cardTop = null
      for (const element of composer.querySelectorAll('*')) {
        const rect = element.getBoundingClientRect()
        if (rect.width < 500 || rect.height < 80) continue
        const style = getComputedStyle(element)
        if ((Number.parseFloat(style.borderTopLeftRadius) || 0) < 18) continue
        const background = style.backgroundColor
        if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent') continue
        if (cardTop === null || rect.top < cardTop) cardTop = rect.top
      }
      if (cardTop !== null) composerTop = Math.round(cardTop)
    }
    const width = Math.min(820, Math.max(640, railLeft - 200))
    host.style.width = width + 'px'
    host.style.left = Math.round((railLeft - width) / 2) + 'px'
    host.style.top = '26px'
    host.style.transform = 'none'
    host.style.transformOrigin = 'top center'
    let rect = host.getBoundingClientRect()
    const available = Math.max(240, composerTop - 26 - 12)
    if (rect.height > available) {
      host.style.transform = 'scale(' + Math.max(0.7, available / rect.height).toFixed(3) + ')'
      rect = host.getBoundingClientRect()
    }
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      railLeft,
      composerTop
    }
  },

  /** Click points for the three annotated dummy-card elements. */
  dummyTargets: () => {
    const point = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    const rows = [...document.querySelectorAll('[data-psd-dummy-row]')]
    return {
      title: point(document.querySelector('[data-psd-dummy-title]')),
      row: point(rows[1] ?? rows[0] ?? null),
      button: point(document.querySelector('[data-psd-dummy-action]'))
    }
  },

  /**
   * Fill the annotation rail requirement textareas through React's native value setter +
   * input event (one realistic requirement per annotation). Returns the values for
   * verification.
   */
  annotationFillRequirements: (texts) => {
    const areas = [...document.querySelectorAll('.psa-entry-note')]
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    for (let index = 0; index < areas.length; index += 1) {
      const text = texts[index] ?? ''
      setter.call(areas[index], text)
      areas[index].dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      areas[index].dispatchEvent(new Event('change', { bubbles: true }))
    }
    return { count: areas.length, values: areas.map((area) => area.value) }
  },

  /** Read back the rail requirement textareas + page-marker badges for verification. */
  annotationRequirementsState: () => ({
    values: [...document.querySelectorAll('.psa-entry-note')].map((area) => area.value),
    badges: [...document.querySelectorAll('.psa-mark-badge')].map((badge) => (badge.innerText || '').trim()),
    entries: document.querySelectorAll('[data-psa-entry]').length,
    markers: document.querySelectorAll('.psa-mark').length
  }),

  /**
   * Fallback for the README dummy page: paint the page marks through the plugin's own
   * snapshot store. The controller derives marks from its geometry frames; for the
   * client-injected card that pass does not run in the headless session, so this pushes
   * the same mark descriptors (id/index/viewport rect/summary) the geometry frame would
   * have produced. React then renders the plugin's real `.psa-mark` elements.
   */
  fallbackMarkPaint: () => {
    const hooks = globalThis.__POWER_SUITE_TEST_HOOKS__?.uiAnnotation
    if (hooks === undefined || hooks === null) return { ok: false, reason: 'annotation seam unavailable' }
    const layer = document.querySelector('.psa-layer')
    if (layer === null) return { ok: false, reason: 'annotation layer missing' }
    const fiberKey = Object.keys(layer).find((name) => name.startsWith('__reactFiber$'))
    let fiber = fiberKey === undefined ? null : layer[fiberKey]
    let controller = null
    let snapshot = null
    for (let depth = 0; fiber !== null && fiber !== undefined && depth < 20; depth += 1) {
      const props = fiber.memoizedProps
      if (props !== null && typeof props === 'object') {
        if (controller === null && props.controller !== null && typeof props.controller === 'object' && props.controller.store !== undefined) controller = props.controller
        if (snapshot === null && props.snapshot !== null && typeof props.snapshot === 'object' && props.snapshot.state !== null) snapshot = props.snapshot
      }
      fiber = fiber.return
    }
    if (controller === null || snapshot === null) return { ok: false, reason: 'controller/snapshot not found on the fiber tree' }
    const queryAll = (selector) => document.querySelectorAll(selector)
    const marks = []
    const collection = Array.isArray(snapshot.state.collection) ? snapshot.state.collection : []
    let index = 0
    for (const entry of collection) {
      index += 1
      const locator = entry.locator !== null && typeof entry.locator === 'object' ? entry.locator : {}
      if (locator.surface === 'floating' || locator.ephemeral === true) continue
      let node = null
      try {
        node = hooks.resolveNodeCandidate({
          candidates: Array.isArray(locator.candidates) ? locator.candidates : [],
          expectedTag: typeof locator.tag === 'string' ? locator.tag : '',
          uniqueSelector: typeof locator.uniqueSelector === 'string' ? locator.uniqueSelector : '',
          queryAll,
        })
      } catch (error) {
        node = null
      }
      if (node === null) {
        // Hover-only controls can lose their exact candidate chain before the geometry pass;
        // fall back to any still-matching selector in the locator's candidate list.
        const selectors = []
        if (typeof locator.uniqueSelector === 'string' && locator.uniqueSelector.length > 0) selectors.push(locator.uniqueSelector)
        for (const candidate of Array.isArray(locator.candidates) ? locator.candidates : []) {
          if (typeof candidate === 'string' && candidate.length > 0) selectors.push(candidate)
          else if (candidate !== null && typeof candidate === 'object') {
            for (const key of ['selector', 'uniqueSelector', 'css']) {
              if (typeof candidate[key] === 'string' && candidate[key].length > 0) selectors.push(candidate[key])
            }
          }
        }
        for (const selector of selectors) {
          try {
            const found = document.querySelector(selector)
            if (found !== null) {
              const rect = found.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                node = found
                break
              }
            }
          } catch {
            // invalid selector candidate: try the next one
          }
        }
      }
      if (node === null) continue
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const excerpt = hooks.annotationMarkerBadgeText(entry.note)
      marks.push({
        id: entry.id,
        index,
        rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
        stale: false,
        summary: excerpt.text,
        empty: excerpt.empty,
      })
    }
    const current = controller.store.getSnapshot()
    controller.store.set({ ...current, markRects: marks, markerHoverId: null })
    return { ok: true, count: marks.length, ids: marks.map((mark) => mark.id) }
  },

  /** Hide the composer's workspace/preset selector row above the input card (dummy-page pose). */
  hideComposerContextRow: () => {
    const button = document.querySelector('[data-conversation-region="composer"] [aria-label="Choose workspace"]')
    if (button === null) return { hidden: 0 }
    let row = button
    while (row.parentElement !== null && row.parentElement.getBoundingClientRect().height <= 70) row = row.parentElement
    row.style.visibility = 'hidden'
    return { hidden: 1, height: Math.round(row.getBoundingClientRect().height) }
  },

  /** Real-task chat facts (no transcript text is returned). */
  chatState: () => {
    const messages = [...document.querySelectorAll('[data-message-id]')]
    const last = messages.length === 0 ? null : messages[messages.length - 1]
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const editor = composer === null ? null : composer.querySelector('[data-lexical-editor="true"]')
    const send = composer === null ? null : composer.querySelector('button[class$="_primary"]')
    return {
      session: document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null,
      messages: messages.length,
      lastTextLength: last === null ? 0 : (last.innerText || '').trim().length,
      lastTextHead: last === null ? '' : (last.innerText || '').trim().slice(0, 40),
      draftLength: editor === null ? 0 : (editor.innerText || '').trim().length,
      sendDisabled: send === null ? null : send.disabled === true,
      sendAria: send === null ? null : send.getAttribute('aria-label'),
      chatVisible: document.documentElement.getAttribute('data-psd-readme-show-chat') === 'true',
    }
  },

  /** Composer editor + send-button click points for the real-task prompt. */
  chatSendPoints: () => {
    const toPoint = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    const composer = document.querySelector('[data-conversation-region="composer"]')
    if (composer === null) return null
    const editor = composer.querySelector('[data-lexical-editor="true"]')
    const buttons = [...composer.querySelectorAll('button')]
    const send = buttons.find((button) => /^(Send message|发送消息)$/iu.test(button.getAttribute('aria-label') || '')) || composer.querySelector('button[class$="_primary"]')
    return { editor: toPoint(editor), send: toPoint(send) }
  },

  /**
   * Click points for the rendered assistant answer: heading, one itinerary item and the
   * budget line. Returns short public text previews for the report only.
   */
  chatAnswerTargets: () => {
    const toPoint = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    const messages = [...document.querySelectorAll('[data-message-id]')]
    let scope = null
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const text = (messages[index].innerText || '').trim()
      if (text.length > 80) {
        scope = messages[index]
        break
      }
    }
    if (scope === null) return { ok: false, reason: 'no assistant message with text found' }
    const textOf = (element) => (element.innerText || '').trim()
    const heading =
      [...scope.querySelectorAll('h1, h2, h3, h4')].find((element) => textOf(element).length > 3) ??
      [...scope.querySelectorAll('strong, p')].find((element) => textOf(element).length > 3 && textOf(element).length < 80) ??
      null
    const items = [...scope.querySelectorAll('li')]
    const itinerary =
      items.find((element) => /(day|morning|afternoon|evening|walk|visit|·|—)/iu.test(textOf(element)) && textOf(element).length > 10) ??
      items[0] ??
      null
    const tipLeaves = [...scope.querySelectorAll('p, li, td, span, strong')].filter((element) => {
      const text = textOf(element)
      return text.length >= 8 && text.length <= 320 && /(tip|advice|remember|practical|caution|note)/iu.test(text)
    })
    const budget =
      tipLeaves.find((element) => element.childElementCount === 0) ??
      tipLeaves[0] ??
      [...scope.querySelectorAll('p')].filter((element) => textOf(element).length > 20).pop() ??
      null
    return {
      ok: true,
      messageCount: messages.length,
      heading: heading === null ? null : { point: toPoint(heading), text: textOf(heading).slice(0, 120) },
      itinerary: itinerary === null ? null : { point: toPoint(itinerary), text: textOf(itinerary).slice(0, 160) },
      budget: budget === null ? null : { point: toPoint(budget), text: textOf(budget).slice(0, 160) },
    }
  },

  /**
   * The ACTIVE conversation Session (hidden stale conversation roots can remain in the DOM
   * after a Session switch, so a plain querySelector can read the previous Session).
   */
  activeSessionState: () => {
    const activeRoot = document.querySelector('[data-conversation-content][data-content-phase="active"]')
    const activeId = activeRoot === null ? null : activeRoot.getAttribute('data-conversation-session')
    const ids = [...document.querySelectorAll('[data-conversation-session]')]
      .map((element) => element.getAttribute('data-conversation-session'))
      .filter((value) => typeof value === 'string' && value.length > 0)
    const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
    const workspaceRow = document.querySelector('[data-psd-current-workspace="true"]')
    const selectedRow = [...document.querySelectorAll('[data-row-key^="session:"]')].find(
      (row) => row.getAttribute('aria-selected') === 'true' || row.hasAttribute('data-psd-current-session')
    )
    return {
      sessionId: activeId ?? (ids.length === 0 ? null : ids[ids.length - 1]),
      activeId,
      roots: ids.length,
      draftLength: editor === null ? 0 : (editor.innerText || '').trim().length,
      messageNodes: document.querySelectorAll('[data-chat-anchor-key]').length,
      phase: activeRoot === null ? null : activeRoot.getAttribute('data-content-phase'),
      currentWorkspace: workspaceRow === null ? null : (workspaceRow.querySelector('[class*="_title"]')?.innerText || '').trim(),
      selectedRowTitle: selectedRow === undefined ? null : (selectedRow.querySelector('[class*="_title"]')?.innerText || '').trim(),
    }
  },

  /** Dismiss a blocking modal notice (e.g. the isolated Preview instance notice). */
  dismissBlockingDialog: () => {
    const dialog = document.querySelector('[role="dialog"][aria-label*="Notice" i], [role="alertdialog"][aria-label*="Notice" i]')
    if (dialog === null) return { dismissed: false, reason: 'no notice dialog' }
    const buttons = [...dialog.querySelectorAll('button')]
    const preferred =
      buttons.find((button) => /^(Continue|Got it|OK|Okay|Understood|Close|Dismiss|Agree|Start|Accept)/iu.test((button.innerText || '').trim())) ??
      buttons[buttons.length - 1] ??
      null
    if (preferred === null) return { dismissed: false, reason: 'notice dialog has no button' }
    preferred.click()
    return { dismissed: true, label: (preferred.innerText || '').trim().slice(0, 60) }
  },

  /** Real-shell chat facts (this shell renders transcript nodes as data-chat-* items). */
  chatFlowState: (promptText) => {
    const userNodes = document.querySelectorAll('[data-chat-flow-kind="user"]').length
    const flowNodes = document.querySelectorAll('[data-chat-anchor-key]').length
    const main = document.querySelector('[data-slot="main"]')
    const mainText = main === null ? '' : (main.innerText || '')
    const composer = document.querySelector('[data-conversation-region="composer"]')
    const editor = composer === null ? null : composer.querySelector('[data-lexical-editor="true"]')
    const primary = composer === null ? null : composer.querySelector('button[class$="_primary"]')
    return {
      session: document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null,
      userNodes,
      flowNodes,
      mainTextLen: mainText.length,
      transcriptTextLen: (document.querySelector('[data-slot="conversation.chat.flow"]')?.innerText || '').trim().length,
      promptPresent: typeof promptText === 'string' && promptText.length > 0 ? mainText.includes(promptText) : null,
      draftLength: editor === null ? 0 : (editor.innerText || '').trim().length,
      primaryAria: primary === null ? null : primary.getAttribute('aria-label'),
      primaryDisabled: primary === null ? null : primary.disabled === true,
      running: primary !== null && /stop generating/iu.test(primary.getAttribute('aria-label') || ''),
      turnsLine: (mainText.match(/\d+\s+turns?[^\n]{0,40}/iu) || [null])[0],
    }
  },

  /**
   * Click points for the three annotation targets on the suite's own "Running & recent"
   * panel: the panel header, the first recent row, and that row's "…" menu trigger.
   */
  runningPanelTargets: () => {
    const toPoint = (element) => {
      if (element === null || element === undefined) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        rect: { x: Math.round(rect.left), y: Math.round(rect.top) },
      }
    }
    const panel = document.querySelector('.psd-panel')
    if (panel === null) return { panel: null, header: null, row: null, control: null }
    const toggle = panel.querySelector('.psd-panel-toggle')
    const count = panel.querySelector('.psd-panel-head-actions')
    const headerPoint = toggle === null
      ? null
      : (() => {
          const rect = toggle.getBoundingClientRect()
          return { x: Math.round(rect.left + Math.min(52, rect.width / 2)), y: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height), rect: { x: Math.round(rect.left), y: Math.round(rect.top) } }
        })()
    const rows = [...panel.querySelectorAll('.psd-run')]
    const row = rows.length === 0 ? null : rows[0]
    const rowTitle = row === null ? null : row.querySelector('button[aria-label^="Open "]') ?? row.querySelector('.psd-run-title')
    const menuTrigger = row === null ? null : row.querySelector('button[aria-label^="Session actions"]') ?? row.querySelector('button[data-context-menu-trigger]')
    const pin = row === null ? null : row.querySelector('button[aria-label="Pin session"]')
    return {
      panel: toPoint(panel),
      header: toggle === null ? null : {
        label: 'Running & recent panel header',
        aria: toggle.getAttribute('aria-label'),
        text: `${(toggle.innerText || '').trim()}${count === null ? '' : ` ${(count.innerText || '').trim()}`}`.trim().slice(0, 60),
        selectors: '.psd-panel-toggle (title + count)',
        point: headerPoint,
      },
      row: rowTitle === null ? null : {
        label: 'top running/recent row',
        aria: rowTitle.getAttribute('aria-label'),
        text: (row.innerText || '').trim().slice(0, 80),
        selectors: 'button[aria-label^="Open "] inside .psd-run',
        point: toPoint(rowTitle),
      },
      control: menuTrigger === null ? null : {
        label: 'row "…" menu trigger',
        aria: menuTrigger.getAttribute('aria-label'),
        text: (row === null ? '' : (row.innerText || '').trim().slice(0, 80)),
        selectors: 'button[aria-label^="Session actions"]',
        point: toPoint(menuTrigger),
      },
      pin: pin === null ? null : { label: 'pin button', aria: pin.getAttribute('aria-label'), point: toPoint(pin) },
      chevron: (() => {
        const control = panel.querySelector('.psd-panel-chevron')
        if (control === null) return null
        const rect = control.getBoundingClientRect()
        if (rect.width <= 0) return null
        return {
          label: 'panel disclosure chevron',
          aria: control.getAttribute('aria-label'),
          text: (control.innerText || '').trim().slice(0, 40),
          selectors: '.psd-panel-chevron',
          point: toPoint(control),
        }
      })(),
    }
  },

  /**
   * Click points for the three sidebar UI elements annotated for the README pose:
   * Workspaces search button, Add workspace button, Active Projects header.
   */
  sidebarAnnotationTargets: () => {
    const sidebar = document.querySelector('[class$="_sidebarCol"]') ?? document.querySelector('[data-slot="sidebar"]')
    const toPoint = (element) => {
      if (element === null || element === undefined) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        rect: { x: Math.round(rect.left), y: Math.round(rect.top) },
      }
    }
    const scope = sidebar ?? document
    const buttons = [...scope.querySelectorAll('button')].filter((button) => {
      const rect = button.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    const info = (element, label) => {
      if (element === null) return null
      return {
        label,
        aria: element.getAttribute('aria-label'),
        text: (element.innerText || '').trim().slice(0, 60),
        selectors: `${element.tagName.toLowerCase()}${element.getAttribute('aria-label') === null ? '' : `[aria-label="${element.getAttribute('aria-label')}"]`}`,
        point: toPoint(element),
      }
    }
    const search = buttons.find((button) => /^Search sessions$/iu.test(button.getAttribute('aria-label') || '')) ??
      buttons.find((button) => /search/iu.test(button.getAttribute('aria-label') || ''))
    const addWorkspace = buttons.find((button) => /^Add workspace$/iu.test(button.getAttribute('aria-label') || ''))
    const activeProjects = buttons.find((button) => /^Toggle active projects$/iu.test(button.getAttribute('aria-label') || '')) ??
      buttons.find((button) => /^Active Projects/iu.test((button.innerText || '').trim()))
    return {
      sidebar: toPoint(sidebar),
      search: info(search ?? null, 'workspaces search button'),
      addWorkspace: info(addWorkspace ?? null, 'add workspace button'),
      activeProjects: info(activeProjects ?? null, 'active projects header'),
    }
  },

  /**
   * Scroll one real-answer element into view and return its click point: answer heading,
   * one numbered checklist step, or the closing tip/risk paragraph.
   */
  answerTargetPoint: (kind) => {
    const textOf = (element) => (element.innerText || '').trim()
    const scope =
      [...document.querySelectorAll('[data-slot="conversation.chat.flow"], [data-slot="conversation.session"]')].find((element) => textOf(element).length > 200) ??
      document.querySelector('[data-conversation-scroll]')
    if (scope === null || scope === undefined) return { ok: false, kind, reason: 'no transcript scope' }
    let element = null
    const isUserText = (candidate) => candidate.closest('[data-chat-flow-kind="user"]') !== null
    if (kind === 'heading') {
      element =
        [...scope.querySelectorAll('h1, h2, h3, h4')].find((candidate) => !isUserText(candidate) && textOf(candidate).length > 3) ??
        [...scope.querySelectorAll('strong')].find((candidate) => !isUserText(candidate) && textOf(candidate).length > 3 && textOf(candidate).length < 90) ??
        null
    } else if (kind === 'step') {
      const items = [...scope.querySelectorAll('li')].filter((candidate) => !isUserText(candidate))
      element =
        items.find((candidate) => /(^|\s)(\d+[.)]|step|checklist)/iu.test(textOf(candidate)) && textOf(candidate).length > 8) ??
        items.find((candidate) => textOf(candidate).length > 8) ??
        null
    } else if (kind === 'tip') {
      const isUserNode = (candidate) => candidate.closest('[data-chat-flow-kind="user"]') !== null
      const leaves = [...scope.querySelectorAll('p, li, td, span, strong')].filter((candidate) => {
        if (isUserNode(candidate)) return false
        const text = textOf(candidate)
        return text.length >= 12 && text.length <= 340 && /(tip|risk|rollback|remember|advice|practical|caution)/iu.test(text)
      })
      const preferred = leaves.filter((candidate) => /^one (practical )?tip[:\s]|^tip[:\s]|practical tip/iu.test(textOf(candidate)))
      element = preferred.find((candidate) => candidate.childElementCount === 0) ?? preferred[0] ?? leaves.find((candidate) => candidate.childElementCount === 0) ?? leaves[0] ?? null
      if (element === null) {
        const paragraphs = [...scope.querySelectorAll('p')].filter((candidate) => !isUserNode(candidate) && textOf(candidate).length > 20)
        element = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : null
      }
    }
    if (element === null) return { ok: false, kind, reason: 'no matching answer element' }
    element.scrollIntoView({ block: 'center', behavior: 'instant' })
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return { ok: false, kind, reason: 'element has no box after scrolling' }
    return {
      ok: true,
      kind,
      point: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), width: Math.round(rect.width), height: Math.round(rect.height) },
      text: textOf(element).slice(0, 180),
    }
  },

  /** Geometry for the composer-chat crop (new-shell transcript nodes + composer + rail cards). */
  chatWindowParts: () => {
    const toBox = (element) => {
      if (element === null || element === undefined) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const union = (boxes) => {
      if (boxes.length === 0) return null
      return {
        x: Math.min(...boxes.map((box) => box.x)),
        y: Math.min(...boxes.map((box) => box.y)),
        width: Math.max(...boxes.map((box) => box.x + box.width)) - Math.min(...boxes.map((box) => box.x)),
        height: Math.max(...boxes.map((box) => box.y + box.height)) - Math.min(...boxes.map((box) => box.y)),
      }
    }
    const nodes = [...document.querySelectorAll('[data-chat-anchor-key]')]
      .map(toBox)
      .filter((box) => box !== null && box.y < innerHeight && box.y + box.height > 0)
    return {
      messages: union(nodes),
      messageCount: nodes.length,
      userNodes: document.querySelectorAll('[data-chat-flow-kind="user"]').length,
      composer: toBox(document.querySelector('[data-conversation-region="composer"]')),
      rail: toBox(document.querySelector('[data-psp-rail]')),
      searchCard: toBox(document.querySelector('[data-psp-search-card]')),
      previewCard: toBox(document.querySelector('[data-psp-preview-card]')),
      scroll: toBox(document.querySelector('[data-conversation-scroll]')),
      viewport: { width: innerWidth, height: innerHeight },
    }
  },

  /** Geometry for the composer-chat crop: transcript messages, composer, prompt rail cards. */
  composerChatParts: () => {
    const toBox = (element) => {
      if (element === null || element === undefined) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const messages = [...document.querySelectorAll('[data-message-id]')]
      .map(toBox)
      .filter((box) => box !== null && box.y < innerHeight && box.y + box.height > 0)
    const union = (boxes) => {
      if (boxes.length === 0) return null
      const left = Math.min(...boxes.map((box) => box.x))
      const top = Math.min(...boxes.map((box) => box.y))
      const right = Math.max(...boxes.map((box) => box.x + box.width))
      const bottom = Math.max(...boxes.map((box) => box.y + box.height))
      return { x: left, y: top, width: right - left, height: bottom - top }
    }
    return {
      messages: union(messages),
      messageCount: messages.length,
      composer: toBox(document.querySelector('[data-conversation-region="composer"]')),
      rail: toBox(document.querySelector('[data-psp-rail]')),
      searchCard: toBox(document.querySelector('[data-psp-search-card]')),
      previewCard: toBox(document.querySelector('[data-psp-preview-card]')),
      scroll: toBox(document.querySelector('[data-conversation-scroll]')),
      viewport: { width: innerWidth, height: innerHeight },
    }
  },

  /** Prompt-rail tick click points (for the hover preview in composer-chat). */
  promptRailMarks: () => [...document.querySelectorAll('[data-psp-mark]')].map((mark) => {
    const rect = mark.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), index: Number(mark.getAttribute('data-psp-index') || 0) }
  }).filter((mark) => mark !== null),

  /** Annotation-workflow facts (mode, rail, entries, markers, composer chips). */
  annotationWorkflowState: () => ({
    active: document.documentElement.getAttribute('data-psa-active'),
    rail: document.querySelector('[data-psa-rail]') !== null,
    entries: document.querySelectorAll('[data-psa-entry]').length,
    markers: document.querySelectorAll('.psa-mark').length,
    chips: document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-decorator="true"]').length,
    exitConfirm: document.querySelector('[data-psa-exit-confirm]') !== null,
    feedback: (document.querySelector('[data-psa-feedback]')?.innerText || '').trim(),
    session: document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? null
  }),

  /** Native New Session button centre (largest visible control in the sidebar header). */
  newSessionPoint: () => {
    let best = null
    for (const button of document.querySelectorAll('button')) {
      const aria = button.getAttribute('aria-label') || ''
      if (!/^New session$/iu.test(aria)) continue
      const rect = button.getBoundingClientRect()
      if (rect.width < 120 || rect.height < 28) continue
      if (rect.left > 420 || rect.top > 220) continue
      if (best === null || rect.width * rect.height > best.area) {
        best = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), area: rect.width * rect.height }
      }
    }
    return best === null ? null : { x: best.x, y: best.y }
  },

  /**
   * Locate the "DSH" Workspace row (the checkout/harness Workspace explicitly allowed as
   * the isolated real-task Workspace when the native add-workspace flow cannot be driven
   * in headless Chrome). Returns its own "New session in DSH" action point.
   */
  dshWorkspaceInfo: () => {
    const toPoint = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    for (const row of document.querySelectorAll('[data-row-key^="workspace:"]')) {
      const title = (row.querySelector('[class*="_title"]')?.innerText || '').trim()
      if (!/^DSH$/iu.test(title)) continue
      row.scrollIntoView({ block: 'center' })
      const buttons = [...row.querySelectorAll('button')]
      const newSession = buttons.find((button) => /^New session in /iu.test(button.getAttribute('aria-label') || '')) ?? null
      const actions = buttons.find((button) => /^Workspace actions for /iu.test(button.getAttribute('aria-label') || '')) ?? null
      return {
        found: true,
        name: title,
        rowKey: row.getAttribute('data-row-key'),
        row: toPoint(row),
        newSession: toPoint(newSession),
        hasNewSession: newSession !== null,
        hasActions: actions !== null,
        actions: toPoint(actions),
        expanded: row.getAttribute('aria-expanded'),
      }
    }
    return { found: false }
  },

  /** Centre of one native Session row (restores the previous Session after the dummy pose). */
  sessionRowPoint: (sessionId) => {
    const row = document.querySelector('[data-row-key="session:' + sessionId + '"]')
    if (row === null) return null
    row.scrollIntoView({ block: 'center' })
    const rect = row.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return { x: Math.round(rect.left + 80), y: Math.round(rect.top + rect.height / 2) }
  },

  /** Remove the injected dummy card + styles. */
  removeDummyAnswer: () => {
    document.getElementById('psd-readme-dummy-answer')?.remove()
    document.getElementById('psd-readme-dummy-style')?.remove()
    return true
  },

  /** Current Session identity + composer state (no transcript text is returned). */
  sessionState: () => {
    const session = document.querySelector('[data-conversation-session]')
    const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
    return {
      sessionId: session === null ? null : session.getAttribute('data-conversation-session'),
      hasComposer: editor !== null,
      draftLength: editor === null ? 0 : (editor.innerText || '').trim().length,
      messages: document.querySelectorAll('[data-conversation-message]').length,
      htmlInterrupted: document.documentElement.getAttribute('data-power-suite-interrupted'),
    }
  },

  /** Card rows without any user text: state, geometry and click/hover points only. */
  cardRows: () => {
    const toBox = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    const point = (element, offset) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: Math.round(rect.left + offset), y: Math.round(rect.top + rect.height / 2) }
    }
    return [...document.querySelectorAll('.psd-run')].map((row, index) => ({
      index,
      state: row.getAttribute('data-state'),
      current: row.getAttribute('aria-current') === 'true',
      menuable: row.getAttribute('data-menuable') === 'true',
      rect: toBox(row),
      mainPoint: point(row.querySelector('.psd-run-main'), Math.min(80, Math.max(24, row.getBoundingClientRect().width / 2))),
      triggerPoint: point(row.querySelector('.psd-run-more'), 10),
    }))
  },

  /** Whether the idle composer/content background is empty of user text. */
  hoverCardState: () => {
    const card = document.querySelector('[data-psd-hovercard]')
    if (card === null) return null
    const rect = card.getBoundingClientRect()
    return { textLength: (card.innerText || '').trim().length, width: Math.round(rect.width), height: Math.round(rect.height) }
  },

  /** Whether one card row is still hovered (the hover card's anchor row). */
  hoveredCardRows: () => document.querySelectorAll('.psd-run:hover, .psd-child:hover').length,

  /** Dismiss the hover card by parking the pointer away from the sidebar/card. */
  parkPointer: () => {
    const target = document.querySelector('[data-slot="main"]')
    const rect = target === null ? { left: 600, top: 400, width: 400, height: 200 } : target.getBoundingClientRect()
    return {
      x: Math.round(rect.left + Math.max(40, rect.width / 2)),
      y: Math.round(rect.top + Math.max(40, rect.height / 2)),
    }
  },

  /** Scan the innerText of the pose's scan roots for banned substrings. */
  scanText: (selectors, sources) => {
    const patterns = sources.map(([label, source]) => [label, new RegExp(source, 'iu')])
    const parts = []
    const missing = []
    for (const selector of selectors) {
      const nodes = [...document.querySelectorAll(selector)]
      if (nodes.length === 0) missing.push(selector)
      for (const element of nodes) parts.push(element.innerText || '')
    }
    const text = parts.join('\n')
    const hits = patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
    return {
      textLength: text.trim().length,
      missing,
      hits,
      sample: hits.length === 0 ? '' : text.replace(/\s+/gu, ' ').slice(0, 240),
    }
  },

  /**
   * Scan every visible text node whose box intersects the clip: this approximates the
   * text a viewer of the cropped screenshot would see, including fixed overlays (hover
   * card, menu, quick look) while skipping display:none / visibility:hidden subtrees,
   * faded-out layers (opacity < 0.1) and anything outside the crop.
   */
  scanClip: (rect, sources) => {
    const patterns = sources.map(([label, source]) => [label, new RegExp(source, 'iu')])
    const texts = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let nodes = 0
    while (walker.nextNode()) {
      const node = walker.currentNode
      const value = node.nodeValue || ''
      if (value.trim().length === 0) continue
      const element = node.parentElement
      if (element === null) continue
      const tag = element.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility !== 'visible') continue
      let opacity = 1
      for (let parent = element; parent !== null; parent = parent.parentElement) {
        const value = Number.parseFloat(getComputedStyle(parent).opacity)
        if (Number.isFinite(value)) opacity *= value
        if (opacity < 0.1) break
      }
      if (opacity < 0.1) continue
      const box = element.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) continue
      if (box.right <= rect.x || box.left >= rect.x + rect.width) continue
      if (box.bottom <= rect.y || box.top >= rect.y + rect.height) continue
      texts.push(value.trim())
      nodes += 1
    }
    const text = texts.join(' ')
    const hits = patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
    return {
      textLength: text.length,
      nodes,
      hits,
      sample: hits.length === 0 ? '' : text.replace(/\s+/gu, ' ').slice(0, 240),
    }
  },

  /** Scan the rendered whole-page text (transcript/header hidden, titles masked). */
  scanDocument: (sources) => {
    const patterns = sources.map(([label, source]) => [label, new RegExp(source, 'iu')])
    const text = document.body.innerText || ''
    const hits = patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
    return {
      textLength: text.trim().length,
      hits,
      sample: hits.length === 0 ? '' : text.replace(/\s+/gu, ' ').slice(0, 300),
    }
  },

  /** Write the current cards + settings + artifacts facts used for the run log (no user text). */
  facts: () => {
    const count = (selector) => document.querySelectorAll(selector).length
    return {
      cardRows: count('.psd-run'),
      cardChildren: count('.psd-child'),
      nativeSessionRows: count('[data-row-key^="session:"]'),
      nativeWorkspaceRows: count('[data-row-key^="workspace:"]'),
      artifactsRows: count('.dsa-row'),
      promptMarks: count('[data-psp-mark]'),
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
    }
  },
}

/** Install the CDP Fetch stubs that serve demo artifacts + prompt history to the page. */
/** Mutable stub state: Sessions whose real prompt history must reach the page unstubbed. */
const README_STUB_STATE = { realPromptSessionIds: new Set() }

async function installReadmeStubs(cdp, page) {
  const fulfill = (requestId, status, mime, body) =>
    cdp
      .send(
        'Fetch.fulfillRequest',
        {
          requestId,
          responseCode: status,
          responseHeaders: [
            { name: 'content-type', value: mime },
            { name: 'cache-control', value: 'no-store' },
          ],
          body: Buffer.from(body, 'utf8').toString('base64'),
        },
        page.sessionId
      )
      .catch((error) => log(`warning: readme stub fulfill failed: ${short(error?.message || String(error), 160)}`))
  cdp.on('Fetch.requestPaused', async (params, eventSession) => {
    if (eventSession !== page.sessionId) return
    const url = params.request.url
    try {
      if (url.includes('/api/session-artifacts.list')) {
        await fulfill(params.requestId, 200, 'application/json', JSON.stringify(README_STUB_ARTIFACTS))
      } else if (url.includes('/api/session-artifacts.preview')) {
        await fulfill(params.requestId, 200, 'application/json', JSON.stringify(README_STUB_PREVIEW))
      } else if (url.includes('/api/session-artifacts.raw')) {
        const rawUrl = new URL(url)
        const rawPath = rawUrl.searchParams.get('path') || ''
        if (rawPath.endsWith('.svg')) await fulfill(params.requestId, 200, 'image/svg+xml', README_STUB_SVG)
        else await fulfill(params.requestId, 200, 'text/markdown; charset=utf-8', README_STUB_MARKDOWN)
      } else if (url.includes('/api/prompt-history.list')) {
        const sessionId = new URL(url).searchParams.get('sessionId') || ''
        if (README_STUB_STATE.realPromptSessionIds.has(sessionId)) {
          await cdp.send('Fetch.continueRequest', { requestId: params.requestId }, page.sessionId)
        } else {
          await fulfill(params.requestId, 200, 'application/json', JSON.stringify(README_STUB_PROMPTS))
        }
      } else {
        await cdp.send('Fetch.continueRequest', { requestId: params.requestId }, page.sessionId)
      }
    } catch (error) {
      log(`warning: readme stub handler failed: ${short(error?.message || String(error), 160)}`)
    }
  })
  await cdp.send(
    'Fetch.enable',
    {
      patterns: [
        { urlPattern: '*api/session-artifacts.list*', requestStage: 'Request' },
        { urlPattern: '*api/session-artifacts.preview*', requestStage: 'Request' },
        { urlPattern: '*api/session-artifacts.raw*', requestStage: 'Request' },
        { urlPattern: '*api/prompt-history.list*', requestStage: 'Request' },
      ],
    },
    page.sessionId
  )
  return true
}

/** Demo copy passed to the page-side masker. */
const README_MASK_COPY = {
  sessionTitles: README_SESSION_TITLES,
  workspaceTitles: README_WORKSPACE_TITLES,
  hoverWorkspace: README_HOVER_WORKSPACE,
  hoverPath: README_HOVER_PATH,
  previewPrompt: README_PREVIEW_PROMPT,
  bannedSources: README_BANNED_SOURCES,
}

/** Demo-only capture copy: keep the isolated instance's seeded demo titles visible. */
const README_MASK_COPY_DEMO = { ...README_MASK_COPY, keepDemoTitles: true }

/** Active default mask copy for `readmeCapture` (set by the isolated demo modes). */
let README_ACTIVE_MASK_COPY = null

/** Clamp one measured box to the viewport and add the contract's 12 px padding. */
function readmeClipFromRect(rect, pad = README_CLIP_PAD) {
  assert(rect !== null && Number.isFinite(rect.x) && Number.isFinite(rect.y), 'capture clip could not be measured')
  const x = Math.max(0, Math.floor(rect.x - pad))
  const y = Math.max(0, Math.floor(rect.y - pad))
  const right = Math.min(VIEWPORT.width, Math.ceil(rect.x + rect.width + pad))
  const bottom = Math.min(README_VIEWPORT_HEIGHT, Math.ceil(rect.y + rect.height + pad))
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/** Screenshot file name -> PNG dimensions from the IHDR chunk. */
function readmePngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/** Escape every open popup/overlay and park the pointer away from live rows. */
async function readmeResetUi(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.eval(
      () =>
        document.querySelectorAll('[role="menu"], .dsa-filter-menu, .dsa-quicklook, [data-psp-search-card], [data-psd-hovercard]').length > 0
    )
    if (!open) break
    await page.pressEscape()
    await sleep(300)
  }
  try {
    const park = await page.eval(probeReadme.parkPointer)
    await page.moveTo(park.x, park.y)
  } catch {
    // parking is best effort
  }
  await sleep(350)
}

/** Wait until an element's rect stops changing (layout/scroll animations settle). */
async function readmeWaitStableRect(page, selector, { timeout = 6000, interval = 150 } = {}) {
  const readRect = () =>
    page.eval((target) => {
      const element = document.querySelector(target)
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    }, selector)
  const deadline = Date.now() + timeout
  let previous = null
  let stableSamples = 0
  while (Date.now() < deadline) {
    const current = await readRect()
    if (current !== null && previous !== null) {
      const same = ['x', 'y', 'width', 'height'].every((key) => current[key] === previous[key])
      stableSamples = same ? stableSamples + 1 : 0
      if (stableSamples >= 2) return current
    }
    previous = current
    await sleep(interval)
  }
  const fallback = await readRect()
  assert(fallback !== null, `layout for ${selector} never settled (rect could not be measured)`)
  return fallback
}

/** Send one prompt through the real composer (type + native send action). */
async function readmeSendChatPrompt(page, promptText) {
  const points = await page.eval(probeReadme.chatSendPoints)
  assert(points !== null && points.editor !== null, 'the composer editor could not be measured')
  assert(points.send !== null, 'the composer send control could not be measured')
  const before = await page.eval(probeReadme.chatState)
  await page.clickAt(points.editor.x, points.editor.y)
  await sleep(250)
  await page.send('Input.insertText', { text: promptText })
  await sleep(450)
  const typed = await page.eval(probeReadme.chatState)
  assert(typed.draftLength > 10, `the prompt was not typed into the composer (draft ${typed.draftLength} chars)`)
  await page.clickAt(points.send.x, points.send.y)
  await page.waitForFn(
    (previousMessages) => {
      const messageCount = document.querySelectorAll('[data-message-id]').length
      const editor = document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')
      const draftLength = editor === null ? 0 : (editor.innerText || '').trim().length
      return messageCount > previousMessages || draftLength === 0
    },
    [before.messages],
    { timeout: 15000, label: 'prompt accepted by the composer', interval: 200 }
  ).catch(() => {})
  return { before, typed }
}

/** Wait until the assistant answer is rendered and the turn has settled (stable text). */
async function readmeWaitChatAnswer(page, { timeout = 180000 } = {}) {
  const deadline = Date.now() + timeout
  let lastLength = -1
  let stableSamples = 0
  let state = null
  while (Date.now() < deadline) {
    state = await page.eval(probeReadme.chatState)
    const length = state.lastTextLength
    if (state.messages >= 2 && length > 80 && length === lastLength) stableSamples += 1
    else stableSamples = 0
    if (stableSamples >= 3) return state
    lastLength = length
    await sleep(1500)
  }
  throw new Error(
    `the model answer did not finish within ${timeout}ms ` +
      `(messages ${state === null ? 'n/a' : state.messages}, last message ${state === null ? 'n/a' : state.lastTextLength} chars, ` +
      `draft ${state === null ? 'n/a' : state.draftLength} chars)`
  )
}

/** Open the prompt-history search card and optionally filter it, returning the toggle point. */
async function readmeOpenPromptRail(page, queryText) {
  await page.waitForFn(() => document.querySelector('[data-psp-search-toggle]') !== null, [], {
    timeout: 15000,
    label: 'prompt-history rail for the real chat Session',
  })
  const toggle = await page.findRect('[data-psp-search-toggle]')
  assert(toggle, 'the prompt-history search toggle is not visible')
  await page.clickAt(toggle.x, toggle.y)
  await page.waitForFn(() => document.querySelector('[data-psp-search-card]') !== null, [], {
    timeout: 5000,
    label: 'prompt-history search card',
  })
  if (typeof queryText === 'string' && queryText.length > 0) {
    const input = await page.findRect('.psp-search-input')
    assert(input, 'the prompt-history search input is not visible')
    await page.clickAt(input.x, input.y)
    await sleep(150)
    await page.send('Input.insertText', { text: queryText })
    await page.waitForFn(
      (text) => document.querySelector('.psp-search-input') !== null && document.querySelector('.psp-search-input').value === text,
      [queryText],
      { timeout: 5000, label: `prompt search filtered to "${queryText}"` }
    )
  }
  await sleep(250)
  return toggle
}

/**
 * Hover a prompt-rail tick and wait for the full-text preview card. Prefers a tick whose
 * preview card does not overlap the open search card; returns the measured geometry.
 */
async function readmeHoverRailPreview(page) {
  const marks = await page.eval(probeReadme.promptRailMarks)
  assert(marks.length > 0, 'the prompt rail renders no tick marks for the real chat Session')
  const park = await page.eval(probeReadme.parkPointer)
  const ordered = [...marks].sort((left, right) => left.y - right.y)
  for (const mark of ordered) {
    await page.moveTo(park.x, park.y)
    await sleep(220)
    await page.moveTo(mark.x, mark.y)
    const deadline = Date.now() + 3000
    let preview = null
    while (Date.now() < deadline) {
      await sleep(120)
      preview = await page.eval(() => {
        const card = document.querySelector('[data-psp-preview-card]')
        if (card === null) return null
        const rect = card.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, textLength: (card.innerText || '').trim().length }
      })
      if (preview !== null && preview.textLength > 10) break
    }
    if (preview === null) continue
    const parts = await page.eval(probeReadme.composerChatParts)
    const overlaps = (left, right) =>
      left !== null && right !== null &&
      left.x < right.x + right.width && left.x + left.width > right.x &&
      left.y < right.y + right.height && left.y + left.height > right.y
    if (!overlaps(preview, parts.searchCard)) return { preview, parts, mark }
  }
  const fallbackParts = await page.eval(probeReadme.composerChatParts)
  const fallbackPreview = fallbackParts.previewCard
  assert(fallbackPreview !== null, 'the prompt-rail hover preview card did not open')
  return { preview: fallbackPreview, parts: fallbackParts, mark: ordered[ordered.length - 1] }
}

/** Crop the real chat window (messages + composer + prompt rail) for composer-chat.png. */
function readmeChatClip(parts) {
  const right = Math.min(
    parts.viewport.width,
    Math.max(
      parts.composer === null ? 0 : parts.composer.x + parts.composer.width,
      parts.rail === null ? 0 : parts.rail.x + parts.rail.width,
      parts.searchCard === null ? 0 : parts.searchCard.x + parts.searchCard.width,
      parts.previewCard === null ? 0 : parts.previewCard.x + parts.previewCard.width
    ) + 12
  )
  const contentLeft = Math.min(
    parts.composer === null ? right : parts.composer.x,
    parts.messages === null ? right : parts.messages.x
  )
  const left = Math.max(0, Math.min(right - 1300, contentLeft - 12))
  return { x: Math.round(left), y: 0, width: Math.round(Math.min(parts.viewport.width, right - left)), height: parts.viewport.height }
}

/**
 * Archive the isolated real-task Session through its native row "…" menu (only that
 * Session; nothing else is touched), returning an honest cleanup record.
 */
async function readmeArchiveTaskSession(page, sessionId, workspaceName) {
  const ensureRow = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = await page.eval((id) => {
        const found = document.querySelector(`[data-row-key="session:${id}"]`)
        if (found === null) return null
        found.scrollIntoView({ block: 'center' })
        const rect = found.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
      }, sessionId)
      if (row !== null) return row
      await page.eval((expectedWorkspace) => {
        for (const workspaceRow of document.querySelectorAll('[data-row-key^="workspace:"]')) {
          const title = (workspaceRow.querySelector('[class*="_title"]')?.innerText || '').trim()
          if (expectedWorkspace !== null && title !== expectedWorkspace) continue
          if (workspaceRow.getAttribute('aria-expanded') === 'false') workspaceRow.click()
          return true
        }
        return false
      }, workspaceName ?? null)
      await sleep(600)
    }
    return null
  }
  const row = await ensureRow()
  if (row === null) return { archived: false, reason: 'the real-task Session row was not reachable in the native sidebar' }
  await page.moveTo(900, 500)
  await sleep(150)
  await page.moveTo(row.left + 80, row.top + Math.round(row.height / 2))
  await sleep(800)
  const trigger = await page.eval((id) => {
    const row = document.querySelector(`[data-row-key="session:${id}"]`)
    if (row === null) return null
    const button = row.querySelector('button[data-context-menu-trigger]')
    if (button === null) return null
    const rect = button.getBoundingClientRect()
    if (rect.width <= 0) return null
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  }, sessionId)
  if (trigger === null) return { archived: false, reason: 'the real-task Session row "…" trigger was not reachable on hover' }
  await page.moveTo(trigger.x, trigger.y)
  await sleep(250)
  await page.clickAt(trigger.x, trigger.y)
  await page.waitForFn(() => document.querySelector('[role="menu"]') !== null, [], {
    timeout: 8000,
    label: 'real-task Session row context menu',
  })
  const clicked = await page.eval(() => {
    for (const item of document.querySelectorAll('[role="menuitem"]')) {
      if (!/^Archive session$/iu.test((item.innerText || '').trim().split('\n')[0])) continue
      item.click()
      return true
    }
    return false
  })
  if (clicked !== true) {
    await page.pressEscape()
    return { archived: false, reason: 'the native menu had no "Archive session" item' }
  }
  await page.waitForFn((id) => document.querySelector(`[data-row-key="session:${id}"]`) === null, [sessionId], {
    timeout: 10000,
    label: 'archived real-task Session row removed',
  }).catch(() => {})
  const gone = (await page.count(`[data-row-key="session:${sessionId}"]`)) === 0
  return { archived: gone, reason: gone ? 'archived through the native row "…" menu (Archive session)' : 'the row stayed visible after Archive session' }
}

/**
 * Widen the native sidebar by dragging its resize handle, so the demo Session titles in the
 * Running & recent panel render in full (no ellipsis) for the isolated demo captures.
 * @param {object} page - Page wrapper.
 * @param {object} [options] - `{ delta }` pixels to drag.
 * @returns {Promise<{before: number, after: number}>} panel widths.
 */
async function readmeWidenSidebar(page, { delta = 170 } = {}) {
  const measure = () => page.evaluate(`(() => {
    const panel = document.querySelector('.psd-panel')
    const panelRect = panel === null ? null : panel.getBoundingClientRect()
    const handle = [...document.querySelectorAll('*')].find((el) => {
      const style = getComputedStyle(el)
      if (style.cursor !== 'col-resize' && style.cursor !== 'ew-resize') return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.width < 24 && rect.height > 300
    })
    const rect = handle === undefined ? null : handle.getBoundingClientRect()
    return {
      panelWidth: panelRect === null ? 0 : Math.round(panelRect.width),
      handle: rect === null ? null : { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
    }
  })()`)
  const before = await measure()
  if (before.handle === null || before.panelWidth >= 300) return { before: before.panelWidth, after: before.panelWidth }
  const { x, y } = before.handle
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  for (let step = 1; step <= 8; step += 1) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + Math.round((delta * step) / 8), y, button: 'left', buttons: 1 })
    await sleep(40)
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + delta, y, button: 'left', clickCount: 1 })
  await sleep(800)
  // The shell clamps the sidebar at ~376 px; let the demo capture widen the sidebar column a
  // bit further so the seeded demo Session titles render in full (isolated demo page only).
  await page.evaluate(`(() => {
    document.getElementById('psd-readme-demo-width')?.remove()
    const style = document.createElement('style')
    style.id = 'psd-readme-demo-width'
    style.textContent = [
      '[class$="_sidebarCol"]{width:460px!important;min-width:460px!important;max-width:460px!important}',
      '[class$="_sidebarCol"] [class$="_root"],[class$="_sidebarCol"] [class$="_regionArea"]{width:auto!important;max-width:none!important}',
    ].join('')
    document.head.appendChild(style)
    return true
  })()`)
  await sleep(700)
  const after = await measure()
  log(`sidebar widened for the demo captures: Running & recent panel ${before.panelWidth} -> ${after.panelWidth} CSS px`)
  return { before: before.panelWidth, after: after.panelWidth }
}

/** Ensure the Running & recent card is expanded (its chevron toggles the body). */
async function readmeEnsureCardExpanded(page) {
  const expanded = await page.eval(() => document.querySelector('.psd-panel-toggle')?.getAttribute('aria-expanded') ?? null)
  if (expanded === 'false') {
    await page.eval(() => document.querySelector('.psd-panel-toggle')?.click())
    await sleep(500)
  }
  await page.waitForFn(() => document.querySelector('.psd-panel-toggle')?.getAttribute('aria-expanded') === 'true', [], {
    timeout: 5000,
    label: 'Running & recent card expanded',
  })
}

/** Collapse the Running & recent card so the Workspaces crop gets the full column height. */
async function readmeCollapseCard(page) {
  const expanded = await page.eval(() => document.querySelector('.psd-panel-toggle')?.getAttribute('aria-expanded') ?? null)
  if (expanded === 'true') {
    await page.eval(() => document.querySelector('.psd-panel-toggle')?.click())
    await sleep(500)
  }
  await page.waitForFn(() => document.querySelector('.psd-panel-toggle')?.getAttribute('aria-expanded') === 'false', [], {
    timeout: 5000,
    label: 'Running & recent card collapsed',
  })
}

/**
 * Mask every user-identifying string, verify the pose's scan roots + the clip region + the
 * whole rendered document against the banned patterns, then capture the clip to
 * `.tmp-work/readme-shots/raw/<name>.png`. The capture is discarded (and the pose fails)
 * when the pre- or post-capture scan finds a banned pattern.
 * @param {object} page - Page wrapper.
 * @param {object} spec - `{ name, pose, source, clip(), scanSelectors, allowDocumentScan }`.
 * @returns {Promise<object>} capture metadata for `captures.json`.
 */
async function readmeCapture(page, spec) {
  const maskCopy = spec.maskCopy ?? README_ACTIVE_MASK_COPY ?? README_MASK_COPY
  let masked = await page.eval(probeReadme.maskAll, maskCopy)
  await sleep(140)
  const secondPass = await page.eval(probeReadme.maskAll, maskCopy)
  for (const [key, value] of Object.entries(secondPass)) masked[key] = (masked[key] ?? 0) + value
  if (typeof spec.postMask === 'function') {
    const extra = await spec.postMask()
    for (const [key, value] of Object.entries(extra ?? {})) masked[key] = (masked[key] ?? 0) + value
  }
  const rect = await spec.clip()
  const clip = readmeClipFromRect(rect, spec.pad === undefined ? README_CLIP_PAD : spec.pad)
  assert(clip.width >= 40 && clip.height >= 40, `${spec.name}: measured clip is too small (${clip.width}x${clip.height})`)
  let roots = await page.eval(probeReadme.scanText, spec.scanSelectors, README_BANNED_SOURCES)
  let area = await page.eval(probeReadme.scanClip, clip, README_BANNED_SOURCES)
  if (roots.hits.length > 0 || area.hits.length > 0) {
    await page.eval(probeReadme.maskAll, maskCopy)
    roots = await page.eval(probeReadme.scanText, spec.scanSelectors, README_BANNED_SOURCES)
    area = await page.eval(probeReadme.scanClip, clip, README_BANNED_SOURCES)
  }
  assert(
    roots.hits.length === 0,
    `${spec.name}: privacy gate — scan roots ${JSON.stringify(spec.scanSelectors)} still contain ${roots.hits.join(', ')} after masking (sample: ${short(roots.sample, 200)})`
  )
  assert(
    area.hits.length === 0,
    `${spec.name}: privacy gate — the clip region still contains ${area.hits.join(', ')} after masking (sample: ${short(area.sample, 200)})`
  )
  let documentScan = { skipped: true, reason: 'document scan disabled for this pose' }
  if (spec.allowDocumentScan !== false) {
    const pageScan = await page.eval(probeReadme.scanDocument, README_BANNED_SOURCES)
    assert(
      pageScan.hits.length === 0,
      `${spec.name}: privacy gate — the rendered page still contains ${pageScan.hits.join(', ')} after masking (sample: ${short(pageScan.sample, 220)})`
    )
    documentScan = { skipped: false, ...pageScan }
  }
  const data = await page.screenshotBase64(clip)
  const buffer = Buffer.from(data, 'base64')
  const size = readmePngSize(buffer)
  const dpr = spec.dpr === undefined ? README_DPR : spec.dpr
  assertEqual(size.width, clip.width * dpr, `${spec.name}: captured PNG width`)
  assertEqual(size.height, clip.height * dpr, `${spec.name}: captured PNG height`)
  const file = path.join(spec.directory === undefined ? README_RAW_DIR : spec.directory, spec.name)
  await writeFile(file, buffer)
  // Post-capture scan: a late React re-render must never leave real text in the file.
  const postRoots = await page.eval(probeReadme.scanText, spec.scanSelectors, README_BANNED_SOURCES)
  const postArea = await page.eval(probeReadme.scanClip, clip, README_BANNED_SOURCES)
  if (postRoots.hits.length > 0 || postArea.hits.length > 0) {
    await rm(file, { force: true }).catch(() => {})
    throw new Error(
      `${spec.name}: post-capture privacy scan failed (${postRoots.hits.concat(postArea.hits).join(', ')}); the capture was discarded`
    )
  }
  log(
    `readme capture: ${spec.name} ${clip.width}x${clip.height} CSS -> ${size.width}x${size.height}px ` +
      `(roots ${roots.textLength} chars, area ${area.textLength} chars, page ${documentScan.skipped === true ? 'scan skipped' : `${documentScan.textLength} chars`}; masked ${JSON.stringify(masked)})`
  )
  return {
    file: spec.name,
    source: spec.source,
    pose: spec.pose,
    rect: clip,
    dpr,
    screenshot: { width: size.width, height: size.height, bytes: buffer.length },
    theme: 'light',
    ...(spec.meta === undefined ? {} : spec.meta),
    masked,
    scan: {
      roots: { selectors: spec.scanSelectors, textLength: roots.textLength, hits: roots.hits },
      clip: { textLength: area.textLength, nodes: area.nodes, hits: area.hits },
      document: documentScan,
      postCapture: { roots: postRoots.textLength, clip: postArea.textLength, hits: postRoots.hits.concat(postArea.hits) },
    },
  }
}

/**
 * Pick a card row for the hover / menu poses: a running top-level row first (the design's
 * "running row" pose), otherwise the first rendered row.
 * @param {object} page - Page wrapper.
 * @returns {Promise<object>} the chosen row facts.
 */
async function readmePickCardRow(page) {
  const rows = await page.eval(probeReadme.cardRows)
  assert(rows.length > 0, 'the Running & recent card renders no rows in this live GUI; the pose needs at least one')
  const running = rows.filter((row) => row.state === 'running' && row.mainPoint !== null)
  const target = running.length > 0 ? running[0] : rows.find((row) => row.mainPoint !== null)
  assert(target, 'no clickable card row in this live GUI')
  return target
}

/**
 * Hover one card row and wait for its native-style hover card; retries on live re-sorts.
 * @param {object} page - Page wrapper.
 * @param {object} row - row facts from `readmePickCardRow`.
 * @returns {Promise<object>} the hover card state.
 */
async function readmeOpenCardHover(page, row) {
  const park = await page.eval(probeReadme.parkPointer)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.moveTo(park.x, park.y)
    await sleep(180)
    await page.moveTo(row.mainPoint.x, row.mainPoint.y)
    const deadline = Date.now() + 2600
    while (Date.now() < deadline) {
      await sleep(100)
      const hover = await page.eval(probeReadme.hoverCardState)
      const hovered = await page.eval(probeReadme.hoveredCardRows)
      if (hover !== null && hover.textLength > 30 && hovered > 0) return hover
    }
  }
  throw new Error('the card row hover card did not open (live list kept re-sorting); no capture written')
}

/** Wait for the native shared context menu opened by the card row "…" trigger. */
async function readmeWaitRowMenu(page) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const state = await page.eval(() => {
      const surface = document.querySelector('[data-menu-material]')
      if (surface === null) return null
      const rect = surface.getBoundingClientRect()
      const openRow = document.querySelector('.psd-run[data-menu-open="true"]')
      return {
        menu: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        row: openRow === null ? null : (() => {
          const rowRect = openRow.getBoundingClientRect()
          return { x: rowRect.x, y: rowRect.y, width: rowRect.width, height: rowRect.height }
        })(),
        items: document.querySelectorAll('[role="menuitem"]').length,
      }
    })
    if (state !== null && state.items > 0) return state
    await sleep(120)
  }
  throw new Error('the card row "…" shared menu did not open; no capture written')
}

/** Wait for the stubbed artifacts list to settle with the four demo rows. */
async function readmeWaitArtifactsReady(page) {
  await openArtifactsByPointer(page)
  await waitArtifactsOpen(page)
  await waitArtifactsPanelSettled(page)
  await page.waitForFn(
    (expected) => document.querySelectorAll('.dsa-row').length === expected,
    [README_STUB_ARTIFACTS.artifacts.length],
    { timeout: 8000, label: 'stubbed artifact rows' }
  )
  await sleep(350)
}

/** Keep the artifacts overlay open (re-open it through the Files header when needed). */
async function readmeEnsureArtifacts(page) {
  const rows = await page.count('.dsa-row')
  if (rows === README_STUB_ARTIFACTS.artifacts.length) return
  const overlay = await page.count('[data-psfa-overlay]')
  if (overlay === 0) {
    const files = await page.count('[data-files-artifacts-button]')
    if (files === 0) await openFilesTab(page)
    await readmeWaitArtifactsReady(page)
    return
  }
  await page.waitForFn(
    (expected) => document.querySelectorAll('.dsa-row').length === expected,
    [README_STUB_ARTIFACTS.artifacts.length],
    { timeout: 8000, label: 'stubbed artifact rows' }
  )
}

/** Log one run-log line with the capture's file/geometry/scan facts only. */
function logReadmeCaptureState(state) {
  const captures = state.readme?.captures ?? []
  log(`\nreadme raw captures: ${captures.length}/${README_REQUIRED_FILES.length} files in ${README_RAW_DIR}`)
  for (const capture of captures) {
    log(
      `  ${capture.file}  ${capture.rect.width}x${capture.rect.height} CSS -> ${capture.screenshot.width}x${capture.screenshot.height}px  ` +
        `scan roots ${capture.scan.roots.textLength}ch/0 hits, clip ${capture.scan.clip.textLength}ch/0 hits, ` +
        `page ${capture.scan.document.skipped === true ? 'skipped' : `${capture.scan.document.textLength}ch/0 hits`}`
    )
  }
  for (const deviation of state.readme?.deviations ?? []) log(`  deviation: ${deviation}`)
}

/**
 * `--readme-shots`: pose the live GUI's documented seams/stubs and capture the raw PNGs the
 * README Bento composer consumes. Never creates a Session, sends a prompt, types into a
 * Session, pins/unpins, archives or changes a persisted setting; every real user string in
 * the captured page is masked before each shot and scanned against the banned patterns.
 * @param {object} input - `{ page, results, state, cdp }`.
 * @returns {Promise<void>}
 */
async function runReadmeShotsMode({ page, results, state, cdp, opts }) {
  log('\n=== --readme-shots: README Bento raw captures (privacy-masked, demo stubs) ===')
  state.mode = 'readme-shots'
  const dashboardOnly = opts?.dashboardOnly === true
  README_ACTIVE_MASK_COPY = dashboardOnly === true ? README_MASK_COPY_DEMO : null
  state.readme = { captures: [], deviations: [], file: path.join(README_RAW_DIR, 'captures.json') }
  if (dashboardOnly !== true) {
    await rm(README_RAW_DIR, { recursive: true, force: true }).catch(() => {})
  }
  await mkdir(README_RAW_DIR, { recursive: true })
  // Round 3: the README/Bento frame is a soft pale beige, so every capture is the app's
  // LIGHT appearance. Force it for the whole pass (headless Chrome follows the host).
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
  await sleep(900)
  await page.eval(probeReadme.installStyle)
  const lightChrome = await page.evaluate(`(() => ({
    dark: document.body.hasAttribute('data-ds-dark-theme') || document.documentElement.hasAttribute('data-ds-dark-theme'),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    mainBackground: document.querySelector('[data-slot="main"]') === null ? null : getComputedStyle(document.querySelector('[data-slot="main"]')).backgroundColor,
  }))()`)
  assertEqual(lightChrome.dark, false, 'the capture pass must render the light appearance')
  log(`readme theme: light (body ${lightChrome.bodyBackground}, main ${lightChrome.mainBackground})`)
  if (dashboardOnly === true) {
    await readmeWidenSidebar(page)
    await sleep(500)
  }
  // Hydrate like the rest of the harness: the shell restores its Session and the card rows
  // asynchronously after first paint.
  await page.waitForFn(() => document.querySelectorAll('.psd-run').length > 0, [], {
    timeout: 15000,
    label: 'Running & recent card rows before the README pass',
  }).catch(() => {})
  await page.waitForFn(() => document.querySelector('[data-conversation-session]') !== null, [], {
    timeout: 15000,
    label: 'restored Session before the README pass',
  }).catch(() => {})
  await sleep(800)
  const facts = await page.eval(probeReadme.facts)
  log(`readme environment: viewport ${facts.viewport.width}x${facts.viewport.height}, dpr ${facts.devicePixelRatio}, ${facts.nativeSessionRows} native session row(s), ${facts.cardRows} card row(s), ${facts.cardChildren} nested child row(s)`)

  /** Persist `captures.json` after every capture so a mid-run failure still records evidence. */
  const writeManifest = async () => {
    const manifest = {
      generatedAt: new Date().toISOString(),
      harness: dashboardOnly === true ? 'test/browser/sidebar.e2e.mjs --readme-dashboard' : 'test/browser/sidebar.e2e.mjs --readme-shots',
      gui:
        dashboardOnly === true
          ? 'isolated DSH Preview instance at http://127.0.0.1:3199 (token redacted, DSH_HOME=/tmp/ps-readme-home)'
          : 'live DSH Web GUI (token redacted)',
      dashboardOnly: dashboardOnly === true,
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: README_DPR },
      rawDirectory: README_RAW_DIR,
      contract: 'README Bento redesign design.md §3',
      privacy: {
        hiddenSurfaces: ['conversation.header', 'conversation.session transcript', 'Files content behind the Artifacts overlay'],
        maskedSurfaces: [
          'native sidebar session titles -> allowlisted demo titles',
          'native sidebar workspace titles -> allowlisted demo workspace names',
          'card rows / subagent children titles -> allowlisted demo titles',
          'card hover-card workspace/session/path -> Power Suite / ~/Projects/Power Suite',
          'composer workspace selector -> allowlisted demo workspace name',
          'prompt-history rail hover preview text -> canned demo prompt ("Draft the release checklist and summarize the risky files")',
          'leftover banned substrings outside the hidden transcript -> "Demo"',
        ],
        demoNamePolicy:
          'allowed demo session/workspace names are cycled over 12/15 entries so a single crop never shows a repeated demo name',
        bannedPatterns: README_BANNED_PATTERNS.map(([label]) => label),
        stubRoutes: [
          'GET /api/session-artifacts.list -> demo 10-row artifact list (5 generated + 5 provided)',
          'GET /api/session-artifacts.preview -> demo release-checklist markdown descriptor',
          'GET|HEAD /api/session-artifacts.raw -> demo markdown / demo svg bytes',
          'GET /api/prompt-history.list -> canned English demo prompts',
        ],
      },
      theme: 'light',
      themeEmulation: 'CDP Emulation.setEmulatedMedia prefers-color-scheme=light (whole pass)',
      task: {
        prompt: state.readme.taskPrompt ?? null,
        sessionId: state.readme.taskSessionId ?? null,
        requirements: state.readme.taskRequirements ?? [],
        answer: state.readme.taskAnswer ?? null,
        workspace: state.readme.taskWorkspace ?? null,
        cleanup: state.readme.taskCleanup ?? null,
        fallback: state.readme.taskFallback ?? null,
      },
      captures: state.readme.captures,
      annotationAssets: state.readme.annotationAssets ?? [],
      annotationAssetsNote:
        'docs/assets/annotation-*.png were not refreshed in round 3 (light): the README annotation group now uses raw/annotation-*.png; the docs assets still come from round 2',
      deviations: state.readme.deviations,
    }
    await writeFile(state.readme.file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }

  try {
    // ---- Running & recent card ---------------------------------------------------------
    await results.check('readme-card', 'card.png — Running & recent card (running + recent rows, nested children)', async () => {
      await readmeResetUi(page)
      await readmeEnsureCardExpanded(page)
      await page.waitForFn(() => document.querySelectorAll('.psd-child').length > 0, [], {
        timeout: 6000,
        label: 'nested subagent child rows for the card pose',
      }).catch(() => {})
      const rows = await page.eval(probeReadme.cardRows)
      const fresh = await page.eval(probeReadme.facts)
      assert(rows.length > 0, 'the Running & recent card renders no rows in this live GUI')
      const capture = await readmeCapture(page, {
        name: 'card.png',
        source: 'live GUI .psd-panel (Running & recent card)',
        pose: 'card expanded: running + recent rows with nested subagent children',
        scanSelectors: ['.psd-panel'],
        clip: () => page.eval(probeReadme.boxes, { selectors: ['.psd-panel'], first: true }),
      })
      state.readme.captures.push(capture)
      if (!rows.some((row) => row.state === 'running')) state.readme.deviations.push('card.png: no running row was rendered at capture time; the card shows recent rows only')
      if (fresh.cardChildren === 0) state.readme.deviations.push('card.png: no nested subagent child row was rendered at capture time')
      state.readme.deviations.push('card.png: no pinned row was rendered (the live Host pin document is empty and this mode never pins/unpins); the card shows running/recent rows and nested children only')
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, ${rows.length} top-level rows + ${fresh.cardChildren} nested children, masked ${JSON.stringify(capture.masked)}`
    })

    // ---- Hover card over a running row -------------------------------------------------
    await results.check('readme-card-hover', 'card-hover.png — native-style row hover card (statistics / tokens / context)', async () => {
      await readmeResetUi(page)
      const row = await readmePickCardRow(page)
      const hover = await readmeOpenCardHover(page, row)
      const capture = await readmeCapture(page, {
        name: 'card-hover.png',
        source: 'live GUI card row + [data-psd-hovercard]',
        pose: 'hover card open over a card row (Session statistics / Token usage / Context usage)',
        scanSelectors: ['.psd-panel', '[data-psd-hovercard]'],
        pad: 32,
        clip: () => page.eval(probeReadme.boxes, { selectors: ['.psd-run:hover', '[data-psd-hovercard]'] }),
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, hover card ${hover.width}x${hover.height} CSS, masked ${JSON.stringify(capture.masked)}`
    })

    // ---- Row "…" menu (native shared popup) --------------------------------------------
    await results.check('readme-row-menu', 'row-menu.png — card row "…" native shared popup', async () => {
      await readmeResetUi(page)
      const row = await readmePickCardRow(page)
      await readmeOpenCardHover(page, row)
      assert(row.triggerPoint !== null, 'the hovered card row exposes no "…" trigger')
      await page.moveTo(row.triggerPoint.x, row.triggerPoint.y)
      await sleep(320)
      await page.clickAt(row.triggerPoint.x, row.triggerPoint.y)
      const menu = await readmeWaitRowMenu(page)
      // Move the pointer onto the shared popup so the row hover card dismisses and only the
      // row + popup remain in the crop.
      await page.moveTo(menu.menu.x + Math.round(menu.menu.width / 2), menu.menu.y + Math.round(menu.menu.height / 2))
      await sleep(600)
      const capture = await readmeCapture(page, {
        name: 'row-menu.png',
        source: 'live GUI card row + native shared context menu [data-menu-material]',
        pose: 'row "…" native shared popup open on the top card row',
        scanSelectors: ['.psd-panel', '[data-menu-material]'],
        pad: 0,
        clip: () => page.evaluate(`(() => {
          const row = document.querySelector('.psd-run[data-menu-open="true"]')
          const menu = document.querySelector('[data-menu-material]')
          if (row === null || menu === null) return null
          const rowRect = row.getBoundingClientRect()
          const menuRect = menu.getBoundingClientRect()
          const left = Math.max(0, Math.min(rowRect.left, menuRect.left) - 16)
          const top = Math.max(0, rowRect.top - 24)
          const right = Math.min(innerWidth, Math.max(rowRect.right, menuRect.right) + 16)
          // End on a fully visible Workspaces / Active Projects header instead of cutting it
          // mid-text: include the Active Projects header row completely, then stop.
          const activeProjects = document.querySelector('button[aria-label="Toggle active projects"]')
          const activeRect = activeProjects === null ? null : activeProjects.getBoundingClientRect()
          const bottomLimit = activeRect === null ? Math.max(rowRect.bottom, menuRect.bottom) : Math.max(rowRect.bottom, menuRect.bottom, activeRect.bottom)
          const bottom = Math.min(innerHeight, bottomLimit + 16)
          return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) }
        })()`),
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, ${menu.items} shared-menu items (no action clicked), masked ${JSON.stringify(capture.masked)}`
    })

    // ---- Native Workspaces browser (card collapsed for the tall crop) ------------------
    await results.check('readme-workspaces', 'workspaces.png — native Workspaces browser with current-project rainbow row + Inactive Projects', async () => {
      await readmeResetUi(page)
      await readmeCollapseCard(page)
      await sleep(400)
      const scroll = await page.eval(probeReadme.revealInactiveProjects)
      await sleep(400)
      const parts = await page.eval(probeReadme.workspaceCropParts)
      assert(parts.sidebar !== null && parts.panel !== null, 'sidebar/panel geometry could not be measured')
      assert(scroll !== null, 'the native Workspaces tree or the Inactive Projects header is missing')
      assert(parts.label !== null, 'the native Workspaces header row is not rendered')
      assert(parts.inactiveHeader !== null, 'the Inactive Projects header is not rendered')
      if (dashboardOnly !== true) {
        assert(parts.inactiveRows.length >= 2, `the Inactive Projects header is not followed by two workspace rows (${parts.inactiveRows.length})`)
      } else {
        state.readme.deviations.push(
          'workspaces.png: the isolated demo instance exposes one demo Workspace, so Inactive Projects has no rows; ' +
            'the crop still shows the Workspaces header, Active Projects with its session rows, and the Inactive Projects header ("0")'
        )
      }
      // Start at the Workspaces header row (no partial card edge) and end after the Inactive
      // Projects header + its first two rows.
      const top = Math.max(Math.round(parts.panel.y + parts.panel.height + 6), Math.round(parts.label.y - 12))
      const inactiveLast = parts.inactiveRows.length > 0 ? parts.inactiveRows[parts.inactiveRows.length - 1] : parts.inactiveHeader
      const bottom = Math.min(
        VIEWPORT.height,
        Math.max(Math.round(parts.inactiveHeader.y + parts.inactiveHeader.height + 12), Math.round(inactiveLast.y + inactiveLast.height + 12))
      )
      const capture = await readmeCapture(page, {
        name: 'workspaces.png',
        source: 'live GUI [class$="_sidebarCol"] Workspaces browser (Workspaces header .. Inactive Projects)',
        pose:
          dashboardOnly === true
            ? 'sidebar expanded, Running & recent collapsed: Workspaces header + Active Projects (current-project rainbow row, session rows) + Inactive Projects header (empty in the isolated demo instance)'
            : 'sidebar expanded, Running & recent collapsed: Workspaces header + Active Projects (current-project rainbow row, session rows) + Inactive Projects header and its first two rows',
        scanSelectors: ['[class$="_sidebarCol"]'],
        pad: 0,
        clip: () => {
          // Exact crop: start at the Workspaces header row (well below the collapsed card),
          // end 12 px under the second Inactive Projects row.
          const y = Math.max(Math.round(parts.panel.y + parts.panel.height + 10), Math.round(parts.label.y - 6))
          const rowBottom = Math.max(
            Math.round(parts.inactiveHeader.y + parts.inactiveHeader.height),
            ...parts.inactiveRows.map((row) => Math.round(row.y + row.height))
          )
          const endY = Math.min(VIEWPORT.height, rowBottom)
          return {
            x: 0,
            y,
            width: Math.min(VIEWPORT.width, Math.round(parts.sidebar.width)),
            height: Math.max(40, endY - y),
          }
        },
      })
      state.readme.captures.push(capture)
      state.readme.deviations.push(
        'workspaces.png: the Running & recent card is collapsed for this pose so the Workspaces browser gets the tall column crop; the card is expanded again afterwards'
      )
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, Workspaces header y=${top}, Inactive Projects + ${parts.inactiveRows.length} rows to y=${bottom}, tree scrolled ${scroll.scrollTop}px, masked ${JSON.stringify(capture.masked)}`
    }).finally(async () => {
      try {
        await page.eval(() => {
          const tree = document.querySelector('[role="tree"]')
          if (tree !== null) tree.scrollTop = 0
          return true
        })
        await readmeEnsureCardExpanded(page)
      } catch (error) {
        log(`warning: could not re-expand the running card: ${short(error?.message || String(error), 200)}`)
      }
    })

    // ---- Interrupted current card row (documented seam) -------------------------------
    await results.check('readme-interrupted-row', 'interrupted-row.png — interrupted current card row (amber mark + inline Continue)', async () => {
      await readmeResetUi(page)
      await readmeEnsureCardExpanded(page)
      const row = await readmePickCardRow(page)
      const park = await page.eval(probeReadme.parkPointer)
      await page.moveTo(park.x, park.y)
      await sleep(200)
      await page.clickAt(row.mainPoint.x, row.mainPoint.y)
      await page.waitForFn(() => document.querySelector('.psd-run-current') !== null, [], {
        timeout: 15000,
        label: 'current card row after opening a Session from the card',
      })
      await sleep(1500)
      const session = await page.eval(probeReadme.sessionState)
      assert(session.sessionId !== null, 'no Session is current after opening the card row')
      assertEqual(session.draftLength, 0, 'refusing the interrupted-row pose: the opened composer draft is not empty')
      const seeded = await page.eval((id) => {
        const hooks = globalThis.__POWER_SUITE_TEST_HOOKS__
        if (hooks === null || hooks === undefined || hooks.interruptedSessions === undefined) return { unavailable: true }
        return { unavailable: false, record: hooks.interruptedSessions.set(id, { interrupted: true, running: false }) }
      }, session.sessionId)
      assert(seeded.unavailable !== true, 'the interruptedSessions test seam is unavailable')
      await page.waitForFn(
        () => {
          const current = document.querySelector('.psd-run-current')
          return current !== null && current.querySelector('.psd-interrupted') !== null && (current.getAttribute('data-actions') || '').includes('continue')
        },
        [],
        { timeout: 8000, label: 'interrupted current card row (amber mark + Continue action)' }
      )
      await page.moveTo(park.x, park.y)
      await sleep(200)
      const point = await page.eval(() => {
        const row = document.querySelector('.psd-run-current')
        if (row === null) return null
        const rect = row.getBoundingClientRect()
        return { x: Math.round(rect.left + Math.min(150, rect.width / 2)), y: Math.round(rect.top + rect.height / 2) }
      })
      assert(point !== null, 'the interrupted current card row disappeared before the hover reveal')
      await page.moveTo(point.x, point.y)
      await page.waitForFn(
        () => {
          const slot = document.querySelector('.psd-run-current .psd-continue-slot')
          if (slot === null) return false
          const style = getComputedStyle(slot)
          return style.opacity === '1' && Number.parseFloat(style.width) >= 20
        },
        [],
        { timeout: 5000, label: 'inline Continue control revealed on the interrupted current row' }
      )
      await sleep(200)
      const capture = await readmeCapture(page, {
        name: 'interrupted-row.png',
        source: 'live GUI .psd-run-current card row with the interrupted seam',
        pose: 'interrupted current card row: amber mark + inline Continue (hover-revealed) + current rainbow row',
        scanSelectors: ['.psd-run-current'],
        clip: () => page.eval(probeReadme.boxes, { selectors: ['.psd-run-current'], first: true }),
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, session ${session.messages} transcript message(s), masked ${JSON.stringify(capture.masked)}`
    }).finally(async () => {
      try {
        const session = await page.eval(probeReadme.sessionState)
        if (session.sessionId !== null) {
          await page.eval((id) => globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions?.clear(id), session.sessionId)
        }
        await readmeResetUi(page)
      } catch (error) {
        log(`warning: could not clear the interrupted card record: ${short(error?.message || String(error), 200)}`)
      }
    })

    // ---- Interrupted composer (opened current Session, documented seam) -----------------
    await results.check('readme-interrupted-composer', 'interrupted-composer.png — play-triangle submit control on the interrupted current Session', async () => {
      await readmeResetUi(page)
      const session = await page.eval(probeReadme.sessionState)
      assert(session.sessionId !== null, 'no current Session is open; the composer pose needs the restored Session (this mode never creates one)')
      assertEqual(session.draftLength, 0, 'refusing the composer pose: the current composer draft is not empty')
      const seeded = await page.eval((id) => {
        const hooks = globalThis.__POWER_SUITE_TEST_HOOKS__
        if (hooks === null || hooks === undefined || hooks.interruptedSessions === undefined) return { unavailable: true }
        return { unavailable: false, record: hooks.interruptedSessions.set(id, { interrupted: true, running: false }) }
      }, session.sessionId)
      assert(seeded.unavailable !== true, 'the interruptedSessions test seam is unavailable')
      await page.waitForFn(() => document.documentElement.getAttribute('data-power-suite-interrupted') === 'true', [], {
        timeout: 8000,
        label: 'interrupted composer play state',
      })
      await sleep(350)
      const parts = await page.eval(probeReadme.composerCardParts)
      assert(parts.composer !== null && parts.send !== null, 'the composer/save control geometry could not be measured')
      const playState = await page.eval(() => {
        const composer = document.querySelector('[data-conversation-region="composer"]')
        const send = composer === null ? null : composer.querySelector('button[class$="_primary"]')
        if (send === null) return null
        const pseudo = getComputedStyle(send, '::before')
        const svg = send.querySelector('svg')
        return {
          aria: send.getAttribute('aria-label'),
          svgDisplay: svg === null ? null : getComputedStyle(svg).display,
          mask: pseudo.maskImage === 'none' || pseudo.maskImage === '' ? pseudo.webkitMaskImage : pseudo.maskImage,
          width: pseudo.width,
          height: pseudo.height,
        }
      })
      const playVisible =
        playState !== null &&
        (playState.svgDisplay === 'none' ? typeof playState.mask === 'string' && playState.mask !== 'none' : playState.svgDisplay !== 'none')
      const playAria = playState === null ? '' : String(playState.aria || '')
      if (dashboardOnly !== true) {
        assert(
          playState !== null && playState.svgDisplay === 'none' && typeof playState.mask === 'string' && playState.mask !== 'none',
          `the interrupted composer play control is not showing (state ${short(JSON.stringify(playState), 300)})`
        )
      } else {
        assert(
          playVisible && /continue/iu.test(playAria),
          `the interrupted composer play control is not showing (state ${short(JSON.stringify(playState), 300)})`
        )
      }
      // Full composer card with even 16 px margins on every side (no hero / empty band; the
      // card contains the attachment button, model and IUI controls and the play-triangle
      // send control). `pad: 0` keeps the exact even margins instead of the default 12 px.
      const margin = 16
      const cardRect = parts.card === null ? parts.composer : parts.card
      assert(cardRect !== null, 'the composer card geometry could not be measured')
      const capture = await readmeCapture(page, {
        name: 'interrupted-composer.png',
        source: 'live GUI composer card (.uV2eYG_card / composer region) with the interrupted seam',
        pose: 'interrupted current Session composer card: play-triangle send control (seam active, amber interrupted marker present)',
        scanSelectors: ['[data-conversation-region="composer"]'],
        pad: 0,
        clip: () => {
          const x = Math.max(0, Math.round(cardRect.x - margin))
          const y = Math.max(0, Math.round(cardRect.y - margin))
          const cardBottom = Math.round(cardRect.y + cardRect.height) + margin
          const overhang = parts.overhangBottom === null ? cardBottom : Math.round(parts.overhangBottom) + 14
          return {
            x,
            y,
            width: Math.min(VIEWPORT.width - x, Math.round(cardRect.width) + margin * 2),
            height: Math.min(VIEWPORT.height - y, Math.max(cardBottom, overhang) - y),
          }
        },
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, composer card ${Math.round(cardRect.width)}x${Math.round(cardRect.height)} CSS, play control "${playState.aria}" ${Math.round(parts.send.width)}x${Math.round(parts.send.height)}, masked ${JSON.stringify(capture.masked)}`
    }).finally(async () => {
      try {
        const session = await page.eval(probeReadme.sessionState)
        if (session.sessionId !== null) {
          await page.eval((id) => globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions?.clear(id), session.sessionId)
        }
        await page.waitForFn(() => document.documentElement.getAttribute('data-power-suite-interrupted') === null, [], {
          timeout: 5000,
          label: 'interrupted composer cleared',
        })
      } catch (error) {
        log(`warning: could not clear the interrupted composer record: ${short(error?.message || String(error), 200)}`)
      }
    })

    // ---- Files-header Artifacts overlay (stubbed list) --------------------------------
    await results.check('readme-artifacts', 'artifacts.png — Files-header Artifacts overlay with the stubbed artifact list', async () => {
      await readmeResetUi(page)
      await openFilesTab(page)
      await readmeWaitArtifactsReady(page)
      const content = await page.eval(probeReadme.artifactsContentParts)
      assert(content.root !== null && content.header !== null && content.rows.length === README_STUB_ARTIFACTS.artifacts.length,
        `the artifacts list did not render ${README_STUB_ARTIFACTS.artifacts.length} stubbed rows`)
      const lastRow = content.rows[content.rows.length - 1]
      const capture = await readmeCapture(page, {
        name: 'artifacts.png',
        source: 'live GUI Files-header Artifacts overlay (.psfa-view) with CDP Fetch demo stubs',
        pose: 'Artifacts header + ten demo list rows (5 generated + 5 provided), two rows of vertical padding, no footer',
        scanSelectors: ['.psfa-view .dsa-root'],
        pad: 0,
        clip: () => {
          const top = Math.round(content.root.y)
          const bottom = Math.min(
            Math.round(content.root.y + content.root.height),
            Math.round(lastRow.y + lastRow.height + content.rowHeight * 2)
          )
          return {
            x: Math.round(content.root.x),
            y: top,
            width: Math.round(content.root.width),
            height: Math.max(40, bottom - top),
          }
        },
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, ${content.rows.length} stubbed rows (5 generated / 5 provided, row pitch ${content.rowHeight.toFixed(1)} CSS), masked ${JSON.stringify(capture.masked)}`
    })

    await results.check('readme-artifacts-quicklook', 'artifacts-quicklook.png — Quick Look over the stubbed generated Markdown artifact', async () => {
      await readmeEnsureArtifacts(page)
      const row = await page.findRect('.dsa-row')
      assert(row, 'the stubbed artifact list renders no row for the Quick Look pose')
      await page.moveTo(row.x, row.y)
      await page.waitForFn(
        () => {
          const card = document.querySelector('.dsa-quicklook')
          return card !== null && (card.innerText || '').trim().length > 80
        },
        [],
        { timeout: 5000, label: 'artifact Quick Look card with demo markdown' }
      )
      await sleep(300)
      const name = await page.eval(() => document.querySelector('.dsa-quicklook-name')?.innerText ?? null)
      assertEqual(name, 'release-checklist.md', 'the Quick Look card must show the stubbed demo file')
      const capture = await readmeCapture(page, {
        name: 'artifacts-quicklook.png',
        source: 'live GUI artifact Quick Look card (.dsa-quicklook) over a stubbed generated Markdown artifact',
        pose: 'Quick Look card open over release-checklist.md (stubbed raw markdown)',
        scanSelectors: ['.dsa-quicklook'],
        clip: () => page.eval(probeReadme.boxes, { selectors: ['.dsa-quicklook'], first: true }),
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, card shows ${JSON.stringify(name)}, masked ${JSON.stringify(capture.masked)}`
    })

    await results.check('readme-artifacts-filter', 'artifacts-filter.png — artifact source filter menu (All / Generated / Provided)', async () => {
      await readmeResetUi(page)
      await readmeEnsureArtifacts(page)
      const trigger = await page.findRect('.dsa-filter-trigger')
      assert(trigger, 'the artifacts filter trigger is missing (stubbed list must be open)')
      await page.clickAt(trigger.x, trigger.y)
      await page.waitForFn(() => document.querySelector('.dsa-filter-menu') !== null, [], { timeout: 5000, label: 'artifact filter menu' })
      await sleep(300)
      const capture = await readmeCapture(page, {
        name: 'artifacts-filter.png',
        source: 'live GUI artifact filter trigger + menu',
        pose: 'artifact source filter menu open (All 4 / Generated 2 / Provided 2)',
        scanSelectors: ['.dsa-filter-trigger', '.dsa-filter-menu'],
        clip: () => page.eval(probeReadme.boxes, { selectors: ['.dsa-filter-trigger', '.dsa-filter-menu'] }),
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, masked ${JSON.stringify(capture.masked)}`
    }).finally(async () => {
      try {
        // Reload instead of driving the native Files/overlay Esc-close sequence: in the
        // light pass that close animation can wedge the headless renderer. A reload also
        // clears the right Sidebar/Files state for the following poses.
        await page.reload()
        await page.waitForFn(() => document.readyState === 'complete', [], {
          timeout: 20000,
          label: 'reloaded document after the artifacts poses',
        })
        await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'DSH shell after the artifacts reload' })
        await ensureAppReady(page)
        await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
        await page.eval(probeReadme.installStyle)
        await sleep(900)
      } catch (error) {
        log(`warning: could not reset the page after the artifacts poses: ${short(error?.message || String(error), 200)}`)
      }
    })

    if (dashboardOnly !== true) {
    // ---- Real-task chat + annotation (round 3) ---------------------------------------
    // The user rejected the injected dummy card: the composer and annotation shots must
    // come from a real, isolated model task. One new blank Session, one short generic
    // prompt, the real answer, then real annotations on that answer. If the model call
    // fails twice, the injected demo card is used as a clearly labelled fallback.
    await results.check(
      'readme-chat-annotation',
      'composer-chat.png + annotation-annotated.png + annotation-inserted.png — real model answer in an isolated Session',
      async () => {
        const taskPrompt =
          'Write a short release checklist for a web app: five steps, one risk, and one practical tip.'
        const requirements = [
          'Tighten this heading and keep it to one line',
          'Add an owner to each checklist step',
          'Turn the practical tip into a highlighted callout',
        ]
        state.readme.taskPrompt = taskPrompt
        state.readme.taskRequirements = requirements
        // 1) Isolated real-task Workspace. The user forbade creating the Session in their
        //    project Workspaces; the native add-workspace directory dialog cannot be driven
        //    in headless Chrome (it blocks the renderer), so use the explicitly allowed
        //    "DSH" checkout/harness Workspace instead of adding a temporary Workspace.
        await page.eval(probeReadme.installStyle)
        await page.waitForFn(() => document.querySelector('[data-conversation-session]') !== null, [], {
          timeout: 15000,
          label: 'restored Session before the real-task flow',
        }).catch(() => {})
        await sleep(1000)
        const previous = await page.eval(probeReadme.sessionState)
        assert(previous.sessionId !== null, 'the real-task flow needs a previous Session to restore')
        state.readme.previousSessionId = previous.sessionId
        let workspace = await page.eval(probeReadme.dshWorkspaceInfo)
        assert(workspace.found === true, 'the DSH Workspace row was not found (isolated real-task Workspace fallback)')
        // The workspace row actions are reveal-on-hover: hover the row, then measure again.
        assert(workspace.row !== null, 'the DSH Workspace row could not be measured')
        await page.moveTo(workspace.row.x, workspace.row.y)
        await sleep(700)
        workspace = await page.eval(probeReadme.dshWorkspaceInfo)
        assert(workspace.found === true, 'the DSH Workspace row disappeared while hovering it')
        assert(workspace.newSession !== null, 'the DSH Workspace exposes no "New session in DSH" action')
        state.readme.taskWorkspace = { name: workspace.name, path: '/Users/rexxin/Development/DSH' }
        await page.clickAt(workspace.newSession.x, workspace.newSession.y)
        await page.waitForFn(
          (previousId) => {
            const node = document.querySelector('[data-conversation-session]')
            return node !== null && node.getAttribute('data-conversation-session') !== previousId
          },
          [previous.sessionId],
          { timeout: 20000, label: 'new Session opened in the DSH Workspace' }
        )
        await sleep(1500)
        const taskSession = await page.eval(probeReadme.sessionState)
        assert(taskSession.sessionId !== null && taskSession.sessionId !== previous.sessionId, 'the real-task Session did not open')
        assertEqual(taskSession.draftLength, 0, 'the new real-task Session composer is not empty')
        const taskWorkspaceOwner = await page.eval(() => {
          const row = document.querySelector('[data-psd-current-workspace="true"]')
          return row === null ? null : (row.querySelector('[class*="_title"]')?.innerText || '').trim()
        })
        assert(
          /^DSH$/iu.test(taskWorkspaceOwner || ''),
          `the new Session is not in the DSH Workspace (owner ${JSON.stringify(taskWorkspaceOwner)})`
        )
        state.readme.taskSessionId = taskSession.sessionId
        README_STUB_STATE.realPromptSessionIds.add(taskSession.sessionId)
        // 2) clean chat look: sidebar hidden, transcript visible, header hidden
        await page.eval(probeReadme.hideSidebar, true)
        await page.eval(probeReadme.setChatVisible, true)
        await sleep(700)
        // 3) send the prompt and wait for the real model answer (180 s, one retry)
        let answer = null
        let modelError = null
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            await readmeSendChatPrompt(page, taskPrompt)
            answer = await readmeWaitChatAnswer(page, { timeout: 180000 })
            break
          } catch (error) {
            modelError = error
            log(`warning: real-task model attempt ${attempt} failed: ${short(error?.message || String(error), 320)}`)
            await sleep(1500)
          }
        }
        const modelOk = answer !== null
        state.readme.taskAnswer = modelOk
          ? { messages: answer.messages, lastMessageLength: answer.lastTextLength }
          : null
        if (modelOk) {
          log(
            `readme real task: answer rendered (${answer.messages} messages, last message ${answer.lastTextLength} chars; ` +
              `session id recorded in captures.json)`
          )
        } else {
          state.readme.taskFallback =
            `model call failed after two attempts: ${short(modelError?.message || String(modelError), 320)}; ` +
            'annotation poses fell back to the client-injected demo card and composer-chat shows the sent prompt without an assistant answer'
          state.readme.deviations.push(state.readme.taskFallback)
          log(`warning: ${state.readme.taskFallback}`)
        }
        // 4) composer-chat.png: real chat window + composer + prompt rail/preview/search
        await readmeResetUi(page)
        await page.evaluate(`(() => {
          const scroll = document.querySelector('[data-conversation-scroll]')
          if (scroll !== null) scroll.scrollTop = scroll.scrollHeight
          window.scrollTo(0, document.body.scrollHeight)
          return true
        })()`)
        await sleep(400)
        let chatClip = null
        let chatParts = null
        if (modelOk) {
          await readmeOpenPromptRail(page, 'weekend')
          const hover = await readmeHoverRailPreview(page)
          chatParts = hover.parts
          chatClip = readmeChatClip(hover.parts)
        } else {
          chatParts = await page.eval(probeReadme.composerChatParts)
          chatClip = readmeChatClip(chatParts)
        }
        const chatShot = await readmeCapture(page, {
          name: 'composer-chat.png',
          pose:
            'real DSH chat window: assistant answer + composer, prompt-history rail with hover full-text preview and open search card' +
            (modelOk ? '' : ' (model fallback: sent prompt shown without an assistant answer)'),
          source: 'live GUI real model task in an isolated new Session (sidebar hidden)',
          scanSelectors: ['body'],
          pad: 0,
          maskCopy: { ...README_MASK_COPY, previewPrompt: taskPrompt },
          meta: {
            taskPrompt,
            taskSessionId: taskSession.sessionId,
            answer: modelOk ? { messages: answer.messages, lastMessageLength: answer.lastTextLength } : null,
            fallback: modelOk ? null : 'model call failed; sent prompt shown without assistant answer',
          },
          clip: () => chatClip,
        })
        state.readme.captures.push(chatShot)
        await writeManifest()
        log(
          `readme composer-chat: ${chatShot.screenshot.width}x${chatShot.screenshot.height}px ` +
            `(crop ${chatShot.rect.width}x${chatShot.rect.height}, transcript ${chatParts.messageCount ?? 0} messages, rail ${modelOk ? 'open' : 'absent'})`
        )
        // 5) annotation on the real answer (or the labelled injected-card fallback)
        const annotatePoint = async (point, label) => {
          const before = await page.eval(() => document.querySelectorAll('[data-psa-entry]').length)
          await page.clickAt(point.x, point.y)
          await page.waitForFn(() => document.querySelector('[data-psa-popover]') !== null, [], {
            timeout: 5000,
            label: `annotation popover for ${label}`,
          })
          await sleep(200)
          const added = await page.eval(() => {
            const button = document.querySelector('[data-psa-add]')
            if (button === null) return false
            button.click()
            return true
          })
          assert(added === true, `the annotation add control is missing (${label})`)
          await page.waitForFn((expected) => document.querySelectorAll('[data-psa-entry]').length >= expected, [before + 1], {
            timeout: 6000,
            label: `annotation entry added for ${label}`,
          })
          await sleep(220)
        }
        const activateAnnotation = async () => {
          const launcher = await page.findRect('[data-psa-launcher]')
          assert(launcher, 'the annotation launcher is missing')
          await page.clickAt(launcher.x, launcher.y)
          await page.waitForFn(
            () => document.documentElement.getAttribute('data-psa-active') === 'true' && document.querySelector('[data-psa-rail]') !== null,
            [],
            { timeout: 12000, label: 'annotation mode active for the real-task pose' }
          )
          await page.waitForFn(
            () => {
              const feedback = document.querySelector('[data-psa-feedback]')
              return feedback === null || (feedback.innerText || '').trim().length === 0
            },
            [],
            { timeout: 6000, label: 'annotation mode toast faded' }
          ).catch(() => {})
          await sleep(500)
        }
        const paintMarksIfMissing = async (label) => {
          await page.waitForFn(() => document.querySelectorAll('.psa-mark').length >= 3, [], {
            timeout: 2500,
            label: `three numbered page markers (${label})`,
          }).catch(() => {})
          if ((await page.count('.psa-mark')) < 3) {
            const painted = await page.eval(probeReadme.fallbackMarkPaint)
            assert(
              painted.ok === true && painted.count === 3,
              `the page marks could not be painted (${label}: ${short(JSON.stringify(painted), 280)})`
            )
            state.readme.deviations.push(
              `annotation workflow (${label}): the controller geometry pass did not derive page marks for the captured content in headless Chrome; ` +
                'the three numbered page marks were painted through the plugin snapshot store (same mark descriptors), while the annotations themselves are real records created by clicking the page'
            )
            await sleep(400)
          }
          await page.waitForFn(() => document.querySelectorAll('.psa-mark').length >= 3, [], {
            timeout: 5000,
            label: `three numbered page markers (${label})`,
          })
        }
        const parkAndDismiss = async () => {
          const railPark = await page.eval(() => {
            const rail = document.querySelector('[data-psa-rail]')
            if (rail === null) return null
            const rect = rail.getBoundingClientRect()
            return { x: Math.round(rect.left + 24), y: Math.round(rect.top + 40) }
          })
          if (railPark !== null) await page.moveTo(railPark.x, railPark.y)
          await sleep(350)
          if ((await page.count('[data-psa-exit-confirm]')) > 0) {
            await page.eval(() => document.querySelector('[data-psa-exit-cancel]')?.click())
            await sleep(300)
          }
          await sleep(200)
        }
        const captureAnnotation = async (name, pose) => {
          const shot = await readmeCapture(page, {
            name,
            pose,
            source: modelOk
              ? 'live GUI real model answer in an isolated new Session, real annotation mode (sidebar hidden)'
              : 'FALLBACK: client-injected demo card in an isolated new Session, real annotation mode (sidebar hidden)',
            scanSelectors: ['body'],
            pad: 0,
            postMask: () => page.eval(probeReadme.maskAnnotationMeta),
            meta: {
              taskPrompt,
              taskSessionId: taskSession.sessionId,
              requirements,
              fallback: modelOk ? null : 'injected demo card (model call failed)',
            },
            clip: () => ({ x: 0, y: 0, width: VIEWPORT.width, height: README_VIEWPORT_HEIGHT }),
          })
          state.readme.captures.push(shot)
          await writeManifest()
          return shot
        }
        let annotatedShot = null
        if (modelOk) {
          await readmeResetUi(page)
          await activateAnnotation()
          const targets = await page.eval(probeReadme.chatAnswerTargets)
          assert(targets.ok === true, `the rendered answer could not be located (${short(JSON.stringify(targets), 240)})`)
          assert(targets.heading !== null, 'the answer has no annotatable heading')
          assert(targets.itinerary !== null, 'the answer has no annotatable itinerary item')
          assert(targets.budget !== null, 'the answer has no annotatable budget line')
          log(
            `readme annotation targets: heading ${JSON.stringify(targets.heading.text)}, list item ${JSON.stringify(targets.itinerary.text)}, closing tip ${JSON.stringify(targets.budget.text)}`
          )
          await annotatePoint(targets.heading.point, 'answer heading')
          await annotatePoint(targets.itinerary.point, 'itinerary item')
          await annotatePoint(targets.budget.point, 'budget line')
          const filled = await page.eval(probeReadme.annotationFillRequirements, requirements)
          assertEqual(filled.count, 3, 'the rail must show three requirement textareas for the real answer')
          assert(
            JSON.stringify(filled.values) === JSON.stringify(requirements),
            `the rail requirement textareas did not take the texts (got ${short(JSON.stringify(filled.values), 300)})`
          )
          await sleep(350)
          await paintMarksIfMissing('real answer')
          await parkAndDismiss()
          const verified = await page.eval(probeReadme.annotationRequirementsState)
          assert(
            JSON.stringify(verified.values) === JSON.stringify(requirements),
            `the rail requirement values reverted after the React re-render (${short(JSON.stringify(verified.values), 300)})`
          )
          assertEqual(verified.markers, 3, `the answer must show three numbered annotation markers (got ${verified.markers})`)
          assertEqual(verified.entries, 3, `the rail must list three annotations (got ${verified.entries})`)
          annotatedShot = await captureAnnotation(
            'annotation-annotated.png',
            'real model answer with three annotated elements (#1 heading, #2 checklist list item, #3 closing practical tip) and the rail requirements'
          )
          const insertedOk = await page.eval(() => {
            const button = document.querySelector('[data-psa-insert-batch]')
            if (button === null) return false
            button.click()
            return true
          })
          assert(insertedOk === true, 'the collection "Insert all into composer" control is missing')
          await page.waitForFn(
            () =>
              document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-decorator="true"]').length >= 1 ||
              /Please adjust the UI elements below/u.test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || ''),
            [],
            { timeout: 8000, label: 'annotation references inserted into the composer' }
          )
          await page.waitForFn(
            () => {
              const feedback = document.querySelector('[data-psa-feedback]')
              return feedback === null || (feedback.innerText || '').trim().length === 0
            },
            [],
            { timeout: 6000, label: 'insert toast faded' }
          ).catch(() => {})
          await parkAndDismiss()
          const insertedShot = await captureAnnotation(
            'annotation-inserted.png',
            'real model answer: the three annotation references inserted into the composer as one grouped chip (never sent), rail visible'
          )
          state.readme.taskFallback = null
          return (
            `${annotatedShot.screenshot.width}x${annotatedShot.screenshot.height} annotated + ` +
            `${insertedShot.screenshot.width}x${insertedShot.screenshot.height} inserted, ` +
            `composer-chat ${chatShot.screenshot.width}x${chatShot.screenshot.height}, real answer ${answer.messages} messages/${answer.lastTextLength} chars, ` +
            `targets ${JSON.stringify({ heading: targets.heading.text.slice(0, 60), itinerary: targets.itinerary.text.slice(0, 60), budget: targets.budget.text.slice(0, 60) })}`
          )
        }
        // Fallback (model failed twice): client-injected demo card, labelled as fallback.
        await page.eval(probeReadme.setChatVisible, false)
        await page.eval(probeReadme.hideComposerContextRow)
        await page.eval(probeReadme.installDummyAnswer)
        await sleep(400)
        await readmeResetUi(page)
        await activateAnnotation()
        const placed = await page.eval(probeReadme.positionDummyAnswer)
        assert(placed !== null && placed.width >= 700, `the demo card could not be placed (${short(JSON.stringify(placed), 220)})`)
        const dummyTargets = await page.eval(probeReadme.dummyTargets)
        assert(dummyTargets.title !== null && dummyTargets.row !== null && dummyTargets.button !== null, 'the fallback demo card targets are missing')
        await annotatePoint(dummyTargets.title, 'fallback card title')
        await annotatePoint(dummyTargets.row, 'fallback itinerary row')
        await annotatePoint(dummyTargets.button, 'fallback primary button')
        const filledFallback = await page.eval(probeReadme.annotationFillRequirements, requirements)
        assertEqual(filledFallback.count, 3, 'the fallback rail must show three requirement textareas')
        await sleep(350)
        await paintMarksIfMissing('injected demo fallback')
        await parkAndDismiss()
        annotatedShot = await captureAnnotation(
          'annotation-annotated.png',
          'FALLBACK (model unavailable): client-injected demo answer card with three annotated elements and the rail requirements'
        )
        const insertedFallback = await page.eval(() => {
          const button = document.querySelector('[data-psa-insert-batch]')
          if (button === null) return false
          button.click()
          return true
        })
        assert(insertedFallback === true, 'the fallback collection "Insert all into composer" control is missing')
        await page.waitForFn(
          () =>
            document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-decorator="true"]').length >= 1 ||
            /Please adjust the UI elements below/u.test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || ''),
          [],
          { timeout: 8000, label: 'fallback annotation references inserted into the composer' }
        )
        await sleep(400)
        await parkAndDismiss()
        const fallbackInserted = await captureAnnotation(
          'annotation-inserted.png',
          'FALLBACK (model unavailable): annotation references inserted into the composer as one grouped chip (never sent)'
        )
        return (
          `FALLBACK ${annotatedShot.screenshot.width}x${annotatedShot.screenshot.height} annotated + ` +
          `${fallbackInserted.screenshot.width}x${fallbackInserted.screenshot.height} inserted, ` +
          `composer-chat ${chatShot.screenshot.width}x${chatShot.screenshot.height}; model error: ${short(modelError?.message || String(modelError), 240)}`
        )
      }
    ).finally(async () => {
      // Never leave the live page in annotation mode / with the demo card, and return to
      // the Session that was current before the real-task pose.
      try {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const workflow = await page.eval(probeReadme.annotationWorkflowState)
          if (workflow.active !== 'true') break
          if (workflow.exitConfirm) {
            await page.eval(() => document.querySelector('[data-psa-exit-clear]')?.click())
            await sleep(400)
            continue
          }
          await page.pressEscape()
          await sleep(350)
        }
        await page.eval(probeReadme.removeDummyAnswer)
        await page.eval(probeReadme.setChatVisible, false)
        await page.eval(probeReadme.hideSidebar, false)
        const previousSession = state.readme.previousSessionId
        if (previousSession !== undefined && previousSession !== null) {
          try {
            await ensureNativeSessionRowsVisible(page, 10)
          } catch {
            // the row may already be visible
          }
          const point = await page.eval(probeReadme.sessionRowPoint, previousSession)
          if (point !== null) {
            await page.clickAt(point.x, point.y)
            await page.waitForFn(
              (id) => document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') === id,
              [previousSession],
              { timeout: 12000, label: 'previous Session restored after the real-task flow' }
            )
          } else {
            state.readme.deviations.push(
              'real-task flow: the previous Session row was not reachable for the restore; the real-task Session stayed current'
            )
          }
        }
        // Archive only the isolated real-task Session this flow created.
        const taskSessionId = state.readme.taskSessionId
        if (typeof taskSessionId === 'string' && taskSessionId.length > 0) {
          const cleanup = await readmeArchiveTaskSession(page, taskSessionId)
          state.readme.taskCleanup = cleanup
          if (cleanup.archived !== true) state.readme.deviations.push(`real-task Session cleanup: ${cleanup.reason}`)
          log(`real-task Session cleanup: ${short(JSON.stringify(cleanup), 240)}`)
        }
        await page.eval(probeReadme.installStyle)
        await readmeResetUi(page)
      } catch (error) {
        state.readme.deviations.push(`real-task flow cleanup: ${short(error?.message || String(error), 240)}`)
        log(`warning: real-task flow cleanup failed: ${short(error?.message || String(error), 240)}`)
      }
    })

    }

    // ---- Plugin settings section ------------------------------------------------------
    await results.check('readme-settings', 'settings.png — suite settings section on the plugin detail page', async () => {
      await readmeResetUi(page)
      // Fresh document: earlier conversation/right-Sidebar layout state can leave the plugin
      // detail page in a narrower column (and a later reflow would clip the measured crop).
      // A reload restores the same saved Session and the full-width Plugins page layout.
      await reloadFresh(page)
      await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'DSH shell after reload for the settings pose' })
      await ensureAppReady(page)
      await sleep(1200)
      const nav = await page.eval(() => {
        for (const button of document.querySelectorAll('button')) {
          const rect = button.getBoundingClientRect()
          if (rect.width < 100 || rect.height < 20) continue
          if (!/^(Plugins|插件)$/iu.test((button.innerText || '').trim())) continue
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
        }
        return null
      })
      assert(nav, 'native Plugins navigation button not found')
      await page.clickAt(nav.x, nav.y)
      await page.waitForFn(
        () => /^(Plugins|插件)/u.test((document.querySelector('[data-slot="main"]')?.innerText || '').replace(/\s+/gu, ' ').trim()),
        [],
        { timeout: 10000, label: 'Plugins page' }
      )
      await sleep(600)
      await page.waitForFn(
        () => {
          const main = document.querySelector('[data-slot="main"]')
          if (main === null) return false
          for (const button of main.querySelectorAll('button')) {
            if ((button.getAttribute('aria-label') || '') !== 'View DSH Power Suite') continue
            button.scrollIntoView({ block: 'center' })
            return true
          }
          return false
        },
        [],
        { timeout: 15000, label: 'DSH Power Suite entry on the Plugins page' }
      ).catch(() => {})
      const entry = await page.eval(() => {
        const main = document.querySelector('[data-slot="main"]')
        if (main === null) return null
        for (const button of main.querySelectorAll('button')) {
          if ((button.getAttribute('aria-label') || '') !== 'View DSH Power Suite') continue
          button.scrollIntoView({ block: 'center' })
          const rect = button.getBoundingClientRect()
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
        }
        return null
      })
      assert(entry, 'the DSH Power Suite entry is missing from the Plugins page')
      await sleep(500)
      await page.clickAt(entry.x, entry.y)
      await page.waitForFn(() => document.querySelector('.dps-settings') !== null, [], { timeout: 15000, label: 'suite settings section' })
      await page.eval(probeReadme.scrollSettingsIntoView)
      await sleep(400)
      const settingsRect = await readmeWaitStableRect(page, '.dps-settings')
      const capture = await readmeCapture(page, {
        name: 'settings.png',
        source: 'live GUI plugin detail page settings section (.dps-settings)',
        pose: 'suite settings section (prompt-history shortcut + Active & recent retention); no setting toggled',
        scanSelectors: ['.dps-settings'],
        clip: () => settingsRect,
      })
      state.readme.captures.push(capture)
      await writeManifest()
      return `${capture.screenshot.width}x${capture.screenshot.height}px, masked ${JSON.stringify(capture.masked)}`
    })

    await results.check('readme-files', 'every design §3 raw file + captures.json exist with expected geometry', async () => {
      const requiredFiles = dashboardOnly === true ? README_DASHBOARD_FILES : README_REQUIRED_FILES
      const missing = []
      for (const name of requiredFiles) {
        if (!existsSync(path.join(README_RAW_DIR, name))) missing.push(name)
      }
      assertEqual(missing.length, 0, `missing raw captures: ${missing.join(', ')}`)
      assert(existsSync(state.readme.file), `captures.json is missing at ${state.readme.file}`)
      const manifest = JSON.parse(await readFile(state.readme.file, 'utf8'))
      assertEqual(manifest.captures.length, requiredFiles.length, 'captures.json must list every raw file')
      for (const capture of manifest.captures) {
        assertEqual(capture.dpr, README_DPR, `${capture.file}: dpr metadata`)
        assertEqual(capture.rect.width * README_DPR, capture.screenshot.width, `${capture.file}: PNG width matches the 2x clip`)
        assertEqual(capture.scan.clip.hits.length, 0, `${capture.file}: clip scan hits`)
        assertEqual(capture.scan.document.skipped, false, `${capture.file}: page scan should be enabled`)
        assertEqual(capture.masked === undefined || typeof capture.masked !== 'object', false, `${capture.file}: mask metadata`)
      }
      return `${manifest.captures.length} PNG + captures.json (${README_RAW_DIR})`
    })
  } finally {
    await readmeResetUi(page)
    await writeManifest()
    logReadmeCaptureState(state)
  }
}

/**
 * Cleanup after the `--readme-shots` pass: clear any controlled interrupted record and
 * remove the capture CSS/attribute. The throwaway page is closed by the caller.
 * @param {object} page - Page wrapper.
 * @param {object} state - harness state.
 * @returns {Promise<void>}
 */
async function cleanupReadmeShots(page, state) {
  if (state.mode !== 'readme-shots') return
  try {
    const session = await page.eval(probeReadme.sessionState)
    if (session.sessionId !== null) {
      await page.eval((id) => globalThis.__POWER_SUITE_TEST_HOOKS__?.interruptedSessions?.clear(id), session.sessionId)
    }
    await page.eval(() => {
      document.documentElement.removeAttribute('data-psd-readme-capture')
      document.getElementById('psd-readme-capture-style')?.remove()
      return true
    })
  } catch (error) {
    log(`warning: readme-shots cleanup failed: ${short(error?.message || String(error), 200)}`)
  }
}

// ---------------------------------------------------------------------------------------------
// --readme-chat mode: isolated real-model chat + annotation captures (round 3)

/**
 * Read the demo Workspace registry of the isolated capture instance when present
 * (`/tmp/ps-readme-home`, seeded by the Lead). Returns `{ name, path }` or null.
 */
async function readIsolatedDemoWorkspace() {
  try {
    const document = JSON.parse(await readFile('/tmp/ps-readme-home/storages/workspace.json', 'utf8'))
    const workspaces = document?.tables?.workspaces ?? {}
    const entries = Object.values(workspaces)
    if (entries.length === 0) return null
    return { name: String(entries[0].title ?? ''), path: String(entries[0].path ?? '') }
  } catch {
    return null
  }
}
// ---------------------------------------------------------------------------------------------

/**
 * Merge the chat/annotation captures into raw/captures.json, keeping the other light-theme
 * poses captured earlier and replacing every chat/annotation entry + travel/fallback text.
 * @param {Array<object>} captures - new capture metadata.
 * @param {object} task - real-task metadata (prompt, workspace, session, answer, cleanup…).
 * @param {Array<string>} deviations - current deviations.
 * @returns {Promise<void>}
 */
async function readmeWriteChatManifest(captures, task, deviations) {
  const file = path.join(README_RAW_DIR, 'captures.json')
  let existing = { captures: [], annotationAssets: [], deviations: [] }
  try {
    existing = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    existing = { captures: [], annotationAssets: [], deviations: [] }
  }
  const names = new Set(captures.map((capture) => capture.file))
  const kept = (Array.isArray(existing.captures) ? existing.captures : []).filter((capture) => !names.has(capture.file))
  const staleTravel = /travel|weekend|shanghai|budget line|demo card|injected demo|model answer did not finish/i
  const manifest = {
    generatedAt: new Date().toISOString(),
    harness: 'test/browser/sidebar.e2e.mjs --readme-chat',
    gui: 'live DSH Web GUI (token redacted)',
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: README_DPR },
    theme: 'light',
    themeEmulation: 'CDP Emulation.setEmulatedMedia prefers-color-scheme=light',
    rawDirectory: README_RAW_DIR,
    contract: 'README Bento redesign (round 3 review: light theme, real isolated model task, chat + settings composer group)',
    task,
    captures: [...kept, ...captures],
    annotationAssets: existing.annotationAssets ?? [],
    annotationAssetsNote:
      'docs/assets/annotation-*.png come from round 2; the README annotation group uses raw/annotation-annotated.png + raw/annotation-inserted.png',
    deviations: [
      ...(Array.isArray(existing.deviations) ? existing.deviations : []).filter((line) => !staleTravel.test(line)),
      ...deviations,
    ],
  }
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

/** Focus the real composer and return its send-control point. */
async function readmeFocusComposer(page) {
  const points = await page.eval(probeReadme.chatSendPoints)
  assert(points !== null && points.editor !== null, 'the composer editor could not be measured')
  await page.clickAt(points.editor.x, points.editor.y)
  await sleep(300)
  return points
}

/**
 * Type the prompt through the real composer, then send it with Enter AND the submit
 * control. Returns the composer state after the attempt (the caller asserts the user
 * message appeared in the transcript).
 */
async function readmeSendPromptReal(page, promptText) {
  let points = await readmeFocusComposer(page)
  const before = await page.eval(probeReadme.chatFlowState, promptText)
  if (before.draftLength < 10) {
    await page.send('Input.insertText', { text: promptText })
    await sleep(450)
  }
  const typed = await page.eval(probeReadme.chatFlowState, promptText)
  assert(typed.draftLength > 10, `the prompt was not typed into the composer (draft ${typed.draftLength} chars)`)
  await page.waitForFn(
    () => {
      const composer = document.querySelector('[data-conversation-region="composer"]')
      const primary = composer === null ? null : composer.querySelector('button[class$="_primary"]')
      return primary !== null && primary.disabled !== true
    },
    [],
    { timeout: 8000, label: 'composer submit control enabled' }
  )
  const dispatchEnter = (type) =>
    page
      .send('Input.dispatchKeyEvent', {
        type,
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}),
      })
      .catch(() => {})
  await dispatchEnter('keyDown')
  await dispatchEnter('keyUp')
  await sleep(400)
  // Never click a control that has already flipped to "Stop generating": that would
  // interrupt the turn we just started. Click the submit control only when the prompt is
  // still in the composer (i.e. Enter did not submit it).
  await sleep(350)
  let afterEnter = await page.eval(probeReadme.chatFlowState, promptText)
  const sentByEnter = afterEnter.draftLength === 0 && afterEnter.flowNodes >= 1
  if (sentByEnter !== true && afterEnter.draftLength > 0) {
    points = await page.eval(probeReadme.chatSendPoints)
    if (points !== null && points.send !== null) {
      await page.clickAt(points.send.x, points.send.y)
      await sleep(600)
      afterEnter = await page.eval(probeReadme.chatFlowState, promptText)
    }
  }
  return { typed, afterEnter }
}

/** Wait until the sent prompt is a visible user message in the transcript (send evidence). */
async function readmeWaitUserMessage(page, promptText, { timeout = 15000 } = {}) {
  const started = Date.now()
  const deadline = started + timeout
  let last = null
  while (Date.now() < deadline) {
    last = await page.eval(probeReadme.chatFlowState, promptText)
    const running = /stop generating/iu.test(last.primaryAria || '')
    if (last.flowNodes >= 1 && last.draftLength === 0 && (last.promptPresent === true || running)) {
      return { ...last, elapsedMs: Date.now() - started }
    }
    await sleep(300)
  }
  throw new Error(
    `no user message appeared within ${timeout}ms ` +
      `(flowNodes ${last === null ? 'n/a' : last.flowNodes}, promptPresent ${last === null ? 'n/a' : last.promptPresent}, ` +
      `draft ${last === null ? 'n/a' : last.draftLength}, primaryAria ${last === null ? 'n/a' : last.primaryAria})`
  )
}

/** Wait until the assistant answer is fully rendered and the turn has ended. */
async function readmeWaitAnswerReal(page, promptText, { timeout = 180000 } = {}) {
  const deadline = Date.now() + timeout
  let lastTranscriptLength = -1
  let stableSamples = 0
  let last = null
  while (Date.now() < deadline) {
    last = await page.eval(probeReadme.chatFlowState, promptText)
    const ended =
      last.flowNodes >= 1 &&
      last.primaryDisabled === true &&
      last.running !== true &&
      last.primaryAria !== null
    if (ended && last.transcriptTextLen > 250 && last.transcriptTextLen === lastTranscriptLength) stableSamples += 1
    else stableSamples = 0
    if (stableSamples >= 3) return last
    lastTranscriptLength = last.transcriptTextLen
    await sleep(1500)
  }
  throw new Error(
    `the assistant answer did not finish within ${timeout}ms ` +
      `(flowNodes ${last === null ? 'n/a' : last.flowNodes}, mainText ${last === null ? 'n/a' : last.mainTextLen}, ` +
      `transcript ${last === null ? 'n/a' : last.transcriptTextLen}, primaryAria ${last === null ? 'n/a' : last.primaryAria}, ` +
      `primaryDisabled ${last === null ? 'n/a' : last.primaryDisabled}, running ${last === null ? 'n/a' : last.running})`
  )
}

/**
 * `--readme-chat`: a clean-page pass that produces only the real-task chat + annotation
 * captures. It never opens the Artifacts/right-Sidebar surfaces. The isolated Session is
 * created in the explicitly allowed DSH Workspace (native add-workspace dialog cannot be
 * driven in headless Chrome), then archived through its native row menu.
 * @param {object} input - `{ page, results, state }`.
 * @returns {Promise<void>}
 */
async function runReadmeChatShotsMode({ page, results, state, opts }) {
  log('\n=== --readme-chat: real-model chat + annotation captures (clean page, light theme) ===')
  state.mode = 'readme-chat'
  const isolated = typeof opts?.url === 'string' && /127\.0\.0\.1|localhost/iu.test(opts.url)
  const demoWorkspace = isolated ? await readIsolatedDemoWorkspace() : null
  const taskPrompt = 'Write a short release checklist for a web app: five steps, one risk, and one practical tip.'
  const requirements = [
    'Tighten this heading and keep it to one line',
    'Add an owner to each checklist step',
    'Turn the practical tip into a highlighted callout',
  ]
  const captures = []
  const deviations = []
  const task = {
    prompt: taskPrompt,
    requirements,
    workspace: null,
    sessionId: null,
    realTask: false,
    answer: null,
    sendEvidence: null,
    sendFailure: null,
    cleanup: null,
    fallback: null,
  }
  state.readme = { captures, deviations, file: path.join(README_RAW_DIR, 'captures.json'), task }
  await mkdir(README_RAW_DIR, { recursive: true })
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
  await sleep(700)
  await page.eval(probeReadme.installStyle)
  await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'DSH shell + injected client' })
  await ensureAppReady(page)
  const lightChrome = await page.evaluate(`(() => ({
    dark: document.body.hasAttribute('data-ds-dark-theme') || document.documentElement.hasAttribute('data-ds-dark-theme'),
    bodyBackground: getComputedStyle(document.body).backgroundColor
  }))()`)
  assertEqual(lightChrome.dark, false, 'the chat capture pass must render the light appearance')
  log(`readme-chat theme: light (body ${lightChrome.bodyBackground})`)
  const notice = await page.eval(probeReadme.dismissBlockingDialog)
  if (notice.dismissed === true) {
    log(`readme-chat: dismissed the blocking notice dialog ("${notice.label}")`)
    await page.waitForFn(() => document.querySelector('[role="dialog"][aria-label*="Notice" i]') === null, [], {
      timeout: 8000,
      label: 'blocking notice dialog dismissed',
    }).catch(() => {})
    await sleep(500)
  }
  await page.waitForFn(() => document.querySelector('[data-conversation-session]') !== null, [], {
    timeout: 15000,
    label: 'restored Session before the real-task chat',
  }).catch(() => {})
  await sleep(1200)
  const previous = await page.eval(probeReadme.activeSessionState)
  assert(previous.sessionId !== null, 'the chat pass needs a current Session before the real task')
  log(`readme-chat current state: ${short(JSON.stringify(previous), 400)}`)
  // 1) Isolated real-task Session in the explicitly allowed DSH Workspace (the native
  //    add-workspace dialog wedges headless Chrome). The shell reuses an already-blank
  //    current Session instead of creating a fresh one, so use that blank Session directly
  //    when it already sits in the DSH Workspace; otherwise create one natively.
  task.workspace = { name: 'DSH', path: '/Users/rexxin/Development/DSH' }
  const blankReusable =
    previous.messageNodes === 0 && /^(New Session|新会话)$/iu.test(previous.selectedRowTitle || '')
  const sessionRootSwitched = (previousId) =>
    [...document.querySelectorAll('[data-conversation-session]')].some((node) => {
      const id = node.getAttribute('data-conversation-session')
      return typeof id === 'string' && id.length > 0 && id !== previousId
    })
  let taskSession = null
  if (blankReusable) {
    taskSession = previous
    task.workspace = demoWorkspace ?? { name: previous.currentWorkspace || 'demo-workspace', path: null }
    log(`readme-chat: using the existing blank Session in ${task.workspace.name} as the isolated real-task Session`)
  } else {
    // A blank current Session elsewhere makes the global New Session control a no-op, so
    // use the DSH Workspace's own native "New session in DSH" action.
    task.previousSessionId = previous.messageNodes === 0 ? null : previous.sessionId
    const hadSession = previous.sessionId !== null
    let sessionOpened = hadSession === false
    for (let attempt = 1; attempt <= 3 && sessionOpened !== true; attempt += 1) {
      const newSession = await page.eval(probeReadme.newSessionPoint)
      if (newSession === null) {
        log(`warning: native New Session control not measurable on attempt ${attempt}`)
        await sleep(800)
        continue
      }
      await page.clickAt(newSession.x, newSession.y)
      try {
        await page.waitForFn(
          hadSession === false
            ? () => document.querySelector('[data-conversation-session]') !== null
            : (previousId) => {
                const active = document.querySelector('[data-conversation-content][data-content-phase="active"]')
                const activeId = active === null ? null : active.getAttribute('data-conversation-session')
                return typeof activeId === 'string' && activeId.length > 0 && activeId !== previousId
              },
          [previous.sessionId],
          { timeout: 10000, label: 'new Session opened through the native New Session flow' }
        )
        sessionOpened = true
      } catch (error) {
        log(`warning: native New Session attempt ${attempt} did not open/switch Session: ${short(error?.message || String(error), 240)}`)
        await sleep(900)
      }
    }
    assert(sessionOpened === true, 'could not create the isolated Session through the native New Session flow')
    await sleep(1500)
    taskSession = await page.eval(probeReadme.activeSessionState)
    assert(
      taskSession.sessionId !== null,
      `the isolated real-task Session did not become active (${short(JSON.stringify(taskSession), 240)})`
    )
    if (hadSession) assert(taskSession.sessionId !== previous.sessionId, 'the isolated real-task Session did not switch')
    const createdOwner = await page.eval(() => {
      const row = document.querySelector('[data-psd-current-workspace="true"]')
      return row === null ? null : (row.querySelector('[class*="_title"]')?.innerText || '').trim()
    })
    task.workspace = demoWorkspace ?? { name: createdOwner || 'demo-workspace', path: null }
    if (demoWorkspace !== null && createdOwner !== null) {
      assert(
        createdOwner === demoWorkspace.name,
        `the real-task Session is not in the demo Workspace (${JSON.stringify(createdOwner)} != ${JSON.stringify(demoWorkspace.name)})`
      )
    }
  }
  assert(taskSession.sessionId !== null, 'the isolated real-task Session has no identity')
  assertEqual(taskSession.draftLength, 0, 'the isolated real-task Session composer is not empty')
  const owner = await page.eval(() => {
    const row = document.querySelector('[data-psd-current-workspace="true"]')
    return row === null ? null : (row.querySelector('[class*="_title"]')?.innerText || '').trim()
  })
  assert(owner !== null, 'the real-task Session has no visible Workspace owner')
  if (task.workspace === null || task.workspace.name === 'demo-workspace') {
    task.workspace = { name: owner, path: demoWorkspace === null ? null : demoWorkspace.path }
  }
  task.sessionId = taskSession.sessionId
  log(`readme-chat workspace: ${task.workspace.name} (${task.workspace.path}); isolated Session id recorded in captures.json`)
  // 2) clean chat look: sidebar hidden, transcript visible (header hidden by the stylesheet)
  await page.eval(probeReadme.hideSidebar, true)
  await page.eval(probeReadme.setChatVisible, true)
  await sleep(800)
  try {
    // 3) send the prompt; assert a real user message within 15 s, retry the send once
    let sendEvidence = null
    let sendError = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const attemptState = await readmeSendPromptReal(page, taskPrompt)
        log(
          `readme-chat send attempt ${attempt}: typed draft ${attemptState.typed.draftLength} chars, ` +
            `after-enter flowNodes ${attemptState.afterEnter.flowNodes}, primaryAria ${attemptState.afterEnter.primaryAria}, ` +
            `promptPresent ${attemptState.afterEnter.promptPresent}`
        )
        const evidence = await readmeWaitUserMessage(page, taskPrompt, { timeout: 15000 })
        sendEvidence = { ...evidence, attempt, typedDraftLength: attemptState.typed.draftLength }
        break
      } catch (error) {
        sendError = error
        log(`warning: real-task send attempt ${attempt} failed: ${short(error?.message || String(error), 320)}`)
        try {
          const data = await page.screenshotBase64(null)
          await writeFile(path.join(README_SHOTS_DIR, 'chat-send-failure.png'), Buffer.from(data, 'base64'))
        } catch {
          // failure screenshot is best effort
        }
        await sleep(1200)
      }
    }
    if (sendEvidence === null) {
      task.sendFailure = {
        error: short(sendError?.message || String(sendError), 500),
        screenshot: path.join(README_SHOTS_DIR, 'chat-send-failure.png'),
      }
      task.fallback = 'none: the prompt never became a user message; no travel/demo content used'
      deviations.push(
        `real-task send failed after two attempts: ${short(sendError?.message || String(sendError), 400)}; ` +
          'failure screenshot saved under .tmp-work/readme-shots/chat-send-failure.png'
      )
      await readmeWriteChatManifest(captures, task, deviations)
      throw new Error(`real-task prompt never became a user message: ${task.sendFailure.error}`)
    }
    task.realTask = true
    task.sendEvidence = sendEvidence
    log(
      `readme-chat send evidence: user message visible after ${sendEvidence.elapsedMs}ms on attempt ${sendEvidence.attempt} ` +
        `(userNodes ${sendEvidence.userNodes}, promptPresent ${sendEvidence.promptPresent}, primaryAria ${sendEvidence.primaryAria})`
    )
    const answer = await readmeWaitAnswerReal(page, taskPrompt, { timeout: 180000 })
    task.answer = {
      userMessages: answer.userNodes,
      transcriptTextLength: answer.transcriptTextLen,
      mainTextLength: answer.mainTextLen,
      turnsLine: answer.turnsLine ?? null,
    }
    log(`readme-chat answer: ${JSON.stringify(task.answer)}`)
    // 4) Reload once so the prompt-history rail mounts with the real prompts of this
    //    Session (the rail fetches at mount; a Session created after page load has none).
    await page.reload()
    await page.waitForFn(() => document.readyState === 'complete', [], { timeout: 20000, label: 'chat page reloaded' })
    await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'DSH shell after the chat reload' })
    await ensureAppReady(page)
    await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
    await page.eval(probeReadme.dismissBlockingDialog).catch(() => {})
    await page.eval(probeReadme.installStyle)
    // after a reload the shell has no current Session: reopen the real-task Session from
    // its native row (this also mounts the prompt-history rail with the real prompts).
    await page.eval(probeReadme.hideSidebar, false)
    await page.waitForFn(() => document.querySelector('[data-row-key^="session:"]') !== null, [], {
      timeout: 20000,
      label: 'native Session rows after the chat reload',
    })
    await ensureNativeSessionRowsVisible(page, 10).catch(() => {})
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const rowPoint = await page.eval(probeReadme.sessionRowPoint, task.sessionId)
      if (rowPoint !== null) {
        await page.clickAt(rowPoint.x, rowPoint.y)
        break
      }
      await page.eval((expectedWorkspace) => {
        for (const workspaceRow of document.querySelectorAll('[data-row-key^="workspace:"]')) {
          const title = (workspaceRow.querySelector('[class*="_title"]')?.innerText || '').trim()
          if (expectedWorkspace !== null && title !== expectedWorkspace) continue
          if (workspaceRow.getAttribute('aria-expanded') === 'false') workspaceRow.click()
          return true
        }
        return false
      }, task.workspace?.name ?? null)
      await sleep(700)
    }
    await page.waitForFn(
      (id) => {
        const active = document.querySelector('[data-conversation-content][data-content-phase="active"]')
        return active !== null && active.getAttribute('data-conversation-session') === id
      },
      [task.sessionId],
      { timeout: 15000, label: 'real-task Session reopened after the chat reload' }
    )
    await page.eval(probeReadme.hideSidebar, true)
    await page.eval(probeReadme.setChatVisible, true)
    await sleep(1200)
    await page.evaluate(`(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      if (scroll !== null) scroll.scrollTop = scroll.scrollHeight
      return true
    })()`)
    await sleep(400)
    // 4) composer-chat.png: real chat window + composer + prompt rail preview + search card
    await readmeResetUi(page)
    await page.evaluate(`(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      if (scroll !== null) scroll.scrollTop = scroll.scrollHeight
      return true
    })()`)
    await sleep(500)
    await readmeOpenPromptRail(page, 'release')
    await readmeHoverRailPreview(page)
    const parts = await page.eval(probeReadme.chatWindowParts)
    const clip = readmeChatClip(parts)
    const chatShot = await readmeCapture(page, {
      name: 'composer-chat.png',
      pose:
        'real DSH chat window: real assistant answer + composer, prompt-history rail with hover full-text preview and the open search card (sidebar hidden)',
      source: 'live GUI isolated real model task (DSH Workspace), light theme, clean page (no Artifacts/right sidebar)',
      scanSelectors: ['body'],
      pad: 0,
      maskCopy: { ...README_MASK_COPY, previewPrompt: taskPrompt },
      meta: {
        taskPrompt,
        workspace: task.workspace,
        answer: task.answer,
        sendEvidence,
      },
      clip: () => clip,
    })
    captures.push(chatShot)
    log(`readme-chat composer-chat: ${chatShot.screenshot.width}x${chatShot.screenshot.height}px (crop ${clip.width}x${clip.height})`)
    // 5) annotation on the real answer elements
    await readmeResetUi(page)
    const launcher = await page.findRect('[data-psa-launcher]')
    assert(launcher, 'the annotation launcher is missing')
    await page.clickAt(launcher.x, launcher.y)
    await page.waitForFn(
      () => document.documentElement.getAttribute('data-psa-active') === 'true' && document.querySelector('[data-psa-rail]') !== null,
      [],
      { timeout: 12000, label: 'annotation mode active for the real answer' }
    )
    await page.waitForFn(
      () => {
        const feedback = document.querySelector('[data-psa-feedback]')
        return feedback === null || (feedback.innerText || '').trim().length === 0
      },
      [],
      { timeout: 6000, label: 'annotation mode toast faded' }
    ).catch(() => {})
    await sleep(500)
    const annotatePoint = async (point, label) => {
      const before = await page.eval(() => document.querySelectorAll('[data-psa-entry]').length)
      await page.clickAt(point.x, point.y)
      await page.waitForFn(() => document.querySelector('[data-psa-popover]') !== null, [], {
        timeout: 5000,
        label: `annotation popover for ${label}`,
      })
      await sleep(200)
      const added = await page.eval(() => {
        const button = document.querySelector('[data-psa-add]')
        if (button === null) return false
        button.click()
        return true
      })
      assert(added === true, `the annotation add control is missing (${label})`)
      await page.waitForFn((expected) => document.querySelectorAll('[data-psa-entry]').length >= expected, [before + 1], {
        timeout: 6000,
        label: `annotation entry added for ${label}`,
      })
      await sleep(220)
    }
    const targetInfo = {}
    for (const kind of ['heading', 'step', 'tip']) {
      const info = await page.eval(probeReadme.answerTargetPoint, kind)
      assert(info.ok === true, `no real answer element could be annotated for "${kind}" (${short(JSON.stringify(info), 240)})`)
      targetInfo[kind] = { text: info.text, rect: info.point }
      await annotatePoint(info.point, kind)
    }
    log(
      `readme-chat annotation targets: heading ${JSON.stringify(targetInfo.heading.text)}, ` +
        `checklist step ${JSON.stringify(targetInfo.step.text)}, tip ${JSON.stringify(targetInfo.tip.text)}`
    )
    const filled = await page.eval(probeReadme.annotationFillRequirements, requirements)
    assertEqual(filled.count, 3, 'the rail must show three requirement textareas for the real answer')
    assert(
      JSON.stringify(filled.values) === JSON.stringify(requirements),
      `the rail requirement textareas did not take the texts (got ${short(JSON.stringify(filled.values), 300)})`
    )
    await sleep(350)
    await page.waitForFn(() => document.querySelectorAll('.psa-mark').length >= 3, [], {
      timeout: 2500,
      label: 'three numbered page markers on the real answer',
    }).catch(() => {})
    if ((await page.count('.psa-mark')) < 3) {
      const painted = await page.eval(probeReadme.fallbackMarkPaint)
      assert(painted.ok === true && painted.count === 3, `the page marks could not be painted (${short(JSON.stringify(painted), 280)})`)
      deviations.push(
        'annotation workflow: the controller geometry pass did not derive page marks for the real answer in headless Chrome; ' +
          'the three numbered page marks were painted through the plugin snapshot store (same mark descriptors), while the annotations themselves are real records created by clicking the answer'
      )
      await sleep(400)
    }
    await page.waitForFn(() => document.querySelectorAll('.psa-mark').length >= 3, [], {
      timeout: 5000,
      label: 'three numbered page markers on the real answer',
    })
    const parkPointer = async () => {
      const railPark = await page.eval(() => {
        const rail = document.querySelector('[data-psa-rail]')
        if (rail === null) return null
        const rect = rail.getBoundingClientRect()
        return { x: Math.round(rect.left + 24), y: Math.round(rect.top + 40) }
      })
      // Move to a neutral spot and wait for any workspace hover card to close, so the
      // composition is only sidebar + Running & recent panel + annotations + rail.
      await page.moveTo(1000, 120)
      await sleep(400)
      await page.waitForFn(() => document.querySelector('[data-psd-hovercard]') === null, [], {
        timeout: 4000,
        label: 'sidebar hover card dismissed before the capture',
      }).catch(() => {})
      if (railPark !== null) await page.moveTo(railPark.x, railPark.y)
      await sleep(350)
      if ((await page.count('[data-psa-exit-confirm]')) > 0) {
        await page.eval(() => document.querySelector('[data-psa-exit-cancel]')?.click())
        await sleep(300)
      }
      await sleep(200)
    }
    await parkPointer()
    await page.waitForFn(
      () => {
        const feedback = document.querySelector('[data-psa-feedback]')
        return feedback === null || (feedback.innerText || '').trim().length === 0
      },
      [],
      { timeout: 8000, label: 'annotation mark toast faded before the capture' }
    ).catch(() => {})
    await sleep(500)
    const verified = await page.eval(probeReadme.annotationRequirementsState)
    assert(
      JSON.stringify(verified.values) === JSON.stringify(requirements),
      `the rail requirement values reverted after the React re-render (${short(JSON.stringify(verified.values), 300)})`
    )
    assertEqual(verified.markers, 3, `the answer must show three numbered annotation markers (got ${verified.markers})`)
    assertEqual(verified.entries, 3, `the rail must list three annotations (got ${verified.entries})`)
    let annotatedShot = await readmeCapture(page, {
      name: 'annotation-annotated.png',
      pose: 'real model answer with three annotated elements (#1 heading, #2 numbered checklist step, #3 closing tip) and the rail requirements',
      source: 'live GUI isolated real model task (DSH Workspace), light theme, real annotation mode (sidebar hidden)',
      scanSelectors: ['body'],
      pad: 0,
      postMask: () => page.eval(probeReadme.maskAnnotationMeta),
      meta: { taskPrompt, workspace: task.workspace, requirements, targets: targetInfo, answer: task.answer },
      clip: () => ({ x: 0, y: 0, width: VIEWPORT.width, height: README_VIEWPORT_HEIGHT }),
    })
    captures.push(annotatedShot)
    const insertedOk = await page.eval(() => {
      const button = document.querySelector('[data-psa-insert-batch]')
      if (button === null) return false
      button.click()
      return true
    })
    assert(insertedOk === true, 'the collection "Insert all into composer" control is missing')
    await page.waitForFn(
      () =>
        document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-decorator="true"]').length >= 1 ||
        /Please adjust the UI elements below/u.test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || ''),
      [],
      { timeout: 8000, label: 'annotation references inserted into the composer' }
    )
    await page.waitForFn(
      () => {
        const feedback = document.querySelector('[data-psa-feedback]')
        return feedback === null || (feedback.innerText || '').trim().length === 0
      },
      [],
      { timeout: 6000, label: 'insert toast faded' }
    ).catch(() => {})
    await parkPointer()
    // Capture polish: hide any still-open sidebar hover card and compact the numbered badges
    // to just their index, so the markers do not cover the panel labels.
    await page.evaluate(`(() => {
      let hoverStyle = document.getElementById('psd-readme-hide-hovercard')
      if (hoverStyle === null) { hoverStyle = document.createElement('style'); hoverStyle.id = 'psd-readme-hide-hovercard'; document.head.appendChild(hoverStyle) }
      hoverStyle.textContent = '[data-psd-hovercard]{display:none!important}'
      for (const card of document.querySelectorAll('[data-psd-hovercard]')) card.style.display = 'none'
      let badgeStyle = document.getElementById('psd-readme-compact-badges')
      if (badgeStyle === null) { badgeStyle = document.createElement('style'); badgeStyle.id = 'psd-readme-compact-badges'; document.head.appendChild(badgeStyle) }
      badgeStyle.textContent = '.psa-mark-badge-text{display:none!important}.psa-mark-badge{max-width:26px!important;padding:0 4px!important}'
      return true
    })()`)
    const insertedShot = await readmeCapture(page, {
      name: 'annotation-inserted.png',
      pose: 'real model answer: the three annotation references inserted into the composer as one grouped chip (never sent), rail visible',
      source: 'live GUI isolated real model task (DSH Workspace), light theme, real annotation mode (sidebar hidden)',
      scanSelectors: ['body'],
      pad: 0,
      postMask: () => page.eval(probeReadme.maskAnnotationMeta),
      meta: { taskPrompt, workspace: task.workspace, requirements, answer: task.answer },
      clip: () => ({ x: 0, y: 0, width: VIEWPORT.width, height: README_VIEWPORT_HEIGHT }),
    })
    captures.push(insertedShot)
    await writeFile(path.join(README_SHOTS_DIR, 'chat-task.json'), `${JSON.stringify({ ...task, captures: captures.map((shot) => shot.file) }, null, 2)}\n`)
    return (
      `real task OK: ${chatShot.screenshot.width}x${chatShot.screenshot.height} composer-chat, ` +
      `${annotatedShot.screenshot.width}x${annotatedShot.screenshot.height} annotated, ` +
      `${insertedShot.screenshot.width}x${insertedShot.screenshot.height} inserted; ` +
      `answer ${task.answer.userMessages} user message(s)/${task.answer.transcriptTextLength} transcript chars`
    )
  } finally {
    // Never leave annotation mode / injected UI / the isolated Session behind.
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const workflow = await page.eval(probeReadme.annotationWorkflowState)
        if (workflow.active !== 'true') break
        if (workflow.exitConfirm) {
          await page.eval(() => document.querySelector('[data-psa-exit-clear]')?.click())
          await sleep(400)
          continue
        }
        await page.pressEscape()
        await sleep(350)
      }
      await page.eval(probeReadme.removeDummyAnswer)
      await page.eval(probeReadme.setChatVisible, false)
      await page.eval(probeReadme.hideSidebar, false)
      if (typeof task.previousSessionId === 'string' && task.previousSessionId.length > 0) {
        try {
          await ensureNativeSessionRowsVisible(page, 10)
        } catch {
          // row may already be visible
        }
        const point = await page.eval(probeReadme.sessionRowPoint, task.previousSessionId)
        if (point !== null) {
          await page.clickAt(point.x, point.y)
          await page.waitForFn(
            (id) => {
              const active = document.querySelector('[data-conversation-content][data-content-phase="active"]')
              return active !== null && active.getAttribute('data-conversation-session') === id
            },
            [task.previousSessionId],
            { timeout: 12000, label: 'previous Session restored after the real-task chat' }
          ).catch(() => {})
        }
      }
      if (task.sessionId !== null) {
        const cleanup = await readmeArchiveTaskSession(page, task.sessionId, task.workspace?.name ?? null).catch((error) => ({
          archived: false,
          reason: short(error?.message || String(error), 240),
        }))
        task.cleanup = cleanup
        if (cleanup.archived !== true) deviations.push(`real-task Session cleanup: ${cleanup.reason}`)
        log(`readme-chat Session cleanup: ${short(JSON.stringify(cleanup), 240)}`)
      }
      await page.eval(probeReadme.installStyle)
    } catch (error) {
      deviations.push(`readme-chat cleanup: ${short(error?.message || String(error), 240)}`)
      log(`warning: readme-chat cleanup failed: ${short(error?.message || String(error), 240)}`)
    }
    try {
      const manifest = await readmeWriteChatManifest(captures, task, deviations)
      log(
        `readme-chat captures.json: ${manifest.captures.length} total capture(s), ` +
          `theme ${manifest.theme}, workspace ${task.workspace === null ? 'n/a' : task.workspace.name}, ` +
          `session ${task.sessionId === null ? 'n/a' : 'recorded'}, archived ${task.cleanup === null ? 'n/a' : task.cleanup.archived}`
      )
    } catch (error) {
      log(`warning: could not write captures.json for the chat pass: ${short(error?.message || String(error), 240)}`)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// --readme-sidebar-annotation mode: annotate native left-sidebar UI elements (round 4 review)
// ---------------------------------------------------------------------------------------------

/**
 * `--readme-sidebar-annotation`: annotate three native left-sidebar UI elements (Workspaces
 * search button, Add workspace button, Active Projects header) with real requirement texts,
 * then capture the annotated page and the inserted-into-composer state. The native sidebar
 * stays visible in both captures; the demo Session chat/composer stays visible as well.
 * @param {object} input - `{ page, results, state, opts }`.
 * @returns {Promise<void>}
 */
async function runReadmeSidebarAnnotationMode({ page, results, state, opts }) {
  log('\n=== --readme-sidebar-annotation: annotate native sidebar UI elements ===')
  log(`readme-sidebar-annotation viewport: ${README_VIEWPORT_HEIGHT} CSS px (innerHeight ${await page.eval(() => innerHeight)})`)
  state.mode = 'readme-sidebar-annotation'
  README_ACTIVE_MASK_COPY = README_MASK_COPY_DEMO
  const requirements = [
    'Make this header collapse the whole panel and keep the running count visible.',
    'Show the elapsed time on the right and keep the status dot for running rows.',
    'Add a keyboard-shortcut hint to this menu trigger.',
  ]
  const captures = []
  const deviations = []
  state.readme = { captures, deviations, file: path.join(README_RAW_DIR, 'captures.json') }
  await mkdir(README_RAW_DIR, { recursive: true })
  await page.emulateMedia([{ name: 'prefers-color-scheme', value: 'light' }])
  await sleep(700)
  await page.eval(probeReadme.installStyle)
  await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'DSH shell + injected client' })
  await ensureAppReady(page)
  const dismiss = async () => {
    await page.eval(() => {
      const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')
      if (dialog === null) return false
      const button = [...dialog.querySelectorAll('button')].find((candidate) => /^(Continue|Got it|OK|Close|Start|Accept)/iu.test((candidate.innerText || '').trim())) ?? dialog.querySelector('button')
      if (button !== null && button !== undefined) button.click()
      return true
    })
    await sleep(600)
  }
  await dismiss()
  const lightChrome = await page.evaluate(`(() => ({
    dark: document.body.hasAttribute('data-ds-dark-theme') || document.documentElement.hasAttribute('data-ds-dark-theme')
  }))()`)
  assertEqual(lightChrome.dark, false, 'the sidebar annotation capture must render the light appearance')
  // Sidebar visible + chat/composer visible (the sidebar is the annotation target surface).
  await page.eval(probeReadme.hideSidebar, false)
  await page.eval(probeReadme.setChatVisible, true)
  await sleep(800)
  await readmeWidenSidebar(page)
  await sleep(500)
  try {
    // 1) open a demo Session with a real answer so the chat/composer are visible
    const previous = await page.eval(probeReadme.activeSessionState)
    const row = await page.eval(() => {
      for (const rowNode of document.querySelectorAll('[data-row-key^="session:"]')) {
        const title = (rowNode.querySelector('[class*="_title"]')?.innerText || '').trim()
        if (title.length === 0 || /^(New Session|新会话)$/iu.test(title)) continue
        rowNode.scrollIntoView({ block: 'center' })
        const rect = rowNode.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        return { x: Math.round(rect.left + 80), y: Math.round(rect.top + rect.height / 2), titleLength: title.length }
      }
      return null
    })
    assert(row !== null, 'no demo Session row is available to open for the sidebar annotation pose')
    await page.clickAt(row.x, row.y)
    await page.waitForFn(
      (previousId) => {
        const active = document.querySelector('[data-conversation-content][data-content-phase="active"]')
        const activeId = active === null ? null : active.getAttribute('data-conversation-session')
        return activeId !== null && activeId !== previousId
      },
      [previous.sessionId],
      { timeout: 15000, label: 'demo Session opened for the sidebar annotation pose' }
    ).catch(() => {})
    await sleep(1500)
    const opened = await page.eval(probeReadme.activeSessionState)
    assert(opened.messageNodes >= 1, `the opened demo Session renders no transcript nodes (${short(JSON.stringify(opened), 240)})`)
    await page.evaluate(`(() => {
      const scroll = document.querySelector('[data-conversation-scroll]')
      if (scroll !== null) scroll.scrollTop = scroll.scrollHeight
      return true
    })()`)
    await sleep(500)
    // 2) annotation mode active
    const launcher = await page.findRect('[data-psa-launcher]')
    assert(launcher, 'the annotation launcher is missing')
    await page.clickAt(launcher.x, launcher.y)
    await page.waitForFn(
      () => document.documentElement.getAttribute('data-psa-active') === 'true' && document.querySelector('[data-psa-rail]') !== null,
      [],
      { timeout: 12000, label: 'annotation mode active for the sidebar pose' }
    )
    await page.waitForFn(
      () => {
        const feedback = document.querySelector('[data-psa-feedback]')
        return feedback === null || (feedback.innerText || '').trim().length === 0
      },
      [],
      { timeout: 6000, label: 'annotation toast faded' }
    ).catch(() => {})
    await sleep(600)
    const annotatePoint = async (point, label) => {
      const before = await page.eval(() => document.querySelectorAll('[data-psa-entry]').length)
      await page.clickAt(point.x, point.y)
      await page.waitForFn(() => document.querySelector('[data-psa-popover]') !== null, [], {
        timeout: 5000,
        label: `annotation popover for ${label}`,
      })
      await sleep(220)
      const added = await page.eval(() => {
        const button = document.querySelector('[data-psa-add]')
        if (button === null) return false
        button.click()
        return true
      })
      assert(added === true, `the annotation add control is missing (${label})`)
      await page.waitForFn((expected) => document.querySelectorAll('[data-psa-entry]').length >= expected, [before + 1], {
        timeout: 6000,
        label: `annotation entry added for ${label}`,
      })
      await sleep(240)
    }
    await readmeEnsureCardExpanded(page)
    await sleep(400)
    const targets = []
    let rowHoverPoint = null
    const grabTarget = async (key) => page.evaluate(`(${probeReadme.runningPanelTargets.toString()})()[${JSON.stringify(key)}]`)
    // 1) panel header
    const headerTarget = await grabTarget('header')
    assert(headerTarget !== null && headerTarget.point !== null, 'the Running & recent panel header was not found or has no box')
    targets.push(headerTarget)
    await annotatePoint(headerTarget.point, headerTarget.label)
    // 2) top recent row
    const rowTarget = await grabTarget('row')
    assert(rowTarget !== null && rowTarget.point !== null, 'the top Running & recent row was not found or has no box')
    targets.push(rowTarget)
    rowHoverPoint = rowTarget.point
    await annotatePoint(rowTarget.point, rowTarget.label)
    // 3) a control inside the panel: the row "…" menu trigger first (hover-revealed), then
    //    the pin button, then the always-visible disclosure chevron; the requirement text is
    //    adapted to whichever control is actually hit-testable.
    const controlCandidates = ['chevron', 'control', 'pin']
    const controlRequirements = {
      control: 'Add a keyboard-shortcut hint to this menu trigger.',
      pin: 'Add a keyboard-shortcut hint to this pin button.',
      chevron: 'Make this chevron collapse the panel to just the header row.',
    }
    let controlTarget = null
    let chosenControl = null
    for (const candidate of controlCandidates) {
      await page.moveTo(rowHoverPoint.x, rowHoverPoint.y)
      await sleep(700)
      const target = await grabTarget(candidate)
      if (target === null || target.point === null) continue
      try {
        await annotatePoint(target.point, target.label)
        controlTarget = target
        chosenControl = candidate
        break
      } catch (error) {
        log(`warning: sidebar annotation control "${target.label}" was not hit-testable: ${short(error?.message || String(error), 180)}`)
      }
    }
    assert(controlTarget !== null && chosenControl !== null, 'no control inside the Running & recent panel could be annotated')
    targets.push(controlTarget)
    requirements[2] = controlRequirements[chosenControl]
    assertEqual(new Set(targets.map((target) => `${target.point.x},${target.point.y}`)).size, 3, 'the three sidebar targets must be distinct')
    log(
      `readme-sidebar-annotation targets: ${targets
        .map((target) => `${target.label} (${target.aria ?? 'header'} · ${JSON.stringify(target.text ?? '')}) at ${target.point.rect.x},${target.point.rect.y}`)
        .join('; ')}`
    )
    const filled = await page.eval(probeReadme.annotationFillRequirements, requirements)
    assertEqual(filled.count, 3, 'the rail must show three requirement textareas for the sidebar targets')
    assert(
      JSON.stringify(filled.values) === JSON.stringify(requirements),
      `the rail requirement textareas did not take the texts (got ${short(JSON.stringify(filled.values), 300)})`
    )
    await sleep(400)
    await page.waitForFn(() => document.querySelectorAll('.psa-mark').length >= 3, [], {
      timeout: 5000,
      label: 'three numbered page markers over the sidebar elements',
    }).catch(() => {})
    if ((await page.count('.psa-mark')) < 3) {
      const painted = await page.eval(probeReadme.fallbackMarkPaint)
      assert(painted.ok === true && painted.count === 3, `the sidebar page marks could not be painted (${short(JSON.stringify(painted), 280)})`)
      deviations.push(
        'sidebar annotation: the controller geometry pass did not derive page marks for the native sidebar elements in headless Chrome; ' +
          'the three numbered page marks were painted through the plugin snapshot store (same mark descriptors), while the annotations themselves are real records created by clicking the sidebar'
      )
      await sleep(400)
    }
    await page.waitForFn(() => document.querySelectorAll('.psa-mark').length >= 3, [], {
      timeout: 5000,
      label: 'three numbered page markers over the sidebar elements',
    })
    const parkPointer = async () => {
      const railPark = await page.eval(() => {
        const rail = document.querySelector('[data-psa-rail]')
        if (rail === null) return null
        const rect = rail.getBoundingClientRect()
        return { x: Math.round(rect.left + 24), y: Math.round(rect.top + 40) }
      })
      if (railPark !== null) await page.moveTo(railPark.x, railPark.y)
      await sleep(350)
      if ((await page.count('[data-psa-exit-confirm]')) > 0) {
        await page.eval(() => document.querySelector('[data-psa-exit-cancel]')?.click())
        await sleep(300)
      }
      await page.waitForFn(
        () => {
          const feedback = document.querySelector('[data-psa-feedback]')
          return feedback === null || (feedback.innerText || '').trim().length === 0
        },
        [],
        { timeout: 8000, label: 'annotation toast faded before the capture' }
      ).catch(() => {})
      await sleep(400)
    }
    await parkPointer()
    // Capture polish: hide any still-open sidebar hover card and compact the numbered badges
    // to just their index, so the markers do not cover the panel labels.
    await page.evaluate(`(() => {
      let hoverStyle = document.getElementById('psd-readme-hide-hovercard')
      if (hoverStyle === null) { hoverStyle = document.createElement('style'); hoverStyle.id = 'psd-readme-hide-hovercard'; document.head.appendChild(hoverStyle) }
      hoverStyle.textContent = '[data-psd-hovercard],[class*="psd-hovercard"]{display:none!important}'
      for (const card of document.querySelectorAll('[data-psd-hovercard], [class*="psd-hovercard"]')) card.style.display = 'none'
      let badgeStyle = document.getElementById('psd-readme-compact-badges')
      if (badgeStyle === null) { badgeStyle = document.createElement('style'); badgeStyle.id = 'psd-readme-compact-badges'; document.head.appendChild(badgeStyle) }
      badgeStyle.textContent = '.psa-mark-badge-text{display:none!important}.psa-mark-badge{max-width:26px!important;padding:0 4px!important}'
      return true
    })()`)
    const verified = await page.eval(probeReadme.annotationRequirementsState)
    assert(
      JSON.stringify(verified.values) === JSON.stringify(requirements),
      `the rail requirement values reverted after the React re-render (${short(JSON.stringify(verified.values), 300)})`
    )
    assertEqual(verified.markers, 3, `the sidebar must show three numbered annotation markers (got ${verified.markers})`)
    assertEqual(verified.entries, 3, `the rail must list three annotations (got ${verified.entries})`)
    const sidebarVisible = await page.eval(() => {
      const sidebar = document.querySelector('[class$="_sidebarCol"]') ?? document.querySelector('[data-slot="sidebar"]')
      if (sidebar === null) return null
      const rect = sidebar.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height), display: getComputedStyle(sidebar).display }
    })
    assert(sidebarVisible !== null && sidebarVisible.width > 100 && sidebarVisible.display !== 'none', 'the native sidebar must stay visible for this pose')
    const meta = {
      source: 'isolated DSH Preview instance (127.0.0.1:3199, token redacted), light appearance forced',
      sidebarVisible: true,
      targets: targets.map((target) => ({
        label: target.label,
        aria: target.aria,
        text: target.text,
        selectors: target.selectors,
        rect: target.point.rect,
      })),
      requirements,
    }
    const annotatedShot = await readmeCapture(page, {
      name: 'annotation-annotated.png',
      source: 'isolated GUI, native left-sidebar UI elements, real annotation mode (sidebar visible)',
      pose:
        'suite Running & recent panel annotated: #1 panel header, #2 top recent row, #3 row "…" menu trigger; rail lists the three requirement texts; native sidebar + chat/composer visible',
      scanSelectors: ['body'],
      pad: 0,
      postMask: () => page.eval(probeReadme.maskAnnotationMeta),
      meta,
      clip: () => ({ x: 0, y: 0, width: VIEWPORT.width, height: README_VIEWPORT_HEIGHT }),
    })
    captures.push(annotatedShot)
    const insertedOk = await page.eval(() => {
      const button = document.querySelector('[data-psa-insert-batch]')
      if (button === null) return false
      button.click()
      return true
    })
    assert(insertedOk === true, 'the collection "Insert all into composer" control is missing')
    await page.waitForFn(
      () =>
        document.querySelectorAll('[data-conversation-region="composer"] [data-lexical-decorator="true"]').length >= 1 ||
        /Please adjust the UI elements below/u.test(document.querySelector('[data-conversation-region="composer"] [data-lexical-editor="true"]')?.innerText || ''),
      [],
      { timeout: 8000, label: 'sidebar annotation references inserted into the composer' }
    )
    await page.waitForFn(
      () => {
        const feedback = document.querySelector('[data-psa-feedback]')
        return feedback === null || (feedback.innerText || '').trim().length === 0
      },
      [],
      { timeout: 6000, label: 'insert toast faded' }
    ).catch(() => {})
    await parkPointer()
    const insertedShot = await readmeCapture(page, {
      name: 'annotation-inserted.png',
      source: 'isolated GUI, native left-sidebar UI elements, real annotation mode (sidebar visible)',
      pose:
        'Running & recent panel annotations inserted as one grouped chip in the composer (never sent); sidebar + panel + rail + chat visible',
      scanSelectors: ['body'],
      pad: 0,
      postMask: () => page.eval(probeReadme.maskAnnotationMeta),
      meta,
      clip: () => ({ x: 0, y: 0, width: VIEWPORT.width, height: README_VIEWPORT_HEIGHT }),
    })
    captures.push(insertedShot)
    const record = {
      capturedAt: new Date().toISOString(),
      mode: 'readme-sidebar-annotation',
      requirements,
      targets: meta.targets,
      captures,
      deviations,
    }
    await writeFile(path.join(README_SHOTS_DIR, 'sidebar-annotation.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    return (
      `${annotatedShot.screenshot.width}x${annotatedShot.screenshot.height} annotated + ` +
      `${insertedShot.screenshot.width}x${insertedShot.screenshot.height} inserted; ` +
      `targets ${targets.map((target) => target.label).join(', ')}; sidebar ${sidebarVisible.width}x${sidebarVisible.height}`
    )
  } finally {
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const workflow = await page.eval(probeReadme.annotationWorkflowState)
        if (workflow.active !== 'true') break
        if (workflow.exitConfirm) {
          await page.eval(() => document.querySelector('[data-psa-exit-clear]')?.click())
          await sleep(400)
          continue
        }
        await page.pressEscape()
        await sleep(350)
      }
      await page.eval(probeReadme.setChatVisible, false)
      await page.eval(probeReadme.hideSidebar, false)
      await page.eval(probeReadme.installStyle)
      await readmeResetUi(page)
    } catch (error) {
      deviations.push(`sidebar annotation cleanup: ${short(error?.message || String(error), 240)}`)
      log(`warning: sidebar annotation cleanup failed: ${short(error?.message || String(error), 240)}`)
    }
  }
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
  const clientSource = await readClientForInjection(opts.clientPath)
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
    const readmeMode = opts.mode === 'readme-shots'
    const chatMode = opts.mode === 'readme-chat'
    const sidebarAnnotationMode = opts.mode === 'readme-sidebar-annotation'
    README_VIEWPORT_HEIGHT = sidebarAnnotationMode ? 1200 : VIEWPORT.height
    page = await Page.open(cdp, url, injectorSource(clientSource), {
      trackNetwork: opts.mode === 'pin' || opts.mode === 'layout' || opts.mode === 'interrupted' || opts.mode === 'row-menu',
      deviceScaleFactor: readmeMode || chatMode || sidebarAnnotationMode ? README_DPR : 1,
      viewportHeight: README_VIEWPORT_HEIGHT,
      beforeNavigate: readmeMode ? (openPage) => installReadmeStubs(cdp, openPage) : undefined,
    })
    log('page: opened, waiting for the DSH shell…')

    if (readmeMode || chatMode || opts.mode === 'readme-sidebar-annotation') {
      // The README pass only poses the documented UI; it must never create a Session or
      // type into one, so it skips the smoke mode's blank-Session helper entirely.
      await results.check('readme-ready', 'live GUI shell + injected worktree client ready (no Session created, no prompt sent)', async () => {
        await page.waitForFn(probe.appReady, [], { timeout: 60000, label: 'DSH shell + injected plugin factory' })
        await ensureAppReady(page)
        await page.waitForFn(() => document.querySelector('[data-conversation-session]') !== null, [], {
          timeout: 15000,
          label: 'restored current Session',
        }).catch(() => {})
        const session = await page.eval(probeReadme.sessionState)
        assert(session.sessionId !== null, 'no restored current Session is open in the live GUI; the README poses need one (this mode never creates a Session)')
        return `current Session open, ${session.messages} transcript message(s), draft ${session.draftLength} char(s)`
      })
    } else {
      await runSmoke({ page, results, state, opts })
      await ensureAppReady(page)
    }
    if (opts.mode === 'readme-shots') {
      try {
        await runReadmeShotsMode({ page, results, state, cdp, opts })
      } finally {
        await cleanupReadmeShots(page, state)
      }
    } else if (opts.mode === 'readme-sidebar-annotation') {
      try {
        await runReadmeSidebarAnnotationMode({ page, results, state, opts })
      } catch (error) {
        log(`FATAL  readme-sidebar-annotation: ${short(error?.message || String(error), 600)}`)
        if (error?.stack) log(short(error.stack, 1600))
        results.rows.push({ id: 'readme-sidebar-annotation', title: 'sidebar-target annotation raws', pass: false, detail: short(error?.message || String(error), 500), ms: 0 })
      }
    } else if (chatMode) {
      try {
        await runReadmeChatShotsMode({ page, results, state, opts })
      } catch (error) {
        log(`FATAL  readme-chat: ${short(error?.message || String(error), 600)}`)
        if (error?.stack) log(short(error.stack, 1600))
        results.rows.push({
          id: 'readme-chat',
          title: 'real-model chat + annotation captures',
          pass: false,
          detail: short(error?.message || String(error), 500),
          ms: 0,
        })
      }
    } else if (opts.mode === 'full') {
      log('\n=== Acceptance checks ===')
      await runComposerGalleryChecks({ page, results, state, opts })
      await runLayoutChecks({ page, results, state })
      await runCurrentHighlightChecks({ page, results, state })
      await runHoverCardChecks({ page, results, state })
      await runInterruptedChecks({ page, results, state })
      await runStatsChecks({ page, results, state })
      await runFocusChecks({ page, results, state })
      await runFoldChecks({ page, results, state })
      await runAnnotationPinChecks({ page, results, state })
      await runFilesArtifactsChecks({ page, results, state })
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
    } else if (opts.mode === 'layout') {
      try {
        await runLayoutWidthChecks({ page, results, state })
      } finally {
        // Restore the pre-run sidebar width through the same drag even when a check
        // failed mid-run, and report the residual cache/Host document honestly.
        await cleanupSidebarWidth(page, state)
      }
    } else if (opts.mode === 'interrupted') {
      try {
        await runInterruptedModeChecks({ page, results, state })
      } finally {
        // Clear every controlled record even when a check failed mid-run, then report
        // the residual marker/record state honestly.
        await cleanupInterruptedMode(page, state)
      }
    } else if (opts.mode === 'row-menu') {
      try {
        await runRowMenuChecks({ page, results, state })
      } finally {
        // Never leave a popup open: dismiss through Escape (pointer over the menu first
        // when the card row's hover card would swallow the key) and report residuals.
        await cleanupRowMenu(page, state)
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

  const skipped = results.rows.filter((row) => row.skipped === true).length
  const passed = results.rows.filter((row) => row.pass && row.skipped !== true).length
  const failed = results.failures.length
  const pageErrors = page !== null ? page.pageErrors : (state.livePageErrors ?? [])
  log('\n=== Results ===')
  for (const row of results.rows) {
    const label = row.skipped === true ? 'SKIP' : row.pass ? 'PASS' : 'FAIL'
    log(`${label}  ${row.id}  ${row.title}${row.skipped === true ? ` — ${short(row.detail, 400)}` : row.pass ? '' : `\n        ↳ ${short(row.detail, 700)}`}`)
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
    const sidebarWidthRouteFailures = page.sidebarWidthRouteFailures ?? []
    log(`sidebar-width route probe failures (expected while the Host route is absent): ${sidebarWidthRouteFailures.length}`)
    for (const failure of sidebarWidthRouteFailures.slice(0, 8)) log(`  ! ${failure}`)
    const shellProbeFailures = page.shellProbeFailures ?? []
    log(`shell deliverables changes.summary 404 probes (route not served by this Host build; not feature failures): ${shellProbeFailures.length}`)
    for (const failure of shellProbeFailures.slice(0, 8)) log(`  ! ${failure}`)
    for (const failure of pinRouteFailures.slice(0, 8)) log(`  ! ${failure}`)
    if (page.networkEnabled !== true) exitCode = exitCode || 1
    if (page.networkFailures.length > 0) exitCode = exitCode || 1
    // While the Host route is absent (pinShared=false) its 404s are the documented
    // pre-restart probe; once pinShared=true any pin-route failure is a real defect.
    if (pinRouteFailures.length > 0 && state.pinShared === true) exitCode = exitCode || 1
    // Same contract for the sidebar-width route: pre-restart 404s are the documented
    // missing-route state; once the route answers 200 (sidebarWidthShared=true) any
    // failure on it is a real defect.
    if (sidebarWidthRouteFailures.length > 0 && state.sidebarWidthShared === true) exitCode = exitCode || 1
  }
  if (state.mode === 'pin') {
    log(`pin baseline: pinShared=${state.pinBaseline?.pinShared ?? 'n/a'}; effective pins ${short(JSON.stringify(state.pinBaseline?.effectiveIds ?? null), 200)}; card pinned rows ${state.pinBaseline?.pinnedRows ?? 'n/a'}; cache ${short(state.pinBaseline?.cacheRaw ?? null, 200)}; host route ${state.pinBaseline?.hostStatus === null ? 'unreachable' : `status ${state.pinBaseline?.hostStatus}`}`)
    log(`pin cleanup: ${state.pinCleanup ? short(JSON.stringify(state.pinCleanup), 1600) : 'not run'}`)
    if (page !== null && Array.isArray(page.pinRouteWrites)) {
      log(`pin route writes (${page.pinRouteWrites.length}): ${short(JSON.stringify(page.pinRouteWrites.map((write) => write.postData)), 1200)}`)
    }
  }
  if (state.live === true) {
    log(`live install: non-injected shipped GUI in two fresh profiles; page errors across profiles ${(state.livePageErrors ?? []).length}`)
  }
  if (state.mode === 'layout') {
    log(`layout baseline: pre-run sidebar ${state.layout?.preWidth ?? 'n/a'}px; dragged ${state.layout?.draggedWidth ?? 'n/a'}px; injected/served client ${state.clientSource.length} bytes; host route ${state.sidebarWidthShared === true ? 'LIVE (200)' : 'absent pre-restart'}`)
    log(`layout flicker: oracle canvas ${state.layout?.oracleId ?? 'n/a'}; ${state.layout?.flicker?.ro?.length ?? 0} in-frame resize sample(s); per-step samples ${state.layout?.steps?.length ?? 0}`)
    log(`layout reopen: collapsed->reopened at ${state.layout?.reopen?.reopened ?? 'n/a'}px via ${state.layout?.reopen?.via ?? 'n/a'}; cache ${short(state.layout?.reopen?.cacheRaw ?? null, 160)}`)
    log(`layout evidence: ${state.layoutEvidence ? state.layoutEvidence.join(', ') : 'none'}`)
    log(`layout cleanup: ${state.layoutCleanup ? short(JSON.stringify(state.layoutCleanup), 1800) : 'not run'}`)
    if (page !== null && Array.isArray(page.sidebarWidthRouteWrites)) {
      log(`sidebar-width route writes (${page.sidebarWidthRouteWrites.length}): ${short(JSON.stringify(page.sidebarWidthRouteWrites.map((write) => write.postData)), 1200)}`)
    }
  }
  if (state.mode === 'interrupted') {
    log(`interrupted targets: card ${state.interrupted?.cardTarget ? `${state.interrupted.cardTarget.kind} "${short(state.interrupted.cardTarget.title, 60)}" (${state.interrupted.cardTarget.id})` : 'n/a'}; native ${state.interrupted?.nativeTarget ? `${state.interrupted.nativeTarget.id}` : 'n/a'}; current Session ${state.interrupted?.currentSession ?? state.sessionId ?? 'n/a'}`)
    log(`interrupted controlled records: ${short(JSON.stringify(state.interrupted?.controlled ?? []), 400)}`)
    log(`interrupted cleanup: ${state.interruptedCleanup ? short(JSON.stringify(state.interruptedCleanup), 1600) : 'not run'}`)
    log(`interrupted real-state rows: ${state.interrupted?.realStateRows === undefined ? 'n/a' : state.interrupted.realStateRows}`)
  }
  if (state.mode === 'row-menu') {
    log(`row menu: native items ${short(JSON.stringify(state.rowMenu?.native?.menu?.itemLabels ?? null), 400)}`)
    log(`row menu: card items ${short(JSON.stringify(state.rowMenu?.ours?.menu?.itemLabels ?? null), 400)}`)
    log(`row menu: comparison ${state.rowMenu?.comparison ? short(JSON.stringify(state.rowMenu.comparison), 900) : 'not run'}`)
    log(`row menu evidence: ${state.rowMenuEvidence ? state.rowMenuEvidence.join(', ') : 'none'}`)
    log(`row menu cleanup: ${state.rowMenuCleanup ? short(JSON.stringify(state.rowMenuCleanup), 1200) : 'not run'}`)
  }
  if (state.mode === 'readme-shots') {
    logReadmeCaptureState(state)
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
