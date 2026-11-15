# Update notice

A DSH Power Suite feature: when a newer stable version of the bundle is
published on npm, the Web GUI shows a small card in the bottom-right corner of
the page with a one-click way to open the plugin page and let DSH update it.

The check is split between the two halves of the bundle: the **Host** reads the
npm `latest` dist-tag and the release notes pinned to that tag; a **browser**
controller asks the Host once per page load and renders the prompt. The prompt
is a `shell.overlay` seat — it never inserts a node into the sidebar, the
native `[role="tree"]`, or any other React-owned surface (the old sidebar-card
design is gone for good; see
[dynamic-workspaces.md](dynamic-workspaces.md) for the plugin that owns the
sidebar).

## What the user sees

After the page loads, the browser checks once in the background and — only when
a newer stable version exists — shows a card fixed in the bottom-right corner
(`width: min(360px, calc(100vw - 40px))`, elevation above the page, click-through
around the card):

- a layered brand mark (inline SVG, `currentColor`/theme tokens only) and the title **DSH 增强套件 有新版本可用**
  (English: "A new version of DSH Power Suite is available"; the card follows
  the active locale of the page);
- a monospace version line such as `0.1.0 → 0.2.0` — the running version and
  the npm `latest` version;
- the primary **更新** button, the secondary **下次再说** button, and the
  **查看更新内容 / 收起** text link;
- after three **下次再说** clicks (counted per version) an extra text link
  **不再提醒**;
- an expandable area with at most **6** release highlights, or the sentence
  **该版本未提供更新要点，可在插件详情页查看完整说明。** when the release notes
  carry none.

The card uses theme tokens only, follows light/dark mode, has no animation (so
there is no motion to reduce), keeps native `<button>`s and `role="region"` with
an `aria-label`, and falls back to the system `Canvas`/`ButtonText` colors under
forced colors. Escape or a click outside the card dismisses it exactly like
**下次再说**.

## When it appears, and when it stays silent

The trigger is **page load**, not polling:

1. the client `apply` schedules the check after **1.5 s**;
2. it requests `GET /api/power-suite.update?lang=<active locale id>`;
3. the card is rendered only when the response says `updateAvailable === true`
   and the Host-reported `latest` is a valid stable version.

Everything else is silent — no error message, no placeholder, no retry UI:
route missing (older Host, not yet reloaded), offline, timeout, `latest: null`
(registry failure), a pre-release `latest`, an unreadable running version, or
`current === latest`. A page checks at most once; the Host's 6-hour cache makes
most checks an in-memory hit. Switching the page language does not re-check;
the next page load asks for highlights in the then-active language.

Because the version comparison is strict, the **first public release (0.1.0) is
its own latest version**: installing 0.1.0 from npm never shows a prompt until
**0.2.0 is published**, at which point 0.1.0 installs see `0.1.0 → 0.2.0`
(exactly the example above). A `link:` install runs the local checkout, which
usually *is* the newest code — it normally gets no prompt, by design.

## Card actions

| Action | Behavior |
|---|---|
| **更新** | Calls `pluginNavigation.openBundle('@zephinel/dsh-power-suite')` to open the bundle's Plugin detail page; the actual install/update is performed by DSH's plugin manager, never by this plugin. The prompt closes but **no silence state is written**, so the next page load prompts again if the version still differs. When plugin navigation is unavailable the card stays open (it does not close silently). |
| **下次再说** | Closes the card and increments the per-version `laterClicks` counter; the next page load prompts again. After three clicks the **不再提醒** link appears. |
| **查看更新内容 / 收起** | Expands or collapses the highlight list in place; the card stays open. |
| **不再提醒** | Records `silencedVersion = <latest>`; that version is not prompted again. A *higher* version resets the situation: the prompt returns (with a fresh later-count). |
| **Escape / click outside** | Same as **下次再说** — close and count one more "later". |

A user action while a check is still in flight invalidates that check (the
response cannot re-open a card the user just dismissed). There is a single card
per page; no sidebar, toast, or badge is involved.

## Browser state

The prompt's state lives in browser `localStorage` under
`power-suite.update-prompt`, schema version 1:

```json
{ "schema": 1, "laterVersion": "0.2.0", "laterClicks": 1, "silencedVersion": "0.2.0" }
```

- `laterVersion` + `laterClicks` are the per-version "later" count;
  `silencedVersion` is the version the user silenced.
- Corrupt JSON, an unknown schema, or a non-object is treated as empty state —
  no migration, no error surface.
- If `localStorage` is unavailable (private mode, blocked storage), the state
  lives in memory for the page: counting and silence still work, nothing
  crashes.
- State is **per browser and per profile**: there is no Host-side storage and
  no cross-device sync. Another device or another browser prompts independently.
- When the route definitively answers "no update" (stable `latest` not newer
  than `current`), the stored state is cleared — after updating, the counters
  reset. When the registry read failed (`latest: null`), the state is kept, so
  one network hiccup does not throw away a silence or a count.

## Host route contract

`GET /api/power-suite.update?lang=<locale id>` — registered with
`ctx.connection.fetch.register`, so it sits behind the same browser
authentication and Host/Origin fence as the rest of the GUI. Responses are
`cache-control: no-store`; the route never answers 5xx.

```json
{
  "current": "0.1.0",
  "latest": "0.2.0",
  "updateAvailable": true,
  "highlights": ["更新要点 1", "更新要点 2"]
}
```

