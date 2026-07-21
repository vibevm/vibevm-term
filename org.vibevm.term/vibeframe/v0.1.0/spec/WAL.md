# WAL — vibeframe continuation state

## CHECKPOINT 2026-07-21 — PHASE 1 COMPLETE

**Phase:** 1 (packages move-in). **Status:** the vibeframe package is
Phase-1 complete — skeleton + app + term-common refactor + PROP-045 all
landed. Phase 2 (`bin/self.mjs` version-manager entry) is blocked on the
term-common vvm port.

**Landed so far:**
- E.1 — package skeleton: vibe.toml (kind=app, requires redbook +
  rust-ai-native static-transitive + term-common =0.1.0), LICENSE
  (UPL-1.0), .gitignore, boot snippets (INDEX/00-core/20-app-vibeframe),
  WAL, AGENTS/CLAUDE/GEMINI boot-stubs.
- E.2 — moved apps/vibeframe/ → app/ verbatim via tar (excluded
  node_modules/, dist/, build/, package-lock.json). 13 files: main.cjs,
  renderer.js, index.html, package.json, lib/, test/, scripts/, resources/.
- E.3 — refactor: app/main.cjs imports from `@org.vibevm/term-common`;
  removed app/lib/, app/test/; the `test` npm script (the lib-only
  `node --test`) dropped; app/scripts/package.mjs is now a thin wrapper
  over term-common's packageApp (with `app='vibeframe'`).
- E.4 — ported PROP-045-simple-terminal-frame.md from
  vibevm/spec/modules/vibeframe/, rewritten under
  `spec://vibeframe/PROP-045#*`. Role / identity / sibling-relationship
  REQs (§1, §3, §5, non-goals) unchanged from the host; §2 (routing) and
  §4 (packaging & install) rewritten for the extracted-product model —
  vibeframe is now an external product that publishes itself to PATH via
  this repo's Phase-2 version-manager, not a sub-tree the host's `vibe
  self install` packages into its instance. Cross-references to the host
  spec (PROP-042) kept as cross-repo contracts; cross-references to
  term-common contracts and to vibeterm/vibe-launcher specs use the
  short `spec://…` form.

**Next (Phase 2, blocked on term-common vvm port):**
- `bin/self.mjs` — `vibeframe self install|update|use|ls|current|which|
  doctor|remove|gc|env|relocate` dispatcher into the common vvm with
  `product='vibeframe'`, `builder='electron-app'`.
- `scripts/install.mjs` — thin wrapper.
- `spec/modules/vibeframe/PROP-self-install.md` — the
  extracted-product self-install contract.

**Open:** none at the Phase-1 level. The package is a complete,
self-contained representation of the vibeframe product; the host repo
originals are untouched (Phase 2 deletes them).
