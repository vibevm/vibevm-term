# PROP-path-install — on-PATH placement + desktop shortcuts {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** the host's removed `launchers.rs`
(`NativeLauncherInstaller.place_exe` / `install_shortcut` / `sweep_sidecars`),
extended for Linux (`.desktop`) and macOS (`.app`). **Related:**
[PROP-vvm](PROP-vvm.md) (the version-manager that calls this),
[PROP-electron-packaging](PROP-electron-packaging.md) (the packaged dir that
gets placed), [the implementation](../../vvm/shortcuts.mjs).

This contract governs the **machine-touching side of an install**: how the
active instance's binary reaches `PATH`, how a desktop shortcut is created
for it, and how a running (locked) binary is updated without a close+restart.
The version-manager calls these helpers; they are best-effort by contract —
a shortcut failure is a note, never an install failure (the on-PATH shim is
the real integration; the shortcut is a convenience).

---

## 1. The shim dir {#shim-dir}

REQ {#shim-shared}. Every product shares one shim dir:
`<installRoot>/bin/`. A product's `self use` writes its own
`<installRoot>/bin/<product>` (POSIX) or `<product>.cmd` (Windows) there.
The shim reads `<installRoot>/<product>/current` at exec time and runs the
active binary — so a `self use` flip is instant.

REQ {#shim-on-path}. `<installRoot>/bin` MUST be on `PATH` for the product
to be invocable by name. `self doctor --fix` (or `self use`) puts it there
durable: on POSIX via a `fish_add_path` / `export PATH=` line in the shell
rc; on Windows via the user registry (`[Environment]::SetEnvironmentVariable`).

## 2. The rename-aside placement {#rename-aside}

REQ {#locked-running}. Windows locks a *running* exe against
overwrite/delete but still allows *renaming* it. Placement tolerates a
running `<dest>`: the old binary is moved to a unique sidecar
(`<dest>.old-<nanos>`) before the new one is copied into place; the sidecar
is dropped again once the new exe is in place if nothing holds it. A sidecar
that is still locked (its process is alive) lingers for the next install's
sweep.

REQ {#sidecar-sweep}. Every placement sweeps `<dest>.old-*` sidecars in the
parent dir, best-effort. A still-locked sidecar (its process is alive)
fails to delete and waits for the next sweep. POSIX overwrites in place
directly — the sidecar path is unused there.

REQ {#launcher-three-exes}. The launcher product places **three** exes
(vibetree, vibeterm, vibeframe) from a single instance — one cargo build
produces all three. Each exe is placed in `<installRoot>/bin/` with its own
name; each gets its own desktop shortcut.

## 3. Desktop shortcuts {#shortcuts}

REQ {#windows-lnk}. Windows: a Start-menu `.lnk` under
`Start Menu\Programs\vibevm\<Label>.lnk` (per-user, no admin), created via
PowerShell's `WScript.Shell` COM — the same approach the host used. The
shortcut points at the active instance's binary, with the binary as its own
icon and the shim dir as its working directory.

REQ {#linux-desktop}. Linux: a `.desktop` file under
`~/.local/share/applications/<label>.desktop` per the FreeDesktop entry
spec, with `Type=Application`, the binary as `Exec` (quoted when it contains
spaces), the shim dir as `Path`, the binary as `Icon`. Surfaces in any
Freedesktop-aware menu.

REQ {#macos-app}. macOS: a minimal `.app` bundle skeleton under
`~/Applications/<Label>.app`. The bundle's executable is a launcher script
that execs the real binary — this keeps the bundle tiny (the large Electron
tree is not duplicated). The first launch still hits Gatekeeper (unsigned);
this is documented behaviour, not a bug.

REQ {#label-form}. The human-facing label is the capitalised product name:
`VibeTerm` for vibeterm, `VibeFrame` for vibeframe, `VibeTree` / `VibeTerm`
/ `VibeFrame` for the launcher's three exes.

REQ {#shortcut-best-effort}. A shortcut failure is a **note**, never an
install failure. The on-PATH shim is the real integration; the shortcut is
a convenience for a double-click launch. The version-manager logs the note
and continues.

## 4. Uninstall {#uninstall}

REQ {#shortcut-removal}. When `self remove` drops the last instance of a
product, the product's desktop shortcut is removed (the `.lnk` / `.desktop`
/ `.app` bundle). The shared `vibevm` Start-menu group (Windows) is left in
place — other products may still use it.

REQ {#never-remove-shim}. The shim dir itself is never removed by `self
remove` — it is shared across products and across versions. A product that
has no active version leaves its shim file pointing at nothing (the shim
errors with a clear "no active version" message on the next exec).

## 5. Never {#never}

- Never block an install on a shortcut failure — note it and continue.
- Never delete the shared `<installRoot>/bin/` dir — other products use it.
- Never ship a `.desktop` / `.lnk` that points at a missing binary —
  `self remove` cleans them.
- Never assume a `.app` bundle is signed — Gatekeeper still asks on first
  launch (documented).
