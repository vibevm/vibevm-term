<!-- vibe:static org.vibevm.term/vibeterm — boot snippet, slot 20 -->

# App: vibeterm — the complex terminal workspace {#root}

`vibeterm` is the **complex** multi-tab / multi-window terminal workspace
— the standalone product form of the vibe terminal. Built on the
vibeterm action/AIUI core (render-free TS engine + SolidJS chrome +
xterm.js terminal views), it generalises the simple single-pty terminal
into N isolated terminals, switchable, splittable, and detachable into
their own OS windows.

## What lives here

- **The Electron app** (`app/`) — main process (`main.cjs`), preload
  bridge, the SolidJS chrome (`src/chrome/`), the render-free engine
  cells (`src/engine/`), the terminal-view pages (`terminal-view/`),
  the build/packaging scripts (`scripts/`), tests, vite/vitest/tsconfig.
- **Normative contracts** (`spec/modules/vibeterm/`) — the shell
  contract family:
  - `PROP-044-terminal-shell.md` — the visible shell (regions, tabs,
    panes, tear-off, i18n, theming).
  - `PROP-046-action-aiui-core.md` — the render-free action/AIUI core.
  - `PROP-047-modelview-transport.md` — the `ModelView` + MVC + transport
    seam.
  - `architecture.md`, `design-system.md` — lore (the *why*).
- **Campaign history** (`spec/terraforms/`, `spec/research/`,
  `spec/manual-tests/`) — the founding plans, the research findings, the
  live test loops.

## Discipline

The package adopts the AI-Native Rust discipline from birth via
`requires.packages` (static-transitive) — redbook + rust-ai-native —
mirroring `packages/org.vibevm.fractality/` in the host. The engine
cells (`app/src/engine/`) are typed TypeScript with strict
`tsconfig.engine.json`, branded types, `Result` errors, `vitest` cell
tests; the chrome (`app/src/chrome/`) is SolidJS + Vite + Tailwind v4 +
Kobalte. `scope!`/specmark-equivalent traceability to
`spec://vibeterm/PROP-044|046|047#*`.

## Shared layer

The pure helpers (arg/keymap/packaging) and the wire contracts (control
protocol, discovery, OSC icon swap, env markers, electron-packaging
layout) live in `tool:org.vibevm.term/term-common` (=0.1.0), consumed by
this package via a `file:` dependency. `main.cjs` imports
`@org.vibevm/term-common/args` and `/keymap`; the packaging wrapper
dispatches to `@org.vibevm/term-common/packaging`.

## Sibling

`vibeframe` (`spec://vibeframe/PROP-045#root`) is the **simple**
sibling — a stable single-window terminal that hosts `vibe tree`. The
two diverge: vibeterm grows into the complex workspace; vibeframe stays
minimal.
