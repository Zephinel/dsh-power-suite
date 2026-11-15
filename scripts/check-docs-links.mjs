#!/usr/bin/env node
/**
 * Local Markdown link gate:
 *   every local link and image in docs/, README.md, CHANGELOG.md, PRODUCT.md and
 *   .agents/skills/** must resolve on disk.
 *
 * Extracted from `scripts/check.mjs` so the CI docs-only fast path can run the
 * one check that matters for a documentation-only change. Run directly with
 * `node scripts/check-docs-links.mjs` or through `npm run check:docs-links`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Collect every Markdown file below a directory (absent directory -> none). */
function collectMarkdown(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectMarkdown(path))
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path)
  }
  return files
}

const markdownFiles = [
  ...collectMarkdown(resolve(root, 'docs')),
  ...collectMarkdown(resolve(root, '.agents/skills')),
  resolve(root, 'README.md'),
  resolve(root, 'CHANGELOG.md'),
  resolve(root, 'PRODUCT.md')
].filter((file) => existsSync(file))

const failures = []
for (const file of markdownFiles) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = match[1].trim().replace(/^<|>$/gu, '').split('#')[0]
    if (target === '' || /^(https?:|mailto:|data:)/u.test(target)) continue
    if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) {
      failures.push(`${file.slice(root.length + 1)} links to missing ${target}`)
    }
  }
}

if (failures.length > 0) {
  console.error('docs links failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log(`docs links ok: ${markdownFiles.length} Markdown files`)
