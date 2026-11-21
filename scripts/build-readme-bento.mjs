#!/usr/bin/env node
/**
 * Compose the README raw screenshots into fixed Bento grids.
 *
 * Sources: `.tmp-work/readme-shots/raw/` (PNG captures from
 * `node test/browser/sidebar.e2e.mjs --readme-shots`) plus the refreshed
 * `docs/assets/annotation-*.png` set. Outputs: deterministic dark 1600 px WebP
 * grids under `assets/`. No network, no dependencies; headless Chrome is the
 * only requirement.
 *
 *   npm run build:readme-bento      # or: node scripts/build-readme-bento.mjs
 */
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = process.env.README_SHOTS_DIR ?? join(root, '.tmp-work', 'readme-shots', 'raw')
const docsAssets = join(root, 'docs', 'assets')
const outDir = join(root, 'assets')

/** Chrome binary candidates, most specific first. */
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0)

/**
 * Frame themes shared by every group. The app surface is dark, so on a light
 * warm canvas the dark screenshot tiles read like floating product windows
 * (the README choices mirror the reference repo's warm-gray frame); the dark
 * theme is kept for a dark-frame variant.
 */
const FRAMES = {
  light: {
    // Soft pale beige canvas with warm-white screenshot cards.
    background: '#f6f1e6',
    tile: '#fffdf8',
    tileBorder: 'rgba(92, 77, 52, .16)',
    radius: 18,
    shadow: '0 10px 26px rgb(80 65 40 / 12%), inset 0 1px 0 rgb(255 255 255 / 70%)'
  },
  dark: {
    background: '#0b0c0e',
    tile: '#15161a',
    tileBorder: 'rgba(255,255,255,.07)',
    radius: 18,
    shadow: '0 18px 40px rgb(0 0 0 / 45%), inset 0 1px 0 rgb(255 255 255 / 4%)'
  }
}

const FRAME = { width: 1600, padding: 28, gap: 18, ...FRAMES[process.env.README_BENTO_FRAME === 'dark' ? 'dark' : 'light'] }

/**
 * Bento layouts: one entry per output. Cells are laid out by `columns` or `rows`,
 * every cell takes a fixed pixel width and derives its height from the source
 * capture's aspect, and the canvas height follows the content. A capture whose
 * size changes therefore re-flows instead of being cut by a stale crop.
 *
 * Widths are CSS px inside the 1600 px frame (28 px padding, 18 px gutter).
 * @type {Array<{out: string, columns?: Array<{width: number, files: string[]}>, rows?: Array<Array<{file: string, width: number}>>}>}
 */
const layouts = [
  {
    out: 'readme-overview.webp',
    columns: [
      { width: 862, files: ['workspaces.png', 'row-menu.png'] },
      { width: 664, files: ['card.png', 'card-hover.png'] }
    ]
  },
  {
    out: 'readme-artifacts.webp',
    rows: [
      [{ file: 'artifacts.png', width: 1544 }],
      [{ file: 'artifacts-quicklook.png', width: 760 }, { file: 'artifacts-filter.png', width: 766 }]
    ]
  },
  {
    out: 'readme-composer.webp',
    rows: [
      [{ file: 'composer-chat.png', width: 1000 }, { file: 'settings.png', width: 526 }]
    ]
  },
  {
    out: 'readme-annotation.webp',
    rows: [
      [{ file: 'annotation-annotated.png', width: 1544 }]
    ]
  }
]

/** Image MIME by extension. */
function mediaType(file) {
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.webp')) return 'image/webp'
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg'
  throw new Error(`unsupported source image: ${file}`)
}

/** Resolve one cell source to an absolute path (docs/ or raw/). */
function sourcePath(cell) {
  return cell.source === 'docs' ? join(docsAssets, cell.file) : join(rawDir, cell.file)
}

/** Encode one file as a data URI for the local composed page. */
async function dataUri(cell) {
  const file = sourcePath(cell)
  if (!existsSync(file)) throw new Error(`missing README capture: ${file}`)
  const bytes = await readFile(file)
  return `data:${mediaType(cell.file)};base64,${bytes.toString('base64')}`
}

/**
 * Read a PNG's intrinsic size from its IHDR chunk.
 * @param {Buffer} bytes - file bytes.
 * @returns {{width: number, height: number}} pixel size.
 */
