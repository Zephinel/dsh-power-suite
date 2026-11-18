/**
 * Materialize the browser entry for e2e injection.
 *
 * Phase 3 turns `src/client.js` into an ES module that imports browser-side
 * models; the e2e harness injects code with indirect `eval`, which cannot run
 * `import` statements. Bundle the entry with esbuild (a dev dependency) into a
 * classic IIFE first. Classic baseline copies (for example a pre-change client
 * passed with `--client`) are returned unchanged.
 */
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

/**
 * Read one client entry as classic browser script text.
 * @param {string} clientPath - absolute path of the browser entry.
 * @returns {Promise<string>} source ready for `Page.addScriptToEvaluateOnNewDocument`.
 */
export async function readClientForInjection(clientPath) {
  const source = await readFile(clientPath, 'utf8')
  if (!/(^|\n)\s*import\s/u.test(source)) return source
  const result = await build({
    entryPoints: [clientPath],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent'
  })
  return result.outputFiles[0].text
}
