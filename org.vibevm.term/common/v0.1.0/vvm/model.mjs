/**
 * term-common vvm — the version-manager domain model.
 *
 * A TypeScript port of the host's `vibe-cli/src/commands/vvm/model.rs`
 * (PROP-019 §2.3–2.4, §2.16). Same invariants, same on-disk shape, so an
 * instance laid down by `<product> self install` is byte-equivalent in
 * layout to one laid down by `vibe self install` — the products repo is a
 * twin, not a fork.
 *
 * Conformance twin: spec://vibevm/common/PROP-019#layout (the host's
 * normative contract). This file is the products-repo projection; the host
 * Rust remains authoritative. spec://term-common/PROP-vvm#root is the
 * products-repo contract that pins this port.
 */

/**
 * What a version is pinned to (PROP-019 §2.4). The kind namespaces the
 * on-disk layout so a tag `1.2.3` and a branch `1.2.3` never collide.
 *
 * @typedef {'tag' | 'branch' | 'commit'} Kind
 */

/** @type {Readonly<Record<string, Kind>>} */
export const KIND = Object.freeze({
  TAG: 'tag',
  BRANCH: 'branch',
  COMMIT: 'commit',
});

const KIND_TOKENS = new Set(['tag', 'branch', 'commit']);

/**
 * Parse a kind token, or `null` when unknown.
 *
 * @param {string} s
 * @returns {Kind | null}
 */
export function kindFromToken(s) {
  return KIND_TOKENS.has(s) ? /** @type {Kind} */ (s) : null;
}

/**
 * The canonical identity of a version: `<kind>:<id>` (PROP-019 §2.4).
 * Rendered with `:` for humans, split into `<kind>/<id>` on disk.
 */
export class VersionId {
  /**
   * @param {Kind} kind
   * @param {string} id  the git-side identifier (tag / branch / commit hash)
   */
  constructor(kind, id) {
    this.kind = kind;
    this.id = id;
  }

  /** @param {Kind} kind @param {string} id */
  static new(kind, id) {
    return new VersionId(kind, id);
  }

  /** The on-disk path segment `<kind>/<id>` (PROP-019 §2.4). */
  pathSegments() {
    return [this.kind, this.id];
  }

  /** @returns {string} `<kind>:<id>` */
  toString() {
    return `${this.kind}:${this.id}`;
  }

  /**
   * Structural equality (kind + id).
   *
   * @param {unknown} other
   * @returns {boolean}
   */
  equals(other) {
    return (
      other instanceof VersionId &&
      other.kind === this.kind &&
      other.id === this.id
    );
  }
}

/**
 * The build profile (PROP-019 §2.2). The Electron packager does not have a
 * debug/release split — `release` is the only meaningful profile for a
 * packaged app — but the model carries it so an install record round-trips
 * through the same shape as the host.
 *
 * @typedef {'debug' | 'release'} Profile
 */

/** @type {Readonly<Record<string, Profile>>} */
export const PROFILE = Object.freeze({
  DEBUG: 'debug',
  RELEASE: 'release',
});

const PROFILE_TOKENS = new Set(['debug', 'release']);

/**
 * Parse a profile token.
 *
 * @param {string} s
 * @returns {Profile}
 * @throws {Error} on an unknown profile
 */
export function profileParse(s) {
  if (PROFILE_TOKENS.has(s)) {
    return /** @type {Profile} */ (s);
  }
  throw new ModelError(
    `unknown build profile \`${s}\` ` +
      `(violates spec://term-common/PROP-vvm#build; ` +
      `fix: pass \`debug\` or \`release\`)`,
  );
}

/**
 * Where an installed instance's distribution came from (PROP-019 §2.16).
 *
 * For products, `External` is the common case — a committer's own checkout
 * referenced by `source_path`; the instance is never touched by the
 * version-manager. `Managed` (a VVM-owned clone) is supported for parity
 * but rarely used by products today; `Binary` is the far-backlog
 * prebuilt-artifact origin.
 *
 * @typedef {'managed' | 'external' | 'binary'} Origin
 */

/** @type {Readonly<Record<string, Origin>>} */
export const ORIGIN = Object.freeze({
  MANAGED: 'managed',
  EXTERNAL: 'external',
  BINARY: 'binary',
});

