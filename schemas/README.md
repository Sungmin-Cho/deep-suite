# Deep Suite Schema Registry

JSON Schema definitions for suite-level metadata and artifacts. **Not consumed by Claude Code** — these are for suite tooling (validators, generators, telemetry) only.

## Files

| Schema | Consumes | Status |
|---|---|---|
| `suite-extensions.schema.json` | `.claude-plugin/suite-extensions.json` | **Active (M1)** — sidecar manifest with cross-plugin metadata |
| `artifact-envelope.schema.json` | `<plugin>/<artifact>.json` (per-plugin migration) | **Forward-compat (M1 → M3)** — common envelope adopted by plugins during M3 |
| `handoff.schema.json` | M3-envelope `payload` slot when `envelope.schema.name = "handoff"` | **Active (M5.2)** — payload contract for cross-plugin long-run handoff (deep-work Phase 5 ↔ deep-evolve, etc.) |
| `compaction-state.schema.json` | M3-envelope `payload` slot when `envelope.schema.name = "compaction-state"` | **Active (M5.3)** — payload contract for context-compaction telemetry; dashboard consumes for `suite.compaction.*` M4-deferred metrics |

## Why a sidecar instead of extending marketplace.json?

Claude Code's [official marketplace.json schema](https://code.claude.com/docs/en/plugin-marketplaces#marketplace-schema) is a closed shape: top-level allows only `name`, `owner`, `plugins`, `metadata.pluginRoot`, `description`, `version`, `$schema`, `allowCrossMarketplaceDependenciesOn`. Plugin entries allow only the documented fields. Adding `runtime`, `capabilities`, `artifacts`, etc. would:

1. Be ignored at best by `claude plugin validate`, rejected at worst when strict validation lands
2. Break interoperability with other marketplace consumers
3. Mix marketplace concerns (distribution) with suite concerns (cross-plugin coordination)

The sidecar approach (`suite-extensions.json`) keeps both clean. Claude Code reads `marketplace.json`; suite tooling reads `suite-extensions.json`.

## Schema versioning

Top-level `schema_version: "1.0"` — **locked via JSON Schema `const`**.

**Why locked, not "MAJOR.MINOR additive"**: every level uses `additionalProperties: false`. An old `1.0` validator would reject a `1.1` manifest with one new optional field (operationally breaking). The naive "MINOR is additive" policy is a footgun under closed schemas.

**How to extend forward-compat**:

1. **`x-*` patternProperties** — at the level you want to extend, use `x-foo`-prefixed keys. Reserved-and-ignored namespace; never breaks old validators. Currently allowed at:
   - `suite-extensions.schema.json`: root, `suite`, plugin entry levels
   - `artifact-envelope.schema.json`: root, `envelope` block
2. **New schema** — for breaking changes, publish `suite-extensions-v2.schema.json` (or `artifact-envelope-v2.schema.json`) with explicit migration guide here. Both validators run during the transition window.

## Versioning policy (envelope vs sidecar)

| Field | Lives in | Format | Source of truth |
|---|---|---|---|
| `schema_version` (sidecar) | `.claude-plugin/suite-extensions.json` | `const "1.0"` | `schemas/suite-extensions.schema.json` |
| `schema_version` (envelope) | wraps every artifact | `const "1.0"` | `schemas/artifact-envelope.schema.json` (locked symmetrically) |
| `producer_version` (envelope) | wraps every artifact | SemVer 2.0.0 (official recommended regex — accepts `1.0.0+commit.abc` build metadata, rejects `01.0.0` leading-zero numerics and `1.2.3-..` empty prerelease ids) | The plugin's `plugin.json.version` (per AGENTS.md §Conventions) |
| `envelope.schema.version` | wraps every artifact (payload schema id) | `^\d+\.\d+$` | The producer's domain schema (registry lookup, M3+) |

Why `schema.version` is *not* locked: it identifies the producer's payload schema, which evolves independently per producer's domain. The envelope frame itself is locked (`schema_version: const "1.0"`); the payload contract underneath can rev.

