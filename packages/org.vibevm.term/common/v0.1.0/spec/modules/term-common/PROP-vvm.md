# PROP-vvm — the ported version-manager {#root}

**Status:** AUTHORITATIVE (v0.1, 2026-07-21). **Module:** `term-common`.
**Genre:** contract. **Provenance:** a TypeScript port of the host's
`vibe-cli/src/commands/vvm/` (Rust), which remains the authoritative twin
(`spec://vibevm/common/PROP-019#root`). **Related:**
[PROP-path-install](PROP-path-install.md) (where the instances land on the
host), [the vvm implementation](../../vvm/) (the port itself).

This contract governs the **version-manager** the terminal products
(vibeterm, vibeframe, vibe-launcher) self-install through. It is the
products-repo twin of the host's `vibe self` (PROP-019): same invariants
(monotonic instances, diff-copy placement, dedup-skip, source provenance,
relocate), same on-disk shape, same verb set. A product that ships this
manager is a version-manager twin of `vibe`, not a fork — the contracts
agree by construction.

---

## 1. The instance layout {#layout}

REQ {#per-product-root}. A product's instances live under
`<installRoot>/<product>/versions/<kind>/<id>/<instance>/`, where
`<installRoot>` is `$VIBEVM_INSTALL_ROOT` (default `~/opt`) and `<product>`
is the product name (`vibeterm` / `vibeframe` / `launcher`). The per-product
subdir means one product cannot see another's instances — but they share one
`<installRoot>/bin/` shim dir, so a single dir goes on `PATH`.

REQ {#kind-namespace}. The `<kind>` segment is one of `tag` / `branch` /
`commit`; it namespaces the on-disk layout so a tag `1.2.3` and a branch
`1.2.3` never collide. A version id is the canonical `<kind>:<id>`.

REQ {#immutable-instances}. An instance dir is **immutable** once published:
a new build lands in a fresh instance number, the `current` pointer flips,
the old dir stays until `self remove` / `self gc` collects it. Never an
in-place file replace.

REQ {#state-toml}. The inventory is `<installRoot>/<product>/state.toml`
(TOML, a top-level `next_instance` counter plus an `[[install]]` array of
records carrying the version id, instance number, build commit, toolchain
stamp, profile, install timestamp, origin, and optional source path). The
*active* instance is the separate `current` file, not stored here.

REQ {#current-pointer}. `<installRoot>/<product>/current` carries the
absolute path of the active instance dir. The on-PATH shim reads this file
at exec time — a `self use` flip is instant, no console reload. The
`<PRODUCT>_HOME` env var (uppercased product name) is advisory only.

## 2. The verb set {#verbs}

REQ {#install}. `<product> self install [<selector>]` builds the product
from the in-tree checkout (the committer's working copy), places it in a
fresh instance by diff-copy, records provenance, and flips `current`.
`--release` (default for packaged apps) / `--debug` selects the build
profile; `--force` ignores the dedup-skip. The selector defaults to
`latest` (the current branch HEAD).

REQ {#update}. `<product> self update` is a thin alias for `self install
latest`, carrying only the build knobs.

REQ {#use}. `<product> self use <selector>` flips `current` to an
*installed* instance (no rebuild). `--eval` prints the export line only,
persisting nothing.

REQ {#ls}. `<product> self ls` lists the installed instances, marking the
active one with `*`.

REQ {#current}. `<product> self current` prints the active version +
instance.

REQ {#which}. `<product> self which` prints the absolute path of the active
binary.

REQ {#doctor}. `<product> self doctor [--fix]` probes the required
toolchain (Node + npm for Electron apps; cargo for the launcher), the shim
dir on `PATH`, and the active instance's binary. Problems block.
`--fix` writes the shim and ensures the shim dir is on `PATH`.

REQ {#remove}. `<product> self remove <selector>...` removes instance(s).
Never the active instance — `self use` something else first. An
interactive confirm unless `--yes`.

REQ {#gc}. `<product> self gc` drops orphan records whose instance dir is
gone (a partial removal, a moved checkout's leftover).

REQ {#env}. `<product> self env [<selector>]` prints the `eval`-able line
that sets `<PRODUCT>_HOME` for the active (or named) version.

REQ {#relocate}. `<product> self relocate <new-path>` repoints source
provenance to a moved checkout and removes the instances built from the
abandoned tree (§3 of `spec://vibevm/common/PROP-019#relocate`). The active
instance is repointed, never deleted.

## 3. The diff-copy placement {#instances}

REQ {#diff-copy}. Placement is by **diff-copy** (PROP-019 §2.15): the new
build is placed into a fresh instance dir, hardlinking files unchanged
versus the previous instance and copying only what changed. Never a content
hash of large files (PROP-019 §9.2); small files (≤ 16 MiB) compare by
SHA-256, larger files by `(size, mtimeMs)`.

REQ {#manifest}. Each instance carries a `.vvm-manifest.toml` listing every
file with its relative path, size, mtime in milliseconds, and optional
hash. The manifest is what makes the dedup-skip (§4) and the hardlink
decision possible.

REQ {#atomic-publish}. The instance is staged in `<versions>/<kind>/<id>/
.staging`, then renamed into place atomically (with a transient-lock retry
on Windows — a real-time scanner holding a freshly written exe trips the
rename moments after the write).

## 4. The dedup-skip {#dedup-skip}

REQ {#dedup-skip}. When a build is byte-identical to the latest instance
(same manifest) and `--force` is absent, no new instance is made — `current`
just repoints to the existing one. This is what makes a no-op `self update`
cheap (no 2 GB rebuild for no change). `--force` overrides, always making a
new instance.

## 5. Provenance & relocate {#provenance}

REQ {#origin}. Every install record carries an `origin`: `external` (the
committer's own checkout, referenced by `sourcePath` — never touched by the
version-manager), `managed` (a version-manager-owned clone — supported but
not yet wired for products), or `binary` (prebuilt artifact — far backlog).

REQ {#relocate}. `self relocate` rewrites the `sourcePath` of every external
instance sourced from the moved checkout, and removes the now-stale built
instances. The active instance is repointed, never deleted. A dir locked by
a running process is skipped and its record kept for a later sweep.

## 6. The cross-floor twin {#twin}

REQ {#twin-invariants}. This port MUST hold the same invariants the host's
`vibe self` holds (PROP-019): monotonic instance allocation from 1; instance
immutability; diff-copy placement with hardlinks; dedup-skip by manifest;
atomic publish with a transient-lock retry; the `current`-pointer truth; the
`<PRODUCT>_HOME` advisory env. The host's `vibe self` tests and this port's
`test/vvm.test.mjs` assert the same shapes — a conformance drift between
them is a bug, not a divergence to tolerate.

REQ {#host-cross-link}. The provenance twin is
`spec://vibevm/common/PROP-019#root` (host repo, cross-repo contract). The
product version-manager does NOT reuse the host's `~/opt/vibevm/` state —
each product has its own `<installRoot>/<product>/` state — but the layouts
are mirror images so a reader of one understands the other.

## 7. Never {#never}

- Never mutate an instance dir after publish — make a new one.
- Never let a no-op rebuild make a new instance — dedup-skip.
- Never content-hash a large file — `(size, mtime)` only.
- Never delete the active instance — `self use` something else first.
- Never share state between products — the `<product>/` namespace is the
  isolation boundary.
