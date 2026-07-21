# Project boot snippet — `vibeterm`

User-owned. `vibe install` / `vibe uninstall` never touch this file.

## About this package

`vibeterm` is the **complex** multi-tab / multi-window terminal workspace
of the vibevm-term products — an Electron + SolidJS shell with an AI-UI-
ready action/AIUI core (PROP-044/046/047). The standalone product form
of the vibe terminal. The simple sibling is `vibeframe`
(`spec://vibeframe/PROP-045#root`).

It is an `app` package under the `org.vibevm.term` namespace. The
Electron app lives under `app/` (the standard package layout — code and
spec side by side, as in `packages/org.vibevm.fractality/fractality/v0.1.0/`).

## Session boot

Read these files in order: `spec/boot/` (in filename order), then
`spec/WAL.md`, then any relevant `spec/modules/vibeterm/PROP-*.md` (or
the terraforms/research/manual-tests under `spec/`) for the task at
hand. Only after that, start work.

## Memory layers

- **Head** — the human.
- **WAL** — `spec/WAL.md`.
- **Spec** — `spec/**/*.md`, addressable via `spec://<module>/<doc>#<section>`.
- **Code** — `app/src/`, `app/main.cjs`, `app/test/`.

Conflict resolution priority: **Human > Spec > Tests > Code**. The agent
adds a `<!-- REVIEW: ... -->` marker when it disagrees with a spec
rather than silently deviating.
