// Host-neutral problem → plugin routing copy. The reference-section generator
// renders this single source into both READMEs and both integrated guides.
export const PLUGIN_DECISIONS = {
  'deep-work': {
    en: ['How do I design and implement this?', 'Features, bugs, and refactors that need an evidence-driven development flow'],
    ko: ['이걸 어떻게 설계하고 구현하지?', '근거 기반 개발 흐름이 필요한 기능, 버그 수정, 리팩토링'],
  },
  'deep-wiki': {
    en: ['How do I preserve what this agent learned?', 'Durable project knowledge that should survive sessions and contributors'],
    ko: ['이 에이전트가 배운 것을 어떻게 남기지?', '세션과 작업자를 넘어 보존해야 하는 프로젝트 지식'],
  },
  'deep-evolve': {
    en: ['Can an agent measurably improve this?', 'Bounded autonomous experiments against one fixed fitness metric'],
    ko: ['에이전트가 이것을 측정 가능하게 개선할 수 있나?', '고정된 단일 적합도 지표를 대상으로 한 제한된 자율 실험'],
  },
  'deep-review': {
    en: ['Is this work actually good?', 'Independent review of code, designs, plans, and evidence before acceptance'],
    ko: ['이 작업이 실제로 괜찮은가?', '수락 전 코드, 설계, 계획, 증거에 대한 독립 리뷰'],
  },
  'deep-docs': {
    en: ['Do the instructions and docs match reality?', 'Scanning, gardening, and authoring agent-facing project documentation'],
    ko: ['지침과 문서가 실제 상태와 맞는가?', '에이전트용 프로젝트 문서의 스캔, 가드닝, 작성'],
  },
  'deep-dashboard': {
    en: ['Is the agent harness working well?', 'Harnessability diagnosis, suite telemetry, and effectiveness trends'],
    ko: ['에이전트 하네스가 잘 동작하는가?', '하네스 준비도 진단, 스위트 텔레메트리, 효과 추세'],
  },
  'deep-memory': {
    en: ['What should agents reuse across projects?', 'Redacted reusable memory cards and task-specific recall'],
    ko: ['에이전트가 프로젝트 간 재사용할 것은 무엇인가?', '비식별화된 재사용 메모리 카드와 작업별 회상'],
  },
  'deep-goal': {
    en: ['How do I turn this into a durable goal?', 'Compiling a long-running request into a native goal condition'],
    ko: ['이 요청을 지속 가능한 목표로 어떻게 바꾸지?', '장기 요청을 네이티브 goal 조건으로 컴파일'],
  },
  'deep-loop': {
    en: ['How do I keep long work moving across sessions?', 'Durable multi-session orchestration with proof-gated boundaries'],
    ko: ['긴 작업을 여러 세션에 걸쳐 어떻게 이어가지?', '증거 기반 경계를 갖춘 지속 가능한 다중 세션 오케스트레이션'],
  },
  'deep-model-router': {
    en: ['Which model and review depth should do this?', 'Risk-aware model, effort, and review routing before delegation'],
    ko: ['어떤 모델과 리뷰 깊이가 이 작업에 맞는가?', '위임 전 위험 기반 모델, 추론 강도, 리뷰 라우팅'],
  },
};
