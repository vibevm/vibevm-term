# WAL — term-common continuation state

## CHECKPOINT 2026-07-21 — SHARED LAYER COMPLETE (Phase 1)

**Phase:** 1 (packages move-in). **Status:** the shared layer — helpers
+ contracts — is complete; Phase-2 version-manager port pending.

**Landed so far:**
- B.1 — package skeleton: `vibe.toml` (kind=tool, requires.packages
  redbook ^0.2.0 + rust-ai-native ^0.7.0 static-transitive), `LICENSE.md`
  (UPL-1.0), `README.md`, `package.json` (@org.vibevm/term-common, ESM,
  exports map), `tsconfig.json` (AI-Native strict floor), `.gitignore`,
  boot snippets, AGENTS/CLAUDE/GEMINI.
- B.2 — `src/{args,keymap}.mjs` + barrel `src/index.mjs` + ported tests
  (`node --test` = 41/41 green).
- B.3 — `src/packaging.mjs`: `packageApp({ appDir, appName, outDir })` +
  `packageCli()` (realpath-stable isMain guard). Generalized from the
  per-app originals; the only axis that differed was the literal app
  name.
- B.4 — six normative shared contracts under `spec/modules/term-common/`,
  each anchored `{#root}` + per-section anchors, with provenance pointers
  to the host repo (cross-repo contracts):
  - `PROP-control-protocol.md` — the loopback HTTP+JSON control surface.
  - `PROP-discovery.md` — the `~/.vibe/aiui/<pid>.json` + `latest.json`
    discovery file.
  - `PROP-icon-osc.md` — the OSC 7773 window-icon swap protocol.
  - `PROP-pty-lifecycle.md` — the main-process pty + graceful teardown.
  - `PROP-env-markers.md` — `$VIBETERM` / `$VIBEFRAME` in-PTY markers.
  - `PROP-electron-packaging.md` — the relocatable packaged-app layout.

**Next:** Phase-2 version-manager port — `vvm/{store,model,placer,
builder,install,relocate,env,doctor,cli}.mjs` (the TS port of the host's
`crates/vibe-cli/src/commands/vvm/`) + `PROP-vvm.md` (the ported PROP-019
contract) + `PROP-path-install.md`. Blocked on Phase 1 finishing across
the other packages (launcher, vibeterm, vibeframe).

**Open:** the AI-Native static deps (`vibedeps/`) are not yet populated
— run `vibe install` in this package after the rest of Phase 1 lands to
populate them (or fall back to copying vendored trees from
`packages/org.vibevm.fractality/fractality/v0.1.0/vibedeps/` in the host
repo).
