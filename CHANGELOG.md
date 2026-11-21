# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **The disclosure triangle is painted at the title colour on every row.** The triangle copied the native project-row arrow's caption grey (`#adb2b8`), which nearly vanished on the bright pastel rainbow bar of the current row and read fainter than the row's own title everywhere else. Every row's triangle now uses the same `label-primary` token as its title (near-black `#0f1115` in light mode, white `#f9fafb` in dark), at rest and on hover, while the shell's own project-row arrows keep their native caption weight. Measured in the live GUI: the triangle resolves to the row's title colour (`rgb(15, 17, 21)` in light mode; the same token makes it `#f9fafb` in dark).

- **Review round: the card's own glyphs keep their tooltips, a pinned pin keeps its accent, and the Files list keeps its copied/disabled colours.** A two-reviewer pass over the change set found six regressions, all fixed. The glyph routing no longer swallows the pending/waiting and interrupted badges' native `title` tooltips (only the anonymous spinner/dot/sparkle/robot glyphs are pointer-transparent; the labelled badges stay pickable, and their `aria-label` is the anchor). The highlighted-row glyph rule no longer repaints a **pinned** pin — it keeps the business accent — and an unpinned pin still takes the title colour on hover through its own `:not([data-pinned='true'])` rule. In the Files panel the row-level lift is narrowed with `:not([data-copied='true']):not(:disabled)`, so a copied row's success-green check and a disabled action keep their colours (the old lift outranked both). The native current-row rule now only suppresses the shell's hover block (the card rows and the plugin's own Continue stopped painting brightness steps), the light-mode current-row lift no longer demotes the disclosure triangle (its colour is decided by the triangle rule described in the newest entry above), and three routed glyphs that were missed are covered (the Files filter caret, the Files empty/error glyph, and the prompt-history rail's ticks, whose screen-reader span is now pointer-transparent so the pick lands on the button). The sidebar E2E's new row-cell oracles were corrected for the two real invariants — child rows reserve no leading disclosure cell (they are indented under the trunk) and all times end 8 px inside the row edge — plus the pin suite's rest-title literal (46 → 50), and the as-built docs were aligned with the measured geometry.

- **New app icon, shipped as SVG.** `icon.png` (the 3D toolbox illustration) is replaced by `icon.svg`: a ruler, a browser-window card and a wrench rising out of a chat bubble, on a near-black tile with a lime accent and light depth, shared in shape and palette with the DSH Intelligent UI icon. `package.json` (`icon`, the `./icon` export and `files`), both README headers and the required-file list in `scripts/release-check.mjs` now point at `icon.svg`; `docs/icon-brief.md` and its preview image describe the new icon.

- **The rest of the plugin now follows the same two rules as the card: one hover surface, and icon-free annotation targets.** Auditing every plugin surface for the card's two defects found the same patterns elsewhere. *Hover:* the Files/artifacts rows and the interrupted-session Continue button painted a second hover block inside an already-highlighted row; both now keep the row as the only surface and just lift the action glyphs to the label-primary colour (focus rings unchanged). *Annotation anchors:* the card's panel-header indicator swaps node types with the run state (pulse span <-> brand svg) exactly like the row glyph, and every icon inside a labelled control was itself the pick target (an attribute-less svg, so a positional anchor). The header indicator now carries `data-testid="psd-panel-indicator"`, and icons are pointer-transparent inside the card (header, fold chevrons, bucket toggles, row controls), the Files panel (action buttons, toolbar tool, row glyph and thumbnail, which fall through to the row), the interrupted-session Continue button and the composer gallery's nav/close buttons — so a pick lands on the labelled control or the stable cell. A live DOM audit of the card reports zero weak pick targets (`elementFromPoint` never lands on an unlabelled svg/img inside plugin chrome). Transient surfaces (Quick Look, gallery, prompt-history preview, update prompt, preset menu) stay as-is: the annotation card already marks them ephemeral. Docs updated (`docs/ui-annotation.md`, `docs/session-artifacts.md`, `docs/interrupted-sessions.md`).

- **UI annotations on the card's status icons no longer say "No longer on the page".** The row's status/identity glyph is state-dependent markup (running spinner `<svg>`, finished dot `<span>`, read sparkle `<svg>`, interrupted warning, waiting flag), so a pick that landed on one of those nodes stored a positional anchor (`span > span > span > svg`); the next state flip replaced the node and the record honestly fell back to "No longer on the page" even though the row never moved. Each row's status cell now carries a Session-scoped, white-listed anchor — `data-testid="psd-session-glyph:<sessionId>"` — and the glyphs inside it are `pointer-events: none`, so the annotation pick lands on that one stable span (verified in the live GUI: `document.elementFromPoint` at the icon centre returns `span.psd-run-glyph-cell` with a selector that matches exactly one element). The row's controls do the same for their inner svgs (the pick lands on the button, whose `aria-label` names the Session). Annotations on a state glyph therefore survive re-renders, group moves and state changes; the trade-off is that the shell-rendered dot/spinner itself is no longer an independent annotation target — annotate the cell or the row. Docs updated (`docs/ui-annotation.md`, `docs/dynamic-workspaces.md`).

- **Card rows get a right inset and one hover surface; every glyph follows the highlighted title colour.** The trailing cell ended on the row's own right edge, so the time and the hover-revealed "…"/New session controls sat flush against the card border with no breathing room, and each control painted its own hover block (plus, on the rainbow row, its own `brightness(1.2)` step) inside the row. The row now keeps the native Session row's **8 px right padding** (parent rows `0 8px 0 7px`, child rows `0 8px 0 0`) and the header chevron is inset to the same right edge, so the time reads 12 px inside the card edge and the revealed controls never touch it (measured: card time/actions right edge `392` inside a row that ends at `400`, native Session-row time `402`). Hovering an ordinary row now paints **only the row bar**: the disclosure triangle, the pin, the "…" trigger, New session and Continue no longer paint a background or a brightness lift of their own (the row-level rainbow lift stays on the row), and while a row is highlighted — pointer on it, keyboard focus inside, or an open row menu — all of its glyphs (triangle, pin, "…", New session, Continue, brand/robot identity) take the title colour, `label-primary` (`#f9fafb` dark / `#0f1115` light), which is what the rainbow row's bright identity glyph already showed. Status dots keep their semantic state colour. Docs, the harness contract and the sidebar E2E hover oracles were updated to the single-surface rule (`filter: none` on controls, no control hover block).

- **The "Running & recent" card rows now copy the native sidebar geometry: time on the far right, disclosure triangle on the far left.** The panel's rows had anchored four fixed columns from the right edge (48 px time, 22 px New session slot, 24 px disclosure chevron), so every card time ended 50 px short of the row edge and its 11 px `label-primary` text read larger and brighter than the native Session rows right below it; the per-parent disclosure chevron sat in that right-most column. Each row now opens with the native project-row disclosure: the shell's filled `triangle-right-fill` glyph (14 px, caption `#adb2b8`, pointing right when folded and rotating 90° when open, 150 ms) in a 16 px leading cell, reserved as an empty spacer on rows without subagents so the status glyph, the title and the child tree trunk keep their columns. The trailing cell (46 px) is anchored on the row's right edge and carries the relative time at rest — now the native time recipe, 10 px in the tertiary `#adb2b8` with tabular numerals, ending inside the row's 8 px right inset (measured in the live GUI after the inset landed: card time right edge **392 px** in a row that ends at **400**, native Session row **402 px**, both 10 px `rgb(173,178,184)`), with the relative buckets copied from the shell's `relativeTime` helper (minutes, hours, days, months past 30 days, years past 365). Hovering or keyboard-focusing a main row swaps the time for the "…" trigger and the New session button **at the far right of the same cell** (no column moves, the swap persists while the menu is open), child rows keep their time and render no action cell, and the header closes the same right edge with its count badge and chevron while its indicator stays centred on the rows' leading-glyph column. The pin reveal now slides the title 50 → 75 px (was 46 → 71), and the sidebar E2E column oracles were rewritten for the new cells.

- **Bilingual UI copy audit, vocabulary unification and text-fence suite.** Audited all 9 browser locale namespaces and `locale/{en,zh}.json` against ASD-STE100 plain-language rules and unified terminology across Chinese and English: Chinese copy consistently uses `会话` (not `Session`), `工作区` (not `Workspace`), `运行中与最近` (replacing `进行中与最近活跃` and untranslated `Running & recent`), `修改说明` (replacing mixed `需求` / `要求` / `备注`), `定位较弱` (replacing `弱身份`), `引用标签` (replacing `引用控件`) and `临时浮层` (replacing `瞬态浮层`), while English copy unifies annotation notes to `Requested change` / `Change`, removes semicolon chains, filler words (`please`), modal ambiguity (`may`/`might`), future-tense promises (`will`/`would`) and `(s)` plural shortcuts, and replaces internal jargon (`present` tool, `Primary` enum) with plain user-facing labels (`⌘ / Ctrl`). Extracted `ANNOTATION_EN` / `ANNOTATION_ZH` into `src/browser/ui-annotation/copy.ts` (`src/client.js` drops to 508 lines), removed 27 dead locale keys across `ui-annotation`, `dynamic-workspaces` and `settings`, aligned `serializers.ts` default fallbacks and as-built docs (`docs/settings.md`, `docs/ui-annotation.md`, `docs/update-check.md`, `docs/usage.md`, `docs/dynamic-workspaces.md`, `docs/limitations.md`, `docs/reference-libraries.md`) plus `test/browser/annotation.e2e.mjs` with the updated copy, and added `test/copy-fence.test.js` covering 1:1 key/placeholder parity, zero dead keys, bilingual text fences, control-label quotes, serializer fallbacks and `1`-vs-`N` plural rendering (411/411 Node tests).

