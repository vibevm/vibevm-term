# PROP-icon-osc — the OSC 7773 window-icon swap protocol {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** the host-side emitter at
[`crates/vibe-cli/src/commands/tree/host.rs`](https://github.com/vibevm/vibevm/blob/main/crates/vibe-cli/src/commands/tree/host.rs)
in the vibevm host repo (host repo, cross-repo contract; its
`set_vibeterm_icon` / `run_upgraded` are the reference emitter). The
matching terminal-side interceptor lived in each app's `renderer.js` /
chrome before the move. **Related:** [PROP-env-markers](PROP-env-markers.md)
(how `vibe tree` knows it is inside a terminal that honours this OSC at
all), `spec://vibevm/modules/vibe-cli/PROP-042#in-place-upgrade` (the
host-side contract for the in-place upgrade that emits this OSC).

This contract governs the **in-band icon-swap protocol** a terminal
product honours so a hosted program (notably `vibe tree`) can change the
terminal's window/taskbar icon for the duration of its run, and revert
on exit. This is what makes a `vibe tree -t` opened inside a terminal
read as a VibeTree window to the user, without a second window.

---

## 1. The sequence {#sequence}

REQ {#osc-code}. The OSC number is **`7773`** — a custom code, chosen
out of the registered/approved ranges to avoid collision with iTerm2
(`133`), FinalTerm (`1337`), kitty (`1337` / `52`), etc. The number is
the contract; both sides agree on it.

REQ {#set-form}. To set the icon, the hosted program emits

```
ESC ] 7773 ; <name> BEL
```

(in C-string form: `"\x1b]7773;<name>\x07"`), where `<name>` is the
app-family icon name the terminal resolves to a `resources/` file (e.g.
`vibetree`). The string form using `ST` (`ESC \`) instead of `BEL` as
the terminator is also accepted (some emitters use it); the terminal
treats both as the same OSC.

REQ {#revert-form}. To revert to the terminal's launch icon, the hosted
program emits the same OSC with an **empty** `<name>`:
`ESC ] 7773 ; BEL`. The terminal restores whatever icon it launched
with.

## 2. Interceptor behaviour {#interceptor}

REQ {#renderer-intercepts}. The terminal's renderer (the xterm.js parser
hook in the visible window, and the headless mirror when under
`--control`) intercepts the `OSC 7773` sequence and forwards the name
to the main process via IPC (e.g. `ipcRenderer.send('vibeterm:set-icon',
name)`); it does NOT pass the OSC through to the pty (the hosted program
already emitted it; reflecting would loop). The main process then calls
the platform's set-window-icon API (`win.setIcon(...)` on Electron).

REQ {#unknown-name-fallback}. An unknown `<name>` falls back to the
terminal's default icon (never errors, never breaks the session).

REQ {#no-op-elsewhere}. In any terminal that does NOT intercept OSC
7773 (a generic OS terminal, a CI runner), the sequence is a harmless
no-op: unknown OSC sequences are discarded by the terminal spec. The
protocol is therefore safe to emit unconditionally; the terminal opts
in by intercepting.

## 3. The lifecycle the host relies on {#lifecycle}

REQ {#set-on-enter}. The host (`vibe tree` running inside a terminal,
detected via [PROP-env-markers](PROP-env-markers.md)) emits
`OSC 7773 ; vibetree BEL` when its TUI starts, so the window reads as
VibeTree for the duration.

REQ {#revert-on-exit}. The host emits `OSC 7773 ; BEL` (empty name) on
exit — clean OR error — so the terminal reverts to its launch icon. A
terminal that never sees the revert (host crashed) keeps the swapped
icon; this is cosmetic, not load-bearing, and the next launch resets it.

## 4. Non-goals {#non-goals}

- macOS menu-bar icon parity — the platform gap (`setIcon` on a
  BrowserWindow works; the dock tile is a separate API) is tracked
  elsewhere; this contract covers the window/taskbar icon only.
- Per-tab icon in the complex terminal (vibeterm) — the simple
  vibeframe honours this for its one window; vibeterm's multi-tab
  variant is a per-tab refinement deferred to the shell contract.
- A return channel — the OSC is one-way (host → terminal); the terminal
  never sends an icon-ack back over the pty.
