# Draft attachment memory

A DSH Power Suite feature: a draft's attachments survive switching Sessions and
coming back, for as long as the page stays open.

The shell persists a Session draft's text and reference chips, so the words come
back when you return to a Session. Browser-owned attachments — pasted images,
dropped files, files chosen with the picker — are runtime objects in the mounted
input controller: the shell does not persist them, so switching away and back
restored the text and silently dropped the files. This feature remembers those
files per Session and re-introduces them through the composer's own intake when
the Session is shown again.

## What it adds

- An invisible Seat in the composer overlay (`conversation.input.overlay`, id
  `power-suite.draft-attachments`) that captures the browser `File` objects the
  composer admits for the current Session and puts them back after a round trip.
- Nothing visible in the UI and no new Host route: the feature changes what the
  composer contains, not how the shell looks.
- It is a **page-lifetime workaround**, not persistence. A page reload still
  cannot bring back a file the browser did not keep.

## What is remembered

While a Session's composer is mounted, the Seat listens to the three paths
through which browser attachments enter it:

- **paste** — images or files pasted into the composer;
- **drop** — files dropped on the composer;
- **picker** — a file input owned by the composer's file flow.

Only events inside the Session's composer region count. Duplicate files (same
name, size, and last-modified time) are stored once, the newest 20 files per
Session are kept, and at most 8 Sessions are remembered at the same time; the
least recently active Session is forgotten when a ninth arrives. Everything
lives in one in-memory map for the page lifetime: nothing is written to
`localStorage`, the Host, or a Session log.

## How the restore works

When a Session is shown again, the shell first restores its draft text. If no
attachment came back with it and the Session's composer is ready (the input phase
is plain), the Seat re-introduces the remembered `File` objects through the
composer's **own paste intake**: it builds a `DataTransfer` containing the files
and dispatches a synthetic `paste` event on the Lexical editor. The shell then
processes them exactly as if they had just been pasted — same size limits, same
upload/preview path, same attachment chips.

The injection waits for the composer to mount (retrying briefly) and is skipped
whenever the shell did restore at least one attachment, so a future shell that
persists attachments itself is not double-fed.

## When the cache is cleared

- **Send**: as soon as the draft leaves the plain phase (a send starts), that
  Session's remembered files are dropped.
- **Explicit removal of every attachment**: if the human removes the last
  attachment after a restore, the cache is dropped instead of bringing the files
  back on the next round trip.
- **Page reload**, obviously: the in-memory map is gone.
- Eviction: beyond 20 files in one Session or 8 remembered Sessions, the oldest
  entries are dropped.

## Limits

- **Page lifetime only.** The browser does not persist `File` objects; a reload
  cannot restore them, and there is no cross-device or cross-tab transfer.
- **Only what the composer admitted.** Files are captured from the composer's
  paste, drop, and picker events while that Session is mounted. Files attached
  through another browser surface, or after the composer unmounted, are not
  captured.
- **Partial removal does not update the cache.** Only removing **all**
  attachments after they were restored clears the memory; if you remove one of
  several attachments and then switch away and back, the remembered set
  (including the removed file) is what gets pasted back.
- **Restore runs when the shell restored zero attachments.** If the shell ever
  persists attachments itself, this feature becomes a no-op instead of
  duplicating them.
- **DOM dependency for the paste intake.** The restore addresses the Session's
  `[data-conversation-session]` occurrence, its composer region
  (`[data-conversation-region="composer"]`), and the Lexical editor
  (`[data-lexical-editor="true"]`). If those anchors change, the restore fails
  silently: the draft text and the shell's normal behavior are unaffected.
- **Caps are fixed.** Eight Sessions / twenty files are constants
  (`DAM_MAX_SESSIONS`, `DAM_MAX_FILES`); there is no setting.

## Install

This feature ships inside [DSH Power Suite](overview.md); install the suite:

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-power-suite
```

No Host restart is needed for this feature: it is browser-only and reloads with
the client entry.

Implementation: [`src/browser/draft-attachments/`](https://github.com/Zephinel/dsh-power-suite/tree/main/src/browser/draft-attachments) wired from [`src/client.js`](https://github.com/Zephinel/dsh-power-suite/blob/main/src/client.js) under its
`feature: draft attachment memory` region.

## Verification

Manual check on a running DSH UI:

1. In Session A, paste an image (or attach a file) and type some draft text.
2. Switch to Session B, then back to A: the text returns from the shell and the
   attachment is restored by this feature.
3. Repeat the round trip: the attachment stays.
4. Remove the last attachment explicitly and switch away and back: it stays
   removed.
5. Send the draft: the cache for that Session is cleared (a later round trip
   does not re-attach the sent files).
6. Reload the page: the attachment is gone, matching the browser's own limits.

See [verification.md](verification.md) for the recorded evidence.
