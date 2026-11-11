# Usage

All seven features ship in one plugin. Open the Plugins page, select **DSH Power
Suite**, and use the plugin's own settings section for the shortcut modifier.

## Session artifacts

Open the right Sidebar's Start page and choose **Artifacts**. The panel lists
files this Session created or delivered.

- **Open** previews the file through the native document preview.
- **Download** saves the file through the plugin's raw route.
- **Copy link** copies the authenticated raw URL (LAN-friendly).
- Hover a row for the Quick Look preview; drag the bottom-left grip to resize,
  double-click it to reset the size, and click anywhere outside to dismiss.

Missing files are filtered out.

## Workspace default preset

Right-click a Workspace in the Sidebar and choose **Default agent preset**.
The choice applies to new Sessions created in that Workspace; existing Sessions
keep their preset. **Follow the global default** clears the override.

## Dynamic workspaces

In the sidebar's expanded Workspaces browser, the **Running & recent** card
sits above the native header and the Workspace list is split into **Active
Projects** and **Inactive Projects**. A Workspace is Active while one of its
Sessions is running or was active in the last 12 hours.

- Fold a bucket with its header chevron; the state is remembered in this browser.
- Click a card row to open that Session. **View all {count}** expands past the
  first five rows.
- A parent Session with delegated subagent Sessions shows a chevron: expanding
  it lists the children indented under the parent, and clicking one opens that
  child Session; collapsing shows the child count.
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
lists the current Session's prompts as tick marks, newest at the top, with each
prompt's time when the Host reports one. Hover or keyboard-focus a mark to read
the full prompt in a card to the left; click it (or press Enter) to copy the text
into the composer draft, with a small **Copied to input** chip near the rail. The
rail's **Search** button below the marks opens a compact filter card; Escape
closes it, and the clear (×) button resets the filter. The rail is absent while
the Session has no sent prompts.

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

The Plugins detail page for the bundle carries the suite's settings. The first
setting is the prompt-history modifier; its label reflects the current platform
(⌘ on macOS, Ctrl on Windows/Linux).

## Feature references

- [Session artifacts](session-artifacts.md)
- [Workspace presets](workspace-default-presets.md)
- [Dynamic workspaces](dynamic-workspaces.md)
- [Prompt history](prompt-history.md)
- [Draft attachments](draft-attachments.md)
- [Interrupted sessions](interrupted-sessions.md)
- [Settings](settings.md)
