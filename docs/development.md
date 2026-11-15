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
