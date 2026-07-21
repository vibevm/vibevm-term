/**
 * term-common vvm — the CLI dispatcher.
 *
 * A clap-analog for `<product> self <verb>` — parse argv, dispatch to the
 * verb handler. The full verb set mirrors the host's `vibe self` (PROP-019
 * §2.11):
 *
 *   install | update | use | ls | current | which | doctor | remove | gc
 *   | env | relocate
 *
 * A product's `bin/self.mjs` is a thin wrapper that calls `vvmMain` with its
 * name + builder; this module owns the verb parsing and the per-verb
 * orchestration (store / placer / install / relocate / env / doctor).
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

import {
  InstallRecord,
  KIND,
  ModelError,
  ORIGIN,
  PROFILE,
  selectorParse,
  State,
  VersionId,
} from './model.mjs';
import { VersionStore, binaryName } from './store.mjs';
import {
  detectShell,
  exportLine,
  homeEnvName,
  makePersister,
  parseShell,
  rcPath,
  resolveInstallRoot,
  writeShim,
} from './env.mjs';
import { performInstall } from './install.mjs';
import {
  findSourceRoot,
  labelInTree,
  linkedSource,
  externalPath,
} from './source.mjs';
import { shortCommit, ElectronAppBuilder, LauncherBuilder } from './builder.mjs';
import { applyRelocate, planRelocate } from './relocate.mjs';
import { runDoctor, runDoctorFix } from './doctor.mjs';
import { installShortcut, placeExe, uninstallShortcut } from './shortcuts.mjs';

/**
 * @typedef {Object} ProductConfig
 * @property {string} product  the product name (`vibeterm` / `vibeframe` / `launcher`)
 * @property {'electron' | 'launcher'} productType
 * @property {import('./builder.mjs').Builder} builder
 * @property {string} [sourceRoot]  the product package root (defaults to CWD walk-up)
 */

/**
 * @typedef {Object} CliEvents
 * @property {(msg: string) => void} [step]
 * @property {(msg: string) => void} [summary]
 * @property {(msg: string) => void} [note]
 * @property {(path: string) => void} [created]
 * @property {(path: string) => void} [removed]
 * @property {(obj: unknown) => void} [json]
 * @property {() => boolean} [isJson]
 * @property {() => boolean} [isQuiet]
 * @property {() => boolean} [isUnattended]
 * @property {(prompt: string) => Promise<boolean>} [confirm]
 * @property {(msg: string) => void} [requireTty]
 */

/**
 * The default events: human-readable, line-per-step. A product CLI can pass
 * its own (e.g. for JSON output, or to integrate with its own logger).
 *
 * @param {boolean} [quiet]
 * @returns {Required<CliEvents>}
 */
