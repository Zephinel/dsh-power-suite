# Usage

All eight features ship in one plugin. Open the Plugins page, select **DSH Power
Suite**, and use the plugin's own settings section for the Host-side preferences
(the prompt-history modifier and the two retention windows). The annotation
mode's own two modifiers are changed inside its rail, not on that page.

## Session artifacts

Open the right Sidebar's Start page and choose **Artifacts**. The panel lists
files this Session created or delivered, plus the images and files you attached
to your own prompts. Image rows show a 40 px rounded thumbnail by default (other
files keep a file icon). The **filter dropdown at the header's right edge,
immediately left of Refresh**, offers **All / Generated / Provided** with their
counts and filters the list client-side (`{shown} of {total}` while filtered; an
empty filter shows **No artifacts in this filter**).

- **Open** previews a generated file through the native document preview;
  a provided attachment opens its inline URL in a new tab.
- **Download** saves the file through the plugin's raw or attachment route.
- **Copy content** copies text files verbatim. For images it writes a real PNG
  clipboard item in a secure context (HTTPS or localhost); on a plain-HTTP page
  it uses the legacy HTML-image clipboard, which rich editors paste as the
  picture while plain-text targets may get nothing, and copies the inline image
  URL only if that fails. Other binaries have no Copy content button.
- **Copy link** copies the authenticated LAN URL.
- Hover a row for the Quick Look preview — generated rows get the workspace
  pipeline (Markdown/code/images/media/PDF/HTML), provided rows get images and
  media through the verified attachment route and text-like files clipped at
  64 KiB (other provided types show the unavailable state). The card opens at a
  570 x 360 default so content is visible immediately; drag the bottom-left grip
  to resize, double-click it to reset the size, and click anywhere outside to
  dismiss.

Missing files are filtered out.

## Workspace default preset

Right-click a Workspace in the Sidebar and choose **Default agent preset**.
The choice applies to new Sessions created in that Workspace; existing Sessions
keep their preset. **Follow the global default** clears the override.

## Dynamic workspaces

In the sidebar's expanded Workspaces browser, the **Running & recent** card
sits above the native header and the Workspace list is split into **Active
Projects** and **Inactive Projects**. A Workspace is Active while one of its
Sessions is running or was active inside the Active-project retention window
(default 7 days). The card's header shows a blue pulsing dot while a listed
Session is running and the white sparkle icon when nothing runs.

- Fold a bucket with its right-edge header chevron; the state is remembered in
  this browser.
- Click a card row to open that Session. **View all {count}** expands past the
  first five rows.
- The leading glyph tells the read state: a running spinner while the Session
  runs, a green dot for a finished but unopened Session, then a white session
  icon once it has been opened. Read marks are now **shared through the Host**,
  so they persist across reloads and appear the same in every browser using the
  same `$DSH_HOME`; a click is only needed on a genuinely new result (the 1 s tolerance
  prevents transient status flags from resurrecting the green dot). The marks
  live in the Host's `read-acks.json`; a browser with the new Host keeps its old
  local marks by opening DSH once, which uploads them in small chunks. During the
  short-lived activity-floor iteration some baselines were inflated; those marks
  cannot be lowered automatically, but the affected rows have since left the
  card, so no visible action is needed.
- The row of the Session the main conversation currently shows gets a faint
  **rainbow ring** plus glow; it follows whichever Session you open (from the
  card, the sidebar, or anywhere else) and disappears when that row leaves the
  card. Merely-running or unopened rows are not ringed. Reduced-motion users see
  a static ring.
- Card times come from the Host's **event-sourced activity ledger**, not the
  catalog's last-prompt time, so a turn that ran for hours keeps its real
  completion time and stays in the recent window instead of vanishing on stop.
  The ledger records allowlisted committed Session events live across the 55
  documented activity-bearing `SessionEvent` types (7 metadata types are
  explicitly excluded; the families are turns, steps, messages/attempts, tools including PTC dispatch, jobs, commands, compaction, subagent state, goal/todo, approvals and
  selection actions, workspace/deliverable/schedule changes, team traffic,
  image/offload, feedback, inbox splice, LLM retry, tool-workflow progress —
  including interrupted and failed turn ends). Metadata events, seed/maintenance
  events, and unknown future/plugin event types do not count, so a brand-new
  event type can be under-reported until the allowlist grows. Sessions that
  existed before the feature was installed only get a one-time baseline
  (projection-cache time, or the header's `createdAt` when there is no cache
  document), so a historical/seed-only end can be under-reported — it is never
  fabricated. The native sidebar keeps its own
  catalog times. The Host routes behind the marks/times need the plugin reloaded
  / Host recomposed after upgrading.
- Rest the pointer on a row for its hover detail: the Workspace name, full
  workspace path, Status with its time, absolute Last active time, and the
  running subagent count. The card sits outside the sidebar and never covers the
  row's buttons.
- Hover or keyboard-focus a row to reveal its trailing actions: **New session**
  creates a blank Session in that row's own directory and opens it, and
  **Continue** (interrupted rows only) resumes the interrupted task without
  opening the row first. Interrupted rows also show an amber warning badge before
  the title.
- A parent Session with delegated subagent Sessions shows a chevron at its far
  right: expanding it lists the children indented under the parent, and clicking
  one opens that child Session.
- A finished Session stays in the card as `done` for the retention window instead
  of disappearing on the stop.
- In the collapsed rail, the card is hidden; widening the sidebar restores it.
- In the native **In one list** grouping there are no Workspace sections, so only
  the card applies.

## Prompt history

