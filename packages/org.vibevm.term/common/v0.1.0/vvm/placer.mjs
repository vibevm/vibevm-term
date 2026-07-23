/**
 * term-common vvm — placing a built distribution into a new immutable instance
 * by diff-copy (PROP-019 §2.15): hardlink unchanged files from the previous
 * instance, copy only what changed, never hashing large files.
 * Port of `vibe-cli/src/commands/vvm/placer.rs`.
 *
 * Node's `fs.linkSync` stands in for Rust's `fs::hard_link`; `copyFileSync`
 * for `fs::copy`. The transient-lock retry (Windows scanner holding a freshly
 * written exe) is preserved — the same race the Rust placer retries on.
 */

import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';

import { VersionId } from './model.mjs';
import { MANIFEST_NAME, VersionStore } from './store.mjs';
import { tomlParse, tomlSerialise } from './toml.mjs';

/**
 * Files at or below this size are compared by content hash (cheap, robust);
 * larger files are compared by `(size, mtime)` only — never read in bulk
 * (PROP-019 §2.15, §9.2).
 */
const SMALL_FILE_MAX = 16 * 1024 * 1024;

/**
 * One distribution file's identity in a manifest.
 */
export class FileEntry {
  /**
   * @param {object} e
   * @param {string} e.rel
   * @param {number} e.size
   * @param {number} e.mtimeMs   mtime in milliseconds (PROP-019 §2.15)
   * @param {string | null} [e.hash]
   */
  constructor(e) {
    this.rel = e.rel;
    this.size = e.size;
    this.mtimeMs = e.mtimeMs;
    this.hash = e.hash ?? null;
  }
}

/**
 * The per-instance file manifest (`.vvm-manifest.toml`).
 */
export class Manifest {
  /**
   * @param {FileEntry[]} [files]
   */
  constructor(files = []) {
    this.files = files;
  }

  /**
   * @param {string} rel
   * @returns {FileEntry | undefined}
   */
  get(rel) {
    return this.files.find((e) => e.rel === rel);
  }
}

/**
 * Compute a manifest entry for a distribution file (PROP-019 §2.15).
 *
 * @param {string} src  absolute source path
 * @param {string} rel  the in-instance relative path
 * @returns {FileEntry}
 */
function entryFor(src, rel) {
  const meta = statSync(src);
  const hash = meta.size <= SMALL_FILE_MAX ? smallFileHash(src) : null;
  // Round to whole milliseconds — the unchanged-by-(size,mtime) test is
  // symmetric (both entries come from this same API), and the integer form
  // is the only numeric type the schema's mini TOML admits (PROP-019 §2.15).
  return new FileEntry({
    rel,
    size: meta.size,
    mtimeMs: Math.floor(meta.mtimeMs),
    hash,
  });
}

/**
 * @param {string} path
 * @returns {string | null}
 */
function smallFileHash(path) {
  try {
    const bytes = readFileSync(path);
    return createHash('sha256').update(bytes).digest('hex');
  } catch {
    return null;
  }
}

/**
 * The manifest of a freshly-built distribution (PROP-019 §2.15).
 *
 * @param {Array<[string, string]>} dist  `(absSrc, rel)` pairs
 * @returns {Manifest}
 */
export function manifestFor(dist) {
  return new Manifest(dist.map(([src, rel]) => entryFor(src, rel)));
}

/**
 * Whether two entries are the same file: by content hash for small files,
 * else by `(size, mtime)` (PROP-019 §2.15).
 *
 * @param {FileEntry} a
 * @param {FileEntry} b
 * @returns {boolean}
 */
