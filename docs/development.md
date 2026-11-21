# Development

## Prerequisites

- Node.js 22.18 or newer (the tests import the TypeScript Host sources through Node's native type stripping; CI runs on Node 22 and 24).
- npm — run `npm ci` once; it installs esbuild and TypeScript as dev dependencies.
- A DeepSeek Harness profile that can install local bundles (`web` by default).

`npm run typecheck:browser` typechecks the browser entry against a DOM-lib
profile and is gated at 0 by `npm run check` (together with the root strict
typecheck, the DOM-free `tsconfig.host.json` profile, the suppression-comment
scan and the built `lib/client.js` execution smoke). `npm run build` bundles `src/index.ts` (Host ESM) and the ES-module browser
entry `src/client.js` (plus `src/browser/`) into the gitignored `lib/` entries
with esbuild; the served client is a classic-script IIFE. The package has
no runtime dependencies; `npm pack` builds through `prepare`.

## Local install loop

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-power-suite
```

The installed bundle is `@zephinel/dsh-power-suite` (Loader row `power-suite`).
The profile keeps the package as a `link:` dependency, so the checkout itself is
the code the Host runs. After changing Host or browser code:

1. `npm run build`.
2. Reload the plugin (toggle it disabled/enabled in the Plugin list, or restart
   the Host process).
3. Reload the Web page for browser-code changes.

`lib/` is generated and gitignored; never commit it. `src/` is the source of
truth and stays repo-only.

## Checks

```bash
npm run build               # esbuild: src/ → gitignored lib/index.js + lib/client.js
npm test                    # node --test test/*.test.js: imports the .ts sources via Node >= 22.18 type stripping; no build
npm run typecheck           # tsc --noEmit: strict check over Host + browser TypeScript sources
npm run check               # build + syntax + typecheck + manifest + built-entry smoke + docs links + tests + release-notes gate, then pack:check
npm run pack:check          # npm pack --dry-run --json (prepare builds); inspect the published file list
npm run check:release-notes # release-notes Highlights for the current package version
npm run check:release       # build → pack → compare lib with the build, other files with the checkout → throwaway DSH_HOME install/boot/uninstall (needs dsh + pnpm; not in CI)
```

`npm run check` is the required gate before committing a functional change. CI
runs it on push and pull request. A docs-only change (CHANGELOG/PRODUCT/docs/`
`.agents`) skips the full gate and runs only `check:docs-links`, so it also skips
the typecheck. The release-notes gate runs inside `npm run check` and again in
the publish workflow.

`npm run check` reports an explicit-`any` budget for `src/**/*.ts` (currently 0
sites) and fails when an `any` token re-enters the code (comments and string
literals are stripped first, so aliases, unions and generics count). It is a
lexical tripwire, not a proof: implicit `any` is already covered by `strict`. DSH platform boundaries use `src/host/context.ts` (structural Host context,
including the opaque `FsTarget`/`FileInfo` shapes) and `src/host/errors.ts`
(unknown thrown values). `npm ci` installs esbuild, TypeScript and `@types/node` as dev dependencies;
`npm run build` emits only the gitignored `lib/` entries, and the typecheck
itself emits nothing. The browser entry is an ES module (`src/client.js` plus
`src/browser/`) that the build bundles into the classic script the shell loads;
it is now part of both typecheck gates — see
[the TypeScript migration plan](plans/typescript-migration.md). The unit-test
harness and the browser e2e harness bundle that ESM source with esbuild before
evaluating/injecting it.

## README screenshots and the Bento pipeline

The README images are composed Bento grids, not raw screenshots. Raw captures
stay local and gitignored; only the composed WebPs under `assets/` are
committed, and `assets` is part of the published package so the npm README can
load them.

1. **Capture the raw screenshots from an isolated DSH instance**, never from
   the production GUI. The temporary home has its own sessions, workspaces and
   credentials copy; only the README checkout is installed as a local bundle:

   ```bash
   DSH_HOME=/tmp/ps-readme-home dsh plugin --profile web add <checkout>
   DSH_HOME=/tmp/ps-readme-home dsh web --port 3199 --host 127.0.0.1 --no-open
   # keep the printed token URL in a chmod 600 /tmp file; never print or commit it
   URL="$(cat /tmp/ps-readme-home-url.txt)"
   node test/browser/sidebar.e2e.mjs --readme-chat      --url "$URL"
   node test/browser/sidebar.e2e.mjs --readme-dashboard --url "$URL"
   ```

   Both modes force `prefers-color-scheme: light`, use DPR 2 at a 1728×900
   viewport, dismiss the shell's first-run **Preview Notice** modal first (its
   backdrop silently blocks every pointer pose on a fresh `DSH_HOME`), and write
   their raws plus a `captures.json` manifest (source
   selector, crop rectangle, DPR, pose, masking state, privacy scan) to
   `.tmp-work/readme-shots/raw/`. `--readme-chat` creates a blank demo Session,
   sends a short generic prompt (e.g. a release checklist), waits for the real
   answer, captures the chat window + composer + prompt rail/search + hover
   preview, then annotates two or three real answer elements, captures the
   annotated page and the “Insert all into composer” state, and archives the
   demo Session. `--readme-dashboard` captures Workspaces, the Running & recent
   card, hover card, row menu, interrupted states, Artifacts (ten stubbed rows),
   Quick Look, filter and settings. The native add-workspace flow opens the
   browser File System Access directory picker and cannot run headlessly, so the
   isolated instance uses a single demo Workspace (`ps-readme-workspace`).

