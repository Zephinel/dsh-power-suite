# Usage

All six features ship in one plugin. Open the Plugins page, select **DSH Power
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

Above the composer, an always-visible preview lists the current Session's
prompts newest first with their `#N` index and, when available, their time.
Hover (or keyboard-focus) a row to read the full prompt in a floating card; click
it to copy the text into the composer draft (the footer confirms with **Copied to
input**). The footer's **Search** button reveals an inline search field that
filters by substring; Escape closes it, and the clear (×) button resets the
filter. The whole preview is hidden while the Session has no sent prompts.

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
- [Interrupted sessions](interrupted-sessions.md)
- [Settings](settings.md)
