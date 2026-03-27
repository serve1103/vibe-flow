# DevFlow — 컨셉 문서

> 작성일: 2026-03-26
> 상태: Draft

---

## 1. 한 줄 정의

> **Claude Code에 개발 프로세스를 입히는 경량 확장.**
> 기획하면 인터뷰+검토가, 코드를 고치면 리뷰+보안+테스트가 자동으로 따라온다.
> 설치는 `plugin install` 한 줄. 서버 없음. Node.js 외 의존성 없음.

---

## 2. 문제

```
Claude Code는 강력하지만 "시키는 것만 한다"

기획할 때:
  나: "이런 기능 만들고 싶어"
  AI: (바로 코드 작성 시작)
  나: "...잠깐, 먼저 구체화 좀 하자"
  AI: "어떤 부분을 구체화할까요?"
  나: "...그건 네가 물어봐야지"

  → AI가 스스로 질문하고, 비판적으로 검토하고, 문서를 정리해주면 좋겠는데
    매번 그걸 시켜야 한다.

코드 고칠 때:
  나: "이 버그 고쳐줘"
  AI: (고침) "수정했습니다"
  나: "...코드 리뷰는?"
  나: "...보안은?"
  나: "...테스트는?"
  나: "...커밋해"

  → 매번 같은 순서를 직접 지시. 까먹으면 리뷰 없이 넘어간다.
```

---

## 3. 해결: 두 가지 모드

### 3.1 기획 모드 — "생각하는 것을 도와준다"

```
나: "주문 취소에 환불 기능을 추가하고 싶어"

[DevFlow 기획 모드]
  → 스마트 인터뷰: "동기/비동기 환불? 부분 환불 지원? 환불 수수료?"
  → 비판적 검토: "이벤트 기반이 좋겠음. 단, 멱등성 처리 필요"
  → 문서 갱신: 설계 문서에 결정사항 기록

나: "이벤트 기반으로 가자"

[DevFlow 기획 모드]
  → 설계 구체화 + 비판적 검토 + 문서 반영
  → "설계 완료. 구현할까요?"

나: "응"
→ 개발 모드로 전환
```

### 3.2 개발 모드 — "품질을 자동으로 지킨다"

```
(구현 시작)

[DevFlow 개발 모드]
  → 코드 작성
  → 코드 리뷰 자동... ✓
  → 보안 검토 자동... ✓
  → 테스트 작성+실행... ✓ 3/3
  → 커밋 제안: "feat: 이벤트 기반 환불 처리"

완료.
```

### 3.3 모드 자동 전환

```
DevFlow가 프로젝트 상태를 보고 모드를 판단:

  "로그인 기능을 만들고 싶어"
    → docs/에 로그인 설계 문서가 있나?
    → 있으면 → 개발 모드 (설계가 있으니 바로 구현)
    → 없으면 → 기획 모드 (설계부터 시작)

  키워드가 아니라 프로젝트 상태로 판단하므로 오판이 없다.

  "!" 접두사
    → 스킵 모드 (DevFlow 비활성, 빠른 수정)
```

---

## 4. 무엇인가

Claude Code의 훅 시스템을 이용해서, **프롬프트 의도에 따라 적절한 개발 프로세스를 자동 실행**하는 도구.

```
Claude Code (기본)          Claude Code + DevFlow
──────────────────         ────────────────────────

"이런 거 만들고 싶어"        "이런 거 만들고 싶어"
  ↓                           ↓
바로 코딩 시작               인터뷰 (뭘 원하는지 구체화)
                              ↓
                             비판적 검토 (문제점 찾기)
                              ↓
                             문서 정리 (결정사항 기록)
                              ↓
                             "구현할까요?"


"이 버그 고쳐줘"             "이 버그 고쳐줘"
  ↓                           ↓
코드 수정                    코드 수정
  ↓                           ↓
끝.                          코드 리뷰 (자동)
                              ↓
                             보안 검토 (자동)
                              ↓
                             테스트 (자동)
                              ↓
                             커밋 제안 (자동)
```

---

## 5. 어떻게 동작하는가

### 5.1 설치

