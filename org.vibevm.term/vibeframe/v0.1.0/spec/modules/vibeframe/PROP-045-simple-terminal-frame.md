# PROP-045 — vibeframe: the simple terminal frame {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `vibeframe`.
**Genre:** contract. **Provenance:** ported from the vibevm host repo's
[`spec/modules/vibeframe/PROP-045-simple-terminal-frame.md`](https://github.com/vibevm/vibevm/blob/main/spec/modules/vibeframe/PROP-045-simple-terminal-frame.md)
when vibeframe moved to this repo. The role / identity / sibling-relationship
REQs (§1, §3, §5, non-goals) are unchanged from the host version; §2
(routing) and §4 (packaging & install) are **rewritten** for the
extracted-product model — vibeframe is now an external product that
publishes itself to `PATH` via this repo's own version-manager, not a
sub-tree the host's `vibe self install` packages into its instance. **Plan:**
[`VIBEFRAME-SPLIT-PLAN-v0.1.md`](../../../../vibeterm/v0.1.0/spec/research/VIBEFRAME-SPLIT-PLAN-v0.1.md)
(the campaign history — now in the vibeterm package, where the rest of
the terminal campaign history lives). **Related:** PROP-042 (AIUI
observation — vibeframe is the terminal plane's host for `vibe tree`,
host repo cross-repo contract), PROP-043 (GUI launchers —
`VibeFrame.exe`, `spec://vibe-launcher/PROP-043#root`),
[PROP-env-markers](../../../../common/v0.1.0/spec/modules/term-common/PROP-env-markers.md),
`spec://vibeterm/PROP-044#root` (vibeterm — the *complex* terminal, the
sibling this frame is deliberately NOT).

This contract governs **vibeframe** — the **simple, single-window Electron
terminal frame**. It began as a copy of the minimal vibeterm implementation,
split out so **VibeTree has a stable, simple app to run in** as a standalone
tool, while **vibeterm** evolves into the complex multi-tab workspace
(`spec://vibeterm/PROP-044#root`). The two are siblings: vibeframe stays
simple and stable; vibeterm grows.

---

## 1. Role & scope {#role}

REQ. vibeframe hosts **exactly one** node-pty child rendered by **one** xterm.js
in **one** `BrowserWindow` — the minimal terminal (main-process pty, IPC
`pty` / `input` / `resize` / `ready`, the `--control` AIUI surface + headless
mirror + CDP, the `OSC 7773` icon protocol — see
[term-common/PROP-control-protocol](../../../../common/v0.1.0/spec/modules/term-common/PROP-control-protocol.md),
[/PROP-icon-osc](../../../../common/v0.1.0/spec/modules/term-common/PROP-icon-osc.md),
[/PROP-pty-lifecycle](../../../../common/v0.1.0/spec/modules/term-common/PROP-pty-lifecycle.md)).
It carries **no** multi-tab / multi-window / split machinery; that is
vibeterm's domain (`spec://vibeterm/PROP-044#root`). vibeframe is the
minimal single-pty single-window form, packaged as a standalone product.

REQ. vibeframe is the **host for `vibe tree`**: the interactive tree window
(`vibe tree -t`, `vibetree.exe`) and the AIUI observation session
(`vibe aiui open`) run their console `vibe tree` inside vibeframe. It is
also launchable standalone via `vibe frame` / `vibeframe.exe`.

## 2. Routing {#routing}

REQ. The host's terminal-app resolver (`vibe-cli` in the vibevm host repo,
PROP-042 §5 — cross-repo contract) routes by target app: `vibe frame`,
`vibe tree -t`, `vibetree.exe`, and `vibe aiui open` resolve **vibeframe**;
`vibe term` / `vibeterm.exe` resolve **vibeterm**. Resolution tiers per
app `X`:

1. `$VIBEVM_<X>` override (explicit);
2. the active VVM instance's packaged `<X>/` (back-compat for pre-extraction
   instances that still carry the packaged sub-tree);
