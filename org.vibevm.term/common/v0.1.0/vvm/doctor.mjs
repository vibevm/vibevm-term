/**
 * term-common vvm — `<product> self doctor`: the environment health check
 * (PROP-019 §2.8). Port of `vibe-cli/src/commands/vvm/doctor.rs`, trimmed to
 * what a product's version-manager cares about.
 *
 * Probes:
 *  - the required toolchain (Node for Electron apps, cargo for the launcher,
 *    plus the host's Rust toolchain via rustc when applicable);
 *  - the shim dir on PATH (the product's shim is reachable);
 *  - the active instance's binary (the instance the `current` file points at
 *    still carries its binary).
 *
 * No embedded-registry row (that's a host concept), no packaged-app
 * advisory (the products package themselves).
 */

import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { writeShim, makePersister, detectShell } from './env.mjs';

/**
 * @typedef {Object} ToolSpec
 * @property {string} name
 * @property {string} minVersion
 * @property {string} helpUrl
 * @property {string} [binary]  the binary to probe (defaults to `name`)
 */

/**
 * @param {ToolSpec} spec
 * @returns {{ name: string, version: string | null, ok: boolean, min: string, help: string }}
 */
function checkOne(spec) {
  const bin = spec.binary ?? spec.name;
  const out = spawnSync(bin, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (out.status !== 0 && out.error) {
    return { name: spec.name, version: null, ok: false, min: spec.minVersion, help: spec.helpUrl };
  }
  const raw = (out.stdout ?? '') + (out.stderr ?? '');
  const m = raw.match(/(\d+\.\d+(?:\.\d+)?)/);
  const version = m ? m[1] : null;
  const ok = version ? gte(version, spec.minVersion) : false;
  return { name: spec.name, version, ok, min: spec.minVersion, help: spec.helpUrl };
}

/**
 * Truncated semver `>=` compare on the `MAJOR.MINOR[.PATCH]` shape the
 * version regex above captures. Patches default to 0.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function gte(a, b) {
  const pa = a.split('.').map((x) => Number(x) || 0);
  const pb = b.split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

/**
 * The required toolchain per product type.
 *
 * @param {'electron' | 'launcher'} productType
 * @returns {ToolSpec[]}
 */
function requiredTools(productType) {
  if (productType === 'launcher') {
    return [
      {
        name: 'cargo',
        binary: 'cargo',
        minVersion: '1.93',
        helpUrl: 'https://rustup.rs/',
      },
    ];
  }
  return [
    {
      name: 'node',
      minVersion: '22.6',
      helpUrl: 'https://nodejs.org/',
    },
    {
      name: 'npm',
      minVersion: '11.0',
      helpUrl:
        'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm',
    },
  ];
}

/**
 * @typedef {Object} DoctorReport
 * @property {boolean} ok
 * @property {number} problems
 * @property {Array<{ name: string, version: string | null, ok: boolean, min: string, help: string }>} tools
 * @property {string} shimDir
 * @property {boolean} shimDirOnPath
 * @property {import('./model.mjs').InstallRecord | null} active
 * @property {boolean} activeBinaryOk
 */

/**
 * Run the doctor probe and return the report.
 *
 * @param {object} args
 * @param {import('./store.mjs').VersionStore} args.store
 * @param {'electron' | 'launcher'} args.productType
 * @param {string | null | undefined} args.pathVar  the `$PATH` value
 * @returns {DoctorReport}
 */
export function runDoctor({ store, productType, pathVar }) {
  const tools = requiredTools(productType).map(checkOne);
  const shimDir = store.shimDir;
  const onPath = pathHasDir(pathVar ?? null, shimDir);
  const active = store.active();
  const activeMissing = active
    ? !existsSync(store.binaryPath(active.versionId(), active.instance))
    : false;
  const problems =
    tools.filter((t) => !t.ok).length +
    (onPath ? 0 : 1) +
    (activeMissing ? 1 : 0);
  return {
    ok: problems === 0,
    problems,
    tools,
    shimDir,
    shimDirOnPath: onPath,
    active: active ?? null,
    activeBinaryOk: !activeMissing,
  };
}

/**
 * Apply `--fix`: write the shim and ensure the shim dir is on PATH.
 *
 * @param {object} args
 * @param {import('./store.mjs').VersionStore} args.store
 * @param {string | null | undefined} args.shellEnv  `$SHELL`
 * @param {string | null | undefined} args.home  the user's home dir (POSIX)
 * @returns {{ shimWritten: boolean, pathEnsured: 'changed' | 'unchanged' }}
 */
export function runDoctorFix({ store, shellEnv, home }) {
  writeShim(store);
  const shell = detectShell(shellEnv);
  const persister = makePersister({
    product: store.product,
    shell,
    home: home ?? null,
  });
  const result = persister.ensureOnPath(store.shimDir);
  return { shimWritten: true, pathEnsured: result };
}

/**
 * Whether `dir` is on the `PATH` value, comparing canonicalised paths when
 * possible.
 *
 * @param {string | null} pathVar
 * @param {string} dir
 * @returns {boolean}
 */
function pathHasDir(pathVar, dir) {
  if (!pathVar) return false;
  const sep = process.platform === 'win32' ? ';' : ':';
  const entries = pathVar.split(sep);
  return entries.some((p) => {
    if (p === dir) return true;
    try {
      return (
        existsSync(p) &&
        existsSync(dir) &&
        realpathSync(p) === realpathSync(dir)
      );
    } catch {
      return false;
    }
  });
}
