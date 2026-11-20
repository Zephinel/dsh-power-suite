# Repository agent instructions

- **Release / publish work:** load `.agents/skills/release-power-suite/SKILL.md` before changing a version, release notes, tags, or publishing. A code/docs/page change is not a release request; preparation and tagging are separate approval gates, and tagging/publishing needs the user's explicit approval for the exact version.
- **Documentation sync:** load `.agents/skills/sync-power-suite-docs/SKILL.md` after behavior, user-visible copy, settings, counts, install steps, or release-state changes, and when a docs or consistency check fails.
- Keep `README.md` portable (no GitHub `> [!` alerts) and `docs/` links valid inside the npm tarball; in `docs/verification.md`, only `## Automated` is live — dated rounds below it are historical evidence.
