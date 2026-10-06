[한국어](./hook-patterns.ko.md)

# Hook Patterns Across Deep Suite

This guide documents how the 10 Deep Suite plugins use Claude Code [hooks](https://code.claude.com/docs/en/hooks) — when to add a hook, when *not* to, and what patterns the suite considers idiomatic. It is **descriptive and recommended**, not enforced: plugins are free to deviate when the rationale is documented in their sidecar entry (`hooks_intentionally_empty_reason`).

This guide is intentionally Claude Code-specific. Codex compatibility is exposed through `.agents/plugins/marketplace.json` and plugin skills, not through Claude Code hook files; when Codex behavior differs, prefer explicit skill invocation over trying to mirror hook automation.

> The accompanying executable scaffold lives in `examples/hooks-suite-baseline/` and `examples/hooks-strict-mode/`. Copy either into your own project and tweak.

> **Forward-references in this guide**: paths under `examples/`, the `schemas/handoff.schema.json` / `schemas/compaction-state.schema.json` files, and the paired `guides/long-run-handoff.md` / `guides/context-management.md` guides ship in **subsequent M5 PRs** (5.2 schemas + guides, 5.3 example pack). This document is the descriptive anchor and lands first; the cross-references resolve as those PRs merge.

---

## 1. Why hooks vs commands vs subagents

| Mechanism | When to use | Trust model |
|---|---|---|
| **Slash command** | User explicitly invokes work (`/deep-review`, `/wiki-ingest <path>`) | User-initiated; loud and visible |
| **Subagent** | Long-running parallel work the parent agent should not pollute its context with | Parent dispatches; child reports back once |
| **Hook** | Reactive, deterministic action tied to a Claude Code event (SessionStart, PreToolUse, etc.) | Runs *automatically* with the user's shell privileges — the highest-risk mechanism |

A hook is the right answer when **all three** conditions hold:

1. The action must run on every occurrence of an event (not just when the user remembers to ask).
2. The action is deterministic — no LLM reasoning required.
3. The action's blast radius is bounded (local files, single command, no shared infrastructure).

If any condition fails, prefer a slash command or skill.

---

## 2. Per-plugin hook policy

The authoritative source is `.claude-plugin/suite-extensions.json` `plugins.<name>.hooks_active` (a string array of [hook event names](https://code.claude.com/docs/en/hooks#available-hook-events)). Empty array + `hooks_intentionally_empty_reason` is a deliberate design choice, not an oversight.

| Plugin | `hooks_active` | Rationale |
|---|---|---|
| `deep-work` | `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` | Phase guard + receipt emission must be deterministic and unmissable. |
| `deep-evolve` | `PreToolUse` | Outer/inner loop guards mutation of immutable files. |
| `deep-wiki` | `SessionStart` | Pending-scan flush picks up vault changes that happened while no Claude was running. |
| `deep-review` | `[]` (intentional) | Evaluator runs **only on user invocation** to preserve the trust boundary; event-driven hooks would let the evaluator feed its own output back as input (echo chamber). |
| `deep-docs` | `[]` (intentional) | Garden operates on explicit `scan` / `garden` / `audit` invocations; auto-triggered scans create noise without raising doc-rot detection quality. |
| `deep-dashboard` | `[]` (intentional) | Aggregator is a read-only reporter; the user decides when a snapshot is meaningful. Auto-emit would produce constant-stream snapshots whose metadata noise dilutes signal. |

**Invariant**: `hooks_active` MUST equal the hook events the pinned plugin actually ships, and a plugin with `hooks_active: []` MUST set `hooks_intentionally_empty_reason` (`consumer_only: true` does not exempt it). `scripts/check-hooks-coverage.js` enforces both in `npm run docs:sync`; see `schemas/README.md` §`hooks_intentionally_empty_reason` invariant.

> `consumer_only` is reserved in the schema for future read-only consumers and is currently unused in the live sidecar — today all four empty-hooks plugins (`deep-review`, `deep-docs`, `deep-dashboard`, `deep-goal`) ship `hooks_intentionally_empty_reason`.

---

## 3. Recommended patterns

### 3.1 SessionStart — recover from prior-session debris

Run when Claude Code starts (any matcher: `startup`, `resume`, `clear`, `compact`). Use it to detect and clean up state the prior session may have left behind.

**Pattern**: read a plugin-owned state file, decide whether it is stale, and either compact it or refresh it.

```jsonc
// .claude/settings.json
{
  "hooks": {
    "SessionStart": [
      {
        // matcher omitted = fires on every SessionStart cause (startup, resume,
        // clear, compact). Use e.g. "startup|resume" to narrow.
        "hooks": [
          { "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/scripts/session-open.sh" }
        ]
      }
    ]
  }
}
```

```bash
# scripts/session-open.sh
#!/usr/bin/env bash
set -euo pipefail
state="${CLAUDE_PLUGIN_DATA:-.claude/state}/last-run.json"
[[ -f "$state" ]] || { echo "no prior state"; exit 0; }
# Stale if older than 24h
if [[ $(find "$state" -mtime +1 -print -quit) ]]; then
  mv "$state" "${state}.stale-$(date +%s)"
  echo "rotated stale state: $state"
fi
```

**Why**: long-running projects accumulate dangling `.deep-work/<session>/...` directories. SessionStart is the natural place to detect and rotate them so the new session starts clean. See deep-work's `deep-work/hooks/session-start.sh` for the canonical implementation pattern.

### 3.2 PreToolUse — permission gates with `if`

PreToolUse runs before every tool call. The matcher narrows which calls trigger the hook; the inner `if` rule narrows further by tool argument shape. Use this to *gate* operations rather than to *trace* them.

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/scripts/pre-tool-guard.sh",
            "if": "Bash(git push --force *)" }
        ]
      }
    ]
  }
}
```

```bash
# scripts/pre-tool-guard.sh — denies force-push outright
#!/usr/bin/env bash
set -euo pipefail
if [[ "${CLAUDE_ALLOW_FORCE_PUSH:-0}" == "1" ]]; then
  exit 0
