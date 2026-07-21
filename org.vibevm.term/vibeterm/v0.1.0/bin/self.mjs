#!/usr/bin/env node
/**
 * vibeterm self — the version-manager entry point.
 *
 * A thin wrapper around term-common's `vvmMain` (the ported version-manager,
 * spec://term-common/PROP-vvm). Resolves the term-common install once (a
 * file: dep on the sibling common package), wires an `ElectronAppBuilder`
 * with the product name, and dispatches every `vibeterm self <verb>` to it.
 *
 * Verbs (full set): install | update | use | ls | current | which | doctor |
 * remove | gc | env | relocate. Run `vibeterm self help` for usage.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Relative import to the sibling term-common package: a product package's
// bin/ has no `node_modules` of its own (the dep lives in app/); a relative
// path keeps the entry script self-contained and avoids a Node resolution
// miss on a fresh checkout. The `vibe install` machinery resolves the
// formal `tool:org.vibevm.term/term-common` edge at install time.
import { vvmMain, ElectronAppBuilder } from '../../../common/v0.1.0/vvm/cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The product package root is the parent of `bin/`.
const productRoot = resolve(here, '..');

const config = {
  product: 'vibeterm',
  productType: 'electron',
  builder: new ElectronAppBuilder({ app: 'vibeterm' }),
  sourceRoot: productRoot,
};

// Drop the script path from argv (Node leaves it in argv[1]); pass the rest.
const argv = process.argv.slice(2);

try {
  const code = await vvmMain(config, argv);
  process.exit(code);
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