- **The row menu `⋯` and New session `⊕` follow the title colour while their row is highlighted.** The controls kept their resting row-icon weight until the pointer was on the control itself - secondary `#61666b` for both in light, and in dark the secondary `#cfd3d6` for `⋯` and the tertiary `#adb2b8` for `⊕` - so on a highlighted row, where the title is `label-primary` and the row carries the hover fill or the pastel atmosphere, they read as washed out. On the Running & recent card's `.psd-run` rows, on the shell's own sidebar Session rows, and on the Workspace row above them (its `⋯` and `⊕` both pinned themselves to `label-tertiary` and only darkened on their own hover) the strip now takes the title's `label-primary` while the row is highlighted (pointer on the row, keyboard focus inside it, or the row menu open; the native rows also follow the plugin's rainbow marker) and returns to the resting weight afterwards. Each control keeps its own hover/focus feedback, focus is gated to keyboard modality like the shell's own strip, and nested subagent rows are unaffected. Archived Session rows are excluded: the shell dims their titles to `label-caption` on purpose, so their strip stays dim too. Measured on the live GUI: card light `#61666b -> #0f1115`, card dark `#cfd3d6`/`#adb2b8 -> `#f9fafb`, native Session row light `#81858c -> #0f1115`, native Session row dark `#adb2b8 -> #f9fafb`, Workspace row light `#81858c -> #0f1115` and dark `#adb2b8 -> #f9fafb` for both buttons, all reverting on pointer leave. The card row's brand sparkle - `label-primary` by default and demoted to `#61666b` only by the light current-row lift - returns to `#0f1115` on the rainbow row, and the unpinned pin control goes `#81858c -> #0f1115` in light and `#adb2b8 -> #f9fafb` in dark; a pinned pin keeps the business colour and the status dot keeps its shell state colour, since those colours carry state rather than weight. A subagent row's robot glyph was the one surface the light-mode lift still demoted on the rainbow row (`label-secondary`, one step paler than its own title); it now keeps the title colour there (`#61666b -> #0f1115`, measured on a live subagent row opened as the current Session), while dark mode keeps that glyph at `label-primary` as before. The native Workspace row's folder glyph and disclosure chevron/arrow follow the same rule (light `#81858c`/`#adb2b8 -> `#0f1115`, dark `#adb2b8`/`#81858c -> `#f9fafb`) while that row is hovered, focused, or marked as the current Workspace; the folder of the Workspace that owns the current Session is included too, because its `folderActive` business blue `#4176e6` does not read on the rainbow.

- **The current-row rainbow is now coloured smoke instead of a drifting band.** Density and hue are separate layers: eight soft white particles per hue (`perHue: 8`) are advected by a smooth curl-noise field, and each pixel takes the dominant hue layer while the top two blend along the shorter hue arc at constant L/C. Because the visible colour is chosen per pixel from a monochrome mask, hues can never average into the neutral grey that made the earlier renderer decay (measured 0.79 -> 0.32 saturation in 9 s). The field is sampled at a moving coordinate with a capped (not normalised) curl and aspect-corrected for a 12:1 pill; particles wrap in x, are painted on both sides of the seam, reflect in y, and are advected at 0.014 pill widths per second - far below the 0.05/s at which density motion reads as flicker. Measured on a live 398x32 row: saturation 0.81 -> 0.96 over 15 s, zero static columns, 59 fps. Gaps between particles are closed with the nearest painted colour instead of showing the row's dark surface, the selected row's title and time follow the same label token and go bold, and light mode gains chroma (.26 -> .31) at the same wrapper opacity so the pill reads stronger without lowering the row's text/glyph contrast. The motion model is a pure module with nine unit tests (slot/edge bounds, ten-minute stability, flow coherence, frame-rate independence, delta clamping, no-accumulation drift budget, arc-blend symmetry, mix-weight bounds), and the sidebar E2E `b4-6` still samples the live canvas twice, seconds apart, requiring the colour to survive.

- **Light mode aims slightly stronger, with the state dot's contrast accepted at 2.5:1.** The light smoke keeps its brightness (wrapper opacity .60) and gains chroma (.26 -> .31), so the pill reads stronger without moving the row text. The one control that cannot follow is the state dot: it must keep the shell's semantic colour, and on the brighter pill it measures ~2.5:1 instead of the 3:1 graphic minimum. The owner accepted that single control at 2.5:1 rather than dimming the atmosphere; b4-9 pins 2.5 for the glyph and keeps 3 for every other control.

- **The shell's session-info hover card is no longer extended (owner decision).** DSH 0.2.2 changed the card's CSS-module classes, so the plugin's scoped width/theme override silently stopped matching and the card fell back to the shell's 244 px width. Covering or hiding the shell card instead reintroduced the same class-name dependency (or produced a second visible card when the injected sections did not mount), so the plugin stops injecting its figures into it: the session statistics, token usage and context figures live only on the plugin's own hover card (the Running & recent rows), and a native Session hover shows the shell's untouched card. The retired b5-2/b5-7 sidebar rows were replaced by a b5-1 contract check ("native tooltip is left untouched") that also still measures the alignment oracle the c2/c3 rows consume, and the now-unreachable `src/browser/native-session-hover-figures/` module was deleted with its source guard updated to assert its absence.

### Fixed

- **UI copy call-site composition bugs (`1`-vs-`N` plurals, duplicate counts, localized group labels and relocate reasons).** Fixed `collection.count` double-prefixing in the annotation hover preview (`${preview.count} ${t('collection.count')}` rendered `"3 3 elements"` / `"3 3 项"`), wired `groupHeader`, `groupRequirement`, `groupReference` and `itemsCountLabel`/`itemsCountLabelOne` into `annotationInsertLabels` so Chinese batch-group insertions no longer fall back to hardcoded English labels (`Group · N items`, `Requirement:`, `Element:`), aligned `serializers.ts` default fallbacks (`Change:`, `Adjust the UI elements below…`, `Status: temporary surface no longer present (locator only)`), added singular `1`-count keys across `artifacts` (`list.countOfOne`) and `ui-annotation` (`rail.status.selected`, `sidebar.groupBadgeOne`, `collection.groupEditorTitleOne`, `collection.crossSessionOne`, `exitConfirm.messageOne`, `insert.skippedOne`, `insert.removedOne`, `feedback.groupAddedOne`), added lowercase `feedback.relocateReason.*` fragments so parenthetical relocate errors render `Cannot locate the element (no longer on the page)`, fixed `UPDATE_ZH.title` to interpolate `{name}` without a stray space, and corrected `settings.unavailable` so it truthfully covers all three settings on the page.

- **The Running & recent card scrolls again on DSH 0.2.2.** DSH's sidebar viewport now splits wheel gestures in JavaScript (`dsh-client-ui-sidebar`'s `scroll-handoff`: `preventDefault` plus its own `scrollTop` writes), so every wheel over the card was consumed by the sidebar and the card's capped body could not scroll at all - with five running Sessions the last three were unreachable. The card binds its own passive `wheel` listener: while the body can still move in that direction it stops the event before the viewport handler and lets native scrolling run (`overscroll-behavior: contain` keeps it inside the card); at either end it steps aside so the sidebar keeps its hand-off. Verified with a real wheel gesture over the live body: 3 x 120 px moved `scrollTop` 0 -> 293 (the body's full remaining range) with the sidebar staying put, and scrolling back returned it to 0. The new `b4-7` sidebar check repeats that gesture, and the card docs describe the contract.

## [0.2.1] - 2026-11-19

### Fixed

- **README and marketplace screenshots now match the current release.** Re-captured the README raws against an isolated clone of the current data with the injected 0.2.0 client, recomposed the four Bento grids (`assets/readme-*.webp`), and added `screenshots.json` with the five storefront images. The capture pass now masks Workspace/Session titles even for live/cloned data and degrades cleanly when the prompt-history rail is absent. No plugin behavior, packaged code or settings changed.

## [0.2.0] - 2026-11-19

### Fixed

- **Bundled update check reports the running version.** `src/features/update-check/checker.ts` now resolves the package manifest through the package self-reference (`import.meta.resolve`) instead of a path relative to the source module, so the bundled `lib/index.js` reads its own package.json and the update prompt shows the installed version. The build probes that resolution from inside `lib/`, and `npm run check:release` now deletes `lib/` before `npm pack` to prove `prepare` rebuilds it.

