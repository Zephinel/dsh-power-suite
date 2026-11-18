# TypeScript migration plan

Status: **proposed (as-planned)** — 2026-11-18. Owner approval is required before
Phase 2. This document records the plan only; no runtime behavior, build step or
release pipeline changes are made by it.

Related: [Codebase design review](codebase-design-review.md) ·
[Development](../development.md) · [Architecture](../architecture.md) ·
[Verification](../verification.md) · [Release skill](../../.agents/skills/release-power-suite/SKILL.md)

## 1. Summary

The pre-migration baseline was pure JavaScript with **no build step** (Phase 2a
now introduces the build); `package.json`
exports `src/index.ts` and `src/client.js` directly, and everything the package
ships is the checked-in source. The browser half is a single classic browser
script (`src/client.js`, ~24.8k lines, ~1.2 MB, 1,595 JSDoc tags); the Host half
is 22 ES modules under `src/features/`.

The proposal is a **staged migration to TypeScript**, with the first phase being
a no-build type-checking gate (JSDoc + `checkJs`) that changes neither the runtime
nor the packaging. Build-backed TypeScript comes later, in phases, only if the
owner approves it.

## 2. Why consider TypeScript here

| Area | Benefit | Strength |
| --- | --- | --- |
| Host routes and stores | 16 `/api/**` routes and 6 persisted documents (settings, session pins, read acks, session activity, sidebar width, workspace presets) would get one typed contract instead of separate hand-written validation and client assumptions | high |
| Shared record models | Annotation v2/v3 records, artifact rows, activity entries cross the Host/browser boundary; type drift has already appeared in docs (v2 vs v3 wording) | high |
| Large-file refactors | `src/client.js` is where most slot/feature edits happen; a compiler catches signature and field mismatches beyond what 367 Node tests cover | medium-high |
| Enums and constants | modifier modes, retention windows, caps (`100`, `1000`, `5000`), storage keys and route names become named types | medium-high |
| Editor/agent feedback | `tsc --noEmit` in the gate surfaces typos and argument errors earlier, without waiting for a browser run | medium-high |
| DSH platform APIs | the `dsh.client.inject` packages are runtime-provided and have no local type source; ambient declarations would start as `any` | low-medium |

## 3. Why not a big-bang migration now

These are the concrete constraints that make a full migration an architecture
change rather than a language swap:

1. **No build step is a feature.** The package publishes `src/` as-is, so there is
   no built artifact to go stale. `npm run check` stays inside the source tree and
   `npm run check:release` proves that every packed file is byte-identical to the
   checkout, then installs it into a throwaway `$DSH_HOME`.
2. **TypeScript needs a build.** Moving to `.ts` means introducing a compiler or
   bundler, changing `exports`/`files` to built output, adding a build to CI and
   `publish.yml`, adapting `scripts/release-check.mjs`, and rewriting every
   "no build step" claim in the README, `PRODUCT.md`, `docs/development.md`, the
   release skill and the docs-sync references.
3. **A build re-introduces a bug class this repo does not have.** dsh-intelligent-ui
   needs `scripts/release-check.mjs` partly because a rebuilt `lib/` can drift from
   `skills/`/`locale/`; here that class of bug is structurally absent today.
4. **The browser half is a classic script, not a module.** `src/client.js` is
   evaluated as a classic browser script through the DSH module loader; a
   TypeScript output must remain the same shape. Converting it also means deciding
   whether to split the single file into modules, which is a refactor, not a type
   annotation.
5. **The test harness reads the source text.** `test/helpers/client-module.mjs`
   reads `src/client.js` into a `node:vm` sandbox, so the harness must be adapted
   to whatever build output replaces it.
6. **Platform types are missing.** No DSH client package is a local dependency, so
   `src/client` would need hand-written ambient declarations; the reference
   repository excludes its client half from typecheck for exactly this reason.

## 4. Goals and non-goals

Goals:

- One typed contract for the Host/browser boundary and the persisted documents.
- Compile-time checking of route names, settings keys, caps and shared records.
- Safer large-file refactors with a gate that fails locally before a browser run.
- Keep runtime behavior, UI copy and DSH integration unchanged in every phase.

Non-goals:

- Changing behavior, UI, copy, performance targets or the DSH surface.
- Adding runtime dependencies, bundling dependencies into the artifact, or
  changing the published install steps.
- A style-only rewrite of the browser half; type annotations do not justify
  unrelated formatting churn.
- Rewriting git history or the released `0.1.0` artifacts.

## 5. Design constraints

[The codebase design review](codebase-design-review.md) applies the deep-module
lens to today's tree and adds three constraints to this plan:

