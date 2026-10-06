#!/usr/bin/env node
// Verify that the sidecar's hook event inventory matches each pinned plugin.
//
// Why: the sidecar describes a plugin across runtimes (Claude Code and the
// Codex mirror both ship from the same pin), so it must reflect all hook
// configurations advertised by that plugin's manifests.
//
// Strategy: compare the UNION of hooks/hooks.json and every hooks file or
// inline config named by the `hooks` field of .claude-plugin/plugin.json and
// .codex-plugin/plugin.json. A hooks file wraps its event map in a top-level
// `hooks` key; an inline manifest object IS the event map (Claude Code plugin
// manifest reference). Run in docs:sync (preflight, pre-push, CI) using the
// shared .deep-suite-cache/ fetcher. Claude Code 2.1.287+ `modules` are
// reported, not gated.
//
// Exit codes: 0 clean, 1 sidecar/source drift, 2 IO/usage/fetch.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readMarketplace, fetchPluginFile, isPathNotFound } from './lib/fetch-plugin-files.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOOKS_FILE = 'hooks/hooks.json';
// The Claude manifest is required at every pin; the Codex mirror is optional.
const MANIFESTS = [
  { path: '.claude-plugin/plugin.json', required: true },
  { path: '.codex-plugin/plugin.json', required: false },
];
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function sourceForPath(value) {
  if (typeof value !== 'string') throw new Error(`invalid hook source ${JSON.stringify(value)} (expected a path string or object)`);
  const path = value.replace(/^\.\//, '');
  // POSIX and Windows spellings alike: the path keys a cache file under
  // .deep-suite-cache/, so it must not be able to escape it on any host.
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')) {
    throw new Error(`invalid hook source path ${JSON.stringify(value)}`);
  }
  return { kind: 'file', path };
}

export function hookSourcesFromManifest(pluginJson) {
  const sources = [{ kind: 'file', path: DEFAULT_HOOKS_FILE }];
  const seen = new Set([DEFAULT_HOOKS_FILE]);
  const add = (item) => {
    if (typeof item === 'string') {
      const source = sourceForPath(item);
      // An explicitly named default stays one entry but is marked declared:
      // Claude Code then refuses it if it is missing.
      if (source.path === DEFAULT_HOOKS_FILE) sources[0].declared = true;
      else if (!seen.has(source.path)) { sources.push(source); seen.add(source.path); }
    } else if (isPlainObject(item)) {
      sources.push({ kind: 'inline', doc: item });
    } else {
      throw new Error(`invalid hook source ${JSON.stringify(item)} (expected a path string or plain object)`);
    }
  };
  if (!isPlainObject(pluginJson)) throw new Error('manifest must be a JSON object');
  if (!Object.hasOwn(pluginJson, 'hooks')) return sources;
  const hooks = pluginJson.hooks;
  if (typeof hooks === 'string' || isPlainObject(hooks)) add(hooks);
  else if (Array.isArray(hooks)) hooks.forEach(add);
  else throw new Error(`invalid hooks manifest value ${JSON.stringify(hooks)}`);
  return sources;
}

// A hooks FILE: `{ hooks: { <Event>: [...] }, modules?, ... }`.
export function eventsFromHooksDoc(doc) {
  if (!isPlainObject(doc)) throw new Error('hooks document must be a plain object');
  if (!Object.hasOwn(doc, 'hooks')) return { events: [], hasModules: Object.hasOwn(doc, 'modules') };
  if (!isPlainObject(doc.hooks)) throw new Error('hooks must be a plain object when present');
  return { events: Object.keys(doc.hooks), hasModules: Object.hasOwn(doc, 'modules') };
}

// An INLINE manifest object: the event map itself, `{ <Event>: [...] }`.
export function eventsFromInlineHooks(map) {
  if (!isPlainObject(map)) throw new Error('inline hooks must be a plain object');
  return { events: Object.keys(map), hasModules: false };
}

