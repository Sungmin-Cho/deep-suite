# Cross-Plugin Memory Hierarchy

> **Status**: Active (M2). Defines how project-memory documents (AGENTS.md / CLAUDE.md / SKILL.md) at the suite level and inside each plugin compose. Owners: suite maintainers + plugin maintainers.

`scripts/check-memory-hierarchy.js` enforces the contract on PR + daily cron.

---

## Levels

| Level | Location | Owner | Scope | Override priority |
|---|---|---|---|---|
| **Suite-wide** | `<suite>/AGENTS.md` § Conventions | suite maintainer | Cross-plugin policy, version pinning policy, sidecar contract | broadest |
| **Plugin manifest** | `<plugin-repo>/.claude-plugin/plugin.json` | plugin maintainer | Component declaration (commands, hooks, skills, agents) | broad |
| **Plugin agent rules** | `<plugin-repo>/AGENTS.md`, or fallback to `<plugin-repo>/CLAUDE.md`, or `README.md § Conventions` | plugin maintainer | Plugin-internal task rules (TDD policy, code style, hook expectations) | medium |
| **Skill-scoped** | `<plugin-repo>/skills/<id>/SKILL.md` frontmatter + body | skill author | Per-invocation behavior when the skill activates | narrowest |

**Override rule**: a narrower scope overrides a broader one **except** for *security-shaped* policies (trust-boundary, sidecar invariants, hook intentional-empty reasoning). Security-shaped policies bubble *up* — the suite-wide value wins, no exceptions.

Reasoning: ergonomics decisions (terse vs verbose comments, naming preferences) should adapt to plugin context. Trust-boundary decisions cannot — they are the suite's contract with downstream consumers.

---

## What goes where

### Suite-wide AGENTS.md (this repo)

Cross-plugin invariants. Examples currently codified:

- **Marketplace SHA pinning**: `marketplace.json` plugin entries omit `version`; the truth lives in pinned `plugin.json.version`.
- **Sidecar policy**: every cross-plugin metadata addition goes through `.claude-plugin/suite-extensions.json` and must pass `npm test` + `npm run validate` + `claude plugin validate .`.
- **Schema versioning**: `schema_version` is locked at `"1.0"`; forward-compat additions go through `x-*` patternProperties.
- **`data_flow` non-authoritative**: machine-readable cross-plugin truth lives in M3 envelope.

### Plugin manifest (each plugin's plugin.json)

Authoritative component declaration consumed by Claude Code. The suite never restates this — sidecar `suite-extensions.json` adds *cross-plugin* metadata only, never duplicates plugin.json fields.

### Plugin AGENTS.md (or CLAUDE.md fallback)

In-repo rules that apply to *agents working inside that plugin's repo*. Examples:

- deep-work's TDD mode policy (when `tdd_mode=strict` applies vs not)
- deep-wiki's no-subagent rule (`/wiki-ingest` runs in the main caller on every host; `npm run lint:agents` fails if an agent definition returns)
- deep-review's evaluator trust-boundary (no event-driven hooks; user-invocation only)

These do **not** propagate to the suite repo. When the suite needs to know about a plugin's invariant (e.g., "deep-review has no hooks"), it gets recorded in `suite-extensions.json` (`hooks_intentionally_empty_reason`).

### Skill SKILL.md frontmatter

Activation rules (`description`, trigger keywords). The body of the skill is procedural guidance that overrides plugin-default behavior *for the duration of the skill activation only*.

---

## Conflict catalog

The checker uses a small explicit dictionary rather than sentence-level NLP. Each entry below is a **policy keyword** the suite enforces; if a pinned-plugin doc contradicts it, the checker fails with `file:line`.

| Policy keyword | Suite rule | Plugin must … | Failure phrasing |
|---|---|---|---|
| `marketplace-version-field` | Plugin entry in `marketplace.json` does not declare `version` | Not require `version` in plugin entries from its README/CHANGELOG examples | "plugin doc claims marketplace entry must have `version` field" |
| `schema_version-locked` | Sidecar/envelope `schema_version` is locked at `"1.0"` (forward-compat via `x-*`) | Not advertise `schema_version: "1.1"` migration plans. Payload-schema versions (`envelope.schema.version`, payload-registry `v<MAJOR.MINOR>`) are a different axis and exempt — lines naming `envelope.schema.version` are permitted | "plugin doc proposes bumping `schema_version` MAJOR/MINOR" |
| `data_flow-authoritative` | `data_flow` is **non-authoritative** | Not advertise itself as exhaustive truth | "plugin doc claims `data_flow` enumerates all cross-plugin reads" |
| `wiki_root-prefix` | `<wiki_root>/` (underscore) is the canonical wiki path prefix | Use the same prefix in any path advertised in suite docs / sidecar | "plugin doc uses `<wiki-root>/` (hyphen) instead of `<wiki_root>/`" |
| `hooks-empty-with-reason` | `hooks_active: []` requires `hooks_intentionally_empty_reason` | Document its trust-boundary rationale | "plugin doc says hooks empty without reason; sidecar will reject" |

If a plugin needs an exception, the suite policy must change first (PR to suite AGENTS.md), then the plugin doc.

---

## How the check runs

```
scripts/check-memory-hierarchy.js
```

For each plugin in marketplace.json:
1. Fetch `README.md`, `CHANGELOG.md`, `AGENTS.md` (if present), `.claude-plugin/plugin.json` at the pinned SHA.
2. Apply the dictionary above as regex rules.
3. Emit `file:line` (file inside the cached plugin repo, line within that file's local content) for any conflict.

The check fetches via `scripts/lib/fetch-plugin-files.js`, so it shares the `.deep-suite-cache/` cache with the other M2 checkers.

---

## Adding a new policy keyword

1. Append a row to the conflict catalog above with rule + failure phrasing.
2. Append a corresponding rule to `scripts/check-memory-hierarchy.js` `POLICIES` array.
3. Add a fixture under `tests/fixtures/plugin-cache/<plugin>/` that triggers + passes the new rule.
4. Add a test case to `tests/cli-sync-checkers.test.js` (the spawn-based suite that covers all eight checkers; a dedicated `tests/check-memory-hierarchy.test.js` is **not** maintained — keep the test surface unified).

If the new policy is *security-shaped*, also bump AGENTS.md § Conventions to record the rationale (so future maintainers don't relax it without history).

---

## Source

`docs/deep-suite-harness-roadmap.md` §M2 — Cross-plugin memory hierarchy 점검.

`docs/backlog-m1-round2-deferred.md` §Recurring Pattern Alert — three findings (W-R1, W-R2, W-R3) all in the "architecture / cross-plugin contract drift" category. This file's `wiki_root-prefix` and `data_flow-authoritative` rules close that recurrence loop.