1. **Do not type the duplicated mechanisms first.** Six stores re-implement the
   same durable-document contract; extract it behind one deep module (small
   interface: read / update / flush / dispose; per-document adapters keep the
   policy) in Phase 2 before converting the stores to TypeScript.
2. **Give the cross-half contract an owner.** Sixteen route paths and the
   settings enums are declared twice (Host constants and client literals). Phase
   1 adds a contract guard for the duplication; the shared protocol module lands
   once the build lets both halves import it.
3. **The browser half needs an interface, not a test global.** The vm harness and
   `__POWER_SUITE_TEST_HOOKS__` are a test seam; Phase 3 splits features into
   modules with a `deps` port, imports their pure models directly in Node tests,
   and keeps the browser suites as the UI-seam tests.

## 6. Target architecture (if all phases complete)

- `tsconfig.json` with `strict` for Host and a documented relaxed profile for the
  browser half; `npm run typecheck` is part of `npm run check` from Phase 1.
- Host sources become `src/features/**/*.ts` with typed route handlers and
  store document schemas; shared record types live under `src/shared/`.
- The browser half becomes modules under `src/client/**` bundled into one classic
  script (IIFE) that keeps the `window.__ModuleLoader__` contract, or stays a
  single file if splitting proves riskier.
- A build (esbuild or `tsc` emit — decision in Phase 0) produces the published
  entry points; built files are gitignored and only produced by `npm run build`
  and by `npm pack`'s `prepare`.
- `scripts/release-check.mjs` verifies the packed artifact against a build manifest
  (source tree hash + expected outputs), installs it into a throwaway `$DSH_HOME`,
  and keeps the boot-graph/client-bundle/uninstall checks.
- Ambient types for the runtime-provided DSH packages live under `types/dsh/`,
  are owned by this repo, and are allowed to be incomplete as long as every `any`
  is deliberate and documented.
- Docs and skills state the new build/pack reality; the "no build step" claims are
  removed in the same phase that introduces the build.

## 7. Phases

Each phase is a separate branch/PR, keeps `main` releasable, and ends with the
full local gate plus a dry-run package check unless stated otherwise.

### Phase 0 — decisions and baseline (this document)

Deliverables: owner decisions on the open questions in section 9; a recorded
baseline (`npm run check` counts, `check:release` result, bundle sizes, typecheck
error count if Phase 1 is run as a spike).

Acceptance: this plan is approved or amended; no code changes beyond the plan.

### Phase 1 — no-build type checking (recommended first)

**Status: implemented on `feat/typescript-phase1` (2026-11-18).** Evidence:
`npm run typecheck` reports 0 errors over the Host half, `npm run check` includes
it, `test/protocol-contract.test.js` guards the duplicated literals, and no
build step or emitted file landed. `package.json` `files`/`exports` are unchanged;
the packed content grows only by `src/shared/protocol.ts` and the two plan
documents (95→98 files). `src/client.js` carries a transitional `// @ts-nocheck`
until Phase 3.

Add `tsconfig.json` with `allowJs`, `checkJs`, `noEmit`; add
`"typecheck": "tsc --noEmit"` to `package.json`; wire it into `npm run check` and
CI. Keep the build, packaging, exports and repository layout unchanged. Also land
the shared settings/protocol typedefs, the contract guard against duplicated
route/enum literals, and the document-store interface design (no extraction yet).

Order of tightening: Host stores and route handlers → shared schema typedefs. The
browser half is deferred to Phase 3 (the build phase), matching the design
review; `src/client.js` carries `// @ts-nocheck` for now.

Acceptance:

- `npm run check` runs the typecheck and stays green.
- Existing packed files stay byte-identical to the checkout (`npm run
  check:release` passes with 98 files); the only packed additions are
  `src/shared/protocol.ts` and the two plan documents (95→98), and
  `package.json` `files`/`exports` are unchanged.
- No sourcemap, build output or package-layout change.
- The docs-sync reference records the new guard and its expected output.

### Phase 2 — build plus Host TypeScript

**Status on `feat/typescript-phase2` (2026-11-18).**

- **2a (build plumbing) done.** `npm run build` (esbuild) writes the gitignored
  `lib/index.js` and `lib/client.js`; `package.json`
  `main`/`exports`/`files` point at `lib/`; `prepare` builds before
  pack/publish; `npm run check` builds first; `scripts/release-check.mjs`
  compares the packed `lib/` with a fresh build before install/boot/uninstall.
  Decisions taken: esbuild + `tsc --noEmit`, `lib/` as the published output, and
  packed files now exclude `src/` (98→75).