2. **Compose the Bento groups** (Chrome required; no network):

   ```bash
   npm run build:readme-bento     # or: node scripts/build-readme-bento.mjs
   ```

   `scripts/build-readme-bento.mjs` reads the raw files, builds one HTML grid per
   group on the pale-beige README canvas (`#f6f1e6`, warm-white `#fffdf8` tiles,
   18 px gutter, aspect-matched tiles), and captures each grid as a 1600 px
   WebP. It fails loudly on a missing source, refuses a cell whose crop no longer
   matches its tile (a raw capture whose shape changed after a sidebar-width or
   demo-data change names the cell instead of composing a cut-off image), and
   verifies that every output has the expected width/height:

   | Output | Group |
   |---|---|
   | `assets/readme-overview.webp` | 2×2 grid: Workspaces browser, the Running & recent panel, the native row menu and a row hover card |
   | `assets/readme-artifacts.webp` | Artifacts list (ten rows), Quick Look, source filter |
   | `assets/readme-composer.webp` | Main chat window (answer + composer + prompt rail) and the settings section |
   | `assets/readme-composer-gallery.webp` | Composer image gallery (`N / M` viewer over two pasted composer screenshots) |
   | `assets/readme-annotation.webp` | The Running & recent panel annotated in a demo session (compact marks + rail requirements; captured at 1728×1200 so the whole rail fits) |

   The annotation raws are captured at a taller 1728×1200 viewport so the
   whole rail is visible, and the hover-card/row-menu poses get extra padding
   so their popovers are never clipped. After composing and reviewing the
   images, tear the isolated instance down
   (`pkill -f "dsh web --port 3199"`; remove `/tmp/ps-readme-home`,
   `/tmp/ps-readme-home-url.txt`) — nothing from the production GUI is touched.

3. **Run the gates.** `README.md` links the five outputs by relative path, so
   `node scripts/check-docs-links.mjs` (also part of `npm run check`) fails until
   every composed file exists; re-run it after composing.

**Privacy rule.** The isolated instance contains only demo data, but the
dashboard mode still masks every visible title/path before the screenshot so a
round cannot depend on that: Session and card rows use
allowlisted demo titles, Workspace names and paths are replaced, hover-card and
conversation text uses canned demo lines, and the composer draft is empty. Each
crop region is then scanned for user paths, user names, URLs, tokens, the
checkout path and CJK characters; the scan result is logged in `captures.json`.
A crop that still contains private text must be fixed or dropped, never
committed. Raw captures, capture logs and the token stay out of git
(`.tmp-work/` is gitignored); committed files carry no token, cookie, full URL
or Session id.

## Release flow

