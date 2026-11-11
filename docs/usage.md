# Usage

All five features ship in one plugin. Open the Plugins page, select **DSH Power
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

## Prompt history

In the composer, press the configured modifier + ↑/↓ to recall previously sent
prompts. Plain ↑/↓ keep their original behavior. Change the modifier in the
plugin settings (⌘/Ctrl, ⌥/Alt, Ctrl, Shift, or Off).

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
- [Prompt history](prompt-history.md)
- [Interrupted sessions](interrupted-sessions.md)
- [Settings](settings.md)
