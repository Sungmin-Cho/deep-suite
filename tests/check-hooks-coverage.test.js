import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHooksCoverage, evaluatePlugin, eventsFromHooksDoc, eventsFromInlineHooks, hookSourcesFromManifest } from '../scripts/check-hooks-coverage.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/hooks-coverage/pinned-2026-10-06.json'), 'utf8'));
const pluginInfos = Object.entries(fixture.plugins).map(([plugin, item]) => ({ plugin, sha: item.sha, owner: 'test', repo: plugin }));
function check(which = 'sidecar_after', overrides = {}) {
  const sidecar = { plugins: Object.fromEntries(Object.entries(fixture.plugins).map(([plugin, item]) => [plugin, item[which]])) };
  const plugins = overrides.plugins ?? pluginInfos;
  return checkHooksCoverage({ sidecar, plugins, readFile: overrides.readFile ?? ((info, path) => {
    const item = fixture.plugins[info.plugin];
    if (path === '.claude-plugin/plugin.json') return JSON.stringify(item.manifest);
    return Object.hasOwn(item.files, path) ? JSON.stringify(item.files[path]) : null;
  }) });
}

// One synthetic plugin served from an in-memory file map; absent paths are 404s.
function checkOne(sidecarEntry, filesByPath) {
  return checkHooksCoverage({
    sidecar: { plugins: { sample: sidecarEntry } },
    plugins: [{ plugin: 'sample', sha: '1234567890' }],
    readFile: (_info, path) => (Object.hasOwn(filesByPath, path) ? filesByPath[path] : null),
  });
}

test('frozen pre-fix sidecar has only router drift', () => {
  const result = check('sidecar_before');
  const affected = new Set(result.errors.map((error) => error.match(/^([^.]*)\./)?.[1]).filter(Boolean));
  assert.deepEqual([...affected], ['deep-model-router']);
  assert.match(result.errors.join('\n'), /SessionStart/);
});

test('frozen fixed sidecar covers all ten plugins', () => {
  const result = check();
  assert.deepEqual(result.errors, []);
  assert.equal(result.checked.plugins, 10);
});

test('frozen deep-memory events come from the union of its two hooks files', () => {
  // hooks/hooks.json alone lacks PostToolUseFailure and SessionEnd at the pin.
  const memory = fixture.plugins['deep-memory'];
  assert.ok(!Object.hasOwn(memory.files['hooks/hooks.json'].hooks, 'SessionEnd'));
  const result = check('sidecar_after', { plugins: pluginInfos.filter((p) => p.plugin === 'deep-memory') });
  assert.deepEqual(result.errors.filter((e) => !/not in marketplace/.test(e)), []);
});

test('empty hook lists require a non-blank reason even for consumer_only', () => {
  for (const entry of [{ hooks_active: [] }, { hooks_active: [], hooks_intentionally_empty_reason: '  ' }, { hooks_active: [], consumer_only: true }]) {
    assert.match(evaluatePlugin({ plugin: 'sample', entry, events: [], modulesIn: [] }).errors.join('\n'), /hooks_intentionally_empty_reason/);
  }
});

test('non-empty hook list with reason reports stale reason', () => {
  assert.match(evaluatePlugin({ plugin: 'sample', entry: { hooks_active: ['SessionStart'], hooks_intentionally_empty_reason: 'old' }, events: ['SessionStart'], modulesIn: [] }).errors.join('\n'), /stale reason/);
});

test('sidecar-only event is named in drift error', () => {
  assert.match(evaluatePlugin({ plugin: 'sample', entry: { hooks_active: ['FutureEvent'] }, events: [], modulesIn: [] }).errors.join('\n'), /FutureEvent/);
});

