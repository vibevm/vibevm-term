/**
 * term-common vvm — activation plumbing (PROP-019 §2.5, §2.6): shell
 * detection, the stable per-product shims, durable environment persistence,
 * and the install-root resolution.
 * Port of `vibe-cli/src/commands/vvm/env.rs`.
 *
 * Differs from the host:
 *  - The shim is `<product>`-named (one per product), reads the product's own
 *    `current` pointer under `<installRoot>/<product>/current`.
 *  - The persisted env var is `<PRODUCT>_HOME` (uppercased), not the host's
 *    `VIBEVM_HOME` — each product advertises its own active instance.
 *  - The rc-file block markers carry the product name, so a multi-product
 *    machine has one block per product (not one shared block).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { binaryName, VersionStore } from './store.mjs';

/**
 * The env var naming the install base (defaults to `~/opt`); the root is
 * `$VIBEVM_INSTALL_ROOT` shared across products. Read at the composition root
 * and overridable in tests to isolate installs under a temp dir.
 */
export const INSTALL_ROOT_ENV = 'VIBEVM_INSTALL_ROOT';

/**
 * Resolve the install root. `$VIBEVM_INSTALL_ROOT` wins; else `~/opt`.
 * Matches the host so `<vibe product> self install` and `vibe self install`
 * share one root and one `bin/` shim dir.
 *
 * @param {object} [opts]
 * @param {string | null} [opts.env]  the env value (defaults to process.env)
 * @param {string} [opts.home]  the home dir (defaults to os.homedir())
 * @returns {string}
 */
export function resolveInstallRoot({ env, home } = {}) {
  const v = env ?? process.env[INSTALL_ROOT_ENV] ?? null;
  if (v && v.trim() !== '') return v;
  return join(home ?? homedir(), 'opt');
}

// ---------------------------------------------------------------------------
// shells
// ---------------------------------------------------------------------------

/**
 * @typedef {'bash' | 'zsh' | 'fish' | 'pwsh' | 'posix'} Shell
 */

/**
 * Detect from a `$SHELL` value, falling back per-OS (PROP-019 §2.6).
 *
 * @param {string | null | undefined} shellEnv
 * @returns {Shell}
 */
export function detectShell(shellEnv) {
  if (shellEnv) {
    const s = shellEnv.toLowerCase();
    if (s.includes('fish')) return 'fish';
    if (s.includes('zsh')) return 'zsh';
    if (s.includes('bash')) return 'bash';
  }
  return process.platform === 'win32' ? 'pwsh' : 'posix';
}

/**
 * Parse an explicit `--shell` value.
 *
 * @param {string} name
 * @returns {Shell}
 */
export function parseShell(name) {
  const s = name.toLowerCase();
  if (s === 'bash' || s === 'zsh' || s === 'fish' || s === 'pwsh' || s === 'posix' || s === 'powershell') {
    return s === 'powershell' ? 'pwsh' : /** @type {Shell} */ (s);
  }
  throw new Error(`unknown shell \`${name}\` (want bash|zsh|fish|powershell|posix)`);
}

/**
 * The uppercased env-var name carrying the active instance dir.
 *
 * @param {string} product
 * @returns {string}
 */
export function homeEnvName(product) {
  return `${product.toUpperCase()}_HOME`;
}

/**
 * The `eval`-able line that sets `<PRODUCT>_HOME` for this shell.
 *
 * @param {Shell} shell
 * @param {string} product
 * @param {string} home
 * @returns {string}
 */
export function exportLine(shell, product, home) {
  const name = homeEnvName(product);
  switch (shell) {
    case 'fish':
      return `set -gx ${name} "${home}"`;
    case 'pwsh':
      return `$env:${name} = "${home}"`;
    default:
      return `export ${name}="${home}"`;
  }
}

/**
 * The rc file this shell sources at startup, under `home`.
 *
 * @param {Shell} shell
 * @param {string} home
 * @returns {string}
 */
export function rcPath(shell, home) {
  switch (shell) {
    case 'fish':
      return join(home, '.config', 'fish', 'config.fish');
    case 'zsh':
      return join(home, '.zshrc');
    case 'bash':
      return join(home, '.bashrc');
    default:
      // PowerShell has no $HOME rc we edit here (Windows uses the registry
      // persister); fall back to .profile for POSIX.
      return join(home, '.profile');
  }
}

// ---------------------------------------------------------------------------
// shims
// ---------------------------------------------------------------------------

/**
 * The POSIX shim body for a product: reads the live `current` pointer and
 * execs the active binary; falls back to the advisory `$<PRODUCT>_HOME`.
 *
 * @param {string} product
 * @returns {string}
 */
function posixShim(product) {
  const name = homeEnvName(product);
  const bin = binaryName(product);
  return (
    '#!/bin/sh\n' +
    `# ${product} (VVM) shim — execs the active instance from ../${product}/current.\n` +
    'self="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\n' +
    `home="$(cat "$self/../${product}/current" 2>/dev/null)"\n` +
    `[ -z "$home" ] && home="$${name}"\n` +
    'if [ -z "$home" ]; then\n' +
    `  echo '${product}: no active version — run: ${product} self use <selector>' >&2\n` +
    '  exit 1\n' +
    'fi\n' +
    `exec "$home/${bin}" "$@"\n`
  );
}

