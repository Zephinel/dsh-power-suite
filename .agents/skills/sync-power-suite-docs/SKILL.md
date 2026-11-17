---
name: sync-power-suite-docs
description: "Keeps the dsh-power-suite bundle's as-built documentation truthful to the current implementation while leaving as-planned and historical docs alone. Use in this repository after behavior, user-visible copy, settings, counts, install steps or release-state changes; when a docs or consistency check fails; or when asked whether the docs are still accurate. Not for prose polish, code review, or writing new docs."
whenToUse: "同步文档, 更新文档, 检查文档, 文档落后了, 文档和实现一致吗, README 对不对, 文档同步, 文档审计, 发布前检查文档, docs out of date, update docs, check docs, docs drift, docs audit, sync documents"
---

# Sync Power Suite Docs

Scope: the `dsh-power-suite` repository — one installable DSH bundle. It ships a
Node Host half (`src/index.js` plus `src/features/<name>/`), a Web browser half
(one `//#region feature:` group per feature in `src/client.js`), plugin display
metadata (`locale/*.json`), the bundle patch (`cordis.patch.yml`), the release
notes and changelog, and a documentation set (`README.md`, `docs/`,
`PRODUCT.md`) that **ships in the npm package**, plus a repo-only
`test/browser/README.md`. A small esbuild build (`npm run build`) produces the
gitignored `lib/index.js` and `lib/client.js` that the npm package ships; the
Host sources are still JavaScript in Phase 2, and there is no vendored tree or
bilingual doc pair. DSH shell docs are out of scope.

Docs split into two contracts. **As-built** docs describe what the bundle does
now and must match the code. **As-planned** docs (proposals, roadmaps, future
checklists) and **historical** docs (verification logs, recorded evidence,
release history) may differ on purpose. Classify first, then sync only the
as-built set.

This skill works on documentation only — editing when sync is authorized,
reporting otherwise. It does not change behavior to match documentation, and it
does not rewrite plans, history, generated assets, release notes after tagging,
or released changelog sections.

## When to Use

- After changing behavior, user-visible copy, settings defaults or enums,
  route/slot/service names, counts, install steps, or release state under `src/`,
  `package.json`, `cordis.patch.yml`, `locale/`, `release-notes/`, or `docs/**` —
  including bumping the version or appending to `CHANGELOG.md`.
- When `npm run check`, `npm run check:docs-links`, `npm run check:release-notes`,
  or a docs-consistency test fails.
- When asked to check, sync, or update the README, the `docs/` set, the docs
  index, `test/browser/README.md`, `PRODUCT.md`, or release/publication claims.
- Before a release (load `.agents/skills/release-power-suite/SKILL.md` first;
  this skill only syncs the docs), or after a DSH version or dependency change.

Near misses: prose polish belongs to `write`; code review to `check`; roadmap or
proposal writing to a planning workflow; implementing a behavior a doc promises
is normal implementation, not this skill.

## Modes and Authorization

Decide both before reading docs; each defaults from the request.

**Mode**

- **Delta** — a change is in scope (working tree, diff, commit, or the user's
  description). Audit the claims that change touches, plus docs that quote them.
  Default whenever anything under the repo's behavior, copy, metadata, or guards
  changed.
- **Full audit** — no change; the ask is "are the docs current?". Audit
  drift-prone claims across every as-built doc in
  [`references/doc-map.md`](references/doc-map.md), starting with the README,
  the feature docs, `docs/overview.md`, `docs/architecture.md` and
  `docs/usage.md`; state coverage and what was not covered.

**Authorization**

- **Audit (read-only)** — "检查 / 核对 / verify / check / audit" without edit
  intent. Report stale claims and the proposed fix; do not edit. If fixes are
  wanted, the user asks, or you ask once.
- **Sync (edit)** — "同步 / 更新 / sync / update", or an implementation task that
  owns its doc updates. Edit as-built docs minimally.

An ambiguous request defaults to audit, then one question. Documentation
authorization never extends to code changes; code fixes need their own request.
An ambiguous doc class is left alone and flagged.

## Outcome Contract

- Outcome: as-built docs proven current or corrected; as-planned, historical,
  asset/generated and legal files deliberately left alone; work bounded by the
  chosen mode and authorization.
- Done when: every audited claim has an evidence pointer; every edit maps to one;
  every untouched doc is listed with its class and reason; full audits state
  coverage; the repo guards pass or their failures are explained.
- Output: mode + authorization, coverage, changed or proposed claims with
  evidence, untouched docs with reason, unguarded drift, and open questions.
