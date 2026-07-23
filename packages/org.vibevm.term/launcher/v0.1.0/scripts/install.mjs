#!/usr/bin/env node
/**
 * launcher install wrapper — `node bin/self.mjs install`.
 *
 * Onboarding for the GUI launchers:
 *   node scripts/install.mjs                 # build all three + activate
 *   node scripts/install.mjs latest --release
 *
 * Forwards every flag the install verb accepts.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const productRoot = resolve(here, '..');
const self = resolve(productRoot, 'bin', 'self.mjs');

const r = spawnSync(process.execPath, [self, 'install', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
