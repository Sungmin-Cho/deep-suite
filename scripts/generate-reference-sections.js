#!/usr/bin/env node
// Regenerate marker-bounded reference sections in suite docs from
// `.claude-plugin/marketplace.json` + `.claude-plugin/suite-extensions.json`
// + each plugin's pinned `plugin.json.version` (cached via gh api).
//
// Modes:
//   --check  → exit 1 if any marker block would change (no writes)
//   --write  → rewrite marker blocks in-place (default if neither given? no — we require explicit flag)
//   --id <id> → operate on one marker only (debug)
//   --verbose → log fetcher cache hits / file work
//
// Exit codes: 0 = up to date / wrote successfully, 1 = drift in --check, 2 = usage / IO / fetch error.
//
// Markers managed by this generator:
//   plugin-table-en       → README.md
//   plugin-table-ko       → README.ko.md
//   plugin-table-agents   → AGENTS.md
//   problem-plugin-table-* → README.md / README.ko.md / integrated guides
//   data-flow-en          → guides/integrated-workflow-guide.md
//   data-flow-ko          → guides/integrated-workflow-guide.ko.md
//   source-pinning        → docs/source-pinning.md (whole file managed)
//   capability-matrix     → docs/capability-matrix.md (whole file managed)
//   artifact-io-graph     → docs/artifact-io-graph.md (whole file managed)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readMarketplace,
  fetchPluginJson,
  FetchError,
} from './lib/fetch-plugin-files.js';
import { startMarker, endMarker, replaceBlock, extractBlock } from './lib/markers.js';
import { PLUGIN_DECISIONS } from './lib/plugin-decisions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ---------- Renderers ----------

function shortDescription(desc) {
  if (!desc) return '';
  // Cut at first sentence boundary; collapse whitespace; escape pipes so the
  // rendered Markdown row stays a 3-column table even if the marketplace
  // description contains `|`. Unescaped `|` shifts cells in the renderer and
  // breaks `rowsFromMarker()` parsing in check-semver-sha-sync.js (review W1).
  const cut = desc.split(/[.—]/)[0].trim();
  return cut.replace(/\s+/g, ' ').replace(/\|/g, '\\|');
}

function renderPluginTable({ plugins, versions, locale, linkify }) {
  const headers = locale === 'ko'
    ? ['플러그인', '버전', '설명']
    : ['Plugin', 'Version', 'Description'];
  const rows = plugins.map((p) => {
    const ver = versions[p.plugin] ?? 'unknown';
    const name = linkify
      ? `[${p.plugin}](https://github.com/${p.owner}/${p.repo})`
      : p.plugin;
    return `| ${name} | ${ver} | ${shortDescription(p.description)} |`;
  });
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows,
  ].join('\n');
}

function renderDataFlow({ dataFlow }) {
  const lines = [
    '```mermaid',
    'flowchart LR',
  ];
  for (const edge of dataFlow) {
    // Mermaid edges: A -- "label" --> B
    const label = edge.via.replace(/"/g, "'");
    lines.push(`  ${edge.from} -- "${label}" --> ${edge.to}`);
  }
  lines.push('```');
  return lines.join('\n');
}

function renderProblemPluginTable({ plugins, locale }) {
  const headers = locale === 'ko'
    ? ['플러그인', '핵심 질문', '언제 쓰나']
    : ['Plugin', 'Core question', 'When to use'];
  const rows = plugins.map((plugin) => {
    const decision = PLUGIN_DECISIONS[plugin.plugin]?.[locale];
    if (!decision) {
      throw new Error(`missing ${locale} problem-routing copy for ${plugin.plugin}`);
    }
    const [question, when] = decision.map((cell) => cell.replace(/\|/g, '\\|'));
    return `| **${plugin.plugin}** | "${question}" | ${when} |`;
  });
  const marketplaceNames = new Set(plugins.map((plugin) => plugin.plugin));
  const extras = Object.keys(PLUGIN_DECISIONS).filter((name) => !marketplaceNames.has(name));
  if (extras.length > 0) {
    throw new Error(`problem-routing copy has unknown plugin(s): ${extras.join(', ')}`);
  }
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows,
  ].join('\n');
}