| Field | Meaning |
|---|---|
| `current` | The running `package.json` version when it is a stable version; `"0.0.0"` when it cannot be read (the client does not compare in that case). |
| `latest` | The npm `latest` dist-tag version when it is stable; `null` when the registry read failed or the tag points at a pre-release. |
| `updateAvailable` | `true` only when `latest` is stable, `current` is readable, and `latest > current`. |
| `highlights` | The first six bullets of the release notes' `## Highlights` for `latest` (plain text, inline Markdown removed); `[]` when the notes are missing or unreadable. |

The registry URL is derived from the running `package.json` `name`
(`https://registry.npmjs.org/@zephinel%2Fdsh-power-suite/latest`), and the
release-notes URL from its `repository` field. The Host needs outbound access
to **registry.npmjs.org** and **raw.githubusercontent.com**; when either is
unreachable the feature degrades to silence rather than an error. The Host
registers no service, writes no file, and logs nothing to a Session log.

### Cache and timeouts

| Case | Behavior |
|---|---|
| One registry or notes request | 5 s timeout (`AbortSignal.timeout`) |
| Success | Cached **6 h** |
| Registry failure (`latest: null`) | Cached **5 min**, then retried |
| Update exists but highlights could not be read | Cached **5 min**, then retried (CDN/tag timing should not leave the card without notes forever) |
| Language variants | Default and `en` notes are cached independently |
| Concurrency | Identical in-flight requests share one promise (no duplicate network calls) |

The cache is per Host process and shared by every browser page; a plugin
recompose starts a fresh cache.

## Version rules

- Only stable `x.y.z` versions are compared, matching `^(\d+)\.(\d+)\.(\d+)$`;
  `0.2.0-rc.1`, `0.2.0+build`, `latest`, tags, and ranges are never update
  targets.
- An unreadable or non-stable running version never prompts (no false
  positives).
- `current === latest` — the normal state right after a release — never
  prompts. `latest < current` (a rollback, or a checkout ahead of npm) never
  prompts either.
- If npm's `latest` dist-tag is ever moved to a pre-release, this feature stays
  silent; the release workflow publishes with `--tag latest --access public`,
  so that should not happen.

## Release-notes source

Highlights come from the repository itself, pinned to the published tag — not
from npm metadata:

```text
https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v<latest>/release-notes/<version>.md
https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v<latest>/release-notes/<version>.en.md   (en variant)
```

- The URL is derived from `package.json` `repository` (string,
  `git+https://…`, `git@github.com:…` and plain `github.com/…` forms are
  normalized); a non-GitHub repository has no highlights.
- The parser reads only the `## Highlights` section (up to the next heading),
  keeps its bullet list from `-`/`*`/`+` items, strips inline Markdown
  (links, bold/italic, code ticks), and caps the result at six items.
- For `en` the `.en.md` variant is preferred and the default file is the
  fallback; any other locale reads the default file. A missing notes file, a
  missing `## Highlights` section, or a failed fetch yields `[]` — the version
  prompt still works, it simply shows the "no highlights" sentence.
- The repository must stay **public**: a private repository makes the raw URL
  fail, and the card then has no highlights (but still offers **更新**).
- `release-notes/<version>.md` and its optional `.en.md` are committed **before**
  the `v<version>` tag is cut, and `npm run check:release-notes` validates that
  the current package version has a notes file with at least one highlight and
  that an existing `.en.md` has one too. See
  [development.md](development.md#release-flow) and the release skill
  (`.agents/skills/release-power-suite/SKILL.md`).

## Verification

- Node tests: `npm test` covers the Host version math, release-note parsing,
  cache/TTL/fallback behavior and the prompt state machine
  (`test/update-check.test.js`, `test/update-check-prompt.test.js`).
- Release gate: `npm run check:release-notes` (also part of `npm run check`)
  requires `release-notes/<version>.md` with reviewed Highlights.
- Live GUI harness: `node test/browser/update-prompt.e2e.mjs` opens the running
  GUI in a throwaway headless Chrome, stubs only
  `GET /api/power-suite.update` through the CDP Fetch domain, and drives the
  real card (show, details, later/silence, update navigation, silent failure
  paths). It needs the GUI running and a token URL (see its header).

## Limitations

- **Not published yet → silent.** Until `@zephinel/dsh-power-suite` exists on
  npm, the registry read 404s and the feature is invisible. The first release
  (0.1.0) is its own latest, so the prompt only starts reaching 0.1.0 installs
  after 0.2.0 ships.
- **No self-update.** The plugin never installs anything: **更新** only opens the
  Plugin detail page and DSH's plugin manager performs the update.
- **`link:` installs cannot update themselves.** A local checkout install has no
  "upgrade" action on the Plugin page and usually already runs the newest code;
  a prompt normally never appears there.
- **Per-browser state.** The later counter and the silenced version are browser
  `localStorage`; clearing site data, another browser, or another device starts
  from a clean prompt. There is no cross-device "already seen/silenced" sync.
- **Only Highlights are shown.** The card shows the six bullets of
  `## Highlights`; the full notes live in the repository/plugin page. Without
  the notes file the card still offers the update but explains that no
  highlights were provided.
- **Network-dependent.** The Host must reach `registry.npmjs.org` and
  `raw.githubusercontent.com`; a blocked network means no reminder at all (it
  fails silently by design and caches the failure briefly).
- **No settings switch.** There is no user setting to disable the check; the
  feature is part of the bundle. A user who does not want any reminder can
  **不再提醒** the current version (a newer version will still prompt).