3. **PATH lookup** — `vibeterm` / `vibeframe` on `PATH` (the
   extracted-product path; this is how a `vibeframe self install`-placed
   binary is found).

REQ. When **none** of the tiers resolves vibeframe and the caller is
`vibe tree -t`, the host runs `vibe tree` **in place** in the current
terminal (no desktop window) — the in-place fallback. A nested `vibe tree`
launched from a generic shell therefore still renders; only the
desktop-window experience is lost when vibeframe is absent.

## 3. Identity & the in-terminal marker {#identity}

REQ. vibeframe's package identity is `@org.vibevm/vibeframe`; its packaged
executable is `vibeframe(.exe)`; its window/launcher icon is a **no-dots**
coral glyph (`app/resources/icon.*`, hinting at simplicity), distinct from
vibeterm's. It sets **`VIBEFRAME=1`** in its PTY environment
([term-common/PROP-env-markers](../../../../common/v0.1.0/spec/modules/term-common/PROP-env-markers.md)).

REQ. A `vibe tree` launched **inside** a vibe desktop terminal upgrades in
place (no second window) when **either** `VIBETERM` **or** `VIBEFRAME` is
set — both markers are honoured by the host's in-place-upgrade detection
(PROP-042 §5.1 `#in-place-upgrade`, cross-repo contract). Inside vibeframe
the tree still swaps the window icon to `vibetree` via `OSC 7773`,
reverting on exit ([term-common/PROP-icon-osc](../../../../common/v0.1.0/spec/modules/term-common/PROP-icon-osc.md)).

## 4. Packaging & install {#packaging}

REQ. vibeframe is **packaged by its own packaging script**
(`app/scripts/package.mjs`), a thin wrapper over the shared
[term-common packaging driver](../../../../common/v0.1.0/src/packaging.mjs)
that runs the npm-11 / node-pty-N-API / Electron-postinstall / electron-
packager dance and produces a relocatable `vibeframe-<plat>-<arch>/`
directory (the layout governed by
[term-common/PROP-electron-packaging](../../../../common/v0.1.0/spec/modules/term-common/PROP-electron-packaging.md)).
Packaging runs on the target host (per-OS native addon + Electron runtime).

REQ. vibeframe is **installed by its own version-manager**
(`vibeframe self install` / `vibeframe self update`, Phase 2 — the port of
the host's vibe vvm). It places the packaged executable at `~/opt/bin/
vibeframe(.exe)`, the same on-`PATH` directory the `vibe` shim lives in,
optionally (Windows) with a per-user Start-menu shortcut. Updating
vibeframe thus runs through its own lifecycle, decoupled from the host's
`vibe self update`. A locked-running vibeframe is rename-aside-replaced
(`.old-<n>` sidecar, swept next update); the step is best-effort.

REQ. `vibeframe.exe` the **GUI launcher** (a separate binary, not the
packaged app) lives in the [vibe-launcher package](../../../launcher/v0.1.0/spec/modules/vibe-launcher/PROP-043-gui-launchers.md);
it runs `vibe frame` carrying vibeframe's no-dots icon via the per-binary
embed table (`spec://vibe-launcher/PROP-043#icon`). The launcher package
self-installs its three exes (`vibetree` / `vibeterm` / `vibeframe`) through
its own version-manager.

## 5. Relationship to vibeterm {#vs-vibeterm}

REQ. vibeframe is **self-contained and stable by intent**: it is not
extended with vibeterm's evolving workspace features. When vibeterm's
complex shell (`spec://vibeterm/PROP-044#root`) ships, vibeframe remains
the *simple* option — VibeTree's host and a plain standalone terminal. The
two never share renderer code beyond the initial copy that created
vibeframe; each evolves on its own line (vibeframe: minimal; vibeterm:
workspace).

## Non-goals {#non-goals}

- No multi-tab / split / multi-window (that is vibeterm,
  `spec://vibeterm/PROP-044#root`).
- No new renderer architecture — vibeframe is the minimal terminal verbatim.
- macOS launcher icon parity is bounded by the platform gap (`setIcon`
  no-op on the dock tile).