- Scope: docs only. Behavior changes, new-feature proposals, screenshot
  recapture decisions and release publishing are out of scope unless the owner
  asks.

## Steps

### 1. Set the frame and run the guards

Load [`references/verification.md`](references/verification.md). Run
`npm run check` when feasible (it builds `lib/` first, then runs
`scripts/check.mjs` and `npm run pack:check`), or at least
`npm run check:docs-links`, `npm test` and `npm run check:release-notes`; record
the outputs — module/test-file/test counts, docs-link file count, release-notes
result and pack entry count become evidence. Read
`.agents/skills/release-power-suite/SKILL.md` when the change is
release-adjacent. Name the mode, the authorization, and the delta evidence or
the full-audit coverage boundary.

Completion criterion: mode and authorization are named; guard output is
recorded; every claim in scope has an evidence pointer or is explicitly marked
unverifiable.

### 2. Inventory and classify

Load [`references/doc-map.md`](references/doc-map.md). Tag each file and section
with its class, including new docs that appeared since the map was written (a
new `docs/<feature>.md`, a `docs/plans/` tree, a new `.agents/skills/**` file).
Split mixed files: README's as-built feature prose versus its release-state
status callout; `docs/verification.md`'s live `## Automated` section versus the
dated round records below it; `CHANGELOG.md`'s `Unreleased` delta versus
released sections; `test/browser/README.md`'s harness contract versus its
recorded-evidence sections.

Completion criterion: every doc in scope is tagged; mixed files have their
sections split; every as-planned doc either carries a visible plan marker or is
flagged.

### 3. Audit as-built claims

Check each as-built claim against its truth source from
[`references/doc-map.md`](references/doc-map.md), using the claim groups below.
Record stale, incorrect, missing, and unverifiable claims. In full audit, track
coverage per doc.

Claim groups for this bundle:

- **Product state and packaging**: one bundle `@zephinel/dsh-power-suite`, one
  Loader row `power-suite`, features as modules inside the package, an esbuild
  build to the gitignored `lib/` entries, no runtime dependencies, Node.js 22+,
  DSH 0.2.2 plugin interface (the
  Web Host used for the browser checks runs 0.2.2-rc.1), Web platform only,
  pnpm for bundle installs, Chrome optional for the browser suites, `docs/`,
  `assets/`, `locale/` and `release-notes/` ship in the package while
  `.agents/**` does not. Sources: `package.json`, `cordis.patch.yml`,
  `src/index.js` (`name`, `inject`), `scripts/check.mjs`.
- **Manifest and shipped set**: name, version, description, `exports`, `files`,
  `main`, `icon`, `engines`, `dsh.client.inject`, `publishConfig`, `repository`;
  the packed file list and entry count. Sources: `package.json`,
  `npm run pack:check` output.
- **Feature inventory and navigation**: README's *Features at a glance* table,
  `docs/overview.md`'s *Features* table, `docs/README.md`'s reference list and
  `docs/usage.md`'s sections agree with each other and with the installed
  features (`src/index.js` installers plus `//#region feature:` marks in
  `src/client.js`). The composer image gallery is a browser-only capability
  documented inside `usage.md`, not a Host feature module — count modules, not
  table rows. Sources: `src/index.js`, `src/client.js` region marks, those docs.
- **UI copy and settings**: every quoted label comes from the inline `en`/`zh`
  dictionaries in the feature's `src/client.js` region; the settings contract
  comes from `src/features/settings/` — prompt-history modifier modes
  `primary | alt | ctrl | shift | off` defaulting to platform primary,
  `recentSessionMinutes` `60/120/360/720/1440` defaulting to `120`,
  `activeProjectDays` `1/3/7/14/30` defaulting to `7`, stored document version 2,
  `GET/POST /api/power-suite.settings`, `$DSH_HOME/dsh-power-suite/settings.json` —
  plus the annotation mode's own modifiers and the other browser-local defaults,
  storage keys and caps.
- **Routes, slots, services, storage**: `docs/architecture.md`'s Host route map,
  browser-half tree and *Slots used* table match the route strings in
  `src/features/**/host.js`, the `ctx.slot` registrations in `src/client.js`,
  the `inject` union in `src/index.js`, and the profile storage documents.
  Quoted caps and limits (annotation record cap 100, read-ack entries 1000,
  prompt cap 500, sidebar-width range 264–420 px, 5 s undo, 24-candidate
  marquee, three "later" clicks, six highlights, activity-ledger caps) come from
  code.
- **Browser behavior**: per-feature claims (artifact sources and Quick Look
  formats, prompt rail, draft attachment memory, interrupted marks and implicit
  continuation, annotation picking/anchors/chips, row menu and pending flags,
  rainbow/atmosphere, update notice states) match `src/client.js` and the
  pure-logic tests that cover the same derivations.