/**
 * The Windows `.cmd` shim body for a product.
 *
 * @param {string} product
 * @returns {string}
 */
function cmdShim(product) {
  const name = homeEnvName(product);
  const bin = binaryName(product);
  return (
    '@echo off\r\n' +
    `set "VVM_CUR=%~dp0..\\${product}\\current"\r\n` +
    'set "VVM_HOME="\r\n' +
    'if exist "%VVM_CUR%" set /p VVM_HOME=<"%VVM_CUR%"\r\n' +
    `if "%VVM_HOME%"=="" set "VVM_HOME=%${name}%"\r\n` +
    'if "%VVM_HOME%"=="" (\r\n' +
    `  echo ${product}: no active version - run: ${product} self use ^<selector^> 1>&2\r\n` +
    '  exit /b 1\r\n' +
    ')\r\n' +
    `"%VVM_HOME%\\${bin}" %*\r\n`
  );
}

/**
 * Write the stable shim for `store.product` into `store.shimDir` (PROP-019
 * §2.5). It reads `$<PRODUCT>_HOME` and execs the active binary. Idempotent.
 *
 * @param {VersionStore} store
 * @returns {void}
 */
export function writeShim(store) {
  const binDir = store.shimDir;
  mkdirSync(binDir, { recursive: true });
  const posix = join(binDir, store.product);
  writeFileSync(posix, posixShim(store.product));
  if (process.platform !== 'win32') {
    try {
      chmodSync(posix, 0o755);
    } catch {
      // best-effort
    }
  }
  if (process.platform === 'win32') {
    const cmd = join(binDir, `${store.product}.cmd`);
    writeFileSync(cmd, cmdShim(store.product));
  }
}

// ---------------------------------------------------------------------------
// durable env persistence
// ---------------------------------------------------------------------------

/** @typedef {'changed' | 'unchanged'} Persisted */

/**
 * Persist durable user-environment settings (PROP-019 §2.6). One persister
 * per platform; tests exercise the POSIX rc-file impl in a temp dir, never
 * mutating the real machine.
 *
 * @typedef {Object} EnvPersister
 * @property {(home: string) => Persisted} setHome
 * @property {(dir: string) => Persisted} ensureOnPath
 * @property {() => string} activationHint
 */

/**
 * @param {string} product
 * @returns {{ begin: string, end: string }}
 */
function blockMarkers(product) {
  return {
    begin: `# >>> ${product} (VVM) — managed, do not edit by hand >>>`,
    end: `# <<< ${product} (VVM) <<<`,
  };
}

/**
 * A POSIX rc-file persister: maintains one marked block per product in the rc
 * file (PROP-019 §2.6). Idempotent and testable in a temp dir.
 */
export class RcFilePersister {
  /**
   * @param {object} opts
   * @param {string} opts.rcPath
   * @param {Shell} opts.shell
   * @param {string} opts.product
   */
  constructor({ rcPath, shell, product }) {
    this.rcPath = rcPath;
    this.shell = shell;
    this.product = product;
  }

  /**
   * Upsert a managed line identified by `prefix`; returns whether the file
   * changed.
   *
   * @private
   * @param {string} prefix
   * @param {string} line
   * @returns {Persisted}
   */
  _upsert(prefix, line) {
    const text = existsSync(this.rcPath) ? readFileSync(this.rcPath, 'utf8') : '';
    const { pre, block, post } = splitBlock(text, this.product);
    if (!setOrAdd(block, prefix, line)) return 'unchanged';
    const parent = dirname(this.rcPath);
    mkdirSync(parent, { recursive: true });
    writeFileSync(this.rcPath, rebuild(pre, block, post, this.product));
    return 'changed';
  }

  /** @param {string} home @returns {Persisted} */
  setHome(home) {
    const name = homeEnvName(this.product);
    let prefix;
    let line;
    if (this.shell === 'fish') {
      prefix = `set -gx ${name}`;
      line = `set -gx ${name} "${home}"`;
    } else {
      prefix = `export ${name}=`;
      line = `export ${name}="${home}"`;
    }
    return this._upsert(prefix, line);
  }

  /** @param {string} dir @returns {Persisted} */
  ensureOnPath(dir) {
    let prefix;
    let line;
    if (this.shell === 'fish') {
      prefix = 'fish_add_path';
      line = `fish_add_path "${dir}"`;
    } else {
      prefix = 'export PATH=';
      line = `export PATH="${dir}:$PATH"`;
    }
    return this._upsert(prefix, line);
  }

  /** @returns {string} */
  activationHint() {
    return `source \`${this.rcPath}\` (or open a new shell) to apply now`;
  }
}

