# Interrupted sessions

Tasks cut off by a Host restart or crash are marked in the sidebar and can be
continued without hunting for the right message.

## What the user sees

- An **amber warning mark** sits left of the Session title, in the row's status
  cell, and stays visible by default.
- **Hovering** the row reveals a **Continue** action at the trailing edge. The
  same hover paints an opaque mask over the row's title and time, so the action
  never collides with the text underneath; the mark and the action sit above the
  mask. Both use theme tokens, so they follow light and dark mode.
- Opening that Session turns the composer's send control into a **play triangle**
  (`play-fill`). Pressing it with an empty draft continues the interrupted task;
  typing a draft first sends that draft normally instead.
- Continuing sends a visible user message — `Continue the interrupted task.`
  (`继续完成被中断的任务。` in the Chinese UI) — and clears the mark optimistically
  while the new turn starts.

## When a Session counts as interrupted

The Host folds the Session's last turn:

- the last `turn/end` reason is `interrupted` (crash recovery closes a tail turn
  with that reason),
- the last `turn/end` reason is `aborted` with the `disposed` cancellation cause
  (a graceful Host shutdown, such as a restart, closes the live turn that way),
  or
- the last turn is still open and its Agent is **not** running (a raw crash tail
  before recovery).

A running Session is never marked; a user cancellation (`aborted` with cause
`user`), a parent or hook cancellation, a model error, a completed turn, or a
Session with no turns is not interrupted either.
Only the **last** turn matters: continuing the task starts a new turn, so the
previous interruption stops counting immediately.

## How it is wired

Host:

- `GET /api/power-suite.interrupted?sessionId=<id>` — returns
  `{ sessionId, interrupted, running, turn, reason, open }` for one Session.
  It reads the Session log through `ctx.sessionQuery.readSession()` on the first
  ask and caches the answer per Session; `session/event` `turn/start` and
  `turn/end` events keep the cache current. `&refresh=1` recomputes.
- Registered in [`src/features/interrupted-sessions/host.js`](../src/features/interrupted-sessions/host.js);
  the pure fold lives in [`turns.js`](../src/features/interrupted-sessions/turns.js).

Browser:

- `sidebar.session.row.leading` — the default-visible warning mark (the row
  status cell left of the title, which only renders for idle rows).
- `sidebar.workspaces.session.row.action` — the hover-only Continue pill.
- `conversation.input.overlay` — a renderless seat for the open Conversation
  that marks the shell, swaps the submit glyph, enables the empty submit while
  interrupted, intercepts its click, consumes a pending Continue request from a
  row action, and runs the continue submission through the composer's own
  `inputActions`.
- Interruption reads are shared in one small client store, fetched two at a time
  and cached per Session. Mounted rows keep their Session fresh: the state is
  re-read when the Conversation opens, on window focus or page visibility, and
  every 25 seconds while a watched row is mounted, so a stale mark cannot
  outlive a Host-side change or a page reload.

## Icons

The mark and the play glyph are inlined paths from
[Remix Icon](https://remixicon.com) (`error-warning-fill`, `play-fill`; Apache-2.0).
The plugin does not depend on the icon package or network at runtime.

## Limits

- **One-time log reads.** The first look at each listed Session reads its log on
  the Host; after that the cache answers, and live turn boundaries keep it
  fresh. After a Host restart the first sidebar pass pays that cost once per
  listed Session.
- **Idle rows only.** The leading seat renders only while the row's primary
  status is idle, so a Session with running work or an unread completion shows
  its own status instead.
- **Blank and archived rows** are not marked (they do not render the leading
  seat).
- **Draft safety.** The composer only auto-continues when the draft is empty; it
  never overwrites something the user typed.
- **Visible prompt.** Continuing adds an ordinary user message to the transcript;
  there is no hidden continuation channel.
