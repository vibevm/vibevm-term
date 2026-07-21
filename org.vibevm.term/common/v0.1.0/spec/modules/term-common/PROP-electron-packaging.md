# PROP-electron-packaging — the relocatable packaged-app layout {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** extracted from the per-app
`scripts/package.mjs` in the vibevm host repo and from the host-side
classifier + resolver at
[`crates/vibe-cli/src/commands/term.rs`](https://github.com/vibevm/vibevm/blob/main/crates/vibe-cli/src/commands/term.rs)
(`classify_vibeterm`, `electron_binary`, `resolve_app` — host repo,
cross-repo contract). **Related:** [the packaging driver](../../../../src/packaging.mjs)
(`packageApp`) that produces this layout, [PROP-path-install](PROP-path-install.md)
(Phase 2 — where the packaged dir lands on the host).

This contract governs the **layout of a packaged terminal product** —
the relocatable, self-contained directory that
[`packageApp`](../../../../src/packaging.mjs) produces and that the
version-manager (Phase 2) diff-copies into a version-manager instance.
Both the producer (this repo) and the consumer (the host's resolver at
runtime; the version-manager at install time) depend on this layout.

---

## 1. The directory shape {#shape}

REQ {#app-named-exe}. A packaged build carries the **app-named binary**
at its dir root: `vibeterm(.exe)` for vibeterm, `vibeframe(.exe)` for
vibeframe. `@electron/packager` names the executable after the `name`
argument passed to it; the terminal apps pass their own name. The
app-named exe is the one signal present in BOTH packaging layouts
(unpacked and asar) and is what the host's resolver looks for.

REQ {#resources-app}. Inside the dir, a packaged build carries either:

- `resources/app/` — the unpacked Electron app tree (`main.cjs`,
  `renderer.js`, `index.html`, `lib/` or `src/`, `package.json`,
  `node_modules/`, …); or
- `resources/app.asar` — the same tree packed into a single blob.

`packageApp` produces the unpacked form (`--no-asar`); the contract
covers both because the host's resolver must recognise both
([§classification](#classification)).

REQ {#runtime-present}. The dir also carries the Chromium runtime, the
app's icon, the Chromium licenses file (`LICENSES.chromium.html`), and
the locale `.pak` files — everything Electron needs to run, with no
external dependency.

## 2. Dev vs packaged {#classification}

REQ {#two-shapes}. A terminal app exists in one of two shapes at
runtime:

- **Dev** — the unpackaged source dir (`app/` carrying `package.json`),
  with Electron resolved through `node_modules/electron/path.txt` (the
  resolution the `electron` npm package uses).
- **Packaged** — the relocatable dir above, with the app-named exe at
  its root.

REQ {#classify-by-exe}. The shape is classified by the **app-named exe
at the dir root**, NOT by `resources/app/package.json` — the latter is
absent in an asar-packed build, and keying off it would wrongly demote
an asar build to Dev. This was the regression that made `vibe tree -t`
from a correctly-asar-packaged instance fail to spawn; the fix is the
rule.

## 3. The packaging dance {#dance}

REQ {#npm-install-not-enough}. `npm install` alone is NOT enough: npm
11 blocks native/postinstall scripts, so Electron's binary download and
node-pty's prebuild staging do not run. The packaging driver runs, in
order:

1. `npm install` — deps (idempotent).
2. `npm rebuild node-pty --foreground-scripts` — the node-pty prebuild
   + the bundled ConPTY DLLs (Windows). No C++ toolchain needed.
3. `node node_modules/electron/install.js` — Electron's own binary
   (its postinstall, which npm blocked).
4. `npx @electron/packager … --dir --no-asar --overwrite --prune=true`
   — the relocatable dir.

REQ {#no-electron-rebuild}. NO `@electron/rebuild` step. node-pty is
built on node-addon-api (N-API), so its shipped prebuilds are
ABI-stable across Node/Electron versions; the prebuild is correct as
shipped. Forcing `@electron/rebuild` re-enters `node-gyp`, trips the
broken relative-path `cd shared && GetCommitHash.bat` in
`deps/winpty/src/winpty.gyp`, and fails. It is both unnecessary and
broken for this N-API addon.

REQ {#per-os}. Packaging is **per-OS** — node-pty's native addon and
Electron's runtime are OS/arch-specific, so packaging runs on the
target host. Cross-packaging is out of scope.

## 4. Output discovery {#discovery}

REQ {#single-child}. `packageApp` produces exactly one
`<app>-<plat>-<arch>/` child under the staging dir; it resolves that
single child and returns its absolute path (the version-manager at
install time reads the directory's diff from there). Producing zero or
more than one child is a hard error.

## 5. Non-goals {#non-goals}

- An installer (`.msi`, `.pkg`, `.deb`) — the dir is the artifact;
  placement onto `PATH` is the version-manager's job ([PROP-path-install](PROP-path-install.md),
  Phase 2).
- Auto-update — the version-manager handles versioning; the packaged
  dir is a static artifact for one version.
- Code signing — tracked separately (Windows `signtool` etc.); the
  packaging driver does not sign.