- **Verification and packaging**: `docs/verification.md`'s live gate
  description, test/module/pack counts and browser-suite facts; CI behaviour in
  `.github/workflows/ci.yml`; publish gates in
  `.github/workflows/publish.yml`; the local package-level gate
  (`npm run check:release`) and the release-notes approval hash
  (`node scripts/release-notes-approval.mjs`). Truth is command output and the
  workflow/script files, never a previous doc.
- **Release state and history**: README's status callout and "after the 0.1.0
  release" wording, `CHANGELOG.md`'s first-release framing,
  `release-notes/<version>.md` highlights, `package.json` version, git remote
  state and npm publication state. The current truth is *release prepared, not
  published*.
- **Repository and contribution**: the clone URL equals the repository the
  README publishes to; GitHub Issues is the contribution channel once pushed;
  `npm run check` is the local gate; behavior/copy/gate changes update the
  matching docs; the release and docs-sync skills are named at their real paths.
- **Screenshots and assets**: README images are composed 1600 px WebP Bento grids
  under `assets/` built from gitignored isolated-instance raw captures;
  `docs/assets/` holds the reference screenshots; `scripts/build-readme-bento.mjs`
  composes four README grids, and the composer-gallery capture is a committed
  capture with no generator command — state that as it is. A Chinese-UI capture
  needs a live Chinese session.

Completion criterion: every audited claim is verified, corrected, or listed
unresolved; full audits state which docs and claim groups were not covered.

### 4. Edit minimally, only when authorized

In audit mode, stop and propose; do not edit. In sync mode, change only claims
proven wrong or missing. Update the whole user-visible delta in the same edit:
`README.md`, the matching `docs/*.md` (and `docs/README.md` when a page is added
or removed), and `CHANGELOG.md` under `## [Unreleased]`. Release-state edits
(`CHANGELOG` section moves, `release-notes/`, the README status callout) follow
`.agents/skills/release-power-suite/SKILL.md` timing, not this skill. Take UI
copy from `src/client.js`, defaults and routes from `src/features/**`, and
counts and sizes from command output, never from arithmetic on memory. Match
each document's language and tone: the docs are English, and quoted Chinese UI
is deliberate.

Keep link shapes as they are: relative links inside `docs/`, absolute
`https://github.com/Zephinel/dsh-power-suite/blob/main/...` links from the
README to `docs/` (npm cannot serve relative doc links), and repo-only
`.agents/**` paths as code spans where the README is the npm-rendered document.

Generated and reference-only content is off-limits: raw captures under
`.tmp-work/` (gitignored), `node_modules/`, and `LICENSE`/`NOTICE`. README
assets are regenerated with `npm run build:readme-bento` (or recaptured through
the README modes of `test/browser/sidebar.e2e.mjs`) — never hand-edited.

When an as-built doc advertises planned behavior: qualify it as planned, or move
it to a plan doc — ask the owner before deleting it. When a plan was
implemented: leave the plan as history and update the as-built docs instead.

Completion criterion: read-only runs have zero edits; every changed line traces
to an evidence pointer; no plan, history, release-note-after-tag, generated or
vendored text was rewritten; no unrelated prose or formatting churned.

### 5. Guard the claims that will drift again

Where a claim is mechanically checkable, extend an existing guard instead of
adding a new mechanism: `scripts/check-docs-links.mjs` (its scan set, and the
only gate in the CI docs-only path — a natural home for docs-index completeness,
absolute README→docs URL and anchor checks), `scripts/check.mjs` (manifest and
shipped-set assembly), `scripts/check-release-notes.mjs` (notes format), the
`publish.yml` CHANGELOG gate (including the release-notes approval
verification), or a flat `test/*.test.js` that reads a doc and compares it to
its code source (tests in subdirectories are silently skipped). When behavior
changes, update the guard's expected values together with the docs.

Completion criterion: each riskiest corrected claim is now covered by a guard,
or the report says why no guard is feasible and what to watch instead.

### 6. Verify and report

Re-run the guards after edits (`npm run check`; `npm run check:docs-links`;
`npm run check:release-notes`; `npm run pack:check`). Report mode,
authorization, coverage, and the lists in the template below.

Completion criterion: guards pass or their failures are explained; the report
lets the owner see which decisions were theirs.

## Doc-Specific Gotchas

