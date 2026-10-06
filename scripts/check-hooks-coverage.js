#!/usr/bin/env node
// Verify that the sidecar's hook event inventory matches each pinned plugin.
//
// Why: the sidecar describes a plugin across runtimes (Claude Code and the
// Codex mirror both ship from the same pin), so it must reflect all hook
// configurations advertised by that plugin's manifest.
//
// Strategy: compare the UNION of hooks/hooks.json and every hooks file or
// inline config named by .claude-plugin/plugin.json `hooks`. Run in docs:sync
// (preflight, pre-push, CI) using the shared .deep-suite-cache/ fetcher.
// Claude Code 2.1.287+ `modules` are reported, not gated.
//
// Exit codes: 0 clean, 1 sidecar/source drift, 2 IO/usage/fetch.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readMarketplace, fetchPluginFile, FetchError } from './lib/fetch-plugin-files.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function sourceForPath(value) {
  if (typeof value !== 'string') throw new Error(`invalid hook source ${JSON.stringify(value)} (expected a path string or object)`);
  const path = value.replace(/^\.\//, '');
  if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`invalid hook source path ${JSON.stringify(value)}`);
  return { kind: 'file', path };
}

export function hookSourcesFromManifest(pluginJson) {
  const sources = [{ kind: 'file', path: 'hooks/hooks.json' }];
  const seen = new Set(['hooks/hooks.json']);
  const add = (item) => {
    if (typeof item === 'string') {
      const source = sourceForPath(item);
      if (!seen.has(source.path)) { sources.push(source); seen.add(source.path); }
    } else if (isPlainObject(item)) {
      sources.push({ kind: 'inline', doc: item });
    } else {
      throw new Error(`invalid hook source ${JSON.stringify(item)} (expected a path string or plain object)`);
    }
  };
  const hooks = pluginJson?.hooks;
  if (hooks == null) return sources;
  if (typeof hooks === 'string' || isPlainObject(hooks)) add(hooks);
  else if (Array.isArray(hooks)) hooks.forEach(add);
  else throw new Error(`invalid hooks manifest value ${JSON.stringify(hooks)}`);
  return sources;
}

export function eventsFromHooksDoc(doc) {
  if (!isPlainObject(doc)) throw new Error('hooks document must be a plain object');
  if (!Object.hasOwn(doc, 'hooks')) return { events: [], hasModules: Object.hasOwn(doc, 'modules') };
  if (!isPlainObject(doc.hooks)) throw new Error('hooks must be a plain object when present');
  return { events: Object.keys(doc.hooks), hasModules: Object.hasOwn(doc, 'modules') };
}

export function evaluatePlugin({ plugin, entry, events, modulesIn }) {
  const errors = [];
  const notes = [];
  if (entry === undefined) errors.push(`${plugin}.sidecar — no sidecar entry`);
  const active = Array.isArray(entry?.hooks_active) ? entry.hooks_active : [];
  const sourceSet = new Set(events);
  const sidecarSet = new Set(active);
  if (sourceSet.size !== sidecarSet.size || [...sourceSet].some((x) => !sidecarSet.has(x))) {
    const sourceOnly = [...sourceSet].filter((x) => !sidecarSet.has(x)).sort();
    const sidecarOnly = [...sidecarSet].filter((x) => !sourceSet.has(x)).sort();
    errors.push(`${plugin}.hooks_active — pinned source has [${sourceOnly.join(', ')}] that sidecar lacks; sidecar lists [${sidecarOnly.join(', ')}] that source lacks`);
  }
  const reason = entry?.hooks_intentionally_empty_reason;
  if (active.length === 0 && (typeof reason !== 'string' || reason.trim() === '')) {
    errors.push(`${plugin}.hooks_intentionally_empty_reason — required when hooks_active is empty`);
  }
  if (active.length > 0 && reason !== undefined) {
    errors.push(`${plugin}.hooks_intentionally_empty_reason — stale reason; remove it when hooks_active is non-empty`);
  }
  if (modulesIn.length) notes.push(`${plugin}: modules declared in ${modulesIn.join(', ')} (reported only; sidecar schema has no field for modules)`);
  return { errors, notes };
}

