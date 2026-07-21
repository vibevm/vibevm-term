<!-- vibe:static org.vibevm.term/term-common — boot snippet, slot 10 -->

# Tool: term-common — shared helpers + wire contracts {#root}

`term-common` is the **shared layer** of the vibevm-term products. Every
terminal product (vibeterm, vibeframe, vibe-launcher) consumes it.

## What lives here

- **TypeScript helpers** (`src/`):
  - `args.mjs` — argument + command-line parsing for the Electron main
    process (pure, no Electron import).
  - `keymap.mjs` — the symbolic key-name → PTY byte-sequence map.
  - `packaging.mjs` — the generalized `@electron/packager` driver,
    parameterised by app name.
- **Normative wire contracts** (`spec/modules/term-common/`) — the
  contracts every terminal product must honour. Each is a self-contained
  PROP cited as `spec://term-common/PROP-<name>#<section>`.
- *(Phase 2)* **Version-manager** (`vvm/`) — the TypeScript port of the
  host's vibe vvm, used by every product's `<product> self install`.

## Discipline

The package adopts the AI-Native Rust discipline from birth via
`requires.packages` (static-transitive) — redbook + rust-ai-native —
mirroring `packages/org.vibevm.fractality/` in the host repo. Cells with
single registration points, specmark-equivalent traceability to spec
anchors, strict `tsconfig`, branded types, `Result` errors, `vitest` cell
tests.

## Cross-repo contracts

Several contract REQs cite the host-side implementation as their twin —
`spec://vibevm/modules/vibe-cli/PROP-042#in-place-upgrade` (the
icon-OSC emitter), `spec://vibevm/common/PROP-019#root` (the Rust twin of
the ported version-manager). These are `(host repo, cross-repo contract)`
pointers: the spec text is authoritative here, the host implementation is
its provenance.
