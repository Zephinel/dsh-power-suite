#!/usr/bin/env node
/**
 * Browser end-to-end acceptance for the update prompt.
 *
 *   node test/browser/update-prompt.e2e.mjs
 *
 * What it does
 * ------------
 * Opens the REAL running DSH Web GUI with a throwaway headless Chrome and
 * stubs only `GET /api/power-suite.update` through the Chrome DevTools
 * Protocol Fetch domain. The page therefore loads the installed bundle's real
 * client code (including the `shell.overlay` update prompt) while the Host
 * keeps serving its own route; the running profile, settings and Sessions are
 * never written.
 *
 * Covered checks (20):
 * - the card appears bottom-right after the 1.5 s page-load delay, with
 *   role=region, the `current → latest` version line and the update/later
 *   actions;
 * - 查看更新内容 expands and collapses the highlights;
 * - 下次再说 hides the card and persists `{laterVersion, laterClicks: 1}`;
 * - three later clicks expose 不再提醒, which silences only that version, and
 *   a reload of the silenced version shows no card;
 * - 更新 closes the card and opens the Plugins surface;
 * - a no-update answer is silent and resets the stored cycle;
 * - a failed registry answer (`latest: null`) is silent and keeps the state;
 * - no page exception or error-level console message occurs.
 *
 * Prerequisites
 * -------------
 * - Node.js 22 or newer (global `fetch` and `WebSocket`).
 * - Google Chrome at the standard macOS path, or CHROME_BIN pointing at it.
 * - The DSH Web GUI running (launchd service on this machine by default).
 * - A token URL: `DSH_WEB_URL` must include `token=`; otherwise the harness
 *   asks `~/.local/bin/dsh-web url --ip`. The token is always redacted.
 *
 * Side effects: one throwaway Chrome process with a fresh `--user-data-dir`
 * under the OS temp directory (removed afterwards), plus the page requests the
 * GUI makes on load. It never changes the installed plugin, the profile, or
 * the Host.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DSH_WEB_BIN = path.join(process.env.HOME ?? '', '.local', 'bin', 'dsh-web')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Redact the launch token from every logged line. */
