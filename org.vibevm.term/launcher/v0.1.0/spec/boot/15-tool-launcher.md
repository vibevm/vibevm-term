<!-- vibe:static org.vibevm.term/launcher — boot snippet, slot 15 -->

# Tool: vibe-launcher — the GUI spawn wrappers over `vibe` {#root}

`vibe-launcher` is the **GUI launcher trio** of the vibevm-term products:
`vibetree`, `vibeterm`, `vibeframe`. Three thin Windows-GUI-subsystem
binaries that spawn the host's console-subsystem `vibe` without a
console flash, and surface any failure (vibe not found, vibe exited
non-zero) in a native dialog.

## What the launchers do

| Binary       | Calls          | Subsystem | Purpose                                       |
|--------------|----------------|-----------|-----------------------------------------------|
| `vibetree`   | `vibe tree -t` | console   | Tree TUI in place in a terminal; window on double-click. |
| `vibeterm`   | `vibe term`    | GUI       | Opens the complex terminal workspace.         |
| `vibeframe`  | `vibe frame`   | GUI       | Opens the simple terminal frame.              |

All three are one-liners over the shared core in `crates/vibe-launcher/src/lib.rs`
(`run` / `run_terminal_aware`). The heavy work — resolving the terminal
app, spawning the PTY, etc. — lives in `vibe` (host repo); the launcher
only resolves `vibe` itself, spawns it with `CREATE_NO_WINDOW`, and
reports failures.

## Discipline

The package adopts the AI-Native Rust discipline from birth via
`requires.packages` (static-transitive) — redbook + rust-ai-native —
mirroring `packages/org.vibevm.fractality/` in the host. `scope!` /
`spec!` specmark traceability to `spec://vibe-launcher/PROP-043#*`,
`thiserror` typed errors, no AI attribution.

## Cross-repo integration

The launchers call `vibe` (the host repo CLI). They resolve it the same
way the host's `vibe` shim does: `$VIBEVM_HOME` → `~/opt/vibevm/current`
pointer → `PATH` (host repo, cross-repo contract — the canonical
statement is `spec://vibevm/modules/vibe-launcher/PROP-043#resolve` in
the host repo, which this repo's `PROP-043` mirrors and supersedes for
the extracted-product context).
