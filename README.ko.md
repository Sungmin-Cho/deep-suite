[English](./README.md) | **한국어**

# Deep Suite

[![License: MIT](https://img.shields.io/github/license/Sungmin-Cho/deep-suite)](LICENSE) ![Plugins](https://img.shields.io/badge/plugins-10-5b8def) ![범위](https://img.shields.io/badge/범위-AI%20agent%20tools-blue)

**AI 코딩 에이전트는 강력하지만, 예측 가능한 방식으로 실패합니다** — 리서치를 건너뛰고, 과도하게 수정하고, 아키텍처에서 벗어나고, 자기 작업을 스스로 승인하고, 세션 사이에 맥락을 잃습니다.

Deep Suite는 AI 코딩을 **구조화·검증 가능·지속 가능**하게 만드는 **AI 에이전트용 하네스 레이어**입니다. 코딩 전에 계획하게 하고, 작성한 코드를 독립 평가자가 리뷰하며, 지식을 잃지 않고 축적하고, 장기 작업을 여러 세션에 걸쳐 이어갑니다. Claude Code와 Codex에는 네이티브 marketplace 표면을 제공하지만, 기반 skill 및 artifact 계약은 호환 가능한 범용 AI 에이전트 도구를 대상으로 합니다.

### 여기서 시작하세요 — 10개 다 말고, 하나만 설치

| 플러그인 | 무엇을 고치나 |
|---|---|
| **[deep-work](https://github.com/Sungmin-Cho/deep-work)** | 생각보다 먼저 코딩하는 문제. 명세 우선 · TDD 기반 흐름을 강제: 브레인스토밍 → 리서치 → 명세 → 계획 → 구현 → 테스트. |
| **[deep-review](https://github.com/Sungmin-Cho/deep-review)** | 자가 승인 편향. 별도 평가자 에이전트가 AI가 작성한 코드를 리뷰 — 작성자가 자기 diff를 스스로 승인하지 못하게. |
| **[deep-loop](https://github.com/Sungmin-Cho/deep-loop)** | 긴 작업에서 맥락을 잃는 문제. proposal-only 안전성으로 다중 세션 작업을 끊김 없이 진행. |

다른 기능이 필요하다면 전체 [문제 → 플러그인 선택표](#통합-워크플로우)를 확인하세요.

```text
Before:  에이전트가 바로 수정  →  테스트 누락  →  자기 diff를 스스로 승인
After:   deep-work가 리서치 → 명세 → 계획 → TDD → 리시트 실행,
         이후 deep-review가 독립적으로 승인
```

나머지 7개 — **wiki, memory, docs, dashboard, evolve, goal, model router** — 는 지식 축적, 크로스-프로젝트 메모리, 문서 가드닝, 하네스 텔레메트리, 자율 실험, 목표 컴파일, 위험 기반 모델 라우팅이 필요해질 때 스위트를 확장합니다.

[Harness Engineering](https://martinfowler.com/articles/harness-engineering.html) 프레임워크 (Böckeler/Fowler, 2026) 기반 — `Agent = Model + Harness` — Guides(feedforward) × Sensors(feedback) 축을 Computational/Inferential 제어와 교차 매핑한다.

## 플러그인

<!-- deep-suite:auto-generated:plugin-table-ko:start -->

| 플러그인 | 버전 | 설명 |
|---|---|---|
| [deep-work](https://github.com/Sungmin-Cho/deep-work) | 7.3.0 | Evidence-Driven Development Protocol |
| [deep-wiki](https://github.com/Sungmin-Cho/deep-wiki) | 1.10.1 | Exact worker contracts with bounded timeout fallback and journaled wiki mutation |
| [deep-evolve](https://github.com/Sungmin-Cho/deep-evolve) | 3.6.3 | Autonomous Experimentation Protocol |
| [deep-review](https://github.com/Sungmin-Cho/deep-review) | 2.9.0 | Independent Evaluator for AI coding agents |
| [deep-docs](https://github.com/Sungmin-Cho/deep-docs) | 1.7.0 | Document gardening + authoring |
| [deep-dashboard](https://github.com/Sungmin-Cho/deep-dashboard) | 1.5.1 | Cross-plugin harness diagnostics + suite telemetry |
| [deep-memory](https://github.com/Sungmin-Cho/deep-memory) | 1.0.6 | Cross-project semantic memory |
| [deep-goal](https://github.com/Sungmin-Cho/deep-goal) | 1.2.1 | Goal condition compiler |
| [deep-loop](https://github.com/Sungmin-Cho/deep-loop) | 1.22.0 | Loop Engineering control plane over the deep-suite |
| [deep-model-router](https://github.com/Sungmin-Cho/deep-model-router) | 1.9.0 | Deterministic model/effort/review router |

<!-- deep-suite:auto-generated:plugin-table-ko:end -->

> 위 표는 marketplace manifest와 각 플러그인의 pinned `plugin.json.version` 으로부터 자동 생성됩니다. 직접 편집하지 말고 `.claude-plugin/marketplace.json` / `.agents/plugins/marketplace.json` 를 수정하세요. 갱신은 `node scripts/generate-reference-sections.js --write`.

각 플러그인은 별도 Git 저장소: `github.com/Sungmin-Cho/deep-{name}`. marketplace **이름**은 기존 설치의 플러그인 키를 보존하기 위해 `claude-deep-suite` 를 유지하지만, 이 역사적 키가 프로토콜을 특정 호스트로 제한하지는 않습니다.

## 런타임 표면

Deep Suite의 protocol과 artifact 계층은 호스트 중립적이며, 설치·hook·도구 권한·호출 문법은 각 호스트 adapter가 담당합니다.

| 표면 | 상태 | 노출 방식 |
|---|---|---|
| Claude Code | 네이티브 marketplace | `.claude-plugin/marketplace.json` 및 slash-command 호환 skill |
| Codex | 네이티브 marketplace | `.agents/plugins/marketplace.json` 및 각 플러그인의 `.codex-plugin/plugin.json` |
| Grok | 플러그인별 adapter | 각 플러그인이 Grok runtime 계약을 명시한 범위에서 지원. 예: deep-loop의 attended macOS slash-command 실행 |
| Copilot CLI, Gemini CLI, Agent SDK 및 유사 도구 | 이식 가능한 skill 표면 | 설치된 `skills/<skill>/SKILL.md` 진입점을 해당 호스트의 skill/tool adapter로 호출 |

네이티브 marketplace 지원은 해당 호스트에 설치와 탐색이 통합되어 있다는 뜻입니다. 이식 가능한 skill 지원은 다른 호환 AI 에이전트가 같은 workflow 계약을 소비할 수 있다는 뜻이며, 모든 호스트에서 hook이나 sandbox 강도가 같다는 주장은 아닙니다.

---

## 설치

### Claude Code

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI 설치 및 설정 완료

```bash
# 1. 마켓플레이스 추가
/plugin marketplace add Sungmin-Cho/deep-suite

# 2. 하나만 설치해서 시작 — 각 플러그인은 독립적으로 동작
/plugin install deep-work@claude-deep-suite

# 3. 실행해보기
/deep-work "flaky 인증 테스트 고쳐줘"
```

> 마켓플레이스는 GitHub `owner/repo` 슬러그로 추가하지만, 플러그인 설치는 마켓플레이스
> **name**(`claude-deep-suite`) 기준이다 — 그래서 `deep-work@claude-deep-suite`.

<details>
<summary>전체 설치 (10개 모두)</summary>

```bash
/plugin install deep-work@claude-deep-suite
/plugin install deep-review@claude-deep-suite
/plugin install deep-loop@claude-deep-suite
/plugin install deep-wiki@claude-deep-suite
/plugin install deep-memory@claude-deep-suite
/plugin install deep-docs@claude-deep-suite
/plugin install deep-dashboard@claude-deep-suite
/plugin install deep-evolve@claude-deep-suite
/plugin install deep-goal@claude-deep-suite
/plugin install deep-model-router@claude-deep-suite
```
</details>

### Codex

```bash
codex plugin marketplace add Sungmin-Cho/deep-suite
```

Codex는 native marketplace mirror인 `.agents/plugins/marketplace.json` 를 읽고, 각 pinned plugin은 `.codex-plugin/plugin.json` 및 `skills/<skill>/SKILL.md` 로 Codex skill을 노출한다.

예시는 짧게 읽히도록 Claude Code slash 형식을 자주 사용합니다. Codex는 대응 skill alias를 사용하고, Grok과 기타 호환 에이전트는 설치된 플러그인 또는 host adapter가 문서화한 호출 표면을 사용합니다.

| 플러그인 | Claude Code | Codex | 이식 가능한 skill 진입점 |
|---|---|---|---|
| deep-work | `/deep-work "task"` | `$deep-work:deep-work "task"` | `skills/deep-work/SKILL.md` |
| deep-evolve | `/deep-evolve` | `$deep-evolve:deep-evolve` | `skills/deep-evolve/SKILL.md` |
| deep-review | `/deep-review-loop` | `$deep-review:deep-review-loop` | `skills/deep-review-loop/SKILL.md` |
| deep-docs | `/deep-docs scan` | `$deep-docs:deep-docs scan` | `skills/deep-docs/SKILL.md` |
| deep-wiki | `/wiki-ingest <source>` | `$deep-wiki:wiki-ingest <source>` | `skills/wiki-ingest/SKILL.md` |
| deep-dashboard | `/deep-harness-dashboard` | `$deep-dashboard:deep-harness-dashboard` | `skills/deep-harness-dashboard/SKILL.md` |

---

## Harness Engineering 아키텍처

Deep Suite는 Harness Engineering 프레임워크를 구현합니다: 각 플러그인이 Guides × Sensors 2×2 매트릭스의 특정 역할을 차지하며, Computational/Inferential 제어 축과 교차합니다.

### 2x2 매트릭스: 각 플러그인의 위치

```
                +---------------------------+---------------------------+
                |  Computational            |  Inferential              |
+---------------+---------------------------+---------------------------+
|               |                           |                           |
|  Guides       |  deep-work                |  deep-work                |
|  (Feedforward |  +- Phase Guard hook      |  +- research/plan/brain   |
|   Control)    |  +- TDD state machine     |  +- Sprint Contract       |
|               |  +- Topology templates    |                           |
|               |                           |  deep-wiki                |
|               |                           |  +- Persistent knowledge  |
|               |                           |                           |
|               |                           |  deep-docs                |
|               |                           |  +- Document freshness    |
+---------------+---------------------------+---------------------------+
|               |                           |                           |
|  Sensors      |  deep-work                |  deep-review              |
|  (Feedback    |  +- Linters + typecheck   |  +- Opus code review      |
|   Control)    |  +- Coverage + mutation   |  +- 3-way cross-model     |
|               |  +- 4 drift sensors       |  +- SOLID + entropy       |
|               |  +- Fitness rules         |                           |
|               |  +- review-check sensor   |  deep-work                |
|               |                           |  +- Drift check           |
|               |  deep-docs                |                           |
|               |  +- Doc freshness scan    |                           |
|               |                           |                           |
|               |  deep-dashboard           |                           |
|               |  +- Harnessability        |                           |
|               |  +- Effectiveness         |                           |
+---------------+---------------------------+---------------------------+
```

### 플러그인 데이터 플로우

```
 deep-work ------- receipts -------> deep-dashboard (collector)
    |                                    |
    +-- health_report ----------------> deep-review (fitness-aware review)
    |                                    |
    +-- fitness.json <----------------> deep-review (rule consumption)
    |                                    |
 deep-docs ---- last-scan.json ---> deep-dashboard (collector)
    |                                    |
 deep-evolve -- evolve-receipt ----> deep-dashboard (collector)
    |                                    |
 deep-dashboard                          v
    +-- harnessability ---------------> deep-work Phase 1 (research context)
    +-- effectiveness ----------------> user (CLI report + optional markdown)

 deep-review -- recurring-findings -> deep-evolve (experiment steering)
 deep-evolve -- evolve-insights ---> deep-work (research context)
 deep-evolve -- review trigger ----> deep-review (pre-merge verification)
```

### 통합 워크플로우

각 플러그인은 독립적으로 동작합니다. 먼저 문제에 따라 선택하고, 그 다음 런타임별 호출 방식을 적용합니다.

<!-- deep-suite:auto-generated:problem-plugin-table-readme-ko:start -->

| 플러그인 | 핵심 질문 | 언제 쓰나 |
|---|---|---|
| **deep-work** | "이걸 어떻게 설계하고 구현하지?" | 근거 기반 개발 흐름이 필요한 기능, 버그 수정, 리팩토링 |
| **deep-wiki** | "이 에이전트가 배운 것을 어떻게 남기지?" | 세션과 작업자를 넘어 보존해야 하는 프로젝트 지식 |
| **deep-evolve** | "에이전트가 이것을 측정 가능하게 개선할 수 있나?" | 고정된 단일 적합도 지표를 대상으로 한 제한된 자율 실험 |
| **deep-review** | "이 작업이 실제로 괜찮은가?" | 수락 전 코드, 설계, 계획, 증거에 대한 독립 리뷰 |
| **deep-docs** | "지침과 문서가 실제 상태와 맞는가?" | 에이전트용 프로젝트 문서의 스캔, 가드닝, 작성 |
| **deep-dashboard** | "에이전트 하네스가 잘 동작하는가?" | 하네스 준비도 진단, 스위트 텔레메트리, 효과 추세 |
| **deep-memory** | "에이전트가 프로젝트 간 재사용할 것은 무엇인가?" | 비식별화된 재사용 메모리 카드와 작업별 회상 |
| **deep-goal** | "이 요청을 지속 가능한 목표로 어떻게 바꾸지?" | 장기 요청을 네이티브 goal 조건으로 컴파일 |
| **deep-loop** | "긴 작업을 여러 세션에 걸쳐 어떻게 이어가지?" | 증거 기반 경계를 갖춘 지속 가능한 다중 세션 오케스트레이션 |
| **deep-model-router** | "어떤 모델과 리뷰 깊이가 이 작업에 맞는가?" | 위임 전 위험 기반 모델, 추론 강도, 리뷰 라우팅 |

<!-- deep-suite:auto-generated:problem-plugin-table-readme-ko:end -->

**복잡도별 예시:**

```bash
# 빠른 수정 (30분) — deep-work 단독, Phase 6 skip
/deep-work --skip-integrate "로그인 500 에러 수정"

# 중간 기능 (2-4시간) — Phase 6 가 review/docs/wiki orchestrate
/deep-work "Stripe 결제 통합 추가"
# → Phase 6 가 /deep-review, /deep-docs scan, /wiki-ingest 추천 (top-3 loop)

# 대규모 최적화 (반나절+) — 전체 플러그인 스택
/deep-harness-dashboard                                  # 프로젝트 건강 진단
/deep-evolve "테스트 커버리지 90% 달성"                  # 자율 실험
/wiki-ingest .deep-evolve/<session-id>/                  # 학습 내용 보존
```

자세한 시나리오는 [통합 워크플로우 가이드](guides/integrated-workflow-guide.ko.md) 참조.

---

## deep-work

**Evidence-Driven Development Protocol** — 단일 명령 자동 흐름으로 구조화·증거 기반 개발을 강제하는 오케스트레이터.

Claude Code에서는 `/deep-work "task"`, Codex에서는 `$deep-work:deep-work "task"` 하나로 **Brainstorm → Research → Spec → Plan → Implement → Test → Integrate** 전체 파이프라인을 자동 진행. Claude Code는 hook으로 phase를 물리적으로 강제하고, Codex는 동일한 skill protocol과 verification gate를 Codex skill surface에서 사용한다.

### 주요 명령

| 명령 | 설명 |
|---|---|
| `/deep-work <task>` | 자동 흐름 오케스트레이션 — 전체 파이프라인. Plan 승인만 사용자 인터랙션 |
| `/deep-work --skip-integrate <task>` | Phase 6 skip 후 바로 `/deep-finish` |
| `/deep-integrate` | 수동 Phase 6 — 설치된 플러그인 artifact에서 top-3 다음 액션 |
| `/deep-status` | 통합 뷰 — 진행도, 보고서, receipt, 히스토리, 가정 |
| `/deep-debug` | 근본 원인 조사 기반 체계적 디버깅 |
| `/deep-research` | 수동 Phase 1 — 코드베이스 심층 분석 |
| `/deep-spec` | 수동 Phase 2 — 실행 가능한 requirement, failure mode, evidence gate |
| `/deep-plan` | 수동 Phase 3 — slice 기반 구현 계획 |
| `/deep-implement` | 수동 Phase 4 — TDD 강제 slice 실행 |
| `/deep-test` | Phase 5 — 검증 + 품질 게이트 |
| `/deep-sensor-scan` | Computational sensor scan — linter, type checker, coverage |
| `/deep-mutation-test` | Mutation testing — AI 생성 테스트 품질 검증 |

### Workflow phases

```
Phase 0  Brainstorm    설계 탐색 — "why before how" (skip 가능)
Phase 1  Research      코드베이스 심층 분석 + 문서화
Phase 2  Spec          실행 가능한 requirement, invariant, evidence gate
Phase 3  Plan          Slice 기반 구현 계획 (사용자 승인 필요)
Phase 4  Implement     TDD 강제 실행 — 실패 테스트 → 구현 → receipt
Phase 5  Test          Receipt 점검, spec 준수, 품질 게이트
Phase 6  Integrate     설치된 플러그인 artifact 읽기 → LLM 다음 액션 랭킹
                       → 사용자 top-3 선택 (≤5 라운드, skip 가능)
```

### 주요 기능

- **Phase-locked 파일 편집** — Phase 4 외 코드 변경 차단
- **TDD 강제** — 실패 테스트 먼저, 그 다음 구현
- **Receipt 기반 증거** — 모든 slice에 완료 증거 (M3 cross-plugin envelope)
- **품질 게이트** — drift check, SOLID review, insight analysis, Sensor Clean, Mutation Score
- **Computational sensor** — linter / type checker / coverage 자동 실행 + 자가 보정 루프 (SENSOR_RUN → SENSOR_FIX → SENSOR_CLEAN)
- **Mutation testing** — AI 생성 테스트 품질 자동 검증; 생존 mutant → 자동 테스트 재생성 (최대 3 라운드)
- **Slice review** — sensor 파이프라인 직후 slice별 2-stage 독립 리뷰 (spec 준수 + 코드 품질)
- **Phase 6 integrate** — Test 이후 AI 추천 top-3 다음 액션 (review / docs / wiki / dashboard / evolve), 인터랙티브 루프
- **Team/solo 위임** — Research/Implement는 항상 subagent에 위임; team 모드는 3-way 병렬 Research
- **Profile schema v4** — methodology policy가 routing, review strength, verification gate의 단일 authority이며 v3에서 atomic migration

[전체 문서 →](https://github.com/Sungmin-Cho/deep-work)

---

## deep-wiki

**LLM 관리 markdown wiki** — 지식 영속 축적용. [Karpathy의 LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 철학 구현.

RAG처럼 매번 지식을 다시 발견하지 않고, 현재 실행 중인 에이전트가 영속 wiki를 점진적으로 구축·유지. 새 소스를 추가하면 LLM이 읽고 핵심 정보를 추출해 기존 wiki에 통합. 지식이 시간이 갈수록 누적된다.

### 주요 명령

| 명령 | 설명 |
|---|---|
| `/wiki-setup <path>` | wiki 디렉토리 구조 초기화 |
| `/wiki-ingest <source>` | 소스(URL, 파일, 텍스트) 읽고 wiki 페이지 생성/갱신 |
| `/wiki-query <question>` | wiki 검색 + 인용 포함 grounded 답변 |
| `/wiki-lint` | 헬스 체크 — schema 위반, orphan, broken link |
| `/wiki-rebuild` | frontmatter로부터 인덱스 재생성 |

### 아키텍처

```
Raw Sources  →  Wiki (markdown pages)  →  Schema (management rules)
```

### 주요 기능

- **콘텐츠 메타데이터 및 중첩 prune 안전성 (v1.9.7)** — regular AppleDouble 및 정확한 OS 메타데이터가 content catalog를 막지 않으며, 중첩 terminal/quarantine 정리는 owner와 전체 directory identity 증명 아래로 제한되고 의심스러운 타입은 fail-closed로 유지
- **Flat pages** — 카테고리 대신 tag; 이동에 의한 broken link 없음
- **Auto-lint** — ingest/rebuild 후 자동 실행
- **Auto-filing** — 2+ 페이지를 synthesize한 query 결과는 wiki로 자동 file
- **Obsidian 호환** — Obsidian vault로 동작
- **Subagent 위임** — ingest마다 `wiki-synthesizer-{analysis,worker}` 에이전트가 소스 읽기, create-vs-update 판정, 페이지 쓰기 담당; main 세션은 작은 메타데이터(`index.json`, `log.jsonl`, `sources/*.yaml`)만 보유
- **Trust-boundary 폐쇄** — 활성 synthesizer 에이전트의 tool manifest에서 `Write`/`Edit` 물리적 제거; main 세션이 단일 global lock 아래 유일한 writer
- **Auto-ingest 훅** — Claude Code에서는 `SessionStart` hook이 vault 수정 `.md` 감지 후 `/wiki-ingest` 자동 트리거; `auto_ingest:` config로 opt-in. Codex에서는 명시적으로 `$deep-wiki:wiki-ingest` skill entry를 호출한다.
- **M3 envelope 채택** — `index.json`이 cross-plugin envelope로 wrap; legacy payload는 forward-compat 위해 그대로 보존
- **네이티브 Windows lock 신뢰성 (v1.8.2)** — atomic write 소유권 seal이 Windows 11 24H2 / Server 2025의 libuv ≥1.49 fstat/lstat `st_dev` 비대칭을 방향성 device-compatibility 술어로 허용하여, wiki lock 획득 영구 실패를 수정
- **커밋 deadline 스케일링 (v1.9.0)** — 미변경 카탈로그 파일을 full-byte 대신 hash로 seal하여 per-commit journal/staging 비용을 O(catalog)→O(diff)로 낮춤; 대형 vault(~1,400 pages)가 반복 `transaction recover` 없이 deadline 예산 안에 커밋된다. drift는 crash-safe cancel(journal-first 원자 활성화, bounded debris sweep, 플랫폼별 resume 힌트)로 처리
- **완료된 scan-window 회수 (v1.9.4)** — sealed marker와 reservation 증거로 복구가 더 이상 필요 없음을 입증한 경우 `wiki-lint --fix`가 완료된 ensure journal을 안전하게 정리하며, 모호하거나 잘못된 transaction 상태는 fail-closed로 유지
- **Lock 경합 관측성 (v1.9.5)** — `lock acquire --json`이 token을 제외한 canonical holder를 담은 안정적인 exit-3 JSON envelope를 내보내고, 모호한 owner 증거는 `holder: null`로 낮추며, recovery나 lock 소유권 의미론을 바꾸지 않고 활성 release-transition 경합까지 정규화
- **Oversized 트랜잭션 격리 (v1.10.0)** — oversized leftover transaction directory는 `TRANSACTION_OVERSIZED`로 분류되어 lock-free reader와 lock을 보유한 writer 모두 건너뛰므로, 모든 경로가 영구 `DEADLINE_EXCEEDED`로 막히지 않는다. isolatable 트리는 자동 삭제되지 않는 봉인된 `.wiki-meta/.quarantine/` 번들로 옮겨지며, `transaction recover … --json`은 lock token이 없으면 self-locking이라 rollback quarantine의 `follow_up`을 그대로 실행할 수 있다

[전체 문서 →](https://github.com/Sungmin-Cho/deep-wiki)

---

## deep-evolve

**Autonomous Experimentation Protocol** — 목표를 지정하면 측정된 실험 루프로 프로젝트를 체계적으로 개선.

cross-plugin 피드백 내장: deep-review의 recurring findings가 실험 방향을 steer, evolve-insights는 deep-work research context로 피드, deep-evolve가 pre-merge 검증으로 deep-review를 트리거. AAR(After-Action Review) 기반 레이어는 entropy tracking, legibility gate, shortcut detector, diagnose-retry 추가. Virtual parallel exploration이 N=1..9 seed worktree를 adaptive scheduler와 공유 forum으로 조정하며, session-end synthesis가 seed별 결과를 단일 best branch로 머지.

### 주요 명령

| 명령 | 설명 |
|---|---|
| `/deep-evolve init` | 목표에 대한 새 evolve 세션 초기화 |
| `/deep-evolve` | 활성 세션 재개 |
| `/deep-evolve --review` | pre-merge 검증을 위한 deep-review 트리거 |

### 주요 기능

- **목표 기반 실험 루프** — 각 iteration이 fitness delta 측정
- **Cross-plugin 피드백** — deep-review findings 소비, deep-work에 insights emit
- **Virtual parallel N-seed exploration** — N=1..9 worktree + adaptive scheduler
- **AAR 레이어** — entropy tracking, legibility gate, shortcut detector, diagnose-retry
- **M3 envelope 채택** — evolve-receipt + evolve-insights가 cross-plugin envelope

[전체 문서 →](https://github.com/Sungmin-Cho/deep-evolve)

---

## deep-review

**Independent Evaluator** — AI 코딩 에이전트 출력을 별도 Claude reviewer로 리뷰. Claude Code에서는 Agent tool 경로를 쓰고, Codex에서는 Claude CLI reviewer bridge를 쓴다. Codex 플러그인이 설치되어 있으면 3-way cross-model 검증.

Anthropic [Harness Design](https://www.anthropic.com/engineering/harness-design-long-running-apps)에서 영감 — Generator-Evaluator 분리로 자기 승인 편향을 구조적으로 제거.

### Review 파이프라인

```
Collect → Contract Check → Deep Review → Verdict
                            ├─ Claude reviewer (항상)
                            ├─ codex:review (사용 가능 시)
                            └─ codex:adversarial-review (사용 가능 시)
```

### 주요 명령

| 명령 | 설명 |
|---|---|
| `/deep-review` | 독립 Opus evaluator로 현재 변경 리뷰 |
| `/deep-review --contract` | Sprint Contract 기반 검증 |
| `/deep-review --entropy` | 엔트로피 스캔 (코드 drift, 패턴 mismatch) |
| `/deep-review --respond` | 리뷰 findings에 증거 기반 응답 (Phase 6은 Sonnet subagent로 위임) |
| `/deep-review init` | 프로젝트 리뷰 규칙 초기화 |

### 주요 기능

- **Independent evaluator** — Generator context 없는 별도 Claude reviewer
- **Codex Claude bridge** — Codex는 Claude reviewer를 Codex subagent로 대체하지 않고 플러그인의 CLI bridge로 실행
- **Cross-model 검증** — Codex 설치 시 3-way 병렬 리뷰
- **Phase 6 subagent 위임** — `/deep-review --respond`의 IMPLEMENT phase가 severity group별 `phase6-implementer` subagent에서 실행; main 세션은 Phase 1~5 판단 유지 + fail-closed content-aware delta + pathspec-limited commit로 검증
- **Sprint Contract** — 구조화된 성공 기준 검증
- **환경 적응** — git/non-git, Codex 유/무 모두 지원

[전체 문서 →](https://github.com/Sungmin-Cho/deep-review)

---

## deep-docs

**Document Gardening + Authoring Agent** — `CLAUDE.md`, `AGENTS.md` 같은 에이전트 지시 문서의 freshness 검증 + 자동 수리, 그리고 (v1.4.0) `ARCHITECTURE.md` 등 누락·빈약 문서의 생성·재구성.

OpenAI [Harness Engineering](https://openai.com/index/harness-engineering/)에서 영감 — "doc-gardening 에이전트가 반복적으로 stale doc을 찾아 fix PR을 연다."

### 주요 명령

| 명령 | 설명 |
|---|---|
| `/deep-docs scan` | stale 참조, 이동 경로, outdated 예제, 누락·빈약 문서 gap 감지 |
| `/deep-docs garden` | 사용자 확인 후 자동 수리; 감지된 authoring gap 에 대해 문서 생성·재구성 |
| `/deep-docs audit` | 정량적 문서 건강 보고서 |

### 주요 기능

- **경로 범위 freshness** — 참조된 코드 경로가 doc 마지막 갱신 이후 바뀌었는지 검사
- **Auto-fix / audit-only 분리** — 기계적 fix만 자동, 주관적 검사는 audit-only
- **문서 authoring (v1.4.0)** — 누락·빈약 문서(`missing-doc` / `thin-doc` gap) 감지 후 `CLAUDE.md` / `AGENTS.md` / `ARCHITECTURE.md` 생성·재구성
- **AGENTS-first 단일 소스 (v1.6.0)** — `AGENTS.md`가 기본 관리 문서; `CLAUDE.md`는 `@AGENTS.md` import + Claude Code 특화 메모만 담는 thin wrapper로 유지
- **Durable scan artifact** — `.deep-docs/last-scan.json`에 provenance (HEAD SHA, branch) 기록
- **Scoring** — size, freshness, reference accuracy, duplication

[전체 문서 →](https://github.com/Sungmin-Cho/deep-docs)

---

## deep-dashboard

**Cross-plugin Harness Diagnostics** — 코드베이스 harnessability 평가 + deep-work, deep-review, deep-docs의 sensor 결과를 통합 뷰로 집계.

Harness Engineering 프레임워크 기반 — dashboard가 전체 deep-suite 생태계의 harness 효과성을 측정하여 피드백 루프를 닫는다.

### 주요 명령

| 명령 | 설명 |
|---|---|
| `/deep-harnessability` | 코드베이스 harnessability 평가 — 6 차원, 0-10 점수 + 권고 |
| `/deep-harness-dashboard` | 통합 뷰 — health, fitness, sessions, effectiveness, 권장 액션 |

### Harnessability 차원

| 차원 | 가중치 | 측정 |
|---|---|---|
| Type Safety | 25% | tsconfig strict, mypy strict, type hint |
| Module Boundaries | 20% | dep-cruiser config, organized src, entry point |
| Test Infrastructure | 20% | test framework, test file, coverage config |
| Sensor Readiness | 15% | linter, type checker, lock file |
| Linter & Formatter | 10% | eslint/ruff config, prettier/biome |
| CI/CD | 10% | CI config, CI runs tests |

### 주요 기능

- **Health status** — drift sensor 결과 (dead-export, stale-config, dep-vuln, coverage-trend)
- **Fitness rules** — architecture fitness function pass/fail
- **Session quality** — 최근 3 세션 평균
- **Effectiveness score** — 가중 집계 (0-10) + `not_applicable` 재분배
- **Action routing** — finding별 권장 다음 액션
- **Markdown export** — 사용자 승인 후 선택적 보고서 파일 생성

[전체 문서 →](https://github.com/Sungmin-Cho/deep-dashboard)

---

## Suite Extensions (사이드카 매니페스트)

공식 marketplace 스키마에 들어가지 않는 cross-plugin 메타데이터는 사이드카 `.claude-plugin/suite-extensions.json`에 두며, [`schemas/suite-extensions.schema.json`](./schemas/suite-extensions.schema.json) (JSON Schema Draft 2020-12)으로 검증. Claude Code는 `.claude-plugin/marketplace.json`, Codex는 mirror인 `.agents/plugins/marketplace.json` 를 읽는다.

**왜 사이드카?** `marketplace.json`은 closed schema (`additionalProperties: false`) — `runtime`, `capabilities`, `artifacts` 같은 suite 전용 필드를 추가하면 무시되거나 `claude plugin validate`가 거부함. 사이드카 패턴은 공식 매니페스트를 깨끗하게 유지하면서 suite 도구가 추가 메타데이터를 소비할 수 있게 함.

**포함 내용:**

- `suite.name` (`marketplace.json.name`과 일치 필수), `harness_taxonomy`, `telemetry_namespace`
- `plugins.<name>` — 플러그인별 `runtime`, `capabilities`, `artifacts.{writes,reads}`, `hooks_active`, optional `hooks_intentionally_empty_reason`, optional `consumer_only`
- `data_flow[]` — producer → consumer edges with display-only `via` 라벨 (machine-readable cross-plugin trace는 M3 artifact envelope이 담당)

**Schema 버전은 `1.0`으로 잠금.** 호환 추가는 root/suite/plugin entry 레벨의 `x-*` patternProperties로만. Breaking change는 새 schema 파일 (`suite-extensions-v2.schema.json`)이 필요. [`schemas/README.md`](./schemas/README.md) §Schema versioning 참조.

두 번째 schema인 [`artifact-envelope.schema.json`](./schemas/artifact-envelope.schema.json)은 cross-plugin traceability + deep-dashboard 집계를 위해 플러그인이 채택하는 공통 envelope을 정의.

**검증:**

```bash
npm install                       # ajv + ajv-formats (devDeps 전용)
npm test                          # unit + spawnSync CLI 테스트
npm run validate                  # 실제 .claude-plugin/suite-extensions.json 검증
```

Validator는 2단계 — JSON Schema (Phase 1) + post-schema 참조 무결성 (Phase 2, `data_flow.from`/`to`). Phase는 stderr prefix로 보고; exit code는 `0`/`1`/`2` (valid / validation fail / IO-usage-compile error).

---

## License

MIT
