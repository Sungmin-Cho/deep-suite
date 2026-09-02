# Deep Suite — Agent Guide

Registry and integration layer for the Deep Suite plugin family: marketplace manifests, suite-side schemas, integration guides, analysis docs, CI tooling. **No plugin source code** — each plugin lives in its own repo at `github.com/Sungmin-Cho/deep-{name}`. Treat this repo as a registry, not a monorepo.

The repositories were renamed from `claude-deep-*` to runtime-neutral `deep-*` on 2026-08-19; GitHub serves the old names as permanent redirects, so never re-create a `claude-deep-*` repo — doing so kills the redirect. The marketplace **name** stays `claude-deep-suite`: it is what plugin keys (`deep-work@claude-deep-suite`) and the `~/.claude/plugins/cache/<marketplace>/` path derive from, and renaming it would break every existing install. Codex parity comes from the mirror manifest, not a rename.

## Plugins

<!-- deep-suite:auto-generated:plugin-table-agents:start -->

| Plugin | Version | Description |
|---|---|---|
| deep-work | 7.3.0 | Evidence-Driven Development Protocol |
| deep-wiki | 1.10.1 | Exact worker contracts with bounded timeout fallback and journaled wiki mutation |
| deep-evolve | 3.6.3 | Autonomous Experimentation Protocol |
| deep-review | 2.9.0 | Independent Evaluator for AI coding agents |
| deep-docs | 1.7.0 | Document gardening + authoring |
| deep-dashboard | 1.5.1 | Cross-plugin harness diagnostics + suite telemetry |
| deep-memory | 1.0.6 | Cross-project semantic memory |
| deep-goal | 1.2.1 | Goal condition compiler |
| deep-loop | 1.22.0 | Loop Engineering control plane over the deep-suite |
| deep-model-router | 1.10.1 | Deterministic model/effort/review router |

<!-- deep-suite:auto-generated:plugin-table-agents:end -->

> Auto-generated from the marketplace manifest + each plugin's pinned `plugin.json.version`. Everything outside the markers is hand-curated.

## Quick Start

```bash
npm install                              # ajv + ajv-formats, devDeps only
npm test                                 # node:test — unit + spawnSync CLI
npm run validate                         # sidecar: schema + referential integrity
npm run docs:write                       # regenerate marker regions
npm run docs:sync                        # 8 doc-sync checkers
npm run preflight                        # the gate: validate + docs:check + docs:sync + fixtures + test
npm run release:bump -- <plugin> <sha40> # pin → docs:write → preflight
```

Node 20+, ESM. A `prepare`-installed pre-push hook runs `preflight` before every push (bypass: `SKIP_PREFLIGHT=1 git push`).

## Project Structure

```
.claude-plugin/
  marketplace.json          — Claude manifest; pins every plugin to a commit SHA
  suite-extensions.json     — suite sidecar (M1); all cross-plugin metadata
.agents/plugins/
  marketplace.json          — Codex mirror; same pins behind extra policy fields
schemas/                    — sidecar + M3 artifact-envelope + payload-registry/<producer>/<kind>/
scripts/                    — validators, marker generator, 8 check-*.js gates, release-bump
tests/                      — node:test suite covering every script above
guides/                     — 7-plugin integrated workflow, hook patterns, context management
examples/                   — installable hook configs + a handoff walkthrough
docs/
  memory-hierarchy.md       — cross-plugin memory hierarchy contract
  test-catalog.md           — where each cross-plugin test lives and what it owns
  envelope-migration.md     — M3 Phase 2 migration guide for plugin maintainers
```

The rest of `docs/` is gitignored working notes. `.claude/`, `.deep-review/`, `.deep-loop/`, `.deep-suite-cache/`, `node_modules/` are runtime artifacts — never commit them.

## Conventions

### Version policy — plugin SemVer, marketplace SHA pinning

- `marketplace.json` plugin entries carry **no `version` field**. `plugin.json.version` at the pinned SHA is the single source of truth, and each plugin's cache key (official priority: `plugin.json.version` → marketplace `entry.version` → commit SHA → unknown).
- `source.sha` is source pinning — which commit to fetch.
- The two manifests must move together: `tests/codex-marketplace-contract.test.js` deep-compares `source` and `description`, so bumping one side alone is red.

