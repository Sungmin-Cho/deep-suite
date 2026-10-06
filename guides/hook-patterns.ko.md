[English](./hook-patterns.md)

# Deep Suite Hook 패턴 가이드

이 문서는 Deep Suite 10개 플러그인이 Claude Code [hook](https://code.claude.com/docs/en/hooks)을 어떻게 활용하는지 — 언제 hook을 추가하고, 언제 *추가하지 말아야* 하며, suite가 권장하는 패턴은 무엇인지 — 를 정리한다. 본 가이드는 **권고 (descriptive + recommended)** 이며 강제되지 않는다. 플러그인이 다른 선택을 할 때는 sidecar entry의 `hooks_intentionally_empty_reason`에 사유를 기록한다.

이 가이드는 의도적으로 Claude Code 전용이다. Codex 호환성은 Claude Code hook 파일이 아니라 `.agents/plugins/marketplace.json` 및 플러그인 skill로 노출된다. Codex 동작이 달라지는 경우 hook 자동화를 억지로 미러링하기보다 명시적 skill 호출을 우선한다.

> 실행 가능한 scaffold는 `examples/hooks-suite-baseline/`, `examples/hooks-strict-mode/`에 있다. 그대로 복사한 뒤 프로젝트에 맞춰 조정.

> **이 가이드의 전방 참조**: `examples/` 하위 경로, `schemas/handoff.schema.json` / `schemas/compaction-state.schema.json` 파일, 그리고 짝을 이루는 `guides/long-run-handoff.ko.md` / `guides/context-management.ko.md` 가이드는 **후속 M5 PR** (5.2 schema + guide, 5.3 example pack) 에서 산출된다. 본 문서는 descriptive anchor 로 가장 먼저 land 하며, cross-reference 는 후속 PR 머지 시점에 해소된다.

---

## 1. Hook vs Command vs Subagent — 언제 무엇을 쓸까

| 메커니즘 | 사용 시점 | 신뢰 모델 |
|---|---|---|
| **Slash command** | 사용자가 명시적으로 작업 호출 (`/deep-review`, `/wiki-ingest <path>`) | User-initiated; loud and visible |
| **Subagent** | 부모 에이전트의 컨텍스트를 오염시키지 않고 병렬로 돌릴 작업 | 부모가 dispatch, 자식이 1회 보고 |
| **Hook** | Claude Code 이벤트(SessionStart, PreToolUse 등)에 묶인 결정론적 자동 동작 | 사용자 셸 권한으로 *자동 실행* — 가장 위험한 메커니즘 |

Hook이 정답이 되려면 **세 가지가 모두** 성립해야 한다:

1. 이벤트가 발생할 때마다 매번 실행되어야 한다 (사용자가 잊지 않으리라 기대할 수 없다).
2. LLM 추론이 필요 없는 결정론적 동작이다.
3. blast radius가 제한적이다 (로컬 파일, 단일 명령, 공유 인프라 미접근).

세 조건 중 하나라도 깨지면 slash command 또는 skill을 쓴다.

---

## 2. 플러그인별 hook 정책

진실의 단일 원본은 `.claude-plugin/suite-extensions.json`의 `plugins.<name>.hooks_active` ([hook event 이름](https://code.claude.com/docs/en/hooks#available-hook-events) 문자열 배열). `hooks_active: []` + `hooks_intentionally_empty_reason`은 누락이 아닌 의도된 설계다.

| 플러그인 | `hooks_active` | 근거 |
|---|---|---|
| `deep-work` | `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` | Phase guard + receipt 발행은 결정론적이고 빠짐없이 일어나야 함. |
| `deep-evolve` | `PreToolUse` | Outer/inner loop이 immutable 파일 변경을 차단. |
| `deep-wiki` | `SessionStart` | Claude가 꺼져 있던 사이 vault 변경을 pending-scan 으로 처리. |
| `deep-review` | `[]` (의도적) | Evaluator는 **사용자 호출에서만** 실행되어 trust boundary 유지. Event-driven hook은 evaluator가 자기 출력을 입력으로 받는 echo chamber를 만든다. |
| `deep-docs` | `[]` (의도적) | Garden은 `scan`/`garden`/`audit` 명시 호출로만 동작. 자동 trigger는 doc-rot 감지 품질을 떨어뜨리는 noise를 만든다. |
| `deep-dashboard` | `[]` (의도적) | Aggregator는 read-only reporter. 사용자가 의미 있다고 판단할 때만 스냅샷이 가치 있다. 상시 auto-emit은 신호 대비 잡음 비를 떨어뜨린다. |

**불변식**: `hooks_active`는 pin된 플러그인이 실제로 제공하는 hook 이벤트와 같아야 하고, `hooks_active: []`인 플러그인은 반드시 `hooks_intentionally_empty_reason`을 가져야 한다(`consumer_only: true`로 면제되지 않는다). `scripts/check-hooks-coverage.js`가 `npm run docs:sync`에서 둘 다 검사한다. `schemas/README.md` §`hooks_intentionally_empty_reason` invariant 참조.

> `consumer_only` 는 schema 차원에서 향후 read-only consumer 용으로 예약돼 있고 현재 sidecar에서는 사용되지 않는다 — 오늘 네 plugin(`deep-review`, `deep-docs`, `deep-dashboard`, `deep-goal`) 은 모두 `hooks_intentionally_empty_reason`을 사용한다.

---

## 3. 권장 패턴

### 3.1 SessionStart — 이전 세션의 잔재 정리

Claude Code가 시작될 때 실행 (어떤 matcher든: `startup`, `resume`, `clear`, `compact`). 이전 세션이 남긴 state를 감지·정리한다.

**패턴**: 플러그인 소유 state 파일을 읽고, stale 여부를 판단하여 compact / refresh.

```jsonc
// .claude/settings.json
{
  "hooks": {
    "SessionStart": [
      {
        // matcher 생략 = 모든 SessionStart 원인(startup, resume, clear, compact)에서 발동.
        // 범위를 좁히려면 예: "startup|resume" 같이 지정.
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
# 24시간 이상 경과 시 stale
if [[ $(find "$state" -mtime +1 -print -quit) ]]; then
  mv "$state" "${state}.stale-$(date +%s)"
  echo "rotated stale state: $state"
fi
```

**왜**: 장기간 진행되는 프로젝트는 `.deep-work/<session>/...` 같은 경로에 dangling 디렉토리를 쌓는다. SessionStart는 그것을 감지하고 rotation하여 새 세션을 clean하게 시작하는 자연스러운 지점이다. Canonical 구현은 deep-work의 `deep-work/hooks/session-start.sh` 참고.

### 3.2 PreToolUse — `if`로 permission gate

PreToolUse는 모든 tool call 전에 실행된다. matcher가 어떤 호출이 trigger되는지 좁히고, 안쪽 `if` 규칙이 tool 인자 형태로 더 좁힌다. 동작 *추적*이 아닌 *차단*에 쓴다.

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
# scripts/pre-tool-guard.sh — force-push 직접 차단
#!/usr/bin/env bash
set -euo pipefail
if [[ "${CLAUDE_ALLOW_FORCE_PUSH:-0}" == "1" ]]; then
  exit 0
fi
cat <<'EOF' >&2
✗ refused: 'git push --force' requires explicit user override.
  진짜로 의도했다면 `claude`를 실행한 셸에서 CLAUDE_ALLOW_FORCE_PUSH=1
  환경변수를 세팅하고 재시도. Hook은 env 상속으로 이 변수를 본다.
EOF
exit 2   # exit code 2가 tool call을 차단; exit 1은 non-blocking warning일 뿐
```

**왜**: 시스템 프롬프트가 이미 파괴적 작업을 만류하지만, hook 레이어가 그것을 *우회 불가능*하게 만든다 — off-policy 모델 출력에도 무방비가 아니다. 전체 denylist는 `examples/hooks-strict-mode/scripts/denylist-guard.sh`에 있다.

### 3.3 PostToolUse — envelope artifact 발행

Tool 결과를 [M3 envelope 래핑 아티팩트](../docs/envelope-migration.md)로 자연스럽게 물질화할 자리가 PostToolUse다. Receipt가 디스크에 기록되면 미래 세션 (또는 다른 플러그인) 이 작업을 재실행하지 않고 다시 읽을 수 있다.

```bash
# scripts/post-tool-emit-receipt.sh — 최소 스케치
#!/usr/bin/env bash
set -euo pipefail
# PostToolUse 는 tool 결과 JSON을 stdin으로 전달한다 (positional arg 아님).
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

**왜**: cross-plugin reader (예: deep-dashboard의 `suite-collector.js`) 는 파일시스템 스캔으로 아티팩트를 발견한다. `.deep-<plugin>/...` 아래에 발행하면 발견 가능해지고, envelope (`schemas/artifact-envelope.schema.json`) 으로 감싸면 메타데이터가 machine-readable해진다.

### 3.4 Stop — metric flush 및 컨텍스트 compaction

Stop 이벤트는 Claude가 턴을 종료하기 직전에 fire된다. 인메모리 state를 디스크로 flush (다음 세션이 다시 읽음) 하고, 선택적으로 compaction-state artifact (`schemas/compaction-state.schema.json`) 를 발행한다.

```bash
# scripts/stop-flush-metrics.sh
#!/usr/bin/env bash
set -euo pipefail
metrics="${CLAUDE_PLUGIN_DATA:-.claude/state}/metrics.jsonl"
mkdir -p "$(dirname "$metrics")"
printf '{"ts":"%s","event":"stop","session":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${CLAUDE_SESSION_ID:-unknown}" >> "$metrics"
```

**왜**: 세션 중 컨텍스트가 compact 됐다면 `compaction-state.json`을 발행하기에도 자연스러운 surface다. 정책은 `guides/context-management.ko.md` 참고.

---

## 4. 안티패턴

| 안티패턴 | 왜 나쁜가 |
|---|---|
| 핫패스(PreToolUse / PostToolUse)에서 LLM을 동기 호출하는 hook | Per-tool-call 지연 + 비결정론 + 같은 프로젝트의 이전 출력을 LLM이 다시 먹는 echo chamber. SessionStart / Stop 처럼 지연이 amortize 되는 자리에서는 허용; 핫패스에서는 결정론적 command 만 두고 LLM 작업은 slash command가 subagent에게 dispatch 하도록. |
| 느린 hook (>2 s) | 모든 tool call을 block — 사용자에게 Claude가 멎은 것처럼 보인다. 느린 작업은 subagent + slash command로 옮겨라. |
| *다른* 플러그인 데이터 디렉토리에 쓰는 hook | 플러그인 소유권 위반; 각 플러그인은 자기 `.deep-<name>/` 트리에만 쓴다. Cross-plugin 읽기는 괜찮지만 쓰기는 안 된다. |
| 광범위한 matcher + per-call 부작용 | 세션 전체에 잡음을 증폭. matcher를 좁은 tool 이름(예: `Bash`, `Write`, `Edit`) 으로 한정하고 안쪽 `if` 규칙으로 추가 조건을 건다. |
| 원격 서비스에 의존하는 hook | 네트워크 다운 시 모든 tool call 실패. 원격 호출은 user가 명시 호출하는 command 쪽에 둔다. |
| Envelope wrap *없이* artifact 발행 | Cross-plugin 발견성과 `run_id` chain을 잃는다 (M3 §6.1 fallback timer는 2026-11-07 만료 — 그 이후로는 raw artifact가 dashboard warning 대상). |

---

## 5. Dangerous-command denylist — suite 권장안

`examples/hooks-strict-mode/`의 denylist guard는 기본적으로 다음 카테고리를 차단한다. 복사 후 패턴을 조정하여 repo에 commit하라.

| Family | Matcher (`if`) | 이유 |
|---|---|---|
| Force push | `Bash(git push --force *)`, `Bash(git push -f *)` | 동료의 upstream 작업을 덮어쓸 수 있다. |
| Hard reset to remote | `Bash(git reset --hard origin/*)` | 로컬 commit을 확인 없이 폐기. |
| 재귀 삭제 | `Bash(rm -rf *)` (`rm -rf build/`, `rm -rf .next/` 등을 모두 잡는 가장 넓은 패턴 — 알려진 안전 경로는 `if` env-var override 로 풀어준다) | 회복 불가능한 파국. |
| SQL drop / truncate | `Bash(* DROP TABLE *)`, `Bash(* TRUNCATE *)` | 운영 데이터 손실. |
| Kubectl 파괴적 | `Bash(kubectl delete *)`, `Bash(kubectl drain *)` | 공유 인프라 영향. |

> **Permission-rule syntax 보충**: `Bash(<glob>)` 은 Bash tool의 `command` 인자를 glob(정규표현식 아님)으로 매칭한다. `*`이 "임의 문자열"이고, 백슬래시는 리터럴. Denylist의 목적은 망라 (exhaustive) 가 아니라, *흔한* foot-gun이 명시 override를 요구하도록 만드는 것 (`exit 2` 차단; `exit 0` 허용).

---

## 6. Hook을 비워두기 — deep-review 패턴

Suite 내 3개 플러그인이 의도적으로 `hooks_active: []`를 선택했다:

- **`deep-review`** — evaluator. Event-driven hook을 가진 evaluator는 자기 리뷰 출력을 다음 이벤트의 입력으로 먹어 echo chamber를 만든다. Trust boundary는 user invocation을 요구한다.
- **`deep-docs`** — garden. Doc-rot 감지는 *user-judged* 활동; 모든 tool call마다 `scan` 자동 실행은 실제 finding을 noise에 잠기게 한다.
- **`deep-dashboard`** — aggregator. 스냅샷은 사용자가 원할 때 가치 있다; 상시 auto-emit은 신호를 희석한다.

패턴: **플러그인의 가치 명제가 "사용자가 명시적으로 요청"인 경우 hook을 두지 마라**. 다음 유지보수자가 빈 배열을 "채우려" 시도하지 않도록 `hooks_intentionally_empty_reason`에 선택을 기록.

---

## 7. Hook과 M3 envelope

M3 [공통 artifact envelope](../docs/envelope-migration.md)은 hook과 독립적이지만 자연스럽게 합성된다:

- PostToolUse hook은 `scripts/wrap-artifact.js` (M3 Phase 2 plugin-maintainer 헬퍼) 를 호출하여 envelope 래핑 receipt 발행에 좋은 자리.
- Stop hook은 세션 중 컨텍스트가 compact 됐을 때 `compaction-state.json`을 발행하기 좋은 자리.
- SessionStart hook은 resume 시 이전 envelope (`envelope.run_id` / `parent_run_id`) 을 *읽어* cross-plugin lineage를 재구성해야 한다.

`deep-dashboard/lib/suite-collector.js`는 발견되는 envelope을 모두 aggregate한다. 플러그인이 hook을 통해 emit하면 dashboard가 자동으로 픽업 — per-plugin shim 불필요.

---

## 8. Example pack 빠른 링크

| Pack | 동작 | 경로 |
|---|---|---|
| Baseline | SessionStart + PreToolUse + Stop scaffold; 어떤 프로젝트에도 drop-in 안전 | `examples/hooks-suite-baseline/` |
| Strict mode | Dangerous-command denylist 추가; force-push, hard-reset, 재귀-rm, DROP TABLE, kubectl-delete 차단 | `examples/hooks-strict-mode/` |
| Phase 5 → evolve handoff | Long-run handoff 템플릿 + 샘플 state 파일 | `examples/handoff-phase5-to-evolve/` |

---

## 9. 더 읽기

- Claude Code [hooks 레퍼런스](https://code.claude.com/docs/en/hooks) — 공식 이벤트 목록 + matcher syntax.
- `docs/envelope-migration.md` §6 — adoption ledger 와 6개월 legacy-fallback timer.
- `guides/long-run-handoff.ko.md` — hook이 receipt 대신 handoff artifact를 발행해야 할 때.
- `guides/context-management.ko.md` — compaction / offloading / reset 정책 (`schemas/compaction-state.schema.json`과 짝).
- `docs/memory-hierarchy.md` — suite-level 정책 vs per-plugin 정책 분포.

---

> *M5의 일부로 최종 갱신. Hook 정책은 권고 (descriptive) 다 — sidecar entry에 사유가 문서화되면 deviation OK.*
