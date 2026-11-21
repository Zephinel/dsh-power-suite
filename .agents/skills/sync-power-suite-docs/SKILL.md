---
name: sync-power-suite-docs
description: "Keeps the dsh-power-suite bundle's as-built documentation truthful to the current implementation while leaving as-planned and historical docs alone. Use in this repository after behavior, user-visible copy, settings, counts, install steps or release-state changes; when a docs or consistency check fails; or when asked whether the docs are still accurate. Not for prose polish, code review, or writing new docs."
whenToUse: "同步文档, 更新文档, 检查文档, 文档落后了, 文档和实现一致吗, README 对不对, 文档同步, 文档审计, 发布前检查文档, docs out of date, update docs, check docs, docs drift, docs audit, sync documents"
---

# Sync Power Suite Docs

Scope: `dsh-power-suite` — a single installable DSH bundle (`@zephinel/dsh-power-suite`, Loader row `power-suite`). It ships built `lib/index.js` + `lib/client.js` (from TypeScript Host sources under `src/features/` + `src/host/` and ESM browser modules under `src/browser/` + `src/client.js`), `locale/*.json`, `cordis.patch.yml`, `release-notes/`, `assets/`, `README.md`, `README.zh.md`, `CHANGELOG.md`, `PRODUCT.md`, and `docs/`. `test/` and `.agents/` are repo-only. The root README is bilingual (`README.md` + `README.zh.md`), while `docs/` is a single English set (no `docs/*.en.md` or `docs/current-facts.json`).

Docs split into two contracts: **as-built** docs must match the implementation; **as-planned** (`docs/plans/**`) and **historical** (dated verification rounds, released `CHANGELOG` sections, tag-pinned `release-notes/`) stay intact. This skill edits documentation only (never code, never plans/history, never `lib/`).

## Modes and Authorization

Decide both before reading docs:
- **Mode**: **Delta** (default when code/copy/metadata/guards changed — audit touched claims + quoting docs) or **Full audit** (audit every as-built doc in [`references/doc-map.md`](references/doc-map.md) and state coverage).
- **Authorization**: **Audit (read-only)** ("检查 / 核对 / verify / audit" — report only, zero edits) or **Sync (edit)** ("同步 / 更新 / sync / update" or implementation work owning its docs). Ambiguous requests default to read-only audit + one question.

## Steps

