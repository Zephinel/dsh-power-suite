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
  tracked budget (`npm run check` prints 335 sites). This closes Phase 2.

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