- **Theme-following annotation surfaces, very soft dark atmosphere and strict-mode copy fix (Phase 3y).** The annotation popover, detail card and note editor follow the owner-chosen theme contract (light shell surface/label tokens, dark #2C2C2E), and S12 passes 7/0/0. The dark atmosphere was iterated toward the light-mode pastel reference and then lightened and re-colored at the owner's request. Final recipe: screen blend with `saturate(1.3) brightness(1.35)`, wrapper opacity 0.62 base / 0.68 hover, white veil 0.04/0.02, eight OKLCH hues (light L=0.76/C=0.26, dark L=0.76/C=0.24 at hues 20/65/110/150/195/245/290/330, browser-gamut-mapped), with the light compositing slightly stronger (saturate 1.35, opacity 0.60, veil 0.48/0.36) and dark opacity 0.62/0.68 so light is less washed and dark is less deep and two blobs per hue advected by a low-frequency 3-octave value-noise fBm curl field, so colors meander and diffuse in both axes instead of orbiting a fixed lane. The flow uses slow time drift, low-pass-filtered velocities and clamped edges (no wrap teleport), removing the earlier jitter/flash; a stronger wash plus smaller/softer blobs keep the canvas from averaging to grey (saturation ~0.50). Light and dark share the renderer (light keeps multiply/white-veil). b4-1/b4-3/b4-5/b4-9 pass and the last data-complete live full run is 71 PASS / 1 SKIP / 0 FAIL; dark title contrast is 2.5:1, the accepted trade-off for the lighter pill. The same work exposed a real `copyAnchorText` bug where `text`/`source` were assigned without declaration (every copy-XPath click threw `ReferenceError` under the strict bundle); both are now declared.

- **Theme-following annotation surfaces and strict-mode copy fix (Phase 3x).** The annotation popover, detail card and note editor now follow the owner-chosen theme contract: light mode uses the shell surface/label tokens (white surface, light labels) while dark keeps the #2C2C2E recipe, matching the native session-row hover card per theme; S12 now passes 7/0/0. The same path exposed a real `copyAnchorText` bug where `text`/`source` were assigned without declaration, so every copy-XPath click threw `ReferenceError` under the strict bundle and showed the wrong toast; both are now declared. No other copy/slot changes.

- **Annotation clicks no longer throw after the identity extraction (Phase 3q).** `annotationStableSelectorCandidate` had extracted the DOM `getAttribute` method and called it unbound, so every click-based selection threw `TypeError: Illegal invocation`; it now binds the method to its element, with a regression test. The live S4 scenario returns to its baseline 2/3 (the remaining outline miss reproduces on the pre-Phase-3 client) and smoke is 6/6 with 0 page errors.

- **Cache-hit percentage no longer hangs on inconsistent data (Phase 3m).** `dwCacheHitPercent` treated `cacheRead > billedInput` as a negative loop increment and never terminated; it now returns `null` for impossible/negative/non-finite inputs while all valid outputs stay byte-identical (7,389-case differential oracle). The one production call site already hides a `null` cache-hit line.

- **M4 browser typing: ambient types and the dynamic-Workspaces installer.** Added vendored minimal ambient declarations (`src/browser/ambient/`: react/react-dom/ui-primitives and the DSH client context/module-loader surface) with no new npm dependency and no `any`, and moved the entire dynamic-Workspaces controller into `src/browser/dynamic-workspaces/install.ts` behind `createDynamicWorkspacesInstaller(deps) -> { install(ctx), hovercardSections }`. `src/client.js` drops from 18,624 to 15,061 lines and the browser typecheck baseline drops from 1,720 to 1,522 (dynamic region 254 -> 1); DW CSS/storage keys/DOM markers and behavior are unchanged, and live sidebar smoke/row-menu/interrupted suites pass. The stricter React inference surfaced 44 TS2322 / 7 TS2740 / 5 TS2353 null-seed state issues for M5.

- **M4b browser typing: hover quick look module.** Extracted the hover quick look into `src/browser/hover-quick-look/` (`install.ts` state machine/listeners/DOM, `model.ts` geometry/cache types, `markdown.ts` safe Markdown, `highlight.ts` tokenizer, `styles.ts`, and a narrow local `dom.ts` interface). `src/client.js` drops 1,537 lines to 13,534, hover diagnostics 147 -> 0, browser baseline 1,522 -> 1,375, and a CDP probe against the base client produced identical card facts and no page errors; live smoke 4/4 and full sidebar 71/1/0. Remaining top regions are annotation controller 1,006, interrupted 47, prompt-history preview 37 and update check 37.

- **M5b browser typing: four more typed regions.** Extracted the native session hover figures, interrupted-session seats, prompt-history preview and update-check UI into `src/browser/{native-session-hover-figures,interrupted-sessions,prompt-history,update-check}/` modules. `src/client.js` drops to 12,019 lines, the browser baseline drops 1,375 -> 1,211 (each region 0), and only the annotation controller remains above 1,000 diagnostics. Preview/update CSS, copy, slot ids and DOM markers are byte-identical; live smoke 4/4, interrupted 9/1/0 and the standard update-prompt harness 21/21 pass.

- **M5c browser typing complete: zero diagnostics and no more `@ts-nocheck`.** Extracted the remaining artifacts, workspace-presets, settings, prompt-history, interrupted-session, draft-attachment and composer-gallery regions into typed `src/browser/**` modules, split the duplicated `collection.expand` copy key into `collection.expand`/`collection.expandNote`, typed the entry and removed `// @ts-nocheck`. `src/client.js` is now 1,092 lines; both `npm run typecheck` and the browser DOM profile are **0**, and `npm run check` now gates the browser typecheck directly. The full suite is 392/392 and live annotation/sidebar/update-prompt smoke still pass with 0 page errors.

- **M5a browser typing: annotation controller/React split.** Moved the remaining annotation stylesheet, DOM/picker helpers, storage/constants/types, controller (5.2k lines), React components and installer into `src/browser/ui-annotation/`, leaving only the copy dictionary, icon paths, bridge, factory binding and the debug probe in `src/client.js`. Client drops 12,019 -> 4,348 lines, browser baseline 1,211 -> 197, annotation region 1,012 -> 2 (the pre-existing duplicate `collection.expand` key); live annotation smoke 6/6, S4/S10/S12 and sidebar smoke pass.

- **Opt-in isolated e2e bootstrap (Phase 3w).** `annotation.e2e.mjs --bootstrap` now dismisses the localized first-run Preview Notice/Get started dialogs with real pointer clicks (re-armed after scenario reloads) and best-effort seeds blank Sessions until the native scroll probe succeeds; `--bootstrap-sessions N` caps attempts. Default runs are unchanged. Live `--bootstrap --smoke` passes 6/6; on a fresh isolated profile it dismisses the notice but DSH's one-blank-draft-per-workspace rule prevents creating a second blank Session, so S3/S8 still report their scroll-region assertion (documented limitation, not skipped).

- **Typed sidebar-width controller (Phase 3v / M2).** The sidebar-width browser controller/state moved to `src/browser/sidebar-width/install.ts` behind `createSidebarWidthController(deps) -> { install(ctx), probe() }`; client.js keeps only the factory binding and the read-only e2e probe. Storage, attach/detach, drag capture, Host sync/adopt/reopen, DOM markers and probe shape are unchanged; four fake ctx/store/DOM tests were added (392 total). The browser typecheck baseline drops 1,773 → 1,720 and the client bundle is 937.3 kB; live sidebar smoke 4/4 and layout 12/12 pass.

- **Mechanical browser-typing fixes (Phase 3u).** Cleared 112 browser-profile diagnostics (baseline 1,885 → 1,773) without behavior/copy changes: `RemixGlyph` scale is optional (all 51 call sites), stale JSDoc/signatures fixed (`readWorkspacePreset`/`copyAnchorText` optional arguments, unused `hideChipPreview` reason, `dwPostReadAcks` return shape, `ensureInterrupted.refreshHost`, settings snapshot typedefs), dictionary index signatures and a typed `testHookHost` bridge. The ratchet baseline was refreshed; `@ts-nocheck` stays until the remaining `require('react')`/`__ModuleLoader__`/record-state diagnostics are addressed by the M2/M3 splits or owner-supplied ambient types.

- **Browser e2e harness corrections and click-select guard (Phase 3t).** `b2-3` now passes the row title string, `f6-1` samples after React commits with bounded polling and counts only the shell spinner, the duplicate `b3-3` id is gone, annotation smoke gained a real click-select check, S4/S13 use a non-composer target and S10 expects the product's intentional paint z-index 2000. Post-fix live runs: sidebar full 70 PASS / 1 SKIP / 1 FAIL (`b4-5` pre-existing atmosphere threshold), annotation smoke 6/6, S4 7/0/0, S13 7/1/0, S10 8/0/0. S12 remains an owner theme-contract decision.

- **Annotation test seam retired (Phase 3s).** `__POWER_SUITE_TEST_HOOKS__.uiAnnotation` is now a single controller diagnostic (`debugFallbackScanProbe`); the 111 pass-through keys and the frozen SEAM_EXPORTS/ARITIES/generation contract were deleted, the unit tests import the modules directly, and the annotation smoke now asserts the 1-key shape while still passing 6/6 (scenario 14 also 7/7). src/client.js is ~19.2k lines and the shipped client bundle is 936.8 kB.

- **Annotation resolution and surface pickers (Phase 3r).** The reference-resolution helpers (`resolveRefStatus`, `resolveNodeCandidate`, `annotationResolveStatus`) and the surface pickers (root/levels/pick-level/leaf-pick, pin eligibility/event matching, rail-right geometry) moved to `src/browser/ui-annotation/{resolution,surface}.ts`; all 10 migrated keys keep their frozen arities and the 112-key hook block stays byte-identical, with only `debugFallbackScanProbe` still inline. `src/client.js` is ~19.3k lines; 58 curated + 2,900 random differential cases found 0 mismatches. The browser typecheck baseline drops to 1,885.

- **Annotation anchors model (Phase 3q).** The anchor helpers (XPath/full XPath/JS path, rendered-text chunks, quote/position extraction, disambiguation/scoring, Levenshtein/cache keys, identity-strength and scope-authority decisions) moved to `src/browser/ui-annotation/anchors.ts`; 22 hook keys now come from the module while the 112-key hook block stays byte-identical, and a 15,261-case differential against the old seam found 0 mismatches. `src/client.js` is ~19.8k lines. Also fixed the identity-extraction regression where an unbound extracted DOM `getAttribute` threw `Illegal invocation` on every click selection (regression test added; live S4 back to its baseline 2/3, smoke 6/6, 0 page errors).

- **Browser typecheck baseline and ratchet (Phase 3p).** Added `tsconfig.browser.json`, `scripts/typecheck-browser-baseline.mjs` and `scripts/browser-typecheck-baseline.json` (`npm run typecheck:browser`). The script disables `// @ts-nocheck` only in a temporary copy, reports browser-profile diagnostics total/per-code/per-region, refreshes with `--write`, and ratchets with `--check`. Current baseline: 1,976 diagnostics (down 508 from the pre-slice 2,484); it is report-only and does not change `npm run check`.

- **Annotation reducer and serializer models (Phase 3o).** The state reducer (state creation, actions, phase/deactivate transitions) and the quick/batch/group/chip serializers (plus chip-ref round-trip/candidates) moved to `src/browser/ui-annotation/{reducer,serializers}.ts`. 11 more hook keys now come from modules while the 112-key annotation hook stays byte-identical; `src/client.js` is ~20.5k lines. Differential checks: 58 reducer sequences and 79 serializer fixtures matched the old seam; no behavior or copy changes.

- **Annotation identity and record-store models (Phase 3n).** The identity/selector/locator helpers (plus the pure anchor sanitizers) moved to `src/browser/ui-annotation/identity.ts`, and the record store (normalise/parse/serialize, CRUD, undo, groups, counts/filters) moved to `records.ts`. 40 hook keys now come from modules; the 112-key annotation hook stays byte-identical as a pass-through, with 588 identity + 1,648 record differential checks against the old seam. `src/client.js` is ~21.1k lines; no behavior or copy changes.

- **Sidebar-width hook trimmed to the e2e probe (Phase 3m).** The `sidebarWidth` vm hook now exposes only the read-only attach `probe`; its constants and pure helpers are asserted directly from `src/browser/sidebar-width/model.ts`. Only the `uiAnnotation` hook and the sidebar probe remain.

- **Dynamic-Workspaces stats/pin/row-menu models (Phase 3l).** The session-figure formatters and copy dictionaries, the card-owned pin cache/effective/panel-row logic (with shared row primitives in `rows.ts`) and the row-menu delegation/resolution moved to `src/browser/dynamic-workspaces/{stats,pin,rows,row-menu}.ts`; the three vm hooks were deleted and their tests import the modules directly. Only the `uiAnnotation` and `sidebarWidth` hooks remain; `src/client.js` is ~22.8k lines. Three seam-only tests were removed (no behavior assertions lost); no behavior, copy or storage-format changes.

- **Annotation text/format/geometry models (Phase 3k).** The annotation sanitizer/redaction/digest/attribute/quote helpers, the label/format helpers and the clamp/rail/layout/segmented helpers moved to `src/browser/ui-annotation/{text,format,geometry}.ts`; their tests import the modules directly while the 112-key annotation hook stays a pass-through shim. `src/client.js` drops to ~23,580 lines; no behavior or copy changes.

- **Full-suite browser e2e evidence (Phase 3j).** Independent runs at commit 5128669 (clean copies, isolated throwaway instances, current-HEAD live smoke recheck) record: update-prompt full 21/21 isolated and live; sidebar live full 68 PASS / 2 SKIP / 2 FAIL with the same two failures on the pre-Phase-3 baseline client; annotation isolated full 13 PASS / 1 SKIP / 9 FAIL with the identical baseline failure set, smoke 6/6; current HEAD live smoke 4/4, 6/6 and 21/21 with 0 page errors. No full-run failure was attributable to Phase 3; details and gaps are in docs/verification.md and the migration plan.

- **Annotation settings model (Phase 3i).** The UI-annotation modifier settings (storage key, accepted choices, frozen defaults, normalize/conflict/parse/serialize/match) moved from `src/client.js` to `src/browser/ui-annotation/settings.ts`; the settings tests import it directly while the annotation test hook stays as a pass-through shim for the remaining model keys. No behavior, copy or storage-format changes.

- **Pending-interaction activity model (Phase 3h).** The Running & recent panel true-last-activity timestamp and pending-interaction derivation moved to `src/browser/dynamic-workspaces/activity.ts`; its test imports the model directly and the `dynamicWorkspacesPanel` vm hook was deleted. Five hooks remain (annotation, the three other dynamic-Workspaces models, sidebar-width probe). No behavior changes.

- **Composer gallery model and two more hook removals (Phase 3g).** The composer image-gallery pure model (index clamping, step direction, rail reconciliation, wheel debounce and thumbnail collection) moved to `src/browser/composer-gallery/model.ts`. Its tests and the update-prompt tests now import the models directly, so the `composerImageGallery` and `updateCheck` vm hooks were deleted; six hooks remain (annotation, four dynamic-Workspaces models, sidebar-width probe). No behavior or copy changes.

- **Browser e2e evidence (Phase 3f).** The three browser suites ran against an isolated throwaway DSH web instance with the current tarball installed: `sidebar.e2e.mjs --smoke` 4/4, `update-prompt.e2e.mjs` 21/21, and `annotation.e2e.mjs --smoke` 5/6; the remaining launcher-click timeout reproduces identically with the pre-Phase-3 baseline client, so it is pre-existing under this harness (root cause not established) rather than a regression. The long-running `:3080` server still resolved the old `src/client.js` entry path (now an ES module), so the live plugin failed to boot until that service was restarted; after the restart it serves the installed `lib/client.js` and live `sidebar --smoke` 4/4, `annotation --smoke` 6/6 and `update-prompt` 21/21 pass with 0 page errors. The npm artifact was unaffected.

- **Shared settings contract and three more browser models (Phase 3e).** The settings enums/defaults now live in `src/shared/protocol.ts` and are imported by both the Host store (re-exported) and the browser entry. The Files ↔ Artifacts phase model, the interrupted-state decision and the settings payload filter/merge moved to `src/browser/artifacts/model.ts`, `src/browser/interrupted-sessions/model.ts` and `src/browser/settings/model.ts`; their tests import the models directly and the `filesArtifacts` and `interruptedState` vm hooks are gone. Behavior and copy are unchanged.

- **Shared route contract (Phase 3d).** All 16 API paths now live in `src/shared/routes.ts`: Host modules re-export those constants and the browser entry/models import the same values through `browserRoute`, so no `/api/...` route literal remains in `src/client.js`. The protocol contract test asserts the Host set equals the shared contract and that the browser half contains no route literals. Paths and behavior are unchanged.

- **Browser sidebar-width model (Phase 3c).** The pure sidebar-width decisions (clamp/validity, browser-cache document, Host-payload normalizer and the boot/adopt/reopen decision rules) moved from `src/client.js` to `src/browser/sidebar-width/model.ts`, with `test/sidebar-width-model.test.js` importing them directly in Node; the protocol contract test now imports the extracted browser route alongside the remaining inline literals. Attach, drag capture, persistence and the Host route are unchanged.

- **Browser update-prompt model (Phase 3b).** The pure update-prompt state machine moved from `src/client.js` to `src/browser/update-check/model.ts` and is now covered by `test/update-check-model.test.js` importing it directly in Node (the vm seam only covers the browser controller). No prompt behavior, copy or storage format changes.

- **Browser half module seam (Phase 3a).** The browser entry is now an ES module (`src/client.js` plus `src/browser/`) that esbuild bundles into the served classic-script IIFE. The first pure model moved to `src/browser/update-check/versions.ts` (stable-version math, imported by the entry instead of duplicated inline); the unit-test harness bundles the ESM entry with esbuild before vm evaluation while still exposing the raw source to source-level assertions, and the browser e2e harness bundles it before injection (classic baseline copies still work). No UI, copy, slot or behavior changes; the feature regions were subsequently split across 3b–3e.

- **Zero explicit `any` in the Host (typing cleanup).** The remaining 335 explicit `any` sites were removed: `src/host/context.ts` now models the DSH Host context (effects, events, route registration, fs/sessionQuery/agents/preset/workspace services), `src/host/errors.ts` reads `code`/`message` off unknown thrown values, and stores, artifact folds, the activity ledger and event callbacks use real document/row/handle interfaces. The Host context now mirrors the real DSH filesystem API (opaque `FsTarget` from `resolve`, `stat` returning `FileInfo | undefined`), and provided attachments are a distinct `AttachmentRow` rather than a lying `ArtifactRow`. `npm run check` fails when an explicit `any` token re-enters `src/**/*.ts`, counting code tokens with comments/strings stripped (aliases, unions and generics included); this is a lexical tripwire, not a proof (implicit `any` remains). Runtime behavior is unchanged (377/377 tests).

- **Strict TypeScript Host (Phase 2d).** `tsconfig.json` now enables `strict: true` and the Host sources pass `tsc --noEmit --strict`; explicit `any` was kept only at DSH platform boundaries (and other dynamic seams) at that point, with the count tracked as a budget (335 sites; eliminated in the follow-up cleanup above). No runtime behavior or package layout changes; this closes Phase 2 of the migration.

- **Host half is now TypeScript (Phase 2c).** `src/index.ts`, `src/features/**/*.ts`, `src/host/document-store.ts` and `src/shared/protocol.ts` replace the Host JavaScript modules, with `.ts` import specifiers and real type annotations for the boundaries that previously relied on JSDoc. The Node tests import the sources directly through Node's native type stripping (zero build; `engines.node >= 22.18`), while esbuild still bundles the two `lib/` entries, so the published file set is unchanged. `strict: true` is deferred to Phase 2d.

- **Shared durable-document store.** `src/host/document-store.ts` now owns the Host persistence mechanism: lazy single-flight read, coded read-error policy, serialized read-modify-write, an atomic 0600 temporary-sibling rename, and in-memory publication only after the rename. The settings, read-acks, session-pins, sidebar-width and workspace-presets stores became adapters that supply only their document policy, removing the duplicated write machinery; `test/document-store.test.js` covers the module interface. The activity ledger keeps its debounced write path for now. File formats and runtime behavior are unchanged.

- **Build step (Phase 2 of the TypeScript migration).** `npm run build` (`scripts/build.mjs`, esbuild dev dependency) bundles `src/index.ts` into the ESM Host entry and `src/client.js` into the classic browser entry under the gitignored `lib/`; the npm package now ships `lib/` instead of `src/`, `prepare` builds before `npm pack`/`npm publish`, `npm run check` builds first, and `npm run check:release` compares the packed `lib/` against a fresh build before installing/booting/uninstalling. Runtime behavior and UI are unchanged; esbuild is a dev dependency only.

- **No-build TypeScript gate (Phase 1).** `tsconfig.json` plus `npm run typecheck`
  (`tsc --noEmit`, `allowJs`/`checkJs`) now checks the Host half through its JSDoc
  types, and `npm run check` plus CI run it. The 24.8k-line classic browser entry
  stays opted out (`// @ts-nocheck`) until Phase 3, the shared settings/protocol
  typedefs live in `src/shared/protocol.ts`, and `test/protocol-contract.test.js`
  guards the duplicated route/enum literals. No build step, emitted files or
  package-layout change.

- **Contributor identity cleanup.** Repository history was rewritten with
  `git filter-repo --mailmap` to attribute the early `rexxin`/`ann-impl-a`
  commits to the canonical `moekyo` identity; the tree content is unchanged and
  the `v0.1.0` tag was re-pointed at the rewritten release commit. The npm
  `0.1.0` release was not republished.

## [0.1.0] - 2026-11-17

First public release. This package had no previous release: the earlier
development snapshots — `0.1.0` (2026-11-09), `0.1.1` (2026-11-11), and an
undated `0.2.0` — were internal only, never tagged and never released, and the
`0.1.0-rc.0` bootstrap prerelease is not a release. Their history is
consolidated into this first release together with the current work.

### Added

- **Dynamic Workspaces** — the native Workspaces browser is augmented, never
  replaced: it gains **Active Projects** and **Inactive Projects** buckets that
  follow running and recently active Sessions, reorder live in both directions,
  fold independently with persisted state, and hide in rail mode. The plugin
  inserts sibling nodes and inline flex order only, so native search, context
  menus, the add-workspace flow, drag reordering, chevron folds, dialogs,
  Session rows, the New Session button, and modified clicks keep working, and
  unloading restores the surface. A Workspace is Active while one of its
  Sessions is running or was active inside the configurable Active-project
  retention window. Above the native header a **Running & recent** card lists
  running Sessions with the shell's own status dot and observed durations, keeps
  recently finished Sessions for the same window, nests recent direct subagent
  Sessions under their parent behind a disclosure chevron (indented under a
  guide line, each opening its own Session), and opens a Session from any row.
  Both windows are Host-wide settings — finished Sessions 1/2/6/12/24 hours
  (default 2) and Active projects 1/3/7/14/30 days (default 7) — edited on the
  bundle's Plugins page; version-1 settings files migrate to the default
  windows, and running Sessions ignore both windows. Workspace default agent
  presets remain reachable from the Workspace context menu.
- **Running & recent native figures** — for the hovered Session (parent or
  nested subagent row) the hover card appends **Session statistics**
  (`{turns} turns {steps} steps`, LLM time, tool time, average TTFT, TPS in the
  native duration/speed recipes), **Token usage** (exact grouped total = billed
  input + output, honest cache-hit percentage that never rounds a partial hit to
  100, uncached/cached/cache-write/output exact counts), and **Context usage**
  (`{percent} of context used`, `~used / window`, and `~`-prefixed System
  prompt / Tool definitions / Messages composition rows). Values come from the
  existing `sessions` inject's `projectionsBySession` — live Sessions are
  push-seeded and need no request; a cold (persisted) Session gets exactly one
  deduplicated `refreshProjections` read on first hover, and the card fills the
  figures in as they land with no loading state. Each section is omitted
  entirely when its data is absent, so an empty Session keeps the plain card.
  The card grows to 320 px and clamps at `min(560px, 100vh - 16px)`; subagent
  cards gain a compact Session-title line. While a **live** Session's card
  stays open the figures keep refreshing in place from the pushed projection
  frames (the panel's 1 s clock re-reads the live snapshot; no extra polling or
  network). The **native sidebar session hover card** renders the same Session
  statistics, Token usage, and context sections through the shell's
  `sidebar.session.row.hover` slot, reusing the same strings, formatter
  recipes, live projections, and one-shot cold projection read, and contributing
  no nodes for a Session without figures (the native card is not restyled,
  widened, or reordered). The running-card hover status dot is a **perfect
  circle** (`corner-shape: round`, because the shell's global
  `superellipse(1.5)` painted the dot as a squircle).
- **Running & recent pinning** — main Session rows in the card carry a
  hover-revealed **Pin** control that keeps that main Session on top of
  **Running & recent** past the finished-retention window. The slot collapses
  when the button is hidden (the title sits next to the leading glyph); hover or
  keyboard focus expands the slot before the button fades in, and leaving fades
  the button out before the slot collapses (220 ms expand/collapse, 160 ms
  fades; pinned rows keep the marker and its space permanently). The pin is the
  card's **own** state, deliberately independent of the native sidebar's
  project-organisation pin (never read, written, or surfaced here), and it is
  **Host-shared for cross-device use**: a new authenticated
  `GET|POST /api/power-suite.session-pins` route persists a bounded document
  (`$DSH_HOME/dsh-power-suite/session-pins.json`, `{version, rev, pinned}`, max
  500 ids with the oldest dropped first, atomic writes, last write wins, `rev`
  bumping only on a real change) that every browser and device using the same
  `$DSH_HOME` converges on. The client keeps a versioned `localStorage` cache
  (`{version, rev, pinned, pending, migrated}`) with a queued-operation replay
  for instant first paint, optimistic toggles and offline/local-only use, GETs
  the Host document on mount/focus/visibility/every 30 s, merges cached pins
  into the Host on first contact (so pre-route pins are not lost) and POSTs
  queued pin/unpin operations; when the route is absent the card runs local-only
  until the Host is restarted with the route, with no UI breakage. Pinned main
  Sessions sort first, newest activity first, and never retire with time: a
  pinned finished Session stays listed with its original
  title/Workspace/path and last-activity time (no re-timing), unpin immediately
  returns the row to the ordinary queue under the normal retention rules, and
  pinned rows show a filled violet pin glyph plus a subtle violet tint (a single
  highlight layer — the body pill inside the row no longer paints a second
  tint); subagent child rows keep no pin control, and blank, archived, or
  unknown Session ids cannot be pinned.
- **Running & recent row menu** — top-level card rows expose the shell's
  Session actions behind a "…" trigger in the 48 px time slot: every top-level
  row (the current rainbow row included) keeps its time at rest, and row
  hover/keyboard focus hides the time and shows the trigger — the swap stays
  while the menu is open and leaving restores the time. The trigger keeps the
  ordinary soft hover paint (plus the keyboard `focus-visible` ring); only the
  rainbow row suppresses it, with the same `brightness(1.2)` lift as the other
  current-row controls. The popup is the shell's **native shared context-menu
  popup** — the same surface the native Session row's own "…" trigger opens —
  opened against a plugin-owned captured-target kind and filled by delegating to
  the native Session action contributions
  (`ctx.contextMenus.resolve({ kind: 'session', value: { sessionId, displayTitle } })`),
  so Rename, Fork, Copy Session ID, Show in Finder, Archive and any
  plugin-contributed action keep their native behavior and rendering, including
  native labels, keyed icons, shortcut hints, separators and the Archive footer.
  The **Pin/Unpin entry is the only one filtered out** (the title-left pin
  button is the only pin owner), and keyboard navigation, focus restoration and
  dismissal come from the shell. Subagent rows have no trigger.
- **Running & recent pending-interaction flags** — when a Session other than
  the one open in the main view is waiting on `ask_user_question` (question or
  plan review) or an approval (`SessionStatus.pendingInteraction`), its row
  shows a small amber Remix `flag-fill` in its fixed leading cell — the card
  replaces the 16 px state-glyph cell, the native Workspaces row puts the flag
  in its fixed leading slot (title x unchanged; a before-`_title` insert is only
  the no-slot fallback). It is the same amber as the native question prompt, is
  decorative (clicking still opens the Session and the native composer card
  answers), flags every waiting Session (no cap), and disappears
  automatically when the Session becomes current, the interaction settles, or
  the Session is archived. Client-only: no Host route, store, popup or extra
  click target.
- **Prompt history** — the configured modifier + ↑/↓ recalls prompts already
  sent in this Session; plain arrows keep their original behavior. A vertical
  rail inside the native turn-rail frame, below its marks and separated by a
  short divider, lists the current Session's sent prompts as
  **native-style tick marks** in reading order — the oldest prompt is the top
  tick and the newest sits at the bottom, and the rail keeps the newest tick in
  view when the list loads or grows. Hover or keyboard focus shows the full
  prompt in a native-style card to the left, click copies it silently into the
  composer draft, and a pinned search button below the marks reveals a floating
  substring filter (the search card opens directly below the magnifier or flips
  to its left when there is no room above the composer; it dismisses on a blank
  outside click or Escape). The native TurnNavigator renders nothing for fewer
  than two turn items, so a one-turn Session keeps the ⌘↑/⌘↓ recall but has no
  rail; otherwise the rail reuses the native frame's column, sticky band and
  narrow hiding. A long history caps at the native band/space below the frame
  (and at most 420 px), clips its chrome so it cannot paint over the composer,
  scrolls its ticks behind 24 px fade masks with hidden scrollbars, and keeps
  the search button pinned at the foot. The route
  returns `{ seq, text, at }` for every prompt, where `at` is the Session event
  time in epoch milliseconds or `null` when the event has no usable time; the
  rail and hover card show the times, and a Host that predates the field has
  them hidden instead of rendered empty. The rail appears only while the
  Session has sent prompts, and requests are generation-scoped so a slow
  Session cannot write into another Session.
- **Session artifacts** — an **Artifacts** card in the right Sidebar's Start
  page lists the current Session's created and delivered files **and the
  images/files the user attached to their prompts**. The provided rows come
  from the image and file blocks of human `user/message` events (source kind
  `user` only), deduped by attachment id with the newest occurrence winning and
  a 1-based prompt ordinal, served by the verified
  `GET|HEAD /api/session-artifacts.attachment` route with the same
  no-store/nosniff/sandbox-CSP headers. Every image artifact shows a 40 px
  rounded lazy thumbnail, and the panel header carries an All/Generated/
  Provided source-filter dropdown with per-option counts. Rows support
  in-browser open, download, **Copy content**, and LAN link copy: text-like
  artifacts are fetched through their inline URL and copied verbatim; images
  use a three-step chain — a real PNG clipboard item in a secure context
  (HTTPS/localhost), the legacy HTML-image clipboard on insecure origins (hidden
  `<img>` + `execCommand('copy')`, so rich editors paste the picture while
  plain-text targets may get nothing/alt), and only then the inline image URL as
  text; other binaries have no content action, and a successful copy shows the
  row's check acknowledgement for 1.6 s.
- **Hover Quick Look** — a shared hover preview for Artifacts rows (generated
  files plus provided images and text-like attachments) and the native
  Workspace files tree: Markdown, syntax-highlighted code, images, audio/video,
  PDF, and HTML, with drag-to-resize, animated file switching, safe hover
  traversal, outside-click dismissal, and a remembered or user-resized size.
  The card opens at a 570 x 360 default with an explicit content height and no
  dependency on a finished animation, so content is visible on the first hover.
  Provided images and media render through the verified attachment route,
  text-like provided files are fetched read-only and clipped at 64 KiB with a
  truncation note, and other provided types show the unavailable state.
- **Draft attachment memory** — browser-owned attachments in a draft (pasted
  images, dropped or picked files) are remembered per Session and re-introduced
  through the composer's own paste intake when the Session is shown again, so
  switching away and back no longer restores the text while silently dropping
  the files. The cache is page-lifetime (8 Sessions / 20 files), clears on send
  and on explicit removal of every restored attachment, and never attempts
  persistence; the shell persists only the draft's text and reference chips.
- **Composer image gallery** — when a composer holds two or more pasted images,
  clicking a thumbnail opens a continuous client-only viewer instead of the
  shell's single-image lightbox: the clicked image first, an `N / M` counter,
  previous/next buttons disabled at the ends (no wrap), ←/→ keys, one mouse-wheel
  gesture per image with a 260 ms momentum cooldown, and Esc/backdrop/close with
  focus returned to the opening thumbnail. Removing an image while the viewer is
  open clamps it to the remaining set and removing every image closes it; a
  single image is left entirely to the native lightbox, and page/Markdown images
  are never intercepted. The overlay uses the shell's tooltip/elevation tokens
  in both themes, is instant under reduced motion, and closes on Session
  composer unmount or empty attachment rail (and on plugin unload), without
  adding a URL or history entry.
- **Interrupted sessions** — Sessions whose last turn did not finish are marked
  in the sidebar and can be continued. Detection covers **every unfinished turn
  ending**, not only Host restarts/crashes: any `turn/end` reason `error`
  (quota/usage limit, request timeout, transport/network failure, rate limit,
  malformed response, missing credential), `max-tokens`, `interrupted`, and
  `aborted` with the `disposed` or legacy cause mark the Session as unfinished;
  deliberate endings (`completed`, `blocked`, `forked`, user/parent/hook
  cancellation) stay unmarked. An **amber mark** sits left of the title, and
  hovering the row keeps the shell's normal hover surface (title visible) while
  revealing an inline **Continue** triangle in the status cell (the native
  status cell widens with `width: auto` so the title slides right instead of
  being masked). Opening that Session turns the composer's send control into a
  **play triangle**; continuing is **implicit** — it resumes through a non-human
  context source instead of inserting a visible "Continue the interrupted
  task." user prompt, the continuation row is hidden, prompt history ignores it,
  and a missing Session controller leaves the badge in place. State is
  Host-owned and cross-device: a Host **SSE stream**
  (`GET /api/power-suite.interrupted-events`) pushes
  `turn/start`/`turn/end` invalidations (`{sessionId, parentSession, event}`) to
  every connected browser page, so badges/Continue/triangle state update
  immediately instead of waiting for the 20 s poll; the stream has a 25 s
  heartbeat, `retry: 10000`, one cleanup-safe connection per tab, no event
  replay, and polling/focus/visibility/reconnect cues remain the fallback when
  EventSource or the stream is unavailable.
- **UI element annotation** — a floating launcher toggles a client-only
  annotation mode that makes room for a responsive right rail by shrinking the
  shell frame's `padding-right` (`clamp(188px, 11.6vw, 236px)`, no CSS
  transform) and falls back to an overlay rail on narrow viewports. Hover
  outlines the candidate element; the picker treats **floating surfaces**
  (body-level DSH hover preview cards, and this plugin's own hover card while
  annotation mode pins it) as selectable targets *and* lets the Parent/Child
  controls drill into their inner text blocks and controls, with a paint layer
  raised above native hover cards (inline `z-index:150`, exact value/priority
  restored on exit) and a 60 ms mutation-triggered hover recompute for surfaces
  that appear while the pointer is stationary. A click selects the element and
  opens the requirement popover: element name, locator summary, live resolution
  status, ancestor level up/down, requirement textarea, and **Mark
  requirement** / **Update requirement**, **Delete annotation** (5 s undo
  toast), and **Quick reference** actions. Every annotation is stored as a
  **v2 record** capturing a uniquely verified CSS selector, ≤3 sanitized
  ancestors, surface/ephemeral flags, Session id plus Workspace cwd/label, a
  query-free route, the bounds and viewport, and a text digest — never
  outerHTML, input values, JS paths, XPath, or computed styles. Records persist
  in browser `localStorage` (`power-suite.ui-annotation.annotations`, schema
  version 2, 100-record cap with a visible refusal), survive a reload, and
  re-resolve their Resolved/Matches several/No longer resolves/Content changed
  statuses live. Annotated elements keep a page mark with a numbered
  requirement-summary badge; hovering it opens a draggable detail card with the
  requirement full text, locator, position, Session/Workspace, status,
  surface/ephemeral marker, and **Copy locator** / **Relocate** / **Open in
  composer** actions. References are inserted as **native composer inline
  reference chips** through the shell's input-trigger seam (dynamic
  `conversation` + `inputTriggers` injection; an `@` source with
  current-Session candidates, no empty group): one chip for a single reference
  and one grouped `UI annotations × N` chip for a batch, serialized at send time
  through the existing reference/batch serializers (deleted members are skipped
  with an honest removed-count line, and a missing single record invalidates the
  chip so the send is blocked), with a plain-text fallback plus explanation when
  the chip services are unavailable. Multi-select is a **batch group** flow:
  after the selection settles a single batch popover opens with the selected
  items and ONE shared Requirement; committing saves one group containing every
  selected element (each keeps its locator/metadata, no per-item requirements),
  and the group inserts as one `UI annotations × N` chip whose serialization is
  one request (shared requirement + numbered references with honest status
  lines). The persisted document is v3 (singles + groups, tolerant v2 migration,
  cap counts singles + group items, visible refusal) and the right rail's
  collection view is a real managed **annotation sidebar** (widened to
  `clamp(320px, 24vw, 420px)`, status/settings views stay compact): an
  **Annotations** header with a total badge and subtitle, **All / Singles /
  Groups** filters with live counts, a unified scrollable list of single rows
  and group cards (count badge, collapse/expand, shared-requirement editing,
  always-visible edit/delete/insert actions), per-item metadata (Selector,
  Page/Area, Session/Workspace, updated time), empty/filter-empty states, and a
  footer with **Add annotation** and **Cancel Annotation** at equal widths (the
  danger action confirms and clears all annotations on exit). The list is the
  rail's default body on activation (the intermediate status/Collection/Settings
  rows are gone; a compact **settings-line** icon in the header opens settings,
  Back/Esc returns), with the selection hint in the header. The floating
  launcher is hidden while the mode is active (no docked/flight copy) and only
  fades/scales back in at its remembered position after a full exit
  (reduced-motion instant). Leaving the mode (header X, Cancel Annotation or the
  final Esc step) asks for confirmation and then clears all annotation records,
  so a re-entry starts empty; a group keeps ONE ordinal shared by all of its
  items (page marks show the group's number, never an incrementing sequence).
  Page pointer events are consumed in the capture phase so native controls
  cannot act while annotating; the configurable multi-select modifier toggles
  selection or starts a marquee, and the configurable pass-through modifier
  restores real native mouse and context-menu behavior without synthesizing
  clicks. The annotation note fields, the prompt-history search field, and the
  settings choices use the shared rainbow track focus ring instead of solid
  focus borders; the launcher position, rail-collapsed state, and two modifiers
  persist in browser `localStorage`, while annotation records use their own v3
  document. The browser-only feature adds no Host route, service, or profile
  change, cleans up every listener, layout marker, and DOM node on exit and
  HMR, and ships a pure test seam plus a live-page CDP acceptance harness (seam
  generation 66; see [verification.md](docs/verification.md) for the honest
  per-scenario record — the known late-run headless S6/S8 stalls mean no single
  all-green full-suite run is claimed).
- **UI element annotation precision** — picking is **leaf-first**
  (DevTools-inspect style) on ordinary pages and inside floating surfaces:
  hover and click target the deepest eligible element under the pointer
  (titles, subtitles, timestamps, token counters, inline SVG icons/paths, then
  rows/buttons), walking up only for the plugin's own UI, structural tags, or
  zero-size nodes, and never escaping a floating surface's root. The popover's
  Parent/Child controls walk the full hovered ancestor chain (Child back to the
  deepest element, Parent up to the surface/page container), and the whole
  surface stays selectable via its background/padding or Parent. Selection
  outlines and popover anchoring use the picked live element so any leaf keeps
  correct geometry; records keep honest locators/status for weak (e.g. SVG)
  targets. Limits (bare text nodes resolve to their parent element, CSS
  pseudo-elements aren't elements, `pointer-events:none` targets fall back to
  the nearest ancestor) are documented.
- **Workspace default presets** — a Workspace context-menu submenu sets the
  default agent preset for new Sessions created in that Workspace.
- **Settings** — the bundle's Plugins page carries its own configuration
  section: the prompt-history modifier (⌘/Ctrl, ⌥/Alt, Ctrl, Shift, or Off) and
  the two Dynamic Workspaces retention windows, under the **Prompt history** and
  **Active & recent** groups. The section hides the page's auto-rendered package
  README document while mounted and restores it on unmount; settings are
  Host-owned (schema version 2) and shared by every browser on its next load.
- **Host-shared read acknowledgements** — a durable
  `$DSH_HOME/dsh-power-suite/read-acks.json` document (schema v1, sanitized,
  per-id max-merge, 1000-entry cap, atomic writes) is served by an authenticated
  `GET/POST /api/power-suite.read-acks` route; every browser using the same
  `$DSH_HOME` syncs the same baselines (local cache + 30 s/focus/visibility
  sync, one-time migration of old local marks, 250 ms debounced push). Read
  state is derived as `baseline >= activity - 1000 ms`, so a transient status
  flag can no longer resurrect a stale green dot. Profiles sharing a home
  **share the file with no profile isolation and no read-merge across writers**
  (the design assumes one Host process plus overlapping HMR), and the old
  per-browser `localStorage['dsh-power-suite.acked-sessions']` document is now
  only the fast/offline cache, migrated to the Host on first use.
- **Event-sourced activity ledger** — the Host subscribes to committed
  `session/event` times under an explicit `ACTIVITY_EVENT_TYPES` allowlist
  covering known activity-bearing families (turns, steps, messages/attempts,
  tools incl. PTC dispatch, jobs, commands, compaction, subagent state,
  goal/todo, approvals and selection actions, workspace/deliverable/schedule
  changes, team traffic, image/offload, feedback, inbox splice, LLM retry,
  tool-workflow progress); the explicit `NON_ACTIVITY_EVENT_TYPES` metadata
  (request headers/context, titles and their LLM requests, end seeds, delivery
  acknowledgements, web search requests), seed variants, and unknown
  future/plugin types never count. It persists
  `$DSH_HOME/dsh-power-suite/session-activity.json`
  (`{version:1, sessions:{id:lastActivityAt}}`, max-merge, 5000-Session cap,
  debounced atomic writes) and seeds a one-time projection-cache baseline for
  pre-install Sessions (never overwriting newer live events; header `createdAt`
  when there is no cache document). Writes are **best-effort
  read-merge-writes**: sequential external writes are preserved, but
  interleaving writers can lose one side (TOCTOU; no cross-process lock).
  `flush()` awaits the full serialized chain and drains during-write events;
  `dispose()` stops the debounce, flushes, awaits the chain and is idempotent.
  A read-only `GET /api/power-suite.session-activity` keeps the
  `{sessions}` contract and serves the live ledger (no per-request document
  scan, no-store) after a bounded `waitForSeeded(5000 ms)`; the client merges
  activity per-id monotonically and prunes only against a non-empty catalog, so
  partial/empty responses cannot drop known activity. Activity is exact only
  for allowlisted events the Host observed; pre-install Sessions rely on the
  baseline approximation, and the native sidebar keeps catalog times. The card
  folds activity in via `max(catalog updatedAt, activity)` for retention,
  ordering, relative times, bucket recency, child rows, and read-baseline
  raising: a turn that ran for hours keeps its real activity time and stays in
  the recent window instead of vanishing when it stops.
- **Update notice (new)** — an in-app card when a newer stable version of the
  bundle is published on npm. The Host answers
  `GET /api/power-suite.update?lang=<locale id>` with
  `{ current, latest, updateAvailable, highlights }`, reading the npm `latest`
  dist-tag and the release notes pinned to the published `v<latest>` tag;
  the browser checks once per page load after a 1.5 s delay and renders a fixed
  bottom-right `shell.overlay` card (never a sidebar node) with the version
  line, up to six `## Highlights`, **更新**, **下次再说**, and
  **查看更新内容 / 收起**. **更新** calls
  `pluginNavigation.openBundle('@zephinel/dsh-power-suite')` to open the
  Plugin detail page — DSH's plugin manager performs the update — and does not
  write silence state; **下次再说** counts per version and after three clicks
  exposes **不再提醒**, which silences only the current version; Escape or an
  outside click is "later". State is browser-local
  (`localStorage['power-suite.update-prompt']`, schema 1), the prompt clears
  itself when the route proves there is no update, and the feature stays silent
  on any failure. It becomes visible to 0.1.0 installs only after 0.2.0 is
  published. See [docs/update-check.md](docs/update-check.md).
- **Sidebar width persistence and atmosphere repaint** — the native left
  sidebar's dragged width is now a Host-owned preference instead of page memory:
  `$DSH_HOME/dsh-power-suite/sidebar-width.json` (schema 1,
  `{ version, sidebarWidth }`, integer 264–420 px or `null`) is served by
  `GET/POST /api/power-suite.sidebar-width`, and the browser keeps a per-origin
  `localStorage` cache (`power-suite.sidebar-width`, `pending` flag) that it
  applies before first paint, debounces drag changes into a 300 ms POST, and
  re-syncs on focus/visibility (plus a 30 s retry while pending). The width
  survives reloads, new tabs, and a Host restart; every browser/profile on the
  same `$DSH_HOME` shares one last-write-wins value; collapsing never stores `0`
  and reopening re-applies the stored width instead of the native 280 px default.
  The rainbow-atmosphere Canvas renderer now reports a real backing-store resize
  and repaints synchronously after it (same task, before paint, independent of
  reduced motion) and paints once at mount, instead of waiting for its 33 ms
  animation throttle, so dragging the sidebar no longer blanks or strobes the
  current-Session highlight. See [docs/sidebar-width.md](docs/sidebar-width.md).

### Changed

- **Review hardening of the migration gates.** Added a Host-only DOM-free typecheck (`tsconfig.host.json`), a zero-tolerance `@ts-nocheck`/`@ts-ignore` scan, a vm execution smoke for the shipped `lib/client.js` (module id + factory inject/apply), full `src/browser/**` coverage for the settings-constant contract scan, a Host→browser import-boundary test, removed the entry's unused imports, restored the Quick Look `.tok-punct` rule, and cleaned the retired annotation-seam helper. Tests are now 394/394; the gate fails on injected `@ts-nocheck` and on a broken built browser bundle (verified with negative probes).

- **Release gates now match the intelligent-ui repository: owner-approved notes and a package-level release check.** `node scripts/release-notes-approval.mjs` hashes the version plus `release-notes/<version>{,.en}.md` and verifies a `Release-Notes-Review: sha256=<hash>` line in the release commit body; `publish.yml` recomputes the hash from the tagged commit and refuses a missing, duplicated or mismatched approval, so an unapproved notes edit can no longer publish. `npm run check:release` (`scripts/release-check.mjs`) packs the artifact, installs it into a throwaway `$DSH_HOME`, and verifies every packed file's byte identity against the checkout and the installed copy, the mounted `power-suite` Loader row, the boot graph and served client bundle, then clean uninstall (requires `dsh` + `pnpm`; intentionally not in CI). Final gate: `npm run check` passed (24 modules, 22 test files, **364/364** tests, docs links 26 files, release-notes 0.1.0 6+6), pack **95 files**, `npm run check:release` **PASS** (95 files), and the approval round-trip is covered by `test/release-notes-approval.test.js`.

- **Running & recent row-menu affordance** — the 48 px time column is now also
  the row-actions slot for **every top-level row**: at rest the row keeps its
  time, and hover/focus hides the time and shows the "…" trigger; the swap
  stays while the menu is open (`data-menu-open`) and leaving restores the
  time. The trigger keeps the ordinary soft hover paint (plus the keyboard focus
  ring); only the rainbow row suppresses it (transparent background + the same
  `brightness(1.2)` icon lift as the other current-row controls). Subagent rows
  keep the time slot and have no trigger. The trigger opens a card-owned popup
  rendering the native Session action contributions (native labels plus local
  action glyphs) without the Pin/Unpin
  entry, while the restored title-left pin button remains the pin owner.
- **Running & recent row layout** — rows and the header share one fixed trailing
  grid: title (right-edge gradient fade while clipped) → **time 48 px**
  (right-aligned, tabular numerals) → **New session action 22 px**
  (hover/focus-revealed) → **disclosure chevron 24 px**, so parent and nested
  subagent rows right-align their times on one column and no title can push the
  controls; a flexible spacer between the content-paced title control and the
  trailing grid keeps that grid right-anchored at every card/sidebar width.
  Every row (main and nested child, ordinary and current) is 34 px tall — the
  measured height of the native Workspace project rows — and gets a clear
  vertical gap (5 px between items, 4 px parent→first child, 5 px
  child↔child) so the current-row atmosphere never touches its neighbours while
  the 1 px subagent trunk and its last-child end mask stay coherent. The title's
  first character is centred on the child status-dot column through a measured
  per-row offset (first-glyph advance width + a 2 px right bias), so the tree
  line, pin column, child dots and first character share one centre line; every
  main row's leading glyph sits in a fixed 16 px cell (14 px state dots centred,
  the read-row sparkle enlarged to 16 px), the child-tree trunk is centred under
  that cell, and the pin control is centred on the child status-dot column with
  equal 9 px gaps on both sides.
