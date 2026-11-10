# Prompt history

A DSH Power Suite feature: the configured modifier + **↑ / ↓** in the composer
walks through the prompts you already sent in this Session, shell-style. The
default is ⌘ on macOS and Ctrl on Windows and Linux; the
[Settings](settings.md) section on the bundle's Plugins page changes it to
Option/Alt, Ctrl, or turns the shortcut off. A recalled prompt is ordinary draft
text — edit it and send it again. Plain arrow keys keep their original caret
behavior.

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
  `{ sessionId, prompts: [{ seq, text }] }`, oldest first, capped at 500.

The fold keeps only `user/message` events whose recorded source kind is
`user`, joins their text blocks, and skips blank results.

## Limits

- **Current Session only.** History does not cross Sessions or Workspaces;
  there is no global shell history.
- **Send-time refresh.** A prompt sent from another device while this page sits
  idle appears after the next send or page reload.
- **Replacement, not insertion.** Recalling replaces the whole draft text and
  drops inline reference chips (`@file`, session references); pending
  attachments are untouched.
- **Text only.** Attachment-only prompts never enter the list.
