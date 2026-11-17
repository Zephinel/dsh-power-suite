# Release notes

One Markdown pair per release, committed **before** the `v<version>` tag is
pushed. The in-app update prompt reads these files from the **tag-pinned** raw
URLs on the public GitHub repository
(`https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v<version>/release-notes/<version>.md`
and `.en.md` when the DSH locale starts with `en`), so the text a user sees for a
release cannot drift after publishing.

- `release-notes/<version>.md` — the default (Chinese) notes; **required**.
- `release-notes/<version>.en.md` — the English notes; optional. The Host falls
  back to the default file when the English file is absent (or when its
  Highlights are empty).

```markdown
## Highlights

- 一句话说明用户能感知的变化
- 另一条要点（最多 6 条；更新提示的「查看更新内容」直接显示这些条目）

## Details

可选：完整一点说明，留给 GitHub Release 与后续的插件详情页更新记录使用。
```

## Rules

- `## Highlights` is required in the default file and must contain **at least
  one** bullet. `npm run check:release-notes` fails when the default file is
  missing, unreadable, or has no Highlights, and it validates the English file
  when that file is present. `publish.yml` runs the same gate before
  `npm publish`, so a tag without reviewed notes cannot publish.
- Aim for **2–6 bullets** per file. The update prompt renders these bullets
  **verbatim** (inline Markdown is reduced to plain text: links keep their
  label, code ticks and bold markers are removed), and the card shows at most
  six. Keep each bullet short and user-facing.
- Write highlights from the user's side — what changed in the UI, what they can
  do now — not from the implementation side. The first release (0.1.0) absorbs
  all previously unpublished development history, so its notes cover every
  shipped feature instead of a delta.
- `## Details` is optional and is **not** read by the update prompt; it is for
  the GitHub Release body and future plugin-detail update records.
- Review the notes in the same commit/PR as `package.json` and `CHANGELOG.md`.
  After the owner approves the exact Highlights, run
  `node scripts/release-notes-approval.mjs` and put the printed
  `Release-Notes-Review: sha256=<hash>` line in the release commit body.
  `publish.yml` recomputes the hash from the tagged tree and refuses a missing,
  duplicated or mismatched approval; editing either notes file after approval
  invalidates it, so the hash must be regenerated (and re-reviewed).
- **Never edit a release-notes file after its tag is pushed.** The tag-pinned
  URL is what users see; fixing a typo means a new version, not a retag.
- Older releases may omit the file; their card simply has no highlights and the
  card's inline details section says no highlights were published.
