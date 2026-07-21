# PROP-control-protocol — the loopback control surface every terminal exposes {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** extracted from the vibevm host repo's
per-app `README.md` control-mode sections
([`apps/vibeterm/README.md#control-mode-aiui`](https://github.com/vibevm/vibevm/blob/main/apps/vibeterm/README.md)),
which documented the surface the host's `vibe aiui` CLI drives (host repo,
cross-repo contract). **Related:** [PROP-discovery](PROP-discovery.md) (how
`vibe aiui` finds this server), [PROP-pty-lifecycle](PROP-pty-lifecycle.md)
(the pty whose bytes the server mirrors).

This contract governs the **loopback HTTP+JSON control surface** every
terminal product (vibeterm, vibeframe) exposes under `--control`, so an
agent (the host's `vibe aiui open`, or any peer) can drive and observe the
running terminal. Without `--control` none of this is constructed
(`@xterm/headless` is not even loaded) and the terminal is a plain shell.

---

## 1. Binding & auth {#binding}

REQ {#loopback-only}. The control server binds `127.0.0.1` on an
**ephemeral port** (OS-chosen); it is unreachable off-loopback. The host
process picks the free port (via a transient TCP socket bind) and passes
it in as `--cdp-port`'s sibling — see [PROP-discovery](PROP-discovery.md#how-found)
for how the agent then learns it.

REQ {#bearer}. Every endpoint requires `Authorization: Bearer <token>`,
where `<token>` is a random secret generated at startup. A missing or
wrong token is `401 {"error":"unauthorized"}`. The token is published in
the [discovery file](PROP-discovery.md#schema) alongside the port.

## 2. Endpoints {#endpoints}

REQ {#state}. `GET /state` returns `{ alive, cols, rows, exitCode }` —
whether the hosted child is alive, the grid shape, and its exit code (once
dead). Cheap; safe to poll.

REQ {#snapshot}. `GET /snapshot?format=text` returns
`{ cols, rows, text }` — the grid the window shows, one line per row,
joined by `\n`. Only `format=text` is supported; any other format is
`400`.

REQ {#input}. `POST /input` takes `{ keys: ["F2","Down"], text }` and
returns `{ ok: true }`. Each name in `keys` is translated through the
`keyToSeq(name, platform)` map ([term-common/keymap](../../../../src/keymap.mjs))
to the bytes the hosted program expects; standard xterm VT sequences on
Unix, **win32-input-mode** on Windows (a ConPTY synthesises a key record
from the raw VT form for a cooked reader but not for a raw crossterm TUI,
so the explicit win32 form is required for keys to reach `vibe tree`).
The keys are written in order, then `text` literally. An unknown key is
`400`.

REQ {#wait}. `POST /wait` takes `{ idleMs, timeoutMs }` and returns
`{ stable, waitedMs }`. It resolves once the terminal has settled: waits
for the program's first render, and — if a key was sent since the last
settle — for that key to be answered by output, then for `idleMs` of
quiet; `timeoutMs` bounds it. `stable` distinguishes idle-reached from
timed-out. This is what makes a `snapshot` after an `input` deterministic
rather than a race with the redraw.

REQ {#close}. `POST /close` returns `{ ok: true }` then tears the server
down and quits the app. Without `--control`, an exiting hosted child
closes the terminal as before; **under** `--control`, an exiting child
leaves the server (and the window, if any) up — so the final grid and
`exitCode` remain observable via `/snapshot` and `/state` — until the
agent calls `/close`.

## 3. Mirror invariant {#mirror}

REQ {#headless-mirror}. The server mirrors every PTY byte into a
**headless xterm** (an `@xterm/headless` instance in the main process),
which is what `/snapshot` reads. The visible window's xterm and the
headless mirror receive the same bytes; the snapshot is therefore the
exact grid the window shows (no OCR, no DOM scrape).

## 4. Non-goals {#non-goals}

- A second, parallel control surface — there is one AIUI surface per
  terminal, not two (PROP-046 §`#plane-unification`).
- Observation of a terminal that did not opt in via `--control` — there
  is no backdoor; the surface exists only when the flag is present.
- Cross-network control — loopback only by construction
([§binding](#binding)).
