/**
 * term-common vvm — the version store: the install-root layout, distribution
 * instances, the live `current` pointer, and the `state.toml` inventory
 * (PROP-019 §2.4, §2.5). Port of `vibe-cli/src/commands/vvm/store.rs`.
 *
 * Layout (under an install root, default `~/opt`):
 *
 *   <root>/<product>/versions/<kind>/<id>/<instance>/   one immutable instance
 *   <root>/<product>/build/                             shared staging for builds
 *   <root>/<product>/state.toml                         the inventory
 *   <root>/<product>/current                            the live pointer
 *   <root>/bin/                                         the on-PATH shim dir
 *
 * The host's store writes under `<root>/vibevm/`; a product writes under
 * `<root>/<product>/`. The `bin/` is shared (every product's shim lands
 * there), matching the host so a single dir goes on PATH.
 */

import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  InstallRecord,
  KIND,
  ORIGIN,
  State,
  VersionId,
} from './model.mjs';
import { tomlParse, tomlSerialise } from './toml.mjs';

/**
 * Build a platform-appropriate binary file name for a product.
 *
 * @param {string} product  the product name (`vibeterm`, `vibeframe`, `launcher`)
 * @returns {string}  `vibeterm.exe` on Windows, `vibeterm` elsewhere
 */
export function binaryName(product) {
  return process.platform === 'win32' ? `${product}.exe` : product;
}

/**
 * The `.vvm-manifest.toml` filename (shared with the placer).
 * @returns {string}
 */
export const MANIFEST_NAME = '.vvm-manifest.toml';

/**
 * Owns the on-disk layout under `<installRoot>/<product>` (PROP-019 §2.4).
 */
export class VersionStore {
  /**
   * @param {object} opts
   * @param {string} opts.installRoot  the `<base>` (default `~/opt`, not appended here)
   * @param {string} opts.product      the product name (`vibeterm` / `vibeframe` / `launcher`)
   */
  constructor({ installRoot, product }) {
    this.installRoot = installRoot;
    this.product = product;
  }

  /** @private The product's data root `<installRoot>/<product>`. */
  get _dataDir() {
    return join(this.installRoot, this.product);
  }

  /** `<installRoot>/bin` — the shim dir that goes on PATH (PROP-019 §2.5). */
  get shimDir() {
    return join(this.installRoot, 'bin');
  }

  /** `<dataDir>/versions`. */
  get versionsDir() {
    return join(this._dataDir, 'versions');
  }

  /**
   * `<dataDir>/versions/<kind>/<id>` — the parent of a version's instances.
   *
   * @param {VersionId} id
   * @returns {string}
   */
  versionIdDir(id) {
    return join(this.versionsDir, ...id.pathSegments());
  }

  /**
   * `<dataDir>/versions/<kind>/<id>/<instance>` — one immutable instance
   * (PROP-019 §2.4, §2.15).
   *
   * @param {VersionId} id
   * @param {number} instance
   * @returns {string}
   */
  instanceDir(id, instance) {
    return join(this.versionIdDir(id), String(instance));
  }

  /**
   * The product binary inside a specific instance.
   *
   * @param {VersionId} id
   * @param {number} instance
   * @returns {string}
   */
  binaryPath(id, instance) {
    return join(this.instanceDir(id, instance), binaryName(this.product));
  }

  /** `<dataDir>/build` — the shared staging for builds (PROP-019 §2.7). */
  get buildDir() {
    return join(this._dataDir, 'build');
  }

  /** `<dataDir>/state.toml`. */
  get statePath() {
    return join(this._dataDir, 'state.toml');
  }

  /** `<dataDir>/current` — the live pointer (PROP-019 §2.5). */
  get currentPath() {
    return join(this._dataDir, 'current');
  }

  /**
   * Load the inventory, defaulting to empty on a fresh machine.
   *
   * @returns {State}
   */
  loadState() {
    if (!existsSync(this.statePath)) return new State();
    const text = readFileSync(this.statePath, 'utf8');
    const parsed = tomlParse(text);
    const installs = (parsed.tables.install ?? []).map(rowFromToml);
    return new State({
      nextInstance: typeof parsed.scalars.next_instance === 'number'
        ? parsed.scalars.next_instance
        : 0,
      installs,
    });
  }

  /**
   * Write the inventory atomically (tmp + rename).
   *
   * @param {State} state
   * @returns {void}
   */
  saveState(state) {
    const dir = this._dataDir;
    mkdirSync(dir, { recursive: true });
    const text = tomlSerialise({
      scalars: [['next_instance', state.nextInstance]],
      tables: [{ name: 'install', rows: state.installs.map(rowToToml) }],
    });
    const tmp = join(dir, 'state.toml.tmp');
    writeFileSync(tmp, text);
    renameSync(tmp, this.statePath);
  }