/**
 * A Windows persister: edits the user environment in the registry via
 * PowerShell's `[Environment]` API, which broadcasts the change to new
 * processes (PROP-019 §2.6). Not exercised by gate tests (it mutates the
 * real user env); only a live `self use` takes this path.
 */
export class WindowsEnvPersister {
  /**
   * @param {string} product
   */
  constructor(product) {
    this.product = product;
  }

  /** @param {string} home @returns {Persisted} */
  setHome(home) {
    psSetUserVar(homeEnvName(this.product), home);
    return 'changed';
  }

  /** @param {string} dir @returns {Persisted} */
  ensureOnPath(dir) {
    const current = psGetUserVar('Path') ?? '';
    const next = pathWithPrefix(current, dir);
    if (next === null) return 'unchanged';
    psSetUserVar('Path', next);
    return 'changed';
  }

  /** @returns {string} */
  activationHint() {
    return 'open a new terminal (the registry change reaches new processes)';
  }
}

/**
 * Build the right persister for this OS.
 *
 * @param {object} opts
 * @param {string} opts.product
 * @param {Shell} opts.shell
 * @param {string | null} [opts.home]  the user's real home dir (POSIX only)
 * @returns {EnvPersister}
 */
export function makePersister({ product, shell, home }) {
  if (process.platform === 'win32') {
    return new WindowsEnvPersister(product);
  }
  if (home === null || home === undefined) {
    throw new Error(`cannot edit the ${shell} rc without a home dir (set --home)`);
  }
  return new RcFilePersister({ rcPath: rcPath(shell, home), shell, product });
}

/**
 * @param {string} script
 * @returns {string}
 */
function runPowerShell(script) {
  const out = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8' },
  );
  if (out.status !== 0) {
    throw new Error(`powershell env edit failed: ${(out.stderr ?? '').trim()}`);
  }
  return (out.stdout ?? '').trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function psQuote(value) {
  return value.replace(/'/g, "''");
}

/**
 * @param {string} name
 * @param {string} value
 * @returns {void}
 */
function psSetUserVar(name, value) {
  runPowerShell(
    `[Environment]::SetEnvironmentVariable('${psQuote(name)}', '${psQuote(value)}', 'User')`,
  );
}

/**
 * @param {string} name
 * @returns {string | null}
 */
function psGetUserVar(name) {
  const out = runPowerShell(
    `[Environment]::GetEnvironmentVariable('${psQuote(name)}', 'User')`,
  );
  return out === '' ? null : out;
}

/**
 * Put `target` at the FRONT of a `;`-separated PATH, deduping any existing
 * occurrence; `null` when it is already first (case-insensitive on Windows).
 *
 * @param {string} current
 * @param {string} target
 * @returns {string | null}
 */
export function pathWithPrefix(current, target) {
  const parts = current.split(';').filter((p) => p !== '');
  const first = parts[0];
  if (first !== undefined && first.toLowerCase() === target.toLowerCase()) {
    return null;
  }
  const rest = parts.filter((p) => p.toLowerCase() !== target.toLowerCase());
  return rest.length === 0 ? target : `${target};${rest.join(';')}`;
}

// --- rc block helpers ------------------------------------------------------

/**
 * Split a file into (text before the managed block, the block's inner lines,
 * text after the block). No block → (whole text, [], "").
 *
 * @param {string} text
 * @param {string} product
 * @returns {{ pre: string, block: string[], post: string }}
 */
function splitBlock(text, product) {
  const { begin, end } = blockMarkers(product);
  const b = text.indexOf(begin);
  const e = text.indexOf(end);
  if (b !== -1 && e !== -1 && b < e) {
    const pre = text.slice(0, b);
    const inner = text.slice(b + begin.length, e);
    const block = inner
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '');
    const post = text.slice(e + end.length);
    return { pre, block, post };
  }
  return { pre: text, block: [], post: '' };
}

/**
 * Replace the block line beginning with `prefix`, or append `line`. Returns
 * whether anything changed.
 *
 * @param {string[]} block
 * @param {string} prefix
 * @param {string} line
 * @returns {boolean}
 */
function setOrAdd(block, prefix, line) {
  const i = block.findIndex((l) => l.startsWith(prefix));
  if (i !== -1) {
    if (block[i] === line) return false;
    block[i] = line;
    return true;
  }
  block.push(line);
  return true;
}

/**
 * @param {string} pre
 * @param {string[]} block
 * @param {string} post
 * @param {string} product
 * @returns {string}
 */
function rebuild(pre, block, post, product) {
  const { begin, end } = blockMarkers(product);
  if (block.length === 0) return `${pre}${post}`;
  const trimmedPre = pre.replace(/\n+$/, '');
  const trimmedPost = post.replace(/^\n+/, '');
  let out = '';
  if (trimmedPre !== '') {
    out += trimmedPre + '\n';
  }
  out += begin + '\n';
  out += block.join('\n') + '\n';
  out += end + '\n';
  if (trimmedPost !== '') {
    out += trimmedPost;
    if (!trimmedPost.endsWith('\n')) out += '\n';
  }
  return out;
}
