# term-common

The shared layer of the vibevm-term products:

- **TypeScript helpers** (`src/`) — argument parsing (`args.mjs`), the
  key-name → PTY sequence map (`keymap.mjs`), and the generalized
  electron-packaging driver (`packaging.mjs`). Pure, no Electron/node-pty
  imports in the helpers; unit-testable under plain `node --test`.
- **Normative contracts** (`spec/modules/term-common/`) — the wire
  contracts every terminal product (vibeterm, vibeframe, vibe-launcher)
  must honour:
  - `PROP-control-protocol.md` — the loopback HTTP+JSON control API
    (`/state`, `/snapshot`, `/input`, `/wait`, `/close`, Bearer auth).
  - `PROP-discovery.md` — the `~/.vibe/aiui/<pid>.json` +
    `latest.json` discovery file schema.
  - `PROP-icon-osc.md` — the `OSC 7773 ; <name> BEL` icon-swap protocol
    (host side: `vibe tree` emits; terminal side: the renderer intercepts).
  - `PROP-pty-lifecycle.md` — the main-process pty invariant + the graceful
    teardown rules.
  - `PROP-env-markers.md` — the `$VIBETERM` / `$VIBEFRAME` in-PTY markers.
  - `PROP-electron-packaging.md` — the electron-packager output contract
    (app-named exe at root, `resources/app|app.asar`, dev vs packaged shape).
  - *(Phase 2)* `PROP-vvm.md` — the ported version-manager contract.
  - *(Phase 2)* `PROP-path-install.md` — the `~/opt/<product>` placement
    contract.
- *(Phase 2)* **Version-manager library** (`vvm/`) — the TypeScript port of
  the host's vibe vvm, used by every product's `<product> self install`
  command.

## Consuming

This is a vibe package (`tool:org.vibevm.term/term-common`). A sibling
package in this repo (e.g. `vibeterm/v0.1.0/app/`) consumes it as:

```json
{
  "dependencies": {
    "@org.vibevm/term-common": "file:../../common/v0.1.0"
  }
}
```

…then `import { parseArgs, keyToSeq } from '@org.vibevm/term-common'`.

## Discipline

The package adopts the AI-Native Rust discipline from birth via
`requires.packages` (static-transitive), the same adoption pattern as
`packages/org.vibevm.fractality/`. Cells with single registration points,
specmark-equivalent traceability to spec anchors, strict `tsconfig`,
branded types, `Result` errors, `vitest` cell tests.
