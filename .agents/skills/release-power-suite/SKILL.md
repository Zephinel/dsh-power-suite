---
name: release-power-suite
description: "Release and publish the dsh-power-suite bundle: prepare the version, CHANGELOG, bilingual release notes, README/docs/verification pins, run the local gates, tag, watch Trusted Publishing, verify the registry and create the GitHub Release. Use only when the user explicitly asks to release/publish this repository, or asks to prepare a release that will be tagged later. Never create a tag or publish from a request that only changes code, docs, or a plugin page."
whenToUse: "发布插件, 发版, 出个版本, 发布 0.1.x, release, publish, cut a release, prepare a release, tag v0.1.x, npm publish, GitHub Release, 发布流程"
---

# Release Power Suite

This repository publishes `@zephinel/dsh-power-suite` to npm through a
tag-triggered Trusted Publishing workflow (`.github/workflows/publish.yml`).
This skill fixes the release procedure so a new session does not have to
rediscover it, and keeps the human approval gates explicit.

Facts that shape the procedure:

- **No build step.** `package.json` exports `src/index.js` and `src/client.js`
  directly; there is no `lib/`, no typecheck, and no generated artifact. Local
  gates are syntax/manifest/Node tests, the pack gate, the notes-approval check
  and the package-level `npm run check:release`.
- **No `docs/current-facts.json`** and no packed-byte fact remeasurement. Do not
  import the intelligent-ui build/current-facts steps.
- The in-app update prompt reads `release-notes/<version>.md` (and `.en.md`) from
  the **tag-pinned** raw URL, so the reviewed notes are literally what users see.
- The first public release is **0.1.0**; it absorbs all never-published
  development history (see the first-release note in step 1).

## Authorization (read first)

- **A change request is not a release request.** Adding a feature, fixing a bug,
  or editing docs/README/plugin pages never authorizes a version bump, tag,
  push, or publish.
- **Preparation and publishing are separate gates.** If the user says "prepare
  the release" or "把发布准备好", do step 1 below but stop before the tag and
  show the release-notes text for review. A version approval does not approve
  the Highlights wording: the notes review in step 1 is its own gate unless the
  owner explicitly waives it ("要点不用 review").
- **Tagging/publishing requires an explicit approval for the exact version**
  ("发布吧", "publish 0.1.0", "tag it"). Record the approved version in the
  commit and tag.
- Do not bump a version, create `release-notes/<version>*`, or rerun the publish
  workflow without that approval. Do not retag or republish an already-published
  version.
- This skill does not override product decisions, code review, or the separate
  docs-sync work a feature round may need
  (`.agents/skills/sync-power-suite-docs/SKILL.md`); it owns only the release
  branch of work.

## Preconditions

1. Confirm the target version with the user (stable semver). The first public
   release is `0.1.0`; later releases follow semver.
2. `git status --porcelain` is empty, the branch being released is merged to
   `main`, `main` is in sync with `origin/main`, and the latest CI run on `main`
   is green. If the repository has no `origin` yet, do the first-push setup
   first (`git remote add origin git@github.com:Zephinel/dsh-power-suite.git`,
   then push `main`) — that is not a release.
3. Read `docs/development.md`; it documents the local install/reload loop and
   the checks. This skill adds the repository-specific release gates and
   approval rules around it.
4. If the release includes code or locale changes, the feature branch is already
   merged and verified on `main`; browser e2e was run locally (CI has no browser
   job by design).
5. Check the current published state:
   ```bash
   node -p "require('./package.json').version"
   npm view @zephinel/dsh-power-suite version dist-tags --json --prefer-online
   git tag --sort=-v:refname | head -3
   ```
   A registry 404 is expected before the first publish; `latest` must otherwise
   point at a stable version.
6. `dsh` and `pnpm` are on PATH for the local package-level gate
   (`npm run check:release`); it packs, installs into a throwaway `$DSH_HOME`,
   boots an isolated Web instance and uninstalls without touching this profile.
7. **First publish only — bootstrap the npm package.** Trusted Publishing cannot
   be configured until the package exists on npm, so before the first tag:
   create the GitHub remote and push `main` (the workflow needs it), publish one
   prerelease by hand without claiming `latest`
   (`npm version <version>-rc.0 --no-git-tag-version && npm publish --access
   public --tag next && git checkout -- package.json package-lock.json`), then
   run the one-time `npm trust github …` setup below. `npm trust` needs npm
   >= 11.15.0, write access to the package and account-level 2FA, and refuses
   until the package exists. The tagged flow publishes the real version.

## 1. Prepare the release commit (no tag yet)

1. Decide the UTC release date. CHANGELOG section dates and the GitHub Release
   title use the **UTC** date; the local timezone may be a day ahead.
