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

1. **Capture the raw screenshots** from the live GUI in a throwaway headless
   Chrome (device scale factor 2, viewport 1728×900):

   ```bash
   node test/browser/sidebar.e2e.mjs --readme-shots
   ```

   The mode writes 11 PNG crops to `.tmp-work/readme-shots/raw/` plus a
   `captures.json` manifest that records each file's source selector, crop
   rectangle, device scale factor, pose, masking state and privacy-scan result.
   It also re-captures the five privacy-guarded `docs/assets/annotation-*.png`
   poses the annotation group composes from: the standalone refresh command
   `node test/browser/annotation.e2e.mjs --shots-only --assets` currently exits
   1 because the live composer region is pointer pass-through for that harness,
   so use the readme mode's `readme-annotation-assets` check instead. A capture
   run takes about two minutes.

2. **Compose the Bento groups** (Chrome required; no network):

   ```bash
   npm run build:readme-bento     # or: node scripts/build-readme-bento.mjs
   ```

   `scripts/build-readme-bento.mjs` reads the raw files, builds one HTML grid per
   group on the light README frame (`#f4f3f0`; set `README_BENTO_FRAME=dark` for
   the dark alternative), and captures each grid as a 1600 px WebP. It fails
   loudly on a missing source and verifies that every output has the expected
   width/height:

   | Output | Group |
   |---|---|
   | `assets/readme-overview.webp` | Workspaces browser, Running & recent card, native row menu, row hover card, interrupted row |
   | `assets/readme-artifacts.webp` | Artifacts panel, Quick Look, source filter |
   | `assets/readme-composer.webp` | Prompt-history rail, interrupted composer, suite settings |
   | `assets/readme-annotation.webp` | Annotation mode, collection rail, inserted composer reference chips |

3. **Run the gates.** `README.md` links the four outputs by relative path, so
   `node scripts/check-docs-links.mjs` (also part of `npm run check`) fails until
   every composed file exists; re-run it after composing.

**Privacy rule.** The captured page loads the user's real Host data, so every
capture is masked in the page before the screenshot: Session and card rows use
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