export function checkHooksCoverage({ sidecar, plugins, readFile }) {
  const errors = [];
  const notes = [];
  let files = 0;
  const marketplaceKeys = new Set(plugins.map((p) => p.plugin));
  for (const key of Object.keys(sidecar.plugins ?? {})) {
    if (!marketplaceKeys.has(key)) errors.push(`${key}.sidecar — plugin key is not in marketplace`);
  }
  for (const pluginInfo of plugins) {
    const { plugin, sha } = pluginInfo;
    let manifest = {};
    const rawManifest = readFile(pluginInfo, '.claude-plugin/plugin.json');
    if (rawManifest !== null) {
      try { manifest = JSON.parse(rawManifest); }
      catch (err) { errors.push(`${plugin} ${sha.slice(0, 7)} .claude-plugin/plugin.json — invalid JSON: ${err.message}`); }
    }
    let sources = [];
    try { sources = hookSourcesFromManifest(manifest); }
    catch (err) { errors.push(`${plugin} ${sha.slice(0, 7)} .claude-plugin/plugin.json — ${err.message}`); }
    const events = new Set();
    const modulesIn = [];
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      const label = source.kind === 'file' ? source.path : `.claude-plugin/plugin.json hooks inline #${index}`;
      let raw;
      if (source.kind === 'inline') { raw = JSON.stringify(source.doc); files++; }
      else {
        raw = readFile(pluginInfo, source.path);
        if (raw === null) continue;
        files++;
      }
      let doc;
      try { doc = source.kind === 'inline' ? source.doc : JSON.parse(raw); }
      catch (err) { errors.push(`${plugin} ${sha.slice(0, 7)} ${label} — invalid JSON: ${err.message}`); continue; }
      try {
        const result = eventsFromHooksDoc(doc);
        result.events.forEach((event) => events.add(event));
        if (result.hasModules) modulesIn.push(label);
      } catch (err) { errors.push(`${plugin} ${sha.slice(0, 7)} ${label} — ${err.message}`); }
    }
    const result = evaluatePlugin({ plugin, entry: sidecar.plugins?.[plugin], events: [...events].sort(), modulesIn });
    errors.push(...result.errors);
    notes.push(...result.notes);
  }
  return { errors, notes, checked: { plugins: plugins.length, files } };
}

function main() {
  if (process.argv.length > 2) { console.error('error: this checker takes no arguments'); process.exitCode = 2; return; }
  let sidecar;
  let market;
  try {
    sidecar = JSON.parse(readFileSync(resolve(REPO_ROOT, '.claude-plugin/suite-extensions.json'), 'utf8'));
    market = readMarketplace(REPO_ROOT);
  } catch (err) { console.error(`error: ${err.message}`); process.exitCode = 2; return; }
  const result = checkHooksCoverage({ sidecar, plugins: market.plugins, readFile(info, path) {
    try { return fetchPluginFile({ ...info, path }); }
    catch (err) {
      if (err instanceof FetchError && /not found/i.test(err.message)) return null;
      console.error(`error: failed to fetch ${info.plugin} ${path}: ${err.message}`);
      process.exitCode = 2;
      return null;
    }
  } });
  if (process.exitCode === 2) return;
  result.notes.forEach((note) => console.log(`ℹ ${note}`));
  result.errors.forEach((error) => console.error(`✗ .claude-plugin/suite-extensions.json — ${error}`));
  if (result.errors.length) {
    console.error('Fix: update hooks_active to the pinned event set; remove the reason when non-empty; add a reason when empty.');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ hooks coverage verified (${result.checked.plugins} plugins, ${result.checked.files} hook files read)`);
  process.exitCode = 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