```bash
# Claude Code 플러그인으로 설치 (한 줄)
claude /plugin install github:serve1103/vibe-flow

# 또는 로컬 설치
git clone https://github.com/serve1103/vibe-flow.git
claude /plugin install ./vibe-flow
```

### 5.2 설치 후 파일

```
프로젝트/
  .claude-plugin/
    plugin.json             # 플러그인 매니페스트
    marketplace.json        # 배포 정의

  hooks/
    hooks.json              # 훅 이벤트 등록
    devflow-prompt.js       # UserPromptSubmit 훅 (기획 모드)
    devflow-code.js         # PostToolUse 훅 (개발 모드)
    lib/
      config.js             # 설정 로드 (.devflow.json)
      haiku.js              # Haiku LLM 호출 (실패 시 1회 재시도)
      extract-json.js       # LLM 응답 JSON 추출
      io.js                 # 파일 I/O 유틸리티
      cleanup.js            # 자원 관리 (스테일 정리 + 고아 프로세스 킬)

  .devflow.json             # 프로세스 설정
```

### 5.3 기획 모드 동작 (UserPromptSubmit 훅)

```
사용자 프롬프트 입력
     │
     ▼
devflow-prompt.js 발동
     │
     ├─ 프로젝트 상태 기반 모드 판단
     │   1. "!" 접두사 → 통과 (스킵 모드)
     │   2. 프롬프트에서 작업 주제 추출 (Haiku)
     │   3. docs/에서 해당 주제의 설계 문서 검색
     │      → 설계 문서 있음 → 통과 (개발 모드, PostToolUse에서 처리)
     │      → 설계 문서 없음 → 기획 모드 발동
     │
     ├─ 기획 모드일 때:
     │   1. 프로젝트 컨텍스트 수집 (CLAUDE.md, docs/, 최근 변경)
     │   2. Haiku에게 분석 요청:
     │      "이 프롬프트에서 빠진 정보는? 비판적 관점에서 문제점은?"
     │   3. 결과를 additionalContext로 주입:
     │      "실행 전 확인사항:
     │       - 동기/비동기 환불 방식을 결정해야 합니다
     │       - 비판적 검토: 멱등성 처리가 빠져있습니다
     │       - 결정 후 docs/에 설계 문서를 갱신하세요"
     │
     └─ Claude가 인터뷰 + 검토 + 문서 갱신을 자연스럽게 수행
```

### 5.4 개발 모드 동작 (PostToolUse 훅)

```
Claude Code가 Write/Edit로 코드를 수정
     │
     ▼
devflow-code.js 발동
     │
     ├─ 코드 파일인가? (스킵 확장자/파일명 제외)
     │   └─ 아니면 → 통과
     │
     ├─ .devflow.json 로드
     │
     ├─ 코드 리뷰 (활성화 시)
     │   → Haiku: "버그/로직 오류 있나?"
     │   → 문제 시 additionalContext로 수정 지시
     │
     ├─ 보안 검토 (활성화 시)
     │   → Haiku: "인젝션, 시크릿 노출 있나?"
     │   → 문제 시 additionalContext로 경고
     │
     └─ 후속 작업 체이닝 (한 번에 하나씩)
         → 1차 PostToolUse: 코드 리뷰 + 보안 검토 결과만 주입
         → Claude가 수정하면 → 2차 PostToolUse 발동
         → 2차: "테스트를 작성하세요" 주입
         → Claude가 테스트 작성하면 → 3차 PostToolUse 발동
         → 3차: "관련 문서를 갱신하세요" 주입 (경로 기반 판단)
            (routes/ 변경 → API 문서, schema/ 변경 → 모델 문서)
         → 4차: "커밋하세요" 주입

         ※ additionalContext는 힌트이므로 한 번에 3가지를 넣으면
            무시될 수 있다. 한 번에 하나씩 체이닝하면 확실하다.
```

### 5.5 Haiku API 호출 메커니즘

