# Codebase design review — deep modules and seams

Status: **proposed analysis (as-planned)** — 2026-11-18. Companion to
[the TypeScript migration plan](typescript-migration.md); this document records a
deep-module review of the current tree and the design constraints it adds to the
migration. It changes no code.

## 1. Scope and method

The review maps the current code as **modules** (an interface plus an
implementation) and judges **depth** (leverage at the interface), the **seam**
where each interface lives, and which things are **adapters**. The practical tests
used:

- **Deletion test**: if deleting the module spreads its complexity across N
  callers, it earns its keep; if complexity vanishes, it is a pass-through.
- **Interface is the test surface**: callers and tests cross the same seam. A
  test-only global or a text harness is evidence that the module has no interface
  yet.
- **Two adapters = a real seam**: do not introduce a port for something that never
  varies.

## 2. Module map and depth assessment

| Module | Interface callers/tests must know | Implementation | Depth | Seam |
| --- | --- | --- | --- | --- |
| Host composition entry (`apply` in `src/index.ts`) | `apply(ctx)` | calls 10 feature installers inside one plugin lifetime | deep enough | DSH Host composition |
| Feature installers (`install<Feature>(ctx, options?)`, 10) | one function + services they rely on | routes, stores, events, SSE, caches | deep | DSH `ctx` (platform port) |
| Durable document stores (6): settings, read-acks, session-pins, session-activity, sidebar-width, workspace-presets | per-store constants, parse/serialize, `create<Store>Store(dshHome)` returning read/update/flush/dispose | file envelope, version, caps, merge policy, atomic temp-rename, 0600, read-merge-write queue | each store is deep, but the durable mechanism is **duplicated 6 times** | profile filesystem |
| Host HTTP routes (16) | method, path, request body shape, response shape, error codes | per-feature handlers | medium | authenticated `connection.fetch` |
| Cross-half contract (routes, settings enums, record shapes) | the JSON on the wire and the localStorage documents | nothing owns it — declared in a Host constants module and again as literals in `src/client.js` | **shallow / no owner** | HTTP + browser storage, declared twice |
| Browser half (`src/client.js`) | 14 slot registrations, 9 locale namespaces and the fetch route literals | 24.8k-line classic script; feature regions are comments, not modules | external interface is the platform's; internal locality is poor | DSH browser module loader |
| Client test adapter (`test/helpers/client-module.mjs`) | `vm` sandbox options and `sourcePath` | reads the source text, stubs the browser | test adapter, not product | test-only |
| Update checker (`src/features/update-check/checker.ts`) | injectable `fetch`, cache and release-note rules | registry/raw fetches, stable-version comparison, caches, six-highlight cap | deep | true-external (npm registry / raw GitHub) |

## 3. Findings

### F1. Host composition is already deep; leave it alone

The ten `install<Feature>(ctx, options?)` functions are adapters at one platform
seam. The deletion test is decisive: deleting an installer would move its wiring
into `apply`, or its logic into unrelated features. Keep the `install<Feature>`
interface as the per-feature seam; do not wrap it further. The migration should
type this interface, not redesign it.

### F2. The deepest missing module is the durable document mechanism

Six stores independently implement the same contract: `mkdir`, read, parse
envelope, merge/patch, cap, serialize, write a 0600 temporary sibling, rename it
over the target, serialise writes on one chain, and wrap read failures in a
feature-specific error code. Six adapters at the same seam means the seam is
real. The repeated mechanism is a single **implementation** looking for a module:

```
createDocumentStore({ file, version, decode, encode, empty, merge?, cap? })
  read()       → decoded document (empty on missing/unreadable)
  update(fn)   → read-modify-write through the queue, returns the next document
  flush()      → await queued writes
  dispose()    → final flush and detach
```