/**
 * A parsed user version request, before git resolution (PROP-019 §2.3).
 * One of:
 *  - `{ tag: 'latest' }` — the tip of branch `main`.
 *  - `{ tag: 'stable' }` — the highest semantic-version release tag.
 *  - `{ tag: 'explicit', id: VersionId }` — a forced kind+id.
 *  - `{ tag: 'ambiguous', name: string }` — a bare name, resolved later by
 *    precedence branch > tag > commit.
 *
 * @typedef {{ tag: 'latest' } | { tag: 'stable' } | { tag: 'explicit', id: VersionId } | { tag: 'ambiguous', name: string }} Selector
 */

const COMMIT_RE = /^[0-9a-fA-F]{7,40}$/;

/**
 * Parse a CLI selector plus an optional forced kind (PROP-019 §2.3).
 *
 * @param {string} raw
 * @param {Kind | null} [forced]
 * @returns {Selector}
 * @throws {ModelError} on an empty selector
 */
export function selectorParse(raw, forced = null) {
  const s = raw.trim();
  if (s === '') {
    throw new ModelError(
      'empty version selector ' +
        '(violates spec://term-common/PROP-vvm#selectors; ' +
        'fix: pass a selector like `latest`, `stable`, `1.2.3`, or `tag:1.2.3`)',
    );
  }
  if (forced) {
    return { tag: 'explicit', id: VersionId.new(forced, s) };
  }
  const colon = s.indexOf(':');
  if (colon > 0) {
    const k = kindFromToken(s.slice(0, colon));
    const rest = s.slice(colon + 1);
    if (k && rest !== '') {
      return { tag: 'explicit', id: VersionId.new(k, rest) };
    }
  }
  if (s === 'latest') return { tag: 'latest' };
  if (s === 'stable') return { tag: 'stable' };
  if (COMMIT_RE.test(s)) {
    return { tag: 'explicit', id: VersionId.new(KIND.COMMIT, s.toLowerCase()) };
  }
  if (looksLikeSemverTag(s)) {
    return { tag: 'explicit', id: VersionId.new(KIND.TAG, s) };
  }
  return { tag: 'ambiguous', name: s };
}

/**
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeSemverTag(s) {
  const core = s.startsWith('v') ? s.slice(1) : s;
  // A permissive semver shape: MAJOR.MINOR.PATCH with an optional
  // -(pre) or +(build); rejects bare names like `main`.
  return /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(core);
}

/**
 * One installed instance and its metadata (PROP-019 §2.4, §2.7, §2.16).
 * Carried through `state.toml`; the kind/id/instance triple is the on-disk
 * address.
 */
export class InstallRecord {
  /**
   * @param {object} r
   * @param {Kind} r.kind
   * @param {string} r.id
   * @param {number} r.instance  the monotonic instance number (PROP-019 §2.4, §9.4)
   * @param {string} r.commit    the commit the selector resolved to at install time
   * @param {string} r.toolchain the toolchain that built it
   * @param {Profile} r.profile  `debug` or `release`
   * @param {string} r.installedAt  RFC3339 install timestamp
   * @param {Origin} r.origin   where the source came from
   * @param {string | null} [r.sourcePath]  canonical absolute path of the source — only for `external`
   */
  constructor(r) {
    this.kind = r.kind;
    this.id = r.id;
    this.instance = r.instance;
    this.commit = r.commit;
    this.toolchain = r.toolchain;
    this.profile = r.profile;
    this.installedAt = r.installedAt;
    this.origin = r.origin;
    this.sourcePath = r.sourcePath ?? null;
  }

  /** @returns {VersionId} */
  versionId() {
    return VersionId.new(this.kind, this.id);
  }
}

/**
 * The on-disk inventory at `<root>/<product>/state.toml` (PROP-019 §2.4).
 * The *active* instance is named by the separate `current` file, not here.
 */
export class State {
  /**
   * @param {object} [s]
   * @param {number} [s.nextInstance]  the next instance number to allocate
   * @param {InstallRecord[]} [s.installs]
   */
  constructor(s = {}) {
    this.nextInstance = s.nextInstance ?? 0;
    /** @type {InstallRecord[]} */
    this.installs = s.installs ?? [];
  }
}

/**
 * The version-model layer's parse failures (PROP-019 §2.3, §2.2). The two
 * untrusted boundaries where a user-supplied string becomes a typed value.
 */
export class ModelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelError';
  }
}