- **No doc pairs; a small build exists.** The docs are a single English set; do
  not create `README.en.md`, `docs/*.en.md`, `vendor/` or a
  `docs/current-facts.json` to "match" the intelligent-ui repository. `npm run
  build` emits only the gitignored `lib/` entries (Phase 2), and `npm run
  typecheck` (`tsc --noEmit`, part of `npm run check`) emits nothing; `src/
  client.js` is opted out until Phase 3.
- **`docs/verification.md` is a historical evidence ledger with one live part.**
  The `## Automated` section describes the current gates and is refreshed from
  command output; everything from the first dated round down is history — append
  new evidence, never rewrite a past round.
- **`CHANGELOG.md` is append-only history.** During release preparation the
  `Unreleased` entries move under `## [<version>] - <UTC date>` and an empty
  `## [Unreleased]` heading stays; `publish.yml` requires the dated heading.
  Never rewrite a released section.
- **`release-notes/<version>{,.en}.md` are tag-pinned.** The in-app update notice
  reads them from the tag's raw GitHub URL, so a file committed under a tag is
  user-visible and must never be edited afterwards — fix a typo with a new
  version. The default file is required with `## Highlights`; the English file
  is optional; 2–6 user-facing bullets is the convention the gate does not
  enforce.
- **The README renders in three places.** GitHub renders the repository README,
  npm renders the packaged README, and the DSH Plugins page shows it above the
  suite's settings section (hidden while that section mounts). Use portable
  Markdown only: GitHub alert markers (`> [!NOTE]`, `> [!IMPORTANT]`) show their
  text literally in npm and the Plugins page, so a plain blockquote with a bold
  label is the portable form. Its status callout is release-state as-built:
  update it when the package is actually published, and keep the install wording
  honest until then. Keep it a landing page, not a manual — see the README contract (anti-rot)
  below.
- **Docs ship; README links to them by absolute URL.** `package.json` `files`
  includes `docs/`, but an absolute GitHub link is what makes those links work
  from the npm README. Relative links are correct inside `docs/`; the absolute
  ones are not mechanically checked.
- **Some shipped docs link repo-only targets.** `docs/README.md` links
  `../test/browser/README.md`, and `docs/development.md` links `../.agents/...`;
  both resolve in the checkout (the link gate proves it) but not inside the npm
  tarball. Keep the existing shapes and ask the owner before switching them to
  absolute URLs.
- **`docs/README.md` is the docs index.** It currently lists 17 of the 18
  reference pages; `docs/icon-brief.md` is a maintainer record and is not
  indexed. Link a new public page from the index; completeness is unguarded.
- **`docs/ui-annotation.md` repeats its second half.** `## Selecting elements` →
  `## Limits` appears once, then an older copy repeats from
  `## Selecting elements` to a second `## Limits`; the first copy is the current
  text. Ask the owner before editing or de-duplicating, and never sync both
  copies.
- **UI copy is bilingual; the docs are English.** The browser half registers
  `en`/`zh` dictionaries inline in each feature region. Quote English labels in
  English docs; quote Chinese labels only when the doc demonstrates the Chinese
  UI. The two `locale/*.json` files hold translated plugin display metadata and
  are not docs.
- **Screenshots are generated evidence.** README images are composed Bento grids;
  `docs/assets/` carries the reference screenshots. `.tmp-work/readme-shots/raw/`
  and other `.tmp-*` trees are gitignored — cite recorded runs, not raw files,
  as shipped evidence. The plans and verification rounds that produced old
  captures are history; recapture rather than hand-edit.
- **`test/browser/README.md` mixes contract and history.** The top describes how
  to run the suites, their modes and gate semantics (as-built); the
  recorded-evidence sections quote specific builds, client md5s and check counts
  (historical). Sync commands and modes; leave the evidence records.
- **`docs/icon-brief.md` and `docs/reference-libraries.md` are provenance
  records**, not behavior contracts. `PRODUCT.md` is product intent. Do not
  align them with implementation details; update `PRODUCT.md` only when the
  product direction changes.
- **CI's docs-only fast path** treats `CHANGELOG.md`, `PRODUCT.md`, `docs/**` and
  `.agents/**` as docs-only and runs only `check:docs-links`; README,
  `release-notes/**`, `package.json` and `test/**` take the full gate. The
  browser suites never run in CI.

## README contract (anti-rot)

The README is the npm-rendered landing page, the Plugins-page introduction and
the top-level docs index; `docs/` is the manual. Its job is to keep the first
screen useful — install, what the bundle adds, where to read more — instead of
re-growing into a second copy of the docs. Baseline at the 2026-11-17 skill
port: **235 lines / ~21 KB**, four per-area stories, an 11-row *Features at a
glance* table and five README images.

