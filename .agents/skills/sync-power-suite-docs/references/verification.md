# Verification — dsh-power-suite docs

Run from the repo root. Expected values are dated 2026-11-21 (Node v24.22.3);
derive them from the commands, never copy them forward blindly. `npm run check`
builds `lib/` first, and `npm run check:release` compares the packed `lib/`
against a fresh build before installing.

## Guards

| Command | Expected (2026-11-21) | What it proves |
| --- | --- | --- |
| `npm run check` | Builds first (`build: index.js 105.9 kB, client.js 942.4 kB`), then `typecheck: ok (tsc --noEmit --strict over Host and browser sources; the browser profile gates next)` with `any budget: 0 explicit any sites in src/**/*.ts (limit 0)`, `suppression budget: 0`, `host typecheck: ok`, `built-entry smoke: update route reports current=0.2.2`, `built-browser smoke: @zephinel/dsh-power-suite registered; factory exposes 8 injects`, `docs links ok: 29 Markdown files`, `node --test` **412 tests / 412 pass / 0 fail**, `release-notes: ok (0.2.2; 6 highlight(s), 6 English)`, `check passed: 100 TypeScript modules, 1 JavaScript module(s), 30 test files`, browser ratchet `0 diagnostics (baseline 0)`, and `pack:check` `"entryCount": 82` | Built `lib/` entries, syntax, strict/Host/browser typechecks, package manifest, local/tarball docs hygiene, pure-logic tests, release-notes gate, and packed file set |
| `npm run typecheck:browser` | Browser-profile diagnostics for `src/client.js` + `src/browser/` (`tsc -p tsconfig.browser.json`, DOM lib): current baseline is **0 diagnostics**, and `--check` gates `npm run check` | Browser-typing ratchet at 0 diagnostics (actively gated by `npm run check`) |
| `npm run build` (`node scripts/build.mjs`) | `build: index.js 105.9 kB, client.js 942.4 kB`; writes the gitignored `lib/index.js` (Host ESM) and `lib/client.js` (ESM browser entry + `src/browser/` modules bundled to a classic script) | esbuild bundles the two entries and asserts the Host Loader contract (name `power-suite`, non-empty `inject`, `apply`), the browser entry's DSH module-loader call and package id, and package self-reference |
| `npm test` | `node --test test/*.test.js`: **412 pass, 0 fail, 30 files** (needs Node >= 22.18, no build needed) | Host stores/routes plus browser-side pure models and copy-fence tests; does not read docs prose |
| `npm run typecheck` (`tsc --noEmit --strict`) | clean; `strict: true` over **all** Host and browser TypeScript sources including `src/client.js` (no `@ts-nocheck`), explicit `any` budget 0 | Type-only gate for Host, shared protocol, and browser modules |
| `npm run check:docs-links` (`node scripts/check-docs-links.mjs`) | `docs links ok: 29 Markdown files` | Local links/images resolve across `docs/**/*.md`, `.agents/skills/**/*.md`, `README.md`, `README.zh.md`, `CHANGELOG.md`, `PRODUCT.md`; shipped relative links stay inside `package.json` `files`; shipped docs contain no `/Users/<name>/` personal paths; `README.md` and `README.zh.md` contain no `> [!` GitHub alerts |
| `npm run check:release-notes` (`node scripts/check-release-notes.mjs`) | `release-notes: ok (0.2.2; 6 highlight(s), 6 English)` | `release-notes/<package version>.md` exists with `## Highlights` bullets; optional `.en.md` validated when present |
| `npm run pack:check` | 82 files; contains `lib/`, `docs/` (incl. `docs/assets/`), `assets/`, `locale/`, `release-notes/`, `README.md`, `README.zh.md`, `CHANGELOG.md`, `PRODUCT.md`, `LICENSE`, `NOTICE`, `icon.svg`, `cordis.patch.yml`; excludes `src/`, `.agents/`, `test/`, `.github/` | Shipped-file claims and package entry count |
| `npm run check:release` (`node scripts/release-check.mjs`) | `release-check: PASS` (82 packaged files verified); needs `dsh` and `pnpm` on PATH; uses a throwaway `$DSH_HOME` and isolated Web instance | Tarball build/byte-identity/install/boot/uninstall check (local only, not in CI) |
| `node scripts/check-publish-manifest.mjs` | `publish manifest ok: @zephinel/dsh-power-suite@0.2.2` | Release readiness check (not part of `npm run check`) |
| CI `.github/workflows/ci.yml` | `verify` on Node 22 and 24; `changes` classifies docs-only as `CHANGELOG.md`, `PRODUCT.md`, `docs/**`, `.agents/**`; docs-only runs only `npm run check:docs-links`; anything else runs `npm run check` plus `git diff --exit-code`; no browser job | The CI claims in README/`docs/development.md`; also why a docs-only change still fails on a broken skill link |
| `.github/workflows/publish.yml` | Ordered gates: tag == `package.json` version → publish manifest → `npm run check` → `npm run pack:check` → CHANGELOG dated `## [<version>]` heading → `check:release-notes` → `release-notes-approval.mjs --verify` against the tagged commit body → `npm publish --provenance` → registry poll bounded to 10 minutes | The release-flow claims in `docs/development.md` and the release skill |
| Browser suites (`test/browser/*.e2e.mjs`) | Local only; require the running DSH Web, a token URL and a Chrome binary. `annotation.e2e.mjs`: 16 scenario ids (`SCENARIO_ORDER`), options `--smoke`, `--scenario`, `--from`, `--assets`, `--client`. `sidebar.e2e.mjs`: modes `--smoke`, `--pin`, `--live`, `--layout`, `--interrupted`, `--row-menu`, `--readme-shots`, `--readme-chat`, `--readme-dashboard`, `--readme-sidebar-annotation`, `--no-shots`, `--client`. `update-prompt.e2e.mjs`: 21 checks | Live UI behavior the docs cite; any recorded pass counts and client md5s are historical evidence, not a gate |

