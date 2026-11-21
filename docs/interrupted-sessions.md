# Interrupted sessions

Tasks that did not finish — cut off by a Host restart/crash, or stopped by a
provider/model/network error, a quota/timeout, or an output-token ceiling — are
marked in the sidebar and can be continued without hunting for the right
message.

## What the user sees

- An **amber warning mark** sits left of the Session title, in the row's status
  cell, and stays visible by default.
- **Hovering** the row keeps the shell's normal hover surface — the title stays
  visible and the native trailing actions replace the time, exactly as on any
  Session row — and reveals an inline **Continue** triangle immediately right of
  the warning mark. The native status cell widens to hold the mark plus the
  triangle, so the title slides right by the triangle's width instead of being
  covered by a mask (the old opaque hover mask was left over from the retired
  trailing-edge CTA and erased the title and time). The mark, the triangle and
  the native actions use theme tokens, so they follow light and dark mode.
- Opening that Session turns the composer's send control into a **play triangle**
  (`play-fill`). Pressing it with an empty draft continues the unfinished task;
  typing a draft first sends that draft normally instead.
- Continuing is **implicit**: it does not add a user bubble to the transcript.
  The browser asks the Host to start the next turn with a non-human context
  source; the plugin hides the native context/trigger row correlated with that
  request, and clears the mark while the new turn starts.

## When a Session counts as interrupted

The Host folds the Session's last turn and marks it when the turn did not
finish:

- the last `turn/end` reason is `interrupted` (crash recovery closes a tail turn
  with that reason),
- the last `turn/end` reason is `aborted` with the `disposed` cancellation cause
  (a graceful Host shutdown, such as a restart, closes the live turn that way)
  or the `legacy` cause (an imported record with no recoverable cause),
- the last `turn/end` reason is `error` — **any** provider/model/network error,
  including quota/usage limits, request timeouts, transport failures, rate
  limits and malformed responses,
- the last `turn/end` reason is `max-tokens` (a step hit its output ceiling), or
- the last turn is still open and its Agent is **not** running (a raw crash tail
  before recovery).

A Session whose own Agent is running is never marked; a delegated child that is
still running does not count as the Session's own running state (see the
delegated-subagent sections below). Deliberate endings are not marked: a
completed turn, a user/parent/hook cancellation (`aborted` with those causes), a
`blocked` turn (a pre-step hook rejected it), a `forked` synthetic boundary, or
a Session with no turns.
Only the **last** turn matters: continuing the task starts a new turn, so the
previous stop stops counting immediately. Continue is a retry, not a guarantee:
if the underlying cause persists (still no credentials, still over the context
limit, still rate-limited) the new turn can fail again with the same mark.

## How it is wired

Host:

- `GET /api/power-suite.interrupted?sessionId=<id>` — returns
  `{ sessionId, interrupted, running, turn, reason, open }` for one Session.
  It reads the Session log through `ctx.sessionQuery.readSession()` on the first
  ask and caches the answer per Session; `session/event` `turn/start` and
  `turn/end` events keep the cache current and an event epoch prevents a slow
  read from caching an older snapshot over a newer event. `&refresh=1` recomputes.
- `GET /api/power-suite.interrupted-events` — an authenticated Server-Sent
  Events stream. It sends `event: interrupted` frames only on Session
  `turn/start` / `turn/end` boundaries, with
  `{sessionId, parentSession, event}`; it starts with `retry: 10000`, sends a
  `: ping` heartbeat every 25 s, and cleans each connection up on abort,
  cancellation, enqueue failure or Host disposal.
- `POST /api/power-suite.continue` — admits one implicit continuation after
  checking JSON content type, the Session's current interruption state, and a
  per-Session in-flight lock; duplicate requests get `409`.
