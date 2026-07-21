#!/usr/bin/env node
/**
 * vibeframe self — the version-manager entry point.
 *
 * A thin wrapper around term-common's `vvmMain` (the ported version-manager,
 * spec://term-common/PROP-vvm). Same shape as vibeterm's bin/self.mjs — the
 * only axis that differs is the product name (which selects the ElectronApp
 * builder's `name` arg and the per-product state dir under ~/opt).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Relative import to the sibling term-common package — see vibeterm's
// bin/self.mjs for the rationale (no per-package node_modules at bin/).
import { vvmMain, ElectronAppBuilder } from '../../../common/v0.1.0/vvm/cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const productRoot = resolve(here, '..');

const config = {
  product: 'vibeframe',
  productType: 'electron',
  builder: new ElectronAppBuilder({ app: 'vibeframe' }),
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
