# WAL — vibeterm continuation state

## CHECKPOINT 2026-07-21 — APP + SKELETON MOVED IN (Phase 1, in progress)

**Phase:** 1 (packages move-in). **Status:** app + skeleton landed;
term-common refactor pending; specs/terraform/MT/icons pending.

**Landed so far:**
- D.1 — package skeleton rewritten: `vibe.toml` (kind=app, requires
  redbook + rust-ai-native static-transitive + term-common =0.1.0),
  `LICENSE.md` (UPL-1.0), `.gitignore`, boot snippets
  (INDEX/00-core/20-app-vibeterm), AGENTS/CLAUDE/GEMINI boot-stubs.
- D.2 — moved `apps/vibeterm/` → `app/` verbatim via tar (excluded
  node_modules/, dist/, build/, package-lock.json). 49 files: main.cjs,
  preload.{cjs,d.ts}, index.html, package.json, lib/, src/{engine,
  chrome}/, terminal-view/, test/, scripts/, resources/, vite/vitest/
  tsconfig. Originals in the host repo are untouched (this is a copy,
  not a move — Phase 2 deletes the host originals).

**Next:**
- D.3 — refactor: remove `app/lib/{args,keymap}.mjs`, rewrite
  `app/main.cjs` (and any other consumers) to import from
  `@org.vibevm/term-common/args` and `/keymap`; add
  `"@org.vibevm/term-common": "file:../../common/v0.1.0"` to
  `app/package.json` deps; reduce `app/scripts/package.mjs` to a thin
  wrapper over `packageApp`; remove the now-duplicate lib tests from
  `app/test/` (they live in term-common now).
- D.4 — port the vibeterm PROP family + lore from
  `vibevm/spec/modules/vibeterm/` with the URI rewrite
  (`spec://vibevm/modules/vibeterm/PROP-044|046|047#*` →
  `spec://vibeterm/PROP-044|046|047#*`).
- D.5 — move the campaign history (terraforms/research/manual-tests).
- D.6 — move the terminal icon scratchpads (`ideas-icons/vibeterm/`,
  `enlarged-attempts/vibeterm-enlarged.*`).
- D.7 — this WAL, finalised for Phase 1.

**Open:** none at the skeleton level. The app is byte-identical to its
host-repo original; the D.3 refactor will introduce the first semantic
change (term-common imports).
