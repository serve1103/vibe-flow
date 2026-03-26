# DevFlow — 컨셉 문서

> 작성일: 2026-03-26
> 상태: Draft

---

## 1. 한 줄 정의

> **Claude Code에 개발 프로세스를 입히는 경량 확장.**
> 기획하면 인터뷰+검토가, 코드를 고치면 리뷰+보안+테스트가 자동으로 따라온다.
> 설치는 파일 복사 3초. 서버 없음. 의존성 없음.

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
git clone https://github.com/user/devflow.git /tmp/devflow
cp -r /tmp/devflow/hooks/* .claude/hooks/
cp /tmp/devflow/devflow.yaml .devflow.yaml

# 끝. 3초.
```

### 5.2 설치 후 파일

```
프로젝트/
  .claude/
    hooks/
      devflow-prompt.sh     # UserPromptSubmit 훅 (기획 모드)
      devflow-code.sh       # PostToolUse 훅 (개발 모드)
    settings.json           # 훅 등록

  .devflow.yaml             # 프로세스 설정
```

### 5.3 기획 모드 동작 (UserPromptSubmit 훅)

```
사용자 프롬프트 입력
     │
     ▼
devflow-prompt.sh 발동
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
devflow-code.sh 발동
     │
     ├─ 코드 파일인가? (.ts, .js, .py, .go, .sql 등)
     │   └─ 아니면 → 통과
     │
     ├─ .devflow.yaml 로드
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
훅 스크립트에서 claude -p를 사용하여 Haiku 호출:

claude -p \
  --model claude-haiku-4-5-20251001 \
  --max-turns 1 \
  --max-budget-usd 0.05 \
  --output-format json \
  "프롬프트"

- claude.ai 인증을 공유하므로 별도 API 키 불필요
- --max-turns 1로 단일 턴 보장
- --max-budget-usd 0.05로 비용 제한
- 호출당 ~$0.002, 지연 ~2-5초
```

### 5.6 훅 이벤트별 역할

```
UserPromptSubmit (devflow-prompt.sh):
  - 프롬프트 의도 분석 → 기획 모드 발동
  - additionalContext 주입 가능 ✓
  - 차단(block) 가능 ✓

PostToolUse (devflow-code.sh):
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
  1. .devflow/pending-changes에 변경 파일 경로 누적
  2. 마지막 변경 후 5초 이내에 다른 변경이 없으면 → 리뷰 실행
  3. 연속 변경 중이면 → 스킵 (누적만)

구현: 타임스탬프 파일 비교로 간단하게 처리
```

---

## 6. 설정 파일

```yaml
# .devflow.yaml

# 기획 모드 설정
planning:
  enabled: true
  interview: true         # 빠진 정보 질문
  critical_review: true   # 비판적 검토
  doc_update: true        # 문서 갱신 제안

# 개발 모드 설정
coding:
  code_review:
    enabled: true
    severity: high         # high 이상만 보고

  security_review:
    enabled: true
    checks:
      - injection
      - secrets
      - auth_bypass

  test:
    enabled: true
    suggest: true          # 테스트 작성 제안
    command: "npm test"    # 기존 테스트 러너

  commit:
    enabled: true
    format: conventional
    auto: false            # 제안만 (자동 커밋 아님)

  docs:
    enabled: true          # 기본 활성

# 스킵 패턴
skip:
  prefix: "!"             # !로 시작하면 DevFlow 비활성
  extensions:              # 이 확장자는 코드 리뷰 스킵
    - ".md"
    - ".json"
    - ".yaml"
    - ".yml"
    - ".txt"
```

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
| 설치 | 기본 | 복잡한 설정 | **파일 복사 3초** |
| 설정 | CLAUDE.md | 다수의 설정 파일 | **YAML 1개** |
| 학습 곡선 | 없음 | 높음 | **없음** |
| 핵심 차이 | "시키면 한다" | "스킬을 호출한다" | **"알아서 따라온다"** |

---

## 9. 기술 제약 및 구현 명세

### 9.1 훅 시스템 제약

- Claude Code v2.1.51+ 필요
- UserPromptSubmit: additionalContext 주입 가능, 차단 가능
- PostToolUse: additionalContext 주입 가능, 차단 불가
- Stop: additionalContext 미지원 → 사용하지 않음

### 9.2 훅 등록 (settings.json)

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/devflow-prompt.sh",
        "timeout": 15
      }]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/devflow-code.sh",
        "timeout": 30
      }]
    }]
  }
}
```

### 9.3 훅 출력 프로토콜

```bash
# 통과 (아무것도 하지 않음)
echo '{}'
exit 0

# additionalContext 주입
echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"리뷰 결과: ..."}}'
exit 0

# 차단 (UserPromptSubmit만 가능)
echo '{"decision":"block","reason":"기획 문서가 필요합니다"}'
exit 2

# 에러 (무시하고 계속 진행 — graceful degradation)
exit 1
```

### 9.4 Haiku 호출 및 응답 파싱

```bash
RESULT=$(claude -p \
  --model claude-haiku-4-5-20251001 \
  --max-turns 1 \
  --max-budget-usd 0.05 \
  --output-format json \
  "프롬프트")

# 실패 시 graceful degradation (에러 무시, 훅 통과)
if [ $? -ne 0 ]; then
  echo '{}'
  exit 0
fi

# JSON 파싱
REVIEW=$(echo "$RESULT" | jq -r '.result // empty')
```

### 9.5 모드 상태 관리

```
.devflow/mode          # "planning" | "coding" | 파일 없음(기본=auto)
.devflow/pending       # 디바운싱용 변경 파일 목록
.devflow/chain-step    # 체이닝 현재 단계 (1=리뷰 2=테스트 3=문서 4=커밋)
```

- 기획 모드에서 PostToolUse는 스킵 (.devflow/mode가 "planning"이면)
- 체이닝 단계는 PostToolUse 발동마다 +1 증가, 커밋 후 초기화

### 9.6 디바운싱 (타임스탬프 비교 방식)

```
PostToolUse 발동 시:
  1. .devflow/pending에 변경 파일 추가
  2. .devflow/last-change에 현재 타임스탬프 기록
  3. 이전 타임스탬프와 비교: 5초 이상 경과했나?
     → 경과: 누적 변경을 일괄 리뷰 실행
     → 미경과: 스킵 (누적만)

※ sleep이 아닌 타임스탬프 비교이므로 블로킹 없음
```

### 9.7 비용

- Haiku 호출: ~$0.002/회
- 기획 모드: 프롬프트당 1회 (~$0.002)
- 개발 모드: 코드 변경 묶음당 1-2회 (~$0.004)

---

## 10. 범위

### 만드는 것

- `devflow-prompt.sh` — UserPromptSubmit 훅 (기획 모드)
- `devflow-code.sh` — PostToolUse 훅 (개발 모드)
- `.devflow.yaml` — 설정 파일 스키마 + 기본값
- `install.sh` — 설치 스크립트 (파일 복사 + settings.json 머지)
  ※ install.sh 실행 시 .claude/settings.json이 자동 생성됨
- README.md — 설치/사용 가이드

### 만들지 않는 것

- 서버, API, 웹 UI
- DB, 복잡한 상태 관리
- 팀 관리, 인증, 공유 기능
- 패키지 매니저 배포

---

## 11. 확장 경로

```
Phase 1 (지금): 기획 모드 + 개발 모드, 셸 스크립트
     ↓ 검증: "인터뷰+검토가 기획 품질을 올리는가?"
     ↓ 검증: "자동 리뷰+보안이 코드 품질을 올리는가?"

Phase 2: 패턴 학습
     → "이 프로젝트에서는 항상 DB 변경 후 마이그레이션을 만드네"
     → 패턴 감지 → 자동 제안

Phase 3: 팀 공유
     → .devflow.yaml을 Git으로 팀 공유
     → 같은 프로세스, 같은 품질 기준

Phase 4: 플랫폼
     → 분석 대시보드, 웹 UI
```
