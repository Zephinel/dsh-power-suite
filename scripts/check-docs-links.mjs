#!/usr/bin/env node
/**
 * Local Markdown link and shipped-doc hygiene gate:
 *   - every local link and image in docs/, README.md, CHANGELOG.md, PRODUCT.md
 *     and .agents/skills/** must resolve on disk;
 *   - relative links from shipped Markdown files must resolve inside the
 *     published package file set (no dead tarball links to test/ or .agents/);
 *   - shipped Markdown files must not embed personal /Users/<name>/ paths;
 *   - README.md must stay portable (no GitHub > [! alert syntax).
 *
 * Extracted from `scripts/check.mjs` so the CI docs-only fast path can run the
 * one check that matters for a documentation-only change. Run directly with
 * `node scripts/check-docs-links.mjs` or through `npm run check:docs-links`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const shippedEntries = new Set([...(pkg.files ?? []), 'package.json'])

/** Whether a repo-relative path belongs to the npm tarball. */
function isShippedPath(relPath) {
  const normalized = relPath.replace(/\\/gu, '/')
  const top = normalized.split('/')[0]
  return shippedEntries.has(normalized) || shippedEntries.has(top)
}

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
  const relFile = relative(root, file).replace(/\\/gu, '/')
  const shipped = isShippedPath(relFile)
  const text = readFileSync(file, 'utf8')
  if (relFile === 'README.md' && /^>\s*\[!/mu.test(text)) {
    failures.push('README.md contains non-portable GitHub alert syntax (> [!...)')
  }
  if (shipped && /\/Users\/[A-Za-z0-9._-]+\//u.test(text)) {
    failures.push(`${relFile} contains a personal /Users/<name>/ path`)
  }
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = match[1].trim().replace(/^<|>$/gu, '').split('#')[0]
    if (target === '' || /^(https?:|mailto:|data:)/u.test(target)) continue
    const resolved = resolve(dirname(file), decodeURIComponent(target))
    if (!existsSync(resolved)) {
      failures.push(`${relFile} links to missing ${target}`)
      continue
    }
    const relTarget = relative(root, resolved).replace(/\\/gu, '/')
    if (shipped && !isShippedPath(relTarget)) {
      failures.push(`${relFile} (shipped) links via relative path to repo-only ${relTarget} (use an absolute GitHub URL)`)
    }
  }
}

if (failures.length > 0) {
  console.error('docs links failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log(`docs links ok: ${markdownFiles.length} Markdown files`)