2. `package.json` / `package-lock.json`: set `version` (both the root field and
   `packages[""].version` in the lockfile). Before the first publish also
   confirm the publish metadata is in place: name `@zephinel/dsh-power-suite`,
   `repository` pointing at `https://github.com/Zephinel/dsh-power-suite`,
   `publishConfig.access: "public"`, `files` containing `release-notes`, and the
   `check:release-notes` script. **Remove `"private": true`** during release
   preparation (never in a feature commit) and run
   `node scripts/check-publish-manifest.mjs`; `publish.yml` runs the same gate
   right after the tag check and refuses a private or incomplete package before
   `npm publish`.
3. **CHANGELOG timing (approved 2026-11-15):** keep the release entries under
   `## [Unreleased]` through the tag and publish — `publish.yml` accepts a
   version named in that section. After the release is published, move the
   released entries into `## [<version>] - <UTC date>` in a docs-only follow-up
   and leave an empty `## [Unreleased]` in place. Never rewrite an
   already-released section.
   - **First release (0.1.0) only:** the never-published development snapshots
     (`0.1.0`/`0.1.1` dated sections and `0.2.0` undated) are already merged
     into the single `## [Unreleased]` section; do not recreate them as
     separate releases. Its Highlights cover every shipped feature, not a
     delta.
4. `release-notes/<version>.md` (required, Chinese default) and optional
   `release-notes/<version>.en.md`:
   - `## Highlights` with **2–6 short, user-facing bullets**; the update prompt
     renders them verbatim, so no implementation detail unless the user wants
     it. Write from the user's side, not the diff's.
   - The publish workflow refuses a tag whose default file is missing or has no
     Highlights; the English file is validated when present and falls back to
     the default file when absent.
   - See `release-notes/README.md` for the full format rules.
5. Update current version/status claims:
   - README status block and install text (package name, first-release framing);
   - `docs/development.md` if it names a version/tag example;
   - `docs/verification.md` with the release evidence record (see step 5).
   There is no build step and no `docs/current-facts.json` in this repository, so
   there is no packed-fact remeasurement to run.
6. **Notes review gate (never skipped implicitly).** Show the complete
   `release-notes/<version>.md` Highlights (plus `.en.md` when present) to the
   owner and wait for an explicit approve-or-changes answer before section 2 —
   even when the owner's message already named the version ("发布 0.1.0"). These
   bullets render verbatim in the update prompt and the tag pins them, so a
   wording fix after the tag is impossible. After approval run
   `node scripts/release-notes-approval.mjs`: it reprints the reviewed bullets
   and a `Release-Notes-Review: sha256=<hash>` line. Put that line in the
   release commit body (the commit that gets tagged): the hash covers the
   version plus both notes files, so any later notes edit invalidates the
   approval and `publish.yml` refuses to publish. Only an explicit
   "要点没问题 / skip the review" waives this gate.

## 2. Commit the prepared tree, then run the gates

Create the release commit first, with the `Release-Notes-Review: sha256=<hash>`
line in its body (that commit is the one that gets tagged), then run all of
these from it:

```bash
npm run check                 # syntax + manifest + docs links + Node tests + release notes
npm run check:docs-links      # the docs-only link gate, recorded explicitly
npm run check:release-notes   # Highlights in default + optional English file
node scripts/release-notes-approval.mjs --verify  # the release commit carries the approved notes hash
node scripts/check-publish-manifest.mjs  # after removing "private": true
npm run pack:check            # npm pack --dry-run --json; inspect the file list
npm run check:release         # package-level install/boot/byte-identity/uninstall (local, needs dsh + pnpm)
git diff --check
```

- `npm run check` already includes `pack:check`; run both so the release log
  records the packed manifest explicitly.
- `npm run check:release` is intentionally not in CI (its Linux runner behaviour
  is unverified); run it locally before the tag. It never reads or writes this
  profile or the running service.
- `node scripts/release-notes-approval.mjs --verify` reads HEAD, so run it after
  the release commit exists; it fails when the body has no approval line, has it
  twice, or when the notes changed after approval.
- **Browser e2e stays local.** `test/browser/annotation.e2e.mjs`,
  `test/browser/sidebar.e2e.mjs` and `test/browser/update-prompt.e2e.mjs` drive a
  real running DSH Web GUI with a real Chrome, so they are not in CI. Run the
  relevant suite locally when the release touches their areas (the update-prompt
  harness stubs only the update route and needs the GUI + token URL):
  ```bash
  node test/browser/annotation.e2e.mjs
  node test/browser/sidebar.e2e.mjs
  node test/browser/update-prompt.e2e.mjs
  ```
- Push `main` and wait for CI (`verify`) to be green before tagging. A
  push-triggered `verify` run is not the publish gate; the tag reruns its own
  checks.

## 3. Tag and publish

Only after explicit approval of the exact version and release-notes text:

```bash
git tag -a v<version> -m "<version> — <UTC date>"
git push origin v<version>
```

Rules:

- Use an **annotated** tag (`git tag -a`); publish tags are annotated.
- The tag must match `package.json`; `publish.yml` rejects a mismatch.
- Do not use `--follow-tags` from an unrelated commit: push the tag explicitly
  so the workflow runs exactly once for this version.