**What belongs in the README**

- Icon/title, npm/license/DSH badges, one-line hook, the quick npm install
  snippet and the release-state status callout.
- `## Overview`: one paragraph, one image, a few short capability bullets and a
  "Read more" link line.
- The four top-level per-area stories (sidebar/Workspaces, session artifacts,
  composer, UI annotation): one paragraph + one image + ≤4 short bullets + one
  "Read more" link each. These are teasers, not walkthroughs.
- *Features at a glance*: exactly one table row per shipped feature, each row
  carrying its docs link.
- Install, Quick start, Get the code, Prerequisites, Build/test/deploy,
  Documentation (links the `docs/README.md` index and the concept pages),
  Contributing, License.
- Nothing else: settings values, route maps, caps/limits, step-by-step flows,
  troubleshooting, verification counts, release-note text and per-feature
  reference tables belong in `docs/<feature>.md`, `docs/usage.md`,
  `docs/settings.md`, `docs/architecture.md`, `docs/development.md` or
  `docs/verification.md`.

**Routing rule for a normal change**

1. Behavior/copy/gate detail → the matching `docs/` page (+ `docs/README.md`
   when a page is added or removed) and `CHANGELOG.md`.
2. New feature → `docs/<feature>.md`, one row in `docs/README.md`, one row in
   the README *Features at a glance* table (plus a one-line teaser only if it is
   a new top-level area), the `docs/overview.md` feature table and `CHANGELOG.md`.
3. README edits triggered by a change are normally: the status callout, one
   table row, one teaser sentence or one docs link — never a new section.
4. Do not add a fifth per-area story or a second features table; do not move
   docs content into the README to explain a change.

**Budget and drift signals**

- Keep ≤~250 lines / ~24 KB; above ~260 lines means detail is leaking out of
  `docs/` — extract it instead of extending the README.
- Duplicated paragraphs or tables between the README and `docs/` are drift: the
  `docs/` page is the source of truth and the README keeps only the teaser.
- Keep the link shapes: absolute GitHub URLs for README→docs (npm cannot serve
  relative doc links), relative links inside `docs/`, and the five README images
  with their generator/no-generator split.
- Keep the status callout release-state as-built; publishing changes it only
  through the release skill.
- A README edit changes packed bytes: refresh the dated pack size record in
  `docs/verification.md` (and `docs/development.md` if it quotes sizes) in the
  same change; the `pack:check` entry count changes only when the packed file
  set changes.

**Re-read before committing a README edit**

- First screen cold: what the bundle is, how to install/try it, where the deeper
  docs start.
- The story sections are still teasers; the *Features at a glance* table still
  has one row per shipped feature and a working docs link.
- Run the manual docs checks in `references/verification.md`, then the gates.

## Ask the Owner Before

- A doc or section could be a plan or an as-built claim (for example the
  first-release framing versus the current checkout).
- An as-built doc promises a feature that does not exist (qualify, move,
  implement, or delete — the owner chooses).
- Screenshots, marketing copy, or user-visible wording need a product decision or
  a new capture.
- Release state, npm dist-tag, version, CHANGELOG section timing, or
  `release-notes` text may change.
- A drift-prone fact is duplicated between the README and `docs/`, and one side
  must become the source of truth.
- Code and a plan/spec disagree, and the plan may be authoritative.

## Report Template

```
Mode: <delta | full audit> — <read-only audit | sync authorized>
Guards: npm run check <modules/test files/tests>; check:docs-links <N Markdown files>; check:release-notes <version/Highlights>; pack:check <entry count/sizes>
Coverage: <audited docs/claim groups; for full audit, what was not covered and why>

Changed (as-built) / Proposed (read-only):
- <path> — <stale claim> → <now says> (evidence: <file:line | command output>)

Untouched (classified):
- <path> — as-planned | historical | generated/asset | external — <reason>

Unguarded drift:
- <claim> — no mechanical check; suggested: <guard>

Questions:
- <decision the owner must make>
```

## References

- [`references/doc-map.md`](references/doc-map.md) — per-doc class, truth source,
  and existing guard for this repository. Load in step 2.
- [`references/verification.md`](references/verification.md) — guard commands,
  expected outputs, docs-consistency checks, and known non-bugs. Load in step 1
  and before reporting.

These two references describe the repo as of 2026-11-17. When the doc inventory,
guards, scripts, or expected counts change, update them in the same change — they
are maintenance metadata, not shipped docs.

This skill lives at `.agents/skills/sync-power-suite-docs/` for project-local
discovery. `package.json` `files` does not include `.agents/`, so it is not
shipped to npm.