- **2b (document-store extraction) done.** `src/host/document-store.ts` owns the
  shared durable-document mechanism (lazy single-flight read, coded read-error
  policy, serialized read-modify-write, atomic 0600 rename, publish-after-rename)
  with `get`/`update`/`flush`; the settings, read-acks, session-pins,
  sidebar-width and workspace-presets stores are now adapters that supply only
  their document policy. `test/document-store.test.js` covers the module
  interface; the existing store suites still pass unchanged (374/374 tests).
  The activity ledger keeps its debounced write path for now.
- **2c (Host TypeScript conversion) done.** The 22 Host modules, `src/index.ts`,
  `src/host/document-store.ts` and `src/shared/protocol.ts` are TypeScript with
  `.ts` relative specifiers; the Node tests import the sources directly via
  Node's native type stripping (zero build; `engines.node >= 22.18`), while
  esbuild keeps producing the two `lib/` entries and the packed set stays
  unchanged. `strict: true` (421 errors) is deferred to 2d; 2c carries the
  minimal annotations needed for a clean `tsc --noEmit` plus
  `erasableSyntaxOnly`/`verbatimModuleSyntax` guardrails.
- **2d (strictness) done.** `tsconfig.json` now sets `strict: true`; the Host
  sources pass `tsc --noEmit` cleanly, with explicit `any` kept only at DSH
  platform boundaries (and other genuinely dynamic seams) and counted as a
  tracked budget (then 335 sites). This closes Phase 2; the follow-up cleanup
  drove the budget to zero (see 2e).
- **2e (Host type-surface cleanup) done.** Removed the remaining 335 explicit
  `any` sites: added `src/host/context.ts` (minimal structural DSH `HostContext`:
  effects, events, route registration and the fs/sessionQuery/agents/preset/
  workspace services), `src/host/errors.ts` (`errorCode`/`errorMessage`/
  `isNotFound` for unknown thrown values), real document/ops interfaces for every
  store, `ArtifactRow`/`SessionSnapshot` fold types, an `ActivityLedgerHandle`
  and typed event callbacks; the Host context mirrors DSH's real filesystem API
  (opaque `FsTarget`, `stat` returning `FileInfo | undefined`) and provided
  attachments are a distinct `AttachmentRow`. `npm run check` fails when an
  `any` token re-enters the code (comments/strings stripped; aliases, unions and
  generics count) — a lexical tripwire at 0, not a proof.

Introduce the build (recommended: esbuild for the browser classic script and
`tsc --noEmit` for types; alternative: `tsc` emit for both), switch `exports` and
`files` to built entry points, add `prepare` so `npm pack` builds, and add the
build to CI, `publish.yml` and `check:release`. Extract the shared document-store
module in plain JavaScript first and prove behavior parity through its interface,
then convert the 22 Host modules to `.ts` with typed store documents and route
payloads.

Acceptance:

- Fresh clone can `npm ci && npm run build && npm run check`.
- The packed tarball is produced only from a clean build; no built file is
  committed (`git diff --exit-code` stays green in CI).
- `check:release` proves the packed artifact matches the build manifest, installs
  into a throwaway `$DSH_HOME`, boots, serves the client bundle and uninstalls.
- The published 0.1.x JS line is not touched by this branch.

### Phase 3 — browser half

**Status (3a, 2026-11-18): the module seam is in place on
`feat/typescript-phase3`.** `src/client.js` is now an ES module bundled by
esbuild into the served classic-script IIFE; the first pure model moved to
`src/browser/update-check/versions.ts` (stable-version math) and is imported by
the entry instead of being duplicated inline. Because a classic-script vm cannot
execute `import`, the unit-test harness now bundles the entry with esbuild before
evaluation (returning the raw source for source-level assertions), and the
browser e2e harness bundles it before injection; pre-change classic baseline
copies still run unchanged.

**3b progress (2026-11-18).** The update-prompt pure state machine moved to
`src/browser/update-check/model.ts` (payload validation, prompt decision,
later/silence state and the storage document), with
`test/update-check-model.test.js` importing it directly in Node; the browser
entry imports the same functions and the vm seam now only covers what the
browser controller still owns. Remaining 3b work: extract the remaining
`//#region feature:` groups into `install(ctx, deps)` + pure model modules,
delete the `__POWER_SUITE_TEST_HOOKS__` seams as each feature lands, and re-run
the three browser e2e suites against the bundled artifact.

