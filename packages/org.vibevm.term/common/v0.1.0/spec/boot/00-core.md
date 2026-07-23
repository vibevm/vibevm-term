# Project boot snippet — `term-common`

User-owned. `vibe install` / `vibe uninstall` never touch this file.

## About this package

`term-common` is the shared layer of the vibevm-term products — the
TypeScript helpers (`args.mjs`, `keymap.mjs`, `packaging.mjs`) every
terminal product (vibeterm, vibeframe, vibe-launcher) consumes, plus the
normative wire contracts those products must honour (the control protocol,
the discovery file, the OSC 7773 icon swap, env markers, the
electron-packaging layout, and — in Phase 2 — the ported version-manager).

It is a `tool` package under the `org.vibevm.term` namespace, adopted by
every product via a `file:` dependency.

## Session boot

Read these files in order: `spec/boot/` (in filename order), then
`spec/WAL.md`, then any relevant `spec/modules/term-common/PROP-*.md` for
the task at hand. Only after that, start work.

## Memory layers

- **Head** — the human (the owner's spoken rulings, the highest authority).
- **WAL** — `spec/WAL.md`, the living checkpoint of where work stands.
- **Spec** — `spec/**/*.md`, addressable via `spec://<module>/<doc>#<section>` URIs.
- **Code** — `src/`, `test/`.

Information flows top-down. **Conflict resolution priority: Human > Spec >
Tests > Code.** When the agent disagrees with a spec it adds a
`<!-- REVIEW: ... -->` marker rather than silently deviating.