export function consoleEvents(quiet = false) {
  const step = (msg) => {
    if (!quiet) process.stderr.write(`${msg}\n`);
  };
  return {
    step,
    summary: (msg) => process.stdout.write(`${msg}\n`),
    note: (msg) => process.stderr.write(`${msg}\n`),
    created: (path) => step(`created ${path}`),
    removed: (path) => step(`removed ${path}`),
    json: (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`),
    isJson: () => false,
    isQuiet: () => quiet,
    isUnattended: () => !process.stdin.isTTY,
    confirm: async (prompt) => {
      process.stderr.write(`${prompt} [y/N] `);
      const answer = await new Promise((resolve) => {
        const onData = (chunk) => {
          process.stdin.removeListener('data', onData);
          process.stdin.removeListener('end', onData);
          process.stdin.pause();
          resolve(chunk.toString());
        };
        process.stdin.resume();
        process.stdin.once('data', onData);
        process.stdin.once('end', onData);
      });
      return answer.trim().toLowerCase().startsWith('y');
    },
    requireTty: (msg) => {
      if (!process.stdin.isTTY) {
        throw new Error(msg);
      }
    },
  };
}

/**
 * Parse argv into a parsed command, or print usage + exit(2) on error.
 *
 * @param {string[]} argv
 * @returns {ParsedCommand}
 */
export function parseArgv(argv) {
  // The product's bin/self.mjs consumed argv[1] (the script path) — argv here
  // is the post-self slice: e.g. ['install', 'latest', '--release'].
  const verb = argv[0] ?? 'help';
  const rest = argv.slice(1);
  const flags = parseFlags(rest);
  switch (verb) {
    case 'install':
      return { verb: 'install', selector: flags.positional[0] ?? 'latest', ...flags.opts };
    case 'update':
      return { verb: 'install', selector: 'latest', fromUpdate: true, ...flags.opts };
    case 'use':
      return { verb: 'use', selector: flags.positional[0] ?? '', ...flags.opts };
    case 'ls':
    case 'list':
      return { verb: 'ls', ...flags.opts };
    case 'current':
      return { verb: 'current', ...flags.opts };
    case 'which':
      return { verb: 'which', ...flags.opts };
    case 'doctor':
      return { verb: 'doctor', ...flags.opts };
    case 'remove':
    case 'uninstall':
      return { verb: 'remove', selectors: flags.positional, ...flags.opts };
    case 'gc':
      return { verb: 'gc', ...flags.opts };
    case 'env':
      return { verb: 'env', selector: flags.positional[0] ?? null, ...flags.opts };
    case 'relocate':
      return { verb: 'relocate', target: flags.positional[0] ?? '', ...flags.opts };
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      return { verb: 'help' };
    default:
      throw new UsageError(`unknown verb \`${verb}\``);
  }
}

/**
 * Split argv into positional + flag options. Flags:
 *   --release / --debug          build profile
 *   --profile <p>                explicit profile
 *   --kind tag|branch|commit     force the selector kind
 *   --force                      ignore dedup-skip
 *   --mirror <url>               (unused in v1 — managed clones TBD)
 *   --shell <name>               env: explicit shell
 *   --eval                       use: print the export line only
 *   --fix                        doctor: write shims + ensure PATH
 *   --yes / -y                   skip confirm prompts
 *   --dry-run                    relocate: print the plan only
 *   --from <path>                relocate: explicit old source path
 *   --json                       JSON output (events.json + isJson)
 *   --quiet / -q                 suppress step lines
 *   --home <dir>                 override the user home (POSIX rc)
 *
 * @param {string[]} args
 * @returns {{ positional: string[], opts: Record<string, unknown> }}
 */
function parseFlags(args) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, unknown>} */
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--release') opts.release = true;
    else if (a === '--debug') opts.release = false;
    else if (a === '--force') opts.force = true;
    else if (a === '--eval') opts.eval = true;
    else if (a === '--fix') opts.fix = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--profile') opts.profile = args[++i];
    else if (a === '--kind') opts.kind = args[++i];
    else if (a === '--mirror') opts.mirror = args[++i];
    else if (a === '--shell') opts.shell = args[++i];
    else if (a === '--from') opts.from = args[++i];
    else if (a === '--home') opts.home = args[++i];
    else if (a.startsWith('--')) throw new UsageError(`unknown flag \`${a}\``);
    else positional.push(a);
  }
  return { positional, opts };
}

/**
 * @typedef {Object} ParsedCommand
 */

/**
 * The main entry. A product's `bin/self.mjs` calls this.
 *
 * @param {ProductConfig} config
 * @param {string[]} argv  the post-self argv slice
 * @param {{ events?: CliEvents, env?: NodeJS.ProcessEnv, cwd?: string }} [runtime]
 * @returns {Promise<number>}  process exit code (0 ok, 1 error, 2 usage)
 */
