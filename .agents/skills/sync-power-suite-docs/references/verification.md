# Verification — dsh-power-suite docs

Run from the repo root. Expected values are dated 2026-11-18 (Node v24.22.3);
derive them from the commands, never copy them forward blindly. `npm run check`
builds `lib/` first, and `npm run check:release` compares the packed `lib/`
against a fresh build before installing.

## Guards

| Command | Expected (2026-11-18) | What it proves |
| --- | --- | --- |
| `npm run check` | Builds first (`build: index.js 105.9 kB, client.js 928.5 kB`), then `typecheck: ok (tsc --noEmit --strict; browser entry opted out until the Phase 3 split completes)` with `any budget: 0 explicit any sites in src/**/*.ts (limit 0)`, a `built-entry smoke: update route reports current=0.1.0`, and `check passed: 76 TypeScript modules, 1 JavaScript module(s), 28 test files.`; `node --test` reports **392 tests / 392 pass / 0 fail**; `docs links ok: 28 Markdown files`; `release-notes: ok (0.1.0; 6 highlight(s), 6 English)`; then `pack:check` reports `"entryCount": 75`. Fails on any build error, syntax error, missing manifest target, broken local docs link/image, failing Node test, missing release-notes Highlights, or a pack failure | The built `lib/` entries, syntax of the checked-in modules, package manifest/export/file presence, local docs links and images, the pure-logic suite, the release-notes gate and the packed file set |
| `npm run typecheck:browser` | Browser-profile diagnostics for the opt-out `src/client.js`: a temp copy disables `@ts-nocheck`, runs `tsc -p tsconfig.browser.json` (DOM lib, `types: []`, `dom.d.ts` excluded) and prints total/per-code/per-feature counts; default mode reports against `scripts/browser-typecheck-baseline.json`, `--write` refreshes it, `--check` fails on a counter above baseline. Current baseline is 197 diagnostics at this HEAD; the main gate stays unaffected | The browser-typing ratchet and per-region progress; it does not gate `npm run check` yet |
| `npm run build` (`node scripts/build.mjs`) | `build: index.js 105.9 kB, client.js 928.5 kB`; writes the gitignored `lib/index.js` (Host ESM) and `lib/client.js` (ESM browser entry + `src/browser/` modules bundled to a classic script) | esbuild bundles the two entries and asserts the Host Loader contract (name `power-suite`, non-empty `inject`, `apply`), the browser entry's DSH module-loader call and package id, and (from inside `lib/`) that the package self-reference resolves the manifest. Same script runs from `prepare` and `npm run check` |
| `npm test` | `node --test test/*.test.js`: 392 pass, 0 fail, 28 files (including the release-notes approval round-trip, the protocol contract guard and the document-store interface). Needs Node >= 22.18: the tests import the Host `.ts` sources through native type stripping, with no build | Host stores/routes plus browser-side derivations through `test/helpers/client-module.mjs`; it never reads `docs/`, `README.md`, `CHANGELOG.md` or `locale/*.json`, so a green suite does not prove docs are current |
| `npm run typecheck` (`tsc --noEmit --strict`) | clean; `strict: true` over the Host TypeScript sources (`src/**/*.ts`); the browser entry (ESM `src/client.js` + `src/browser/`) opts out with `// @ts-nocheck` until the Phase 3 split completes | Type-only gate: real annotations on the Host modules, shared protocol types, and the `test/protocol-contract.test.js` guard for duplicated route/enum literals. Explicit `any` is gated at 0: `npm run check` strips comments/strings and fails on any `any` code token (aliases, unions and generics included) — a lexical tripwire, not a proof. The Host context is modeled structurally in `src/host/context.ts` (including the opaque DSH `FsTarget`/`FileInfo` shapes) and unknown thrown values are read through `src/host/errors.ts`. The typecheck emits nothing; the Phase 2 build separately produces `lib/` |
| `npm run check:docs-links` (`node scripts/check-docs-links.mjs`) | `docs links ok: 28 Markdown files` | Every local link and image in `docs/**/*.md`, `.agents/skills/**/*.md`, `README.md`, `CHANGELOG.md` and `PRODUCT.md` resolves on disk. Skipped: `http(s):`, `mailto:`, `data:`; `#fragment` is stripped. Not checked: heading anchors, absolute GitHub URLs, `test/browser/README.md`, `release-notes/*.md`, non-`.md` targets. Adding or removing a skill file changes the file count — keep the skill's own links resolving |
| `npm run check:release-notes` (`node scripts/check-release-notes.mjs`) | `release-notes: ok (0.1.0; 6 highlight(s), 6 English)` | `release-notes/<package version>.md` exists and its `## Highlights` has at least one bullet; `<version>.en.md` is optional but validated when present. It does not enforce the 2–6 bullet convention |
| `npm run pack:check` | 75 files; `size` 4,593,645 B; `unpackedSize` 6,280,490 B; contains `lib/` (the two built entries), `docs/` (incl. `docs/assets/`), `assets/`, `locale/`, `release-notes/`, `README.md`, `CHANGELOG.md`, `PRODUCT.md`, `LICENSE`, `NOTICE`, `icon.png`, `cordis.patch.yml`; excludes `src/`, `.agents/`, `test/`, `.github/` | Shipped-file claims and package size. Byte counts vary with the npm/platform versions and with any packed doc edit — quote the file list as the fact and the sizes as a dated local record |
| `npm run check:release` (`node scripts/release-check.mjs`) | `release-check: PASS (75 packaged files verified)` in about 9 s; deletes `lib/` before `npm pack` so `prepare` must rebuild it; needs `dsh` and `pnpm` on PATH; uses a throwaway `$DSH_HOME` and an isolated 127.0.0.1 Web instance | Builds `lib/`, packs the tarball, installs it into a fresh profile, and proves the packed `lib/` matches the fresh build, every other packed file is byte-identical to the checkout and the installed copy, the packed patch/Host entry name the `power-suite` row, the composed tree mounts the Loader row, the boot graph serves the installed client bundle, and uninstall removes the dependency, row and directory. Deliberately not in CI (Linux runner behaviour unverified) |
| `node scripts/check-publish-manifest.mjs` | `publish manifest ok: @zephinel/dsh-power-suite@0.1.0` | Release readiness only (run after `"private": true` is removed): name, repository URL, `publishConfig.access`, `files` containing `release-notes`, the `check:release-notes` script. Deliberately **not** part of `npm run check` |
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
#    contract (anti-rot)). Baseline 2026-11-17: 235 lines / ~21 KB, 11 table rows.
wc -l -c README.md
grep -c '^| \[' README.md          # expect 11 feature rows
grep -q 'docs/README.md' README.md && echo 'docs index linked'
# Doc-only long-form sections must not come back (settings/routes/limits/...).
grep -nE '^## (Settings|Routes|Limits|Troubleshooting|Verification|Release notes)' README.md \
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
- **README portability** — the README renders on GitHub, in npm and on the DSH
  Plugins page; `grep -n '> \[!' README.md` must stay empty. GitHub alert markers
  show their text literally in npm and the Plugins page, so use a plain
  blockquote with a bold label (suggested flat guard: a test asserting no
  `> [!` marker line in `README.md`).
