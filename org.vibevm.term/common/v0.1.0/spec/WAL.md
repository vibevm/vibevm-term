# WAL — term-common continuation state

## CHECKPOINT 2026-07-21 — PACKAGE SKELETON LANDED

**Phase:** 1 (packages move-in). **Status:** skeleton complete; helpers and
contracts pending.

**Landed this commit:** the package skeleton — `vibe.toml` (kind=tool,
requires.packages redbook ^0.2.0 + rust-ai-native ^0.7.0 static-transitive),
`LICENSE.md` (UPL-1.0), `README.md`, `package.json` (@org.vibevm/term-common,
ESM, exports map), `tsconfig.json` (AI-Native strict floor), `.gitignore`
(per-package `.vibe/`, `vibedeps/`, `node_modules/`), `spec/boot/{INDEX,
00-core,10-tool-term-common}.md`, this WAL.

**Next:** B.2 — port `apps/vibeterm/lib/{args,keymap}.mjs` → `src/`, port
their `test/{args,keymap}.test.mjs`, verify `node --test` is green; B.3 —
generalize `packaging.mjs`; B.4 — author the 6 shared `PROP-*.md` contracts.

**Open:** the AI-Native static deps (`vibedeps/`) are not yet populated —
run `vibe install` in this package to populate them after the helpers land
(or fall back to copying vendored trees from
`packages/org.vibevm.fractality/fractality/v0.1.0/vibedeps/` in the host
repo).
