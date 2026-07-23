# Project boot snippet — `vibeframe`

User-owned. `vibe install` / `vibe uninstall` never touch this file.

## About this package

`vibeframe` is the **simple** single-window Electron terminal frame of the
vibevm-term products — a minimal node-pty + xterm.js app that hosts one
shell command. It is the stable host for `vibe tree` (VibeTree) and the
AIUI observation session; the complex multi-tab sibling is `vibeterm`
(`spec://vibeterm/PROP-044#root`).

It is a `tool` package (an Electron app product) under the `org.vibevm.term` namespace. The
Electron app lives under `app/`.

## Session boot

Read these files in order: `spec/boot/` (in filename order), then
`spec/WAL.md`, then any relevant `spec/modules/vibeframe/PROP-*.md` for
the task at hand. Only after that, start work.

## Memory layers

- **Head** — the human.
- **WAL** — `spec/WAL.md`.
- **Spec** — `spec/**/*.md`, addressable via `spec://<module>/<doc>#<section>`.
- **Code** — `app/main.cjs`, `app/renderer.js`.

Conflict resolution priority: **Human > Spec > Tests > Code**. The agent
adds a `<!-- REVIEW: ... -->` marker when it disagrees with a spec
rather than silently deviating.
