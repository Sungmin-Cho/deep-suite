// Spawn-based smoke tests for the M2 sync checkers.
// These run against the real repo state, expecting all checks green.
// Drift cases use M2_TEST_FIXTURES_DIR to inject mismatched plugin.json data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const DEFAULT_CHECKER_TIMEOUT_MS = 30_000;
const COLD_CACHE_CHECKER_TIMEOUT_MS = 120_000;
const COLD_CACHE_CHECKERS = new Set([
  'check-pinned-plugin-paths.js',
  'check-memory-hierarchy.js',
]);

function timeoutFor(script) {
  return COLD_CACHE_CHECKERS.has(script)
    ? COLD_CACHE_CHECKER_TIMEOUT_MS
    : DEFAULT_CHECKER_TIMEOUT_MS;
}

function run(script, args = [], env = {}) {
  return spawnSync('node', [resolve(repoRoot, `scripts/${script}`), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: timeoutFor(script),
  });
}

const fixtureDir = resolve(repoRoot, 'tests/fixtures/plugin-cache');

test('cold-cache network checkers outlive one 30-second GitHub request budget', () => {
  const expectedColdCacheCheckers = [
    'check-memory-hierarchy.js',
    'check-pinned-plugin-paths.js',
  ];
  assert.deepEqual([...COLD_CACHE_CHECKERS].sort(), expectedColdCacheCheckers);
  for (const script of expectedColdCacheCheckers) {
    assert.equal(timeoutFor(script), 120_000, script);
  }
  assert.equal(timeoutFor('check-readme-plugin-table.js'), 30_000);
});

// --- check-readme-plugin-table.js ---

test('check-readme-plugin-table.js exits 0 on clean repo', () => {
  const res = run('check-readme-plugin-table.js');
  assert.equal(res.status, 0, res.stderr);
});

test('check-readme-plugin-table.js exits 2 with arguments', () => {
  const res = run('check-readme-plugin-table.js', ['extra']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /takes no arguments/);
});

// --- check-agents-md-paths.js ---

test('check-agents-md-paths.js exits 0 against committed AGENTS.md', () => {
  const res = run('check-agents-md-paths.js');
  assert.equal(res.status, 0, res.stderr);
});

// Closes review C1: the prior soft-skip predicate accepted any non-tracked
// path, so a typo in §Project Structure exited 0 silently. The hardened
// predicate fails on missing-and-not-gitignored paths.
test('check-agents-md-paths.js exits 1 when AGENTS.md references a missing non-gitignored path (regression for C1)', () => {
  const res = run('check-agents-md-paths.js', [], {
    M2_TEST_AGENTS_MD: resolve(repoRoot, 'tests/fixtures/regression/AGENTS-with-bogus-path.md'),
  });
  assert.equal(res.status, 1, `expected drift; stderr: ${res.stderr}`);
  assert.match(res.stderr, /nonexistent-typo-file\.md/);
  // The drift label names the file actually read. A checker repointed back at
  // CLAUDE.md would still find the fixture via the override but mislabel it.
  assert.match(res.stderr, /^✗ AGENTS\.md:\d+ —/m);
});

// §Project Structure moved CLAUDE.md → AGENTS.md when AGENTS.md became the
// single agent-instruction source. CLAUDE.md is now an `@AGENTS.md` stub; if it
// ever regrows a §Project Structure block, that is a second source of truth the
// checker does not read. Pin the split from the CLAUDE.md side.
test('CLAUDE.md stub carries no §Project Structure block (it lives in AGENTS.md)', () => {
  const res = run('check-agents-md-paths.js', [], {
    M2_TEST_AGENTS_MD: resolve(repoRoot, 'CLAUDE.md'),
  });
  assert.equal(res.status, 2, `expected IO/usage; stderr: ${res.stderr}`);
  assert.match(res.stderr, /AGENTS\.md has no "## Project Structure" fenced block/);
});

// --- check-guide-version.js ---

test('check-guide-version.js exits 0 against committed guides', () => {
  const res = run('check-guide-version.js');
  assert.equal(res.status, 0, res.stderr);
});

test('check-guide-version.js exits 1 when fixture plugin.json says version=99.99.99', () => {
  const res = run('check-guide-version.js', [], { M2_TEST_FIXTURES_DIR: fixtureDir });
  assert.equal(res.status, 1, `stderr: ${res.stderr}`);
  assert.match(res.stderr, /expected v99\.99\.99/);
});

// --- check-semver-sha-sync.js ---

test('check-semver-sha-sync.js exits 0 against committed marker tables', () => {
  const res = run('check-semver-sha-sync.js');
  assert.equal(res.status, 0, res.stderr);
});

