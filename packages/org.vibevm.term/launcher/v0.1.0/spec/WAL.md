# WAL — vibe-launcher continuation state

## CHECKPOINT 2026-07-21 — CRATE MOVED + BUILD VERIFIED + PROP-043 PORTED (Phase 1)

**Phase:** 1 (packages move-in). **Status:** crate moved, build green,
normative contract ported. Phase 1 work for this package is complete.

**Landed so far:**
- C.1 — package skeleton: `vibe.toml` (kind=tool, requires.packages
  redbook + rust-ai-native static-transitive), `LICENSE.md` (UPL-1.0),
  `README.md`, workspace `Cargo.toml` (one member), crate `Cargo.toml`
  (three `[[bin]]` targets, workspace-inherited values), `.gitignore`,
  boot snippets, AGENTS/CLAUDE/GEMINI.
- C.2 — moved `crates/vibe-launcher/` verbatim from the host; moved the
  three icon families into `crates/vibe-launcher/assets/icons/`
  (sibling of `build.rs`); adapted `build.rs` path to
  `{manifest}/assets/icons/{ico}` and `rerun-if-changed=assets/icons/…`.
- C.3 — `cargo build -p vibe-launcher` GREEN. Verified live 2026-07-21:
  `vibe install --assume-yes` materialised 31 packages into `vibedeps/`
  (specmark = core-ai-native-specmark reachable through the renamed
  workspace dep); the build produced all three bin targets —
  `vibeterm.exe` (GUI-subsystem), `vibeframe.exe` (GUI-subsystem),
  `vibetree.exe` (console-subsystem for the in-place TUI path). The
  per-binary icon embed via embed-resource ran cleanly against the new
  sibling-path icons.
- C.4 — ported `PROP-043-gui-launchers.md` from
  `vibevm/spec/modules/vibe-launcher/`, rewritten under
  `spec://vibe-launcher/PROP-043#*`. Core REQs (resolve / spawn / report
  / registry / icon) unchanged from the host; `#self-install` rewritten
  for the extracted-product model (launchers publish themselves via this
  repo's Phase-2 version-manager, not via the host's `vibe self install`
  pipeline). Cross-references to the host's in-place-upgrade spec kept
  as `spec://vibevm/...` (host repo, cross-repo contract).

**Cross-repo fixup at the repo root:** added `rust-toolchain.toml`
(channel=stable + rustfmt + clippy) so a fresh checkout auto-installs
the toolchain via rustup, same as the host repo. Required for `cargo
build` to resolve a toolchain at all here.

**Next:** Phase 2 — `launcher/v0.1.0/bin/self.mjs` (the
version-manager entry, `product='launcher'`, `builder='cargo-vibe-launcher'`)
+ `scripts/install.mjs` wrapper +
`spec/modules/vibe-launcher/PROP-043-self-install.md` (the
extracted-product variant of `#self-install`). Blocked on the Phase-2
vvm port in term-common.

**Open:** none at the Phase-1 level. The crate is byte-identical to its
host-repo original modulo the `build.rs` path edit and the
`Cargo.toml` workspace-inheritance.
