# Development

## Prerequisites

- Node.js 22 or newer (CI uses Node 24).
- A DeepSeek Harness profile that can install local bundles (`web` by default).

There is **no build step**: `package.json` exports `src/index.js` and
`src/client.js` directly, and the package has no runtime dependencies.

## Local install loop

```text
plugin_manager action=install_bundle target=/Users/rexxin/Development/dsh-power-suite
```

The profile keeps the package as a `link:` dependency, so the checkout itself is
the code the Host runs. After changing Host code:

1. Reload the plugin (toggle it disabled/enabled in the Plugin list, or restart
   the Host process).
2. Reload the Web page for browser-code changes.

The plugin manages no build artifacts; nothing under `src/` is generated.

## Checks

```bash
npm test            # node --test test/*.test.js
npm run check       # node --check on entries and feature hosts, manifest/export checks, tests
npm run pack:check  # npm pack --dry-run --json; inspect the published file list
```

`npm run check` is the required gate before committing a functional change. CI
runs it on push and pull request.

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
4. **Copy** — add user-visible text to `locale/en.json` and `locale/zh.json`.
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
  local XERJ corpus + DevTools/Playwright/Annotator sources for annotation work
