/**
 * term-common vvm — the install pipeline orchestration (PROP-019 §2.7):
 * lock, build, place the distribution into a new instance by diff-copy
 * (skipping when nothing changed), record provenance, flip `current`, and
 * refresh the on-PATH shim + desktop shortcuts.
 * Port of `vibe-cli/src/commands/vvm/install.rs`, plus the launcher refresh
 * (the host's removed `launchers.rs`) folded in as the products' own concern.
 *
 * Differs from the host's `perform_install`:
 *  - No packager / launcher seams — the `Builder` already produces the full
 *    dist set (ElectronAppBuilder / LauncherBuilder).
 *  - After flipping `current`, the on-PATH shim for `<product>` is (re)written
 *    and the desktop shortcut for the active instance's binary is refreshed.
 *    The host did this for `vibe` shims separately; here it is one step.
 */

import { mkdirSync, openSync, closeSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { InstallRecord, ORIGIN } from './model.mjs';
import { manifestFor, manifestMatches, Manifest, place, readManifest } from './placer.mjs';
import { binaryName, VersionStore } from './store.mjs';
import { installShortcut, placeExe } from './shortcuts.mjs';
import { writeShim } from './env.mjs';

/**
 * Parameters for [`performInstall`].
 *
 * @typedef {Object} InstallRequest
 * @property {import('./builder.mjs').ResolvedVersion} resolved
 * @property {import('./model.mjs').Profile} profile
 * @property {boolean} force
 * @property {string} now  RFC3339 timestamp
 * @property {import('./model.mjs').Origin} origin
 * @property {string | null} sourcePath
 */

/**
 * @typedef {Object} InstallEvents
 * @property {(msg: string) => void} [step]      a progress line ("building …")
 * @property {(msg: string) => void} [summary]   a one-line outcome ("installed tag:1.2.3 (instance 2) — active")
 * @property {(msg: string) => void} [note]      a non-fatal warning ("skipped shortcut …")
 * @property {(path: string) => void} [created]  a path the install created (for JSON `created` arrays)
 */

/**
 * A best-effort install lock so two installs do not race (PROP-019 §2.7).
 * Modeled on the Rust `InstallLock`: a `create-new` file under the data dir,
 * removed on return; an existing file bails.
 */
class InstallLock {
  /**
   * @param {VersionStore} store
   * @returns {InstallLock}
   */
  static acquire(store) {
    const dir = store._dataDir;
    mkdirSync(dir, { recursive: true });
    const path = join(dir, '.install.lock');
    if (existsSync(path)) {
      throw new Error(
        `another \`${store.product} self install\` is in progress ` +
          `(remove \`${path}\` if it is stale)`,
      );
    }
    // create-new: O_EXCL — throws if the file already exists (the race).
    const fd = openSync(path, 'wx');
    closeSync(fd);
    return new InstallLock(path);
  }

  /** @param {string} path */
  constructor(path) {
    this.path = path;
  }

  release() {
    try {
      unlinkSync(this.path);
    } catch {
      // best-effort
    }
  }
}

/**
 * Build and publish a resolved version into a fresh instance (PROP-019
 * §2.7, §2.15). If the build is byte-identical to the latest instance and
 * `--force` is absent, no new instance is made — `current` just points at it
 * (the dedup-skip). Always refreshes the shim + shortcut (so a no-op install
 * still heals a broken shortcut).
 *
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {string} args.sourceRoot  the product package root
 * @param {InstallRequest} args.req
 * @param {import('./builder.mjs').Builder} args.builder
 * @param {InstallEvents} [args.events]
 * @returns {{ dedupSkipped: boolean, instance: number }}  the instance number
 *   of the now-active install (a fresh one or the previous one on dedup-skip)
 */
export function performInstall({ store, sourceRoot, req, builder, events }) {
  const step = events?.step ?? (() => {});
  const summary = events?.summary ?? (() => {});
  const note = events?.note ?? (() => {});
  const created = events?.created ?? (() => {});

  const lock = InstallLock.acquire(store);
  try {
    const id = req.resolved.id;
    step(`building ${id} (${req.profile}) from ${sourceRoot}`);
    const out = builder.build(sourceRoot, store.buildDir, req.profile);
    const manifest = manifestFor(out.dist);

    const prev = latestInstance(store, id);
    if (prev && !req.force && manifestMatches(manifest, prev.manifest)) {
      store.writeCurrent(prev.dir);
      summary(`${id} already up to date (instance ${prev.record.instance}) — active`);
      refreshExternal(store, prev.dir, note);
      return { dedupSkipped: true, instance: prev.record.instance };
    }

    const instance = store.allocInstance();
    place({
      store,
      id,
      instance,
      dist: out.dist,
      manifest,
      prev: prev ? { prevDir: prev.dir, prevManifest: prev.manifest } : null,
    });

    store.recordInstall(
      new InstallRecord({
        kind: id.kind,
        id: id.id,
        instance,
        commit: req.resolved.commit,
        toolchain: out.toolchain,
        profile: req.profile,
        installedAt: req.now,
        origin: req.origin,
        sourcePath: req.sourcePath,
      }),
    );

    const instDir = store.instanceDir(id, instance);
    store.writeCurrent(instDir);
    created(instDir);
    summary(`installed ${id} (instance ${instance}) — active`);
    refreshExternal(store, instDir, note);
    return { dedupSkipped: false, instance };
  } finally {
    lock.release();
  }
}

/**
 * The newest existing instance of `id` plus its manifest, for diff-copy.
 *
 * @param {VersionStore} store
 * @param {import('./model.mjs').VersionId} id
 * @returns {{ dir: string, manifest: import('./placer.mjs').Manifest, record: import('./model.mjs').InstallRecord } | null}
 */
function latestInstance(store, id) {
  const insts = store.instancesOf(id);
  const rec = insts[insts.length - 1];
  if (!rec) return null;
  const dir = store.instanceDir(id, rec.instance);
  const manifest = readManifest(dir) ?? new Manifest();
  return { dir, manifest, record: rec };
}

/**
 * Refresh the on-PATH shim for `<product>` and (best-effort) the desktop
 * shortcut pointing at the active instance's binary. A shim or shortcut
 * failure is a note, never an install failure — by the time this runs the
 * new instance is already active.
 *
 * @param {VersionStore} store
 * @param {string} instanceDir
 * @param {(msg: string) => void} note
 * @returns {void}
 */
function refreshExternal(store, instanceDir, note) {
  // Shim: reads the live `current` pointer, execs the active binary.
  try {
    writeShim(store);
  } catch (e) {
    note(`shim refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  // Shortcut: only the products that have a single GUI binary need one.
  // The launcher product places three exes via the builder but has no
  // single "label" — its bin/self.mjs calls installShortcut directly per exe.
  // For Electron apps the label is the capitalised product name.
  if (store.product === 'launcher') return;
  const label = productLabel(store.product);
  const targetExe = join(instanceDir, binaryName(store.product));
  if (!existsSync(targetExe)) return;
  const err = installShortcut(label, targetExe, store.shimDir);
  if (err !== null) note(`${label} desktop shortcut skipped (${err})`);
}

/**
 * The human-facing label for a product's desktop shortcut.
 *
 * @param {string} product
 * @returns {string}
 */
function productLabel(product) {
  // VibeTerm / VibeFrame — capitalise the "vibe" prefix.
  const lower = product.toLowerCase();
  if (lower.startsWith('vibe')) {
    return 'Vibe' + product.slice(4);
  }
  return product.charAt(0).toUpperCase() + product.slice(1);
}

export { productLabel, ORIGIN, homedir };
