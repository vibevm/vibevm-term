# PROP-env-markers — the `$VIBETERM` / `$VIBEFRAME` in-PTY markers {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** extracted from the per-app `main.cjs`
in the vibevm host repo (each terminal sets its marker in the spawned
PTY's env) and from the host-side detector at
[`crates/vibe-cli/src/commands/tree/host.rs`](https://github.com/vibevm/vibevm/blob/main/crates/vibe-cli/src/commands/tree/host.rs)
+ [`crates/vibe-launcher/src/lib.rs`](https://github.com/vibevm/vibevm/blob/main/crates/vibe-launcher/src/lib.rs)
(host repo, cross-repo contract). **Related:** [PROP-icon-osc](PROP-icon-osc.md)
(the swap the host emits once it has detected the marker),
`spec://vibevm/modules/vibe-cli/PROP-042#in-place-upgrade` (the host's
in-place-upgrade contract).

This contract governs the **env-var markers** a terminal product sets in
its spawned PTY's environment so a nested `vibe tree` (or any nested
host command) knows it is already running inside a vibe terminal, and
can therefore upgrade the current window in place rather than spawn a
new one.

---

## 1. The markers {#markers}

REQ {#vibeterm-marker}. The complex terminal (vibeterm) sets
**`VIBETERM=1`** in the env of every PTY it spawns.

REQ {#vibeframe-marker}. The simple terminal (vibeframe) sets
**`VIBEFRAME=1`** in the env of every PTY it spawns.

REQ {#value-form}. The value is the literal string `1`. The host reads
the marker as "set and non-empty"; the specific value is not semantically
distinct (`1`, `true`, the app version would all work). `1` is the
canonical form.

## 2. What the host does with them {#host-use}

REQ {#either-marker-upgrades}. The host's in-terminal-upgrade detector
(`crates/vibe-cli/src/commands/tree/host.rs::in_vibeterm()` in the host
repo) treats **either** marker as definitive: a `vibe tree` launched
inside a terminal with `VIBETERM=1` OR `VIBEFRAME=1` upgrades the
current window in place — the console TUI runs right here, and the
window icon swaps to `vibetree` via [PROP-icon-osc](PROP-icon-osc.md).
It does NOT spawn a new desktop window.

REQ {#either-marker-launcher}. The host's GUI launcher core
(`crates/vibe-launcher/src/lib.rs::in_terminal()` in the host repo) also
honours either marker — a launcher launched from inside a terminal
inherits stdio (so the shell waits for the hosted TUI), rather than
spawning a window.

REQ {#absent-means-spawn}. The **absence** of both markers means the
nested command was launched from a generic shell (cmd, bash, a CI
runner); the host then spawns a desktop window (or, for `vibe tree`
under the Phase-2 in-place fallback, runs in the current terminal
without spawning).

## 3. Why two markers, not one {#why-two}

REQ {#distinct-markers}. The two terminals are distinct products that
diverge over time (vibeterm grows into the complex workspace; vibeframe
stays simple). A nested command may want to distinguish which one hosts
it (e.g. to offer vibeterm-only features). Two markers preserve that
distinction without losing the "either is a vibe terminal" property the
upgrade detector relies on.

REQ {#both-upgrade}. A future nested command that needs to behave
differently between the two reads the specific marker; one that only
needs "am I inside a vibe terminal" reads either. The two-tier check
serves both.

## 4. Non-goals {#non-goals}

- A marker for a non-vibe terminal — this is a vibe-umbrella contract;
  other terminals are detected by their own escape sequences
  (`OSC 7` for iTerm, `$TERM_PROGRAM`, etc.) elsewhere.
- A per-tab marker in vibeterm — the marker is per-process (the
  terminal process), not per-tab; a nested command inside one tab of a
  multi-tab vibeterm sees `VIBETERM=1` regardless of which tab.
