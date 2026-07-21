# PROP-self-install — vibeterm self install {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `vibeterm`.
**Genre:** contract. **Provenance:** the host's removed `vvm/launchers.rs` +
`vibeterm_packager.rs`, replaced by the products-repo version-manager.
**Related:** [PROP-vvm](../../../common/v0.1.0/spec/modules/term-common/PROP-vvm.md)
(the version-manager twin), [PROP-path-install](../../../common/v0.1.0/spec/modules/term-common/PROP-path-install.md)
(placement + shortcuts), [PROP-044](PROP-044-terminal-shell.md) (the app
itself), [PROP-electron-packaging](../../../common/v0.1.0/spec/modules/term-common/PROP-electron-packaging.md)
(the packaged dir that gets installed).

This contract governs **vibeterm's self-install** — how `vibeterm self
install` builds the packaged Electron app, places it in a version-manager
instance, and surfaces it on `PATH` + the Start menu. It is the
product-specific projection of the term-common version-manager twin
(`spec://term-common/PROP-vvm`).

---

## 1. The install layout {#layout}

REQ {#instance-binary}. A vibeterm instance carries the packaged Electron
dir as a `<app>/` subtree: `~/opt/vibeterm/versions/<kind>/<id>/<instance>/vibeterm/`
holds `vibeterm(.exe)` at its root, `resources/app/` inside, plus the
Chromium runtime and `LICENSES.chromium.html` (the
[PROP-electron-packaging](../../../common/v0.1.0/spec/modules/term-common/PROP-electron-packaging.md) layout).

REQ {#gui-subsystem}. The packaged `vibeterm(.exe)` is a GUI-subsystem
binary — double-clicking it (or the Start-menu shortcut) opens the window
directly, with **no console window** flashing. This is `@electron/packager`'s
default for a packaged Electron app.

REQ {#current-pointer}. `~/opt/vibeterm/current` points at the active
instance dir. The on-PATH shim `~/opt/bin/vibeterm` (POSIX) /
`vibeterm.cmd` (Windows) reads this file at exec time.

## 2. The build pipeline {#build}

REQ {#electron-packager}. The build is `app/scripts/package.mjs` (the
product's thin wrapper around term-common's `packageApp`), which does:
(1) `npm install` (deps, idempotent); (2) `npm rebuild node-pty
--foreground-scripts` (node-pty's N-API prebuild); (3) `node
node_modules/electron/install.js` (Electron's binary fetch); (4) `npx
@electron/packager --dir --no-asar` (the relocatable dir). NO
`@electron/rebuild` — node-pty's prebuild is ABI-stable across
Node/Electron.

REQ {#per-os}. The build runs on the **target host** — node-pty's native
addon and Electron's runtime are OS/arch-specific, so no cross-OS build.

REQ {#profile-default}. The default build profile is `release` (a packaged
app ships without debug overhead). `--debug` overrides.

## 3. The CLI surface {#cli}

REQ {#entry-point}. `vibeterm/v0.1.0/bin/self.mjs` is the entry — a thin
wrapper that resolves term-common's `vvmMain` (relative import to the
sibling `common/v0.1.0/vvm/cli.mjs`), wires an `ElectronAppBuilder` with
`app: 'vibeterm'`, and dispatches every `vibeterm self <verb>` to it.

REQ {#install-wrapper}. `vibeterm/v0.1.0/scripts/install.mjs` is a thin
alias for `node bin/self.mjs install`, so the canonical onboarding is one
short command.

REQ {#verb-set}. The full verb set (`install | update | use | ls | current |
which | doctor | remove | gc | env | relocate`) is provided by
`vvmMain` — see [PROP-vvm](../../../common/v0.1.0/spec/modules/term-common/PROP-vvm.md#verbs)
for each verb's contract.

## 4. Desktop integration {#desktop}

REQ {#shortcut}. `self install` refreshes the `VibeTerm` desktop shortcut
(Windows: Start-menu `.lnk`; Linux: `.desktop`; macOS: `.app` bundle)
pointing at the active instance's binary. The shortcut is best-effort — a
failure is a note, never an install failure.

REQ {#path}. `self install` writes the `~/opt/bin/vibeterm` shim and ensures
`~/opt/bin` is on `PATH` (via `self use`'s env-persistence).

## 5. Never {#never}

- Never block an install on a packaging / shortcut failure — note and
  continue (the on-PATH shim is the real integration).
- Never package vibeterm cross-OS — node-pty's addon is OS-specific.
- Never ship a debug-profile build as the default — release is the packaged
  app's profile.
