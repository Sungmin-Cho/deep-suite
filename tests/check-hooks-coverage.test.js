import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHooksCoverage, evaluatePlugin, eventsFromHooksDoc, hookSourcesFromManifest } from '../scripts/check-hooks-coverage.js';

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

test('manifest hooks normalize file paths, inline docs, arrays, and reject unsafe paths', () => {
  assert.deepEqual(hookSourcesFromManifest({}), [{ kind: 'file', path: 'hooks/hooks.json' }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: './hooks/hooks.claude.json' }), [{ kind: 'file', path: 'hooks/hooks.json' }, { kind: 'file', path: 'hooks/hooks.claude.json' }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: './hooks/hooks.json' }), [{ kind: 'file', path: 'hooks/hooks.json' }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: ['./x.json', { hooks: { SessionStart: [] } }] }), [{ kind: 'file', path: 'hooks/hooks.json' }, { kind: 'file', path: 'x.json' }, { kind: 'inline', doc: { hooks: { SessionStart: [] } } }]);
  assert.deepEqual(hookSourcesFromManifest({ hooks: { hooks: { SessionEnd: [] } } }).at(-1), { kind: 'inline', doc: { hooks: { SessionEnd: [] } } });
  for (const value of ['../x.json', '/abs.json', 7]) assert.throws(() => hookSourcesFromManifest({ hooks: value }), new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('hooks docs expose events and modules and reject non-object hooks', () => {
  assert.deepEqual(eventsFromHooksDoc({}), { events: [], hasModules: false });
  assert.throws(() => eventsFromHooksDoc({ hooks: [] }), /plain object/);
  assert.deepEqual(eventsFromHooksDoc({ modules: [] }), { events: [], hasModules: true });
});

test('modules are noted and do not fail coverage', () => {
  const result = evaluatePlugin({ plugin: 'sample', entry: { hooks_active: [] , hooks_intentionally_empty_reason: 'intentional' }, events: [], modulesIn: ['hooks/hooks.json'] });
  assert.deepEqual(result.errors, []);
  assert.match(result.notes.join('\n'), /hooks\/hooks\.json/);
});

test('hook files and manifest hook file events are unioned', () => {
  const result = checkHooksCoverage({ sidecar: { plugins: { sample: { hooks_active: ['SessionEnd', 'SessionStart'] } } }, plugins: [{ plugin: 'sample', sha: '1234567890' }], readFile: (_info, path) => path === '.claude-plugin/plugin.json' ? JSON.stringify({ hooks: 'extra.json' }) : path === 'hooks/hooks.json' ? JSON.stringify({ hooks: { SessionStart: [] } }) : path === 'extra.json' ? JSON.stringify({ hooks: { SessionEnd: [] } }) : null });
  assert.deepEqual(result.errors, []);
  assert.equal(result.checked.files, 2);
});

test('invalid hooks JSON names plugin and path', () => {
  const result = checkHooksCoverage({ sidecar: { plugins: { sample: { hooks_active: [], hooks_intentionally_empty_reason: 'intentional' } } }, plugins: [{ plugin: 'sample', sha: '1234567890' }], readFile: (_info, path) => path === '.claude-plugin/plugin.json' ? '{}' : path === 'hooks/hooks.json' ? '{' : null });
  assert.match(result.errors.join('\n'), /sample.*hooks\/hooks\.json/);
});

test('sidecar keys absent from marketplace are errors', () => {
  const result = checkHooksCoverage({ sidecar: { plugins: { outsider: { hooks_active: [] } } }, plugins: [], readFile: () => null });
  assert.match(result.errors.join('\n'), /outsider.*not in marketplace/);
});

function run(args = []) {
  return spawnSync('node', [resolve(root, 'scripts/check-hooks-coverage.js'), ...args], { cwd: root, encoding: 'utf8', timeout: 120_000 });
}

test('CLI rejects arguments', () => {
  const result = run(['extra']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /takes no arguments/);
});

test('CLI verifies committed repository using populated fetch cache', { timeout: 120_000 }, () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /hooks coverage verified \(10 plugins/);
});
