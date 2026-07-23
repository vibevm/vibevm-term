/**
 * term-common vvm — the build seam.
 *
 * Port of `vibe-cli/src/commands/vvm/builder.rs`'s `Builder` trait, with two
 * concrete builders that replace the host's single `CargoBuilder`:
 *
 *  - `ElectronAppBuilder` — runs the product's `app/scripts/package.mjs`
 *    (which calls term-common's `packageApp`) to produce a relocatable,
 *    self-contained dir. Used by the Electron terminal products.
 *  - `LauncherBuilder` — runs `cargo build --release -p vibe-launcher` to
 *    produce the three launcher exes (vibetree / vibeterm / vibeframe) in one
 *    build, then surfaces each as a dist entry. Used by the launcher product.
 *
 * Both honour the same contract: `build(sourceRoot, targetDir, profile) →
 * BuildOutput`, where `BuildOutput.dist` is the list of `(absSrc, rel)` pairs
 * the placer diff-copies into the instance.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { binaryName } from './store.mjs';

/**
 * A selector resolved to a concrete version id and commit (PROP-019 §2.7).
 */

/**
 * The product of a successful build (PROP-019 §2.7): the distribution set,
 * in `(absSrc, rel)` form ready for the placer, plus the toolchain stamp
 * recorded in the install record.
 *
 * @typedef {Object} BuildOutput
 * @property {Array<[string, string]>} dist  `(absSrc, rel)` pairs
 * @property {string} toolchain  e.g. `node 22.6.0` / `rustc 1.93.0`
 */

/**
 * @typedef {Object} ResolvedVersion
 * @property {import('./model.mjs').VersionId} id
 * @property {string} commit
 */

/**
 * @typedef {Object} Builder
 * @property {(sourceRoot: string, targetDir: string, profile: import('./model.mjs').Profile) => BuildOutput} build
 */

/**
 * Abbreviate a commit hash for a version label (commits are ASCII hex).
 *
 * @param {string} c
 * @returns {string}
 */
export function shortCommit(c) {
  return c.slice(0, Math.min(c.length, 10));
}

/**
 * The Electron-app builder. Builds the product's `app/` (Electron + node-pty)
 * via `npm install` + `npm rebuild node-pty --foreground-scripts` + Electron's
 * binary fetch + `@electron/packager --dir`, then walks the packaged output
 * to emit `(absSrc, "<app>/<rel>")` pairs for the placer. The `<app>/` prefix
 * keeps the packaged tree as a subdir of the instance, matching the host's
 * historical layout (and PROP-042 §5's back-compat `<instance>/<app>/` tier).
 */
export class ElectronAppBuilder {
  /**
   * @param {object} opts
   * @param {string} opts.app  the app name (`vibeterm` / `vibeframe`) — also the packager `name`
   */
  constructor({ app }) {
    this.app = app;
  }

  /**
   * @param {string} sourceRoot  the product package root (`…/<app>/v0.1.0/`)
   * @param {string} targetDir   `<store.buildDir>` (managed staging; not used here — the packager writes under app/)
   * @param {import('./model.mjs').Profile} _profile
   * @returns {BuildOutput}
   */
  build(sourceRoot, targetDir, _profile) {
    // Delegate to the product's own packaging script, which calls
    // term-common's packageApp(...) with the right app name. Running it in
    // the app dir keeps the `node_modules` cache warm between installs.
    const appDir = join(sourceRoot, 'app');
    if (!existsSync(appDir)) {
      throw new Error(
        `ElectronAppBuilder: no \`app/\` dir under \`${sourceRoot}\` ` +
          `(expected the product package root)`,
      );
    }
    const script = join(appDir, 'scripts', 'package.mjs');
    if (!existsSync(script)) {
      throw new Error(
        `ElectronAppBuilder: \`${script}\` is missing ` +
          `(the product must ship an app/scripts/package.mjs that calls packageApp)`,
      );
    }
    // The packager writes to a staging dir it owns (default `<app>-dist` next
    // to app/, overridable by VIBEVM_TERM_OUT); we read its single child.
    const out = process.env.VIBEVM_TERM_OUT ?? join(targetDir, `${this.app}-dist`);
    const r = spawnSync(
      process.execPath,
      [script, '--out', out],
      { cwd: appDir, stdio: 'inherit' },
    );
    if (r.status !== 0) {
      throw new Error(
        `ElectronAppBuilder: app/scripts/package.mjs failed (exit ${r.status ?? 'null'})`,
      );
    }
    // electron-packager emits `<out>/<app>-<plat>-<arch>/` — the one child.
    const children = readdirSync(out, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(out, d.name));
    if (children.length !== 1) {
      throw new Error(
        `ElectronAppBuilder: expected exactly one packaged dir under \`${out}\`, found ${children.length}`,
      );
    }
    const packaged = children[0];
    return {
      dist: walkPackaged(packaged, this.app),
      toolchain: detectNodeToolchain(),
    };
  }
}

