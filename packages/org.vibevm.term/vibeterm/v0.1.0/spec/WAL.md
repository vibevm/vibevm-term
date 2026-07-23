# WAL — vibeterm continuation state

## CHECKPOINT 2026-07-21 — NORMATIVE + HISTORY LAYER COMPLETE (Phase 1)

**Phase:** 1 (packages move-in). **Status:** the vibeterm package is
Phase-1 complete — app + skeleton (D.1/D.2), term-common refactor (D.3),
normative specs (D.4), campaign history (D.5), icon scratchpad (D.6)
all landed. Phase 2 (`bin/self.mjs` version-manager entry) is blocked on
the term-common vvm port.

**Landed so far:**
- D.1 — package skeleton: vibe.toml (kind=app, requires redbook +
  rust-ai-native static-transitive + term-common =0.1.0), LICENSE
  (UPL-1.0), .gitignore, boot snippets, AGENTS/CLAUDE/GEMINI, WAL.
- D.2 — moved apps/vibeterm/ → app/ verbatim via tar (excluded
  node_modules/, dist/, build/, package-lock.json).
- D.3 — refactor: app/main.cjs imports from `@org.vibevm/term-common`;
  removed app/lib/, app/test/, test:lib script; app/scripts/package.mjs
  is now a thin wrapper over term-common's packageApp.
- D.4 — ported the vibeterm PROP family + lore from
  vibevm/spec/modules/vibeterm/ (PROP-044/046/047 + architecture.md +
  design-system.md). URIs were already in the short `spec://vibeterm/`
  form; relative paths rewritten (apps/vibeterm/ → app/;
  ../../../research/vibeterm/ → ../../research/).
- D.5 — moved campaign history: terraforms/{TERMINAL-AIUI-PLAN,
  VIBE-LAUNCHERS-PLAN}-v0.1.md (2), research/{VIBETERM-SHELL-PLAN,
  VIBETERM-UI-ARCHITECTURE-RESEARCH-PLAN, vibeterm-ui-architecture-
  findings, VIBEFRAME-SPLIT-PLAN}-v0.1.md + task.md (5), manual-tests/
  {MT-04-vibeterm-tui-dev, MT-05-aiui-visual-testing}.md (2). Total 9
  files. Operative test doc MT-04 had its apps/vibeterm/ refs rewritten
  to app/; the campaign plans retain their historical phrasing (they
  are lore, not normative).
- D.6 — moved the terminal icon scratchpad: ideas-icons/vibeterm/ (45
  files: gen.mjs, gen-combo.mjs, README, ~40 PNG/SVG variants) +
  enlarged-attempts/{vibeterm-enlarged.{png,svg}, README.md}.

**Next (Phase 2, blocked on term-common vvm port):**
- `bin/self.mjs` — `vibeterm self install|update|use|ls|current|which|
  doctor|remove|gc|env|relocate` dispatcher into the common vvm with
  `product='vibeterm'`, `builder='electron-app'`.
- `scripts/install.mjs` — thin wrapper.
- `spec/modules/vibeterm/PROP-self-install.md` — the
  extracted-product self-install contract (packaged exe via
  `@electron/packager`, GUI-subsystem, version-manager model).

**Open:** none at the Phase-1 level. The package is a complete,
self-contained representation of the vibeterm product; the host repo
originals are untouched (Phase 2 deletes them).
