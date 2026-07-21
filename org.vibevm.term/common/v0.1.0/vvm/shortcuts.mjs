/**
 * term-common vvm — cross-platform placement + desktop shortcuts.
 *
 * Port + extension of the host's removed `launchers.rs` (PROP-043
 * #self-install): the rename-aside placement that tolerates a running exe,
 * the `.old-<n>` sidecar sweep, and the per-platform desktop integration.
 *
 * Placement (rename-aside): Windows locks a running exe against
 * overwrite/delete but still allows renaming it, so a live `dest` is moved to
 * a unique sidecar first, then the sidecar is dropped once the new exe is in
 * place — leaving the dir clean when the old binary was not running (the
 * common case). A sidecar that is still locked (its process is alive) lingers
 * for the next install's sweep. POSIX overwrites in place; the sidecar path
 * is unused there.
 *
 * Shortcuts (per platform):
 *  - Windows: a Start-menu `.lnk` under `Programs\vibevm` via PowerShell's
 *    WScript.Shell COM — no admin, no COM plumbing, no extra dep (the host's
 *    approach).
 *  - Linux: a `.desktop` file under `~/.local/share/applications` with the
 *    FreeDesktop entry spec; surfaces in any Freedesktop-aware menu.
 *  - macOS: a `.app` bundle skeleton under `~/Applications` (a folder with an
 *    `Info.plist` + a launcher script). Not a signed/notarised bundle — the
 *    first launch still needs Gatekeeper assent. Tracked here so a Mac
 *    install is not silently a no-op.
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { homedir } from 'node:os';

/**
 * Copy `src` onto `dest`, tolerating a `dest` that is a *running* binary.
 * Windows: a running exe is rename-aside'd (`.old-<nanos>`) then dropped
 * post-copy if nothing holds it. POSIX: overwrite directly. Returns `dest`.
 *
 * @param {string} src
 * @param {string} dest
 * @returns {string}
 */
export function placeExe(src, dest) {
  const parent = dirname(dest);
  mkdirSync(parent, { recursive: true });
  if (process.platform === 'win32') {
    sweepSidecars(parent, dest);
    let aside = null;
    if (existsSync(dest)) {
      const candidate = sidecarPath(dest);
      try {
        renameSync(dest, candidate);
        aside = candidate;
      } catch {
        // Even the rename failed (very locked): try a direct delete; works
        // when it is not actually running.
        try {
          unlinkSync(dest);
        } catch {
          // leave aside null — the copyFileSync below will surface the failure
        }
      }
    }
    copyFileSync(src, dest);
    if (aside !== null) {
      try {
        unlinkSync(aside);
      } catch {
        // Still locked — its process is alive; the next install's sweep drops it.
      }
    }
  } else {
    copyFileSync(src, dest);
  }
  return dest;
}

/**
 * A unique `<name>.old-<nanos>` sidecar next to `dest`, so moving a running
 * exe aside never collides with a still-locked sidecar from a prior install.
 *
 * @param {string} dest
 * @returns {string}
 */
function sidecarPath(dest) {
  const nanos = Date.now() * 1_000_000 + process.hrtime()[1] % 1_000_000;
  const name = dest.split(/[\\/]/).pop() ?? 'binary';
  return join(dirname(dest), `${name}.old-${nanos}`);
}

/**
 * Best-effort removal of `<dest>.old-*` sidecars left by earlier installs; a
 * still-locked one (its process is alive) simply fails to delete and waits.
 * Windows only — the only platform the sidecar path runs on.
 *
 * @param {string} parent
 * @param {string} dest
 * @returns {void}
 */
function sweepSidecars(parent, dest) {
  const name = dest.split(/[\\/]/).pop();
  if (!name) return;
  const needle = `${name}.old-`;
  let entries;
  try {
    entries = readdirSync(parent);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(needle)) {
      try {
        unlinkSync(join(parent, entry));
      } catch {
        // locked — leave it for the next sweep
      }
    }
  }
}

/**
 * Create/replace the desktop shortcut for a binary. Dispatches by platform.
 * Best-effort: returns `null` on success or an error message on failure; the
 * caller logs it as a note and continues (a missing shortcut never fails an
 * install — the on-PATH shim is the real integration).
 *
 * @param {string} label   the human-facing name (`VibeTerm`)
 * @param {string} targetExe  the binary the shortcut points at
 * @param {string} workingDir  the working dir for the shortcut (the shim dir)
 * @returns {string | null}  `null` on success, an error message otherwise
 */