  /**
   * Allocate the next monotonic instance number (PROP-019 §9.4).
   *
   * @returns {number}
   */
  allocInstance() {
    const state = this.loadState();
    const n = Math.max(state.nextInstance, 1);
    state.nextInstance = n + 1;
    this.saveState(state);
    return n;
  }

  /**
   * Upsert an instance record (replacing any with the same id+instance).
   *
   * @param {InstallRecord} record
   * @returns {void}
   */
  recordInstall(record) {
    const state = this.loadState();
    state.installs = state.installs.filter(
      (r) =>
        !(
          r.versionId().equals(record.versionId()) &&
          r.instance === record.instance
        ),
    );
    state.installs.push(record);
    this.saveState(state);
  }

  /**
   * All recorded instances of a version id, ascending by instance number.
   *
   * @param {VersionId} id
   * @returns {InstallRecord[]}
   */
  instancesOf(id) {
    return this.loadState()
      .installs.filter((r) => r.versionId().equals(id))
      .sort((a, b) => a.instance - b.instance);
  }

  /**
   * Drop every instance record of a version id (no-op if absent). Does not
   * touch files.
   *
   * @param {VersionId} id
   * @returns {void}
   */
  forgetId(id) {
    const state = this.loadState();
    const before = state.installs.length;
    state.installs = state.installs.filter((r) => !r.versionId().equals(id));
    if (state.installs.length !== before) this.saveState(state);
  }

  /**
   * Drop a single instance record (no-op if absent).
   *
   * @param {VersionId} id
   * @param {number} instance
   * @returns {void}
   */
  forgetInstance(id, instance) {
    const state = this.loadState();
    const before = state.installs.length;
    state.installs = state.installs.filter(
      (r) => !(r.versionId().equals(id) && r.instance === instance),
    );
    if (state.installs.length !== before) this.saveState(state);
  }

  /**
   * The active instance dir as named by the `current` file (PROP-019 §2.5).
   *
   * @returns {string | null}
   */
  readCurrent() {
    if (!existsSync(this.currentPath)) return null;
    const text = readFileSync(this.currentPath, 'utf8');
    const trimmed = text.trim();
    return trimmed === '' ? null : trimmed;
  }

  /**
   * Repoint `current` at an instance dir, atomically (PROP-019 §2.5).
   *
   * @param {string} instanceDir
   * @returns {void}
   */
  writeCurrent(instanceDir) {
    const dir = this._dataDir;
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, 'current.tmp');
    writeFileSync(tmp, `${instanceDir}\n`);
    renameSync(tmp, this.currentPath);
  }

  /**
   * The installed instance the `current` file points at, if any.
   *
   * @returns {InstallRecord | null}
   */
  active() {
    const home = this.readCurrent();
    if (home === null) return null;
    for (const record of this.loadState().installs) {
      if (samePath(this.instanceDir(record.versionId(), record.instance), home)) {
        return record;
      }
    }
    return null;
  }
}

/**
 * Compare two paths for identity, canonicalising (realpath) when both exist.
 * Node has no `canonicalize` that works for non-existent paths; `realpathSync`
 * throws on missing files, so we fall back to a string compare in that case.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function samePath(a, b) {
  const ra = realpathSafe(a);
  const rb = realpathSafe(b);
  if (ra !== null && rb !== null) return ra === rb;
  return a === b;
}

/**
 * @param {string} p
 * @returns {string | null}
 */
function realpathSafe(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * @param {InstallRecord} r
 * @returns {Record<string, import('./toml.mjs').Scalar>}
 */
function rowToToml(r) {
  return {
    kind: r.kind,
    id: r.id,
    instance: r.instance,
    commit: r.commit,
    toolchain: r.toolchain,
    profile: r.profile,
    installed_at: r.installedAt,
    origin: r.origin,
    source_path: r.sourcePath ?? null,
  };
}

/**
 * @param {Record<string, import('./toml.mjs').Scalar>} row
 * @returns {InstallRecord}
 */
function rowFromToml(row) {
  const kind = /** @type {import('./model.mjs').Kind} */ (row.kind);
  const profile = /** @type {import('./model.mjs').Profile} */ (row.profile);
  const origin = /** @type {import('./model.mjs').Origin} */ (row.origin);
  return new InstallRecord({
    kind,
    id: String(row.id ?? ''),
    instance: typeof row.instance === 'number' ? row.instance : 0,
    commit: String(row.commit ?? ''),
    toolchain: String(row.toolchain ?? ''),
    profile,
    installedAt: String(row.installed_at ?? ''),
    origin,
    sourcePath: row.source_path === null || row.source_path === undefined
      ? null
      : String(row.source_path),
  });
}

// Re-export the KIND/ORIGIN for callers that build InstallRecords by hand.
export { KIND, ORIGIN };
