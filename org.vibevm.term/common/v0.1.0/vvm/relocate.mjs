/**
 * term-common vvm — `<product> self relocate`: repoint source provenance to a
 * moved checkout and clear the instances built from the abandoned tree
 * (PROP-019 §2.17).
 * Port of `vibe-cli/src/commands/vvm/relocate/mod.rs`.
 *
 * A committer's checkout is not pinned in place. When it moves, every
 * *external* instance's remembered `sourcePath` goes stale — a later
 * linked-source rebuild would miss — and the instances built from the old
 * tree clutter `self ls`. Relocate rewrites the remembered paths to the new
 * tree and removes the now-stale built instances, behind an interactive
 * warning or `--yes`. The active instance is kept (its source is repointed,
 * never deleted); removing a version is `self remove`'s job (§2.9).
 */

import { existsSync, rmSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';

import { ORIGIN } from './model.mjs';
import { realpathSync } from 'node:fs';
import { VersionStore } from './store.mjs';

/**
 * What `self relocate` will do (PROP-019 §2.17): a pure projection of the
 * inventory, the old/new paths, and the active instance. [`applyRelocate`]
 * turns it into filesystem + state changes.
 *
 * @typedef {Object} RelocatePlan
 * @property {string} old  the recorded source path, repointed away from
 * @property {string} new  the new source path (canonical), repointed to
 * @property {Array<[import('./model.mjs').VersionId, number]>} repoint  active instances kept
 * @property {Array<[import('./model.mjs').VersionId, number]>} delete  stale instances removed
 * @property {number} untouched  records that are neither external-from-old
 */

/**
 * Whether the candidate is a vibevm-term product package root — the dir
 * carrying a `vibe.toml` and the package subdir. Used to validate the new
 * location before repointing (PROP-019 §2.17).
 *
 * @param {string} start
 * @returns {string | null}  the source root, or null when not inside one
 */
export function findSourceRoot(start) {
  let cursor = resolve(start);
  // Walk up — but no higher than the product package root (a `vibe.toml` +
  // an org.vibevm.term sibling). Going higher would match the workspace
  // root, which is not a single product.
  while (true) {
    if (existsSync(join(cursor, 'vibe.toml'))) {
      return cursor;
    }
    const parent = join(cursor, '..');
    if (parent === cursor) return null; // reached the filesystem root
    cursor = parent;
  }
}

/**
 * Canonical absolute path of a source tree — `realpath` when it exists, the
 * cleaned absolute path otherwise. The form install records.
 *
 * @param {string} p
 * @returns {string}
 */
export function externalPath(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/**
 * Whether two paths name the same location, canonicalising when possible.
 * Re-exports from store for the relocate oracle tests.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameLocation(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}

/**
 * The most common recorded `source_path` among external installs — the old
 * location a single moved checkout leaves behind (PROP-019 §2.17). `null`
 * when no external install records a source tree.
 *
 * @param {import('./model.mjs').State} state
 * @returns {string | null}
 */
function inferOldSource(state) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const r of state.installs) {
    if (r.origin === ORIGIN.EXTERNAL && r.sourcePath !== null) {
      counts.set(r.sourcePath, (counts.get(r.sourcePath) ?? 0) + 1);
    }
  }
  let best = null;
  let bestN = -1;
  for (const [p, n] of counts) {
    if (n > bestN) {
      best = p;
      bestN = n;
    }
  }
  return best;
}

/**
 * Partition the inventory into the relocate plan (PROP-019 §2.17). Pure.
 *
 * @param {object} args
 * @param {import('./model.mjs').State} args.state
 * @param {string} args.old
 * @param {string} args.new
 * @param {import('./model.mjs').InstallRecord | null} args.active
 * @returns {RelocatePlan}
 */
export function planRelocate({ state, old, new: newPath, active }) {
  /** @type {Array<[import('./model.mjs').VersionId, number]>} */
  const repoint = [];
  /** @type {Array<[import('./model.mjs').VersionId, number]>} */
  const del = [];
  let untouched = 0;
  for (const r of state.installs) {
    const matchesOld =
      r.origin === ORIGIN.EXTERNAL &&
      r.sourcePath !== null &&
      sameLocation(r.sourcePath, old);
    if (!matchesOld) {
      untouched += 1;
      continue;
    }
    if (active && active.versionId().equals(r.versionId()) && active.instance === r.instance) {
      repoint.push([r.versionId(), r.instance]);
    } else {
      del.push([r.versionId(), r.instance]);
    }
  }
  return { old, new: newPath, repoint, delete: del, untouched };
}

/**
 * How many instance dirs were actually removed vs. skipped (locked).
 *
 * @typedef {{ removed: number, skipped: number }} ApplyCounts
 */

/**
 * Apply a relocate plan (PROP-019 §2.17): remove the stale instance dirs
 * (best-effort — a dir locked by a running process is skipped and its record
 * kept for a later sweep), then rewrite `state.toml` once.
 *
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {RelocatePlan} args.plan
 * @param {(msg: string) => void} [note]  for locked-dir notes
 * @returns {ApplyCounts}
 */
export function applyRelocate({ store, plan, note = () => {} }) {
  // 1. Remove the stale instance directories (the filesystem half). A locked
  //    dir is reported and KEPT so it is not orphaned.
  /** @type {Array<[import('./model.mjs').VersionId, number]>} */
  const kept = [];
  for (const [id, instance] of plan.delete) {
    const dir = store.instanceDir(id, instance);
    if (!existsSync(dir)) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      note(`skipped ${dir} (in use?): ${e instanceof Error ? e.message : String(e)}`);
      kept.push([id, instance]);
    }
  }
  // 2. Rewrite the inventory once, then persist.
  const state = store.loadState();
  const counts = rewriteState(state, plan, kept);
  store.saveState(state);
  return counts;
}

/**
 * Rewrite the inventory for a relocate plan (PROP-019 §2.17). Pure over
 * `state`: forgets a deleted instance's record **unless** it is in `kept`
 * (its dir was locked — the record stays), and repoints the active
 * instance's `sourcePath` to the new path.
 *
 * @param {import('./model.mjs').State} state
 * @param {RelocatePlan} plan
 * @param {Array<[import('./model.mjs').VersionId, number]>} kept
 * @returns {ApplyCounts}
 */
function rewriteState(state, plan, kept) {
  state.installs = state.installs.filter((r) => {
    const deleted = plan.delete.some(
      ([id, n]) => r.versionId().equals(id) && r.instance === n,
    );
    if (!deleted) return true;
    // A deleted instance is dropped UNLESS its dir was locked.
    return kept.some(
      ([id, n]) => r.versionId().equals(id) && r.instance === n,
    );
  });
  for (const r of state.installs) {
    if (plan.repoint.some(([id, n]) => r.versionId().equals(id) && r.instance === n)) {
      r.sourcePath = plan.new;
    }
  }
  return { removed: plan.delete.length - kept.length, skipped: kept.length };
}

export { isAbsolute };