function redact(text) {
  return String(text).replace(/token=[^&\s"']*/gu, 'token=REDACTED')
}

/** Run one command and return stdout; stderr is folded into the error. */
function spawnSyncJson(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' })
}

/** Resolve the GUI token URL without ever printing the token. */
function resolveTokenUrl() {
  const configured = process.env.DSH_WEB_URL
  if (typeof configured === 'string' && configured.includes('token=')) return configured
  const result = spawnSyncJson(DSH_WEB_BIN, ['url', '--ip'])
  const url = typeof result === 'string' ? result.trim() : ''
  if (!url.includes('token=')) throw new Error('no token URL: set DSH_WEB_URL with token= or install ~/.local/bin/dsh-web')
  return url
}

/** One wait helper shared by the CDP driver. */
async function start() {
  const tokenUrl = resolveTokenUrl()
  const profile = mkdtempSync(path.join(tmpdir(), 'psu-update-prompt-e2e-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--ignore-certificate-errors',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' })
  const cleanup = () => {
    try { chrome.kill('SIGKILL') } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* best effort */ }
  }
  process.on('exit', cleanup)

  const portFile = path.join(profile, 'DevToolsActivePort')
  let port
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(portFile)) {
      port = Number(readFileSync(portFile, 'utf8').split('\n')[0])
      break
    }
    await sleep(100)
  }
  if (!port) throw new Error('Chrome did not expose a DevTools port')
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const socket = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })

  let nextId = 1
  const pending = new Map()
  const listeners = new Map()
  let errors = []
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined) {
      const entry = pending.get(message.id)
      if (entry === undefined) return
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (message.params?.exceptionDetails?.text ?? '?'))
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      errors.push('console: ' + (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' '))
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params, message.sessionId)
  }
  const send = (method, params = {}, sessionId) => {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }))
    })
  }
  const on = (method, listener) => {
    const list = listeners.get(method) ?? []
    list.push(listener)
    listeners.set(method, list)
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const command = (method, params) => send(method, params, sessionId)
  await command('Page.enable')
  await command('Runtime.enable')
  await command('Network.enable')

  let payload = { current: '0.1.0', latest: '0.2.0', updateAvailable: true, highlights: ['测试亮点一', '测试亮点二'] }
  let routeHits = 0
  await command('Fetch.enable', { patterns: [{ urlPattern: '*api/power-suite.update*', requestStage: 'Request' }] })
  on('Fetch.requestPaused', async (params, eventSession) => {
    try {
      if ((params.request?.url ?? '').includes('api/power-suite.update')) {
        routeHits += 1
        const body = Buffer.from(JSON.stringify(payload)).toString('base64')
        await send('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'content-type', value: 'application/json' },
            { name: 'cache-control', value: 'no-store' }
          ],
          body
        }, eventSession)
      } else {
        await send('Fetch.continueRequest', { requestId: params.requestId }, eventSession)
      }
    } catch (error) {
      errors.push('fetch-handler: ' + error.message)
    }
  })

  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return result.result?.value
  }
  const waitFor = async (expression, timeoutMs, label) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const value = typeof expression === 'function' ? await expression() : await evaluate(expression)
      if (value) return value
      await sleep(120)
    }
    throw new Error('timeout waiting for ' + label)
  }
  const loadPage = async () => {
    // `errors` is cumulative across the whole run: the final assertion must cover
    // every scenario's page load, not only the last one.
    await command('Page.navigate', { url: tokenUrl })
    await waitFor('document.readyState === "complete"', 20000, 'document ready')
    await waitFor('document.querySelectorAll("button").length > 3 || !!document.querySelector("[role=\\"tree\\"]")', 20000, 'shell mounted')
  }
  const cardState = () => evaluate(`(() => {
    const card = document.querySelector('.psu-card')
    if (!card) return null
    return {
      role: card.getAttribute('role'),
      label: card.getAttribute('aria-label'),
      title: card.querySelector('.psu-title')?.textContent ?? null,
      versions: card.querySelector('.psu-versions')?.textContent ?? null,
      buttons: [...card.querySelectorAll('button')].map((button) => ({ action: button.dataset.psuAction, label: button.textContent })),
      details: card.querySelector('.psu-details')?.textContent ?? null,
      rect: card.getBoundingClientRect().toJSON()
    }
  })()`)
  const stored = () => evaluate('localStorage.getItem("power-suite.update-prompt")')

  const checks = []
  const check = (name, ok, detail) => {
    checks.push({ name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  :: ' + redact(JSON.stringify(detail))}`)
  }

  try {
    // 1. Update available: card, geometry, version line, actions.
    await loadPage()
    const card = await waitFor(cardState, 15000, '.psu-card')
    check('card visible', card !== null)
    check('role=region', card.role === 'region', card.role)
    check('version line current → latest', /0\.1\.0.*0\.2\.0/u.test(card.versions ?? ''), card.versions)
    check('update and later actions', card.buttons.some((button) => button.action === 'update') && card.buttons.some((button) => button.action === 'later'), card.buttons)
    check('bottom-right placement', card.rect.right > 1200 && card.rect.bottom > 600, card.rect)
    check('route was requested once on page load', routeHits === 1, routeHits)

    // 2. Details expand/collapse.
    await evaluate('document.querySelector(\'[data-psu-action="details"]\').click()')
    await sleep(150)
    const expanded = await cardState()
    check('details expand the highlights', (expanded.details ?? '').includes('测试亮点一'), expanded.details)
    check('details button becomes collapse', expanded.buttons.some((button) => button.action === 'details' && /收起|Hide/u.test(button.label)), expanded.buttons)

    // 3. Later hides and persists per version.
    await evaluate('document.querySelector(\'[data-psu-action="later"]\').click()')
    await sleep(150)
    check('later hides the card', (await cardState()) === null)
    const persisted = JSON.parse((await stored()) ?? '{}')
    check('later persisted per version', persisted.laterVersion === '0.2.0' && persisted.laterClicks === 1, persisted)

    // 4. Three later clicks expose 不再提醒; silencing hides only that version.
    await evaluate(`localStorage.setItem('power-suite.update-prompt', JSON.stringify({ schema: 1, laterVersion: '0.2.0', laterClicks: 3 }))`)
    await loadPage()
    const fourth = await waitFor(cardState, 15000, 'the prompt that offers dont-remind')
    check('offers dont-remind after three later clicks', fourth.buttons.some((button) => button.action === 'dont-remind'), fourth.buttons)
    await evaluate('document.querySelector(\'[data-psu-action="dont-remind"]\').click()')
    await sleep(150)
    const silenced = JSON.parse((await stored()) ?? '{}')
    check('silence stores only the version', silenced.silencedVersion === '0.2.0' && silenced.laterVersion === undefined, silenced)
    await loadPage()
    await sleep(2600)
    check('silenced version is not shown', (await cardState()) === null)

    // 5. Update opens the Plugins surface and closes the card.
    await evaluate(`localStorage.setItem('power-suite.update-prompt', JSON.stringify({ schema: 1 }))`)
    await loadPage()
    await waitFor(cardState, 15000, 'prompt for the update action')
    const surfaceBefore = await evaluate('!!document.querySelector("[data-plugin-detail], [data-plugin-rows]")')
    check('plugin surface is closed before the update click', surfaceBefore === false, surfaceBefore)
    await evaluate('document.querySelector(\'[data-psu-action="update"]\').click()')
    const opened = await waitFor('!!document.querySelector("[data-plugin-detail], [data-plugin-rows]")', 5000, 'the plugin manager surface')
    check('update action closes the card', (await cardState()) === null)
    check('update action opens the plugin surface', opened === true, opened)

    // 6. No-update answer: silent and resets the stored cycle.
    await evaluate('localStorage.removeItem("power-suite.update-prompt")')
    payload = { current: '0.1.0', latest: '0.1.0', updateAvailable: false, highlights: [] }
    await loadPage()
    await sleep(2600)
    check('no-update answer is silent', (await cardState()) === null)
    check('no-update answer resets the cycle', (await stored()) === '{"schema":1}', await stored())

    // 7. Failed registry answer (latest null): silent, state kept.
    payload = { current: '0.1.0', latest: null, updateAvailable: false, highlights: [] }
    await evaluate(`localStorage.setItem('power-suite.update-prompt', JSON.stringify({ schema: 1, silencedVersion: '9.9.9' }))`)
    await loadPage()
    await sleep(2600)
    check('failed registry answer is silent', (await cardState()) === null)
    check('failed registry answer keeps the state', JSON.parse((await stored()) ?? '{}').silencedVersion === '9.9.9')

    check('no page exception or console error', errors.length === 0, errors.slice(0, 5))
  } finally {
    const failed = checks.filter((entry) => !entry.ok)
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed${failed.length === 0 ? '' : ' — FAILURES'}`)
    socket.close()
    cleanup()
    process.exit(failed.length === 0 ? 0 : 1)
  }
}

start().catch((error) => {
  console.error('update-prompt e2e failed to start: ' + redact(error.message))
  process.exit(2)
})