1. **Frame & run guards.** Load [`references/verification.md`](references/verification.md). Run `npm run check` (builds `lib/`, runs `scripts/check.mjs`, browser typecheck at 0, docs-links, Node tests, release-notes gate, and `pack:check`). Record exact command outputs as evidence — never do arithmetic on old counts.
2. **Inventory & classify.** Load [`references/doc-map.md`](references/doc-map.md). Split mixed files: `docs/verification.md` (`## Automated` live vs dated rounds historical), `CHANGELOG.md` (`Unreleased` vs released sections), `test/browser/README.md` (harness contract vs recorded evidence), `docs/sidebar-width.md` (*Measured acceptance* historical), `docs/limitations.md` (dated evidence block historical).
3. **Audit as-built claims.** Check touched docs (or all as-built docs in full audit) against code/manifest truth:
   - **Packaging & release state**: `package.json` (`0.2.2` published on npm), `cordis.patch.yml`, `npm run pack:check`, and the DSH interface target **as the running host reports it** (`dsh --version`; 2026-11-21 snapshot: `0.2.2-rc.5`, whose client packages all share that version). A doc that presents an older host version as current is stale.
   - **Environment claims**: every version a doc presents as current — README prerequisites, `docs/architecture.md`/`docs/sidebar-width.md`/`docs/limitations.md` seat notes, the `## Automated` browser block — must match the host the plugin actually runs against, and any recorded evidence must keep its own dated version.
   - **Screenshots and assets**: an illustration whose surface, copy or theme changed since capture is a stale claim. Recapture it through its capture mode, or remove it from the as-built doc (keep the file only for historical evidence). Never keep a screenshot that shows a superseded UI.
   - **Inventory, routes, slots, services, settings**: `src/index.ts`, `src/shared/routes.ts`, `src/client.js`, `src/browser/**` (including `en`/`zh` copy dictionaries in `src/browser/*/{copy,stats,preview,install}.ts`), `src/features/settings/store.ts`, `locale/*.json`.
   - **Verification & CI**: live `## Automated` in `docs/verification.md`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`.
4. **Edit minimally (sync mode only).** Update `README.md` and `README.zh.md` together, matching `docs/*.md`, `docs/README.md` (if pages changed), and `CHANGELOG.md` under `## [Unreleased]`. Release-state transitions follow `.agents/skills/release-power-suite/SKILL.md`. Keep `README.md` and `README.zh.md` portable (no `> [!` GitHub alerts), keep relative links inside `docs/` pointing only to shipped files (use absolute GitHub URLs for repo-only `test/` or `.agents/` targets), and never embed local `/Users/...` paths.
5. **Guard recurring drift.** Extend `scripts/check-docs-links.mjs`, `scripts/check.mjs`, or flat `test/*.test.js` files (tests in subdirectories are skipped by `npm test`) rather than adding redundant mechanisms.
6. **Verify & report.** Re-run `npm run check` and report mode, authorization, guard outputs, changed/proposed claims with evidence pointers, untouched classified docs, unguarded drift, and open questions.

## README contract (anti-rot)

`README.md` and `README.zh.md` are the bilingual npm/GitHub/Plugins-page landing pages (~135–160 lines max); `docs/` is the manual.
- **Belongs in README**: icon/badges/hook, language switcher, status blockquote (portable Markdown — no `> [!`), quick npm/UI install, Overview + 3 short per-area teasers (≤3 bullets each + Read more link), 6-row *Features at a glance* table, Quick start, 5-row *Documentation index* table (absolute GitHub URLs), Development & Contributing, License.
- **Does NOT belong in README**: settings tables, route maps, caps/limits, step-by-step walkthroughs, troubleshooting, verification counts, release-note bodies. Route all detail into `docs/*.md`.
- **Assets**: `npm run build:readme-bento` composes 4 Bento grids (`overview`, `artifacts`, `composer`, `annotation`); `readme-composer-gallery.webp` is a separate committed capture. Never hand-edit images.

## Doc-Specific Gotchas

- **Bilingual root README (`README.md` + `README.zh.md`), single English `docs/` set, no `docs/current-facts.json`**: keep `README.md` and `README.zh.md` in structural and factual parity; do not invent `README.en.md` or `docs/*.en.md`. `lib/` is gitignored build output (rebuild via `npm run build`).
- **Browser typecheck is live and gated at 0**: Phase 3 is complete; `npm run typecheck:browser` (`tsc -p tsconfig.browser.json`) gates `npm run check` at 0 diagnostics alongside root strict `tsc --noEmit` and `tsconfig.host.json`.
- **Tarball link hygiene**: `docs/` ships to npm while `test/` and `.agents/` do not. Never leave relative `../test/...` or `../.agents/...` links inside shipped `docs/` — use absolute GitHub URLs (`https://github.com/Zephinel/dsh-power-suite/blob/main/...`).
- **Tag-pinned release notes**: never edit `release-notes/<version>{,.en}.md` after tagging; fix in a new version.
- **Screenshot staleness is a correctness bug, not cosmetics**: docs screenshots are captured evidence of a surface at a point in time. When copy, geometry, theme tokens or a whole surface changes, the picture in the as-built doc now describes a product that no longer exists. Recapture or remove it in the same change; do not leave it for "later".
- **Release-state claims are written in advance**: the README status blocks, both install pins and the published-version sentences are updated in the release commit, before npm serves the new version; they name the state the tag creates. A sync after publishing may add only registry facts (workflow run id, `dist-tags`, integrity hash) — it must never be the first place the new version appears.
- **Environment versions are claims too**: `dsh --version` and the installed `@deepseek-ai/dsh-*` client packages are the truth for what the plugin runs against. A version written into prose (seat notes, prerequisites) is refreshed with the change, while dated verification rounds keep their historical version.
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