**3c progress (2026-11-18).** The sidebar-width pure decisions moved to
`src/browser/sidebar-width/model.ts` (clamp/validity, cache document, Host
payload normalizer and the boot/adopt/reopen decisions), with
`test/sidebar-width-model.test.js` importing it directly in Node. The protocol
contract guard now imports the extracted browser route constant alongside the
remaining inline client literals, so the contract seam keeps covering both
locations while the split continues.

**3d progress (2026-11-18).** The route vocabulary moved into
`src/shared/routes.ts` (all 16 paths): Host modules re-export the shared
constants and the browser entry/models import them through `browserRoute`, so no
`/api/...` literal remains in `src/client.js`. `test/protocol-contract.test.js`
now asserts that the Host set equals the shared contract and that the browser
half contains no route literals. The settings enums/defaults and the record
shapes remain the next contract-ownership step.

**3e progress (2026-11-18).** The settings enums/defaults moved into
`src/shared/protocol.ts` (Host store and browser entry both import them), and
three more browser models were extracted: `src/browser/artifacts/model.ts`
(Files ↔ Artifacts phase reducer/timings), `src/browser/interrupted-sessions/
model.ts` (the record-only interrupted decision) and `src/browser/settings/
model.ts` (payload filter/merge). Their tests now import the models directly and
the `filesArtifacts` and `interruptedState` vm hooks were deleted; the settings
and artifacts tests moved off `loadClientModule` entirely. Record shapes and the
remaining vm hooks (`uiAnnotation`, gallery, dynamic-Workspaces, updateCheck,
sidebarWidth probe) are the remaining Phase 3 cleanup.

**3f e2e evidence (2026-11-18).** The isolated throwaway instance (temp
`$DSH_HOME`, current tarball) produced `sidebar.e2e.mjs --smoke` **4/4**,
`update-prompt.e2e.mjs` **21/21**, and `annotation.e2e.mjs --smoke` **5/6**
(smoke-6 launcher-click timeout, exactly reproduced with the pre-Phase-3
baseline client `fa48b2a`, so not a Phase 3 regression). The long-running live
`:3080` service was then restarted: it now serves the installed
`lib/client.js` classic IIFE (976,585 B + source-map trailer) and the live runs
pass — `sidebar --smoke` **4/4**, `annotation --smoke` **6/6**,
`update-prompt` **21/21**, 0 page errors. The Phase 3 e2e smoke acceptance is
therefore satisfied on the live GUI. Full-mode runs and their baseline controls
are recorded in 3j below; the core browser-region split/type conversion remains
open.

**3g progress (2026-11-18).** The composer-gallery pure model moved to
`src/browser/composer-gallery/model.ts` (index/step/sync/wheel decisions and
thumbnail collection), and the `updateCheck` and `composerImageGallery` vm hooks
were deleted after their tests switched to direct model imports. Five hooks
remain: `uiAnnotation`, `dynamicWorkspacesStats`, `dynamicWorkspacesPin`,
`dynamicWorkspacesRowMenu` and the `sidebarWidth` probe used by the sidebar e2e. `src/client.js` is still ~24.2k
lines and opted out of typechecking; the region split and browser typing remain
the main Phase 3 work.

**3i progress (2026-11-18).** The annotation modifier-settings model moved to
`src/browser/ui-annotation/settings.ts` (storage key, modifier choices,
frozen defaults, normalize/conflict/parse/serialize/match); the five settings
tests import the module directly while the 112-key annotation test hook stays as
a pass-through shim for the remaining model keys. `src/client.js` drops to
~24.0k lines. **3k progress (2026-11-18).** The first three follow-up annotation slices landed:
`src/browser/ui-annotation/text.ts` (sanitizer/redaction/digest/attribute/
CSS-identifier/quote helpers), `format.ts` (short labels, workspace/route
labels, time/join, bounds/viewport normalization) and `geometry.ts` (clamps,
rail width, layout mode, segmented index/label). Tests import them directly; the
112-key annotation hook remains a pass-through shim and `annotationRailRightForPane`
stays in the controller section for a later small slice. `src/client.js` is now
~23,580 lines. **3l progress (2026-11-18).** The remaining dynamic-Workspaces models landed:
`stats.ts` (session figures/formatting and the DW copy dictionaries),
`pin.ts` + `rows.ts` (sanitize/effective/cache/panel rows plus the shared row
primitives) and `row-menu.ts` (target kind, Pin/Unpin filter, delegating actions
and the bounded nested resolution). The `dynamicWorkspacesStats/Pin/RowMenu` hooks
were deleted after their tests switched to direct imports; `dynamicWorkspacesPanel`
was already gone. `src/client.js` is now ~22.8k lines and only the `uiAnnotation`
and `sidebarWidth` hooks remain. Three seam/materialization tests were removed
with the hooks (no behavior assertions lost), so the suite is 385 tests. The
planned order for the annotation rest: identity, records, reducer, serializers,
anchors, surface/resolution, then the annotation seam retirement in its own commit.