```
Node.js child_process.execSync로 claude -p 호출:

  execSync('claude -p --model claude-haiku-4-5-20251001 '
    + '--max-turns 1 --max-budget-usd 0.05 --output-format json',
    { input: prompt, timeout: 20000 })

- claude.ai 인증을 공유하므로 별도 API 키 불필요
- --output-format json → {type:"result", result:"텍스트"} 래퍼 반환
- .result 필드에서 텍스트 추출 후 JSON 파싱
- 호출당 ~$0.002, 지연 ~2-5초
```

### 5.6 훅 이벤트별 역할

```
UserPromptSubmit (devflow-prompt.js):
  - 프롬프트 의도 분석 → 기획 모드 발동
  - additionalContext 주입 가능 ✓
  - 차단(block) 가능 ✓

PostToolUse (devflow-code.js):
  - Write/Edit 후 코드 품질 검증
  - additionalContext 주입 가능 ✓
  - 차단 불가 (코드는 이미 작성됨, 수정 지시만 가능)

※ Stop 훅은 additionalContext를 지원하지 않으므로 사용하지 않는다.
   테스트/커밋 제안은 PostToolUse의 additionalContext에 포함시켜
   Claude가 자연스럽게 이어서 수행하도록 유도한다.
```

### 5.7 디바운싱

```
파일 10개를 연속 수정하면 Haiku가 10회 호출되는 것을 방지:

PostToolUse 훅에서:
  1. .devflow/pending에 변경 파일 경로 누적
  2. .devflow/last-change 타임스탬프와 현재 시간 비교
  3. 5000ms 미경과 → 스킵 (누적만), 경과 → 리뷰 실행

구현: Date.now() 밀리초 타임스탬프 비교, 블로킹 없음
```

---

## 6. 설정 파일

```json
// .devflow.json
{
  "planning": {
    "enabled": true
  },
  "coding": {
    "code_review": { "enabled": true },
    "security_review": { "enabled": true },
    "test": { "enabled": true },
    "commit": { "enabled": true },
    "docs": { "enabled": true }
  },
  "skip": {
    "prefix": "!",
    "extensions": ["md","json","yaml","yml","txt","toml","lock","env","cfg","ini","csv"],
    "filenames": [".gitignore",".dockerignore","Makefile","Dockerfile","LICENSE"],
    "prefixes": [".env"]
  }
}
```

> JSON 형식으로 python3/pyyaml 의존성 제거. Node.js의 `require()`로 바로 로드.

---

## 7. 사용 예시

### 7.1 기획 모드

```
$ claude
> 주문 취소에 환불 기능을 추가하고 싶어

[DevFlow] 기획 모드 활성화

실행 전 확인사항:
- 환불 방식: 동기(즉시 처리) vs 비동기(이벤트 기반)?
- 부분 환불을 지원해야 하나요?
- 환불 수수료 정책이 있나요?

비판적 검토:
- 이벤트 기반 추천: OrderCancelledEvent → RefundService 구독 구조
- 주의: 멱등성 처리 필요 (중복 환불 방지)
- 주의: 환불 실패 시 재시도/알림 전략 필요

위 내용을 확인한 후 진행하겠습니다.

> 이벤트 기반으로, 부분 환불 지원, 수수료 없음

좋습니다. 설계를 정리합니다.
(설계 문서 작성 + 비판적 검토 + docs/ 갱신)

설계가 완료되었습니다. 구현을 시작할까요?

> 응
```

### 7.2 개발 모드

```
(구현 시작 — 코드 수정 시 자동 품질 검증)

[DevFlow] 코드 리뷰...
  ⚠ high: try-catch 없음 (refund.ts:23)
  → 에러 핸들링을 추가하세요

(Claude가 자동 수정)

[DevFlow] 보안 검토... ✓ 이상 없음
[DevFlow] 테스트 작성, 문서 갱신, 커밋을 진행하세요.

(Claude가 테스트 작성 → 실행)
(API 변경 감지 → docs/API.md 갱신)
(커밋 제안)

feat: 이벤트 기반 환불 처리 추가

변경된 문서: docs/API.md (환불 엔드포인트 추가)
커밋할까요?

> 응
```

### 7.3 스킵 모드

```
> !프로덕션 500 에러, null 체크 추가해

(DevFlow 비활성 — 빠르게 수정만)
```

---

## 8. 기존 도구와의 비교

