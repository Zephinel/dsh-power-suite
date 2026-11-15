# Sidebar width

The Web GUI's left sidebar has a drag handle, but the shell
(`@deepseek-ai/dsh-client-ui-layout`) keeps the resulting width only in page
memory: a reload returns to the default 280 px, a new tab starts at the default,
and closing the sidebar forgets the dragged width. This feature makes the width a
durable, Host-owned preference — it survives reloads and new tabs, is shared by
every browser/device paired with the same Host, and reopening a collapsed sidebar
restores it. The same work removes the rainbow "atmosphere" flicker the
current-Session rows showed while the handle was being dragged.

## What changes

- The width you drag to comes back after a reload, in a new tab, and after the
  Host restarts, because the value lives in the Host's storage rather than in the
  page.
- Every browser using the same Host reads the same value; the last write wins.
- On a wide viewport, collapsing the sidebar never stores the collapsed state:
  expanding it restores the persisted width instead of the shell's 280 px
  default.
- Dragging the handle no longer blanks or strobes the rainbow atmosphere on the
  current Workspace/Session rows (see [The flicker fix](#the-flicker-fix)).
- There is nothing to configure: no new settings control, menu entry, or locale
  copy. Dragging the native handle is the only input, and the feature renders no
  UI of its own.

## How it works

### The Host document

The Host owns one durable JSON document under the suite's storage directory:

```text
$DSH_HOME/dsh-power-suite/sidebar-width.json
{
  "version": 1,
  "sidebarWidth": 320
}
```

- `sidebarWidth` is an integer inside the shell's own range, **264–420 px**, or
  `null` when no width has been stored yet.
- A missing, unreadable, malformed, unknown-version, or out-of-range document
  reads as the default (unset) document. A broken preference file cannot disable
  the feature.
- Writes are atomic (temporary sibling + rename, `0600`), serialized on one
  promise chain, and the in-memory value is published only after the rename.
  There is no revision or operation log: this is one scalar preference and the
  last write wins.
- The store loads lazily with a single flight (one promise serves concurrent
  callers), and a non-ENOENT read failure resets the cached promise and throws a
  typed error so a later call can retry after the disk recovers.

One authenticated route pair serves it, registered through
`ctx.connection.fetch.register` behind the same cookie and Host/Origin fence as
the rest of the GUI; every response is `no-store`:

- `GET /api/power-suite.sidebar-width` →
  `{ "version": 1, "sidebarWidth": 320 }` (`null` when unset). A read failure is
  `500 { code: "store-read-failed" }`.
- `POST /api/power-suite.sidebar-width` with `application/json` and exactly one
  field, `{ "sidebarWidth": 320 }` → validates, writes, returns the document.
  `415` for a non-JSON content type, `413` for a body over **1024 UTF-8 bytes**,
  `400` for invalid JSON or a missing/non-integer/out-of-range `sidebarWidth`
  (extra fields are rejected too, not ignored), and
  `500 { code: "store-read-failed" }` / `500 { code: "store-failed" }` when the
  document cannot be read or written.

This route is the feature's only Host addition: no new Host service and no change
to the entry's `inject` union.

### The browser half

The browser keeps a per-origin `localStorage` cache under
`power-suite.sidebar-width`:

```json
{ "version": 1, "sidebarWidth": 320, "pending": false }
```

`pending: true` means the local width has not been confirmed by the Host yet.

1. **Boot.** The cached width is read synchronously and applied through the
   shell's own layout action before first paint, so a repeat visit does not flash
   the default width. It is applied only when the current preference is not the
   collapsed `0`.
2. **Initial sync.** One sync runs asynchronously after attach: a pending cache
   is POSTed, otherwise the Host is GET; a Host width is adopted and cached. When
   the Host has no width, the local width is POSTed to seed the document. A
   network error, a missing route (404), or a 5xx keeps the cache, marks it
   pending, and retries later — never an error surface.
3. **Drag capture.** The feature subscribes to the shell's layout store. A change
   to a positive width that differs from the last persisted value is debounced
   **300 ms**, then written to the cache with `pending: true` and POSTed; a
   successful POST clears `pending`. Values the feature itself applied are
   ignored, so adopting a remote width does not echo back as a write.
4. **Sync refresh.** `focus`, `visibilitychange` (to visible), and a **30 s**
   retry interval while a write is pending each run one sync (POST while pending,
   otherwise GET). A remote width is adopted only while the sidebar is expanded
   (the preference is not `0`) and no drag is in progress; otherwise it is
   remembered and applied on the next clean transition. Last write wins; there is
   no merge UI.
5. **Never `0`.** On a wide viewport the shell's close action writes the transient
   collapsed `0` preference; the feature never stores that value in the cache or
   the Host document. In the shell's narrow-viewport mode the preference is kept
   and only a presentation override changes, so nothing is written either.

### The layout-store seat

The shell package exposes no public "persisted sidebar width" API and the feature
does not patch it. The layout plugin seats its shared layout store handle on its
`root` slot registration; the feature finds that registration, takes the handle,
and uses the same three calls the native drag handle uses:
`getSnapshot().layoutInfo.sidebar` (current px, `0` = collapsed),
`actions.setSidebar(px)` (the shell's write path, which clamps to 264–420), and
`subscribe(fn)`. Attachment is retried briefly — once immediately, then on
`root` slot changes plus timers at 250, 1000, and 2000 ms until it gives up after
about 5 s — and every listener, subscription, and timer is removed by the
plugin's disposer.

If no compatible store can be attached, the feature stays **inert**: it reads and
writes nothing, reports `attached: false` through its test seam, and the sidebar
keeps the shell's in-memory behavior. After attaching, a render-frame self-check
on a wide viewport (where the rendered sidebar column should equal the applied
preference, ±1 px) drops back to inert without throwing when they disagree, so a
shell change surfaces as a missing feature rather than a wrong width.

## Interactions

### Dragging the handle

A drag is still handled entirely by the shell; the feature only observes the
store. Each drag frame updates the shell's width, and 300 ms after the last change
the final value is cached and POSTed. After a reload the cached (or Host) width is
applied before the first paint, so a stored 320 px sidebar does not flash at
280 px and then jump.

### Collapsing and reopening

On a wide viewport the shell's native toggle writes `0` on close and `280` on
reopen — the close deliberately forgets the dragged width. The feature never
persists `0`. When it observes a `0 → positive` transition that is not a real drag
(it skips frames carrying the shell's `data-dragging` marker), it re-applies the
persisted width — for example 320 px — instead of accepting the native 280 px, then
syncs. A real drag is never fought, so dragging immediately after reopening still
sets a new width.

### Narrow viewport and drawer

Below **1024 px** the shell auto-collapses the sidebar to its rail, and below
**768 px** it presents the sidebar as a drawer. These are presentation states:
the shell toggles its own `narrowExpanded` override and leaves the width
preference alone, so no width is written from a collapsed narrow viewport and the
stored value comes back when the sidebar is expanded again (the shell clamps it to
264–420). The drawer renders no drag handle, so the width cannot be changed while
the sidebar is a drawer; in the rail's manually expanded state the handle is
available and a drag persists normally. A remote change that arrives while the
sidebar is collapsed is remembered and applied on the next clean transition, not
lost.

### Paired devices

The Host document lives under `$DSH_HOME/dsh-power-suite`, so every browser and
profile using that home — that is, every paired device — shares one width. A
device adopts the Host value during its initial sync; a page that is already open
picks up a change from another device on its next sync (a focus or visibility
change, or its pending retry). There is no live push: two side-by-side windows
converge when one of them is refocused or reloaded.

## The flicker fix

The rainbow atmosphere is a Canvas 2D renderer (`dwAtmosphereMount()` in
[`src/client.js`](../src/client.js)) whose backing store is resized from a
`ResizeObserver`. Assigning `canvas.width`/`canvas.height` clears the bitmap, and
during a sidebar drag the row's box changes size on every frame, so the observer
cleared the canvas every frame while the animation loop repainted only on its
**33 ms** throttle — the row showed transparent frames and the rainbow appeared to
strobe. The renderer now reports whether a resize actually changed the backing
store, repaints synchronously in the observer callback after a real size change
(same task, before the browser paints, regardless of reduced motion), and paints
one frame synchronously at mount before the animation loop starts. The 33 ms
throttle still governs steady-state animation; only real resizes force an
immediate repaint, so dragging the sidebar no longer flickers the highlight. See
the atmosphere section of [dynamic-workspaces.md](dynamic-workspaces.md).

## Verification

```bash
node --test test/sidebar-width.test.js
node --test test/sidebar-width-client.test.js
node test/browser/sidebar.e2e.mjs --layout
```

- `test/sidebar-width.test.js` covers the Host half: document parsing and
  serialization (default, malformed, out-of-range, round-trip), atomic persistence
  and reload, concurrent writes, the typed read failure with retry, and the route
  contract (methods, GET/POST bodies, and the `415`/`413`/`400`/`500` paths).
- `test/sidebar-width-client.test.js` covers the browser half's pure helpers
  through the client-module test seam — range/validity boundaries, cache
  parse/serialize, payload normalization, and the bootstrap/adopt decisions — with
  no DOM required.
- `node test/browser/sidebar.e2e.mjs --layout` is the live harness for the
  behavior: it drives a throwaway headless Chrome against the running GUI with this
  worktree's `client.js` injected, performs a real CDP drag of the sidebar handle,
  and checks the flicker oracle (stable canvas identity, an observed backing-store
  resize, and non-blank pixels at every drag sample), the post-drag cache and seam
  probe, persistence across a reload, the Host route and a second fresh browser
  profile adopting the width, with an explicit SKIP row while the Host route is
  absent before the service restart.

Both `node --test` suites run under `npm test` (`node --test test/*.test.js`).
These commands are the feature's evidence path; the measured acceptance is
summarized below and recorded in full in [verification.md](verification.md).

### Measured acceptance (2026-11-15)

- Environment: Node **v24.22.3**, headless Chrome **157.0.8103.79**, viewport
  **1728×900**, throwaway profile; injected `src/client.js` md5
  **`40e53d31744576696332e8ca73914e20`** (1,218,053 chars / 1,223,244 bytes).
- `npm test`: **336/336 pass**, including the Host suite (**17/17**) and
  browser-helper suite (**8/8**); `npm run check`: **exit 0** (`entryCount` 88).
- `node test/browser/sidebar.e2e.mjs --layout`: **exit 0, PASS 10 / SKIP 1 /
  FAIL 0**, 0 page errors, 0 real network failures, **11.9 s**. Drag 280→320 px:
  handle/column measured at 280 px, both atmosphere canvases painted (258×34,
  258×32), the flicker oracle observed **9 per-step + 20 in-frame** backing-store
  resizes with **0 blank samples** (0/10 per-step, 0/22 in-frame), the cache held
  `{"version":1,"sidebarWidth":320,"pending":true}`, a reload restored 320 px,
  and cleanup returned the width to 280 px.
- `lw-6` is an explicit **SKIP**: `GET /api/power-suite.sidebar-width` answered
  **404** because the running Host predates the merged plugin, so the Host
  round-trip and second-profile adoption are a post-restart re-run; the
  per-origin cache is authoritative until then.
- Negative control: the same mode against the pre-fix client **fails `lw-3`** on
  blank samples while every other row stays green, so the oracle discriminates.
  `--smoke`: **4/4 pass**, exit 0, **5.5 s**.

## Limitations

- **The layout-store seat is private.** The feature attaches to the shared handle
  that `@deepseek-ai/dsh-client-ui-layout@0.2.2-rc.1` seats on its `root` slot
  registration; that seat is not a public width API. If a DSH upgrade changes the
  package version or the seat shape (no store handle, `create()`, `layoutInfo`, or
  `actions.setSidebar`), the feature stays inert instead of patching the shell, and
  the sidebar returns to the shell's in-memory behavior. A DSH update that ships a
  new layout package needs the feature re-checked.
- **Before the Host restarts, the browser cache is the authority.** The route only
  exists after the Host half of the plugin is reloaded. Until then the page is
  local-only per origin: the cache still applies on boot and survives a reload, but
  nothing is shared with other devices and the write stays pending until a later
  sync succeeds. A missing route is treated as "not ready yet", not as an error.
- **The cache is per origin.** `localStorage` is scoped to scheme + host + port,
  so two addresses for the same Host (for example an IP versus a hostname, or HTTP
  versus HTTPS) each keep their own cache. They converge through the Host document
  during later syncs; a page that has never had the route available can show a
  different width until it does.
- **Last write wins, with no conflict UI.** The document is one scalar; concurrent
  writes from two devices resolve to whichever POST reaches the Host last. There
  is no merge, revision history, or prompt, and a remote width is not adopted
  mid-drag or while collapsed — it is applied on the next clean transition. A tab
  that keeps dragging while another device writes can therefore overwrite the
  newer value.
- **Collapsed is never persisted.** On a wide viewport the shell writes the
  transient `0` preference when the sidebar closes; the document keeps the last
  expanded width, and reopening re-applies it instead of the native 280 px. In the
  shell's narrow-viewport mode only a presentation override changes (the rail
  below 1024 px, the drawer below 768 px), so the stored width is untouched; the
  drawer renders no drag handle, so the width cannot be changed there. `0` is
  never written from any of these states.
- **No setting and no UI.** The feature contributes no settings row, menu entry,
  badge, or copy; width is changed only by dragging the native handle.