- **Running & recent row actions** — rows gained a fixed trailing cluster with
  **New session** (a blank Session in the row's own directory, falling back to
  the Workspace New Session) and, for interrupted rows, an amber warning badge
  plus a **Continue** action that reuses the interrupted-session continuation
  flow. Slots are reserved and revealed on hover/keyboard focus without layout
  shift, and the row's hover card anchors to the activity panel's right edge so
  it never covers the row or its buttons.
- **Current-Session rainbow atmosphere** — the animated conic rainbow ring that
  marked the open Session is replaced by a vivid animated rainbow
  **atmosphere painted inside the row's own rounded-rectangle highlight**, with
  the row's real content layered above it under a faint contrast scrim. The
  renderer uses source-over saturated blobs (vibrance 1.72, intensity .64,
  `saturate(1.5)` plus per-theme multiply/screen blending and a lightened
  scrim) so the pill reads as saturated rainbow gas rather than a grey wash
  (measured blob-core saturation ~0.40–0.43, static ~0.30–0.34 under reduced
  motion). It applies to the current Session's card row (parent and nested
  child rows), the owning native Workspace row, and the native sidebar Session
  row of the open Session (`data-psd-current-session`), is clipped to each
  row's own radius, is `pointer-events: none`, changes no column/geometry,
  animates only the highlighted rows, and draws a static rainbow fill under
  `prefers-reduced-motion`. Opening a Session from the card, the sidebar, or
  anywhere else moves the highlight with the
  Activity/Workspace/Session association. Atmosphere rows no longer receive the
  ordinary row-body hover pill or the native sidebar row's own hover/selected
  background (the extra rounded highlight read as a misaligned second
  highlight): the affordance is a brightness lift on the row's own text/icons
  (`filter: brightness(1.15)`, `1.5` on keyboard hover/focus, 140 ms, disabled
  under reduced motion), with the same rule for trailing controls (New session,
  disclosure, pin, Continue, native sidebar actions) and keyboard focus rings
  unchanged.
