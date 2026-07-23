#!/usr/bin/env node
/**
 * vibeframe packaging — a thin wrapper over term-common's generalized
 * `packageApp`. Produces a relocatable, self-contained directory that the
 * version-manager (the Phase-2 port of vibe vvm) diff-copies into an
 * instance.
 *
 * Pre-vibevm-term-split, this script inlined the whole
 * npm-11 / node-pty-N-API / Electron-postinstall / @electron/packager
 * dance; that dance is now shared across every terminal product
 * (vibeterm, vibeframe) in `@org.vibevm/term-common/packaging`, and this
 * file just dispatches to it with vibeframe's app name.
 *
 * Usage:
 *
 *     node scripts/package.mjs --out <abs-dir>
 *
 * Output (the single line of stdout the version-manager reads to locate
 * the produced dir): `<out>/vibeframe-<plat>-<arch>/`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageCli } from '@org.vibevm/term-common/packaging';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');

// Dispatch to the shared packaging driver with vibeframe's fixed
// parameters: the app source dir is this app/ and the app name (which
// becomes the packaged-exe name and the produced-child prefix) is
// `vibeframe`. Only `--out` is taken from the caller's argv.
const outIdx = process.argv.indexOf('--out');
const out =
  outIdx >= 0 && process.argv[outIdx + 1]
    ? process.argv[outIdx + 1]
    : resolve(appDir, '..', 'build', 'vibeframe-dist');

// packageCli reads --app-dir / --app / --out from process.argv; splice
// them in so the wrapper's own `--out` wins.
process.argv = [
  process.argv[0],
  fileURLToPath(import.meta.url),
  '--app-dir',
  appDir,
  '--app',
  'vibeframe',
  '--out',
  resolve(out),
];
packageCli();