export function installShortcut(label, targetExe, workingDir) {
  try {
    if (process.platform === 'win32') {
      return installShortcutWindows(label, targetExe, workingDir);
    }
    if (process.platform === 'darwin') {
      return installShortcutMac(label, targetExe, workingDir);
    }
    return installShortcutLinux(label, targetExe, workingDir);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Windows: a `.lnk` in `Start Menu\Programs\vibevm` via WScript.Shell.
 *
 * @param {string} label
 * @param {string} targetExe
 * @param {string} workingDir
 * @returns {string | null}
 */
function installShortcutWindows(label, targetExe, workingDir) {
  const script =
    "$ErrorActionPreference='Stop'; " +
    "$group = Join-Path ([Environment]::GetFolderPath('Programs')) 'vibevm'; " +
    'New-Item -ItemType Directory -Force -Path $group | Out-Null; ' +
    `$lnk = Join-Path $group '${psQuote(label)}.lnk'; ` +
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); ' +
    `$s.TargetPath = '${psQuote(targetExe)}'; ` +
    `$s.IconLocation = '${psQuote(targetExe)},0'; ` +
    `$s.WorkingDirectory = '${psQuote(workingDir)}'; ` +
    `$s.Description = '${psQuote(label)}'; ` +
    '$s.Save()';
  const out = spawnSync('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ]);
  if (out.status !== 0) {
    return String(out.stderr).trim() || `powershell exited ${String(out.status)}`;
  }
  return null;
}

/**
 * Linux: a `.desktop` file in `~/.local/share/applications`.
 *
 * @param {string} label
 * @param {string} targetExe
 * @param {string} workingDir
 * @returns {string | null}
 */
function installShortcutLinux(label, targetExe, workingDir) {
  const dir = join(homedir(), '.local', 'share', 'applications');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${desktopId(label)}.desktop`);
  const content =
    '[Desktop Entry]\n' +
    'Type=Application\n' +
    `Name=${label}\n` +
    `Exec=${desktopExec(targetExe)}\n` +
    `Path=${workingDir}\n` +
    `Icon=${targetExe}\n` +
    `Comment=${label}\n` +
    'Terminal=false\n' +
    'Categories=Utility;\n';
  writeFileSync(file, content);
  // Ask the desktop indexer to notice the new entry; ignore failure.
  spawnSync('update-desktop-database', [dir], { stdio: 'ignore' });
  return null;
}

/**
 * macOS: a minimal `.app` bundle skeleton in `~/Applications`. The bundle's
 * executable is a launcher script that execs the real binary — this keeps the
 * bundle tiny and avoids copying the (large) Electron tree twice. The first
 * launch still hits Gatekeeper (unsigned), which is documented behaviour.
 *
 * @param {string} label
 * @param {string} targetExe
 * @param {string} _workingDir  (unused on mac; the bundle sets its own)
 * @returns {string | null}
 */
function installShortcutMac(label, targetExe, _workingDir) {
  const appsDir = join(homedir(), 'Applications');
  mkdirSync(appsDir, { recursive: true });
  const bundle = join(appsDir, `${bundleName(label)}.app`);
  const contents = join(bundle, 'Contents');
  const macos = join(contents, 'MacOS');
  mkdirSync(macos, { recursive: true });
  // The bundle id is stable per label so a re-install replaces, not stacks.
  const bundleId = `org.vibevm.term.${desktopId(label)}`;
  writeFileSync(
    join(contents, 'Info.plist'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
        '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '  <key>CFBundleName</key>',
      `  <string>${escapeXml(label)}</string>`,
      '  <key>CFBundleIdentifier</key>',
      `  <string>${escapeXml(bundleId)}</string>`,
      '  <key>CFBundleExecutable</key>',
      '  <string>launcher</string>',
      '  <key>CFBundlePackageType</key>',
      '  <string>APPL</string>',
      '</dict>',
      '</plist>',
      '',
    ].join('\n'),
  );
  // The launcher execs the real binary; chmod +x after write.
  const launcher = join(macos, 'launcher');
  writeFileSync(
    launcher,
    `#!/bin/sh\nexec "${targetExe}" "$@"\n`,
  );
  try {
    spawnSync('chmod', ['+x', launcher], { stdio: 'ignore' });
  } catch {
    // non-fatal
  }
  return null;
}

/**
 * Remove a product's desktop shortcuts for a clean uninstall. Best-effort;
 * returns nothing. The desktop id and bundle name match what [`installShortcut`]
 * wrote, so the lookup is deterministic.
 *
 * @param {string} label
 * @returns {void}
 */
export function uninstallShortcut(label) {
  try {
    if (process.platform === 'win32') {
      const group = join(
        // The Programs folder + the vibevm group — we only delete the .lnk,
        // never the group (it is shared across products).
        process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
        'Microsoft', 'Windows', 'Start Menu', 'Programs', 'vibevm',
      );
      // SpecialFolder.Programs is per-user → %APPDATA%\Microsoft\Windows\Start Menu\Programs
      const lnk = join(group, `${label}.lnk`);
      if (existsSync(lnk)) unlinkSync(lnk);
      return;
    }
    if (process.platform === 'darwin') {
      const bundle = join(homedir(), 'Applications', `${bundleName(label)}.app`);
      if (existsSync(bundle)) rmSync(bundle, { recursive: true, force: true });
      return;
    }
    const file = join(
      homedir(),
      '.local',
      'share',
      'applications',
      `${desktopId(label)}.desktop`,
    );
    if (existsSync(file)) unlinkSync(file);
  } catch {
    // best-effort — a leftover shortcut is a note, not a failure
  }
}

/**
 * Single-quote-escape for a PowerShell single-quoted string literal.
 *
 * @param {string} value
 * @returns {string}
 */
function psQuote(value) {
  return value.replace(/'/g, "''");
}

/**
 * FreeDesktop entry id: lowercased, non-alphanumerics → `-`.
 *
 * @param {string} label
 * @returns {string}
 */
function desktopId(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
}

/**
 * The `Exec=` line: quote if it contains spaces (a target with a space in
 * its path); FreeDesktop wants it shell-escaped.
 *
 * @param {string} targetExe
 * @returns {string}
 */
function desktopExec(targetExe) {
  return /\s/.test(targetExe) ? `"${targetExe}"` : targetExe;
}

/**
 * Bundle name: collapse spaces, keep case (so `VibeTerm` → `VibeTerm.app`).
 *
 * @param {string} label
 * @returns {string}
 */
function bundleName(label) {
  return label.replace(/\s+/g, '');
}

/**
 * Minimal XML text escape for the plist string fields.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