- The tagged commit must carry exactly one
  `Release-Notes-Review: sha256=<hash>` line matching the committed notes;
  `publish.yml` recomputes the hash and refuses a missing, duplicated or
  mismatched approval. Editing the notes after the approval line is generated
  invalidates it — regenerate (and re-review) before tagging.
- The workflow reruns `npm run check`, `pack:check`, the CHANGELOG section
  check, `check:release-notes` and the notes-approval verification, then
  publishes with OIDC + provenance. There is **no `NODE_AUTH_TOKEN`**; never add
  or print one.
- One-time npm setup (package owner, needs npm >= 11.15.0 and account 2FA;
  first publish: run the bootstrap in Preconditions first, because `npm trust`
  refuses until the package exists) — either the CLI:
  ```bash
  npm login
  npm trust github @zephinel/dsh-power-suite --file publish.yml \
    --repo Zephinel/dsh-power-suite --allow-publish --yes
  ```
  or npmjs.com → the package → Settings → Trusted Publishing → GitHub Actions
  (repository `Zephinel/dsh-power-suite`, workflow `publish.yml`).

## 4. Watch the publish workflow

```bash
gh run list --workflow=publish.yml --limit 1 --json databaseId,status,headSha
gh run watch <run-id> --exit-status --interval 10
```

- npm propagation is eventual: the version endpoint and `dist-tags` can lag
  several minutes. `publish.yml` polls the registry endpoints for up to
  **10 minutes**. Do not conclude publish failed from a stale `npm view` in the
  first minutes.
- If the publish step itself succeeded but the verify step failed, check the
  registry directly before reacting:
  ```bash
  curl -fsS "https://registry.npmjs.org/-/package/@zephinel%2Fdsh-power-suite/dist-tags"
  curl -sS -o /dev/null -w '%{http_code}\n' "https://registry.npmjs.org/@zephinel%2Fdsh-power-suite/<version>"
  ```
  Do **not** rerun the tag workflow to "fix" a propagation lag: it may attempt to
  republish the same version. Never delete, amend, or retag a published tag.
- Verify once settled:
  ```bash
  npm view @zephinel/dsh-power-suite version dist-tags --json --prefer-online
  curl -sS "https://registry.npmjs.org/@zephinel/dsh-power-suite/<version>"   # check dist.attestations.provenance
  ```
  A temporary install + `npm audit signatures` is optional but useful for
  provenance.

## 5. Post-publish

1. Create the GitHub Release (the workflow does not do this), with both notes
   files as the body:
   ```bash
   { cat release-notes/<version>.md; echo; echo "---"; echo; cat release-notes/<version>.en.md; } > /tmp/release-<version>.md
   gh release create v<version> --title "<version> — <UTC date>" --notes-file /tmp/release-<version>.md
   ```
2. Verify the tag-pinned raw notes are readable — the in-app update prompt
   fetches exactly these URLs:
   ```bash
   curl -fsS "https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v<version>/release-notes/<version>.md" >/dev/null
   curl -fsS "https://raw.githubusercontent.com/Zephinel/dsh-power-suite/v<version>/release-notes/<version>.en.md" >/dev/null
   ```
3. Move the released entries out of `## [Unreleased]` into
   `## [<version>] - <UTC date>` (the approved post-publish CHANGELOG move) and
   record the release result in `docs/verification.md` (workflow run ID, npm
   `latest`, provenance, GitHub Release URL, notes URL check) in the same
   docs-only follow-up. Run `.agents/skills/sync-power-suite-docs/SKILL.md` in
   delta mode for the README/CHANGELOG/verification updates in that follow-up.
   **Do not bump the version.**
4. If the release was prompted by an issue, comment with the fixed version and
   evidence, then close it if the reporter's scenario is resolved.
5. The update prompt only starts appearing for users after the **next** release:
   an installed 0.1.0 sees the prompt when 0.2.0 becomes npm `latest`. This is
   expected behavior, not a release failure.

## Don't

- Don't tag or publish while release-notes are still draft or without the
  exact-version approval.
- Don't treat an exact-version approval as sign-off on the Highlights: the notes
  review is a separate gate unless the owner explicitly waives it.
- Don't tag a release commit without the `Release-Notes-Review: sha256=<hash>`
  line, and don't edit the notes after approval — `publish.yml` refuses either.
- Don't `npm publish` locally; Trusted Publishing is the only path.
- Don't amend, delete, or retag an already-published tag.
- Don't rewrite released CHANGELOG sections; add a new Unreleased entry for a
  fix.
- Don't tag from a tree where `node scripts/check-publish-manifest.mjs` fails
  (in particular a still-`private` package).
- Don't recreate the never-published development snapshots (`0.1.1`, `0.2.0`,
  `0.3.0`-era history) as separate releases; the first public release is 0.1.0.
- Don't treat a short registry lag or a stale client page as a failed release;
  verify the registry endpoints first.
- Don't add a build step or a `docs/current-facts.json` to "match" another
  repository; this package ships `src/` directly.
- Don't change behavior to make a document match; that is implementation, not
  this skill.
