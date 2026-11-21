# Product

## Users

DeepSeek Harness users who keep long-running sessions in a dense chat
surface: developers, analysts, and operators who need to revisit the files a
session produced, recover work after a Host restart, replay earlier prompts, or
give a Workspace a predictable default agent.

## Product purpose

One installable plugin that makes DSH slightly better at the work
around the conversation: seeing what a session produced, opening and
downloading it, recovering an interrupted turn without restarting, recalling
prompts already sent, and setting the default agent for a Workspace.

The suite stays one Loader row (`power-suite`). Features are modules inside the
package so the Plugins page shows one plugin whose inventory grows over time.

## Brand personality

Quiet, native, and precise. The UI should look like part of the DeepSeek
Harness shell: theme tokens, restrained spacing, icon-only actions where the
meaning is obvious, and no bespoke decorative chrome that competes with the
chat.

## Anti-references

Colored outlines or tinted pills used as decoration, card-inside-card layouts,
oversized rounded corners, always-visible destructive text buttons, emoji used
as icons, and duplicated controls that already exist in the native shell.

The current-Session row's colored atmosphere is the deliberate exception: it
marks the open Session (a state signal, not decoration) and is the only colored
surface the suite adds.

## Design principles

1. **One suite, one row.** Users install one plugin; feature boundaries stay
   internal.
2. **Reuse native surfaces.** Open files through the native document preview,
   render in the native right Sidebar, and use native icons and theme tokens.
3. **Quiet by default, explicit on demand.** Secondary actions appear on hover
   or focus without losing keyboard access.
4. **Hide stale data.** A missing artifact or an unknown session state is not
   rendered as a dead row.
5. **Every state.** Hover, focus, copied, loading, empty, interrupted, and
   failed paths are part of the feature, not an afterthought.

## Accessibility and inclusion

Accessible names on icon-only controls, keyboard access for previews and
actions, focus-visible rings preserved, reduced-motion preferences honored by
the hover preview, and color never used as the only state signal.
