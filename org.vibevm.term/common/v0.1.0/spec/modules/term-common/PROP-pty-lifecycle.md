# PROP-pty-lifecycle — the main-process pty + graceful teardown invariant {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** extracted from the vibevm host repo's
per-app `README.md` Architecture sections
([`apps/vibeterm/README.md#architecture`](https://github.com/vibevm/vibevm/blob/main/apps/vibeterm/README.md))
and from each app's `main.cjs`. **Related:** [PROP-control-protocol](PROP-control-protocol.md)
(the server that mirrors this pty's bytes), `spec://vibevm/modules/vibe-cli/PROP-042#aiui`
(the host-side observation contract this pty feeds).

This contract governs the **node-pty child** a terminal product owns and
the **graceful teardown rules** that keep it from surfacing as an Electron
error dialog.

---

## 1. The pty lives in main {#main-pty}

REQ {#main-not-renderer}. The node-pty child is constructed in the
Electron **main process**, never in a renderer. A renderer has no
`worker_threads`, so constructing a pty there throws
`Failed to construct 'Worker'`. The renderer is xterm.js only — it
renders bytes the main process sends it and forwards keystrokes back.

REQ {#ipc-paths}. Three IPC channels carry the pty's traffic between
main and renderer:

| direction        | channel   | payload                                  |
|------------------|-----------|------------------------------------------|
| main → renderer  | `pty`     | a chunk of bytes the child wrote.        |
| renderer → main  | `input`   | a chunk of keystrokes to write to the child. |
| renderer → main  | `resize`  | the new `{ cols, rows }` to resize to.   |

Every byte and every keystroke goes through main; the renderer never
touches the pty directly.

## 2. Graceful teardown {#teardown}

REQ {#send-guard}. Every `win.webContents.send(...)` is guarded by
`!win.isDestroyed()`. After teardown the window is gone; an unguarded
send throws.

REQ {#dispose-before-teardown}. The `pty.onData` subscription is
**disposed before** teardown, so no byte is ever sent to a destroyed
window. The order matters: dispose first, then quit.

REQ {#kill-in-trycatch}. To stop the child the terminal prefers letting
it exit naturally. `pty.kill()` is only ever called inside a
`try/catch` — on Windows it throws ConPTY `AttachConsole failed`
outside a real console, which is swallowed; `app.quit()` reaps the
child regardless.

## 3. Per-tab in the complex terminal {#per-tab}

REQ {#main-registry}. In the simple terminal (vibeframe) there is one
pty. In the complex terminal (vibeterm) the main process holds the
authoritative `tabs: Map<TabId, { pty, view, ownerWindow, … }>`; each
tab owns exactly one pty, addressed by its `TabId`, never broadcast
(see the shell contract, `spec://vibeterm/PROP-044#tab-model`). This
contract covers the per-pty invariant that holds for every entry in
that map.

## 4. Non-goals {#non-goals}

- Cross-window pty migration — moving a pty between main processes is
  not supported (a pty is bound to the process that spawned it). The
  complex terminal moves the **view** between windows; the pty stays.
- Pty state serialisation — `@xterm/addon-serialize` restores the
  visible buffer, not the pty; that is out of scope here.