| | Claude Code | OMC | **DevFlow** |
|---|---|---|---|
| 기획 지원 | 시키면 함 | planner/architect 에이전트 | **프롬프트 입력 시 자동 인터뷰+검토** |
| 코드 리뷰 | 시키면 함 | code-reviewer 에이전트 | **코드 변경 시 자동** |
| 보안 검토 | 시키면 함 | security-reviewer 에이전트 | **코드 변경 시 자동** |
| 테스트 | 시키면 함 | tdd-guide 에이전트 | **자동 제안** |
| 설치 | 기본 | 복잡한 설정 | **plugin install 한 줄** |
| 설정 | CLAUDE.md | 다수의 설정 파일 | **JSON 1개** |
| 학습 곡선 | 없음 | 높음 | **없음** |
| 핵심 차이 | "시키면 한다" | "스킬을 호출한다" | **"알아서 따라온다"** |

---

## 9. 기술 제약 및 구현 명세

### 9.1 훅 시스템 제약

- Claude Code v2.1.51+ 필요
- UserPromptSubmit: additionalContext 주입 가능, 차단 가능
- PostToolUse: additionalContext 주입 가능, 차단 불가
- Stop: additionalContext 미지원 → 사용하지 않음

### 9.2 훅 등록 (hooks/hooks.json — 플러그인 방식)

```json
{
  "description": "DevFlow - 기획 모드 + 개발 모드 자동화",
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-prompt.js\"",
        "timeout": 30
      }]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-code.js\"",
        "timeout": 30
      }]
    }]
  }
}
```

> `${CLAUDE_PLUGIN_ROOT}`는 Claude Code가 플러그인 실행 시 자동으로 주입하는 환경 변수.

### 9.3 훅 출력 프로토콜 (Node.js)

```javascript
// 통과 (아무것도 하지 않음)
process.stdout.write(JSON.stringify({}));

// additionalContext 주입
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: '리뷰 결과: ...'
  }
}));

// 차단 (UserPromptSubmit만 가능)
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: '기획 문서가 필요합니다'
}));
process.exit(2);

// 에러 시 graceful degradation (빈 JSON 출력)
```

### 9.4 Haiku 호출 및 응답 파싱 (hooks/lib/haiku.js)

```javascript
const { execSync } = require('child_process');
const { extractJson } = require('./extract-json');

function callHaiku(prompt, fallback, options = {}) {
  const budget = options.budget || 0.05;
  const retries = options.retries ?? 1;  // MAX_RETRIES=1

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = execSync(
        `claude -p --model claude-haiku-4-5-20251001 `
        + `--max-turns 1 --max-budget-usd ${budget} --output-format json`,
        { input: prompt, timeout: 20000, encoding: 'utf-8' }
      );
      const wrapper = JSON.parse(raw);
      const text = wrapper.result || '';    // .result 필드에서 텍스트 추출
      return extractJson(text, fallback);   // 텍스트에서 JSON 파싱
    } catch {
      if (attempt < retries) continue;      // 재시도
      return fallback;                      // 최종 실패 → fallback 반환
    }
  }
}
```

### 9.5 모드 상태 관리

```
.devflow/mode            # "planning" | "coding" | 파일 없음(기본=auto)
.devflow/pending         # 디바운싱용 변경 파일 목록
.devflow/last-change     # 마지막 변경 타임스탬프 (밀리초)
.devflow/chain-step      # 체이닝 현재 단계 (1=리뷰 2=테스트 3=문서 4=커밋)
.devflow/review-targets  # 1단계에서 저장한 리뷰 대상 파일 (3단계 문서 판단용)
.devflow/needs-recovery  # 고아 프로세스 킬 후 복구 플래그 (타임스탬프)
```

- 기획 모드에서 PostToolUse는 스킵 (.devflow/mode가 "planning"이면)
- 체이닝 단계는 PostToolUse 발동마다 +1 증가, 커밋 후 초기화
- 새 프롬프트 입력 시 chain-step 리셋 (devflow-prompt.js에서 처리)

### 9.6 디바운싱 (밀리초 타임스탬프 비교)