- **Running & recent identity glyphs** — the panel header's all-complete
  indicator paints the DeepSeek brand glyph (`deepseek-fill`) and an
  acknowledged finished parent row paints the sparkling-line glyph; sizes,
  scales, colours, glyph columns, the running pulse dot, the unread green dot,
  and the nested subagent robot glyph are unchanged, as is all state logic. The
  card header's leading indicator has the blue pulsing business-primary dot
  while any listed Session is running and the white sparkling-line icon when
  everything is complete, both centred on the row glyph column.
- **Running & recent row hover card** — the card now matches the live native
  sidebar session hover-card oracle (left edge flush with the sidebar's right
  edge, top aligned to the row, borderless, 16 px radius, 12×16 padding and
  native title/secondary type), grows to 320 px for the figure rows, and clamps
  to `min(560px, 100vh - 16px)`. **All plugin tooltip-like floating cards**
  (the row card, Artifact Quick Look, prompt-history preview/search cards, and
  the annotation requirement popover/detail card/expanded note editor) paint
  the native hover-card surface — a fixed `#2C2C2E` (`--dsw-hovercard-bg`) in
  both light and dark themes rather than the theme-flipping tooltip token, with
  no border and the shell's native panel elevation. The panel's plugin chrome
  inherits the shell font family/size/weight and shows title-case **Active
  Projects** / **Inactive Projects** bucket labels instead of uppercase.