fi
cat <<'EOF' >&2
✗ refused: 'git push --force' requires explicit user override.
  If you really mean this, set CLAUDE_ALLOW_FORCE_PUSH=1 in the shell that
  ran `claude`, then retry. Hooks see the env var via inheritance.
EOF
exit 2   # exit code 2 blocks the tool call; exit 1 is non-blocking warning
```

**Why**: the system prompt already discourages destructive operations, but the hook layer makes it *unbypassable* by an off-policy model output. The full denylist lives in `examples/hooks-strict-mode/scripts/denylist-guard.sh`.

### 3.3 PostToolUse — emit envelope artifacts

Use PostToolUse when a tool result is the natural place to materialize an [M3 envelope-wrapped artifact](../docs/envelope-migration.md). The receipt is written to disk so a future session (or a separate plugin) can read it back without re-running the work.

```bash
# scripts/post-tool-emit-receipt.sh — minimal sketch
#!/usr/bin/env bash
set -euo pipefail
# PostToolUse passes the tool result JSON on stdin (not as a positional arg).
payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT
cat > "$payload"
run_id="$(uuidgen | tr 'A-Z' 'a-z')"
out=".deep-myplugin/${run_id}/receipt.json"
mkdir -p "$(dirname "$out")"
node "${CLAUDE_PROJECT_DIR}/scripts/wrap-artifact.js" \
  --producer my-plugin \
  --kind tool-receipt \
  --schema 'tool-receipt:1.0' \
  --payload-file "$payload" \
  --out "$out"
