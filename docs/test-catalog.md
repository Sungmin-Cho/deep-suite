# Deep Suite — Test Catalog (M5.5)

> M5.5 (Test Catalog Migration) 산출물. 분석 §우선순위 #4의 **8개 테스트 카탈로그**를
> 6 plugin repo에 분산 배치하기 위한 cross-reference. 새 testing framework 도입 없이
> 기존 `node:test` 패턴(`phase-guard-hardening.test.js` 모범)을 plugin repo 별로 확산한다.
>
> **마지막 갱신**: 2026-05-12 (#9 cross-plugin e2e fixture roundtrip 추가, M5.7.B 회귀 가드)
> **상태**: 8/8 M5.5 완료 + **§9 (M5.7.B e2e regression guard, suite-side)** 추가
> **Spec**: `docs/deep-suite-harness-roadmap.md` §M5.5 / §M5.7
> **Handoff**: `docs/superpowers/plans/2026-05-12-m5.5-remaining-tests-handoff.md` (gitignored)

---

## Catalog (8 M5.5 tests + 1 M5.7.B extension)

| # | 테스트 | 책임 plugin | 위치 | 실행 | 상태 |
|---|---|---|---|---|---|
| 1 | manifest-doc sync | suite | §1 below | `npm test` + `npm run docs:sync` | ✅ M2 (2026-05-07, PR #7) |
| 2 | artifact schema fixture | suite | §2 below | `npm run validate-artifact-fixtures` | ✅ M3 Phase 1 (2026-05-07, PR #8) |
| 3 | hook golden | deep-work, deep-evolve, deep-wiki | §3 below | `npm test` in each plugin | ✅ 2026-05-12 (this PR) |
| 4 | cross-platform CI matrix | deep-work, deep-evolve, deep-wiki, deep-review | §4 below | GH Actions (push + PR) | ✅ 2026-05-12 (suite PR #17) |
| 5 | stale-recovery | deep-review, deep-wiki, deep-evolve | §5 below | `npm test` in each plugin (`bash …test-mutation-protocol.sh` for deep-review) | ✅ 2026-05-12 (this PR) |
| 6 | null-signal redistribution | deep-dashboard | §6 below | `npm test` (in deep-dashboard) | ✅ 2026-05-11 (PR #11) |
| 7 | dangerous-command denylist | suite + deep-work | §7 below | `npm test` 양쪽 | ✅ 2026-05-12 (this PR) |
| 8 | context handoff round-trip | deep-work + deep-evolve | §8 below | `npm test` 양쪽 | ✅ 2026-05-12 (M5.7 absorbed) |
| 9 | cross-plugin e2e fixture roundtrip | suite | §9 below | `npm test` (suite) | ✅ 2026-05-12 (M5.7.B regression guard) |

---

## §1. manifest-doc sync (M2-absorbed)

**Goal**: marketplace SHA → `plugin.json.version` → suite docs(README/AGENTS/guides) → sidecar(`suite-extensions.json`) → memory hierarchy 5개 layer 일관성.

**Files**:
- `tests/cli-sync-checkers.test.js` — 8 `check-*` 스크립트 spawnSync 시나리오
- `tests/check-hooks-coverage.test.js` — `check-hooks-coverage.js` 순수 함수(frozen fixture `tests/fixtures/hooks-coverage/`) + CLI
- `tests/markers.test.js` — auto-generated marker round-trip
- `tests/generate-reference-sections.test.js` — `generate-reference-sections.js --check/--write/--id` CLI
- `scripts/check-readme-plugin-table.js` / `check-agents-md-paths.js` / `check-guide-version.js` / `check-semver-sha-sync.js` / `check-pinned-plugin-paths.js` / `check-hooks-coverage.js` / `check-memory-hierarchy.js` / `check-plugin-count.js` / `check-fixture-provenance.js`

**Run**:
```bash
npm test                       # all node:test files
npm run docs:check             # marker drift only
npm run docs:sync              # 9 check-* in sequence
```

**CI**: `.github/workflows/manifest-doc-sync.yml` (PR + push + daily cron)

---

## §2. artifact schema fixture (M3-absorbed)

**Goal**: M3 envelope + payload-registry × 6 producer schema 호환성. valid-* fixture는 통과, invalid-* fixture는 명시된 사유로 거부.

**Files**:
- `schemas/artifact-envelope.schema.json` (Draft 2020-12, SemVer 2.0.0 strict)
- `schemas/payload-registry/<producer>/<artifact_kind>/v<MAJOR.MINOR>.schema.json` (8 seeds across 6 producers)
- `scripts/validate-artifact.js` — single-file CLI validator
- `scripts/validate-artifact-fixtures.js` — bulk CI gate
- `scripts/wrap-artifact.js` — Phase 2 plugin-maintainer helper
- `tests/validate-artifact.test.js` — CLI scenarios (envelope/payload phase + registry-miss)
- `tests/wrap-artifact.test.js` — roundtrip + override + kebab-case reject
- `tests/fixtures/envelope-payloads/<producer>/<kind>/v<v>/{valid-*,invalid-*}.json`

**Run**:
```bash
npm run validate-artifact-fixtures       # 24 fixtures, fail on any non-match
npm run validate-artifact -- <path.json> # single-file
npm test                                 # full suite (includes both .test.js above)
```

---

## §3. hook golden test (M5.5 #3) ✅ 2026-05-12

**Goal**: PreToolUse / SessionStart hook의 stdout + exit code + stderr를 fixture로 stabilize. Fixture-input + expected-output pair 매칭. Half-commit (한쪽만 추가) 시 driver loader가 fail loud.

**Pattern**: `tests/fixtures/golden/<name>.input.json` + `tests/fixtures/golden/<name>.expected.json` pair. Driver discovers by basename, materializes session state in `fs.mkdtempSync`, spawns hook with host-env scrub, asserts exit + decision + reason regex.

### deep-work side — `deep-work` PR #29 (v6.6.3)

- `tests/phase-guard-golden.test.js` (driver — 8 fixtures, 8 tests)
- `tests/fixtures/golden/*.{input,expected}.json` (8 pairs + `README.md`)
- `hooks/scripts/test-helpers/run-phase-guard.js` — `scrubHostEnv()` + `runPhaseGuard()` + `parseGuardOutput()` (consolidated from inline scrub in `phase-guard-denylist.test.js`)
- **Scope**: PreToolUse `phase-guard.sh` only — SessionStart "fitness-sync" hook does not exist in v6.6.x; handoff §2 #3 reference was speculative.
- **Bundled §9 rollup**: 9.1 (override-semantics comment) + 9.2 (5 sibling tests migrated to `scrubHostEnv()`) + 9.3 (per-family override loop + composition fall-through + scope-omission docblock). Tests 162 → 177 (+15).

### deep-evolve side — `deep-evolve` PR #14 (v3.3.1)

- `tests/protect-readonly-golden.test.js` (driver — 8 fixtures, 8 tests)
- `tests/fixtures/golden/*.{input,expected}.json` (8 pairs covering: no `.deep-evolve/`, `status: initializing`, active + `prepare.py`/`program.md`/`strategy.yaml` Edit, active + unrelated Edit, meta-mode bypass, seal-prepare Bash read)
- `hooks/scripts/test-helpers/run-protect-readonly.js` (scrubs `CLAUDE_TOOL_USE_TOOL_NAME` / `CLAUDE_TOOL_NAME` / `DEEP_EVOLVE_HELPER` / `DEEP_EVOLVE_META_MODE` / `DEEP_EVOLVE_SEAL_PREPARE`)
- **Scope**: PreToolUse `protect-readonly.sh` only — Stop / SessionStart hooks do not exist in v3.3.x.
- **Template substitution**: fixtures use `{{SESSION_ROOT}}` / `{{PROJECT_ROOT}}` because protect-readonly does exact absolute-path equality. Tests 112 → 120 (+8).

### deep-wiki side — `deep-wiki` PR #15 (v1.5.1)

- `tests/auto-ingest-golden.test.js` (driver — 8 fixtures)
- `tests/fixtures/golden/*.{input,expected}.json` (8 pairs covering: empty vault, 3 new .md, `.obsidian/`+`.trash/` pruning, mtime filtering, `require_tag` filter, `ignore_globs`, missing config, valid `.pending-scan` preservation)
- `hooks/scripts/test-helpers/run-scan-vault.js` — `HOME=tmpRoot` hermetic isolation; never touches real `~/.claude/deep-wiki-config.yaml` or real Obsidian vault
- **Output parsing**: hook emits free-form Korean system message (not JSON), so driver uses header-count regex + file-list line parsing.
- **Obsidian CLI**: not exercised (helper omits from PATH, `command -v obsidian` returns empty, recents-supplement branch naturally skipped). Tests 111 → 119 (+8).

**Reference**: handoff §2 #3.

---

## §4. cross-platform CI matrix (M5.5 #4)

**Goal**: macOS bash 3.2 + Linux GNU bash 양쪽에서 plugin test suite green. M5.7 R1 W2 (BSD/GNU `stat`) 가족의 첫 자동 catch 사례.

**Files** (4 plugins, identical pattern):
- `deep-work/.github/workflows/tests.yml` — `os: [ubuntu-latest, macos-latest]` × `node-version: 20` + `bash --version` 출력 + `npm test` + 3 bash regression scripts
- `deep-evolve/.github/workflows/tests.yml` — same matrix
- `deep-wiki/.github/workflows/tests.yml` — same matrix
- `deep-review/.github/workflows/tests.yml` — complements existing `phase6-protocol.yml`

**Closure record (2026-05-12)**:
- deep-work PR #27 merge `954a1bc` (v6.6.1 — included BSD/GNU `stat` reverse-order fix in `test-v6.4.2-regression.sh` §2 caught by new ubuntu leg on first run)
- deep-evolve PR #13 merge `7acb0c6`
- deep-wiki PR #14 merge `750c468`
- deep-review PR #10 merge `e278aff`
- suite PR #17 merge `983cb24` — 4 SHA bump + marker regen

**Run**: GitHub Actions on push/PR. Local mirror: `bash --version && npm test` on each repo.

---

## §5. stale-recovery test (M5.5 #5) ✅ 2026-05-12

**Goal**: pending-scan 미완료, mutation lock leftover, interrupted session 등 비정상 종료 후 자동 복구 검증. setup에서 lock 파일 / pending state 인공 생성 → plugin entry point 실행 → clean recovery 확인.

### deep-review side — `deep-review` PR #11 (v1.4.1)

- `hooks/scripts/test/test-mutation-protocol.sh` Tests 26 / 27 / 28 (+3 bash assertions, 51 → 54)
- **Test 26 (M5.5 #5-A)**: leftover `.deep-review/.mutation.lock` dir + `.pending-mutation.json` + user-staged file from unrelated flow → `auto_recover()` releases orphan lock + removes our i-t-a + **preserves user staging** + cleans state file (all 5 contract properties simultaneously)
- **Test 27 (M5.5 #5-B)**: defensive no-op when state file missing (auto_recover must not strip legitimate staging)
- **Test 28 (M5.5 #5-C)**: 3 user-staged files survive recovery (off-by-one i-t-a filter regression guard)
- **Closes integration gap** left by pre-existing Test 10 (`restore_mutation` user-staging filter alone) + Test 12 (stale state, no lock)
- **CI deferred**: bash test ubuntu integration uncovered a pre-existing ubuntu-vs-macOS divergence between tests 5 → 6; CHANGELOG documents the follow-up.
- **Run locally**: `bash hooks/scripts/test/test-mutation-protocol.sh` (54 assertions on macOS bash 3.2)

### deep-evolve side — `deep-evolve` PR #15 (v3.3.2, stacked on PR #14)

- `tests/session-recovery.test.js` (+9 node:test cases, 112 → 121)
- `resolve_current` error paths (Tests A–D) + happy path (E): `current.json` missing / null session_id / orphan pointer / session.yaml missing / valid resolution
- `detect_orphan_experiment` recovery paths (Tests F–I): journal missing (no-op) / orphan committed (returns hash) / all resolved (empty) / only LAST committed checked
- **Documents pre-existing contract quirk**: `detect_orphan_experiment` runs `jq -s` without `-r` → stdout JSON-quoted. Test pins both quoted form AND `tr -d '"'`-stripped form so future fix is intentional.
- **Run**: `npm test`

### deep-wiki side — `deep-wiki` PR #16 (v1.5.2, stacked on PR #15)

- `tests/pending-scan-recovery.test.js` (+7 node:test cases, 111 → 118)
- Tests A–G covering `.pending-scan` contract: invalid content (overwrite) / valid (preserve verbatim) / older than `.last-scan` (both preserved) / no `.last-scan` (pending used) / fresh install / empty truncated / corrupt UTF-8 bytes
- **Tests B / C** guard the H1 regression from ultrareview bug_006: every-fire overwrite would erase oldest-detection-window lower bound
- **Test G** guards bash 3.2 regex on non-UTF-8 (subtle source of hook-budget overruns)
- **Hermetic**: `HOME=tmpRoot` + tmpRoot config; never touches real `~/.claude/deep-wiki-config.yaml` or real Obsidian vault
- **Executable companion** to wiki-lint.md Step 11 / 12 stale-detection-and-fix protocol (which is markdown protocol Claude follows, not directly testable)
- **Run**: `npm test`

**Reference**: handoff §2 #5.

---

## §6. null-signal redistribution (M5.5 #6)

**Goal**: deep-dashboard harnessability scorer의 `not_applicable` 처리를 pin. **No-redistribution semantic 채택** — wholly-NA dim은 `score = 0` × `weight`로 total에 contribution; weight renormalize는 일부러 안 함 (total 안정성 + ecosystem-mismatch 페널티 보존).

**Files**:
- `deep-dashboard/lib/harnessability/missing-signal.test.js` — 290 lines, 6 tests:
  - wholly-NA dim
  - partial-NA dim
  - drift guard (renormalization regression)
  - 1-of-6 dim ceiling
  - multiple-NA defensive
  - Python mirror (Python scorer parity check)

**Run** (in `deep-dashboard` repo):
```bash
npm test
```

**Closure**: PR #11 merge 2026-05-11.

---

## §7. dangerous-command denylist (M5.5 #7) ✅ 2026-05-12

**Goal**: example pack의 strict-mode hook(`denylist-guard.sh`) + deep-work `phase-guard.sh`가 destructive Bash 명령을 차단하는지 검증.

### Suite side

**Files**:
- `examples/hooks-strict-mode/scripts/denylist-guard.sh` — 7 family case branch (force-push / hard-reset-remote / rm-rf / sql-destructive / kubectl-destructive / npm-publish / curl-pipe-shell), each with own `CLAUDE_ALLOW_*` override env.
- `examples/hooks-strict-mode/.claude/settings.json` — 13 `if`-rule matchers wired to the 7 families.
- `tests/denylist.test.sh` — **54 assertions**: per-family {block + family-named stderr + WHY substring + override hint + override=1 bypass + override=0 still blocks} + unknown-family fail-closed + no-arg fail-closed. macOS bash 3.2 + GNU bash 5+ compatible.
- `tests/examples.test.js` — wrapper `test('tests/denylist.test.sh — ...')` spawns the .sh and asserts exit 0.
- `tests/examples.test.js` — settings.json family-set assertion (`hooks-strict-mode/.claude/settings.json covers all 7 documented dangerous-command families`).

**Run** (from suite root):
```bash
npm test                             # 125 tests including the .sh wrapper
bash tests/denylist.test.sh          # standalone .sh (54 case assertions)
```

**Fault injection verified**: removing `rm-rf` case → 5 failures (block + override paths). Swapping `CLAUDE_ALLOW_FORCE_PUSH` env name → 3 failures.

### deep-work side

**Files**:
- `hooks/scripts/phase-guard.sh` — Phase 5 (idle + `phase5_entered_at`, no `phase5_completed_at`) read-mostly allowlist + destructive-target check + compound-operator block + git read-only subcommand allowlist. Plus non-implement (research/plan/test/brainstorm) Bash flows to `phase-guard-core.preToolUseEnforcement` which runs `detectBashFileWrite()`.
- `hooks/scripts/phase-guard-core.js` — `BASH_FILE_WRITE_PATTERNS` includes `git push|reset --hard|clean -f`, `tar -x`, `sed -i`, `rsync`, in-place edits, etc.
- `tests/phase-guard-denylist.test.js` — **32 cases**:
  - Phase 5 denylist 12 (rm-rf /, `/bin/rm`, git push --force/-f, git reset --hard, DROP TABLE via psql, kubectl delete --all, npm publish, curl|sh, &&-chain, tar extract) — each pinned to observed rejection mechanism (`destructive-target` | `git-allowlist` | `allowlist-miss` | `compound-operator`)
  - Non-implement phase 18 (research/plan/test × 6 destructive Bash patterns)
  - Negative controls 2 (Phase 5 read-only git status passes; implement+relaxed allows)

**Run** (from `deep-work` root):
```bash
npm test       # 119 tests (was 87 pre-denylist)
```

**Fault injection verified**: removing destructive command loop in `phase-guard.sh` → 3 expected RED.

---

## §8. context handoff round-trip (M5.5 #8 — M5.7 absorbed)

**Goal**: M5 `handoff.json` envelope이 producer→consumer round-trip에서 보존되는지. deep-work이 생성한 handoff를 deep-evolve가 수용 → deep-evolve가 새 handoff 생성 → deep-work이 재수용.

**Files**:
- `deep-work/tests/handoff-roundtrip.test.js` — 25 assertions; dashboard `unwrapStrict` 계약 mirror
- `deep-evolve/tests/handoff-roundtrip.test.js` — 24 assertions; same contract

**Run** (each repo):
```bash
npm test
```

**Closure**: M5.7 (2026-05-12) — deep-work PR #26 merge `d2c2035` (v6.6.0) + deep-evolve PR #12 merge `dc3d85f` (v3.3.0) + suite PR #16 merge `fb44232` (marketplace SHA bump).

**E2E smoke (post-M5.6 activation)**: 3 M5-activated dashboard metrics numeric — `suite.handoff.roundtrip_success_rate=1.0`, `suite.compaction.frequency=2`, `suite.compaction.preserved_artifact_ratio=0.417`.

---

## §9. cross-plugin e2e fixture roundtrip (M5.7.B regression guard, suite-side) ✅ 2026-05-12

**Goal**: §8 의 plugin-side `tests/handoff-roundtrip.test.js` 가 각 plugin의 envelope **emission** 을 검증하는 반면, §9 는 양쪽 plugin이 emit한 결과물 **set** 이 cross-plugin contract (envelope schema + payload schema + identity-triplet + parent_run_id chain + dashboard metric shape) 를 만족하는지 suite 측에서 단일 회귀 가드로 잡는다.

**무엇을 catch 하는가** (silent breakage 시):
1. producer 가 `envelope.parent_run_id` 를 drop / mis-target → reverse handoff 가 더 이상 chain 안 닫힘 → `suite.handoff.roundtrip_success_rate` 가 다이버전스
2. producer 가 payload field rename (예: `preserved_artifact_paths` → `preserved_paths`) → `suite.compaction.preserved_artifact_ratio` 가 계산 불가
3. `envelope.schema.{name,version}` 가 `artifact_kind` 와 drift → `scripts/validate-artifact.js` identity check fail

**Files**:
- `tests/fixtures/handoff-roundtrip/` — 4 envelope-wrapped artifact (canonical Phase 5 → evolve → reverse 시나리오):
  - `01-deep-work-forward-handoff.json` (handoff_kind: `phase-5-to-evolve`)
  - `02-deep-work-compaction.json` (trigger: `phase-transition`)
  - `03-deep-evolve-compaction.json` (trigger: `loop-epoch-end`)
  - `04-deep-evolve-reverse-handoff.json` (handoff_kind: `evolve-to-deep-work`, `envelope.parent_run_id` chains to 01)
- `tests/handoff-roundtrip-fixtures.test.js` — 17 assertions (envelope/payload schema pass, identity-triplet, schema_version pin, handoff kind coverage, parent_run_id chain, within-plugin git context, cross-plugin branch transition, **3 dashboard metric mirror values**: `roundtrip_success_rate=1.0`, `compaction.frequency=2`, fixture-derived `preserved_artifact_ratio mean=0.4`)

**Scope clarification vs §8**:
- §8 (plugin-side): "deep-work 가 valid한 handoff envelope 을 emit 하는가" + "deep-evolve 가 reverse emit 하는가" — plugin 내 `unwrapStrict` 계약 mirror
- §9 (suite-side): "두 plugin emission 의 **결합** 이 dashboard collector 가 기대하는 4-artifact set + chain + metric shape 인가" — single point of regression detection

**Out of scope**: dashboard collector + aggregator 실제 metric 계산 (수학적 reduction). 그건 `deep-dashboard` repo의 e2e 책임. §9 는 fixture provider + structural contract 만 다룬다.

**Run** (from suite root):
```bash
npm test                                                      # full suite (142 tests)
node --test tests/handoff-roundtrip-fixtures.test.js          # this section only
node scripts/validate-artifact.js tests/fixtures/handoff-roundtrip/01-deep-work-forward-handoff.json  # one fixture
```

**Fault injection 시나리오** (확인됨):
- `04` 의 `envelope.parent_run_id` 를 임의 string 으로 변경 → chain test fail (`reverse handoff envelope.parent_run_id must equal forward handoff envelope.run_id`)
- `02` 의 `preserved_artifact_paths` 에서 1개 path 제거 → mean ratio drift → metric mirror test fail
- 새 fixture (5th) 추가 → `fixture set contains exactly 4 envelope-wrapped artifacts` test fail (의도된 cardinality 가드)

**6-month timer (2026-11-07) 관련**: 이 회귀 가드는 timer trigger 이전에 plugin 측 emit pattern 의 silent drift 를 잡는 안전망 역할. timer date 가 되어 dashboard warning 이 활성화될 때, 이 fixture set 이 reference contract 로 사용 가능.

---

## Maintenance

- **Adding a test row**: keep this catalog 1:1 with `docs/deep-suite-harness-roadmap.md` §M5.5 §"8개 테스트 분배" table. Roadmap is the spec; this is the cross-reference.
- **Plugin status change**: update both the §N section and the top-of-doc table row simultaneously. The `npm run docs:sync` checkers do **not** validate this doc — it's narrative.
- **Catalog state (2026-05-12)**: 8/8 M5.5 done + §9 (M5.7.B suite-side e2e regression guard) extension. Future hook-IO contract additions (e.g. new Stop hooks for deep-work / deep-evolve when added) should extend §3 with the new fixture corpus + golden driver entry. cross-plugin contract regressions extend §9.
- **6-month timer (2026-11-07)**: when triggered, this catalog must show how each plugin's tests verify the envelope adoption contract. §9 fixture set is the canonical reference for "what a valid 4-artifact emit set looks like."