- **Theme-following surfaces and light-mode readability** — Dynamic Workspaces
  session hovercards follow the active theme: light mode uses a white surface
  with the light label tokens (title `#0f1115`, secondary `#61666b`, tertiary
  `#81858c`) for the plugin's `.psd-hovercard`/`.psp-*`/`.dsa-quicklook` cards
  plus a minimal scoped override for the native shell session-info hover card,
  while dark mode stays byte-identical (`#2C2C2E` + white). The native override
  depends on shell module class hashes and degrades gracefully to the native
  dark card. The native Workspace session-info hover card uses the plugin
  card's 320 px width in both themes (scoped shell-hash override with graceful
  fallback). Rainbow atmosphere rows are readable in light mode through a
  brighter pastel canvas, a white readability veil instead of the dark scrim,
  and lifted secondary text/icons on highlighted rows (card title
  5.51:1→14.72:1, time/icons 1.08:1→4.52:1, native Workspace worst text
  15.45:1), with the sidebar E2E pinning the light thresholds; dark mode is
  unchanged. Running-panel icons match the native Workspace icon weight in
  light mode (row actions, disclosure/chevrons, status and child glyphs lifted
  from `label-tertiary` #81858c to `label-secondary` #61666b; brand/sparkle
  stays `label-primary`). The reported dark document-preview panel was found
  shell-owned and not reproducible (the plugin defines no `--dsw-*` variables;
  only the shell diff sub-palette is low-contrast) and is documented as a
  shell-side limitation with no broad override.
