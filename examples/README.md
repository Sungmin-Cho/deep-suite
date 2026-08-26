# Deep Suite Examples

Drop-in example packs you can copy into your own project and tweak. Each subdirectory is self-contained — you pick one or two and adapt.

## What's here

| Pack | Purpose | Files |
|---|---|---|
| [`hooks-suite-baseline/`](./hooks-suite-baseline/) | Minimal Claude Code hooks: SessionStart stale-state recovery, PreToolUse force-push guard, Stop metric flush. Drop-in safe for any project. | `.claude/settings.json` + 3 shell scripts |
| [`hooks-strict-mode/`](./hooks-strict-mode/) | Defense-in-depth: 7 dangerous-command families blocked (force-push, hard-reset-to-remote, recursive-rm, SQL DROP/TRUNCATE, kubectl-delete/drain, npm-publish, curl-pipe-shell). Self-contained — do NOT also install baseline. | `.claude/settings.json` + 3 shell scripts |
| [`handoff-phase5-to-evolve/`](./handoff-phase5-to-evolve/) | Filled-out handoff artifact template — the deep-work Phase 5 → deep-evolve canonical scenario. Copy + tweak placeholders. | `handoff-template.json` + `README.md` |
| [`deep-loop-lifecycle/`](./deep-loop-lifecycle/) | Real host-neutral lifecycle walkthrough: start → continue → resume in a fresh session → finish, with native and portable invocation surfaces. | `README.md` + `expected-run-tree.txt` |

## How to install a hooks pack

1. Pick one (`hooks-suite-baseline/` for low-impact, `hooks-strict-mode/` for stronger guardrails).
2. Copy its **entire contents** (the `.claude/` directory AND the `scripts/` directory at the same level) into your repo root:
   ```bash
   cp -r examples/hooks-suite-baseline/.claude   your-project/
   cp -r examples/hooks-suite-baseline/scripts   your-project/
   ```
3. Make the scripts executable if needed:
   ```bash
   chmod +x your-project/scripts/*.sh
   ```
4. Open Claude Code in `your-project/` — the hooks load automatically on next session start.

## Known limitations of glob-based `if` matchers

Claude Code's `Bash(<pattern>)` `if` rule matches the *visible command string* the model emits — not the semantic intent. Two consequences worth knowing:

- **SQL family is best-effort**: `Bash(* DROP TABLE *)` catches `psql -c "DROP TABLE users"` but NOT `psql -f drop.sql` (file-redirected) nor `psql -c "drop table users"` (lowercase). Treat the strict-mode SQL guards as a "uppercase keyword tripwire" rather than a comprehensive shield.
- **Bare-form completeness**: each force-push variant ships **both** the argumented form (`git push --force *`) AND the bare form (`git push --force`), so a model typing `git push --force` with no remote/branch is still blocked.

Production hardening of these patterns belongs in a downstream tool (a wrapped `psql`, a CI gate, etc.), not in the hook layer.

## Why two packs?

The baseline pack is **minimal trust**: SessionStart cleanup is informational; the only PreToolUse guard is force-push (an obvious foot-gun). Adopt this if you want a safety net without a lot of override env vars.

The strict-mode pack is **defense-in-depth**: every family has an explicit override env var (`CLAUDE_ALLOW_*`), so you can opt-in selectively. Adopt this on shared/production-touching repos where a single accidental destructive command is unacceptable.

Both packs use **exit code 2** to block — per Claude Code hook semantics, exit 1 is non-blocking ("warning") and exit 2 is blocking ("refused"). The scripts always exit 2 when refusing.

## How to validate the handoff template

```bash
# from suite repo root
node scripts/validate-artifact.js examples/handoff-phase5-to-evolve/handoff-template.json
```

The template is constructed to pass both the M3 envelope validator AND the handoff payload schema. If you adapt it for your own use, run the validator afterwards to catch typos before the receiver agent does.

## Adoption status

| Pack | Status | Notes |
|---|---|---|
| Baseline | M5.3 ✅ Active | `pre-tool-guard.sh` covers force-push; add more `if` rules to extend. |
| Strict-mode | M5.3 ✅ Active | 7 families. Add families by extending `denylist-guard.sh` `case` block + adding a `PreToolUse[].if` rule in `.claude/settings.json`. |
| Phase 5 → evolve handoff | M5.3 ✅ Template ready | Plugin-side emission is M5.7+ (deep-work + deep-evolve repos). |
| Deep-loop lifecycle | ✅ Walkthrough ready | Real commands and durable-state boundaries; no in-memory mock. |

## Reference

- `guides/hook-patterns.md` (and `.ko.md`) — design rationale, anti-patterns, denylist family table
- `guides/long-run-handoff.md` (and `.ko.md`) — handoff artifact lifecycle
- `guides/context-management.md` (and `.ko.md`) — compaction / offloading / reset policies
- `schemas/handoff.schema.json` — handoff payload schema
- `schemas/artifact-envelope.schema.json` — M3 envelope wrapper