test('check-semver-sha-sync.js exits 1 when fixture plugin.json says version=99.99.99', () => {
  const res = run('check-semver-sha-sync.js', [], { M2_TEST_FIXTURES_DIR: fixtureDir });
  assert.equal(res.status, 1, `stderr: ${res.stderr}`);
  assert.match(res.stderr, /expected v99\.99\.99/);
});

// --- check-pinned-plugin-paths.js ---

test('check-pinned-plugin-paths.js exits 0 against committed sidecar', () => {
  // Uses real cache — depends on .deep-suite-cache being populated locally OR
  // gh CLI being available. CI populates via gh; local dev relies on cache.
  const res = run('check-pinned-plugin-paths.js');
  assert.equal(res.status, 0, res.error?.message ?? res.stderr);
});

// --- check-memory-hierarchy.js ---

test('check-memory-hierarchy.js exits 0 against committed plugin docs', () => {
  const res = run('check-memory-hierarchy.js');
  assert.equal(res.status, 0, res.error?.message ?? res.stderr);
});

// --- check-plugin-count.js ---

test('check-plugin-count.js exits 0 on clean repo (subsets self-consistent)', () => {
  const res = run('check-plugin-count.js');
  assert.equal(res.status, 0, res.stderr);
  // The clean run validates the integrated-workflow curated subset (7) and the
  // README starter remainder (marketplace total - 3).
  assert.match(res.stdout, /subsets self-consistent/);
});

test('check-plugin-count.js exits 2 with arguments', () => {
  const res = run('check-plugin-count.js', ['extra']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /takes no arguments/);
});

test('check-plugin-count.js recognizes the word ten in TOTAL probes', () => {
  const src = readFileSync(resolve(repoRoot, 'scripts/check-plugin-count.js'), 'utf8');
  assert.match(src, /ten:\s*10/);
  assert.match(src, /WORD_ALT/);
});

test('check-plugin-count.js exits 1 when marketplace description says "eight"', () => {
  const res = run('check-plugin-count.js', [], {
    M2_TEST_PLUGIN_COUNT_DIR: resolve(repoRoot, 'tests/fixtures/regression/plugin-count'),
  });
  assert.equal(res.status, 1, `expected drift; stderr: ${res.stderr}`);
  assert.match(res.stderr, /marketplace metadata\.description/);
  assert.match(res.stderr, /count "eight" != expected 10/);
});

test('check-plugin-count.js exits 1 when the README starter remainder is stale', () => {
  const overrideDir = mkdtempSync(resolve(tmpdir(), 'deep-suite-plugin-count-'));
  try {
    const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')
      .replace('remaining seven plugins', 'remaining six plugins');
    writeFileSync(resolve(overrideDir, 'README.md'), readme);
    const res = run('check-plugin-count.js', [], { M2_TEST_PLUGIN_COUNT_DIR: overrideDir });
    assert.equal(res.status, 1, `expected drift; stderr: ${res.stderr}`);
    assert.match(res.stderr, /README\.md starter remainder/);
    assert.match(res.stderr, /count "six" != expected 7/);
  } finally {
    rmSync(overrideDir, { recursive: true, force: true });
  }
});

// --- check-fixture-provenance.js ---

test('check-fixture-provenance.js exits 0 against committed real-emit fixtures', () => {
  const res = run('check-fixture-provenance.js');
  assert.equal(res.status, 0, res.stderr);
});

test('check-fixture-provenance.js exits 2 with arguments', () => {
  const res = run('check-fixture-provenance.js', ['extra']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /takes no arguments/);
});

test('check-fixture-provenance.js exits 1 on captured_at_sha ↔ pin mismatch (with remediation)', () => {
  const res = run('check-fixture-provenance.js', [], {
    M2_TEST_PROVENANCE_FIXTURE_DIR: resolve(repoRoot, 'tests/fixtures/regression/provenance-badsha'),
  });
  assert.equal(res.status, 1, `expected drift; stderr: ${res.stderr}`);
  assert.match(res.stderr, /captured_at_sha .* != marketplace pin/);
  assert.match(res.stderr, /git show .*:skills\/deep-finish\/SKILL\.md/);
});

test('check-fixture-provenance.js exits 1 when a real-emit fixture is missing x-provenance', () => {
  const res = run('check-fixture-provenance.js', [], {
    M2_TEST_PROVENANCE_FIXTURE_DIR: resolve(repoRoot, 'tests/fixtures/regression/provenance-missing'),
  });
  assert.equal(res.status, 1, `expected drift; stderr: ${res.stderr}`);
  assert.match(res.stderr, /real-emit fixture missing root x-provenance/);
});