- **Prompt-history rail matches the native turn rail** — right-aligned 20 x 2 px
  tick marks on the native column (60 % width at rest, growing on hover, brand
  hairline on keyboard focus), a horizontal 32 x 1 px divider, a native-style
  line-clamped preview card, and a pinned 20 x 22 px magnifier whose centre sits
  on the visible resting tick column (the toggle overhangs the rail edge by
  4 px); copying a prompt is silent (the confirmation chip, check icon, and
  animation are gone while the exact draft text and composer focus remain). The
  rail's order was reversed to reading order (oldest top, newest bottom) and it
  keeps the newest tick in view.
- **Borderless floating surfaces** — the annotation launcher and its count
  badge, the annotation rail (docked and overlay), the exit-confirmation dialog,
  the feedback and undo toasts, and the Running & recent panel card no longer
  paint an outer border; the launcher is a perfect circle
  (`corner-shape: round`) and every borderless surface uses a ring-free soft
  shadow, so the elevation token's 0.5 px hairline cannot read as a border in
  either theme; separation comes from background and shadow, inner controls
  keep their own borders.
- **Plugin input focus treatment** — a shared animated rainbow track focus ring
  replaces solid-color focus outlines/borders on plugin text inputs (annotation
  note fields, prompt-history search field, settings choice pills); it fades in
  in 140 ms, rotates and hue-drifts, keeps a static ring under reduced motion,
  and falls back to the system `Highlight` outline under forced colors. The ring
  is parameterised and the prompt-history search card paints a deliberately
  calmer variant around the whole floating card when its input is focused
  (opacity 0.58, desaturated 2.5 px glow, 1.5 px track, slower 4.6 s/20 s drift;
  the inner input itself is ringless). The rainbow ring now hugs the wrapped
  control's border box on all four edges (the inline-level baseline gap that
  exposed the control's bottom border is fixed).
- **UI element annotation settings** — the rail header's settings gear/settings
  view is replaced by an **info (i) icon** that opens a small borderless
  hovercard-style popover with the two modifier rows; each row is a **custom
  segmented control** (`role=radiogroup` with four `role=radio` segments
  Alt/Ctrl/Meta/Shift, roving tabindex, arrow/Home/End/Enter/Space selection,
  persistence + inline conflict feedback, glass track, primary-accent checked
  segment, rainbow focus ring on the checked radio). The old settings
  view/Back path and the dropdown/listbox implementation (and its seam helpers)
  are removed — no native `<select>` or OS menu remains. Segments show the
  modifier-key symbols (`⌥ Alt`, `⌃ Ctrl`, `⌘ Meta`, `⇧ Shift`) with full
  localized aria-labels, equal widths, and no truncation; document-level Esc
  closes the menu first, then the popover, with the mode staying on.
- **UI element annotation composer interaction** — the current Session's
  composer stays natively clickable/typable while the mode is active (and is no
  longer an annotation target), so an inserted reference chip can be edited and
  sent; the sidebar footer primary becomes **Insert all into composer** when the
  collection is non-empty and no page selection is pending; the multi-selection
  batch popover is draggable by its header and both popovers clamp with their
  measured size so their buttons stay inside the window; Active/Inactive
  Projects headings match the native Workspaces heading (14 px / 400).
- **UI element annotation launcher placement** — the round launcher floats only
  while the mode is off; activating the mode fades/scales it out in place (no
  docked or flying copy in the rail header), and a full exit (header X, Cancel
  Annotation, or the final Esc step) restores it with a fade/scale animation at
  the remembered floating position (drag and position persistence are idle-only;
  reduced-motion users get the instant state).
- **Artifacts source filter** — the filter is a custom dropdown in the panel
  header immediately left of Refresh: a `filter-line` funnel trigger with the
  current option label/count and a rotating caret opens a themed, right-aligned
  `menu`/`menuitemradio` popup listing All/Generated/Provided with their counts
  and a check on the selected option (focus moves to the selected option on
  open; outside press or Escape closes; Escape returns focus to the trigger).
- **Plugins-page settings section** — the bundle's Plugins page shows only the
  suite's real controls while its settings section is mounted: the
  auto-rendered package README document above the configuration is hidden and
  restored on unmount, and the section carries the **Prompt history** group plus
  the **Active & recent** group with the two retention rows.
- **Running & recent fold persistence** — the Active/Inactive bucket fold state
  is restored on the first observable paint using a persisted bucket
  classification cache and then corrected by live data, so a collapsed bucket
  no longer paints expanded for the hydration window; native section
  re-renders cannot clobber a fold.

### Fixed

- **Prompt-history rail anchoring** — the rail was a separately positioned
  fixed overlay: it measured the native turn rail's marks and re-measured on
  scroll/drag, so it could drift by one mark while scrolling, trailed then
  snapped while dragging a dock/right sidebar, and stayed visible after the
  native rail had hidden in a narrow conversation. It now renders **inside the
  native turn-rail frame** (directly below its marks, same 28 px column and
  right edge, native band height) so the shell's own sticky positioning,
  drag tracking and narrow-container hiding apply with no JS catch-up; the
  hover preview and search cards remain body-portaled and viewport-fixed.
- **Interrupted-session refresh and timing** — badges repull automatically after
  a Host restart (Connection generation reset), on focus/visibility/online, and
  on a 20 s poll instead of waiting for a Session click; parent Sessions whose
  delegated subagent was interrupted after the parent's last completed turn are
  marked interrupted, including nested delegations (a live child remains live
  work); subagent interruption timing uses the child's turn start as well as its
  last event, covering children that go silent before a Host restart. After a
  reconnect, an interrupted Session no longer keeps the native green "running"
  spinner until opened — the plugin decorates rows whose native status is stale,
  replacing the spinner with the amber mark. Forced badge refreshes keep the
  current ready value until the new answer arrives (no flash through `loading`);
  the Host interruption cache uses per-Session event epochs so a slow log read
  cannot overwrite a newer turn event. Continue validates JSON content type,
  current interruption/running state, and per-Session in-flight admission;
  duplicates are rejected instead of queued.
- **Sidebar interrupted hover geometry** — hovering an interrupted native
  Session row keeps the shell's normal hover surface and its title visible (the
  shell still replaces the time with the trailing hover actions, as on any
  Session row) and reveals the inline Continue triangle right after the warning
  mark; the obsolete opaque `::before` hover mask (a leftover from the retired
  trailing-edge CTA) is gone. The mask's positional `span:first-child` z-index
  rule used to catch the injected rainbow-atmosphere wrapper on the current
  Session row, which turned the background layer into an in-flow pill that
  pushed the badge right and collapsed the title; the native status cell now
  widens with `width: auto` so the triangle fits and the title slides right
  instead.
- **Running & recent card geometry and hover fixes** — collapsing the
  Continue/pin slots no longer leaves flex gaps behind: the head is gap-less and
  the leading glyph cell carries the rest spacing, so an interrupted row's
  title sits at the first-character-centred rest column again and slides right
  only when hovered/focused (the pinned column stays at the documented
  9 + 16 + 9 px; the glyph-to-title gap is the 9 px cell margin plus the ~12 px
  centring shift). The hover surface now covers the whole row like the native
  sidebar rows instead of a content-paced inner pill that lit only the title;
  the row body stays transparent so no second nested pill appears, pinned rows
  keep their violet tint under the hover layer, and atmosphere rows keep their
  transparent surface.
- **Sidebar review follow-ups** — the interrupted row's leading cell no longer
  hides other plugins' leading-slot marks (schedule clock, liveshare fork) —
  only the native status dots are hidden while the stale-spinner decorator is
  active; the inline Continue triangle expands the native status cell instantly
  instead of animating its width, so the shell's title marquee measures the
  narrowed cell and no longer stops short; the card's keyboard focus surface is
  gated on `html[data-input-modality="keyboard"]`, so a mouse click cannot leave
  a stuck row surface; atmosphere-row control suppression is restored, scoped
  with child combinators to the current row's own controls, and gated the same
  way (nested child rows keep their normal hover block); pointer focus no
  longer leaves the atmosphere rows' `brightness(1.5)` lift or the native
  Continue triangle stuck after a mouse click; the card's Continue slot honours
  reduced motion; the dead trailing-edge Continue component is removed; docs no
  longer claim the time stays visible on native hover.
