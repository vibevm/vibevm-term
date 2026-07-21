# WAL — vibe-launcher continuation state

## CHECKPOINT 2026-07-21 — CRATE MOVED IN (Phase 1)

**Phase:** 1 (packages move-in). **Status:** crate + icons moved; build
verification pending on `vibe install` populating `vibedeps/`.

**Landed so far:**
- C.1 — package skeleton: `vibe.toml` (kind=tool, requires.packages
  redbook + rust-ai-native static-transitive), `LICENSE.md` (UPL-1.0),
  `README.md`, workspace `Cargo.toml` (one member), crate `Cargo.toml`
  (three `[[bin]]` targets, workspace-inherited values), `.gitignore`,
  boot snippets, AGENTS/CLAUDE/GEMINI.
- C.2 — moved `crates/vibe-launcher/` целиком from
  `vibevm/crates/vibe-launcher/`: `src/{lib.rs,bin/{vibetree,vibeterm,
  vibeframe}.rs}`, `build.rs`, `Cargo.toml`. Moved the three icon
  families (`vibetree/vibeterm/vibeframe.{ico,png,svg}`) from
  `vibevm/assets/icons/` into `crates/vibe-launcher/assets/icons/`
  (sibling of `build.rs`, not `../../` as before). Adapted `build.rs`
  path: `{manifest}/assets/icons/{ico}` (was `{manifest}/../../assets/
  icons/{ico}`) and `rerun-if-changed=assets/icons/{ico}` (was
  `../../assets/icons/{ico}`).

**Next:**
- C.3 — run `vibe install` in this directory to populate `vibedeps/`
  (specmark + thiserror come from there), then `cargo build -p
  vibe-launcher` (debug) to verify the three bin targets build with
  their per-binary icon embed. BLOCKED on the install resolving — if it
  fails, fall back to copying vendored trees from
  `packages/org.vibevm.fractality/fractality/v0.1.0/vibedeps/` in the
  host.
- C.4 — port `PROP-043-gui-launchers.md` from
  `vibevm/spec/modules/vibe-launcher/` with the URI rewrite
  (`spec://vibevm/modules/vibe-launcher/PROP-043#*` →
  `spec://vibe-launcher/PROP-043#*`) and the extracted-product
  adjustments (drop the `#self-install` REQs — the host's vibe pipeline
  no longer builds these; the Phase-2 `PROP-043-self-install` is their
  replacement).
- C.5 — this WAL, finalised for Phase 1.

**Open:** none at the skeleton level. The crate is byte-identical to
its host-repo original except for the `build.rs` path edit and the
`Cargo.toml` workspace- inheritance (which compiles to the same values
the host workspace provided).
