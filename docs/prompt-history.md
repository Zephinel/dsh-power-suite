# Prompt history

A DSH Power Suite feature with two surfaces over the same Session history. The
configured modifier + **↑ / ↓** in the composer walks through the prompts you
already sent in this Session, shell-style. Above the composer, an always-visible
**preview panel** lists the same prompts newest first, with a full-text hover
preview, an inline search, and click-to-copy. Both read the Session log, so
prompts from earlier pages of a long Session are included.

The keyboard shortcut defaults to ⌘ on macOS and Ctrl on Windows and Linux; the
[Settings](settings.md) section on the bundle's Plugins page changes it to
Option/Alt, Ctrl, or turns the shortcut off. A recalled or copied prompt is
ordinary draft text — edit it and send it again. Plain arrow keys keep their
original caret behavior.

## Use it

1. Click into the composer (any draft content works — the modifier states the
   intent).
2. **⌘↑** recalls the most recently sent prompt, then **⌘↑** again for older
   ones. At the oldest prompt, ⌘↑ stays there.
3. **⌘↓** walks toward newer prompts. One ⌘↓ past the newest restores the draft
   you had before browsing.
4. Plain ↑/↓ are untouched: they move the caret, also inside a recalled
   multi-line prompt. Editing or sending leaves browsing, so the chip-like
   history state never lingers.

The first ⌘↑ is consumed even if the history is still loading; the recall lands
as soon as it arrives. History refreshes when the Session changes and after a
send, so your own new prompt is recallable immediately.

## Preview panel

An always-visible panel is docked above the composer, between the conversation
and the input card: a short centered divider separates it from the conversation,
then the prompt history card follows at the composer's width. The panel is
registered through the `conversation.input.dock` slot (registration id
`power-suite.prompt-history-preview`) and renders nothing while the Session has
not sent a prompt yet. There is no collapsed bar and no time-range select.

![Prompt history preview with hover preview and search](assets/prompt-history-preview.png)

- **Rows**: the Session's prompts newest first. Each row carries the `#N` reverse
  index (the newest prompt has the highest number), the prompt text clamped to
  two lines, and — when the Host reports a timestamp — the time: `HH:MM` for
  today, `MM-DD` for this year, `YYYY-MM-DD` for older dates, with the full local
  date and time on hover. A copy glyph fades in on hover or keyboard focus.
- **Full prompt on hover**: resting on a row (or keyboard-focusing it) opens a
  floating popover with the whole prompt and, when available, its full
  timestamp. The popover is portaled to the page body so the composer layer
  cannot clip it, anchors above or below the row, scrolls when the text is long,
  and stays open while the pointer travels into it; scrolling the page or
  resizing dismisses it.
- **Search on demand**: the footer's **Search** button reveals an inline search
  field under the list. Matching is a case-insensitive substring over the prompt
  text; the footer switches to **Showing {count} of {total}** and **No matching
  prompts** appears when nothing matches. The search row stays open when the
  field loses focus; the clear (×) control resets the filter, and Escape clears
  it and closes the search row.
- **Click to copy**: clicking a row (or pressing Enter on a focused one) puts the
  prompt into the composer draft, focuses the composer editor, and shows
  **Copied to input** in the footer for about two seconds. The draft is replaced
  as a whole, like a keyboard recall.
- **Footer**: `{count} prompts` by default, or the filtered count while
  searching.
- **Scroll**: the list is capped at `min(340px, 40vh)` and scrolls, so it stays
  compact above the composer.

The preview and the keyboard recall share one source, so both see the same
human-only prompts and the same 500-entry cap. The preview refetches per Session
and again when a turn finishes (the send that just completed appears then);
switching Sessions also clears the search and the copied state. The Host fold
carries each prompt's event time; it is served once the plugin/Host code is
reloaded (a normal Host restart does that too). A Host that has not picked up
this version omits `at`: the row times and the popover timestamp are then hidden
and everything else keeps working.

## Multi-line prompts

A recalled multi-line prompt is one history entry: ⌘↑ / ⌘↓ jump to the previous
or next prompt directly, without stopping on internal lines. Move inside its
lines with plain arrows or the mouse; those keys do not change the history
position.

## What counts as a prompt

- Human prompts of the current Session, read from the Session log (not just
  the chat window the browser has loaded): ordinary prompts and prompts
  admitted mid-turn — including ones from earlier pages of a long Session.
- Prompts that begin with `/` (commands) are included, exactly as sent.
- Only text is recalled. A prompt that carried only image or file attachments
  has no entry; a prompt with both text and attachments recalls its text (the
  attachments are not re-added).
- Injected user-role context — instructions, runtime context, skill catalogs —
  never appears: it is logged with a different source kind.
- At most the 500 most recent prompts are served.
- Every entry also records the event's sequence number and, when the log has
  one, the event time. The preview shows that time next to the row and in its
  hover card; the keyboard recall ignores it.

## Keys

- **Modifier + ↑ / ↓** switches history. The modifier is required; no plain key
  is taken over. It defaults to the platform primary modifier, and
  [Settings](settings.md) offers ⌘/Ctrl (platform primary), Option/Alt, Ctrl,
  Shift, or Off.
- **Plain ↑/↓, ←/→, Home/End** keep their original caret behavior, including
  inside a recalled multi-line prompt.
- **⇧, ⌥** with arrows keep their original selection or word/paragraph
  behavior; history is only the primary modifier with no other modifier.
- When a composer menu or listbox is open (the `/` and `@` trigger menus, the
  model or access menus), the history gesture stays out of the way.
- The composer in an ordinary chat is the only editor served; other inputs
  (rename dialogs, sidebar fields) keep native arrow behavior.

## Host route

The list comes from one authenticated exact route, behind the same browser
cookie and Host/Origin fence as the rest of the GUI:

- `GET /api/prompt-history.list?sessionId=<id>` →
  `{ sessionId, prompts: [{ seq, text, at }] }`, oldest first, capped at 500.

`seq` is the Session event sequence and `at` is that event's time in epoch
milliseconds, or `null` when the recorded event has no usable time. A Host built
before timestamps existed omits `at` entirely (it still sends `seq` and `text`):
the keyboard recall ignores it in every case, and the preview hides its row
times and hover timestamp when no prompt has one.

The fold keeps only `user/message` events whose recorded source kind is
`user`, joins their text blocks, and skips blank results. Injected user-role
context is logged with a different source kind, so it never becomes a prompt.

## Limits

- **Current Session only.** History does not cross Sessions or Workspaces;
  there is no global shell history.
- **Send-time refresh.** A prompt sent from another device while this page sits
  idle appears after the next send or page reload; the preview refreshes on a
  Session switch and on a finished turn.
- **Replacement, not insertion.** Recalling or clicking a preview row replaces
  the whole draft text and drops inline reference chips (`@file`, session
  references); pending attachments are untouched.
- **Text only.** Attachment-only prompts never enter the list.
- **Same 500-entry cap on both surfaces.** The preview and the keyboard recall
  see the same newest 500 prompts; search filters only what was served.
- **Timestamps need the matching Host.** Upgrading the package's browser code
  against a Host that still runs the old route keeps everything working without
  row times; reload the Host plugin (or restart the Host) after upgrading so
  `at` is served.