- **Read acknowledgements and activity-ledger robustness** — read-acks `load()`
  is single-flight with forward-merge publication (`mergeAcked(state,
  parsed)`), so a stale concurrent load cannot clobber a newer record;
  non-ENOENT reads reset the cached promise and throw typed
  `READ_ACKS_READ_FAILED`, GET/POST answer no-store `500 { code:
  "store-read-failed" }`, empty is never cached, `record()` awaits the same load
  in the serialized chain and `get()` returns current. A non-ENOENT
  activity-ledger load keeps memory, resets its promise, throws typed
  `ACTIVITY_READ_FAILED` (no empty rewrite; writes abort while unreadable;
  ENOENT stays empty); the Host `ensureLoaded()` resets/rethrows,
  `ensureSeeded()` resets the seed promise with the existing 30 s backoff, and
  the route serves **`200` snapshot/empty, never 500** — after recovery the
  next GET after the backoff retries load+seed and returns recovered entries,
  while during the backoff a GET may serve current/empty memory. Ack pushes are
  chunked (≤200 entries/~48 KiB, one in flight), body reads are capped at 64 KiB
  of UTF-8 bytes, client requests time out after 8 s, and `401/403` join
  network/5xx/408/425/429 as retryable ack-push failures (other permanent 4xx
  drop only that batch immediately; local and pending maps each capped at
  1000). The activity route uses an 8 s `AbortController` timeout and the
  client awaits pending ack pushes before fetching it. Ack flush/sync failures
  are caught and bounded-logged, failed read-acks writes clean up their temp
  sibling, and the read-acks `localStorage` migration runs per mount. Read-error
  behavior is unit/`chmod`-tested only and the concurrency proof is store-level
  stress (20 rounds of 4 concurrent get + 3 record), **not** a real
  multi-process Host; client 401/403 classification has no browser node
  harness.
- **Activity seed recovery** — an already-pending seed that times out keeps the
  30 s immediate-serve backoff while background seeding continues; a
  failed/rejected seed may set that backoff but the Host resets the seed promise
  so a later request retries load+seed, and seeded history can appear after
  recovery (during the backoff a GET may serve current/empty memory `200`).
  Selection families no longer list PTC mode (`ptc-mode` is a message-source
  key; `tool/ptc-dispatch` remains activity).
- **UI element annotation resolution and identity** — resolution is two-phase:
  per-candidate hit sets are collected and the first unique candidate (highest
  stability tier/score) wins, so a non-unique high-tier candidate (e.g. a
  duplicated `aria-label`) no longer short-circuits to Ambiguous when a
  lower-tier structural/anchor candidate resolves uniquely; Ambiguous is
  reserved for genuinely all-non-unique candidates, and weak XPath/text-position
  ambiguity no longer terminates the text-quote fallback. CSS-module/hashed
  class names are filtered by a word-like/generated-pattern heuristic, and
  record identity uses the verified unique selector. Candidate resolution gains
  an ordered stability ladder (data/ids/aria > role+name > label/role > class >
  tag/nth) and a length penalty; text-bearing leaf records additionally capture
  a bounded absolute XPath, a normalized text quote (exact + prefix/suffix), a
  container-relative text position, and a `document.querySelector(...)` JS path.
  Resolution falls back **CSS → text quote (position hint) → text position →
  XPath last** (full XPath only with a live node, never fabricated), with a
  `via` hint in the popover, detail card, and rail row and **Copy locator** /
  **Copy XPath** / **Copy JS path** actions (live-node-first → saved-anchor →
  honest-unavailable). Capture-time text-quote disambiguation is
  occurrence-aware, bounded, uniqueness-verified, and drops misleading quotes;
  one rendered-text pipeline (`<br>`/block boundaries → space + rendered→raw
  offset map) keeps the text comparison honest; fallback resolution keeps a
  single validation boundary (tag/digest/accessible name/proximity), scored
  approximate matching (exact unique context resolves, small edits report
  Content changed, ties Matches several), status/node caching keyed by
  `(record id, DOM revision)` with bounded scans (400 elements / 32 candidates)
  and a 400-entry node cache, and a **weak-identity gate** so icon-only/
  tag-only records cannot falsely resolve via structural fallbacks (no wrong
  marks/copies; they report Changed honestly).
- **UI element annotation descendant anchors and weak identity** — non-leaf
  targets with meaningful descendant text capture a first-text-leaf rendered
  quote/position plus `anchorTarget:'descendant'`, the leaf tag, the ancestor
  tag chain and a stable-attribute signature; when CSS candidates go stale the
  resolver falls back to the descendant text anchor and climbs to the closest
  ancestor matching tag+signature (unique → Resolved, same-text/same-signature
  decoys → Matches several with no mark, none → honest continue;
  floating/ephemeral surfaces excluded). The recorded scope is authoritative: a
  unique in-scope target resolves even when an identical out-of-scope duplicate
  exists (the Workspaces-row vs Running & recent-title case no longer reports a
  false "Matches several"), multiple distinct in-scope targets are **terminal
  ambiguous**, and an empty/missing scope still re-anchors through the bounded
  document fallback. Weak-identity structural outcomes keep the four statuses
  but add `confidence:'weak'|'strong'` and present
  "Unverifiable · weak identity" / "无法验证 · 弱身份" instead of Content
  changed; a stale `uniqueVerified` selector no longer counts as identity
  unless it still resolves to a single connected/visible element, structural
  fallback hits must pass a quote assertion plus captured-ancestor
  corroboration before Resolved, weak-identity records without a quote are
  **Missing** (no mark or live-node copy on a same-tag look-alike), and removed
  floating/ephemeral targets report **Missing** instead of Changed after reload.
  Approximate matching recall mirrors the Hypothesis `matchQuote` bounds; the
  capture scope-climb duplicate probe uses the rendered-text pipeline, fallback
  scans/cache misses are instrumented for a test-only probe (repeat resolution
  on unchanged DOM adds zero scans; host mutation re-resolves once), and docs
  recommend host apps expose stable `data-testid`/`data-*`/accessible names for
  position-sensitive elements.
- **UI element annotation follow-ups** — hovering a composer annotation
  reference chip (single or grouped) shows the custom annotation detail
  tooltip — requirement, locator, captured position box, Session/Workspace,
  live status, or the group count/list — while clicking keeps its existing
  behavior; chat-flow element picks anchor to the shell's real chat attributes
  (`data-chat-node-key`/`data-chat-anchor-key`/`data-chat-group-key`/
  `data-chat-turn`/`data-chat-flow-key`), so leaf targets in a
  streaming/virtualized chat resolve across re-renders instead of reporting a
  stale positional locator (annotations captured before this change are not
  silently remapped — re-annotate them); hovering or focusing a single/grouped
  annotation chip shows an own 16 px × that removes exactly that reference chip
  through the composer editor in one undo step (other chips and text preserved,
  never sent), while the chip hover tooltip stays read-only; the requirement
  popover keeps its Delete action in the Requirement caption row (marked state
  only) so the footer holds exactly the two primary buttons on one non-wrapping
  row; the weak "Unverifiable · weak identity" label regained E2E coverage,
  role+name got its own selector-stability tier, and the matchQuote
  recall/role+name/length-penalty behavior is pinned by unit tests.
- **UI element annotation transient surfaces** — selecting an element inside a
  hover-triggered floating surface (e.g. the subagent hover dropdown) no longer
  loses its target when the pointer moves into the requirement popover: the
  surface is pinned open for as long as that popover is active (pointer-leave
  close events are suppressed for the pinned subtree and released on
  close/selection clear/mode exit), the status stays Resolved while editing,
  and the transient hint explains the keep-open-then-may-disappear behavior. If
  a surface still closes (timer/scroll/keyboard path), the status changes
  honestly but the locator summary stays the captured string instead of
  switching to a look-alike element's label.
- **Hover Quick Look fixes** — the Quick Look no longer opens as an empty card:
  it always receives an explicit height (570 x 360 default, clamped to the
  viewport, with a remembered or user-resized size still winning) and its
  content layer no longer depends on an inline opacity style or a finished
  animation, so generated Markdown/code/image content is visible on the first
  hover. Single-quoted code strings highlight correctly, the preview cache is
  bounded with a TTL, and sidebar/chat observers are scoped to relevant
  mutations.
- **Raw artifact media type and CSP** — raw artifact media type comes from the
  real path and every raw response uses the native sandbox/default-src-none CSP;
  the implicit continuation context and correlated turn-trigger row are hidden
  in Chat.
- **UI element annotation NITs** — ephemeral/floating surface-gone now reports
  **Missing** for every outcome through a single `annotationEphemeralOutcome`
  gate (still-present surfaces keep honest outcomes; the conservative
  transient-Changed policy is documented), deferred reference-conformance
  limitations moved into the user docs, and the selector/popover copy states
  were corrected.
- **Interrupted-state consistency for the card and stale-running native rows** —
  the interrupted mark/Continue decision now follows the Host interruption
  record alone instead of the shell's combined running flag, so a parent Session
  whose own turn stopped on a provider transport/timeout error while delegated
  subagent children still run keeps its amber mark, inline Continue and relative
  last-activity time in the **Running & recent** card (interrupted child rows
  show the amber glyph) instead of appearing as an unstoppable running row.
  Native sidebar rows the shell still renders as running now get both the amber
  badge and the hover Continue CTA, wired to the same continuation handshake as
  idle rows, and every mark/CTA disappears once the continuation turn is running
  (`running: true`). No Host route, payload or state shape changed.
- **Row "…" menu uses the native shared context-menu popup** — the card row
  menu no longer renders a custom card-styled popup with a local glyph map and
  no shortcut hints; it opens the shell's native shared context-menu surface
  (the one the native DSH Session row opens) against a plugin-owned
  captured-target kind, so its material, keyed native icons, live keyboard
  shortcut hints, submenus, separators and the Archive `afterContent` footer
  match the native menu. A registered contribution delegates the action list to
  the native Session actions — Rename, Fork, Copy Session ID, Show in Finder,
  Archive and any plugin-contributed action keep their native behavior — and
  filters only the Pin/Unpin entry, because the card's title-left pin button
  remains the pin owner. The old `DwSessionMenu` portal, its local icon map and
  its custom `.psd-menu*` styles are removed; the trigger is focused before
  opening so the shared popup restores focus to it, `data-menu-open` follows the
  shared popup's active target, and a DSH build without the shared context-menu
  service hides the trigger instead of falling back to the custom surface.

### Removed

- Standalone Project detail page: the `project-view` feature is removed —
  `src/features/project-view/{host.js,fold.js}`, the `//#region feature: project
  view` browser region and its `installProjectView` call, the 24 project-view
  tests, `docs/project-view.md`, the five `docs/assets/project-*.png`
  screenshots, and the `GET /api/power-suite.project` route. Clicking a
  Workspace's title in the sidebar performs the native expand/collapse again,
  and the default agent preset stays available from the Workspace context menu.
  Removing the page needs no data migration: it persisted no state.

### Documentation

- Added [docs/update-check.md](docs/update-check.md): user-facing behavior, the
  `GET /api/power-suite.update?lang=` contract, cache TTLs, version rules, the
  browser prompt state, the tag-pinned release-notes source, and limitations.
- Added `release-notes/<version>.md` + `.en.md` files and their format rules,
  plus `scripts/check-release-notes.mjs` and the `check:release-notes` gate
  (also run from `npm run check` and the publish workflow), so the in-app update
  notice can only read reviewed, tag-pinned Highlights.
- Added the tag-triggered `publish.yml` publish workflow (Trusted Publishing)
  and replaced `check.yml` with `ci.yml` (docs-only fast path + verify job), and
  added the `.agents/skills/release-power-suite` release procedure.
- Consolidated the never-published `[0.1.0] - 2026-11-09`, `[0.1.1] -
  2026-11-11`, and `[0.2.0] — undated development snapshot` sections into this
  single first-release section, and reframed the README around the planned
  first public release (0.1.0) instead of the old 0.2.0/0.3.0 snapshot
  narrative.
- Rewrote the English README as a Bento landing page — icon header, three
  badges, a one-line hook, a `[!NOTE]` status block, overview sections with four
  composed WebP images in `assets/`, a scannable feature table, and install,
  quick-start, prerequisite and gate sections. The images are produced by
  `npm run build:readme-bento` (`scripts/build-readme-bento.mjs`) from local
  live-GUI captures taken by the new `test/browser/sidebar.e2e.mjs
  --readme-shots` mode; the capture and compose pipeline, including its privacy
  masking rule, is documented in [docs/development.md](docs/development.md).