function pngSize(bytes) {
  const signature = bytes.subarray(0, 8).toString('binary')
  if (signature !== '\x89PNG\r\n\x1a\n') throw new Error('not a PNG file')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * Position every cell of one layout and derive the canvas height.
 *
 * `columns` stack their files vertically in one column; `rows` lay their files
 * out left to right at a shared top edge. Both derive each cell's height from
 * the capture's own aspect, so a differently sized raw can never be cropped by
 * a stale constant.
 * @param {object} layout - one entry of {@link layouts}.
 * @returns {Promise<{out: string, height: number, cells: Array<{file: string, x: number, y: number, w: number, h: number}>}>} the positioned layout.
 */
async function computeLayout(layout) {
  const cells = []
  let height = FRAME.padding
  if (Array.isArray(layout.columns)) {
    let x = FRAME.padding
    let tallest = 0
    for (const column of layout.columns) {
      let y = FRAME.padding
      for (const file of column.files) {
        const size = pngSize(await readFile(sourcePath({ file })))
        const h = Math.round((column.width / size.width) * size.height)
        cells.push({ file, x, y, w: column.width, h })
        y += h + FRAME.gap
      }
      tallest = Math.max(tallest, y - FRAME.gap)
      x += column.width + FRAME.gap
    }
    height = tallest + FRAME.padding
  } else {
    let y = FRAME.padding
    for (const row of layout.rows ?? []) {
      let x = FRAME.padding
      let rowHeight = 0
      for (const cell of row) {
        const size = pngSize(await readFile(sourcePath(cell)))
        const h = Math.round((cell.width / size.width) * size.height)
        cells.push({ file: cell.file, x, y, w: cell.width, h })
        rowHeight = Math.max(rowHeight, h)
        x += cell.width + FRAME.gap
      }
      y += rowHeight + FRAME.gap
    }
    height = y - FRAME.gap + FRAME.padding
  }
  const widest = Math.max(...cells.map((cell) => cell.x + cell.w))
  if (widest > FRAME.width - FRAME.padding) {
    throw new Error(`bento: ${layout.out}: cells reach ${widest}px, beyond the ${FRAME.width}px frame`)
  }
  return { out: layout.out, height: Math.round(height), cells }
}

/** Build the composed HTML page for one positioned layout. */
async function buildHtml(layout) {
  const figures = []
  for (const cell of layout.cells) {
    const src = await dataUri({ file: cell.file })
    figures.push(
      `<figure style="left:${cell.x}px;top:${cell.y}px;width:${cell.w}px;height:${cell.h}px">` +
        `<img src="${src}" alt="">` +
      '</figure>'
    )
  }
  const readyScript = `
Promise.all([...document.images].map((image) => image.decode().catch(() => {}))).then(() => {
  document.documentElement.dataset.bentoReady = '1'
});
`
  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0;padding:0;background:' + FRAME.background + ';}' +
    '#frame{position:relative;width:' + FRAME.width + 'px;height:' + layout.height + 'px;box-sizing:border-box;overflow:hidden;}' +
    'figure{margin:0;position:absolute;overflow:hidden;border-radius:' + FRAME.radius + 'px;' +
    'background:' + FRAME.tile + ';border:1px solid ' + FRAME.tileBorder + ';box-shadow:' + FRAME.shadow + ';' +
    'display:flex;align-items:center;justify-content:center;}' +
    'img{display:block;width:100%;height:100%;object-fit:cover;}' +
    '</style></head><body><div id="frame">' + figures.join('') + '</div>' +
    '<script>' + readyScript + '</script></body></html>'
}

/** Find the configured Chrome binary. *//** Find the configured Chrome binary. */
function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
  if (found === undefined) throw new Error(`Chrome not found (set CHROME_BIN); tried: ${CHROME_CANDIDATES.join(', ')}`)
  return found
}

/** Minimal CDP client over the browser WebSocket (Node >= 22 global WebSocket). */
class Cdp {
  #socket
  #id = 0
  #pending = new Map()

  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (message.id === undefined) return
      const pending = this.#pending.get(message.id)
      if (pending === undefined) return
      this.#pending.delete(message.id)
      if (message.error !== undefined) pending.reject(new Error(`${pending.method}: ${message.error.message ?? 'CDP error'}`))
      else pending.resolve(message.result)
    })
  }

  /**
   * Send one CDP command.
   * @param {string} method - CDP method.
   * @param {object} [params] - parameters.
   * @param {string} [sessionId] - target session.
   * @returns {Promise<object>} the CDP result.
   */
  send(method, params = {}, sessionId) {
    const id = ++this.#id
    const payload = { id, method, params }
    if (sessionId !== undefined) payload.sessionId = sessionId
    this.#socket.send(JSON.stringify(payload))
    return new Promise((resolvePromise, rejectPromise) => {
      this.#pending.set(id, { method, resolve: resolvePromise, reject: rejectPromise })
    })
  }

  close() {
    try {
      this.#socket.close()
    } catch {
      // Already closed.
    }
  }
}