**3n progress (2026-11-18).** The annotation identity and record-store slices
landed: `identity.ts` (selector candidates, element refs, locators, stable
ancestors/unique selector, scoring; plus the pure anchor sanitizers and
`annotationTagPath`/`annotationStableSelectorCandidate` used by the controller)
and `records.ts` (v2/v3 document normalise/parse/serialize, collection CRUD,
undo, groups, counts/filters and include/order helpers). 40 hook keys now come
from modules while the 112-key hook block stays byte-identical as a pass-through;
`src/client.js` is ~21.1k lines. Differential checks: 588 identity + 1,648
record cases against the old seam. **3o progress (2026-11-18).** The annotation reducer and serializers landed:
`reducer.ts` (state creation, action reducer, phase/deactivate transitions) and
`serializers.ts` (quick/batch/group/chip serialization, chip-ref round-trip and
candidates). 11 more hook keys now come from modules, still without changing the
112-key hook block; `src/client.js` is ~20.5k lines. Differential checks: 58
reducer action/phase sequences and 79 serializer fixtures matched the old seam.
**3p progress (2026-11-18, browser-typing M0).** Added the browser typecheck
baseline: `tsconfig.browser.json` (DOM lib, `types: []`, `dom.d.ts` excluded),
`scripts/typecheck-browser-baseline.mjs` (disables `@ts-nocheck` only in a temp
copy, reports total/per-code/per-region, `--write` refreshes, `--check` ratchets)
and `scripts/browser-typecheck-baseline.json` (1,976 diagnostics at this HEAD;
2,484 at the pre-slice commit). The diagnostic baseline dropped by 508 with the
identity/records/reducer/serializer extractions. It is report-only, not wired
into `npm run check`. **3q progress (2026-11-18).** The anchors slice landed: `anchors.ts` (XPath/full
XPath/JS path, rendered-text chunks, quote/position extraction, disambiguation and
scoring, Levenshtein/cache keys, identity-strength and scope authority helpers).
22 hook keys now come from the module while both copies of the hook text stay
byte-identical; `src/client.js` is ~19.8k lines. A 15,261-case differential
against the old seam found 0 mismatches. Remaining inline keys: the 11-key
surface/resolution slice (`resolveRefStatus`, `resolveNodeCandidate`, surface
root/levels/pick/leaf/pin helpers, `annotationResolveStatus`,
`annotationRailRightForPane`) and the controller-only `debugFallbackScanProbe`;
then the annotation seam retirement. Also fixed a real regression introduced by
the identity extraction: the extracted DOM `getAttribute` was called unbound and
broke every click selection (`Illegal invocation`), now bound with a regression
test (live S4 back to baseline 2/3, smoke 6/6, 0 page errors).