function renderSourcePinning({ plugins, versions }) {
  const rows = plugins.map((p) => {
    const repo = `[\`${p.owner}/${p.repo}\`](https://github.com/${p.owner}/${p.repo})`;
    const sha = `[\`${p.sha.slice(0, 7)}\`](https://github.com/${p.owner}/${p.repo}/commit/${p.sha})`;
    const ver = versions[p.plugin] ?? 'unknown';
    return `| ${p.plugin} | ${ver} | ${repo} | ${sha} |`;
  });
  return [
    '# Suite Source Pinning',
    '',
    '**Auto-generated** by `scripts/generate-reference-sections.js`. Do not hand-edit.',
    '',
    'Each plugin is fetched from the SHA below at install time. M2 CI re-checks daily and on every PR that touches `.claude-plugin/` or `.agents/plugins/`.',
    '',
    '| Plugin | Pinned Version | Repo | Pinned SHA |',
    '|---|---|---|---|',
    ...rows,
    '',
    '> Version reflects `plugin.json.version` at the pinned SHA. Click the SHA to see the upstream commit details.',
  ].join('\n');
}

function renderCapabilityMatrix({ plugins, sidecar }) {
  // Collect global capability set, then mark per-plugin coverage.
  const allCaps = new Set();
  for (const entry of Object.values(sidecar.plugins ?? {})) {
    for (const c of entry.capabilities ?? []) allCaps.add(c);
  }
  const caps = [...allCaps].sort();
  const headers = ['Plugin', ...caps];
  const headerRow = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  const rows = plugins.map((p) => {
    const entry = sidecar.plugins?.[p.plugin] ?? {};
    const cells = caps.map((c) => (entry.capabilities?.includes(c) ? '✓' : ''));
    return `| ${p.plugin} | ${cells.join(' | ')} |`;
  });
  return [
    '# Suite Capability Matrix',
    '',
    '**Auto-generated** by `scripts/generate-reference-sections.js`. Do not hand-edit.',
    '',
    'Capability strings come from `.claude-plugin/suite-extensions.json` `plugins.<name>.capabilities`. Adding a capability to one plugin adds a column here on next regen.',
    '',
    headerRow,
    sep,
    ...rows,
  ].join('\n');
}

