/**
 * term-common vvm — the barrel entry. Re-exports the version-manager modules
 * a product's `bin/self.mjs` consumes.
 *
 * The deep imports (`@org.vibevm/term-common/vvm/cli`, `/install`, etc.) are
 * preferred in product code so a product loads only the surface it needs;
 * this barrel is for the convenience of one-line wiring.
 */

export { vvmMain, parseArgv, consoleEvents, UsageError } from './cli.mjs';
export {
  VersionId,
  InstallRecord,
  State,
  KIND,
  ORIGIN,
  PROFILE,
  selectorParse,
  ModelError,
} from './model.mjs';
export { VersionStore, binaryName, samePath } from './store.mjs';
export {
  ElectronAppBuilder,
  LauncherBuilder,
  shortCommit,
} from './builder.mjs';
export { performInstall } from './install.mjs';
export { planRelocate, applyRelocate, findSourceRoot, externalPath } from './relocate.mjs';
export { runDoctor, runDoctorFix } from './doctor.mjs';
export { placeExe, installShortcut, uninstallShortcut } from './shortcuts.mjs';
export {
  resolveInstallRoot,
  detectShell,
  parseShell,
  writeShim,
  exportLine,
  homeEnvName,
  rcPath,
  makePersister,
  RcFilePersister,
  WindowsEnvPersister,
  pathWithPrefix,
} from './env.mjs';