/** Read the DevToolsActivePort file emitted by Chrome. */
async function readDevToolsPort(profileDir, timeoutMs = 15000) {
  const file = join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const text = (await readFile(file, 'utf8')).trim().split('\n')
      if (text.length >= 2 && text[0].length > 0) return { port: Number(text[0]), path: text[1] }
    }
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Chrome did not expose a DevTools port within ${timeoutMs} ms`)
}

/** Launch headless Chrome and return the process plus a connected CDP client. */
async function launchChrome(chrome, width, height, profileDir) {
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--metrics-recording-only',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    `--window-size=${width},${height}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })
  const { port, path: wsPath } = await readDevToolsPort(profileDir)
  const socket = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`)
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', () => rejectOpen(new Error(`CDP socket failed${stderr === '' ? '' : `: ${stderr.trim().split('\n')[0]}`}`)), { once: true })
  })
  return { child, cdp: new Cdp(socket) }
}

/** Wait until the target page reports a complete document. */
function waitForReady(cdp, sessionId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  return (async () => {
    while (Date.now() < deadline) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState === "complete" && !!document.getElementById("frame") && document.documentElement.dataset.bentoReady === "1"',
        returnByValue: true
      }, sessionId).catch(() => null)
      if (result?.result?.value === true) return
      await new Promise((done) => setTimeout(done, 100))
    }
    throw new Error(`composed page did not become ready within ${timeoutMs} ms`)
  })()
}

/** Read the pixel dimensions of one WebP output (sips when available). */
function pixelSize(file) {
  const result = spawnSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' })
  if (result.status !== 0) return null
  const width = /pixelWidth: (\d+)/u.exec(result.stdout)?.[1]
  const height = /pixelHeight: (\d+)/u.exec(result.stdout)?.[1]
  return width === undefined || height === undefined ? null : { width: Number(width), height: Number(height) }
}

/** Main entry: build every group, write assets, verify outputs. */
async function main() {
  const chrome = findChrome()
  await mkdir(outDir, { recursive: true })
  const temp = await mkdtemp(join(tmpdir(), 'power-suite-bento-'))
  let launched = null
  try {
    const rows = []
    for (const spec of layouts) {
      const group = await computeLayout(spec)
      const html = await buildHtml(group)
      const pageFile = join(temp, `${group.out}.html`)
      await writeFile(pageFile, html, 'utf8')
      const target = await launchedFor(launched, chrome, temp, group)
      launched = target
      const { cdp, sessionId } = target
      await cdp.send('Page.navigate', { url: `file://${pageFile}` }, sessionId)
      await waitForReady(cdp, sessionId)
      await new Promise((done) => setTimeout(done, 250))
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'webp',
        quality: 90,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: FRAME.width, height: group.height, scale: 1 }
      }, sessionId)
      const outFile = join(outDir, group.out)
      await writeFile(outFile, Buffer.from(shot.data, 'base64'))
      const bytes = (await stat(outFile)).size
      const size = pixelSize(outFile)
      if (bytes < 10_000) throw new Error(`${group.out} is suspiciously small (${bytes} B)`)
      if (size === null) throw new Error(`${group.out} is not a readable WebP (sips failed)`)
      if (size.width !== FRAME.width || size.height !== group.height) {
        throw new Error(`${group.out} has ${size.width}x${size.height}, expected ${FRAME.width}x${group.height}`)
      }
      rows.push({ out: group.out, bytes, width: size.width, height: size.height })
    }
    console.log('bento: built')
    for (const row of rows) console.log(`  assets/${row.out}  ${row.width}x${row.height}  ${(row.bytes / 1024).toFixed(1)} KiB`)
  } finally {
    if (launched !== null) {
      launched.cdp.close()
      launched.child.kill('SIGKILL')
    }
    await rm(temp, { recursive: true, force: true })
  }
}

/**
 * Reuse one Chrome instance across groups: create a fresh target/session each
 * time so page state cannot leak between grids.
 */
async function launchedFor(current, chrome, temp, group) {
  if (current === null) {
    const profileDir = join(temp, 'profile')
    const launched = await launchChrome(chrome, FRAME.width, group.height, profileDir)
    const { targetId } = await launched.cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await launched.cdp.send('Target.attachToTarget', { targetId, flatten: true })
    await launched.cdp.send('Page.enable', {}, sessionId)
    await launched.cdp.send('Runtime.enable', {}, sessionId)
    await launched.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: FRAME.width,
      height: group.height,
      deviceScaleFactor: 1,
      mobile: false
    }, sessionId)
    return { ...launched, sessionId }
  }
  await current.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: FRAME.width,
    height: group.height,
    deviceScaleFactor: 1,
    mobile: false
  }, current.sessionId)
  return current
}

await main().catch((error) => {
  console.error(`bento failed: ${error?.message ?? String(error)}`)
  process.exit(1)
})
