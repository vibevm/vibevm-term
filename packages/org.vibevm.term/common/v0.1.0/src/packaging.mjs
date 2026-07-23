/**
 * term-common — the generalized electron-packaging driver.
 *
 * Produces a relocatable, self-contained directory that the version-manager
 * (the Phase-2 port of vibe vvm) diff-copies into an instance. Used by every
 * terminal Electron product (vibeterm, vibeframe) — parameterised by the
 * app name, which is the ONLY axis on which the per-app originals differed.
 *
 * `npm install` alone is NOT enough: npm 11 blocks native/postinstall scripts,
 * so Electron's binary download and node-pty's prebuild staging do not run.
 * So this does the full dance, in order:
 *
 *   1. npm install                                 — deps (idempotent)
 *   2. npm rebuild node-pty --foreground-scripts   — node-pty prebuild + ConPTY DLLs
 *   3. node node_modules/electron/install.js       — Electron's binary (its postinstall)
 *   4. npx @electron/packager … --dir --no-asar    — the relocatable dir
 *
 * NO @electron/rebuild step. node-pty is built on node-addon-api (N-API), so
 * its shipped prebuilds are ABI-stable across Node/Electron versions: the same
 * `.node` loads in system Node 24 (modules=137) and Electron 32's Node 20
 * (modules=128) and ConPTY spawns correctly under Electron (verified). Forcing
 * @electron/rebuild would re-enter node-gyp, trip the broken
 * `deps/winpty/src/winpty.gyp`, and fail; it is both unnecessary and broken
 * for this N-API addon, so it is omitted.
 *
 * Output: `<out>/<app>-<plat>-<arch>/` — `electron(.exe)` at the root,
 * `resources/app/{main.cjs,renderer.js,index.html,lib/,package.json,
 * node_modules/}` inside, plus the Chromium runtime + `LICENSES.chromium.html`.
 * The caller resolves that single child.
 *
 * Packaging is per-OS: it runs on the target host (node-pty's native addon
 * and Electron's runtime are OS/arch-specific).
 *
 * Provenance: factored out of the per-app `scripts/package.mjs` shipped in
 * the vibevm host repo (`apps/vibeterm/scripts/package.mjs`,
 * `apps/vibeframe/scripts/package.mjs`). The two originals were identical
 * except for the literal app name in three places (the staging dir default,
 * the packager `name` arg, and the post-pack child-prefix scan); this is the
 * parameterised shared form. Each app still carries a thin
 * `app/scripts/package.mjs` wrapper that calls `packageApp(...)` with its
 * own name.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Run one packaging step, inheriting stdio. Exits the process on failure
 * with the child's exit code, naming the step that failed.
 *
 * @param {string} label  human-readable step name for the log prefix
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 * @returns {void}
 */
function run(label, cmd, args, cwd) {
  const SHELL = process.platform === 'win32';
  process.stderr.write(`[package] ${label}: ${cmd} ${args.join(' ')}\n`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: SHELL, cwd });
  if (res.status !== 0) {
    process.stderr.write(`[package] FAILED: ${label} (exit ${res.status})\n`);
    process.exit(res.status ?? 1);
  }
}

/**
 * Package an Electron terminal app into a relocatable, self-contained dir.
 *
 * @param {object} opts
 * @param {string} opts.appDir  absolute path to the app source (the dir
 *   carrying its `package.json`, `main.cjs`, etc.)
 * @param {string} opts.appName the app name passed to `@electron/packager`
 *   and the prefix of the produced `<appName>-<plat>-<arch>/` child
 *   (e.g. `vibeterm`, `vibeframe`). MUST match the packaged-exe name the
 *   resolver looks up at launch.
 * @param {string} opts.outDir  absolute path to the staging dir; the single
 *   `<appName>-<plat>-<arch>/` child lands inside it.
 * @returns {string} the absolute path to the produced packaged-app dir
 *   (the single child under `outDir`)
 * @throws {Error} if packaging produces zero or more than one child dir
 */
export function packageApp({ appDir, appName, outDir }) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const PLATFORM = process.platform;
  const ARCH = process.arch;

  run('npm install', 'npm', ['install'], appDir);
  run('node-pty prebuild', 'npm', ['rebuild', 'node-pty', '--foreground-scripts'], appDir);
  run('electron binary', 'node', ['node_modules/electron/install.js'], appDir);

  // electron-packager: a plain DIRECTORY (no installer), asar OFF.
  // @electron/packager v20 defaults asar ON — it would emit
  // `resources/app.asar` (a monolithic blob), but the version-manager wants
  // the unpacked `resources/app/` tree: transparent, diff-copyable, and the
  // layout the resolver expects. So force it OFF with `--no-asar`.
  // `--prune` drops devDeps from the packaged node_modules; `--overwrite`
  // replaces a prior build.
  run(
    'electron-packager',
    'npx',
    [
      '@electron/packager',
      appDir,
      appName,
      '--dir',
      '--no-asar',
      `--platform=${PLATFORM}`,
      `--arch=${ARCH}`,
      `--out=${outDir}`,
      '--overwrite',
      '--prune=true',
    ],
    appDir,
  );

  const prefix = `${appName}-`;
  const children = readdirSync(outDir).filter((n) => n.startsWith(prefix));
  if (children.length !== 1) {
    throw new Error(
      `[package] expected exactly one '${prefix}*' child under ${outDir}, ` +
        `found ${children.length}: ${children.join(', ')}`,
    );
  }
  return join(outDir, children[0]);
}

/**
 * The thin CLI entry — `node …/packaging.mjs --app-dir <path> --app <name>
 * --out <abs-dir>`. Each app's `app/scripts/package.mjs` wrapper dispatches
 * here. Exits 0 and prints the produced dir on stdout (one line), matching
 * the contract the host's NpmPackager expected before the move (one line of
 * stdout = the staged dir), and the contract the Phase-2 version-manager
 * will expect.
 *
 * Run only when invoked as a script (not when imported).
 *
 * @returns {void}
 */
export function packageCli() {
  const argv = process.argv;
  const take = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };

  const appDir = take('--app-dir');
  const appName = take('--app');
  const out = take('--out');

  if (!appDir || !appName || !out) {
    process.stderr.write(
      '[package] usage: packaging.mjs --app-dir <path> --app <name> --out <abs-dir>\n',
    );
    process.exit(2);
  }

  const produced = packageApp({
    appDir: resolve(appDir),
    appName,
    outDir: resolve(out),
  });
  // The single line of stdout the caller reads to locate the produced dir.
  process.stdout.write(produced + '\n');
}

// Invoke the CLI only when run as a script (`node …/packaging.mjs …`), not
// when imported as a module. The check compares `process.argv[1]` (the script
// path Node resolved) against `import.meta.url` (this module's URL), both
// normalised to real paths via `realpathSync` so it is robust to symlinks
// (e.g. a consumer's `node_modules/@org.vibevm/term-common/src/packaging.mjs`
// symlinked at a different path).
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) packageCli();