export function evaluatePlugin({ plugin, entry, events, modulesIn }) {
  const errors = [];
  const notes = [];
  if (entry === undefined) {
    errors.push(`${plugin}.sidecar — no sidecar entry`);
    return { errors, notes };
  }
  const active = Array.isArray(entry.hooks_active) ? entry.hooks_active : [];
  const sourceSet = new Set(events);
  const sidecarSet = new Set(active);
  if (sourceSet.size !== sidecarSet.size || [...sourceSet].some((x) => !sidecarSet.has(x))) {
    const sourceOnly = [...sourceSet].filter((x) => !sidecarSet.has(x)).sort();
    const sidecarOnly = [...sidecarSet].filter((x) => !sourceSet.has(x)).sort();
    errors.push(`${plugin}.hooks_active — pinned source has [${sourceOnly.join(', ')}] that sidecar lacks; sidecar lists [${sidecarOnly.join(', ')}] that source lacks`);
  }
  const reason = entry.hooks_intentionally_empty_reason;
  if (active.length === 0 && (typeof reason !== 'string' || reason.trim() === '')) {
    errors.push(`${plugin}.hooks_intentionally_empty_reason — required when hooks_active is empty`);
  }
  if (active.length > 0 && reason !== undefined) {
    errors.push(`${plugin}.hooks_intentionally_empty_reason — stale reason; remove it when hooks_active is non-empty`);
  }
  if (modulesIn.length === 1) {
    notes.push(`${plugin}: modules declared in ${modulesIn[0]} (reported only; sidecar schema has no field for modules)`);
  } else if (modulesIn.length > 1) {
    notes.push(`${plugin}: modules declared in ${modulesIn.join(', ')} — Claude Code allows one module per plugin and loads neither (reported only)`);
  }
  return { errors, notes };
}

function parseJson(raw, onError) {
  try { return JSON.parse(raw); } catch (err) { onError(`invalid JSON: ${err.message}`); return undefined; }
}

// `readFile(info, path)` returns the text, or null when the path does not
// exist at the pin. Any other failure must throw; it aborts the whole check.
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
    const at = `${plugin} ${sha.slice(0, 7)}`;
    const sources = [{ kind: 'file', path: DEFAULT_HOOKS_FILE, from: 'default', required: false }];
    for (const manifest of MANIFESTS) {
      const raw = readFile(pluginInfo, manifest.path);
      if (raw === null) {
        if (manifest.required) errors.push(`${at} ${manifest.path} — missing at the pin; manifest-named hooks files cannot be read`);
        continue;
      }
      const json = parseJson(raw, (msg) => errors.push(`${at} ${manifest.path} — ${msg}`));
      if (json === undefined) continue;
      let declared;
      try { declared = hookSourcesFromManifest(json); }
      catch (err) { errors.push(`${at} ${manifest.path} — ${err.message}`); continue; }
      // `declared[0]` is the implicit default; it is required only when this
      // manifest names it. Every other entry was named, so its file must exist.
      if (declared[0].declared && !sources[0].required) Object.assign(sources[0], { required: true, from: manifest.path });
      for (const source of declared.slice(1)) {
        if (source.kind === 'file') {
          const known = sources.find((s) => s.kind === 'file' && s.path === source.path);
          if (known) { known.required = true; continue; }
        }
        sources.push({ ...source, from: manifest.path, required: true });
      }
    }
    const events = new Set();
    const modulesIn = [];
    let inlineIndex = 0;
    for (const source of sources) {
      let result;
      if (source.kind === 'inline') {
        const label = `${source.from} hooks inline #${inlineIndex++}`;
        files++;
        try { result = eventsFromInlineHooks(source.doc); }
        catch (err) { errors.push(`${at} ${label} — ${err.message}`); continue; }
      } else {
        const raw = readFile(pluginInfo, source.path);
        if (raw === null) {
          // Claude Code refuses a declared path that does not exist; only the
          // undeclared default hooks/hooks.json may be absent.
          if (source.required) errors.push(`${at} ${source.path} — named by ${source.from} but missing at the pin`);
          continue;
        }
        files++;
        const doc = parseJson(raw, (msg) => errors.push(`${at} ${source.path} — ${msg}`));
        if (doc === undefined) continue;
        try { result = eventsFromHooksDoc(doc); }
        catch (err) { errors.push(`${at} ${source.path} — ${err.message}`); continue; }
        if (result.hasModules) modulesIn.push(source.path);
      }
      result.events.forEach((event) => events.add(event));
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
  let result;
  try {
    result = checkHooksCoverage({ sidecar, plugins: market.plugins, readFile(info, path) {
      try { return fetchPluginFile({ ...info, path }); }
      catch (err) {
        // Only a 404 for the path means "no such file". `gh CLI not found`,
        // rate limits and other gh failures are FetchErrors too and abort.
        if (isPathNotFound(err)) return null;
        err.message = `failed to fetch ${info.plugin} ${path}: ${err.message}`;
        throw err;
      }
    } });
  } catch (err) { console.error(`error: ${err.message}`); process.exitCode = 2; return; }
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