function renderArtifactIoGraph({ sidecar }) {
  const lines = [
    '# Cross-Plugin Artifact I/O Graph',
    '',
    '**Auto-generated** by `scripts/generate-reference-sections.js`. Do not hand-edit.',
    '',
    'Every `writes`/`reads` path declared in `.claude-plugin/suite-extensions.json` rendered as Mermaid. Reader/writer mismatch is a contract bug — `scripts/check-pinned-plugin-paths.js` verifies the pinned plugin source contains each path literal.',
    '',
    '```mermaid',
    'flowchart LR',
  ];
  const seen = new Set();
  for (const [name, entry] of Object.entries(sidecar.plugins ?? {})) {
    for (const w of entry.artifacts?.writes ?? []) {
      const key = `${name} writes ${w}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const id = mermaidPathId(w);
      lines.push(`  ${name}-->|writes|${id}["${escapeLabel(w)}"]`);
    }
    for (const r of entry.artifacts?.reads ?? []) {
      const key = `${name} reads ${r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const id = mermaidPathId(r);
      lines.push(`  ${id}["${escapeLabel(r)}"]-->|reads|${name}`);
    }
  }
  lines.push('```');
  return lines.join('\n');
}

let pathIdCounter = 0;
const pathIdMap = new Map();
function mermaidPathId(path) {
  if (!pathIdMap.has(path)) {
    pathIdMap.set(path, `p${++pathIdCounter}`);
  }
  return pathIdMap.get(path);
}
function escapeLabel(s) {
  return s.replace(/"/g, '&quot;');
}

// ---------- Targets ----------

const TARGETS = [
  // marker-id, file, renderer-name (the generator's section table maps these)
  { id: 'plugin-table-en', file: 'README.md', kind: 'plugin-table', locale: 'en', linkify: true },
  { id: 'plugin-table-ko', file: 'README.ko.md', kind: 'plugin-table', locale: 'ko', linkify: true },
  { id: 'plugin-table-agents', file: 'AGENTS.md', kind: 'plugin-table', locale: 'en', linkify: false },
  { id: 'problem-plugin-table-readme-en', file: 'README.md', kind: 'problem-plugin-table', locale: 'en' },
  { id: 'problem-plugin-table-readme-ko', file: 'README.ko.md', kind: 'problem-plugin-table', locale: 'ko' },
  { id: 'problem-plugin-table-guide-en', file: 'guides/integrated-workflow-guide.md', kind: 'problem-plugin-table', locale: 'en' },
  { id: 'problem-plugin-table-guide-ko', file: 'guides/integrated-workflow-guide.ko.md', kind: 'problem-plugin-table', locale: 'ko' },
  { id: 'data-flow-en', file: 'guides/integrated-workflow-guide.md', kind: 'data-flow' },
  { id: 'data-flow-ko', file: 'guides/integrated-workflow-guide.ko.md', kind: 'data-flow' },
  { id: 'source-pinning', file: 'docs/source-pinning.md', kind: 'source-pinning', wholeFile: true },
  { id: 'capability-matrix', file: 'docs/capability-matrix.md', kind: 'capability-matrix', wholeFile: true },
  { id: 'artifact-io-graph', file: 'docs/artifact-io-graph.md', kind: 'artifact-io-graph', wholeFile: true },
];

function renderForTarget(target, ctx) {
  switch (target.kind) {
    case 'plugin-table':
      return renderPluginTable({
        plugins: ctx.plugins,
        versions: ctx.versions,
        locale: target.locale,
        linkify: target.linkify,
      });
    case 'data-flow':
      return renderDataFlow({ dataFlow: ctx.sidecar.data_flow ?? [] });
    case 'problem-plugin-table':
      return renderProblemPluginTable({ plugins: ctx.plugins, locale: target.locale });
    case 'source-pinning':
      return renderSourcePinning({ plugins: ctx.plugins, versions: ctx.versions });
    case 'capability-matrix':
      return renderCapabilityMatrix({ plugins: ctx.plugins, sidecar: ctx.sidecar });
    case 'artifact-io-graph':
      return renderArtifactIoGraph({ sidecar: ctx.sidecar });
    default:
      throw new Error(`unknown target kind: ${target.kind}`);
  }
}

// Whole-file managed targets render the *entire* file (still wrapped in markers
// so check-* scripts use the same parser).
function wrapWholeFile(id, body) {
  return `${startMarker(id)}\n\n${body.replace(/\n+$/, '')}\n\n${endMarker(id)}\n`;
}

// ---------- CLI ----------

function usage(extra) {
  if (extra) console.error(`error: ${extra}`);
  console.error('usage: generate-reference-sections.js (--check | --write) [--id <marker-id>] [--verbose]');
  process.exitCode = 2;
}

function parseArgs(argv) {
  const opts = { mode: null, id: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.mode = 'check';
    else if (a === '--write') opts.mode = 'write';
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--id') {
      const next = argv[++i];
      if (!next) return { ok: false, reason: '--id requires an argument' };
      opts.id = next;
    } else {
      return { ok: false, reason: `unknown argument: ${a}` };
    }
  }
  if (!opts.mode) return { ok: false, reason: 'one of --check or --write is required' };
  return { ok: true, opts };
}

function buildContext({ verbose }) {
  const market = readMarketplace(REPO_ROOT);
  const sidecarPath = resolve(REPO_ROOT, '.claude-plugin/suite-extensions.json');
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));

  const versions = {};
  for (const p of market.plugins) {
    try {
      const json = fetchPluginJson(p, { verbose });
      versions[p.plugin] = json.version ?? 'unknown';
    } catch (err) {
      if (err instanceof FetchError) {
        throw new Error(`fetch failed for ${p.plugin}: ${err.message}`);
      }
      throw err;
    }
  }
  return { plugins: market.plugins, sidecar, versions };
}

