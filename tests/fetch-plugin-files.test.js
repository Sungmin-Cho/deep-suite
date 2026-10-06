import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { FetchError, fetchPluginFile, isPathNotFound } from '../scripts/lib/fetch-plugin-files.js';

const info = { plugin: 'zz-fetch-test', owner: 'o', repo: 'r', sha: 'f'.repeat(40), path: 'README.md' };

function withFakeGh(t, stdout, stderr, status) {
  const root = mkdtempSync(join(tmpdir(), 'fetch-plugin-files-'));
  const bin = join(root, 'bin');
  const cache = join(root, 'cache');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nprintf '%s' '${stdout}'\nprintf '%s' '${stderr}' >&2\nexit ${status}\n`, { mode: 0o755 });
  const oldPath = process.env.PATH;
  const oldCache = process.env.DEEP_SUITE_CACHE_DIR;
  process.env.PATH = bin;
  process.env.DEEP_SUITE_CACHE_DIR = cache;
  t.after(() => {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldCache === undefined) delete process.env.DEEP_SUITE_CACHE_DIR; else process.env.DEEP_SUITE_CACHE_DIR = oldCache;
    rmSync(root, { recursive: true, force: true });
  });
  return { root, bin, cache };
}

test('404 is classified with PATH_NOT_FOUND', (t) => {
  const { cache } = withFakeGh(t, '', 'gh: Not Found (HTTP 404)\n', 1);
  assert.throws(() => fetchPluginFile(info), (err) => isPathNotFound(err) && err.code === 'PATH_NOT_FOUND');
  assert.equal(existsSync(join(cache, `zz-fetch-test-${info.sha}`)), false, 'a 404 must not be cached');
});

test('missing gh is not a path 404', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'fetch-plugin-files-nogh-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const oldPath = process.env.PATH;
  const oldCache = process.env.DEEP_SUITE_CACHE_DIR;
  process.env.PATH = bin;
  process.env.DEEP_SUITE_CACHE_DIR = join(root, 'cache');
  t.after(() => {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldCache === undefined) delete process.env.DEEP_SUITE_CACHE_DIR; else process.env.DEEP_SUITE_CACHE_DIR = oldCache;
    rmSync(root, { recursive: true, force: true });
  });
  assert.throws(() => fetchPluginFile(info), (err) => err instanceof FetchError && /gh CLI not found/.test(err.message) && !isPathNotFound(err));
});

test('network failure is not a path 404', (t) => {
  withFakeGh(t, '', 'error connecting to api.github.com\n', 1);
  assert.throws(() => fetchPluginFile(info), (err) => !isPathNotFound(err));
});

test('rate limit is not a path 404', (t) => {
  withFakeGh(t, '', 'HTTP 403: API rate limit exceeded\n', 1);
  assert.throws(() => fetchPluginFile(info), (err) => !isPathNotFound(err));
});

test('predicate requires a coded FetchError', () => {
  assert.equal(isPathNotFound(new Error('path not found at x')), false);
  assert.equal(isPathNotFound(new FetchError('x', { code: 'PATH_NOT_FOUND' })), true);
});

test('successful fetch uses the overridden cache root', (t) => {
  const { cache } = withFakeGh(t, '{"type":"file","encoding":"base64","content":"aGVsbG8="}', '', 0);
  assert.equal(fetchPluginFile(info), 'hello');
  const cached = join(cache, `zz-fetch-test-${info.sha}`, 'README.md');
  assert.equal(readFileSync(cached, 'utf8'), 'hello');
  assert.equal(existsSync(join(fileURLToPath(new URL('..', import.meta.url)), '.deep-suite-cache', `zz-fetch-test-${info.sha}`)), false);
});