test('manifest hooks normalize file paths, inline maps, arrays, and reject unsafe paths', () => {
  assert.deepEqual(hookSourcesFromManifest({}), [{ kind: 'file', path: 'hooks/hooks.json' }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: './hooks/hooks.claude.json' }), [{ kind: 'file', path: 'hooks/hooks.json' }, { kind: 'file', path: 'hooks/hooks.claude.json' }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: './hooks/hooks.json' }), [{ kind: 'file', path: 'hooks/hooks.json' }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: ['./x.json', { SessionStart: [] }] }), [{ kind: 'file', path: 'hooks/hooks.json' }, { kind: 'file', path: 'x.json' }, { kind: 'inline', doc: { SessionStart: [] } }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: { SessionEnd: [] } }).at(-1), { kind: 'inline', doc: { SessionEnd: [] } });
  for (const value of ['../x.json', './a/../../x.json', '/abs.json', '..\\x.json', 'C:/x.json', 7]) {
    assert.throws(() => hookSourcesFromManifest({ hooks: value }), new RegExp(JSON.stringify(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('hooks files expose wrapped events and modules and reject non-object hooks', () => {
  assert.deepEqual(eventsFromHooksDoc({}), { events: [], hasModules: false });
  assert.throws(() => eventsFromHooksDoc({ hooks: [] }), /plain object/);
  assert.deepEqual(eventsFromHooksDoc({ modules: [] }), { events: [], hasModules: true });
});

test('inline manifest hooks are the event map itself', () => {
  assert.deepEqual(eventsFromInlineHooks({ PostToolUse: [], Stop: [] }), { events: ['PostToolUse', 'Stop'], hasModules: false });
  const result = checkOne({ hooks_active: ['PostToolUse', 'SessionStart'] }, {
    '.claude-plugin/plugin.json': JSON.stringify({ hooks: [{ PostToolUse: [] }] }),
    'hooks/hooks.json': JSON.stringify({ hooks: { SessionStart: [] } }),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.checked.files, 2);
});

test('modules are noted and do not fail coverage', () => {
  const result = evaluatePlugin({ plugin: 'sample', entry: { hooks_active: [] , hooks_intentionally_empty_reason: 'intentional' }, events: [], modulesIn: ['hooks/hooks.json'] });
  assert.deepEqual(result.errors, []);
  assert.match(result.notes.join('\n'), /hooks\/hooks\.json/);
});

test('modules in two hooks files are noted as unloadable, still not gated', () => {
  const result = checkOne({ hooks_active: [], hooks_intentionally_empty_reason: 'intentional' }, {
    '.claude-plugin/plugin.json': JSON.stringify({ hooks: './hooks/hooks.claude.json' }),
    'hooks/hooks.json': JSON.stringify({ modules: ['./a.ts'] }),
    'hooks/hooks.claude.json': JSON.stringify({ modules: ['./b.ts'] }),
  });
  assert.deepEqual(result.errors, []);
  assert.match(result.notes.join('\n'), /loads neither/);
});

test('hook files and manifest hook file events are unioned', () => {
  const result = checkOne({ hooks_active: ['SessionEnd', 'SessionStart'] }, {
    '.claude-plugin/plugin.json': JSON.stringify({ hooks: 'extra.json' }),
    'hooks/hooks.json': JSON.stringify({ hooks: { SessionStart: [] } }),
    'extra.json': JSON.stringify({ hooks: { SessionEnd: [] } }),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.checked.files, 2);
});

test('hooks files named by the Codex manifest join the union', () => {
  const files = {
    '.claude-plugin/plugin.json': '{}',
    '.codex-plugin/plugin.json': JSON.stringify({ hooks: './hooks/codex.json' }),
    'hooks/codex.json': JSON.stringify({ hooks: { Stop: [] } }),
  };
  assert.match(checkOne({ hooks_active: [], hooks_intentionally_empty_reason: 'r' }, files).errors.join('\n'), /pinned source has \[Stop\]/);
  assert.deepEqual(checkOne({ hooks_active: ['Stop'] }, files).errors, []);
});

test('a missing Claude manifest is an error, a missing Codex manifest is not', () => {
  const result = checkOne({ hooks_active: [], hooks_intentionally_empty_reason: 'r' }, {});
  assert.match(result.errors.join('\n'), /\.claude-plugin\/plugin\.json — missing at the pin/);
  assert.equal(result.errors.length, 1);
});

test('an invalid manifest hooks value is an error and hooks/hooks.json is still read', () => {
  const result = checkOne({ hooks_active: ['SessionStart'] }, {
    '.claude-plugin/plugin.json': JSON.stringify({ hooks: '../outside.json' }),
    'hooks/hooks.json': JSON.stringify({ hooks: { SessionStart: [] } }),
  });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /invalid hook source path/);
});

test('invalid hooks JSON names plugin and path', () => {
  const result = checkOne({ hooks_active: [], hooks_intentionally_empty_reason: 'intentional' }, {
    '.claude-plugin/plugin.json': '{}',
    'hooks/hooks.json': '{',
  });
  assert.match(result.errors.join('\n'), /sample.*hooks\/hooks\.json/);
});

test('sidecar keys absent from marketplace are errors', () => {
  const result = checkHooksCoverage({ sidecar: { plugins: { outsider: { hooks_active: [] } } }, plugins: [], readFile: () => null });
  assert.match(result.errors.join('\n'), /outsider.*not in marketplace/);
});

test('marketplace plugins absent from the sidecar are errors', () => {
  const result = checkHooksCoverage({ sidecar: { plugins: {} }, plugins: [{ plugin: 'newcomer', sha: '1234567890' }], readFile: (_i, p) => (p === '.claude-plugin/plugin.json' ? '{}' : null) });
  assert.deepEqual(result.errors, ['newcomer.sidecar — no sidecar entry']);
});

test('a non-404 fetch failure aborts the check instead of reading as no hooks', () => {
  const readFile = () => { throw new Error('rate limit'); };
  assert.throws(() => checkHooksCoverage({ sidecar: { plugins: {} }, plugins: [{ plugin: 'sample', sha: '1234567890' }], readFile }), /rate limit/);
});

function run(args = [], env = {}) {
  return spawnSync(process.execPath, [resolve(root, 'scripts/check-hooks-coverage.js'), ...args], { cwd: root, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...env } });
}

test('CLI treats a missing gh CLI as a fetch failure, not as absent hooks files', () => {
  // 404s are never cached, so deep-docs' absent hooks/hooks.json always needs gh.
  // PATH holds only a node symlink: gh often shares node's bin directory.
  const bin = mkdtempSync(join(tmpdir(), 'hooks-coverage-nogh-'));
  try {
    symlinkSync(process.execPath, join(bin, 'node'));
    const result = run([], { PATH: bin });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /gh CLI not found/);
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});

test('CLI rejects arguments', () => {
  const result = run(['extra']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /takes no arguments/);
});

test('CLI exits 1 on drift injected through M2_TEST_FIXTURES_DIR', { timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'hooks-coverage-drift-'));
  try {
    mkdirSync(join(dir, 'deep-docs', 'hooks'), { recursive: true });
    writeFileSync(join(dir, 'deep-docs', 'hooks', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [] } }));
    const result = run([], { M2_TEST_FIXTURES_DIR: dir });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /deep-docs\.hooks_active — pinned source has \[SessionStart\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI verifies committed repository using populated fetch cache', { timeout: 120_000 }, () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /hooks coverage verified \(10 plugins/);
});
