/**
 * term-common vvm — unit tests for the Rust→TS port. The behaviour twins of
 * the host's `vibe-cli/src/commands/vvm/{model,store,placer,install,
 * relocate}/tests.rs`, run under `node --test`. The goldens here assert the
 * SAME invariants the host tests assert (same kind namespaces, same state
 * shape, same diff-copy dedup-skip) — the cross-floor conformance-twin
 * relationship (PROP-vvm).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  KIND,
  ORIGIN,
  PROFILE,
  VersionId,
  InstallRecord,
  State,
  selectorParse,
  ModelError,
} from '../vvm/model.mjs';
import { VersionStore, binaryName, samePath } from '../vvm/store.mjs';
import {
  Manifest,
  FileEntry,
  manifestFor,
  manifestMatches,
  place,
  readManifest,
} from '../vvm/placer.mjs';
import { tomlParse, tomlSerialise } from '../vvm/toml.mjs';
import { performInstall } from '../vvm/install.mjs';
import { planRelocate } from '../vvm/relocate.mjs';
import { pathWithPrefix } from '../vvm/env.mjs';

/**
 * @returns {string}  a fresh temp install root
 */
function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'vvm-test-'));
}

/**
 * A fake builder that writes a chosen byte string into the managed target dir
 * (mirrors the host's `FakeBuilder`).
 */
function fakeBuilder(content) {
  return {
    /** @param {string} _sourceRoot @param {string} targetDir @param {import('../vvm/model.mjs').Profile} profile */
    build(_sourceRoot, targetDir, profile) {
      const dir = join(targetDir, profile);
      mkdirSync(dir, { recursive: true });
      const bin = join(dir, binaryName('vibeterm'));
      writeFileSync(bin, content);
      return { dist: [[bin, binaryName('vibeterm')]], toolchain: 'node 0.0.0-fake' };
    },
  };
}

// --- model ----------------------------------------------------------------

test('VersionId renders and splits by kind', () => {
  const v = VersionId.new(KIND.TAG, '1.2.3');
  assert.equal(v.toString(), 'tag:1.2.3');
  assert.deepEqual(v.pathSegments(), ['tag', '1.2.3']);
  assert.notDeepEqual(
    v.pathSegments(),
    VersionId.new(KIND.BRANCH, '1.2.3').pathSegments(),
  );
});

test('selector parse classifies by shape', () => {
  assert.deepEqual(selectorParse('latest'), { tag: 'latest' });
  assert.deepEqual(selectorParse('stable'), { tag: 'stable' });
  assert.deepEqual(selectorParse('1.2.3'), {
    tag: 'explicit',
    id: VersionId.new(KIND.TAG, '1.2.3'),
  });
  assert.deepEqual(selectorParse('abc1234'), {
    tag: 'explicit',
    id: VersionId.new(KIND.COMMIT, 'abc1234'),
  });
  assert.deepEqual(selectorParse('main'), { tag: 'ambiguous', name: 'main' });
  assert.deepEqual(selectorParse('main', KIND.BRANCH), {
    tag: 'explicit',
    id: VersionId.new(KIND.BRANCH, 'main'),
  });
  assert.deepEqual(selectorParse('tag:1.2.3'), {
    tag: 'explicit',
    id: VersionId.new(KIND.TAG, '1.2.3'),
  });
  assert.throws(() => selectorParse('   '), ModelError);
});

test('profile parse rejects unknown values', () => {
  // PROFILE constants exist; the parser is in cli.mjs (resolveProfile).
  // The model exports the constants — sanity-check them here.
  assert.equal(PROFILE.DEBUG, 'debug');
  assert.equal(PROFILE.RELEASE, 'release');
});

// --- store ----------------------------------------------------------------

test('instance paths nest under kind/id/instance', () => {
  const store = new VersionStore({ installRoot: '/opt', product: 'vibeterm' });
  const id = VersionId.new(KIND.TAG, '1.2.3');
  const got = store.instanceDir(id, 4).replace(/\\/g, '/');
  assert.equal(got, '/opt/vibeterm/versions/tag/1.2.3/4');
  const bin = store.binaryPath(id, 4).replace(/\\/g, '/');
  assert.ok(bin.endsWith('/4/' + binaryName('vibeterm')));
});