- **Publishing target vs repository metadata** — the README clone URL and the
  absolute doc URLs must match `package.json` `repository`; the repository has no
  git remote at this checkout, so there is nothing to compare against but the
  manifest.

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
- README's status callout — `0.1.0` published on npm — matches this checkout;
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

## Known drift to flag (as of 2026-11-17)

These were observed against the current checkout. They are findings for the next
delta/full audit, not part of this skill's initial port; fix them only in a sync
that authorizes those files.

1. `test/browser/README.md` says "eleven acceptance scenarios" / "11 scenarios"
   (`:4`, options block) while `annotation.e2e.mjs` defines 16 scenario ids
   (`SCENARIO_ORDER` at `:3578`); its seam-generation story also lags the
   accepted seam generations. The file is titled as the annotation harness but
   also documents the sidebar and update-prompt harnesses, has a duplicated
   `## Update prompt harness` heading near `:1404`, and hardcodes the GUI URL at
   `:64`.
2. `docs/development.md:101` says "README.md links the four outputs", but
   `README.md` references five images: `readme-composer-gallery.webp` has no
   generator in `scripts/build-readme-bento.mjs`.
3. `docs/architecture.md`: the route tree (`:14-21`) omits
   `GET /api/power-suite.interrupted-events` (described at `:340`); the
   *Slots used* table (`:812-823`) omits `sidebar.session.row.hover`; the browser
   tree (`:26`) still lists the retired right-Sidebar guide card and omits the
   composer image gallery; the injected-service list (`:375`) names the unused
   `sidebarRightTabs` and omits `remote.agentPresets`; the locale-namespace list
   (`:381-383`) omits `composerImageGallery`.
4. `docs/session-artifacts.md:131` still says the Artifacts guide card uses
   `ai-generate-3d-line`, while the same page (`:320`) records that the guide
   card was retired.
5. `docs/overview.md:53` and `docs/development.md:151` feature recipes still name
   a "tab type" and "guide card" although the page-type design is retired;
   `docs/overview.md:58-59` also says feature copy goes into the locale
   dictionaries, while the current pattern is inline per-region dictionaries in
   `src/client.js` (only display metadata lives in `locale/*.json`).
6. Annotation paint layer conflict: `src/client.js:10280` sets
   `ANNOTATION_PAINT_Z = 2000` (applied `:16075-16089`), docs say `150`
   (`docs/ui-annotation.md:331`, `:1288`) and the code comment says "below modals
   (1000)/menus (1100)" — needs a live probe and an owner decision.
7. `docs/ui-annotation.md` repeats an older second half from the second
   `## Selecting elements` (around `:1760`) to the second `## Limits`; decide with
   the owner, sync only the first copy. The two copies also disagree on the
   launcher ("docks into the rail" at `:18-21` versus "no docked copy" at
   `:205-208`), and the page mixes "v3 document" (`:474`) with "v2 document"
   (`:1165`) — resolve against `src/client.js` (v3 document carrying v2 records)
   before quoting either.
8. `release-notes/0.1.0.md` and `.en.md` still describe the retired Start-page
   Artifacts card (`0.1.0.en.md:4`). The `v0.1.0` tag pinned them, so they are
   immutable history now — fix only in a new version.
9. `docs/usage.md` has no sidebar-width or update-notice section although
    `README.md` and `docs/README.md` describe the usage page as covering every
    feature step by step; confirm with the owner whether the usage tutorial is
    intentionally selective. `docs/usage.md:115` also says the prompt rail is
    "newest at top", while `README.md:63`, `docs/prompt-history.md:57-58` and
    `src/client.js:9497` describe oldest-first with the newest tick at the foot.
10. Shipped docs carry repo-only relative links that are dead in the npm tarball:
    `docs/README.md:45` links `../test/browser/README.md`, and
    `docs/development.md` links both skills under `../.agents/...`; those targets
    are excluded from `package.json` `files`. The root README uses absolute
    GitHub URLs instead. Decide with the owner whether to switch these to
    absolute URLs (the link gate only proves they resolve in the checkout).
11. `docs/assets/artifacts-guide.png` is not referenced by any doc — a leftover
    from the retired Artifacts guide card.