```
PostToolUse 발동 시:
  1. .devflow/pending에 변경 파일 추가 (최대 100줄)
  2. .devflow/last-change의 타임스탬프와 Date.now() 비교
  3. 5000ms 이상 경과?
     → 경과: 누적 변경을 일괄 리뷰 실행
     → 미경과: 타임스탬프 갱신, 스킵 (누적만)

※ sleep이 아닌 타임스탬프 비교이므로 블로킹 없음
※ 첫 번째 편집은 타임스탬프 파일이 없으므로 항상 통과
```

### 9.7 자원 관리 (hooks/lib/cleanup.js)

```
훅 실행 시 자동으로 자원 관리 수행:

1. 스테일 상태 정리 (cleanupStaleState)
   - .devflow/last-change가 30분 이상 경과 → 모든 상태 파일 초기화
   - 실행 시점: 매 UserPromptSubmit, 매 PostToolUse

2. 고아 프로세스 탐지 및 킬 (killOrphanedProcesses)
   - claude -p --model claude-haiku 프로세스 중 60초 이상 실행 중인 것 탐지
   - SIGTERM으로 정리
   - macOS/Linux: ps aux + grep, Windows: wmic
   - 실행 시점: 매 UserPromptSubmit (runCleanup)

3. 자동 복구 (checkRecovery)
   - 고아 프로세스 킬 시 .devflow/needs-recovery 플래그 기록
   - 다음 PostToolUse에서 플래그 감지 → chain-step을 1로 리셋
   - 플래그 소비 후 삭제 (1회성)
   - Haiku 호출 실패 시 1회 자동 재시도 (MAX_RETRIES=1)
```

### 9.8 비용

- Haiku 호출: ~$0.001-0.002/회
- 기획 모드: 프롬프트당 1회 (~$0.001-0.002)
- 개발 모드: 코드 변경 묶음당 1-2회 (~$0.002-0.004)

---

## 10. 범위

### 만드는 것

- `hooks/devflow-prompt.js` — UserPromptSubmit 훅 (기획 모드)
- `hooks/devflow-code.js` — PostToolUse 훅 (개발 모드)
- `hooks/lib/` — 공유 라이브러리 (config, haiku, extract-json, io, cleanup)
- `hooks/hooks.json` — 훅 이벤트 등록
- `.claude-plugin/plugin.json` — 플러그인 매니페스트
- `.devflow.json` — 설정 파일 (JSON)
- README.md — 설치/사용 가이드

### 만들지 않는 것

- 서버, API, 웹 UI
- DB, 복잡한 상태 관리
- 팀 관리, 인증, 공유 기능
- npm 외부 의존성 (zero dependencies)

---

## 11. 확장 경로

```
Phase 1 (v0.2, 완료): 기획 모드 + 개발 모드, Node.js 플러그인
     ✓ 4단계 체이닝, 자원 관리, 고아 프로세스 정리

Phase 2 (v0.3, 완료): 스킬 모듈화
     ✓ 하드코딩 프롬프트 → skills/*/SKILL.md 분리
     ✓ skill-loader.js + references/ 인라인
     ✓ /devflow:스킬 수동 호출 지원 (플러그인 설치 시)

Phase 3 (v0.4, 완료): 자가 학습
     ✓ PostToolUse async 관찰 (observations.jsonl)
     ✓ Stop 훅 transcript 분석 (피드백 추출)
     ✓ 학습 규칙 자동 생성 (.devflow/learned-rules/)
     ✓ 드리프트 방지 (만료일 30일, 상한 10개, 보안 스킬 제외)

Phase 4 (v0.5, 완료): 스킬 자율 체이닝
     ✓ 훅 chain-step 제거 → Skill 도구로 스킬 간 호출
     ✓ agents/ 등록 (reviewer, security-reviewer)
     ✓ 워크플로우 마스터 스킬 (coding-workflow, planning-workflow)
     ✓ 아티팩트 기반 전제조건 (.devflow/results/)
     ✓ 5분 쿨다운으로 무한 루프 방지

Phase 5: 팀 공유 + 플랫폼
     → .devflow.json을 Git으로 팀 공유
     → Claude Code 플러그인 마켓플레이스 배포
     → 분석 대시보드
```