### Suite sidecar (M1)

- All cross-plugin metadata goes into `.claude-plugin/suite-extensions.json` only. **Never modify `marketplace.json`** to carry it — that file stays conformant to the official schema.
- Sidecar schema is locked at `1.0`. Forward-compatible additions go through `x-*` patternProperties only; a breaking change requires a new file (`*-v2.schema.json`). See `schemas/README.md`.
- Sidecar `artifacts.writes` / `reads` must match the **pinned** source — only advertise a path the plugin actually emits at that SHA (`check-pinned-plugin-paths.js` greps the pinned tree for it).
- `data_flow` is **non-authoritative** (intent only) and `data_flow[].via` is a display label, not validated. The machine-readable cross-plugin trace lives in the M3 envelope.
- The envelope's `producer_version` is strict SemVer 2.0.0 — prerelease and build metadata allowed, leading-zero numerics and empty prerelease ids rejected.

### Manifest-doc sync (M2)

- Generated content lives **only** inside `<!-- deep-suite:auto-generated:<id>:start -->` … `:end` markers; everything outside them is hand-curated. A plugin version literal outside a marker is drift (`check-readme-plugin-table.js`).
- After any `marketplace.json` SHA change: `npm run docs:write`, then `npm run docs:sync`.
- `<wiki_root>/` (underscore) is the canonical prefix for wiki paths. `<wiki-root>/` (hyphen) is forbidden.
- Adding a cross-plugin policy requires updating both the table in `docs/memory-hierarchy.md` **and** the `POLICIES` array in `scripts/check-memory-hierarchy.js`.
- §Project Structure above is path-checked on disk by `check-agents-md-paths.js` — every entry must exist or be gitignored.

## Release workflow

The plugin repo owns its own CHANGELOG and `plugin.json` bump; this repo only pins the SHA.

1. `git -C ../<plugin> rev-parse main` — the merge commit on the plugin's `main`.
2. `npm run release:bump -- <plugin> <sha40>` — writes `source.sha` into **both** manifests (plus the redundant top-level `sha` where an entry carries one), then runs `docs:write`, then `preflight`. `--description="…"` also replaces the marketplace blurb.
3. If preflight fails, reconcile the drift it names — guide narrative version mentions, sidecar `artifacts` paths, sidecar schema namespace — and re-run `npm run preflight`.
4. Commit `chore: bump <plugin> to vX.Y.Z — <summary>` and push. The pre-push hook re-runs `preflight` as a backstop.

Manual fallback is the same sequence by hand: edit both manifests → `docs:write` → `docs:sync` → commit. Never land a SHA bump without the regen — that is what turned the CI gate red for days, and why the automation exists.

## Maintenance rules

- Preserve existing plugin entries unless the user explicitly removes one.
- Keep pin data in the manifests. Do not mirror SHA pins into README tables unless asked.
- Documentation is bilingual: `README.md` / `README.ko.md` and `guides/*.md` / `guides/*.ko.md` are kept in sync.
- `docs/DOCS_RULE.md` is the maintainer rulebook for README / CHANGELOG / AGENTS.md and the marker policy. It is **not shipped** — gitignored, present only on a maintainer checkout, absent from every clone and from CI. Do not try to read it at runtime; when it is absent, the rules in this file are the whole contract.

## Verification

Run before finishing changes. From the deep-suite checkout:

```bash
npm run preflight
```

Codex marketplace smoke test, isolated from `~/.codex/config.toml` — also from the deep-suite checkout:

```bash
tmp_home=$(mktemp -d)
mkdir -p "$tmp_home/.codex"
CODEX_HOME="$tmp_home/.codex" HOME="$tmp_home" \
  codex plugin marketplace add "$PWD"
rm -rf "$tmp_home"
```

Keep the smoke isolated unless the user explicitly wants to modify `~/.codex/config.toml`. If it fails, separate schema failures from network or auth failures.