function unchanged(a, b) {
  if (a.hash !== null && b.hash !== null) return a.hash === b.hash;
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/**
 * Read an instance's manifest, if present.
 *
 * @param {string} instanceDir
 * @returns {Manifest | null}
 */
export function readManifest(instanceDir) {
  const path = join(instanceDir, MANIFEST_NAME);
  if (!existsSync(path)) return null;
  try {
    const parsed = tomlParse(readFileSync(path, 'utf8'));
    const files = (parsed.tables.file ?? []).map(
      (row) =>
        new FileEntry({
          rel: String(row.rel ?? ''),
          size: typeof row.size === 'number' ? row.size : 0,
          mtimeMs: typeof row.mtime_ms === 'number' ? row.mtime_ms : 0,
          hash: row.hash === null || row.hash === undefined ? null : String(row.hash),
        }),
    );
    return new Manifest(files);
  } catch {
    return null;
  }
}

/**
 * Whether a new build is byte-for-byte the previous instance (so no new
 * instance is needed) (PROP-019 §2.15).
 *
 * @param {Manifest} next
 * @param {Manifest} prev
 * @returns {boolean}
 */
export function manifestMatches(next, prev) {
  if (next.files.length !== prev.files.length) return false;
  return next.files.every((e) => {
    const pe = prev.get(e.rel);
    return pe ? unchanged(e, pe) : false;
  });
}

/**
 * Is `e` the transient "a real-time scanner / indexer has a handle open on a
 * file inside this directory" lock? On Windows, `fs.renameSync` / `rmSync` of
 * a directory holding a freshly written exe trips `EPERM` / `EBUSY` / `EACCES`
 * moments after the write; the handle releases within a second or two, so a
 * short retry turns a flaky install into a reliable one. `ENOTEMPTY` is the
 * kind-level retry class for `rmdir` on a populated dir on POSIX.
 *
 * @param {NodeJS.ErrnoException} e
 * @returns {boolean}
 */
function isTransientLock(e) {
  return (
    e.code === 'EACCES' ||
    e.code === 'EPERM' ||
    e.code === 'EBUSY' ||
    e.code === 'ENOTEMPTY'
  );
}

/**
 * Backoff sequence for the transient-lock retry (~5s total — long enough for
 * a scanner handle, short enough that a genuinely locked file still surfaces).
 */
const BACKOFF_MS = [100, 200, 400, 800, 800, 800, 800];

/**
 * Run `op`, retrying only on a transient lock with a short backoff. A
 * non-lock error surfaces immediately — the retry never masks a real failure.
 *
 * @template T
 * @param {() => T} op
 * @returns {T}
 */
function retry(op) {
  let last = null;
  for (const ms of BACKOFF_MS) {
    try {
      return op();
    } catch (e) {
      const err = /** @type {NodeJS.ErrnoException} */ (e);
      if (!isTransientLock(err)) throw e;
      last = err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    }
  }
  throw last ?? new Error('retry backoff exhausted');
}

/** renameSync with a transient-lock retry. */
function renameIntoPlace(from, to) {
  retry(() => renameSync(from, to));
}

/** rmSync (recursive) with a transient-lock retry. */
function removeTree(path) {
  retry(() => rmSync(path, { recursive: true, force: true }));
}

/**
 * Place a distribution into a new instance dir by diff-copy: hardlink files
 * unchanged versus `prev`, copy the rest, write the manifest, and publish
 * atomically (PROP-019 §2.15).
 *
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {VersionId} args.id
 * @param {number} args.instance
 * @param {Array<[string, string]>} args.dist  `(absSrc, rel)` pairs
 * @param {Manifest} args.manifest
 * @param {{ prevDir: string, prevManifest: Manifest } | null} [args.prev]
 * @returns {void}
 */
export function place({ store, id, instance, dist, manifest, prev = null }) {
  const staging = join(store.versionIdDir(id), '.staging');
  if (existsSync(staging)) removeTree(staging);
  mkdirSync(staging, { recursive: true });

  for (const [src, rel] of dist) {
    const dest = join(staging, rel);
    const parent = dirname(dest);
    mkdirSync(parent, { recursive: true });

    // Try to hardlink from the previous instance's copy of this file when
    // the manifest says it is unchanged; fall back to a fresh copy.
    const reuse =
      prev && manifest.get(rel) && prev.prevManifest.get(rel)
        ? unchanged(
            /** @type {FileEntry} */ (manifest.get(rel)),
            /** @type {FileEntry} */ (prev.prevManifest.get(rel)),
          )
          ? join(prev.prevDir, rel)
          : null
        : null;
    let hardlinked = false;
    if (reuse) {
      try {
        linkSync(reuse, dest);
        hardlinked = true;
      } catch {
        // Fall through to copy — hardlinks aren't supported on every FS.
      }
    }
    if (!hardlinked) copyFileSync(src, dest);
  }

  const manifestText = tomlSerialise({
    scalars: [],
    tables: [
      {
        name: 'file',
        rows: manifest.files.map((f) => ({
          rel: f.rel,
          size: f.size,
          mtime_ms: f.mtimeMs,
          hash: f.hash,
        })),
      },
    ],
  });
  writeFileSync(join(staging, MANIFEST_NAME), manifestText);

  const finalDir = store.instanceDir(id, instance);
  if (existsSync(finalDir)) removeTree(finalDir);
  const parent = dirname(finalDir);
  mkdirSync(parent, { recursive: true });
  renameIntoPlace(staging, finalDir);
}

// re-export for callers building dist sets / manifests by hand.
export { readdirSync, relative };