In the composer, press the configured modifier + ↑/↓ to recall previously sent
prompts. Plain ↑/↓ keep their original behavior. Change the modifier in the
plugin settings (⌘/Ctrl, ⌥/Alt, Ctrl, Shift, or Off).

Below the native turn rail at the conversation's right edge, a vertical rail
lists the current Session's prompts as small native-style ticks, newest at the
top, with a short horizontal divider separating the two groups. Hover or
keyboard-focus a tick to read the full prompt and its time in a card to the
left; click it (or press Enter) to copy the text into the composer draft — the
copy is silent, with no confirmation chip or animation. The **Search** button
below the ticks stays put and opens a filter card directly below it, or to its
left when there is no room above the composer; a blank click outside the card or Escape
closes it and clears the filter. A long history scrolls inside the rail while
the search button stays at its foot. The rail is absent while the Session has no
sent prompts.

## UI element annotation

A round launcher button sits at the bottom-right of the page. Click it to turn
the annotation mode on and off; drag it anywhere in the viewport if it covers
something (a drag never toggles the mode, and the position is remembered). While
the mode is on, the page narrows to make room for a right rail; on a narrow
window the rail floats over the right edge instead, and its collapse control
reduces it to a strip. Exit with the rail's exit control, the launcher, or Esc.

- Hover the page to outline the element a click would select, then click it: the
  highlight stays and a small note popover opens next to the element. It names
  the element, summarizes its locator, shows whether it still resolves, and
  offers **↑ / ↓** to move to a parent element or back down when the chosen
  granularity is wrong.
- Type the requested change in the **note** field; it is inserted **verbatim**
  (line breaks and spaces preserved, no redaction or truncation), so multi-line
  notes stay multi-line in the inserted request and may exceed single-line
  layouts. Page-derived text is separately sanitized; the note is not.
  **Quick reference** inserts
  this one annotation into the current Session's composer at the caret, keeping
  the existing draft and without sending. **Add to collection** parks the element
  in the rail's collection instead.
- Hold **Shift** (the default multi-select modifier) to add or remove elements
  without reopening the popover while more than one stays selected, or drag while
  holding it to draw a selection box. A plain drag never draws a box. With
  several elements selected, the rail shows **Add {count} to collection** and
  **Clear selection**.
- Hold **Alt / Option** (the default pass-through modifier) to use the page
  normally: left clicks perform their real action and right clicks open the
  native menu. Releasing the modifier returns to annotation; the mode never fakes
  a click.
- **Collection** in the rail lists saved elements in order with their notes: edit
  a note inline, remove or clear entries, re-locate an element (scrolls to it and
  flashes it), or **Insert all into composer** to hand all current annotations to
  the model as one numbered request. The insert control is disabled until the
  collection holds an entry from the current Session; entries from another
  Session stay visible but are skipped by the batch, and re-locate refuses them.
  Re-adding the same element keeps its position and updates its note — or leaves
  the saved note untouched when the note field is empty — instead of creating a
  duplicate.
- Esc steps back one layer at a time: an active note edit ends first (the text
  stays), then the selection clears, then the mode turns off. From the
  collection or settings view, Esc first returns to the status view.
- The two modifiers are changed in the rail's **settings** view and stored in
  this browser. They must differ; a conflicting choice moves the other modifier
  to a different key and the view explains what changed.

Clicking while annotating does not trigger the page: native controls such as
**New session** are selected, not activated. The feature only inserts text; it
never edits the page's content elements, never reads typed values, and never
sends the message. With no Session open, insert actions are unavailable and the
collection says **Open a session before inserting a reference**. A selection,
note, or collection entry does not survive a page reload; the two modifiers, the
launcher position, and the rail's collapsed state do.

## Draft attachments

Pasted images, dropped files, and files chosen with the picker stay with the
draft when you switch to another Session and come back, because the plugin
remembers the browser files for the page lifetime. The shell itself only
persists the draft text. A page reload still loses the attachments, sending the
draft clears the memory, and removing every attachment explicitly (after they
were restored) stops them from coming back.

## Interrupted sessions

A Session whose last turn did not finish — Host restart/crash, any model or
network error (quota/usage limit, timeout, transport, rate limit), an output
limit, or an imported unknown cancellation — shows an amber mark left of its
title. Hover the row and choose **Continue** to retry it; the continuation is
implicit — it does not appear as a user message in the transcript, while the
composer submit control uses a play icon until the new turn starts. Deliberate
user/hook/parent cancellations and completed turns stay unmarked.

## Settings

The Plugins detail page for the bundle carries the suite's settings in two
groups. **Prompt history** holds the shortcut modifier (⌘ on macOS, Ctrl on
Windows/Linux). **Active & recent** holds the two retention windows: Finished
Session retention (1/2/6/12/24 hours, default 2 hours) and Active project
retention (1/3/7/14/30 days, default 7 days); each row's hint shows the current
value. The package README that the Plugins page normally renders above the
configuration is hidden on this page while the controls are shown. Changes
apply immediately to this page's card and buckets and are shared with every
browser on its next load. The UI element annotation modifiers are separate
browser-local settings inside its rail settings view; they are not part of this
page.

## Feature references

- [Session artifacts](session-artifacts.md)
- [Workspace presets](workspace-default-presets.md)
- [Dynamic workspaces](dynamic-workspaces.md)
- [Prompt history](prompt-history.md)
- [UI element annotation](ui-annotation.md)
- [Draft attachments](draft-attachments.md)
- [Interrupted sessions](interrupted-sessions.md)
- [Settings](settings.md)
