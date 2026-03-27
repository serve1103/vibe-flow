# DevFlow 스킬 아키텍처 설계

> 상태: Phase 2 설계
> 결정: 안 1+3 하이브리드 + 아티팩트 기반 전제조건 + 자가 학습

---

## 1. 핵심 구조

```
훅 = 모드 판단 + 워크플로우 스킬 호출 (얇은 라우터)
스킬 = 독립 모듈 (절차 + 제약 + 예시 + 학습 규칙)
Haiku = 분석 워커 (스킬이 에이전트로 소환)
아티팩트 = 전제조건 검증 (.devflow/results/)
```

---

## 2. 스킬 폴더 구조 (4층 표준)

```
skills/
  coding-workflow/                 # 워크플로우 마스터 스킬
    SKILL.md
  planning-workflow/               # 기획 워크플로우 마스터 스킬
    SKILL.md

  interview/                       # 개별 스킬
    SKILL.md                       # 워크플로우 + frontmatter
    references/                    # 상세 기준, 패턴
      question-patterns.md
    examples/                      # 좋은/나쁜 예시
      good-interview.md
      bad-interview.md

  critical-review/
    SKILL.md
    references/
      review-criteria.md
    examples/
      good-review.md

  code-review/
    SKILL.md
    references/
      severity-guide.md            # 심각도 기준
      review-patterns.md           # 리뷰 패턴 카탈로그
    examples/
      good-review.md
      false-positive.md
    scripts/
      run-haiku-review.js          # Haiku 에이전트 호출

  security-check/
    SKILL.md
    references/
      owasp-checklist.md
    examples/
      vulnerability-examples.md
    scripts/
      run-haiku-security.js

  test-suggest/
    SKILL.md
    references/
      test-patterns.md
    examples/
      test-examples.md

  doc-update/
    SKILL.md
    references/
      doc-triggers.md              # 어떤 변경이 문서 갱신을 유발하는지

  commit/
    SKILL.md
    references/
      conventional-commits.md
    examples/
      good-commits.md
```

---

## 3. SKILL.md 표준 구조

### frontmatter

```yaml
---
name: code-review
description: |
  코드 변경 후 리뷰를 수행한다.
  Write/Edit 도구 사용 후 또는 사용자가 /devflow:code-review로 호출 시 활성화.
allowed-tools: [Read, Grep, Glob, Agent]
next-skill: security-check
handoff: .devflow/results/code-review.json
---
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | O | 스킬 식별자 |
| `description` | O | 트리거 조건 (Claude가 자동 활성화 판단에 사용) |
| `allowed-tools` | - | 스킬에 사전 승인된 도구 |
| `next-skill` | - | 완료 후 다음 스킬 |
| `handoff` | - | 다음 스킬에 넘겨줄 아티팩트 경로 |

### 본문 구조

```markdown
# 스킬 이름

## 전제 조건
- .devflow/results/이전스킬.json이 존재하는지 Read로 확인
- 없으면 이전 스킬을 먼저 실행

## 절차
1. (구체적 단계)
2. ...

## 제약 사항
- (하지 말아야 할 것)

## 완료 조건
- .devflow/results/이스킬.json에 결과 저장
- 다음 스킬: /devflow:{next-skill}

## 학습된 규칙
(이 섹션은 자동으로 갱신됩니다. 기본 절차는 수정하지 마세요.)
```

---

## 4. 체이닝 — 3중 보강

### 4.1 워크플로우 스킬이 전체 순서 제시

```markdown
# skills/coding-workflow/SKILL.md
---
name: coding-workflow
description: |
  코드 변경 시 자동 실행되는 개발 워크플로우.
  훅이 이 스킬을 호출합니다.
---

# 개발 워크플로우

## 실행 순서 (모든 단계를 반드시 순서대로 실행)
1. /devflow:code-review — 코드 리뷰
2. /devflow:security-check — 보안 검토
3. /devflow:test-suggest — 테스트 제안
4. /devflow:doc-update — 문서 갱신 (API/스키마 변경 시만)
5. /devflow:commit — 커밋 제안

## 규칙
- 스킵 금지. 각 스킬의 전제 조건을 확인 후 진행.
- 각 스킬 완료 시 .devflow/results/에 결과 저장 필수.
- 이전 단계 결과 파일이 없으면 해당 단계부터 재실행.
```

### 4.2 각 스킬이 다음 스킬 안내

```yaml
# code-review/SKILL.md frontmatter
next-skill: security-check
handoff: .devflow/results/code-review.json
```

### 4.3 아티팩트 기반 전제조건

```markdown
# security-check/SKILL.md
## 전제 조건
- .devflow/results/code-review.json을 Read로 확인하세요
- 파일이 없으면 /devflow:code-review를 먼저 실행하세요
```

```
.devflow/
  results/
    code-review.json       # { timestamp, issues: [...], passed: true }
    security-check.json    # { timestamp, safe: true, issues: [...] }
    test-suggest.json      # { timestamp, tests_written: [...] }
    doc-update.json        # { timestamp, updated_files: [...] }
    commit.json            # { timestamp, commit_hash: "..." }
