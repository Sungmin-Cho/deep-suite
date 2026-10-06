#!/usr/bin/env node
// Verifies pinned-plugin docs do not contradict suite-level policies.
//
// Policies are keyword-based (see docs/memory-hierarchy.md §Conflict catalog).
// Sentence-level NLP would over-fit; the regex approach lets maintainers
// audit and extend the dictionary explicitly.
//
// Files probed per plugin (at the pinned SHA):
//   - README.md
//   - CHANGELOG.md
//   - AGENTS.md (optional)
//   - CLAUDE.md (optional)
//
// Only a 404 (isPathNotFound) means a probe is absent; any other fetch error
// exits 2. A plugin with no readable probe at all also exits 2 — a repo-level
// 404 or an access problem must not pass as "no conflicts".
//
// Exit codes: 0 clean, 1 conflict, 2 IO/fetch.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMarketplace, fetchPluginFile, isPathNotFound } from './lib/fetch-plugin-files.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const PROBE_FILES = ['README.md', 'CHANGELOG.md', 'AGENTS.md', 'CLAUDE.md'];

// Each policy: regex flag + a "permit" regex that allows the keyword in
// historical / negated contexts (e.g., "we *removed* the version field").
// If `match` triggers and `permit` does not, fail.
const POLICIES = [
  {
    id: 'marketplace-version-field',
    file: '*',
    match: /marketplace\.json[^\n]{0,80}\bversion\b\s*(?:field|key|property)/i,
    permit: /(omit|removed|no longer|deprecated|do not declare|don't declare)/i,
    message: 'plugin doc requires/expects "version" field on marketplace.json plugin entry — suite policy says omit (single-source-of-truth = plugin.json.version)',
  },
  {
    id: 'schema_version-bump',
    file: '*',
    match: /schema_version[^\n]{0,40}\b1\.1\b/i,
    permit: /(forbidden|locked|never|do not|don't|x-\*|envelope\.schema\.version)/i,
    message: 'plugin doc proposes schema_version > 1.0 — suite policy locks at 1.0 (forward-compat via x-* patternProperties; payload-schema versions cited as envelope.schema.version are exempt)',
  },
  {
    id: 'data_flow-authoritative',
    file: '*',
    match: /data_flow[^\n]{0,80}(authoritative|comprehensive|complete graph|all cross-plugin)/i,
    permit: /(non-authoritative|not authoritative|intent only|not exhaustive)/i,
    message: 'plugin doc treats sidecar data_flow as authoritative graph — suite policy declares non-authoritative (M3 envelope is machine truth)',
  },
  {
    id: 'wiki_root-prefix',
    file: '*',
    match: /<wiki-root>\//,
    permit: /\(deprecated\)/i,
    message: 'plugin doc uses "<wiki-root>/" (hyphen) — suite canonical is "<wiki_root>/" (underscore) per W-R1 fix',
    only: ['deep-wiki', 'deep-work', 'deep-dashboard'],
  },
  {
    id: 'hooks-empty-with-reason',
    file: '*',
    // Matches plugin docs claiming `hooks_active: []` is fine without a reason —
    // suite policy requires `hooks_intentionally_empty_reason` (per the schema)
    // when the plugin's own hooks/hooks.json is empty. Catalogued in
    // docs/memory-hierarchy.md §Conflict catalog.
    match: /hooks_active\s*:\s*\[\s*\][^\n]{0,80}(no reason needed|reason not required|empty hooks ok)/i,
    permit: /(intentionally|reason required|hooks_intentionally_empty_reason)/i,
    message: 'plugin doc claims `hooks_active: []` is fine without a reason — suite policy requires `hooks_intentionally_empty_reason` for trust-boundary documentation',
  },
];

function lineNumberOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

// Closes review C3: scope `permit` to a small window around the match (not
// the whole file). The previous file-scoped check let any unrelated
// "removed" / "deprecated" elsewhere in a CHANGELOG silence every policy
// globally. Window is the matched line ± 1 line — wide enough to allow
// phrasing like "we removed\nthe X helper" but not arbitrary historical
// mentions further away. Also iterate every match site so one permit cannot
// mask a separate violation in the same file.
const PERMIT_WINDOW_LINES = 1;

function permitMasks({ pol, text, idx }) {
  if (!pol.permit) return false;
  const lines = text.split('\n');
  const lineNo = lineNumberOf(text, idx);
  const lo = Math.max(0, lineNo - 1 - PERMIT_WINDOW_LINES);
  const hi = Math.min(lines.length, lineNo + PERMIT_WINDOW_LINES);
  const window = lines.slice(lo, hi).join('\n');
  return pol.permit.test(window);
}

function checkFile({ plugin, path, text }) {
  const offenses = [];
  const lines = text.split('\n');
  for (const pol of POLICIES) {
    if (pol.only && !pol.only.includes(plugin)) continue;
    const flags = pol.match.flags.includes('g') ? pol.match.flags : pol.match.flags + 'g';
    const re = new RegExp(pol.match.source, flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!permitMasks({ pol, text, idx: m.index })) {
        const lineNo = lineNumberOf(text, m.index);
        offenses.push({
          plugin,
          file: path,
          line: lineNo,
          policyId: pol.id,
          message: pol.message,
          snippet: (lines[lineNo - 1] ?? '').trim(),
        });
      }
      if (m.index === re.lastIndex) re.lastIndex++; // defensive: zero-width
    }
  }
  return offenses;
}

function main() {
  if (process.argv.length > 2) {
    console.error('error: this checker takes no arguments');
    process.exitCode = 2;
    return;
  }

  let market;
  try {
    market = readMarketplace(REPO_ROOT);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 2;
    return;
  }

  let drift = 0;
  let probed = 0;
  for (const info of market.plugins) {
    let pluginProbed = 0;
    for (const probe of PROBE_FILES) {
      let text;
      try {
        text = fetchPluginFile({ ...info, path: probe });
      } catch (err) {
        if (isPathNotFound(err)) continue;
        console.error(`error: fetch ${info.plugin}/${probe}: ${err.message}`);
        process.exitCode = 2;
        return;
      }
      probed++;
      pluginProbed++;
      const offenses = checkFile({ plugin: info.plugin, path: probe, text });
      for (const o of offenses) {
        const cacheRel = `.deep-suite-cache/${o.plugin}-${info.sha.slice(0, 7)}.../${o.file}:${o.line}`;
        console.error(`✗ ${cacheRel} — policy "${o.policyId}"`);
        console.error(`    ${o.message}`);
        console.error(`    snippet: ${o.snippet}`);
        drift++;
      }
    }
    if (pluginProbed === 0) {
      console.error(`error: no probe file (${PROBE_FILES.join(', ')}) readable for ${info.plugin}@${info.sha.slice(0, 7)} — check repository access or the pin`);
      process.exitCode = 2;
      return;
    }
  }

  if (drift > 0) {
    console.error('');
    console.error('Fix options:');
    console.error('  - Plugin doc wrong → PR to plugin upstream + bump marketplace.json sha');
    console.error('  - Suite policy outdated → update AGENTS.md §Conventions + POLICIES dictionary in this script');
    console.error('  - Historical mention → add a "permit" phrase (deprecated, removed, etc.) to the line');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ no cross-plugin memory-hierarchy conflicts (${market.plugins.length} plugins, ${probed} files probed)`);
  process.exitCode = 0;
}

main();
