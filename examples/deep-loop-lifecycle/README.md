# Deep-loop Multi-session Lifecycle

This walkthrough shows the real deep-loop lifecycle without pretending that a local mock is the plugin. The protocol is the same across compatible AI agent tools; only installation, invocation syntax, hooks, and runtime-specific containment differ.

## Before you start

- Run from the project root where durable state should live.
- Make the deep-loop plugin or its `skills/` directory available to the active agent host.
- Use a genuinely loop-shaped goal: multiple workstreams, independent maker/checker work, or work expected to cross session boundaries.
- Never edit `loop.json`, `.loop.hash`, or `event-log.jsonl` manually; every durable state/event mutation goes through the deep-loop kernel. The Finish skill may write `final-report.md` at the kernel-resolved run path before asking the kernel to finalize the run.

Example goal used below:

> Audit the authentication subsystem, fix the verified defects in bounded workstreams, independently review each change, and finish only when the evidence gates pass.

## Invocation surfaces

| Lifecycle action | Claude Code and supported Grok slash hosts | Codex | Other compatible skill-capable agents |
|---|---|---|---|
| Start | `/deep-loop "Audit the authentication subsystem, fix the verified defects in bounded workstreams, independently review each change, and finish only when the evidence gates pass."` | `$deep-loop:deep-loop "Audit the authentication subsystem, fix the verified defects in bounded workstreams, independently review each change, and finish only when the evidence gates pass."` | Invoke `skills/deep-loop/SKILL.md` with the goal as its arguments |
| Continue | `/deep-loop-continue` | `$deep-loop:deep-loop-continue` | Invoke `skills/deep-loop-continue/SKILL.md` |
| Resume | `/deep-loop-resume` | `$deep-loop:deep-loop-resume` | Invoke `skills/deep-loop-resume/SKILL.md` using the exact handoff/recovery input emitted by the kernel |
| Finish | `/deep-loop-finish` | `$deep-loop:deep-loop-finish` | Invoke `skills/deep-loop-finish/SKILL.md` |

Claude Code and Codex have native marketplace discovery. Grok support is plugin- and runtime-specific; deep-loop v1.22.0 documents attended macOS operation and does not claim Grok compact or unattended parity. Copilot CLI, Gemini CLI, Agent SDK clients, and similar tools can consume the portable skill entries when their host adapter can provide the required tools and permissions.

## 1. Start

Invoke the Start entry for the active host. Deep-loop checks whether the goal is loop-shaped, detects installed sibling plugins, chooses a recipe/protocol, decomposes the goal into workstreams, and creates durable state under:

```text
.deep-loop/runs/<run-id>/
```

Record the immutable `<run-id>` printed by the plugin. `.deep-loop/current` is only a last-created hint and is not routing authority.

## 2. Continue

Invoke Continue in the same owner conversation. One tick follows the kernel-returned next action, such as dispatching a maker, awaiting its result, reading its artifact, or dispatching a checker.

Repeat Continue while the current workstream remains open. Do not switch sessions merely because one tick completed; deep-loop keeps affinity until the exact first terminal workstream boundary.

## 3. Resume in a new session

At a valid handoff or preserve-pause boundary, open the new agent session at the recorded project root. Invoke Resume using the exact handoff/recovery input emitted by deep-loop. Do not reconstruct, shorten, or edit a recovery command.

Resume validates the durable boundary and ownership fence before acquiring the run. After acquisition, Continue advances the newly owned workstream.

## 4. Finish

When all required episodes and workstreams are settled and the kernel routes to finishing, invoke Finish. The skill writes `final-report.md`, then the kernel transitions the run to `completed` only when every completion proof passes. `FINISH_PROOF_UNMET` reports the missing evidence and returns control to the human; it does not select another terminal state. `stopped` is a proof-bypass that requires explicit human confirmation and the kernel's `--confirm` gate, and an autonomous or headless tick never chooses it.

The companion [`expected-run-tree.txt`](./expected-run-tree.txt) shows the stable top-level artifacts to expect. A real run may add checkpoints, transactions, observations, recovery capsules, and terminal-launch metadata depending on the active host and events.

## Portability boundary

The lifecycle and durable artifact contract are host-neutral. Native plugin discovery, lifecycle hooks, sandbox strength, automatic compaction, visible-session launch, and unattended execution are not assumed to be identical across Claude Code, Codex, Grok, Copilot CLI, Gemini CLI, Agent SDK, or another AI agent tool. Follow the installed plugin's runtime contract whenever it is narrower than this walkthrough.
