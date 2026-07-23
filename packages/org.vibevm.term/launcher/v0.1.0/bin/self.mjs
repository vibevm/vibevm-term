#!/usr/bin/env node
/**
 * launcher self — the version-manager entry point for the GUI launchers.
 *
 * A thin wrapper around term-common's `vvmMain` (spec://term-common/PROP-vvm),
 * with a `LauncherBuilder` (cargo build -p vibe-launcher) instead of the
 * Electron packager. The launcher product ships THREE exes (vibetree,
 * vibeterm, vibeframe) in one instance — one cargo build, one manifest
 * record, one install — and `vvmMain`'s launcher branch refreshes each exe's
 * on-PATH placement + desktop shortcut on install.
 *
 * Verbs (full set): install | update | use | ls | current | which | doctor |
 * remove | gc | env | relocate.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Relative import to the sibling term-common package — see vibeterm's
// bin/self.mjs for the rationale.
import { vvmMain, LauncherBuilder } from '../../../common/v0.1.0/vvm/cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const productRoot = resolve(here, '..');

const config = {
  product: 'launcher',
  productType: 'launcher',
  builder: new LauncherBuilder(),
  sourceRoot: productRoot,
};

const argv = process.argv.slice(2);

try {
  const code = await vvmMain(config, argv);
  process.exit(code);
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