The current published release on npm is **0.2.2** (first public release: 0.1.0
on 2026-11-17); `package.json` stays at `0.2.2` until the next release
preparation.
Tagging and publishing are separate, explicit approvals, and the full procedure
lives in the release skill
([`.agents/skills/release-power-suite/SKILL.md`](https://github.com/Zephinel/dsh-power-suite/blob/main/.agents/skills/release-power-suite/SKILL.md)).
The parts that touch this document:

**Trusted Publishing.** Publishing uses npm Trusted Publishing (OIDC +
provenance, configured for `Zephinel/dsh-power-suite` / `publish.yml` during the
0.1.0 bootstrap), so no npm token is stored in the repository or CI.

**A release:**

1. **Prepare (no tag yet).** Commit `release-notes/<version>.md` (and the
   optional `.en.md`) with a `## Highlights` section of 2–6 reviewed,
   user-facing bullets. Review the exact Highlights with the owner, then run
   `node scripts/release-notes-approval.mjs` and put the printed
   `Release-Notes-Review: sha256=<hash>` line in the release commit body — the
   publish workflow recomputes the hash from the tagged tree and refuses a
   missing, duplicated or mismatched approval. Move the current `## [Unreleased]` entries under
   `## [<version>] - <UTC date>` and leave an empty `## [Unreleased]`; the
   publish gate requires the dated heading. Run
   `node scripts/check-publish-manifest.mjs`. The in-app update notice reads the
   notes from the **tag-pinned** raw URL, so they must be committed before the
   tag.
2. **Gates.** `npm run check` (syntax, manifest, docs links, Node tests,
   release-notes gate), `npm run check:docs-links`,
   `node scripts/release-notes-approval.mjs --verify`, `npm run pack:check`,
   `npm run check:release` (pack → throwaway `$DSH_HOME` → isolated boot →
   byte identity → clean uninstall; needs `dsh` + `pnpm`, not in CI),
   `git diff --check`, a clean work tree, and the publish-manifest gate.
3. **Tag and publish.** Push the annotated `v<version>` tag; the tag-triggered
   `publish.yml` workflow re-runs the gates (including the notes-approval
   verification) and publishes through npm Trusted Publishing. Never run
   `npm publish` locally outside the bootstrap step above.
4. **Verify and finish.** After the workflow settles, verify the registry result:

   ```bash
   npm view @zephinel/dsh-power-suite version dist-tags --json --prefer-online
   curl -sS "https://registry.npmjs.org/@zephinel/dsh-power-suite/<version>"   # dist.attestations.provenance
   ```

   Optionally verify the signature from a temporary install with
   `npm audit signatures`. Then create the GitHub Release from the release
   notes, verify the tag-pinned raw notes URLs, and record the workflow run,
   registry version and provenance in [verification.md](verification.md).

Tag and CHANGELOG/GitHub Release dates use the **UTC** release date; normal
releases are stable semver with an annotated `v<version>` tag.

## Adding a feature

1. **Host side** — add `src/features/<name>/host.ts` exporting an
   `install<Name>(ctx)` function; create pure derivation helpers in sibling
   modules. Register routes, services, and events inside `ctx.effect`. Call the
   installer from `src/index.ts` and add any new service name to its `inject`
   union. Durable JSON documents go through `src/host/document-store.ts`; pass the
   document policy (decode/encode/clone/change rule) instead of writing files
   directly.
2. **Browser side** — put browser modules (including `copy.ts` for user-visible
   `en`/`zh` dictionaries) under `src/browser/<name>/` and wire its installer or
   `//#region feature: <name>` section in `src/client.js`; register it from `apply`.
3. **Routes** — keep them under `/api/<feature>.*` and behind
   `ctx.connection.fetch.register`; declare the path once in
   `src/shared/routes.ts` and re-export it from the Host module (the browser half
   imports it through `browserRoute`).
4. **Copy** — define the feature's `en`/`zh` dictionaries in
   `src/browser/<name>/` (for example `copy.ts`), register them with
   `ctx.locale.register(NS, { en, zh })` and bind with `ctx.locale.bind(NS)`;
   `locale/*.json` holds only the plugin's display metadata (title/description).
5. **Docs and tests** — add `docs/<name>.md` and a pure-logic test under
   `test/`.
6. **Verification** — run `npm run check` and update
   [verification.md](verification.md) when behavior changes. User-visible copy,
   settings or route changes also need the README and the feature page synced
   following
   [.agents/skills/sync-power-suite-docs/SKILL.md](https://github.com/Zephinel/dsh-power-suite/blob/main/.agents/skills/sync-power-suite-docs/SKILL.md).

## Git workflow

- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`).
- Keep `package.json` version and `CHANGELOG.md` in sync with behavior changes.
- Do not commit `node_modules`, logs, screenshots, or local `.tmp-*` directories.

## References

- [Architecture](architecture.md)
- [Feature inventory and addition recipe](overview.md)
- [Verification](verification.md)
- [Reference implementations for UI annotation](reference-libraries.md) —
  local XERJ corpus (`ui-annotation-refs`) + filtered source tree + full
  checkouts of DevTools/Playwright/Annotator for annotation work

## Community marketplace maintenance

- **Listing locations**: the bundle is published to npm and GitHub (DSH has no
  built-in official plugin marketplace; Discover only reads user-added index
  sources), and every market entry follows npm `latest`:
  - **awesome-dsh-plugin / dsh-market**: [awesome entry](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/Zephinel__dsh-power-suite.yml) · [listing page](https://awesome-dsh-plugin.com/p/Zephinel/dsh-power-suite/); dsh-market's catalog comes from awesome and syncs with it.
  - **Open Plugin Market**: [index entry](https://dshopen.org/plugins/@zephinel/dsh-power-suite/) ([dshopen.org](https://dshopen.org/)); the listing request is tracked in [dsh-plugin-index](https://github.com/polang233/dsh-plugin-index).
  - **bradeGithub/DSH-Plugins-Marketplace**: [repository](https://github.com/bradeGithub/DSH-Plugins-Marketplace), auto-indexed from the GitHub `dsh-plugin` topic.
- **Version updates**: publish production releases to npm's `latest` tag and
  confirm with `npm view @zephinel/dsh-power-suite dist-tags`. awesome /
  dsh-market associates the npm package whose `repository` points at this repo;
  Open Plugin Market follows `latest`. Each market refreshes on its own build
  schedule. Keep the npm package's `repository` pointing here and retain the
  GitHub `dsh-plugin` topic for automatic discovery.
- **Screenshots**: update `screenshots.json` and the corresponding images, then
  push to the default branch. Keep 1-8 screenshots with valid repository-relative
  paths; markets collect them on a later build, so no market PR or npm release is
  needed just for screenshots.
- **Listing corrections**: update the relevant market entry when the package
  name, repository URL or category changes, or the description becomes outdated.
  For awesome, edit only `data/plugins/Zephinel__dsh-power-suite.yml`; for Open
  Plugin Market, reply to the original listing request with the correction.