function processTarget(target, ctx, mode) {
  const filePath = resolve(REPO_ROOT, target.file);
  const fresh = renderForTarget(target, ctx);

  if (target.wholeFile) {
    const newContent = wrapWholeFile(target.id, fresh);
    if (!existsSync(filePath)) {
      if (mode === 'check') {
        return { changed: true, reason: `${target.file} missing — run --write` };
      }
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, newContent);
      return { changed: true, wrote: true };
    }
    const current = readFileSync(filePath, 'utf8');
    if (current === newContent) return { changed: false };
    if (mode === 'check') return { changed: true, reason: `${target.file} block out of date` };
    writeFileSync(filePath, newContent);
    return { changed: true, wrote: true };
  }

  // In-place marker block update.
  if (!existsSync(filePath)) {
    return { changed: true, reason: `${target.file} not found (target host file must exist)` };
  }
  const current = readFileSync(filePath, 'utf8');
  const extracted = extractBlock(current, target.id);
  if (!extracted.ok) {
    return { changed: true, reason: `${target.file}: ${extracted.reason}` };
  }
  const replaced = replaceBlock(current, target.id, fresh);
  if (!replaced.ok) {
    return { changed: true, reason: `${target.file}: ${replaced.reason}` };
  }
  if (replaced.content === current) return { changed: false };
  if (mode === 'check') {
    return { changed: true, reason: `${target.file} marker "${target.id}" out of date` };
  }
  writeFileSync(filePath, replaced.content);
  return { changed: true, wrote: true };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) { usage(parsed.reason); return; }
  const { opts } = parsed;

  let ctx;
  try {
    ctx = buildContext({ verbose: opts.verbose });
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 2;
    return;
  }

  const targets = opts.id ? TARGETS.filter((t) => t.id === opts.id) : TARGETS;
  if (opts.id && targets.length === 0) {
    usage(`no target with id "${opts.id}"`);
    return;
  }

  let drift = 0;
  let wrote = 0;
  const driftReasons = [];

  for (const t of targets) {
    let res;
    try {
      res = processTarget(t, ctx, opts.mode);
    } catch (err) {
      console.error(`error: ${t.file} (${t.id}): ${err.message}`);
      process.exitCode = 2;
      return;
    }
    if (res.changed) {
      drift++;
      if (res.reason) driftReasons.push(`  - ${res.reason}`);
      else driftReasons.push(`  - ${t.file} marker "${t.id}" out of date`);
    }
    if (res.wrote) wrote++;
  }

  if (opts.mode === 'check') {
    if (drift > 0) {
      console.error(`✗ ${drift} reference section(s) out of date:`);
      for (const r of driftReasons) console.error(r);
      console.error('');
      console.error('  Fix: node scripts/generate-reference-sections.js --write');
      process.exitCode = 1;
      return;
    }
    console.log(`✓ all reference sections up to date (${targets.length} markers checked)`);
    process.exitCode = 0;
    return;
  }

  if (opts.mode === 'write') {
    console.log(`✓ wrote ${wrote} of ${targets.length} reference section(s)`);
    if (drift > 0 && wrote === 0) {
      console.error('  but had unresolved drift reasons:');
      for (const r of driftReasons) console.error(r);
      process.exitCode = 2;
      return;
    }
    process.exitCode = 0;
    return;
  }
}

main();
