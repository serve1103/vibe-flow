# DevFlow Phase 3: 자가 학습

> 상태: 설계
> 의존: Phase 2 (스킬 모듈화) 완료 후 진행
> 핵심: transcript 파싱 기반 피드백 수집 + 규칙 기반 분석 + SKILL.md 자동 갱신

---

## 1. 목표

DevFlow의 스킬(코드 리뷰, 보안 검토 등)이 프로젝트 특성에 맞게 자동으로 개선된다.

```
세션 1: 코드 리뷰가 "try-catch 추가하세요" 제안 → 사용자 무시 (3회)
세션 2: 코드 리뷰가 "try-catch 추가하세요" 제안 → 사용자 무시 (2회)
세션 3: 학습 완료 → "이 프로젝트에서 try-catch 미사용은 의도적 패턴"
세션 4: 코드 리뷰가 try-catch 관련 제안을 하지 않음
```

---

## 2. 아키텍처

```
[PostToolUse async]         [Stop 훅]              [학습 갱신]
  매 Write/Edit 후            매 턴 완료 시           패턴 임계값 도달 시
  관찰 기록                   transcript 분석         SKILL.md 갱신
       ↓                          ↓                       ↓
  .devflow/feedback/          .devflow/feedback/      skills/*/SKILL.md
  observations.jsonl          analysis.jsonl          "학습된 규칙" 섹션
```

---

## 3. 피드백 수집 (PostToolUse async)

### 3.1 훅 등록

```json
// hooks/hooks.json에 추가
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-code.js\"",
          "timeout": 30
        },
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-observe.js\"",
          "timeout": 10,
          "async": true
        }
      ]
    }
  ]
}
```

### 3.2 관찰 기록 (devflow-observe.js)

```
PostToolUse 발동 (async, 비블로킹)
  ↓
입력에서 추출:
  - tool_name (Write/Edit)
  - file_path
  - tool_input (content/old_string/new_string)
  ↓
.devflow/feedback/observations.jsonl에 1줄 추가:
  {
    "timestamp": 1711500000,
    "session_id": "...",
    "tool": "Edit",
    "file": "src/auth.ts",
    "context": "try-catch 추가"  // 변경 내용 요약 (첫 50자)
  }
```

### 3.3 관찰 파일 관리

| 규칙 | 값 |
|------|-----|
| 최대 크기 | 1MB (초과 시 오래된 절반 삭제) |
| 자동 삭제 | 30일 이상 된 엔트리 |
| 시크릿 스크러빙 | API 키, 토큰 패턴 치환 |

---

## 4. 피드백 분석 (Stop 훅)

### 4.1 훅 등록

```json
// hooks/hooks.json에 추가
{
  "Stop": [
    {
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-analyze.js\"",
        "timeout": 10
      }]
    }
  ]
}
```

### 4.2 분석 로직 (devflow-analyze.js)

```
Stop 훅 발동
  ↓
input.transcript_path에서 JSONL 파싱
  ↓
DevFlow 관련 턴 추출:
  - additionalContext에 "[DevFlow" 포함된 턴
  - 해당 턴 이후 Claude의 응답 (수정했는지, 무시했는지)
  ↓
피드백 신호 판단:
  - DevFlow 리뷰 제안 → 직후 Edit/Write 발생 → "accepted"
  - DevFlow 리뷰 제안 → 직후 다른 작업 → "ignored"
  - 사용자 프롬프트에 "불필요", "무시", "스킵" → "rejected"
  ↓
.devflow/feedback/analysis.jsonl에 기록:
  {
    "timestamp": 1711500000,
    "skill": "code-review",
    "suggestion": "try-catch 추가",
    "signal": "ignored",
    "count": 1
  }
```

### 4.3 Haiku 미사용 이유

- transcript 파싱은 규칙 기반으로 충분 (JSON 필드 매칭)
- Stop 훅 타임아웃이 10초 — Haiku 호출(3-5초)은 위험
- 추가 비용 $0 유지

---

## 5. 학습 규칙 갱신

### 5.1 트리거 조건

```
analysis.jsonl에서 동일 skill + 동일 패턴의 "ignored" 신호가 N회 이상
  → 학습 규칙 후보 생성
```

| 설정 | 기본값 | 설명 |
|------|--------|------|
| 임계값 | 5회 | 같은 제안이 5회 무시되면 규칙 생성 |
| 기간 | 30일 | 최근 30일 내 데이터만 집계 |
| 최대 규칙 수 | 스킬당 10개 | 초과 시 가장 오래된 것 제거 |

### 5.2 규칙 저장 위치