## Docs consistency checks (manual; no guard today)

Run these in a delta audit when the touched docs quote the checked facts, and in a
full audit for every row in [`doc-map.md`](doc-map.md). A suggested mechanical
guard for each appears in step 5 of the skill.

```sh
# 1. Docs index completeness: every reference page is listed in docs/README.md.
#    Expected output: icon-brief.md (maintainer record, intentionally unindexed).
comm -23 \
  <(ls docs/*.md | sed 's|docs/||' | grep -v '^README.md$' | sort) \
  <(grep -oE '\]\([a-z0-9-]+\.md' docs/README.md | sed 's/](//' | sort)

# 2. README absolute doc URLs point at files that exist (npm cannot serve
#    relative docs links, so the README uses GitHub blob URLs on purpose).
node --input-type=module <<'NODE'
import fs from 'node:fs'
const prefix = 'https://github.com/Zephinel/dsh-power-suite/blob/main/'
let ok = 0
const bad = []
for (const match of fs.readFileSync('README.md', 'utf8').matchAll(
  new RegExp(prefix.replaceAll('.', '\\.') + '([^)\\s#]+)', 'g')
)) {
  if (fs.existsSync(match[1])) ok++
  else bad.push(match[1])
}
console.log(bad.length ? `README doc links: ${ok} ok, MISSING ${bad.join(', ')}` : `README doc links: ${ok} ok`)
if (bad.length) process.exitCode = 1
NODE

# 3. README image set vs the Bento generator. Five README images are expected:
#    four are composed outputs of scripts/build-readme-bento.mjs, and
#    readme-composer-gallery.webp is a committed capture with no generator.
grep -oE 'assets/[A-Za-z0-9._-]+' README.md | sort -u
grep -oE "out: '[a-z-]+\.webp'" scripts/build-readme-bento.mjs | sort -u

# 4. CHANGELOG carries the dated release heading (local mirror of the publish gate).
node --input-type=module <<'NODE'
import fs from 'node:fs'
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const text = fs.readFileSync('CHANGELOG.md', 'utf8')
const dated = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\]`, 'm').test(text)
console.log(dated ? `changelog ok: ${version}` : `changelog missing the dated heading for ${version}`)
if (!dated) process.exitCode = 1
NODE

