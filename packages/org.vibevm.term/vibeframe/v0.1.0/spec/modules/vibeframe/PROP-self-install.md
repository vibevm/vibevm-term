# PROP-self-install — vibeframe self install {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `vibeframe`.
**Genre:** contract. **Provenance:** the vibeterm self-install twin (the
two Electron apps differ only in the product name). **Related:**
[PROP-vvm](../../../common/v0.1.0/spec/modules/term-common/PROP-vvm.md),
[PROP-path-install](../../../common/v0.1.0/spec/modules/term-common/PROP-path-install.md),
[PROP-045](PROP-045-simple-terminal-frame.md) (the app itself),
[vibeterm's PROP-self-install](../../vibeterm/v0.1.0/spec/modules/vibeterm/PROP-self-install.md)
(the reference twin).

This contract governs **vibeframe's self-install**. It is identical to
vibeterm's in every respect except the product name — vibeframe is the
simple-frame sibling, packaged and installed the same way. The full
contracts (build pipeline, CLI surface, desktop integration, never-list)
live in vibeterm's PROP-self-install; this file pins only the deltas.

---

## 1. The deltas from vibeterm {#deltas}

REQ {#product-name}. The product name is `vibeframe` everywhere vibeterm's
PROP says `vibeterm`: the instance dir (`~/opt/vibeframe/versions/...`), the
shim (`~/opt/bin/vibeframe` / `vibeframe.cmd`), the `<VIBEFRAME_HOME>` env
var, and the desktop label `VibeFrame`.

REQ {#same-twin}. Everything else — the instance layout, the build pipeline
(`app/scripts/package.mjs` → `packageApp({ app: 'vibeframe' })`), the verb
set, the rename-aside placement, the shortcut behaviour, the never-list — is
the vibeterm twin verbatim. See
[vibeterm's PROP-self-install §1–§5](../../vibeterm/v0.1.0/spec/modules/vibeterm/PROP-self-install.md).

REQ {#gui-subsystem}. The packaged `vibeframe(.exe)` is a GUI-subsystem
binary — `vibe tree -t` (the host's launcher) opens it directly, no console
flash.
