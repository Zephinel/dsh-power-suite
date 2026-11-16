# Development

## Prerequisites

- Node.js 22 or newer (CI runs the gate on Node 22 and 24).
- A DeepSeek Harness profile that can install local bundles (`web` by default).

There is **no build step**: `package.json` exports `src/index.js` and
`src/client.js` directly, and the package has no runtime dependencies.

## Local install loop

```text
plugin_manager action=install_bundle target=/Users/rexxin/Development/dsh-power-suite
```

The installed bundle is `@zephinel/dsh-power-suite` (Loader row `power-suite`).
The profile keeps the package as a `link:` dependency, so the checkout itself is
the code the Host runs. After changing Host code:

1. Reload the plugin (toggle it disabled/enabled in the Plugin list, or restart
   the Host process).
2. Reload the Web page for browser-code changes.

The plugin manages no build artifacts; nothing under `src/` is generated.

## Checks

```bash
npm test                    # node --test test/*.test.js
npm run check               # syntax + manifest + tests + release-notes gate, then pack:check
npm run pack:check          # npm pack --dry-run --json; inspect the published file list
npm run check:release-notes # release-notes Highlights for the current package version
```

`npm run check` is the required gate before committing a functional change. CI
runs it on push and pull request. The release-notes gate runs inside
`npm run check` and again in the publish workflow.

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
   viewport, and write their raws plus a `captures.json` manifest (source
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
   WebP. It fails loudly on a missing source and verifies that every output has
   the expected width/height:

   | Output | Group |
   |---|---|
   | `assets/readme-overview.webp` | 2×2 grid: Workspaces browser, the Running & recent panel, the native row menu and a row hover card |
   | `assets/readme-artifacts.webp` | Artifacts list (ten rows), Quick Look, source filter |
   | `assets/readme-composer.webp` | Main chat window (answer + composer + prompt rail) and the settings section |
   | `assets/readme-annotation.webp` | The Running & recent panel annotated in a demo session (compact marks + rail requirements; captured at 1728×1200 so the whole rail fits) |

   The annotation raws are captured at a taller 1728×1200 viewport so the
   whole rail is visible, and the hover-card/row-menu poses get extra padding
   so their popovers are never clipped. After composing and reviewing the
   images, tear the isolated instance down
   (`pkill -f "dsh web --port 3199"`; remove `/tmp/ps-readme-home`,
   `/tmp/ps-readme-home-url.txt`) — nothing from the production GUI is touched.

3. **Run the gates.** `README.md` links the four outputs by relative path, so
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

The first public release is **0.1.0**; `package.json` is already at that version.
Tagging and publishing are separate, explicit approvals, and the full procedure
lives in the release skill
([`.agents/skills/release-power-suite/SKILL.md`](../.agents/skills/release-power-suite/SKILL.md)).
The parts that touch this document:

1. **Prepare (no tag yet).** Commit `release-notes/<version>.md` (and the
   optional `.en.md`) with a `## Highlights` section of 2–6 reviewed,
   user-facing bullets. Keep the release entries in `CHANGELOG.md` under
   `## [Unreleased]` for now — the publish gate accepts the version named there.
   Remove `"private": true` during preparation and run
   `node scripts/check-publish-manifest.mjs`. The in-app update notice reads the
   notes from the **tag-pinned** raw URL, so they must be committed before the
   tag.
2. **Gates.** `npm run check` (syntax, manifest, docs links, Node tests,
   release-notes gate), `npm run check:docs-links`, `npm run pack:check`,
   `git diff --check`, a clean work tree, and the publish-manifest gate.
3. **Tag and publish.** Push the annotated `v<version>` tag; the tag-triggered
   `publish.yml` workflow re-runs the gates and publishes through npm Trusted
   Publishing. Never run `npm publish` locally.
4. **After publishing.** Move the released entries to a dated
   `## [<version>] - <UTC date>` heading, create the GitHub Release from the
   release notes, and record the workflow run, registry version, and provenance
   in [verification.md](verification.md).

## Adding a feature

1. **Host side** — add `src/features/<name>/host.js` exporting an
   `install<Name>(ctx)` function; create pure derivation helpers in sibling
   modules. Register routes, services, and events inside `ctx.effect`. Call the
   installer from `src/index.js` and add any new service name to its `inject`
   union.
2. **Browser side** — add a `//#region feature: <name>` section to
   `src/client.js` with its slot components, guide card, and copy; register it
   from `apply`.
3. **Routes** — keep them under `/api/<feature>.*` and behind
   `ctx.connection.fetch.register`.
4. **Copy** — register the feature's dictionary inline in its client region with
   `ctx.locale.register(NS, { en, zh })` and bind it with `ctx.locale.bind(NS)`;
   `locale/*.json` holds only the plugin's display metadata (title/description).
5. **Docs and tests** — add `docs/<name>.md` and a pure-logic test under
   `test/`.
6. **Verification** — run `npm run check` and update
   [verification.md](verification.md) when behavior changes.

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
