<!-- vibe:static org.vibevm.term/vibeframe — boot snippet, slot 20 -->

# App: vibeframe — the simple terminal frame {#root}

`vibeframe` is the **simple** single-window terminal frame — a minimal
Electron app (node-pty in main, xterm.js in the renderer) that hosts
exactly one shell command. It carries no multi-tab / multi-window / split
machinery (that is vibeterm's domain, `spec://vibeterm/PROP-044#root`).

## What lives here

- **The Electron app** (`app/`) — main process (`main.cjs`), renderer
  (`renderer.js`), `index.html`, the `--control` AIUI server + headless
  mirror, the `OSC 7773` icon protocol, packaging script.
- **Normative contract** (`spec/modules/vibeframe/`) —
  `PROP-045-simple-terminal-frame.md` — the simple-frame contract: its
  role (VibeTree's host), routing, identity, packaging, the deliberate
  non-relationship to vibeterm.

## Discipline

The package adopts the AI-Native Rust discipline from birth via
`requires.packages` (static-transitive) — redbook + rust-ai-native —
mirroring `packages/org.vibevm.fractality/`. vibeframe is plain JS/CJS
(no TypeScript engine floor like vibeterm — the simple frame does not
carry a render-free action core); the AI-Native adoption here governs
the package as a whole (practices, traceability, atomic commits), not a
TS cell layer.

## Shared layer

The pure helpers (arg/keymap/packaging) and the wire contracts (control
protocol, discovery, OSC icon swap, env markers, electron-packaging
layout) live in `tool:org.vibevm.term/term-common` (=0.1.0), consumed by
this package via a `file:` dependency. `main.cjs` imports
`@org.vibevm/term-common/args` and `/keymap`; the packaging wrapper
dispatches to `@org.vibevm/term-common/packaging`.

## Sibling

`vibeterm` (`spec://vibeterm/PROP-044#root`) is the **complex** sibling.
The two diverge: vibeframe stays simple and stable; vibeterm grows into
the multi-tab workspace. They never share renderer code beyond the
initial copy that created vibeframe; each evolves on its own line.