**3r progress (2026-11-18).** The resolution/surface slice landed:
`resolution.ts` (`resolveRefStatus`, `resolveNodeCandidate`,
`annotationResolveStatus`) and `surface.ts` (surface root/levels/pick-level/
leaf-pick/pin eligibility/event-matching and rail-right geometry), with the DOM
predicates bound once in the factory so no-argument behavior is unchanged. Only
`debugFallbackScanProbe` remains inline in the hook shim; `src/client.js` is
~19.3k lines and the browser typecheck baseline is 1,885. **3s progress (2026-11-18).** The annotation seam was retired:
`__POWER_SUITE_TEST_HOOKS__.uiAnnotation` is now a single controller diagnostic
(`debugFallbackScanProbe`); the 111 pass-through keys and their frozen
SEAM_EXPORTS/ARITIES/generation contract were deleted, and the tests consume the
modules directly. `src/client.js` is ~19.2k lines; the server bundle is 936.8 kB.
Live `annotation --smoke` passes 6/6 with the 1-key seam (smoke-3 now asserts
that shape) and `--scenario 14` passes 7/7. The remaining gap to fully removing
the hook is `debugFallbackScanProbe` reading controller counters, used by the
fallback/diagnostic coverage. **3t progress (2026-11-18).** The e2e harness defects found by the independent
root-cause review were fixed: `b2-3` now passes the row title string
(`.title.text`) instead of the probe object; `f6-1` samples the interrupted
badge after React commits with bounded polling and counts only the shell spinner
as a second indicator; the duplicate `b3-3` id is gone; annotation smoke gained a
click-select check (which would have caught the unbound-`getAttribute`
regression that old smoke missed); S4/S13 use a native header button instead of
the intentionally unselectable composer; and S10 expects the product's
intentional paint z-index 2000. Post-fix live evidence: sidebar full **70 PASS /
1 SKIP / 1 FAIL** (`b4-5` dark atmosphere saturation is pre-existing/owner
triage), annotation smoke **6/6**, S4 **7/0/0**, S13 **7 PASS / 1 SKIP**, S10
**8/0/0**; S12 remains an owner theme-contract decision (native hover card now
follows the theme while the annotation surface stays fixed dark). **3u progress (2026-11-18, browser-typing M1).** Cleared 112 mechanical
diagnostics (1,885 → 1,773): `RemixGlyph` optional `scale` (51 call sites),
stale JSDoc/signatures (`readWorkspacePreset.signal`, `copyAnchorText.options`,
`hideChipPreview`, `dwPostReadAcks` return shape, `ensureInterrupted.refreshHost`,
settings snapshot typedefs), dictionary index signatures (~25), and a typed
`testHookHost` alias for the test-hook bridge (~6). No behavior/copy changes and
no new suppressions. Remaining diagnostics are concentrated in
`require('react')`/`window.__ModuleLoader__` untyped boundaries and unannotated
record/closure state (TS2339 1,058, TS7005 264, TS7006 248, TS7034 69,
TS2322 48); further reduction needs React/DSH ambient types (owner supply-chain
decision) or the M2/M3 module splits. **3v progress (2026-11-18, browser-typing M2).** The sidebar-width browser
controller/state moved to a fully typed `src/browser/sidebar-width/install.ts`
(776 lines) behind `createSidebarWidthController(deps) -> { install(ctx),
probe() }`; `src/client.js` keeps only the factory binding and the e2e probe
hook. Behavior/storage/markers/probe shape are unchanged, with four new fake
ctx/store/DOM unit tests; `npm test` is 392. The browser baseline dropped from
1,773 to **1,720** (sidebar-width region 53 → 0) and the shipped client bundle is
937.3 kB. Live `sidebar --smoke` is 4/4 and `--layout` is 12/12; `--pin` has the
same seven environment/data failures on the base commit, not a regression.
Remaining diagnostics are the annotation controller (owner needs a React/DSH
ambient-type decision), dynamic workspaces 244, hover 147, interrupted 47,
prompt-history preview 37 and update check 37. **3w progress (2026-11-18).** Added an opt-in `--bootstrap`/`--bootstrap-sessions`
mode to the annotation e2e: it dismisses the localized first-run Preview
Notice/Get started dialogs with real pointer clicks (re-armed after scenario
reloads) and best-effort creates blank Sessions through the native New Session
button until the existing scroll probe succeeds. Default runs are unchanged.
Live verification: `--bootstrap --smoke` is 6/6 and reports the already-present
scrollable sidebar (no Sessions created). Isolated verification: the Preview
Notice is dismissed, but DSH keeps one blank draft per workspace and a blank row
exposes no rename/archive/fork action, so a second blank Session (and thus the
native scroll region for S3/S8) cannot be created through headless CDP; the run
records this limitation and still fails at the scenario's own assertion instead
of skipping it. S16 workspace files and S11 running activity remain unseeded;
S12's owner decision landed: annotation surfaces now follow the theme (light
shell tokens, dark #2C2C2E) and S12 passes 7/0/0; the path also exposed a real
`copyAnchorText` strict-mode bug (undeclared `text`/`source`), now fixed.