- Registered in [`src/features/interrupted-sessions/host.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/interrupted-sessions/host.ts);
  the pure fold lives in [`turns.ts`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/features/interrupted-sessions/turns.ts).

Browser:

- `sidebar.session.row.leading` — the default-visible warning mark for idle rows
  plus the hover/focus-revealed inline Continue triangle. The native status cell
  is `width: auto` for this row, so the 22 px triangle fits and the title slides
  right; no opaque hover mask is painted. The native row is the only hover
  surface: Continue lifts its glyph colour but paints no block of its own (same
  rule as the Running & recent card), and its glyph is pointer-transparent so a
  UI annotation pick lands on the labelled button instead of the anonymous icon.
  The warning mark itself stays `pointer-events: none` on purpose — it must not
  intercept the native row's click — so annotating that leading area anchors on
  the native row, and the mark legitimately disappears when the interruption
  clears.
- A row decorator covers rows whose native status still says running: it places
  the warning **and** its hover Continue CTA in the native leading span
  (skipping the injected rainbow atmosphere wrapper) and hides the stale
  spinner. The CTA runs the same Continue handshake as the idle-row seat — it
  opens the Session when needed and lets the composer seat send the continuation
  — so a stale-running row can be continued from its own row, not only from the
  composer's play control.
- `conversation.input.overlay` — a renderless seat for the open Conversation
  that marks the shell, swaps the submit glyph, and starts the Host continuation
  route; it no longer submits a draft prompt.
- Interruption reads are shared in one small client store, fetched two at a time
  and cached per Session. Every visible Session row is discovered independently
  of its leading slot. A per-page `EventSource` listens to the Host stream and
  immediately refreshes known/watched `sessionId` + `parentSession` on a turn
  boundary; `open` triggers a full refresh after reconnect. The state is also
  re-read when the Conversation opens, on window focus/page visibility, on
  `connection/reset`/`online`, and every 20 seconds as a fallback; a forced
  refresh keeps the current ready value visible instead of downgrading it to
  loading.

## Icons

The mark and the play glyph are inlined paths from
[Remix Icon](https://remixicon.com) (`error-warning-fill`, `play-fill`; Apache-2.0).
The plugin does not depend on the icon package or network at runtime.

## Limits

- **One-time log reads.** The first look at each listed Session reads its log on
  the Host; after that the cache answers, and live turn boundaries keep it
  fresh. After a Host restart the first sidebar pass pays that cost once per
  listed Session.
- **Blank and archived rows** are not marked.
- **Draft safety.** The composer only auto-continues when the draft is empty; it
  never overwrites something the user typed.
- **Raw log.** The implicit continuation is still a durable `user/message` with
  source kind `power-suite-continue`; it is hidden from Chat via the native
  context/trigger rendering, but Trajectory/raw exports can show it.
- **Trigger correlation.** A turn-trigger card is hidden when its recorded time
  falls inside a recent continuation window for this browser. This is a UI
  compatibility shim until Chat exposes the source kind on the trigger row.

## Multiple devices on one Host

The interruption state is **Host-owned**, not browser-local: the route folds the
shared Session log and the live `session/event` cache on the DSH Host. Every
browser that opens the same Host URL (for example this Mac's LAN port) sees the
same state, including after **Continue** starts a real new turn. There is no
per-device interrupted-state file or localStorage value.

A page that opens or switches to a Session fetches the state immediately. A page
that is already open holds one `EventSource` to the Host stream: a `turn/start`
or `turn/end` from any device is pushed to every connected page and refreshes
the affected Session (and its direct parent) immediately. The initiating page
also clears the badge as soon as Continue is accepted; other pages receive the
next boundary push. A stale page that still shows Continue gets `409
session-busy` from the route and refreshes instead of starting a duplicate turn.

Fallback: if `EventSource` is unavailable or the stream cannot connect (proxy,
network, Host restart), the page keeps the 20 s poll and refreshes on window
focus, `visibilitychange`, `online`, and `connection/reset`. Reconnects are
automatic (`retry: 10000`) and an `open` event performs a full refresh, so a
missed boundary is also recoverable by the fallback.

Limit: each open browser tab holds one long-lived SSE connection; proxies may
buffer `text/event-stream` despite `x-accel-buffering: no`, and there is no
replay/`Last-Event-ID` (boundaries are invalidations, not a durable log). All
devices must use the same Host (same `$DSH_HOME` and URL/token); different
Hosts/profiles do not share state.

## Automatic refresh after a Host restart

Interruption state is Host-owned but the browser caches one record per Session.
After a DSH restart the browser may keep its old page, so a stale record used to
survive until that row was clicked.

- A row whose native status still says **running** (the shell shows a green
  spinner and does not render the custom leading slot) is decorated directly:
  the decoration inserts the amber warning and its hover Continue CTA into the
  native leading span and hides the stale spinner, so the interrupted mark (and
  the row-level Continue) is visible immediately after a reconnect instead of
  only after opening the Session.
- The browser listens for the client Connection's `connection/reset` event,
  which fires whenever a new Host generation is established, and immediately
  repulls every known/watched Session. Window focus, `visibilitychange`,
  `online`, and a 20 s poll refresh the same set.
- A pending badge therefore appears on its own after the Web page reconnects;
  clicking a Session is no longer required.
- The Host caches a Session's own fold, but derived parent values are invalidated
  on every `session/event`, so a child finishing or starting a turn is reflected
  on the next refresh.

## Delegated subagent work

A parent Session can finish its own `turn/end` while delegated subagent
Sessions are still running. If the Host restarts in that state, the parent log
looks `completed` even though the delegated work was cut off.

The route folds known child Sessions (`header.parentSession`) too:

- a child that is **still running** is live work, not an interruption;
- a child whose turn started during the parent's latest turn, or whose last
  event is newer than the parent's latest `turn/end`, belongs to that work;
- a child that was interrupted (or has an open crash tail) while belonging to
  the parent's latest turn marks the parent as interrupted;
- the badge tooltip distinguishes a delegated-subagent interruption, and
  Continue resumes the parent Session (the subagent is not a visible Session).

Nested delegations are followed recursively; a subagent Session is never shown
as its own row in the sidebar.

## When the Session's own turn is interrupted while delegated subagents still run

A parent Session can stop on its own turn — for example on a provider transport
or timeout error recorded in its `turn/end` — while the subagent Sessions it
delegated are still running. The Host interruption record is the authority for
the mark here: the shell's combined running flag is also true while a delegated
child runs, so gating the mark on it left such a Session looking simply running.

- **Card row.** The Session stays in the card's running group — the delegated
  children really are still running — but its own row shows the amber
  interrupted mark and the inline **Continue** action, and its time column shows
  the relative last-activity time instead of a running duration. Nested child
  rows whose own record is interrupted show the same amber glyph.
- **Native sidebar row.** When the shell still renders the row as running (for
  example after a failed turn before the shell's next status update), the row
  now gets both the amber badge and the hover **Continue** CTA, wired to the same
  continuation handshake as an idle row. Rows the shell already renders as idle
  keep the existing badge plus inline triangle.
- **After Continue.** Once the continuation turn runs, the record reports
  `running: true` and the mark/CTA disappear while the composer keeps its play
  control. The decision is therefore: the record is ready, `interrupted` is true
  and the record's `running` is not true; the shell's combined running flag is
  not an input.
- **Live turns.** When this browser starts a new turn while a stale
  interrupted-idle record is cached, the card forces one authoritative Host
  refresh at the running transition, so the stale mark clears on active work
  instead of waiting for the next poll/SSE boundary.

The failure that prompted this behavior was a model-provider transport/timeout
failure recorded in `turn/end`, not a DSH Web service restart; the service stayed
healthy. [limitations.md](limitations.md) records the refresh-window caveat and
the duplicate-Continue rejection.

## Implicit continuation

![Side-by-side demo: explicit user prompt vs hidden continuation](demo/implicit-continue-before.png)

A self-contained interactive demo is at
[demo/implicit-continue.html](demo/implicit-continue.html): click **Continue**
in both panels to compare the old visible prompt with the implicit path.


Clicking **Continue** no longer writes a human-looking prompt into the
transcript. The browser calls `POST /api/power-suite.continue`; the Host uses
the Session controller's prompt command with an explicit message source
(`power-suite-continue`, form `notice`), so:

- the transcript shows no user bubble for the continuation;
- prompt history ignores it (only `source.kind: "user"` messages are recalled);
- the native context/trigger row is hidden by the plugin, so the continuation
  appears implicit; the model still receives a user-role instruction and starts
  a new turn. The route is rejected when the Session is running or not
  interrupted, and a per-Session in-flight lock rejects duplicate Continue
  clicks.

If the Host composition does not expose the Session controller, the route
returns `continue-unavailable` and the badge stays; the browser repulls the
interruption state instead of pretending success.
