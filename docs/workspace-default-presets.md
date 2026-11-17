# Workspace default agent presets

A DSH Power Suite feature: every Workspace's context menu gains a **Default
agent preset** submenu, so new Sessions in that Workspace start under the
preset you chose for it instead of the global default.

## Use it

1. Right-click a Workspace row in the sidebar (or open its `...` menu).
2. Choose **Default agent preset**.
3. Pick a preset, or **Follow the global default** to clear the override.

The parent row always shows the effective choice, for example
`Default agent preset: Creator`. The current option is marked, and presets that
cannot compose a Session (a broken declaration) are listed but disabled.

## What the choice applies to

- Every new-conversation entry in DSH: the sidebar **New Session** and
  its per-Workspace button, the `New Session` header button, and the hero
  Workspace picker. The browser names the Workspace preset on the create
  request, so the Session header records it as the creation fact and a reused
  blank keeps it instead of resetting to the global default.
- A Session created by a path that does not name a preset — an API or headless
  caller, for example — gets the choice from the Host while the new Agent is
  created, before its first turn. The Session log records the change as an
  `agent-preset/selected` event.
- An explicit preset request wins. The Creator entry, or any flow that asks for
  a preset before creating the Session, passes through untouched.
- Existing Sessions are never changed, and switching the preset from the
  Session chip keeps working: the feature never rewrites a chip choice.
- A Workspace without an override follows the global default; changing the
  global default later also changes where that Workspace points.

## Storage

Overrides live in one Host-only JSON file keyed by Workspace identity (stable
across renames):

```text
$DSH_HOME/dsh-power-suite/workspace-presets.json
{
  "version": 1,
  "workspaces": { "<workspace id>": "<preset id>" }
}
```

Writes are serialized and atomically replaced. A missing, malformed, or
version-mismatched file reads as empty: this is a convenience preference, never
a reason to fail a Session. Deleting a Workspace leaves its entry behind
harmlessly; re-registering the same directory creates a new Workspace identity
and therefore starts without an override.

## Host routes

Both routes sit on Connection's authenticated API channel, behind the same
cookie and Host/Origin fence as the rest of the GUI; only the owner Peer reaches
them.

- `GET /api/workspace-presets.get?workspaceId=<id>` →
  `{ workspaceId, preset }` (`preset: null` means no override).
- `POST /api/workspace-presets.set` with
  `{ "workspaceId": "<id>", "preset": "<preset id>" | null }` → the stored
  value. Unknown workspaces answer 404; an absent preset answers 400, and a
  broken preset answers 409.

## Limits

- **New conversations only.** Changing an override does not migrate a blank
  Session that already exists: the next New Session request names the new
  preset, skips a blank listing another preset, and creates a fresh blank
  instead. That earlier draft is left as it was.
- **Global-default fallback heuristic.** The creation-time Host application
  only replaces a Session that runs the deployment's current default; a Session
  composed under any other preset is treated as an explicit request and left
  alone. DSH creation routes through the explicit request, so it does not
  depend on this heuristic.
- **One override per Workspace.** There is no per-directory or per-pattern
  rule, and subagent Sessions inherit their parent's composition rather than a
  Workspace default.
- **Host file, not Session data.** The map is not part of a Session's log and
  does not synchronize between Hosts sharing session storage.
- **Web entry-point patch point.** The browser routing adjusts
  `ctx.uiWorkspace.openWorkspace` / `connectWorkspace`; a composition without
  those methods falls back to the Host-side creation-time application and its
  heuristic.
