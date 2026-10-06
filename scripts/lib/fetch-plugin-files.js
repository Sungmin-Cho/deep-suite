// Fetch a file from a pinned plugin commit, with on-disk cache.
//
// Cache layout:
//   .deep-suite-cache/<plugin-name>-<sha>/<relative/path/to/file>
//
// Source of files: GitHub Contents API via `gh api`.
//   GET repos/<owner>/<repo>/contents/<path>?ref=<sha>
//
// Why `gh` (not raw `git ls-tree`):
//   - Respects $GITHUB_TOKEN automatically (CI rate limit ↑ to 5000 req/h)
//   - Local devs often have `gh auth login` already
//   - Returns base64-encoded blob with size + sha for sanity checks
//
// Test overrides: M2_TEST_FIXTURES_DIR reads fixture files instead of GitHub;
// DEEP_SUITE_CACHE_DIR selects the cache root (read at call time).
//
// API:
//   fetchPluginFile({ plugin, owner, repo, sha, path }) → string
//   isPathNotFound(err) → true only for a 404 FetchError (code PATH_NOT_FOUND)
//   pluginInfoFromMarketplace(entry) → { plugin, owner, repo, sha }
//   readMarketplace(repoRoot) → { plugins: [...{plugin, owner, repo, sha, description}] }

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_LIB_DIR = dirname(__filename);
const REPO_ROOT = resolve(SCRIPTS_LIB_DIR, '..', '..');
export class FetchError extends Error {
  constructor(message, { plugin, sha, path, code } = {}) {
    super(message);
    this.name = 'FetchError';
    this.plugin = plugin;
    this.sha = sha;
    this.path = path;
    this.code = code;
  }
}

export function isPathNotFound(err) {
  return err instanceof FetchError && err.code === 'PATH_NOT_FOUND';
}

function parseGitHubUrl(url) {
  // Accepts https://github.com/<owner>/<repo>(.git)?
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new FetchError(`unsupported source URL: ${url}`);
  return { owner: m[1], repo: m[2] };
}

export function pluginInfoFromMarketplace(entry) {
  const { name: plugin, description = '' } = entry;
  const url = entry.source?.url;
  const sha = entry.source?.sha;
  if (!url || !sha) {
    throw new FetchError(
      `marketplace entry "${plugin}" missing source.url or source.sha`,
      { plugin }
    );
  }
  const { owner, repo } = parseGitHubUrl(url);
  return { plugin, owner, repo, sha, description, url };
}

export function readMarketplace(repoRoot = REPO_ROOT) {
  const path = resolve(repoRoot, '.claude-plugin/marketplace.json');
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.plugins)) {
    throw new FetchError(`marketplace.json has no plugins array`);
  }
  return {
    name: data.name,
    metadata: data.metadata ?? {},
    plugins: data.plugins.map(pluginInfoFromMarketplace),
  };
}

function cacheRoot() {
  const override = process.env.DEEP_SUITE_CACHE_DIR;
  // Relative overrides are repo-rooted, like the default, not cwd-relative.
  return override ? resolve(REPO_ROOT, override) : resolve(REPO_ROOT, '.deep-suite-cache');
}

function cachePath(plugin, sha, path) {
  return join(cacheRoot(), `${plugin}-${sha}`, path);
}

function readCache(plugin, sha, path) {
  const p = cachePath(plugin, sha, path);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

function writeCache(plugin, sha, path, content) {
  const p = cachePath(plugin, sha, path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

function readFixtureOverride(plugin, sha, path) {
  const dir = process.env.M2_TEST_FIXTURES_DIR;
  if (!dir) return null;
  // Test fixtures are keyed by plugin only when sha is irrelevant for the test;
  // allow either `<plugin>-<sha>` or `<plugin>` directories.
  const candidates = [
    join(dir, `${plugin}-${sha}`, path),
    join(dir, plugin, path),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return readFileSync(c, 'utf8');
  }
  return null;
}

function ghApiContents({ owner, repo, sha, path }) {
  // gh CLI inherits GITHUB_TOKEN/GH_TOKEN automatically.
  const endpoint = `repos/${owner}/${repo}/contents/${path}?ref=${sha}`;
  const res = spawnSync('gh', ['api', endpoint, '-H', 'Accept: application/vnd.github+json'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (res.error && res.error.code === 'ENOENT') {
    throw new FetchError(
      `gh CLI not found (brew install gh, then "gh auth login"). Path: ${path}`,
      { plugin: undefined, sha, path }
    );
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    if (/HTTP 404/.test(stderr) || /Not Found/.test(stderr)) {
      throw new FetchError(
        `path not found at ${owner}/${repo}@${sha}: ${path}`,
        { sha, path, code: 'PATH_NOT_FOUND' }
      );
    }
    if (/HTTP 403/.test(stderr) && /rate limit/i.test(stderr)) {
      throw new FetchError(
        `GitHub rate limit hit fetching ${owner}/${repo}@${sha.slice(0, 7)}/${path}. Set GITHUB_TOKEN or wait.`,
        { sha, path }
      );
    }
    throw new FetchError(
      `gh api failed for ${owner}/${repo}@${sha.slice(0, 7)}/${path}: ${stderr || res.status}`,
      { sha, path }
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (err) {
    throw new FetchError(`gh api returned non-JSON for ${path}: ${err.message}`, { sha, path });
  }
  if (parsed.type !== 'file') {
    throw new FetchError(`expected file, got ${parsed.type} for ${path}`, { sha, path });
  }
  if (parsed.encoding !== 'base64') {
    throw new FetchError(`unexpected encoding ${parsed.encoding} for ${path}`, { sha, path });
  }
  const decoded = Buffer.from(parsed.content, 'base64').toString('utf8');
  return decoded;
}

export function fetchPluginFile({ plugin, owner, repo, sha, path }, opts = {}) {
  const { verbose = false } = opts;
  const fixture = readFixtureOverride(plugin, sha, path);
  if (fixture != null) {
    if (verbose) console.error(`[fetcher] fixture-hit ${plugin}@${sha.slice(0, 7)}/${path}`);
    return fixture;
  }
  const cached = readCache(plugin, sha, path);
  if (cached != null) {
    if (verbose) console.error(`[fetcher] cache-hit ${plugin}@${sha.slice(0, 7)}/${path}`);
    return cached;
  }
  if (verbose) console.error(`[fetcher] cache-miss ${plugin}@${sha.slice(0, 7)}/${path}`);
  const content = ghApiContents({ owner, repo, sha, path });
  writeCache(plugin, sha, path, content);
  return content;
}

// Convenience: fetch & parse plugin.json. Returns parsed object or throws FetchError.
export function fetchPluginJson(info, opts = {}) {
  const raw = fetchPluginFile({ ...info, path: '.claude-plugin/plugin.json' }, opts);
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new FetchError(
      `${info.plugin}@${info.sha.slice(0, 7)} plugin.json is not valid JSON: ${err.message}`,
      info
    );
  }
}