/**
 * Walk a packaged dir tree and emit `(absSrc, "<app>/<rel>")` pairs — the
 * whole tree ships; every file in a packaged Electron app is load-bearing
 * (the runtime, locales, the app + its node_modules).
 *
 * @param {string} packaged
 * @param {string} app
 * @returns {Array<[string, string]>}
 */
function walkPackaged(packaged, app) {
  /** @type {Array<[string, string]>} */
  const out = [];
  const walk = (dir, rel) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, ent.name);
      const childRel = rel === '' ? ent.name : `${rel}/${ent.name}`;
      if (ent.isDirectory()) {
        walk(child, childRel);
      } else if (ent.isFile()) {
        out.push([child, `${app}/${childRel}`]);
      }
    }
  };
  walk(packaged, '');
  return out;
}

/**
 * The launcher builder. Runs `cargo build --release -p vibe-launcher` in the
 * launcher package root, then surfaces each of the three exes (vibetree /
 * vibeterm / vibeframe) as its own `(absSrc, "<stem>")` pair — they land at
 * the instance root so the on-PATH shim finds them directly.
 *
 * The three exes are one crate's three bin targets; a single cargo build
 * produces all of them. They share a source checkout and a manifest record.
 */
export class LauncherBuilder {
  /**
   * @param {string[]} [binaries]  the exe stems (defaults to the three)
   */
  constructor({ binaries = ['vibetree', 'vibeterm', 'vibeframe'] } = {}) {
    this.binaries = binaries;
  }

  /**
   * @param {string} sourceRoot  the launcher package root (`…/launcher/v0.1.0/`)
   * @param {string} targetDir   `<store.buildDir>` — cargo's `--target-dir`
   * @param {import('./model.mjs').Profile} profile
   * @returns {BuildOutput}
   */
  build(sourceRoot, targetDir, profile) {
    const args = ['build', '-p', 'vibe-launcher'];
    if (profile === 'release') args.push('--release');
    args.push('--target-dir', targetDir);
    const r = spawnSync('cargo', args, { cwd: sourceRoot, stdio: 'inherit' });
    if (r.status !== 0) {
      throw new Error(
        `LauncherBuilder: cargo build -p vibe-launcher failed (exit ${r.status ?? 'null'})`,
      );
    }
    const builtDir = join(targetDir, profile);
    /** @type {Array<[string, string]>} */
    const dist = [];
    for (const stem of this.binaries) {
      const exe = join(builtDir, binaryName(stem));
      if (!existsSync(exe)) {
        // A platform / toolchain where this launcher was not built.
        continue;
      }
      dist.push([exe, binaryName(stem)]);
    }
    if (dist.length === 0) {
      throw new Error(
        `LauncherBuilder: no launcher exes found under \`${builtDir}\``,
      );
    }
    return { dist, toolchain: detectRustToolchain(sourceRoot) };
  }
}

/**
 * @returns {string} e.g. `node v22.6.0`
 */
function detectNodeToolchain() {
  const r = spawnSync(process.execPath, ['--version'], { encoding: 'utf8' });
  if (r.status === 0) {
    const v = r.stdout.trim();
    return v.startsWith('v') ? `node ${v}` : `node v${v}`;
  }
  return 'node unknown';
}

/**
 * @param {string} cwd
 * @returns {string}
 */
function detectRustToolchain(cwd) {
  const r = spawnSync('rustc', ['--version'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'rustc unknown';
}

// re-export for callers that resolve source roots.
export { resolve };
