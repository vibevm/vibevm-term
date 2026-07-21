#!/usr/bin/env node
/**
 * vibeterm install wrapper — `node bin/self.mjs install`.
 *
 * A product ships this so the canonical onboarding is one short command:
 *   node scripts/install.mjs         # build + activate (selector defaults to latest)
 *   node scripts/install.mjs latest --release
 *
 * It is a thin alias for the full CLI; every flag the install verb accepts is
 * forwarded.
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
