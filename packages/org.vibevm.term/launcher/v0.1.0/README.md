# vibe-launcher

The **GUI launchers** of the vibevm-term products: `vibetree`, `vibeterm`,
`vibeframe`. Three thin Windows-GUI-subsystem binaries that spawn `vibe`
(the host CLI) without a console flash and surface any failure in a
native dialog.

## Why this exists

`vibe` is a **console-subsystem** program. When a user double-clicks an
icon that should run `vibe tree -t` (or `vibe term`, `vibe frame`),
Windows gives the child a fresh console — which flashes black on screen
behind the real GUI. A launcher is a `windows_subsystem = "windows"`
binary that calls `vibe` with `CREATE_NO_WINDOW`, eliminating the flash.
On failure (vibe not found, vibe exited non-zero) it shows a `MessageBoxW`
so the user sees the error rather than a silent no-op.

## The three launchers

| Binary       | Calls              | Subsystem | Purpose                                   |
|--------------|--------------------|-----------|-------------------------------------------|
| `vibetree`   | `vibe tree -t`     | console   | Runs the tree TUI in place in a terminal; spawns a window on double-click. |
| `vibeterm`   | `vibe term`        | GUI       | Opens the complex terminal workspace.    |
| `vibeframe`  | `vibe frame`       | GUI       | Opens the simple terminal frame.         |

All three are `[[bin]]` targets of one crate (`vibe-launcher`); each is a
one-liner over the shared core in `src/lib.rs` (`run` / `run_terminal_aware`).

## Layout

```
launcher/v0.1.0/
├── vibe.toml                       # tool package manifest
├── Cargo.toml                      # workspace (one member: crates/vibe-launcher)
├── crates/vibe-launcher/
│   ├── Cargo.toml                  # the crate (three [[bin]] targets)
│   ├── src/
│   │   ├── lib.rs                  # shared core: resolve_vibe, CREATE_NO_WINDOW, MessageBoxW
│   │   └── bin/{vibetree,vibeterm,vibeframe}.rs
│   ├── build.rs                    # per-binary icon embed via embed-resource
│   └── assets/icons/               # the .ico files (sibling of build.rs)
└── spec/
    ├── boot/
    └── modules/vibe-launcher/PROP-043-gui-launchers.md
```

## Build

The crate is a Cargo workspace. From this directory:

```sh
cargo build -p vibe-launcher              # debug
cargo build -p vibe-launcher --release    # release (for install)
```

The `vibedeps/` directory (vendored static deps — AI-Native Rust stack,
which includes `specmark`) is populated by `vibe install` in this
directory. Without it, `cargo build` fails resolving `specmark`; run
`vibe install` first.

## Discipline

The package adopts the AI-Native Rust discipline from birth via
`requires.packages` (static-transitive) — redbook + rust-ai-native —
mirroring `packages/org.vibevm.fractality/` in the host. `scope!` /
`spec!` specmark traceability to spec anchors, `thiserror` typed errors,
no AI attribution.
