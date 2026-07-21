# PROP-discovery — how an agent finds a running terminal's control surface {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** extracted from the vibevm host repo's
per-app `README.md` control-mode sections
([`apps/vibeterm/README.md#control-mode-aiui`](https://github.com/vibevm/vibevm/blob/main/apps/vibeterm/README.md))
and from the host-side reader at
[`crates/vibe-cli/src/commands/aiui/control.rs`](https://github.com/vibevm/vibevm/blob/main/crates/vibe-cli/src/commands/aiui/control.rs)
(host repo, cross-repo contract). **Related:** [PROP-control-protocol](PROP-control-protocol.md)
(the surface this file points at), `spec://vibevm/modules/vibe-cli/PROP-042#aiui-cli`
(the host's `vibe aiui` CLI that reads this file).

This contract governs the **discovery file** a terminal product writes
under `--control` so the host's `vibe aiui` CLI (or any peer agent) can
find the [control surface](PROP-control-protocol.md#binding) without an
out-of-band channel.

---

## 1. Location {#location}

REQ {#dir}. The discovery files live under
`<settings-dir>/aiui/`, where `<settings-dir>` is the vibevm settings home
(`$VIBE_SETTINGS` else `<home>/.vibe` — host repo, cross-repo contract;
see `crates/vibe-core/src/settings.rs` `aiui_dir()` in the host). The
terminal never reads an env var for this; it derives the directory the
same way the host does.

REQ {#per-pid-file}. On startup the terminal writes a **per-pid file**
`<settings-dir>/aiui/<pid>.json`, where `<pid>` is the terminal's own
process id. This is the durable record of one control session.

REQ {#latest-pointer}. Alongside the per-pid file the terminal writes a
**`latest.json` pointer** in the same directory, holding the same schema.
`vibe aiui open` reads `latest.json` to attach to the session it just
spawned without scraping the directory.

## 2. Schema {#schema}

REQ {#fields}. Each discovery file (per-pid and latest) is a JSON object
with mode `0600` and exactly these fields:

| field         | type    | meaning                                                       |
|---------------|---------|---------------------------------------------------------------|
| `port`        | number  | the loopback port the [control server](PROP-control-protocol.md#binding) listens on. |
| `token`       | string  | the random Bearer token the control server requires.          |
| `pid`         | number  | the terminal's own process id (matches the per-pid filename). |
| `startedAt`   | string  | RFC3339 timestamp the session started.                        |
| `cdpPort`     | number? | the Chrome DevTools Protocol port (only when `--cdp-port` was passed). |

Unknown fields are ignored by the reader (forward-compat); missing
required fields (`port`, `token`, `pid`, `startedAt`) make the file
unusable and the reader falls back to scanning the directory for another
per-pid file.

## 3. Lifecycle {#lifecycle}

REQ {#write-on-start}. The files are written atomically (write-temp +
rename) once the server has bound its port and the mirror is ready —
never before. A reader that races startup sees either no file or a
complete one.

REQ {#remove-on-quit}. On clean quit the terminal **removes** its
per-pid file AND, if it is the session `latest.json` points at,
`latest.json` too. A crash leaves stale files; the host's reader treats
a file whose `pid` is not alive as dead and scans past it.

REQ {#latest-overwrite}. Each new `--control` session overwrites
`latest.json` with its own record; the previous per-pid file remains
until its session quits. "latest" is a hint, not an ordering guarantee —
the per-pid file is the source of truth for a given session.

## 4. How the host finds it {#how-found}

The host's `vibe aiui` CLI is the reference reader:

1. **Spawned by the host** (`vibe aiui open`): the host itself passed
   `--control` (and a pre-bound `--cdp-port`), so it already knows the
   port; the discovery file is for **other** observers. The host reads
   `latest.json` to confirm its spawn landed.
2. **Attached to an existing session** (`vibe aiui inspect`): the host
   reads `latest.json`, verifies `pid` is alive, then drives the
   `port`/`token` it found.

A peer agent that did not spawn the terminal follows path (2).