The two SemVer-bearing fields (envelope `producer_version` and the plugin's `plugin.json.version`) **must match at artifact-emit time**. M2 CI will enforce this from the marketplace side.

## `hooks_intentionally_empty_reason` invariant

The schema cannot express this conditional cross-file constraint: whether `hooks_intentionally_empty_reason` is required depends on the plugin's pinned hook configurations as well as `hooks_active`. `consumer_only` is defined-but-unused and does not exempt a plugin from this policy.

`scripts/check-hooks-coverage.js` enforces the invariant in `npm run docs:sync`, and therefore in `preflight`, the pre-push hook, and the `manifest-doc-sync` CI workflow. It applies these rules:

- `hooks_active` must equal the event set found in the union of `hooks/hooks.json` and every hooks file or inline config named by `.claude-plugin/plugin.json`.
- An empty `hooks_active` list requires a non-empty `hooks_intentionally_empty_reason`; `consumer_only` does not exempt it.
- A non-empty `hooks_active` list must not carry `hooks_intentionally_empty_reason`.
- `modules` declarations are reported as notes only; they are not gated.

The current sidecar records a reason for `deep-review`, `deep-docs`, `deep-dashboard`, and `deep-goal`.

## `data_flow.via` is a display-only label

`data_flow[*].via` is a human-readable transport label and is **not validated against `artifacts.writes`/`reads`**. Compound labels like `"session-receipt + harness-sessions.jsonl"` or `"index.json (Research reference)"` are acceptable. The validator's referential integrity phase only enforces that `from` and `to` reference existing plugin keys.

Rationale: machine-readable cross-plugin truth lives in the M3 envelope (`run_id`, `parent_run_id`); the sidecar `data_flow` is a human-readable map of intent.

## `data_flow` is intent-only, not exhaustive

`data_flow[]` captures **primary** producer → consumer flows for human readers and tooling that visualizes the suite. It is **non-authoritative**: it does not enumerate every cross-plugin read or write expressed by `artifacts.reads`/`artifacts.writes`. Adding or removing an `artifacts` entry does not require a corresponding `data_flow` edit unless the maintainer wants the diagram to highlight that link.

The validator CLI enforces only:

- `from` / `to` reference existing plugin keys (Phase 2 referential integrity).
- `via` is a non-empty string (display-only, no semantic constraint).

Comprehensive cross-plugin trace ↔ artifact mapping is delegated to the M3 envelope (`run_id` / `parent_run_id` + `provenance.source_artifacts[]`). When that envelope adopts plugin-by-plugin in M3, consumers like `deep-dashboard` can reconstruct the full graph from emitted artifacts; the sidecar continues to serve the human-readable summary.

This decision is recorded in `docs/backlog-m1-round2-deferred.md` §W-R3 (Option #2 — non-authoritative declared).

## Artifact envelope `payload` validation delegation

The envelope schema does not validate `payload` content (intentional). Each producer plugin owns a domain schema for its payload, identified by `envelope.schema.name`. Consumers (deep-dashboard aggregator, M3+ migration) look up the producer's payload schema in a **schema registry** (TBD in M3) keyed by `(envelope.producer, envelope.schema.name, envelope.schema.version)`. Until the registry exists, payload validation is producer-side only.

### Shared cross-plugin payloads (M5)

Two payload schemas are **not per-producer** but shared across plugins that emit them:

- `handoff.schema.json` — produced by `deep-work` (Phase 5 Integrate) and `deep-evolve` (epoch end). Both producers wrap it in the M3 envelope with `envelope.artifact_kind = "handoff"` and `envelope.schema = { name: "handoff", version: "1.0" }`.
- `compaction-state.schema.json` — produced by any plugin with a long-running loop (`deep-work`, `deep-evolve`, potentially `deep-wiki`). Wrapped with `envelope.artifact_kind = "compaction-state"` and `envelope.schema = { name: "compaction-state", version: "1.0" }`.

Each producer that emits these MAY register a registry entry under `payload-registry/<producer>/<kind>/v1.0.schema.json` that simply $ref's the top-level shared schema (so `validate-artifact.js` finds it via the existing lookup), or the registry entry MAY duplicate the schema content inline. The top-level files in `schemas/` are the authoritative source; registry entries are forwarders. Plugin-side adoption is M5.7+ (separate per-plugin PRs).

## Validating

```bash
# from repo root
npm run validate                                       # checks .claude-plugin/suite-extensions.json
node scripts/validate-suite-extensions.js path/to/file.json
```

Exit codes: `0` = valid, `1` = validation failure (schema or referential), `2` = IO/usage/compile error. Phase is distinguished by stderr prefix:

- `✗ ... fails schema validation:` — JSON Schema (Phase 1)
- `✗ ... fails referential integrity:` — `data_flow.from`/`to` not in `plugins` (Phase 2)

## Contributing

1. Edit the schema (`*.schema.json`)
2. Update fixtures in `tests/fixtures/`
3. Add or update tests in `tests/validate-suite-extensions.test.js`
4. Run `npm test`
5. Schemas are locked at `1.0`. For additive extensions use `x-*` patternProperties. For breaking changes, publish `*-v2.schema.json` and update §Schema versioning above.

## References

- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [ajv 2020-12 mode](https://ajv.js.org/json-schema.html#draft-2020-12)
- `docs/deep-suite-harness-roadmap.md` §M1, §M3
- `docs/deep-suite-harness-analysis.md` §A.2 (sidecar 배경)
