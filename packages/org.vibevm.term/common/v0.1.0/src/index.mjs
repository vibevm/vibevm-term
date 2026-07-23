/**
 * term-common — the barrel entry. Re-exports the pure helpers every
 * terminal product (vibeterm, vibeframe, vibe-launcher) consumes.
 *
 * Consumers should prefer the deep imports (`@org.vibevm/term-common/args`,
 * `/keymap`, `/packaging`) in performance-sensitive paths; this barrel is
 * for the convenience of `import { parseArgs, keyToSeq } from
 * '@org.vibevm/term-common'`.
 *
 * NOTE: `packageApp` / `packageCli` from `packaging.mjs` spawn child
 * processes (`npm`, `npx`, `node`) and are NOT pure — they belong only in
 * the packaging path, not in a running terminal app. They are re-exported
 * here for discoverability; import them from `/packaging` directly if you
 * want to keep the runtime bundle clean.
 */

export { parseArgs, defaultShell, splitCommand } from './args.mjs';
export {
  keyToSeq,
  encodeWin32,
  KEY_TO_SEQ,
  KEY_TO_WIN32,
} from './keymap.mjs';
export { packageApp, packageCli } from './packaging.mjs';