export async function vvmMain(config, argv, runtime = {}) {
  const isQuiet =
    argv.includes('-q') || argv.includes('--quiet');
  const events = /** @type {Required<CliEvents>} */ ({
    ...consoleEvents(isQuiet),
    ...(runtime.events ?? {}),
  });
  let cmd;
  try {
    cmd = parseArgv(argv);
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    printUsage(config.product);
    return 2;
  }
  if (cmd.verb === 'help') {
    printUsage(config.product);
    return 0;
  }

  const env = runtime.env ?? process.env;
  const cwd = runtime.cwd ?? process.cwd();
  const installRoot = resolveInstallRoot({
    env: env.VIBEVM_INSTALL_ROOT ?? null,
    home: String(cmd.home ?? homedir()),
  });
  const store = new VersionStore({ installRoot, product: config.product });

  // Re-evaluate json/quiet now that the command is parsed.
  if (cmd.json) {
    events.isJson = () => true;
  }

  try {
    switch (cmd.verb) {
      case 'install':
        return await doInstall({ config, store, cmd, env, cwd, events });
      case 'use':
        return doUse({ store, cmd, env, events });
      case 'ls':
        return doLs({ store, events });
      case 'current':
        return doCurrent({ store, events });
      case 'which':
        return doWhich({ store, events });
      case 'doctor':
        return await doDoctor({ config, store, cmd, env, events });
      case 'remove':
        return await doRemove({ config, store, cmd, env, events });
      case 'gc':
        return await doGc({ config, store, cmd, env, events });
      case 'env':
        return doEnv({ store, cmd, env, events });
      case 'relocate':
        return await doRelocate({ config, store, cmd, env, cwd, events });
      default:
        printUsage(config.product);
        return 2;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (events.isJson()) {
      events.json({ ok: false, error: msg });
    } else {
      process.stderr.write(`${msg}\n`);
    }
    return 1;
  }
}

/**
 * @param {object} args
 * @param {ProductConfig} args.config
 * @param {VersionStore} args.store
 * @param {ParsedCommand & { selector: string, release?: boolean, profile?: string, force?: boolean, kind?: string }} args.cmd
 * @param {NodeJS.ProcessEnv} args.env
 * @param {string} args.cwd
 * @param {CliEvents} args.events
 * @returns {Promise<number>}
 */
async function doInstall({ config, store, cmd, env, cwd, events }) {
  const profile = resolveProfile(cmd);
  const forced = forcedKind(/** @type {string | undefined} */ (cmd.kind));
  const selector = selectorParse(cmd.selector, forced);
  const now = new Date().toISOString();

  // Resolve the source tree: in-tree first (the committer's checkout),
  // else a linked-source rebuild, else (TODO) a managed clone.
  const inTree = findSourceRoot(cwd);
  const preferInTree = selector.tag === 'latest' && cmd.mirror === undefined;
  let sourceDir;
  let resolved;
  let origin;
  let sourcePath;
  if (inTree && preferInTree) {
    resolved = labelInTree(inTree);
    sourceDir = inTree;
    origin = ORIGIN.EXTERNAL;
    sourcePath = externalPath(inTree);
  } else if (cmd.mirror === undefined) {
    const linked = linkedSource({ store, selector });
    if (linked !== null) {
      events.step?.(`rebuilding from linked source ${linked}`);
      resolved = labelInTree(linked);
      sourceDir = linked;
      origin = ORIGIN.EXTERNAL;
      sourcePath = externalPath(linked);
    } else if (inTree !== null) {
      // Fall back to the in-tree build for any selector (the common case
      // for a product run from its own checkout).
      resolved = labelInTree(inTree);
      sourceDir = inTree;
      origin = ORIGIN.EXTERNAL;
      sourcePath = externalPath(inTree);
    } else {
      throw new Error(
        `no source for \`${cmd.selector}\` — run \`${config.product} self install\` ` +
          `from the product checkout, or pass --mirror <url> (managed clones: TBD)`,
      );
    }
  } else {
    throw new Error('managed-clone installs are not yet supported for products');
  }

  const result = performInstall({
    store,
    sourceRoot: sourceDir,
    req: {
      resolved,
      profile,
      force: !!cmd.force,
      now,
      origin,
      sourcePath,
    },
    builder: config.builder,
    events: {
      step: events.step,
      summary: events.summary,
      note: events.note,
      created: events.created,
    },
  });

  // For the launcher product, refresh shortcuts for each exe the builder
  // produced (three labels: VibeTree, VibeTerm, VibeFrame). The Electron
  // products get their single shortcut inside performInstall.
  if (config.productType === 'launcher') {
    refreshLauncherShortcuts(store, resolved.id, result.instance, events);
  }

  if (events.isJson?.()) {
    events.json?.({
      ok: true,
      command: 'self:install',
      product: config.product,
      active: resolved.id.toString(),
      instance: result.instance,
      dedup_skipped: result.dedupSkipped,
    });
  }
  return 0;
}

/**
 * The launcher ships three exes (vibetree / vibeterm / vibeframe); place each
 * in the shim dir and create its shortcut.
 *
 * @param {VersionStore} store
 * @param {VersionId} id
 * @param {number} instance
 * @param {CliEvents} events
 * @returns {void}
 */
function refreshLauncherShortcuts(store, id, instance, events) {
  const instDir = store.instanceDir(id, instance);
  const shimDir = store.shimDir;
  const labels = { vibetree: 'VibeTree', vibeterm: 'VibeTerm', vibeframe: 'VibeFrame' };
  let placed = 0;
  for (const [bin, label] of Object.entries(labels)) {
    const src = join(instDir, binaryName(bin));
    if (!existsSync(src)) continue;
    try {
      placeExe(src, join(shimDir, binaryName(bin)));
      placed += 1;
      const err = installShortcut(label, src, shimDir);
      if (err !== null) events.note?.(`${label} shortcut skipped (${err})`);
    } catch (e) {
      events.note?.(`${label} not refreshed (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  if (placed > 0) {
    events.summary?.(`refreshed ${placed} GUI launcher(s) in ${shimDir}`);
  }
}

/**
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {ParsedCommand & { selector: string, eval?: boolean, kind?: string, shell?: string }} args.cmd
 * @param {NodeJS.ProcessEnv} args.env
 * @param {CliEvents} args.events
 * @returns {number}
 */
function doUse({ store, cmd, env, events }) {
  const state = store.loadState();
  const selector = selectorParse(cmd.selector, forcedKind(cmd.kind));
  const rec = resolveInstalled(state, selector, cmd.selector);
  const id = rec.versionId();
  const home = store.instanceDir(id, rec.instance);
  const shell = cmd.shell ? parseShell(cmd.shell) : detectShell(env.SHELL ?? null);

  if (cmd.eval) {
    process.stdout.write(`${exportLine(shell, store.product, home)}\n`);
    return 0;
  }
  store.writeCurrent(home);
  writeShim(store);
  const persister = makePersister({
    product: store.product,
    shell,
    home: cmd.home ?? homedir(),
  });
  persister.setHome(home);
  persister.ensureOnPath(store.shimDir);

  if (events.isJson?.()) {
    events.json?.({
      ok: true,
      command: 'self:use',
      product: store.product,
      active: id.toString(),
      instance: rec.instance,
      home,
    });
    return 0;
  }
  events.summary?.(`active → ${id} #${rec.instance}`);
  events.summary?.('  switched live; the next invocation in this shell uses it');
  events.summary?.(`  external tools: ${persister.activationHint()}`);
  return 0;
}

/**
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {CliEvents} args.events
 * @returns {number}
 */
function doLs({ store, events }) {
  const state = store.loadState();
  state.installs.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : a.instance - b.instance,
  );
  const active = store.active();
  if (events.isJson?.()) {
    events.json?.({
      ok: true,
      command: 'self:ls',
      product: store.product,
      active: active ? active.versionId().toString() : null,
      count: state.installs.length,
      installs: state.installs.map((r) => ({
        id: r.versionId().toString(),
        instance: r.instance,
        commit: r.commit,
        toolchain: r.toolchain,
        profile: r.profile,
        origin: r.origin,
        source_path: r.sourcePath,
        installed_at: r.installedAt,
        active: active && sameRecord(active, r),
      })),
    });
    return 0;
  }
  if (state.installs.length === 0) {
    events.summary?.(`(no versions installed — run \`${store.product} self install\`)`);
    return 0;
  }
  for (const r of state.installs) {
    const marker = active && sameRecord(active, r) ? '*' : ' ';
    events.step?.(
      `${marker} ${r.versionId()} #${r.instance}  ${shortCommit(r.commit)}  ${r.profile}  ${r.origin}`,
    );
  }
  events.summary?.(`${state.installs.length} instance(s) installed.`);
  return 0;
}

/**
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {CliEvents} args.events
 * @returns {number}
 */
function doCurrent({ store, events }) {
  const active = store.active();
  if (events.isJson?.()) {
    events.json?.({
      ok: true,
      command: 'self:current',
      product: store.product,
      active: active ? active.versionId().toString() : null,
      instance: active ? active.instance : null,
    });
    return 0;
  }
  events.summary?.(active ? `${active.versionId()} #${active.instance}` : '(no active version)');
  return 0;
}

/**
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {CliEvents} args.events
 * @returns {number}
 */
function doWhich({ store, events }) {
  const rec = store.active();
  if (!rec) {
    throw new Error(`no active ${store.product} version (run \`${store.product} self use <selector>\`)`);
  }
  const path = store.binaryPath(rec.versionId(), rec.instance);
  if (events.isJson?.()) {
    events.json?.({ ok: true, command: 'self:which', product: store.product, path });
    return 0;
  }
  events.summary?.(path);
  return 0;
}

/**
 * @param {object} args
 * @param {ProductConfig} args.config
 * @param {VersionStore} args.store
 * @param {ParsedCommand & { fix?: boolean, yes?: boolean }} args.cmd
 * @param {NodeJS.ProcessEnv} args.env
 * @param {CliEvents} args.events
 * @returns {Promise<number>}
 */
async function doDoctor({ config, store, cmd, env, events }) {
  const report = runDoctor({
    store,
    productType: config.productType,
    pathVar: env.PATH ?? null,
  });
  if (events.isJson?.()) {
    events.json?.({ ...report, command: 'self:doctor', product: config.product });
    return report.ok ? 0 : 1;
  }
  for (const t of report.tools) {
    if (t.ok) {
      events.step?.(`ok   ${t.name} ${t.version ?? ''}`);
    } else if (t.version) {
      events.step?.(`MISS ${t.name} ${t.version} (need >= ${t.min}) — ${t.help}`);
    } else {
      events.step?.(`MISS ${t.name} not found — ${t.help}`);
    }
  }
  events.step?.(
    `${report.shimDirOnPath ? 'ok  ' : 'MISS'} shim dir ${report.shimDir} ` +
      `${report.shimDirOnPath ? '(on PATH)' : '(NOT on PATH)'}`,
  );
  if (report.active) {
    events.step?.(
      report.activeBinaryOk
        ? `ok   active ${report.active.versionId()} #${report.active.instance}`
        : `MISS active ${report.active.versionId()} — its binary is gone`,
    );
  } else {
    events.step?.(`-    no active version (set one with \`${config.product} self use <selector>\`)`);
  }
  if (cmd.fix && (cmd.yes || (await confirm(events, 'Write shims and put the shim dir on PATH?')))) {
    const fix = runDoctorFix({ store, shellEnv: env.SHELL, home: cmd.home ?? homedir() });
    events.summary?.(
      `fixed: shim written (${fix.shimWritten}), shim dir ${fix.pathEnsured} on PATH (open a new shell).`,
    );
  }
  events.summary?.(report.ok ? 'all good.' : `${report.problems} problem(s) — see above.`);
  return report.ok ? 0 : 1;
}

/**
 * @param {object} args
 * @param {ProductConfig} args.config
 * @param {VersionStore} args.store
 * @param {ParsedCommand & { selectors: string[], yes?: boolean, kind?: string }} args.cmd
 * @param {NodeJS.ProcessEnv} args.env
 * @param {CliEvents} args.events
 * @returns {Promise<number>}
 */
async function doRemove({ config, store, cmd, env, events }) {
  if (cmd.selectors.length === 0) {
    throw new Error(`usage: \`${config.product} self remove <selector> [<selector> ...]\``);
  }
  const state = store.loadState();
  /** @type {Array<{ rec: InstallRecord, active: boolean }>} */
  const targets = [];
  for (const raw of cmd.selectors) {
    const sel = selectorParse(raw, forcedKind(cmd.kind));
    const rec = resolveInstalled(state, sel, raw);
    const active = store.active();
    targets.push({ rec, active: !!active && sameRecord(active, rec) });
  }
  const prompt = `Remove ${targets.length} instance(s) of ${config.product}? This cannot be undone.`;
  if (!(cmd.yes || (await confirm(events, prompt)))) {
    events.summary?.('aborted.');
    return 0;
  }
  let removed = 0;
  let skipped = 0;
  for (const { rec, active } of targets) {
    if (active) {
      events.note?.(`skipped ${rec.versionId()} #${rec.instance} — it is the active version`);
      skipped += 1;
      continue;
    }
    const dir = store.instanceDir(rec.versionId(), rec.instance);
    try {
      const { rmSync } = await import('node:fs');
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      store.forgetInstance(rec.versionId(), rec.instance);
      events.removed?.(dir);
      removed += 1;
    } catch (e) {
      events.note?.(`skipped ${dir} (in use?): ${e instanceof Error ? e.message : String(e)}`);
      skipped += 1;
    }
  }
  // Drop the desktop shortcut only when no instances of the product remain.
  if (store.loadState().installs.length === 0) {
    uninstallShortcut(productLabel(config.product));
  }
  events.summary?.(`removed ${removed}, skipped ${skipped}.`);
  if (events.isJson?.()) {
    events.json?.({
      ok: true,
      command: 'self:remove',
      product: config.product,
      removed,
      skipped,
    });
  }
  return 0;
}

/**
 * @param {object} args
 * @param {ProductConfig} args.config
 * @param {VersionStore} args.store
 * @param {ParsedCommand & { yes?: boolean }} args.cmd
 * @param {NodeJS.ProcessEnv} args.env
 * @param {CliEvents} args.events
 * @returns {Promise<number>}
 */
async function doGc({ config, store, cmd, env, events }) {
  // Drop orphaned instance dirs (no record) + records pointing at missing dirs.
  const state = store.loadState();
  let removed = 0;
  let skipped = 0;
  for (const rec of [...state.installs]) {
    const dir = store.instanceDir(rec.versionId(), rec.instance);
    if (existsSync(dir)) continue;
    store.forgetInstance(rec.versionId(), rec.instance);
    events.removed?.(`orphan record ${rec.versionId()} #${rec.instance} (dir gone)`);
    removed += 1;
  }
  void skipped; void env;
  events.summary?.(`gc: removed ${removed} orphan record(s) of ${config.product}.`);
  if (events.isJson?.()) {
    events.json?.({ ok: true, command: 'self:gc', product: config.product, removed });
  }
  return 0;
}

/**
 * @param {object} args
 * @param {VersionStore} args.store
 * @param {ParsedCommand & { selector: string | null, kind?: string, shell?: string }} args.cmd
 * @param {NodeJS.ProcessEnv} args.env
 * @param {CliEvents} args.events
 * @returns {number}
 */
function doEnv({ store, cmd, env, events }) {
  const shell = cmd.shell ? parseShell(cmd.shell) : detectShell(env.SHELL ?? null);
  let home;
  if (cmd.selector) {
    const state = store.loadState();
    const sel = selectorParse(cmd.selector, forcedKind(cmd.kind));
    const rec = resolveInstalled(state, sel, cmd.selector);
    home = store.instanceDir(rec.versionId(), rec.instance);
  } else {
    const rec = store.active();
    if (!rec) {
      throw new Error(`no active ${store.product} version`);
    }
    home = store.instanceDir(rec.versionId(), rec.instance);
  }
  process.stdout.write(`${exportLine(shell, store.product, home)}\n`);
  return 0;
}

/**
 * @param {object} args
 * @param {ProductConfig} args.config
 * @param {VersionStore} args.store
 * @param {ParsedCommand & { target: string, from?: string, yes?: boolean, dryRun?: boolean }} args.cmd
 * @param {NodeJS.ProcessEnv} args.env
 * @param {string} args.cwd
 * @param {CliEvents} args.events
 * @returns {Promise<number>}
 */
async function doRelocate({ config, store, cmd, env, cwd, events }) {
  const newPath = resolve(cmd.target);
  if (findSourceRoot(newPath) === null) {
    throw new Error(
      `\`${newPath}\` is not a ${config.product} source tree ` +
        `(carry a vibe.toml + the product subdir)`,
    );
  }
  const canonicalNew = externalPath(newPath);
  const state = store.loadState();
  const old = cmd.from ?? inferOldSource(state);
  if (old === null) {
    throw new Error(
      `no installed ${config.product} version records a source tree to relocate from ` +
        `(install from a checkout first, or pass --from <old-path>)`,
    );
  }
  const active = store.active();
  const plan = planRelocate({ state, old, new: canonicalNew, active });

  if (sameLocationLoose(old, canonicalNew)) {
    events.summary?.(`the recorded source already matches \`${canonicalNew}\` — nothing to relocate.`);
    return 0;
  }
  if (plan.repoint.length === 0 && plan.delete.length === 0) {
    events.summary?.(`no instance is sourced from \`${old}\` — nothing to relocate.`);
    return 0;
  }

  events.step?.(`source: ${old} → ${canonicalNew}`);
  events.step?.(`repoint: ${plan.repoint.length} active instance(s)`);
  events.step?.(`remove: ${plan.delete.length} stale instance(s) built from the old tree`);

  if (cmd.dryRun) {
    events.summary?.('dry-run: no changes made.');
    return 0;
  }

  // The removal is irreversible — confirm unless --yes. A repoint-only plan
  // (no deletions) needs no confirm: it is a reversible state edit.
  if (
    plan.delete.length > 0 &&
    !(cmd.yes || (await confirm(events, `Relocate source provenance and remove ${plan.delete.length} stale instance(s)? This cannot be undone.`)))
  ) {
    events.summary?.('aborted.');
    return 0;
  }
  const counts = applyRelocate({
    store,
    plan,
    note: events.note ?? (() => {}),
  });
  if (counts.removed > 0) events.summary?.(`removed ${counts.removed} stale instance(s).`);
  if (counts.skipped > 0) {
    events.summary?.(
      `skipped ${counts.skipped} locked instance(s) — kept; re-run \`${config.product} self relocate\` once they close.`,
    );
  }
  if (plan.repoint.length > 0) {
    events.summary?.(
      `repointed ${plan.repoint.length} active instance's source → ${canonicalNew}`,
    );
  }
  events.summary?.('done.');
  return 0;
}

// --- shared helpers --------------------------------------------------------

/**
 * @param {ParsedCommand & { release?: boolean, profile?: string }} cmd
 * @returns {import('./model.mjs').Profile}
 */
function resolveProfile(cmd) {
  if (cmd.release === true) return PROFILE.RELEASE;
  if (cmd.profile) {
    if (cmd.profile === 'debug') return PROFILE.DEBUG;
    if (cmd.profile === 'release') return PROFILE.RELEASE;
    throw new ModelError(`unknown build profile \`${cmd.profile}\``);
  }
  // Default for packaged apps is release — the debug profile produces a
  // slower binary with no console-window suppression.
  return PROFILE.RELEASE;
}

/**
 * @param {string | undefined} kind
 * @returns {import('./model.mjs').Kind | null}
 */
function forcedKind(kind) {
  if (!kind) return null;
  if (kind === 'tag') return KIND.TAG;
  if (kind === 'branch') return KIND.BRANCH;
  if (kind === 'commit') return KIND.COMMIT;
  throw new UsageError(`unknown --kind \`${kind}\` (want tag|branch|commit)`);
}

/**
 * Map a selector onto the newest *installed* instance of its id (PROP-019
 * §2.3, §2.11).
 *
 * @param {State} state
 * @param {import('./model.mjs').Selector} selector
 * @param {string} raw
 * @returns {InstallRecord}
 */
function resolveInstalled(state, selector, raw) {
  switch (selector.tag) {
    case 'latest': {
      const r = latestOf(state, VersionId.new(KIND.BRANCH, 'main'));
      if (r) return r;
      throw new Error(`\`latest\` is not installed`);
    }
    case 'explicit': {
      const r = latestOf(state, selector.id);
      if (r) return r;
      throw new Error(`\`${selector.id}\` is not installed (try \`${raw}\` to install)`);
    }
    case 'stable': {
      const r = highestTagRecord(state);
      if (r) return r;
      throw new Error('no installed release tag satisfies `stable`');
    }
    case 'ambiguous': {
      const r = byPrecedenceRecord(state, selector.name);
      if (r) return r;
      throw new Error(`no installed version named \`${selector.name}\``);
    }
  }
}

/**
 * @param {State} state
 * @param {VersionId} id
 * @returns {InstallRecord | null}
 */
function latestOf(state, id) {
  let best = null;
  for (const r of state.installs) {
    if (r.versionId().equals(id) && (best === null || r.instance > best.instance)) {
      best = r;
    }
  }
  return best;
}

/**
 * @param {State} state
 * @returns {InstallRecord | null}
 */
function highestTagRecord(state) {
  let best = null;
  let bestV = null;
  for (const r of state.installs) {
    if (r.kind !== KIND.TAG) continue;
    const core = r.id.startsWith('v') ? r.id.slice(1) : r.id;
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(core);
    if (!m) continue;
    const v = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (bestV === null || cmpVec(v, bestV) > 0) {
      best = r;
      bestV = v;
    }
  }
  return best;
}

/**
 * @param {State} state
 * @param {string} name
 * @returns {InstallRecord | null}
 */
function byPrecedenceRecord(state, name) {
  for (const kind of [KIND.BRANCH, KIND.TAG, KIND.COMMIT]) {
    let best = null;
    for (const r of state.installs) {
      if (r.kind === kind && r.id === name && (best === null || r.instance > best.instance)) {
        best = r;
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cmpVec(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * @param {InstallRecord} a
 * @param {InstallRecord} b
 * @returns {boolean}
 */
function sameRecord(a, b) {
  return a.versionId().equals(b.versionId()) && a.instance === b.instance;
}

/**
 * @param {string} product
 * @returns {string}
 */
function productLabel(product) {
  const lower = product.toLowerCase();
  if (lower.startsWith('vibe')) return 'Vibe' + product.slice(4);
  return product.charAt(0).toUpperCase() + product.slice(1);
}

/**
 * @param {CliEvents} events
 * @param {string} prompt
 * @returns {Promise<boolean>}
 */
async function confirm(events, prompt) {
  if (events.confirm) return events.confirm(prompt);
  // Fall back to a no in a non-TTY; a yes in a TTY via readline.
  return false;
}

/**
 * Loose same-location: string-equal when realpath fails on either side.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameLocationLoose(a, b) {
  return a === b;
}

/**
 * @param {State} state
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
 * Print the product-specific usage banner.
 *
 * @param {string} product
 * @returns {void}
 */
function printUsage(product) {
  const P = product;
  process.stderr.write(
    `Usage: ${P} self <verb> [options]\n` +
      `\n` +
      `  install [<selector>]   build + activate (default selector: latest)\n` +
      `  update                 alias for \`install latest'\n` +
      `  use <selector>         flip \`current' to an installed instance\n` +
      `  ls                     list installed instances\n` +
      `  current                print the active instance\n` +
      `  which                  print the active binary path\n` +
      `  doctor [--fix]         probe the toolchain, shim dir, and active binary\n` +
      `  remove <sel>...        remove instance(s) (never the active one)\n` +
      `  gc                     drop orphan records whose dir is gone\n` +
      `  env [<selector>]       print the eval line for the active (or named) version\n` +
      `  relocate <new-path>    repoint source provenance after a checkout move\n` +
      `\n` +
      `Selectors: latest | stable | <tag|branch|commit>:<id> | <semver> | <name>\n` +
      `Options: --release --debug --profile <p> --kind tag|branch|commit\n` +
      `         --force --eval --fix --yes --dry-run --from <path> --shell <name>\n` +
      `         --json --quiet\n`,
  );
}

/**
 * A usage error (exit 2 when surfaced).
 */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

// Re-export the concrete builders so a product's bin/self.mjs imports
// everything it needs from one module (`@org.vibevm/term-common/vvm/cli`).
export { ElectronAppBuilder, LauncherBuilder };