```

**Why**: cross-plugin readers (e.g., deep-dashboard's `suite-collector.js`) discover artifacts by scanning the filesystem. Emitting under `.deep-<plugin>/...` makes the artifact discoverable; wrapping it in an envelope (`schemas/artifact-envelope.schema.json`) makes the metadata machine-readable.

### 3.4 Stop — flush metrics and compact context

The Stop event fires when Claude is about to end its turn. Use it to flush in-memory state to disk (so the next session reads it back) and, optionally, to write a compaction-state artifact (`schemas/compaction-state.schema.json`).

```bash
# scripts/stop-flush-metrics.sh
#!/usr/bin/env bash
set -euo pipefail
metrics="${CLAUDE_PLUGIN_DATA:-.claude/state}/metrics.jsonl"
mkdir -p "$(dirname "$metrics")"
printf '{"ts":"%s","event":"stop","session":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${CLAUDE_SESSION_ID:-unknown}" >> "$metrics"
```

**Why**: this is also the natural surface for emitting a `compaction-state.json` if the session compacted context mid-run. See `guides/context-management.md` for the policy.

---

## 4. Anti-patterns

| Anti-pattern | Why it's bad |
|---|---|
| Hook that calls an LLM synchronously on a hot path (PreToolUse / PostToolUse) | Per-tool-call latency cost + non-determinism + echo-chamber risk if the called LLM ingests the same project's prior output. Acceptable on SessionStart / Stop where latency is amortized; on hot-path events, prefer a deterministic command and dispatch the LLM work to a subagent via slash command. |
| Hook that runs slow (>2 s) | Blocks every tool call; users perceive Claude as hung. Move slow work to a subagent + slash command. |
| Hook that writes to a *peer* plugin's data directory | Violates plugin ownership; only the owning plugin should write its `.deep-<name>/` tree. Cross-plugin reads are fine; writes are not. |
| Hook with broad matcher and per-call side effects | Multiplies noise across the session. Narrow the matcher to specific tools (e.g., `Bash`, `Write`, `Edit`) and add an inner `if` rule. |
| Hook that depends on a remote service | If the network is down, every tool call fails. Push remote calls into commands the user explicitly invokes. |
| Hook that emits an artifact *without* the envelope wrap | Loses cross-plugin discoverability and the `run_id` chain (M3 §6.1 fallback timer expires 2026-11-07 — after that, raw artifacts get a dashboard warning). |

---

## 5. Dangerous-command denylist — the suite recommendation

The strict-mode example pack (`examples/hooks-strict-mode/`) ships a denylist guard that blocks the following families by default. Copy it; tune the patterns; commit to your repo.

| Family | Matcher (`if`) | Why |
|---|---|---|
| Force push | `Bash(git push --force *)`, `Bash(git push -f *)` | Can overwrite teammates' work upstream. |
| Hard reset to remote | `Bash(git reset --hard origin/*)` | Discards local commits without confirmation. |
| Recursive delete | `Bash(rm -rf *)` (catches `rm -rf build/`, `rm -rf .next/`, etc. — broadest, then add specific overrides for known-safe paths via `if` env-var) | Catastrophic, unrecoverable. |
| Drop / truncate SQL | `Bash(* DROP TABLE *)`, `Bash(* TRUNCATE *)` | Production data loss. |
| Kubectl destructive | `Bash(kubectl delete *)`, `Bash(kubectl drain *)` | Affects shared infrastructure. |

> **Permission-rule syntax reminder**: `Bash(<glob>)` matches the Bash tool's `command` argument as a glob, not a regex. Use `*` for "anything"; backslashes are literal. The denylist's job is not to be exhaustive — it makes the *common* foot-guns require an explicit override (`exit 2` blocks the call; `exit 0` allows it).


---

## 6. When to leave hooks empty (the deep-review pattern)

Three plugins in the suite intentionally ship `hooks_active: []`:

- **`deep-review`** — evaluator. An evaluator with an event-driven hook ingests its own review output as input on the next event, creating an echo chamber. The trust boundary requires user invocation.
- **`deep-docs`** — garden. Doc-rot detection is a *user-judged* activity; auto-running `scan` on every tool call drowns real findings in noise.
- **`deep-dashboard`** — aggregator. Snapshots are valuable when the user wants a snapshot; constant auto-emit dilutes signal.

The pattern: **if your plugin's value is "the user explicitly asked for this," don't add hooks**. Document the choice in `hooks_intentionally_empty_reason` so the next maintainer doesn't try to "fill in" the empty array.

---

## 7. Hooks and the M3 envelope

The M3 [common artifact envelope](../docs/envelope-migration.md) is independent of hooks, but they compose naturally:

- A PostToolUse hook is a great place to call `scripts/wrap-artifact.js` (M3 Phase 2 plugin-maintainer helper) and emit an envelope-wrapped receipt.
- A Stop hook is a great place to emit a `compaction-state.json` artifact when context was compacted mid-session.
- A SessionStart hook should *read* the prior envelope (via `envelope.run_id` / `parent_run_id`) to reconstruct cross-plugin lineage on resume.

`deep-dashboard/lib/suite-collector.js` aggregates whatever envelopes it finds. If a plugin chooses to emit via a hook, the dashboard picks it up automatically — no per-plugin shim required.

---

## 8. Example pack quick links

| Pack | What it does | Path |
|---|---|---|
| Baseline | SessionStart + PreToolUse + Stop scaffold; safe to drop into any project | `examples/hooks-suite-baseline/` |
| Strict mode | Adds dangerous-command denylist; gates force-push, hard-reset, recursive-rm, DROP TABLE, kubectl-delete | `examples/hooks-strict-mode/` |
| Phase 5 → evolve handoff | Long-run handoff template + sample state files | `examples/handoff-phase5-to-evolve/` |

---

## 9. Further reading

- Claude Code [hooks reference](https://code.claude.com/docs/en/hooks) — official event list and matcher syntax.
- `docs/envelope-migration.md` §6 — adoption ledger and 6-month legacy-fallback timer.
- `guides/long-run-handoff.md` — when a hook should emit a handoff artifact rather than a receipt.
- `guides/context-management.md` — compaction / offloading / reset policy (paired with `schemas/compaction-state.schema.json`).
- `docs/memory-hierarchy.md` — where suite-level policy lives vs per-plugin policy.

---

> *Last updated as part of M5. Hook policy is descriptive — deviations are fine when documented in the plugin's sidecar entry.*