# 5. Browser-harness claim check: the scenario count and the seam story.
grep -nE 'eleven|11 scenarios|SCENARIO_ORDER = ' test/browser/README.md test/browser/annotation.e2e.mjs
```

# 6. README stays a landing page, not a manual (contract: SKILL.md § README
#    contract (anti-rot)). Current shape: 135 lines / ~12.7 KB, 6 feature rows + 5 doc-index rows.
wc -l -c README.md README.zh.md
grep -q 'docs/README.md' README.md && grep -q 'docs/README.md' README.zh.md && echo 'docs index linked'
# Doc-only long-form sections must not come back (settings/routes/limits/...).
grep -nE '^## (Settings|Routes|Limits|Troubleshooting|Verification|Release notes)' README.md README.zh.md \
  || echo 'no doc-only sections'

Also verify by hand:

- **Settings quotes** — `docs/settings.md` values against
  `src/features/settings/store.ts`: modes `primary|alt|ctrl|shift|off`, windows
  `60/120/360/720/1440` minutes and `1/3/7/14/30` days, defaults `primary`/`120`/`7`,
  document version 2, field names.
- **Slots and routes** — `docs/architecture.md` *Slots used* table and route tree
  against `ctx.slots.register(...)` in `src/client.js` and the route constants in
  `src/features/**/host.ts`.
- **Release notes source** — `docs/update-check.md` URLs and TTLs against
  `src/features/update-check/{checker,release-notes}.ts` (6 h success cache, 5 min
  failure cache, 5 s timeout, six highlights, tag-pinned raw URL).
- **DSH version claims** — no dependency in `package.json` pins DSH, so the
  DSH 0.2.2 interface target and the 0.2.2-rc.1 browser-check host are
  owner/platform facts, not code-derived; treat them as unverifiable from this
  repo and confirm with the owner before changing them.
- **README portability** — guarded mechanically by `scripts/check-docs-links.mjs`
  (fails on `> [!` markers in `README.md`, `/Users/<name>/` paths in shipped docs,
  and relative links from shipped docs pointing outside `package.json` `files`).
- **Publishing target vs repository metadata** — the README clone URL and the
  absolute doc URLs must match `package.json` `repository` and `origin`.

## Updating counts after a test or packaging change

1. Run `npm run check` and `npm run pack:check`; read the real numbers — modules,
   test files, tests, docs-link file count, release-notes result, packed entry
   count and list.
2. Refresh only the **live** subclaims: the `## Automated` section of
   `docs/verification.md` and any as-built sentence that quotes a count. Every
   dated round in that file is history — append, never rewrite.
3. If a test file or suite was added, keep the file count and the totals in the
   same sentence; never adjust a count by arithmetic on a previous doc value.
4. Append the user-visible change under `## [Unreleased]` in `CHANGELOG.md`;
   the release move to the dated `## [<version>]` heading belongs to
   `.agents/skills/release-power-suite/SKILL.md`, not to a docs sync.
5. Re-run `npm run check:docs-links` after adding or removing any Markdown file or
   image: the count and the scan set include `.agents/skills/**`.

## Known expected non-bugs (do not "fix")

- `docs/verification.md` dated rounds quote counts, builds and client md5s from
  their own run; they are historical like the recorded-evidence sections of
  `test/browser/README.md`. Only the `## Automated` section is live.
- `docs/sidebar-width.md` *Measured acceptance (2026-11-15)* is a historical
  measurement record; the surrounding behavior sections are as-built.
- README's status callout — `0.2.2` published on npm — matches this checkout;
  publishing remains a release-skill action.
- README's absolute GitHub URLs point at the pushed repository and are
  deliberate so the npm-rendered README can reach `docs/`; the manual check in
  the docs-consistency section maps them back onto the checkout.
- `docs/icon-brief.md` is intentionally not indexed in `docs/README.md`; the
  package README ships `docs/` but never links the icon brief.
- The docs are English and `locale/zh.json` is translated display metadata; that
  is not untranslated drift.
- `release-notes/0.1.0.md` / `.en.md` exist before the package is published by
  design; after the `v0.1.0` tag they are immutable (the update notice reads the
  tag's raw URL).
- `.tmp-work/**` captures, logs and `.tgz` files are gitignored; recorded runs are
  cited from the verification/harness docs, never from raw local files.
- `lib/` is a gitignored build output, not a checked-in file; never edit or
  commit it — rebuild with `npm run build`. This repository has no `vendor/`,
  `docs/current-facts.json` or shipped Agent Skill; do not import the
  intelligent-ui pack-facts or Agent-Skill steps into a sync here.
- `npm run check:release` is intentionally not in CI; it is a local pre-release
  gate that needs `dsh` and `pnpm` and boots a throwaway `$DSH_HOME`.
- The `v0.1.0` publish workflow run is red only because the final registry-poll
  step timed out while npm was still propagating; `Publish with provenance`
  succeeded and the registry settled right after. A red publish run is not proof
  of a failed release — check the registry first (the poll window is now the
  60-attempt intelligent-ui window).
- The release-notes approval is a commit-body trailer
  (`Release-Notes-Review: sha256=<hash>`); `--verify` reads `HEAD`, so it runs
  after the release commit exists, and any notes edit changes the hash.
- The two `locale/*.json` files hold only `meta.title`/`meta.description`; per the
  feature recipe that is deliberate, not a missing translation surface.

## Remaining minor hygiene notes

1. `release-notes/0.1.0.md` and `.en.md` still describe the retired Start-page
   Artifacts card (`0.1.0.en.md:4`); because `v0.1.0` is tagged, leave them as
   immutable history.
2. `docs/assets/artifacts-guide.png` is an unreferenced leftover from the
   retired Artifacts guide card (kept out of docs; remove only when cleaning up
   unused assets).
