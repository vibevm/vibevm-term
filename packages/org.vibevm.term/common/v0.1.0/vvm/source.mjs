/**
 * term-common vvm — source-tree location + selector→commit resolution.
 *
 * The host's `source.rs` carries the full managed-clone machinery (git
 * mirror fetch / checkout / selector resolution against a clone). The
 * products repo today is external-only: a committer's checkout is the
 * source, the version-manager builds from it. Managed clones are out of
 * scope for v1 (the host's PROP-019 §2.16 has them; products can add them
 * later by extending this module). What remains:
 *
 *  - `findSourceRoot` — walk up to the product package root (vibe.toml).
 *  - `labelInTree` — the version label + commit for an in-tree build, read
 *    from git HEAD (the current branch when on one, else the commit).
 *  - `linkedSource` — rebuild an external version from its remembered path.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { KIND, VersionId } from './model.mjs';
import { externalPath } from './relocate.mjs';

/**
 * Walk up from `start` to the product package root — the dir carrying a
 * `vibe.toml`. `null` when not inside one.
 *
 * @param {string} start
 * @returns {string | null}
 */
export function findSourceRoot(start) {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(join(cursor, 'vibe.toml'))) {
      return cursor;
    }
    const parent = join(cursor, '..');
    if (parent === cursor) return null;
    cursor = parent;
  }
}

/**
 * Derive the version label + commit for an in-tree build from git HEAD
 * (PROP-019 §2.7): the current branch when on one, else the commit.
 *
 * @param {string} sourceRoot
 * @returns {{ id: import('./model.mjs').VersionId, commit: string }}
 */
export function labelInTree(sourceRoot) {
  const commit = gitHeadCommit(sourceRoot) ?? 'unknown';
  const branch = gitCurrentBranch(sourceRoot);
  if (branch !== null) {
    return { id: VersionId.new(KIND.BRANCH, branch), commit };
  }
  return { id: VersionId.new(KIND.COMMIT, commit), commit };
}

/**
 * Rebuild an external version from its remembered path, if a record's
 * `sourcePath` resolves to a real product checkout.
 *
 * @param {object} args
 * @param {import('./store.mjs').VersionStore} args.store
 * @param {import('./model.mjs').Selector} args.selector
 * @returns {string | null}  the source root to rebuild from
 */
export function linkedSource({ store, selector }) {
  // Only explicit selectors can carry a remembered source path; `latest` /
  // `stable` always rebuild the in-tree or managed clone.
  if (selector.tag !== 'explicit') return null;
  const id = selector.id;
  const insts = store.instancesOf(id);
  const rec = insts[insts.length - 1];
  if (!rec || rec.origin !== 'managed' /* re-use managed's mirror */ && rec.sourcePath === null) {
    return null;
  }
  if (rec.sourcePath === null) return null;
  if (!existsSync(rec.sourcePath)) return null;
  return rec.sourcePath;
}

/**
 * @param {string} sourceRoot
 * @returns {string | null}
 */
function gitHeadCommit(sourceRoot) {
  const out = spawnSync(
    'git',
    ['-C', sourceRoot, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (out.status !== 0) return null;
  return out.stdout.trim();
}

/**
 * @param {string} sourceRoot
 * @returns {string | null}
 */
function gitCurrentBranch(sourceRoot) {
  const out = spawnSync(
    'git',
    ['-C', sourceRoot, 'symbolic-ref', '--short', 'HEAD'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (out.status !== 0) return null;
  const s = out.stdout.trim();
  return s === '' ? null : s;
}

export { externalPath };