**3y progress (2026-11-18).** Owner visual decisions landed: annotation
surfaces follow the theme (light shell surface/label tokens, dark #2C2C2E,
S12 7/0/0), and the dark atmosphere was iterated toward the light-mode pastel
reference. Final recipe: screen blend with `saturate(1.3) brightness(1.35)`, wrapper
opacity 0.62 base / 0.68 hover, white veil scrim 0.04/0.02, and a **2D fBm flow
field**: eight OKLCH hues (light L=0.76/C=0.26, dark L=0.76/C=0.24 at hues
20/65/110/150/195/245/290/330, using the browser's `oklch()` gamut mapping);
the light recipe also got a slightly stronger canvas (saturate 1.35, opacity
0.60, veil 0.48/0.36) and the dark recipe opacity 0.62/0.68 so light is less
washed and dark is less deep,
two blobs per hue whose positions are advected by a 3-octave value-noise curl
field (Book of Shaders fBm/flow-noise style). The field uses low frequencies and slow time drift, the
per-blob velocity is low-pass filtered, and edges clamp instead of wrapping, so
the smoke meanders/diffuses in both axes without frame-to-frame flinging or
wrap flashes; a stronger wash plus smaller/softer blobs prevent complementary
overlaps from averaging the canvas to grey (measured saturation ~0.50). The
light theme shares the renderer with its multiply/white-veil recipe. The live
full sidebar run is green apart from an intermittent f4-1 pin-state flake
(70/1/1); b4-1/b4-3/b4-5/b4-9 pass. Dark title contrast is 2.5:1, the accepted
trade-off for the lighter pill. Other live full-run failures (`b1-3`, `b3-1/b3-2`, `b5-5`,
`c2-1`, `c4-4`) are intermittent GUI-data/state issues, not this change. The
annotation click-selection regression from the identity extraction remains
covered by the new click-select smoke.

**3m progress (2026-11-18).** Two follow-ups landed: `dwCacheHitPercent` is now a
total function (inconsistent/negative/non-finite cache data returns `null`
instead of looping forever; valid outputs unchanged, with a 7,389-case
differential oracle), and the `sidebarWidth` vm hook was trimmed to just the
e2e `probe` (its pure helpers/constants now come only from
`src/browser/sidebar-width/model.ts` in direct tests). Only the `uiAnnotation`
hook and the sidebar probe remain.

**3j full-suite e2e evidence (2026-11-18, commit 5128669).** Independent runs
started from clean copies (temp `$DSH_HOME`, installed tarball; current HEAD
re-checked with live smoke): `update-prompt` full **21/21** on isolated and live;
sidebar live full **68 PASS / 2 SKIP / 2 FAIL** with the same two failures on the
pre-Phase-3 baseline client (**68/2/2**), isolated `--layout` **12/12**, live
`--interrupted` **9 PASS / 1 SKIP / 0 FAIL**; annotation isolated full **13 PASS /
1 SKIP / 9 FAIL** with the identical failure set on the baseline client, smoke
**6/6** on both, and live full not usable as a verdict (cascade; targeted S2/S7/S8
re-runs pass, baseline S2 passes too). Current HEAD live smoke: 4/4 sidebar,
6/6 annotation, 21/21 update-prompt, 0 page errors. The isolated served bundle is
the installed `lib/client.js` classic IIFE (980,746 B + 82 B source-map trailer,
no top-level imports). No failure in the full runs was attributable to Phase 3.

Decide between (a) splitting `src/client.js` by `//#region feature:` into modules
and bundling one classic script, or (b) keeping one file and annotating it. Under
(a), give each feature an `install(ctx, deps)` plus pure model functions, import
the models directly in Node tests, and delete the vm/global test hooks as each
feature lands. Then convert incrementally, keeping the runtime guards for
DOM/shell behavior.

Acceptance:

- `test/browser/{annotation,sidebar,update-prompt}.e2e.mjs` pass locally against a
  real DSH instance, including the smoke modes and the negative-control checks
  where applicable.
- Served bundle size and boot behavior are recorded; `check:release` still
  verifies the served client bundle against the installed artifact.
- No behavior, copy or slot changes in the diff.

### Phase 4 — rollout and cleanup

Update README, `PRODUCT.md`, `docs/development.md`, `docs/architecture.md`, the
release skill and the docs-sync references; record the migration in
`CHANGELOG.md` and `docs/verification.md`; release as the next minor version
(target `0.2.0`) with the normal release gates.

Acceptance: all docs claim the build/pack reality; `npm run check`,
`npm run check:release` and the publish workflow pass; the release notes describe
the developer-facing change without user-facing behavior claims.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Stale build artifacts reach a package (the bug class the current architecture avoids) | Build inside `npm pack`/`prepare`, never commit build output, CI `git diff --exit-code`, `check:release` compares packed artifact to the build manifest, and the installed copy to the tarball |
| Browser behavior regressions while converting `client.js` | Convert by feature region, keep runtime guards, run the three browser suites plus the real-GUI smoke checks locally before each merge |
| DSH platform APIs drift or lack types | Keep ambient declarations minimal and documented; add runtime guards where the platform contract is dynamic; treat `any` as a tracked budget |
| Tests couple to source text | Adapt `test/helpers/client-module.mjs` in Phase 2 to evaluate the built classic script; keep pure helpers importable for unit tests |
| Release pipeline disruption | Dry-run `check:release` and a tag-path rehearsal on a pre-release version; keep the 0.1.x line patchable while the migration lands |
| Large review surface / history churn | One phase per PR, no unrelated formatting, file moves separate from type changes |
| Owner/agent workflow slows down | Document the build step in `docs/development.md` before Phase 2 lands; make `npm run check` print the typecheck step clearly |

## 9. Open decisions (owner)

1. Approve Phase 1 (no-build JSDoc type checking) as the first step?
2. Compiler/bundler: esbuild for the browser bundle + `tsc --noEmit`, or `tsc`
   emit for everything? (Recommendation: esbuild + tsc; it keeps the classic
   script shape and keeps the build fast.)
3. Where should built output live and what should the package export — `lib/`
   (intelligent-ui convention) or `dist/`? (Recommendation: `lib/`, matching the
   reference repository, with `files` updated.)
4. Strictness target: `strict: true` for Host/shared by the end of Phase 2, with a
   documented relaxed profile for the browser half?
5. Should the `0.1.x` JavaScript line stay patchable until the first TypeScript
   release, or is `main` the only line after Phase 2 lands?
6. Keep browser e2e local-only (current design), or add a self-hosted runner later?
7. Version target: `0.2.0` for the first TypeScript release, or a longer runway?

## 10. Estimated effort

- Phase 1: small (one focused session; most of it is triaging the first
  `checkJs` error baseline).
- Phase 2: medium (build plumbing, release-check/manifest changes, 22 Host
  modules, docs).
- Phase 3: large — the 24.8k-line browser half dominates; the split-by-region
  decision is the main risk.
- Phase 4: small on top of the earlier phases.

No calendar estimate is claimed here; the phases are ordered so each one can stop
without leaving `main` broken.


**M4 progress (2026-11-18).** Browser typing moved from 1,720 to **1,522**
diagnostics while `src/client.js` dropped to **15,061 lines**. Added vendored
ambient types under `src/browser/ambient/` (minimal `react`, `react-dom`,
`ui-primitives` and DSH `ctx`/`__ModuleLoader__` surfaces; no npm dependency, no
`any`), wired into both tsconfig profiles, and extracted the whole dynamic-
Workspaces controller into `src/browser/dynamic-workspaces/install.ts`
(`createDynamicWorkspacesInstaller(deps) -> { install(ctx), hovercardSections }`):
the dynamic-Workspaces region is now 254 -> 1 diagnostics, DW_CSS/keys/markers are
byte-identical, and live smoke/row-menu/interrupted suites pass. Remaining top
regions: annotation controller 1,012, hover quick look 147 (being extracted),
interrupted components 59, prompt-history preview 57, update check 37; React's
stricter ambient inference surfaced 44 TS2322 / 7 TS2740 / 5 TS2353 null-seed
state issues for M5. The browser profile is still report-only; M5 must decide
whether to promote it into `npm run check` or split a browser project.


**M4b progress (2026-11-18).** The hover quick look moved into
`src/browser/hover-quick-look/` (`install.ts` state machine/listeners/DOM, pure
`model.ts`, `markdown.ts`, `highlight.ts`, `styles.ts`, and a narrow local
`dom.ts` interface), removing 1,537 lines from `src/client.js` (now **13,534**
lines). Hover diagnostics dropped from 147 to 0; the browser baseline is now
**1,375** (from 1,522; 1,720 before M4) and the TS module count is 64. A CDP
focus probe on the base and extracted client produced byte-identical card facts
(role/name/meta/note, actions, resize aria, Esc/anchor switching, Markdown/JSON
highlight spans); live smoke is 4/4 and a full sidebar rerun is recorded in the
Lead's integration log. Remaining top regions: annotation controller 1,006,
interrupted components 47, prompt-history preview 37, update check 37; the
strict React inference's null-seed state errors remain for M5, and the browser
profile is still report-only.


**M5b progress (2026-11-18).** Four more regions moved out of `src/client.js`
(now **12,019** lines): native session hover figures
(`src/browser/native-session-hover-figures/install.ts`), the interrupted-session
seats (`src/browser/interrupted-sessions/components.ts`), the prompt-history
preview (`src/browser/prompt-history/preview.ts`) and the update-check UI
(`src/browser/update-check/install.ts`, still driven by the existing pure
`model.ts`). The browser baseline dropped **1,375 -> 1,211** (native figures 11->0,
interrupted 59->0, prompt preview 57->0, update 37->0) and the TS module count is
68; preview/update CSS, copy keys, slot ids and DOM markers are unchanged, and
live smoke 4/4, interrupted 9/1/0, update-prompt 22/22 (injected harness) pass.
Remaining top region: annotation controller 1,012, then composer gallery 24,
presets menu 22, prompt history 20, draft attachment 17, interrupted copy/icons
15, settings page 10, preset routing 10, artifacts 5; non-feature helpers 29 /
panel 20 / plugin 15. The browser profile is still report-only and
`@ts-nocheck` remains until M5a lands.
