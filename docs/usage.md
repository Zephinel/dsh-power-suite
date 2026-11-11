# Usage

All seven features ship in one plugin. Open the Plugins page, select **DSH Power
Suite**, and use the plugin's own settings section for the shortcut modifier.

## Session artifacts

Open the right Sidebar's Start page and choose **Artifacts**. The panel lists
files this Session created or delivered, plus the images and files you attached
to your own prompts. Image rows show a 40 px rounded thumbnail by default (other
files keep a file icon), and the **All / Generated / Provided** pills above the
list filter it client-side with per-pill counts (`{shown} of {total}` while
filtered; an empty filter shows **No artifacts in this filter**).

- **Open** previews a generated file through the native document preview;
  a provided attachment opens its inline URL in a new tab.
- **Download** saves the file through the plugin's raw or attachment route.
- **Copy link** copies the authenticated LAN URL.
- Hover a generated row for the Quick Look preview; drag the bottom-left grip to
  resize, double-click it to reset the size, and click anywhere outside to
  dismiss. Provided attachments have no Quick Look.

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
  icon once it has been opened (a new run makes the next completion green
  again).
- Rest the pointer on a row for its hover detail: the Workspace name, full
  workspace path, Status with its time, absolute Last active time, and the
  running subagent count.
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

## Draft attachments

Pasted images, dropped files, and files chosen with the picker stay with the
draft when you switch to another Session and come back, because the plugin
remembers the browser files for the page lifetime. The shell itself only
persists the draft text. A page reload still loses the attachments, sending the
draft clears the memory, and removing every attachment explicitly (after they
were restored) stops them from coming back.

## Interrupted sessions

A Session whose last turn was cut off by a Host restart shows an amber mark
left of its title. Hover the row and choose **Continue** to resume it; the
continuation is implicit — it does not appear as a user message in the
transcript, while the composer submit control uses a play icon until the new
turn starts.

## Settings

The Plugins detail page for the bundle carries the suite's settings in two
groups. **Prompt history** holds the shortcut modifier (⌘ on macOS, Ctrl on
Windows/Linux). **Active & recent** holds the two retention windows: Finished
Session retention (1/2/6/12/24 hours, default 2 hours) and Active project
retention (1/3/7/14/30 days, default 7 days); each row's hint shows the current
value. The package README that the Plugins page normally renders above the
configuration is hidden on this page while the controls are shown. Changes
apply immediately to this page's card and buckets and are shared with every
browser on its next load.

## Feature references

- [Session artifacts](session-artifacts.md)
- [Workspace presets](workspace-default-presets.md)
- [Dynamic workspaces](dynamic-workspaces.md)
- [Prompt history](prompt-history.md)
- [Draft attachments](draft-attachments.md)
- [Interrupted sessions](interrupted-sessions.md)
- [Settings](settings.md)