```

---

## 5. 훅의 역할 (얇은 라우터)

### devflow-prompt.js (기획 모드)

```
프롬프트 입력
  ↓ cleanup + 모드 판단 (Haiku)
  ↓ 기획 모드 → additionalContext: "planning-workflow 스킬을 실행하세요"
  ↓ 개발 모드 → 통과 (PostToolUse에서 처리)
```

### devflow-code.js (개발 모드)

```
Write/Edit 감지
  ↓ cleanup + 디바운싱
  ↓ 첫 번째 발동 → additionalContext: "coding-workflow 스킬을 실행하세요"
  ↓ 워크플로우 진행 중 → 스킵 (Claude가 스킬 체인 실행 중)
```

기존 chain-step 로직 제거. 훅은 워크플로우 시작만 트리거.

---

## 6. Haiku 에이전트 위임 (비용 최적화)

스킬이 분석 작업을 Haiku 에이전트에 위임하는 패턴:

```markdown
# code-review/SKILL.md

## 절차
1. 변경된 코드를 수집 (Read 도구 사용)
2. Haiku 에이전트를 소환하여 코드 리뷰 위임:
   - Agent 도구 사용, model: haiku
   - "다음 코드를 리뷰하세요. high 이상만 보고."
   - 결과를 JSON으로 받음
3. 리뷰 결과를 분석하고 수정 여부 판단 (Claude 본체)
4. 수정이 필요하면 직접 수정 (Claude 본체)
5. .devflow/results/code-review.json에 결과 저장
```

| 역할 | 실행자 | 비용 |
|------|--------|------|
| 코드 수집 | Claude 본체 (이미 실행 중) | $0 |
| 코드 분석 | Haiku 에이전트 | ~$0.001-0.002 |
| 판단/수정 | Claude 본체 | $0 |

수동 호출 시 (`/devflow:code-review`): Claude 본체가 직접 리뷰 (Haiku 없이 고품질).

---

## 7. 자가 학습 루프

### 7.1 피드백 수집

| 신호 | 수집 방법 | 의미 |
|------|-----------|------|
| Claude가 제안을 반영함 | 리뷰 후 Write/Edit 발생 | 유효한 제안 |
| 사용자가 무시함 | 리뷰 후 다른 작업으로 이동 | false positive 가능 |
| 사용자가 "불필요" 발언 | 프롬프트에 부정적 키워드 | 명시적 피드백 |
| 스킬 실행 에러 | 에이전트 실패, 타임아웃 | 프롬프트 개선 필요 |

저장 위치: `.devflow/feedback/{skill-name}.jsonl`

```json
{"timestamp": 1711500000, "skill": "code-review", "signal": "accepted", "context": "try-catch 추가 제안"}
{"timestamp": 1711500100, "skill": "code-review", "signal": "ignored", "context": "null 체크 제안"}
```

### 7.2 패턴 분석 (세션 종료 시)

Stop 훅 또는 세션 종료 시 Haiku가 피드백을 분석:

```
.devflow/feedback/code-review.jsonl 읽기
  ↓ Haiku에게 패턴 분석 요청
  ↓ "이 프로젝트에서 try-catch 미사용은 의도적 패턴" 도출
  ↓ skills/code-review/SKILL.md의 "학습된 규칙" 섹션에 추가
```

### 7.3 드리프트 방지

| 규칙 | 설명 |
|------|------|
| 기본 프롬프트 불변 | SKILL.md의 "절차", "제약 사항" 섹션은 자동 수정 금지 |
| 학습 규칙 분리 | "학습된 규칙" 섹션만 자동 갱신 |
| 만료일 | 각 규칙에 날짜 기록, 30일 후 재검증 |
| 상한선 | 스킬당 최대 10개 규칙. 초과 시 가장 오래된 것 제거 |
| 분류 | Expertise(도메인 지식)만 자동 업데이트, Workflow(절차)는 불변 |

### 7.4 학습된 규칙 예시

```markdown
## 학습된 규칙
<!-- 이 섹션은 자동 갱신됩니다. 직접 수정하지 마세요. -->
- 이 프로젝트에서 try-catch 미사용은 의도적 패턴 (2026-03-27, 만료: 2026-04-26)
- .test.ts 파일의 any 타입 사용은 허용 (2026-03-27, 만료: 2026-04-26)
```

---

## 8. plugin.json 변경

```json
{
  "name": "devflow",
  "version": "0.3.0",
  "description": "Claude Code에 개발 프로세스를 입히는 경량 확장",
  "author": { "name": "serve1103" },
  "repository": "https://github.com/serve1103/vibe-flow",
  "license": "MIT",
  "hooks": "./hooks/hooks.json",
  "skills": "./skills/"
}
```

---

## 9. 워크플로우 전체 흐름

### 기획 모드

```
사용자 프롬프트 입력
  ↓