SKILL.md에 직접 쓰지 않고 별도 파일로 관리:

```
.devflow/
  learned-rules/
    code-review.json
    security-check.json
```

```json
// .devflow/learned-rules/code-review.json
{
  "rules": [
    {
      "pattern": "try-catch 추가",
      "action": "skip",
      "reason": "5회 무시됨 — 이 프로젝트에서 의도적 패턴으로 판단",
      "created": "2026-03-27",
      "expires": "2026-04-26",
      "count": 5
    }
  ]
}
```

### 5.3 규칙 적용

skill-loader.js가 SKILL.md 로드 시 learned-rules도 함께 로드:

```javascript
function loadSkillPrompt(skillName, cwd) {
  let content = readSkillMd(skillName);

  // 학습된 규칙 로드
  const rulesPath = path.join(cwd, '.devflow', 'learned-rules', `${skillName}.json`);
  const rules = loadJson(rulesPath);

  if (rules && rules.rules.length > 0) {
    const activeRules = rules.rules
      .filter(r => new Date(r.expires) > new Date())  // 만료 체크
      .map(r => `- ${r.pattern}: ${r.action} (${r.reason})`)
      .join('\n');

    if (activeRules) {
      content += `\n\n## 학습된 규칙 (자동 생성)\n다음 패턴은 이 프로젝트에서 무시하세요:\n${activeRules}`;
    }
  }

  return content;
}
```

### 5.4 수동 호출 시

`/devflow:code-review`로 수동 호출할 때도 Claude가 `.devflow/learned-rules/code-review.json`을 참조하도록 SKILL.md에 안내:

```markdown
## 학습된 규칙
이 프로젝트의 학습된 규칙은 .devflow/learned-rules/code-review.json에 있습니다.
리뷰 전에 이 파일을 Read로 확인하고, 해당 패턴은 리뷰에서 제외하세요.
```

---

## 6. 드리프트 방지

| 메커니즘 | 설명 |
|----------|------|
| SKILL.md 불변 | 기본 절차/제약은 자동 수정 안 함 |
| 별도 파일 분리 | 학습 규칙은 `.devflow/learned-rules/`에만 저장 |
| 만료일 | 각 규칙에 30일 만료. 만료 후 자동 제거 |
| 상한선 | 스킬당 최대 10개 규칙 |
| action 제한 | `skip`만 허용 (리뷰 기준 자체를 바꾸지 않음) |
| 수동 오버라이드 | 사용자가 learned-rules JSON을 직접 편집/삭제 가능 |

---

## 7. 신규 파일

| 파일 | 역할 |
|------|------|
| `hooks/devflow-observe.js` | PostToolUse async — 관찰 기록 |
| `hooks/devflow-analyze.js` | Stop 훅 — transcript 분석 + 피드백 추출 |
| `hooks/lib/transcript.js` | transcript JSONL 파싱 유틸리티 |
| `hooks/lib/learning.js` | 학습 규칙 관리 (생성, 만료 체크, 적용) |

### hooks.json 변경

```json
{
  "description": "DevFlow - 기획 모드 + 개발 모드 + 자가 학습",
  "hooks": {
    "UserPromptSubmit": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-prompt.js\"", "timeout": 30 }] }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-code.js\"", "timeout": 30 },
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-observe.js\"", "timeout": 10, "async": true }
        ]
      }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/devflow-analyze.js\"", "timeout": 10 }] }
    ]
  }
}
```

---

## 8. 비용

| 항목 | 비용 | 지연 |
|------|------|------|
| 관찰 기록 (PostToolUse async) | $0 | 비블로킹 |
| transcript 분석 (Stop) | $0 | <1초 (규칙 기반) |
| 학습 규칙 갱신 | $0 | <1ms (파일 쓰기) |
| **Phase 3 추가 비용** | **$0** | **무시 가능** |

Haiku 미호출이므로 추가 비용 없음.

---

## 9. 제약 사항

- **transcript 파싱 정확도**: Claude 응답에서 "리뷰 제안을 반영했는지"를 정확히 판단하기 어려울 수 있음. 초기에는 보수적으로 판단 (임계값 5회)
- **Stop 훅 다중 실행**: Stop 훅은 세션 종료가 아닌 매 턴 완료 시 실행됨. 분석은 가볍게 유지 필요
- **멀티 세션**: 여러 세션이 동시에 같은 프로젝트에서 실행되면 feedback 파일 경쟁. `.devflow/feedback/`에 세션별 파일 분리로 해결
- **false positive 학습**: 사용자가 의도적으로 무시한 것과 까먹고 무시한 것 구분 불가. 높은 임계값(5회)으로 완화