The module would own atomicity, file mode, temp cleanup, the write queue, the
version envelope and read-error wrapping. Each store becomes a small **adapter**
supplying only its feature policy (document shape, merge/cap rules, error code).
Debounce (the activity ledger's 750 ms) should stay in the activity adapter unless
a second adapter needs it — otherwise the interface becomes a config bag.

Deletion test: deleting the shared module would re-spread the durability contract
across all six adapters, which is exactly the current duplication. Depth earned.
Test surface: the shared module's interface plus one policy test per adapter;
replace the duplicated atomic-write tests instead of layering new ones on top.

**Landed in Phase 2b.** `src/host/document-store.ts` implements the interface
(`get`/`update`/`flush`, with decode/encode/merge/read-error/clone policy), the
five simple stores are adapters over it, and `test/document-store.test.js` tests
the module interface while the existing store suites keep covering adapter
policy. The activity ledger keeps its debounced, event-merging write path.

### F3. The cross-half contract has no owning module

Sixteen Host route paths are declared as exported constants on the Host side and
again as string literals in `src/client.js`
(`api/power-suite.settings`, `api/power-suite.read-acks`,
`api/session-artifacts.*`, `api/workspace-presets.*`, …). The settings enums and
defaults are duplicated the same way (`PROMPT_HISTORY_MODIFIERS`,
`RECENT_SESSION_MINUTES`, `ACTIVE_PROJECT_DAYS`, `DEFAULT_SETTINGS`). The record
shapes (annotation v2, artifact rows, settings document) are only described in
docs, so nothing mechanically holds the two halves together.

Proposed target: a **shared protocol module** (importable by both halves once the
build exists) that owns route constants, request/response shapes and the settings
enums/defaults. Its interface is small — constants, types, a few decoders — and
its implementation hides the wire vocabulary. It is **not** a generic fetch
wrapper: wrapping `connection.fetch` would be a pass-through module at the
transport seam, which is already an adapter.

Until the build exists, a flat contract test reads the Host exports and asserts
the client source matches them exactly — Phase 1 landed that guard in
`test/protocol-contract.test.js`; it is shallow on purpose and documents the
seam to deepen later.

**Phase 3d status.** The route half of this target landed: `src/shared/routes.ts`
owns all 16 paths, both halves import it, and the contract test rejects route
literals on either side. The settings enums/defaults also moved into `src/shared/protocol.ts` (Phase 3e),
so both halves now read one table. The record shapes remain the next deepening
step.

### F4. The browser half exposes a test seam instead of an interface

Ten test files load `src/client.js` through a `node:vm` sandbox, and the script
exposes per-feature objects on a global `__POWER_SUITE_TEST_HOOKS__` for them.
Callers and tests therefore cross different seams: the DSH loader at runtime, a
test-only global for unit tests. Those tests read the implementation and would
break on an internal refactor — the definition of testing past the interface.

Proposed target per feature:

```
create<Feature>Model({ sessions, remote, storage, fetch, navigation })
install<Feature>(ctx, deps)   // registration and UI only
```

The model functions stay pure and are imported directly by Node tests; `deps` is
the port for the DSH browser surface (slots, locale, connection, remotes,
navigation), with the production adapter being the real `ctx` and the test
adapter being a plain object. The UI/e2e suites remain the tests at the UI seam;
the global test hooks are deleted once the module imports land.

This split needs ES modules in the browser half, which the current classic-script
entry cannot provide — it is therefore gated on the build phase, not on the
type-checking phase.

### F5. Do not add shallow abstractions while doing this

- No generic route-registration wrapper: `install<Feature>` already owns that
  seam.
- No config-bag "base store": the shared module must own behavior, with adapters
  supplying only document policy.
- No port for a single implementation. `connection.fetch`, the npm registry and
  the raw-notes fetch already have test adapters; everything else stays a direct
  call.
- No splitting `src/client.js` only for file size: split at the feature interface
  so tests and callers gain a seam.

## 4. Target seam map

```
DSH Host composition (ctx)
  └─ install<Feature>(ctx, options?)        per-feature adapter (keep)
       └─ document-store module             shared durability (new)
            └─ per-document adapters        settings / acks / pins / activity / width / presets

authenticated connection (HTTP)
  ├─ shared protocol module                 routes, payloads, settings enums (new)
  └─ Host route handlers / client fetchers  adapters on both sides

DSH browser module loader
  └─ bundled classic entry (thin)           registration only
       └─ per-feature modules               model + install(ctx, deps) (new)
            └─ DSH surface adapter          slots, locale, connection, remotes, navigation
```

## 5. Consequences for the migration phases

[The TypeScript migration plan](typescript-migration.md) is updated to follow
this ordering; the design changes it in three places:

1. **Phase 1 (no-build typecheck)** additionally lands the settings/protocol
   typedefs and the shallow contract guard for duplicated route/enum literals.
   The document-store interface is designed here, not extracted yet.
2. **Phase 2 (build + Host TypeScript)** extracts the document-store module in
   plain JS first, proves behavior parity through its interface, and only then
   converts the stores to `.ts`. Trying to type the six duplicated stores first
   would fossilise the duplication.
3. **Phase 3 (browser half)** splits by feature interface and replaces the vm +
   global-hook test seam with module imports before annotating the UI code.

## 6. Open design questions

1. Does the document-store interface include an optional debounce, or does each
   adapter own its timer? (Recommendation: adapter-owned until a second adapter
   needs it, so the interface stays behavioral.)
2. Is the sidebar-width document worth an adapter on the shared store, or is a
   bespoke small store clearer? (The durability mechanism is identical; keep the
   adapter and let the policy be trivial.)
3. Where does the shared protocol module live before the build makes it importable
   by the browser half — `src/shared/protocol.ts` with a Node-side contract test,
   or host-only constants plus the guard test?
4. Do per-feature client modules expose a single `install(ctx, deps)` plus pure
   model functions, or one module per slot registration? (Recommendation: one per
   feature; slots stay an implementation detail.)
5. Are the global test hooks kept during Phase 3 as a transition aid, or deleted
   feature-by-feature as each model module lands?

## 7. References

- [TypeScript migration plan](typescript-migration.md)
- [Architecture](../architecture.md) — the current Host/browser module map.
- [Development](../development.md) — the feature recipe and checks.
- Store implementations: [`settings/store.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/settings/store.ts),
  [`read-acks/store.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/read-acks/store.ts),
  [`session-pins/store.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/session-pins/store.ts),
  [`session-activity/store.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/session-activity/store.ts),
  [`sidebar-width/store.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/sidebar-width/store.ts),
  [`workspace-presets/store.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/workspace-presets/store.ts).
- Browser half and its test seam: [`src/client.js`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/client.js),
  [`test/helpers/client-module.mjs`](https://github.com/Zephinel/dsh-power-suite/blob/main/test/helpers/client-module.mjs).