[훅] devflow-prompt.js
  ↓ Haiku: docs/에 설계 문서 있나?
  ↓ 없음 → "planning-workflow 스킬을 실행하세요"
  ↓
[스킬] planning-workflow
  ↓ "1. interview → 2. critical-review → 3. doc-update"
  ↓
[스킬] interview
  ↓ 전제조건: 없음 (첫 스킬)
  ↓ 실행: 프로젝트 컨텍스트 수집 → 질문 생성
  ↓ 결과: .devflow/results/interview.json
  ↓ next-skill: critical-review
  ↓
[스킬] critical-review
  ↓ 전제조건: interview.json 존재 확인
  ↓ 실행: 리스크 분석, 우려사항 도출
  ↓ 결과: .devflow/results/critical-review.json
  ↓ next-skill: doc-update
  ↓
[스킬] doc-update
  ↓ 전제조건: critical-review.json 존재 확인
  ↓ 실행: docs/에 설계 문서 작성
  ↓ 결과: .devflow/results/doc-update.json
  ↓ 완료
```

### 개발 모드

```
Claude가 Write/Edit 실행
  ↓
[훅] devflow-code.js
  ↓ 디바운싱 + cleanup
  ↓ "coding-workflow 스킬을 실행하세요"
  ↓
[스킬] coding-workflow
  ↓ "1. code-review → 2. security-check → 3. test-suggest → 4. doc-update → 5. commit"
  ↓
[스킬] code-review
  ↓ 전제조건: 없음 (첫 스킬)
  ↓ 실행: Haiku 에이전트로 코드 분석 → Claude가 판단/수정
  ↓ 결과: .devflow/results/code-review.json
  ↓ next-skill: security-check
  ↓
[스킬] security-check
  ↓ 전제조건: code-review.json 확인
  ↓ 실행: Haiku 에이전트로 보안 검토 → Claude가 판단/수정
  ↓ 결과: .devflow/results/security-check.json
  ↓ next-skill: test-suggest
  ↓
[스킬] test-suggest → [스킬] doc-update → [스킬] commit
  ↓
[세션 종료 시] 피드백 분석 → 학습된 규칙 갱신
```

---

## 10. 마이그레이션 (v0.2 → v0.3)

| 항목 | v0.2 (현재) | v0.3 (스킬 기반) |
|------|-------------|------------------|
| 훅 | 모드 판단 + 실행 + 체이닝 | 모드 판단 + 워크플로우 시작만 |
| 프롬프트 | 훅 코드에 하드코딩 | SKILL.md에 분리 |
| 체이닝 | chain-step 파일 + PostToolUse | 워크플로우 스킬 + next-skill + 전제조건 |
| Haiku 호출 | 훅에서 직접 execSync | 스킬이 Agent 도구로 위임 |
| 설정 | .devflow.json | .devflow.json + 워크플로우 순서 |
| 상태 파일 | chain-step, pending, last-change | results/, feedback/ |
| 피드백 | 없음 | 자동 수집 + 학습 |

### 마이그레이션 단계

1. `skills/` 디렉토리 생성, 7개 스킬 SKILL.md 작성
2. 워크플로우 마스터 스킬 2개 작성 (planning-workflow, coding-workflow)
3. `plugin.json`에 `"skills": "./skills/"` 추가
4. `devflow-prompt.js` 경량화 (모드 판단 → 워크플로우 스킬 호출)
5. `devflow-code.js` 경량화 (디바운싱 → 워크플로우 스킬 호출)
6. chain-step 로직 제거
7. 피드백 수집 훅 추가 (선택)
8. 테스트 및 검증

---

## 11. 비용 비교

| 항목 | v0.2 | v0.3 |
|------|------|------|
| 기획 모드 판단 | ~$0.001-0.002 (Haiku) | ~$0.001-0.002 (Haiku) |
| 코드 리뷰 | ~$0.001-0.002 (Haiku) | ~$0.001-0.002 (Haiku 에이전트) |
| 보안 검토 | ~$0.001-0.002 (Haiku) | ~$0.001-0.002 (Haiku 에이전트) |
| 피드백 분석 | 없음 | ~$0.001-0.002/세션 (Haiku) |
| **총 비용** | **~$0.002-0.004/사이클** | **~$0.003-0.006/사이클** |

피드백 분석이 세션당 1회 추가. 실질적 차이 미미.
