---
name: sync-power-suite-docs
description: "Keeps the dsh-power-suite bundle's as-built documentation truthful to the current implementation while leaving as-planned and historical docs alone. Use in this repository after behavior, user-visible copy, settings, counts, install steps or release-state changes; when a docs or consistency check fails; or when asked whether the docs are still accurate. Not for prose polish, code review, or writing new docs."
whenToUse: "同步文档, 更新文档, 检查文档, 文档落后了, 文档和实现一致吗, README 对不对, 文档同步, 文档审计, 发布前检查文档, docs out of date, update docs, check docs, docs drift, docs audit, sync documents"
---

# Sync Power Suite Docs

Scope: `dsh-power-suite` — a single installable DSH bundle (`@zephinel/dsh-power-suite`, Loader row `power-suite`). It ships built `lib/index.js` + `lib/client.js` (from TypeScript Host sources under `src/features/` + `src/host/` and ESM browser modules under `src/browser/` + `src/client.js`), `locale/*.json`, `cordis.patch.yml`, `release-notes/`, `assets/`, `README.md`, `CHANGELOG.md`, `PRODUCT.md`, and `docs/`. `test/` and `.agents/` are repo-only. Docs are a single English set (no bilingual doc pairs, no `docs/current-facts.json`).

Docs split into two contracts: **as-built** docs must match the implementation; **as-planned** (`docs/plans/**`) and **historical** (dated verification rounds, released `CHANGELOG` sections, tag-pinned `release-notes/`) stay intact. This skill edits documentation only (never code, never plans/history, never `lib/`).

## Modes and Authorization

Decide both before reading docs:
- **Mode**: **Delta** (default when code/copy/metadata/guards changed — audit touched claims + quoting docs) or **Full audit** (audit every as-built doc in [`references/doc-map.md`](references/doc-map.md) and state coverage).
- **Authorization**: **Audit (read-only)** ("检查 / 核对 / verify / audit" — report only, zero edits) or **Sync (edit)** ("同步 / 更新 / sync / update" or implementation work owning its docs). Ambiguous requests default to read-only audit + one question.

## Steps

1. **Frame & run guards.** Load [`references/verification.md`](references/verification.md). Run `npm run check` (builds `lib/`, runs `scripts/check.mjs`, browser typecheck at 0, docs-links, Node tests, release-notes gate, and `pack:check`). Record exact command outputs as evidence — never do arithmetic on old counts.
2. **Inventory & classify.** Load [`references/doc-map.md`](references/doc-map.md). Split mixed files: `docs/verification.md` (`## Automated` live vs dated rounds historical), `CHANGELOG.md` (`Unreleased` vs released sections), `test/browser/README.md` (harness contract vs recorded evidence), `docs/sidebar-width.md` (*Measured acceptance* historical), `docs/limitations.md` (dated evidence block historical).
3. **Audit as-built claims.** Check touched docs (or all as-built docs in full audit) against code/manifest truth:
   - **Packaging & release state**: `package.json` (`0.2.1` published on npm), `cordis.patch.yml`, `npm run pack:check`, DSH 0.2.2 target (full browser suites verified on `0.2.2-rc.1`; 0.2.2 scroll/hover updates verified on `0.2.2`).
   - **Inventory, routes, slots, services, settings**: `src/index.ts`, `src/shared/routes.ts`, `src/client.js`, `src/browser/**`, `src/features/settings/store.ts`, inline `en`/`zh` dictionaries.
   - **Verification & CI**: live `## Automated` in `docs/verification.md`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`.
4. **Edit minimally (sync mode only).** Update `README.md`, matching `docs/*.md`, `docs/README.md` (if pages changed), and `CHANGELOG.md` under `## [Unreleased]`. Release-state transitions follow `.agents/skills/release-power-suite/SKILL.md`. Keep `README.md` portable (no `> [!` GitHub alerts), keep relative links inside `docs/` pointing only to shipped files (use absolute GitHub URLs for repo-only `test/` or `.agents/` targets), and never embed local `/Users/...` paths.
5. **Guard recurring drift.** Extend `scripts/check-docs-links.mjs`, `scripts/check.mjs`, or flat `test/*.test.js` files (tests in subdirectories are skipped by `npm test`) rather than adding redundant mechanisms.
6. **Verify & report.** Re-run `npm run check` and report mode, authorization, guard outputs, changed/proposed claims with evidence pointers, untouched classified docs, unguarded drift, and open questions.

## README contract (anti-rot)

`README.md` is the npm/GitHub/Plugins-page landing page (~225–250 lines max); `docs/` is the manual.
- **Belongs in README**: icon/badges/hook, quick npm install, status blockquote (portable Markdown — no `> [!`), Overview + 4 short per-area teasers (≤4 bullets each + Read more link), 11-row *Features at a glance* table, Install, Quick start, Get the code, Prerequisites, Build/test/deploy, Documentation index links (absolute GitHub URLs), Contributing, License.
- **Does NOT belong in README**: settings tables, route maps, caps/limits, step-by-step walkthroughs, troubleshooting, verification counts, release-note bodies. Route all detail into `docs/*.md`.
- **Assets**: `npm run build:readme-bento` composes 4 Bento grids (`overview`, `artifacts`, `composer`, `annotation`); `readme-composer-gallery.webp` is a separate committed capture. Never hand-edit images.

## Doc-Specific Gotchas

- **Single English doc set, no `docs/current-facts.json`**: do not invent `README.en.md` or `docs/*.en.md`. `lib/` is gitignored build output (rebuild via `npm run build`).
- **Browser typecheck is live and gated at 0**: Phase 3 is complete; `npm run typecheck:browser` (`tsc -p tsconfig.browser.json`) gates `npm run check` at 0 diagnostics alongside root strict `tsc --noEmit` and `tsconfig.host.json`.
- **Tarball link hygiene**: `docs/` ships to npm while `test/` and `.agents/` do not. Never leave relative `../test/...` or `../.agents/...` links inside shipped `docs/` — use absolute GitHub URLs (`https://github.com/Zephinel/dsh-power-suite/blob/main/...`).
- **Tag-pinned release notes**: never edit `release-notes/<version>{,.en}.md` after tagging; fix in a new version.
- **CI docs-only fast path**: `CHANGELOG.md`, `PRODUCT.md`, `docs/**`, `.agents/**` run only `npm run check:docs-links`; `README.md`, `package.json`, `release-notes/**`, `src/**`, `test/**` run the full `npm run check`. Browser e2e suites run locally only.

## Ask the Owner Before

- Classifying ambiguous plan vs as-built text, or deleting an unimplemented feature promise.
- Recapturing screenshots or changing marketing copy / release version / npm dist-tags.

## Report Template

```text
Mode: <delta | full audit> — <read-only audit | sync authorized>
Guards: npm run check <result>; check:docs-links <N files>; check:release-notes <version>; pack:check <entryCount>
Coverage: <audited docs/claim groups; omissions if any>
Changed / Proposed:
- <path> — <old> → <new> (evidence: <file:line | command>)
Untouched (classified):
- <path> — <as-planned | historical | generated/asset> — <reason>
Unguarded drift / Questions:
- <item>
```

## References

- [`references/doc-map.md`](references/doc-map.md) — per-doc class, truth source, and guards.
- [`references/verification.md`](references/verification.md) — guard commands, expected outputs, and non-bugs.
