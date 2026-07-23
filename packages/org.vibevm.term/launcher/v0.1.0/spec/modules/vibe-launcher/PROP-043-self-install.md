# PROP-043-self-install — launcher self install {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `vibe-launcher`.
**Genre:** contract. **Provenance:** the host's removed `vvm/launchers.rs`
(the `NativeLauncherInstaller` that built + placed + shortcut the three
launchers on `vibe self update`), now a self-install in the products repo.
**Related:** [PROP-vvm](../../../common/v0.1.0/spec/modules/term-common/PROP-vvm.md)
(the version-manager), [PROP-path-install](../../../common/v0.1.0/spec/modules/term-common/PROP-path-install.md)
(placement + shortcuts), [PROP-043](PROP-043-gui-launchers.md) (the launcher
crate itself — what gets installed).

This contract governs **vibe-launcher's self-install** — how `launcher self
install` builds the three GUI launcher exes (vibetree, vibeterm, vibeframe),
places them on `PATH`, and creates their Start-menu shortcuts. The host's
`vibe self update` used to do this; the products-repo version-manager now
owns it (the host no longer ships the launcher crate).

---

## 1. The three-exes-one-instance model {#three-exes}

REQ {#single-crate}. The three launchers are **one crate's** three bin
targets — `vibetree`, `vibeterm`, `vibeframe`. A single `cargo build
--release -p vibe-launcher` produces all three in `<build>/release/`. They
share a source checkout and a single install record.

REQ {#single-instance}. One `launcher self install` makes **one** instance
(`~/opt/launcher/versions/<kind>/<id>/<n>/`) that carries all three exes
at its root (no `<app>/` subdir — the launcher exes are not packaged
Electron apps). One manifest, one `current` pointer, one version id.

REQ {#three-shims}. Each exe gets its **own** on-PATH shim:
`~/opt/bin/vibetree` / `vibeterm` / `vibeframe` (POSIX) or the matching
`.cmd` (Windows). Each shim reads the same `~/opt/launcher/current` and
execs its own exe from the active instance.

REQ {#three-shortcuts}. Each exe gets its **own** desktop shortcut:
`VibeTree`, `VibeTerm`, `VibeFrame` (Windows: three `.lnk` files in the
`vibevm` Start-menu group; Linux: three `.desktop` files; macOS: three
`.app` bundles).

## 2. The build pipeline {#build}

REQ {#cargo-build}. The build is `cargo build [--release] -p vibe-launcher
--target-dir <build>` in the launcher package root (`launcher/v0.1.0/`),
honouring the tree's `rust-toolchain.toml`. The build runs into the
version-manager-managed `<build>` dir, never the source tree's own `target/`
(keeps the dev tree clean and, load-bearing on Windows, avoids relinking an
exe that is running).

REQ {#profile-default}. The default build profile is `release` (a launcher
is a shipped binary — debug overhead is pointless). `--debug` overrides.

REQ {#dist-set}. The dist set is three `(absSrc, "<stem>(.exe)")` pairs —
one per built exe. The launcher productType's `LauncherBuilder` walks the
three configured stems and surfaces whichever exes the build produced.

## 3. The CLI surface {#cli}

REQ {#entry-point}. `launcher/v0.1.0/bin/self.mjs` is the entry — a thin
wrapper that resolves term-common's `vvmMain` (relative import to the
sibling `common/v0.1.0/vvm/cli.mjs`), wires a `LauncherBuilder`, and
dispatches every `launcher self <verb>` to it.

REQ {#install-wrapper}. `launcher/v0.1.0/scripts/install.mjs` is a thin
alias for `node bin/self.mjs install`.

REQ {#verb-set}. The full verb set (`install | update | use | ls | current |
which | doctor | remove | gc | env | relocate`) is provided by `vvmMain`.
`doctor` probes `cargo` (not Node + npm — the launcher is a Rust product).

## 4. Never {#never}

- Never ship the three launchers as three separate products — they share
  one crate, one instance, one record. Three exes, one install.
- Never block an install on a per-launcher shortcut failure — note and
  continue (the on-PATH shim is the real integration).
- Never rebuild the launcher into the source tree's own `target/` — use the
  version-manager-managed `<build>` dir.
