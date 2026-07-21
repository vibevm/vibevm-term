/**
 * term-common — the barrel entry. Re-exports the pure helpers every
 * terminal product (vibeterm, vibeframe, vibe-launcher) consumes.
 *
 * Consumers should prefer the deep imports (`@org.vibevm/term-common/args`,
 * `/keymap`, `/packaging`) in performance-sensitive paths; this barrel is
 * for the convenience of `import { parseArgs, keyToSeq } from
 * '@org.vibevm/term-common'`.
 */

export { parseArgs, defaultShell, splitCommand } from './args.mjs';
export {
  keyToSeq,
  encodeWin32,
  KEY_TO_SEQ,
  KEY_TO_WIN32,
} from './keymap.mjs';
