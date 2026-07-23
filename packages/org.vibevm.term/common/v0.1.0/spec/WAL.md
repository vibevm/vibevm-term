# WAL — term-common continuation state

## CHECKPOINT 2026-07-23 — REAL-BUILD VERIFY PASSED (all 3 products install)

**Phase:** 2b real-build verification. **Status:** all three products now
`<product> self install` end-to-end on a real host (Windows, `~/opt`):
`launcher` (3 Rust exes — vibetree/vibeterm/vibeframe), `vibeterm` (Electron
packaged app), `vibeframe` (Electron packaged app). Each creates its instance,
flips `current`, places its exe(s) in `~/opt/bin/`, and creates Start-menu
shortcuts. `vibe tree -t` resolves vibeframe through the PATH tier. Two
build-fix bugs found and fixed: (1) `vvm/cli.mjs:doInstall` ignored
`config.sourceRoot` and walked up to the workspace `vibe.toml` — the launcher
install ran cargo in the wrong dir; now `config.sourceRoot` wins (`e181c35`).
(2) the Electron apps' `file:../../common/v0.1.0` dep resolved to
`<product>/common/...` (wrong — common sits one level higher); bumped to
`file:../../../common/v0.1.0` so the symlink lands on the real common pkg
(`33421dc`). **One known caveat:** `electron-packager` shares a temp cache
under `os.tmpdir()`; two concurrent `<product> self install` runs race on the
`win32-x64-template` rename. Sequential installs are fine — run them one at a
time, not in parallel. **No blocker. Next:** the version-manager is fully
exercised; nothing pending.

## CHECKPOINT 2026-07-21 — VERSION-MANAGER PORT LANDED (Phase 2b)

**Phase:** 2b. **Status:** the ported version-manager (`vvm/`, twin of the host's `vibe self`,
spec://vibevm/common/PROP-019) landed in term-common — **15 files**, **4 commits** in the package
(`2cd06e1` vvm port + tests · `0c96d74` normative PROPs · `4a4383c` vibeterm/vibeframe self CLIs ·
`a773e5b` launcher self CLI). The full verb set (install | update | use | ls | current | which |
doctor | remove | gc | env | relocate), cross-platform placement (Win .lnk + Linux .desktop +
macOS .app + rename-aside), and the diff-copy placement + dedup-skip + source-provenance relocate
ported 1-for-1 from the host Rust. **Tests:** 12 new vvm tests (model parse, store round-trip,
instance-path nesting, monotonic alloc, the current pointer, state.toml + manifest TOML round-trips,
diff-copy place, the dedup-skip + force-rebuild install pipeline, the relocate oracle, pathWithPrefix);
the full 53-test common suite green. **End-to-end smoke (via fake builder):** install → ls → current →
which --json → install-again (dedup-skip fires) → relocate (repoint provenance) — all green. **Normative
contracts:** `PROP-vvm` (the ported version-manager twin) + `PROP-path-install` (placement + shortcuts)
join the term-common contract set. **Product CLIs:** vibeterm/vibeframe/launcher each get
`bin/self.mjs` + `scripts/install.mjs` + a `PROP-self-install.md`. **No blocker. Next:** real-build
verification (`vibeterm self install` on a fresh `~/opt`) once the owner wires the actual Electron
packaging / cargo build paths; conformance-golden between Rust `vibe-vvm` and TS `term-vvm` is a
follow-up (the contracts agree by construction today).

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
