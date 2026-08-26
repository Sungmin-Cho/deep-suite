import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBlock } from '../scripts/lib/markers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
const pluginNames = marketplace.plugins.map((plugin) => plugin.name);

const decisionTargets = [
  ['README.md', 'problem-plugin-table-readme-en'],
  ['README.ko.md', 'problem-plugin-table-readme-ko'],
  ['guides/integrated-workflow-guide.md', 'problem-plugin-table-guide-en'],
  ['guides/integrated-workflow-guide.ko.md', 'problem-plugin-table-guide-ko'],
];

function decisionPluginNames(content, markerId) {
  const block = extractBlock(content, markerId);
  assert.equal(block.ok, true, `${markerId}: ${block.reason ?? 'marker missing'}`);
  return [...block.body.matchAll(/^\| \*\*(deep-[a-z-]+)\*\* \|/gm)].map((match) => match[1]);
}

function wholeSuiteInstallNames(content) {
  const details = content.match(/<summary>[^\n]*(?:whole suite|전체 설치)[^\n]*<\/summary>([\s\S]*?)<\/details>/i);
  assert.ok(details, 'whole-suite install details block must exist');
  return [...details[1].matchAll(/\/plugin install (deep-[a-z-]+)@claude-deep-suite/g)]
    .map((match) => match[1]);
}

test('problem-to-plugin decision tables are generated for all plugins in both READMEs and guides', () => {
  for (const [file, markerId] of decisionTargets) {
    assert.deepEqual(decisionPluginNames(read(file), markerId), pluginNames, file);
  }
});

test('README positioning is AI-agent neutral while distinguishing native and portable surfaces', () => {
  const en = read('README.md');
  const ko = read('README.ko.md');

  assert.match(en, /harness layer for AI (?:coding )?agents/i);
  assert.match(ko, /AI 에이전트[^\n]*하네스 레이어/);
  assert.doesNotMatch(en, /harness layer for Claude Code and Codex/i);
  assert.doesNotMatch(ko, /Claude Code와 Codex 위에서[^\n]*하네스 레이어/);

  for (const runtime of ['Claude Code', 'Codex', 'Grok', 'Copilot CLI', 'Gemini CLI', 'Agent SDK']) {
    assert.match(en, new RegExp(runtime), `README.md must name ${runtime}`);
    assert.match(ko, new RegExp(runtime), `README.ko.md must name ${runtime}`);
  }
  assert.match(en, /native marketplace/i);
  assert.match(en, /portable skill/i);
  assert.match(ko, /네이티브 marketplace/i);
  assert.match(ko, /이식 가능한 skill/i);
});

test('README whole-suite install blocks contain every marketplace plugin exactly once', () => {
  for (const file of ['README.md', 'README.ko.md']) {
    const installed = wholeSuiteInstallNames(read(file));
    assert.equal(new Set(installed).size, installed.length, `${file} contains a duplicate install command`);
    assert.deepEqual(installed.toSorted(), pluginNames.toSorted(), file);
  }
});

test('README starter copy accounts for all seven non-starter plugins', () => {
  const en = read('README.md');
  const ko = read('README.ko.md');
  assert.match(en, /remaining seven plugins[^\n]*model router/i);
  assert.match(ko, /나머지 7개[^\n]*모델 라우팅/);
});

test('deep-loop walkthrough uses real lifecycle entry points and documents durable state', () => {
  const readmePath = resolve(repoRoot, 'examples/deep-loop-lifecycle/README.md');
  const treePath = resolve(repoRoot, 'examples/deep-loop-lifecycle/expected-run-tree.txt');
  assert.equal(existsSync(readmePath), true, 'walkthrough README must exist');
  assert.equal(existsSync(treePath), true, 'expected durable-state tree must exist');

  const index = read('examples/README.md');
  const walkthrough = read('examples/deep-loop-lifecycle/README.md');
  const tree = read('examples/deep-loop-lifecycle/expected-run-tree.txt');

  assert.match(index, /deep-loop-lifecycle/);
  for (const command of [
    '/deep-loop "', '$deep-loop:deep-loop "',
    '/deep-loop-continue', '$deep-loop:deep-loop-continue',
    '/deep-loop-resume', '$deep-loop:deep-loop-resume',
    '/deep-loop-finish', '$deep-loop:deep-loop-finish',
  ]) {
    assert.ok(walkthrough.includes(command), `walkthrough missing ${command}`);
  }
  for (const runtime of ['Grok', 'Copilot CLI', 'Gemini CLI', 'Agent SDK']) {
    assert.match(walkthrough, new RegExp(runtime), `walkthrough must address ${runtime}`);
  }
  for (const skillPath of [
    'skills/deep-loop/SKILL.md',
    'skills/deep-loop-continue/SKILL.md',
    'skills/deep-loop-resume/SKILL.md',
    'skills/deep-loop-finish/SKILL.md',
  ]) {
    assert.ok(walkthrough.includes(skillPath), `walkthrough missing ${skillPath}`);
  }
  assert.match(walkthrough, /\.deep-loop\/runs\/<run-id>\//);
  for (const artifact of ['loop.json', '.loop.hash', 'event-log.jsonl', 'episodes/', 'handoffs/', 'final-report.md']) {
    assert.ok(tree.includes(artifact), `expected-run-tree.txt missing ${artifact}`);
  }
});