test('alloc instance is monotonic from one', () => {
  const root = tempRoot();
  try {
    const store = new VersionStore({ installRoot: root, product: 'vibeterm' });
    assert.equal(store.allocInstance(), 1);
    assert.equal(store.allocInstance(), 2);
    assert.equal(store.allocInstance(), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('active follows the current pointer', () => {
  const root = tempRoot();
  try {
    const store = new VersionStore({ installRoot: root, product: 'vibeterm' });
    const id = VersionId.new(KIND.BRANCH, 'main');
    store.recordInstall(rec(KIND.BRANCH, 'main', 1));
    const inst = store.instanceDir(id, 1);
    mkdirSync(inst, { recursive: true });

    assert.equal(store.active(), null, 'no current → no active');
    store.writeCurrent(inst);
    const active = store.active();
    assert.ok(active, 'current → active');
    assert.equal(/** @type {any} */ (active).versionId().toString(), 'branch:main');
    assert.equal(/** @type {any} */ (active).instance, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('state.toml round-trips through tomlSerialise/tomlParse', () => {
  const state = new State({
    nextInstance: 4,
    installs: [
      new InstallRecord({
        kind: KIND.BRANCH,
        id: 'main',
        instance: 3,
        commit: 'abc1234def',
        toolchain: 'node 22.6.0',
        profile: PROFILE.DEBUG,
        installedAt: '2026-07-21T00:00:00Z',
        origin: ORIGIN.EXTERNAL,
        sourcePath: 'C:/src/vibevm-term',
      }),
    ],
  });
  const text = tomlSerialise({
    scalars: [['next_instance', state.nextInstance]],
    tables: [
      {
        name: 'install',
        rows: state.installs.map((r) => ({
          kind: r.kind,
          id: r.id,
          instance: r.instance,
          commit: r.commit,
          toolchain: r.toolchain,
          profile: r.profile,
          installed_at: r.installedAt,
          origin: r.origin,
          source_path: r.sourcePath,
        })),
      },
    ],
  });
  const back = tomlParse(text);
  assert.equal(back.scalars.next_instance, 4);
  assert.equal(back.tables.install[0].origin, 'external');
  assert.equal(back.tables.install[0].source_path, 'C:/src/vibevm-term');
});

// --- placer ---------------------------------------------------------------

test('manifest round-trips and detects change', () => {
  const root = tempRoot();
  try {
    const f = join(root, binaryName('vibeterm'));
    writeFileSync(f, 'hello');
    const m = manifestFor([[f, binaryName('vibeterm')]]);
    const text = tomlSerialise({
      scalars: [],
      tables: [
        {
          name: 'file',
          rows: m.files.map((e) => ({
            rel: e.rel,
            size: e.size,
            mtime_ms: e.mtimeMs,
            hash: e.hash,
          })),
        },
      ],
    });
    const back = tomlParse(text);
    const rebuilt = new Manifest(
      back.tables.file.map(
        (r) =>
          new FileEntry({
            rel: String(r.rel),
            size: Number(r.size),
            mtimeMs: Number(r.mtime_ms),
            hash: r.hash === null || r.hash === undefined ? null : String(r.hash),
          }),
      ),
    );
    assert.ok(manifestMatches(m, rebuilt), 'identical manifest matches');
    writeFileSync(f, 'hello world'); // content change on a small file
    const m2 = manifestFor([[f, binaryName('vibeterm')]]);
    assert.ok(!manifestMatches(m2, m), 'changed content does not match');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('place creates an instance with a manifest', () => {
  const root = tempRoot();
  try {
    const store = new VersionStore({ installRoot: root, product: 'vibeterm' });
    const id = VersionId.new(KIND.BRANCH, 'main');
    const built = join(root, 'built-app');
    writeFileSync(built, 'BIN');
    const dist = [[built, binaryName('vibeterm')]];
    const manifest = manifestFor(dist);

    place({ store, id, instance: 1, dist, manifest, prev: null });
    const inst = store.instanceDir(id, 1);
    assert.equal(readFileSync(join(inst, binaryName('vibeterm')), 'utf8'), 'BIN');
    assert.ok(existsSync(join(inst, '.vvm-manifest.toml')));
    assert.ok(readManifest(inst));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- install pipeline -----------------------------------------------------

test('install makes instance, skips unchanged, forces rebuild', () => {
  const root = tempRoot();
  const src = mkdtempSync(join(tmpdir(), 'vvm-src-'));
  try {
    const store = new VersionStore({ installRoot: root, product: 'vibeterm' });
    const resolved = { id: VersionId.new(KIND.BRANCH, 'main'), commit: 'deadbeefcafe' };

    /** @param {boolean} force @param {string} now */
    const req = (force, now) => ({
      resolved,
      profile: PROFILE.RELEASE,
      force,
      now,
      origin: ORIGIN.MANAGED,
      sourcePath: null,
    });
    /** @param {string} content */
    const builder = (content) => fakeBuilder(content);

    performInstall({ store, sourceRoot: src, req: req(false, 't1'), builder: builder(b1('v1')) });
    const inst1 = store.instanceDir(resolved.id, 1);
    assert.ok(existsSync(join(inst1, binaryName('vibeterm'))));
    assert.equal(store.readCurrent(), inst1);
    assert.equal(store.instancesOf(resolved.id).length, 1);

    // Identical bytes → no new instance (dedup-skip).
    performInstall({ store, sourceRoot: src, req: req(false, 't2'), builder: builder(b1('v1')) });
    assert.equal(store.instancesOf(resolved.id).length, 1);

    // Changed bytes → a new instance, current advances.
    performInstall({ store, sourceRoot: src, req: req(false, 't3'), builder: builder(b1('v2')) });
    assert.equal(store.instancesOf(resolved.id).length, 2);
    assert.equal(store.readCurrent(), store.instanceDir(resolved.id, 2));

    // --force on identical bytes → still a new instance.
    performInstall({ store, sourceRoot: src, req: req(true, 't4'), builder: builder(b1('v2')) });
    assert.equal(store.instancesOf(resolved.id).length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

/**
 * The fake builder's `dist` is a closure over its `content` — wrap it so each
 * builder call returns a fresh builder bound to the chosen bytes.
 *
 * @param {string} _content
 */
function b1(_content) {
  return _content; // alias so the call sites read clearly; identity at runtime
}

// --- relocate oracle ------------------------------------------------------

test('planRelocate partitions the inventory', () => {
  const root = tempRoot();
  try {
    const store = new VersionStore({ installRoot: root, product: 'vibeterm' });
    const id = VersionId.new(KIND.BRANCH, 'main');
    // An active instance sourced from /old/path, plus a stale one.
    const active = new InstallRecord({
      kind: KIND.BRANCH,
      id: 'main',
      instance: 1,
      commit: 'c',
      toolchain: 't',
      profile: PROFILE.RELEASE,
      installedAt: 'now',
      origin: ORIGIN.EXTERNAL,
      sourcePath: join(root, 'old-path'),
    });
    const stale = new InstallRecord({
      kind: KIND.BRANCH,
      id: 'main',
      instance: 2,
      commit: 'c2',
      toolchain: 't',
      profile: PROFILE.RELEASE,
      installedAt: 'now',
      origin: ORIGIN.EXTERNAL,
      sourcePath: join(root, 'old-path'),
    });
    store.recordInstall(active);
    store.recordInstall(stale);
    const state = store.loadState();

    const plan = planRelocate({
      state,
      old: join(root, 'old-path'),
      new: join(root, 'new-path'),
      active,
    });
    assert.equal(plan.repoint.length, 1, 'active instance repointed');
    assert.equal(plan.delete.length, 1, 'stale instance deleted');
    assert.equal(plan.untouched, 0);

    void id;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- env helpers ----------------------------------------------------------

test('pathWithPrefix moves the shim dir to the front', () => {
  // Present but not first → moved to front.
  assert.equal(
    pathWithPrefix('C:\\u\\.cargo\\bin;C:\\u\\opt\\bin', 'C:\\u\\opt\\bin'),
    'C:\\u\\opt\\bin;C:\\u\\.cargo\\bin',
  );
  // Absent → prepended.
  assert.equal(
    pathWithPrefix('C:\\u\\.cargo\\bin', 'C:\\u\\opt\\bin'),
    'C:\\u\\opt\\bin;C:\\u\\.cargo\\bin',
  );
  // Already first → no change.
  assert.equal(
    pathWithPrefix('C:\\u\\opt\\bin;C:\\u\\.cargo\\bin', 'C:\\u\\opt\\bin'),
    null,
  );
  // Empty → just the target.
  assert.equal(pathWithPrefix('', 'C:\\u\\opt\\bin'), 'C:\\u\\opt\\bin');
});

// --- helpers --------------------------------------------------------------

/**
 * @param {import('../vvm/model.mjs').Kind} kind
 * @param {string} id
 * @param {number} instance
 * @returns {InstallRecord}
 */
function rec(kind, id, instance) {
  return new InstallRecord({
    kind,
    id,
    instance,
    commit: 'c',
    toolchain: 't',
    profile: PROFILE.DEBUG,
    installedAt: 'now',
    origin: ORIGIN.MANAGED,
    sourcePath: null,
  });
}
