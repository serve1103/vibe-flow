# DevFlow 스킬 아키텍처 설계

> 상태: Phase 2 설계
> 원칙: 검증된 v0.2 훅 체이닝 유지 + 하드코딩 프롬프트를 SKILL.md로 모듈화

---

## 1. 핵심 구조

```
훅 = 모드 판단 + 체이닝 + Haiku 호출 (검증된 v0.2 유지)
스킬 = 프롬프트 라이브러리 + 수동 호출 가능한 독립 모듈
```

### v0.2 → v0.3 변경점

| 항목 | v0.2 | v0.3 |
|------|------|------|
| 프롬프트 | 훅 코드에 하드코딩 | SKILL.md에서 로드 |
| 수동 호출 | 불가 | `/devflow:code-review`로 가능 |
| 리뷰 기준 | 코드에 내장 | `references/`에 분리 |
| 예시 | 없음 | `examples/`에 정리 |
| 체이닝 | chain-step (유지) | chain-step (유지) |
| Haiku 호출 | execSync (유지) | execSync (유지) |
| 디바운싱 | 타임스탬프 비교 (유지) | 타임스탬프 비교 (유지) |

---

## 2. 스킬 폴더 구조

```
skills/
  interview/                       # 기획: 스마트 인터뷰
    SKILL.md
    references/
      question-patterns.md         # 질문 생성 패턴
    examples/
      good-interview.md

  critical-review/                 # 기획: 비판적 검토
    SKILL.md
    references/
      review-criteria.md
    examples/
      good-review.md

  code-review/                     # 개발: 코드 리뷰
    SKILL.md
    references/
      severity-guide.md            # 심각도 기준 (critical/high/medium/low)
      review-patterns.md           # 리뷰 패턴 카탈로그
    examples/
      good-review.md               # 좋은 리뷰 예시
      false-positive.md            # false positive 사례

  security-check/                  # 개발: 보안 검토
    SKILL.md
    references/
      owasp-checklist.md           # 체크 항목 상세
    examples/
      vulnerability-examples.md

  test-suggest/                    # 개발: 테스트 제안
    SKILL.md
    references/
      test-patterns.md
    examples/
      test-examples.md

  doc-update/                      # 공통: 문서 갱신
    SKILL.md
    references/
      doc-triggers.md              # 어떤 변경이 문서 갱신을 유발하는지

  commit/                          # 개발: 커밋 제안
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
  코드 리뷰를 수행한다. 변경된 코드의 버그, 로직 오류, 설계 문제를 검출한다.
  /devflow:code-review로 수동 호출 가능.
---
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | O | 스킬 식별자 |
| `description` | O | 스킬 설명 + 수동 호출 시 안내 |

### 본문 구조

```markdown
# 코드 리뷰

## 목적
코드 변경에서 high 이상 심각도의 문제를 찾아 수정 제안.

## 절차
1. 변경된 코드를 확인
2. references/severity-guide.md 기준으로 리뷰
3. high 이상 이슈가 있으면 구체적 수정 제안
4. 이슈가 없으면 "이상 없음" 보고

## 제약 사항
- medium/low 심각도는 보고하지 않음
- 스타일/포맷팅 이슈는 무시
- 이미 알려진 패턴(references/ 참조)은 제외

## 참조
- references/severity-guide.md: 심각도 기준
- references/review-patterns.md: 리뷰 패턴
- examples/good-review.md: 리뷰 예시
- examples/false-positive.md: false positive 사례
```

---

## 4. skill-loader.js

훅이 SKILL.md를 읽어서 Haiku 프롬프트로 변환하는 모듈.

```javascript
// hooks/lib/skill-loader.js
const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.resolve(__dirname, '..', '..');

function loadSkillPrompt(skillName) {
  const skillDir = path.join(PLUGIN_ROOT, 'skills', skillName);
  const skillPath = path.join(skillDir, 'SKILL.md');

  try {
    let content = fs.readFileSync(skillPath, 'utf-8');
    // frontmatter 제거
    content = content.replace(/^---[\s\S]*?---\n/, '').trim();

    // references/ 인라인 (Haiku에게 전달할 때)
    const refsDir = path.join(skillDir, 'references');
    if (fs.existsSync(refsDir)) {
      const refs = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
      for (const ref of refs) {
        const refContent = fs.readFileSync(path.join(refsDir, ref), 'utf-8');
        content += `\n\n---\n## ${ref}\n${refContent}`;
      }
    }

    return content;
  } catch {
    return null;  // 스킬 없으면 null → 기존 하드코딩 프롬프트 폴백
  }
}

module.exports = { loadSkillPrompt };
```

---

## 5. 훅 변경 — 프롬프트 로드만 변경

### devflow-code.js 변경 (1단계 코드 리뷰 예시)

```javascript
// 현재 (v0.2) — 하드코딩
const reviewPrompt = `다음 코드 변경을 리뷰하세요. high 이상 심각도의 문제만 보고하세요.
파일: ${pendingFiles}
코드: <code>${codeContent}</code>
JSON으로만 응답: {"issues":[...]}`;

// 변경 (v0.3) — SKILL.md에서 로드
const { loadSkillPrompt } = require('./lib/skill-loader');
const skillPrompt = loadSkillPrompt('code-review');
const reviewPrompt = skillPrompt
  ? `${skillPrompt}\n\n파일: ${pendingFiles}\n코드:\n<code>\n${codeContent}\n</code>\n\nJSON으로만 응답:\n{"issues":[...]}`
  : /* v0.2 폴백 프롬프트 */;
```

### 변경되지 않는 것

- chain-step 체이닝 로직 (그대로)
- 디바운싱 (그대로)
- Haiku 호출 방식 — `execSync('claude -p --model haiku')` (그대로)
- cleanup / recovery (그대로)
- 모드 판단 로직 (그대로)

---

## 6. 수동 호출

plugin.json에 skills 경로를 등록하면 사용자가 직접 호출 가능:

```json
{
  "name": "devflow",
  "version": "0.3.0",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

```
/devflow:code-review     → Claude 본체가 SKILL.md 읽고 직접 리뷰
/devflow:security-check  → Claude 본체가 직접 보안 검토
/devflow:interview       → Claude 본체가 인터뷰 수행
```

**자동 vs 수동 차이:**

| | 자동 (훅) | 수동 (/devflow:스킬) |
|---|---|---|
| 트리거 | Write/Edit 후 훅 발동 | 사용자 직접 입력 |
| 실행자 | Haiku (execSync) | Claude 본체 |
| 품질 | 빠르고 저렴 | 느리지만 고품질 |
| 용도 | 일상적 자동 검증 | 중요한 코드 수동 심층 리뷰 |

---

## 7. 마이그레이션 계획

### 구현 순서

1. `skills/` 디렉토리 생성, 7개 스킬 SKILL.md 작성
2. `references/`, `examples/` 콘텐츠 작성
3. `hooks/lib/skill-loader.js` 구현
4. `devflow-code.js` — 하드코딩 프롬프트를 `loadSkillPrompt()` 호출로 교체
5. `devflow-prompt.js` — 기획 모드 프롬프트를 `loadSkillPrompt()` 호출로 교체
6. `plugin.json`에 `"skills": "./skills/"` 추가
7. 테스트: 자동 모드 (훅) + 수동 모드 (/devflow:스킬) 검증
8. v0.2 하드코딩 프롬프트는 폴백으로 유지 (SKILL.md 로드 실패 시)

### 롤백 전략

- `loadSkillPrompt()`가 null 반환 시 기존 하드코딩 프롬프트 사용
- `skills/` 디렉토리를 삭제하면 v0.2 동작으로 즉시 복원
- plugin.json에서 `"skills"` 필드를 제거하면 수동 호출만 비활성화

### 테스트 기준

- [ ] 코드 변경 시 자동 리뷰 동작 (SKILL.md 프롬프트 사용 확인)
- [ ] SKILL.md 없을 때 폴백 프롬프트로 동작
- [ ] `/devflow:code-review` 수동 호출 동작
- [ ] references/ 내용이 Haiku 프롬프트에 포함되는지 확인
- [ ] 기존 체이닝 (1→2→3→4단계) 정상 동작

---

## 8. Phase 로드맵 (수정)

```
Phase 1 (현재, v0.2): 기획 모드 + 개발 모드, 훅 기반
  → 검증: "자동 리뷰+보안이 코드 품질을 올리는가?"

Phase 2 (v0.3): 스킬 모듈화
  → 하드코딩 프롬프트 → SKILL.md 분리
  → 수동 호출 지원
  → references/examples로 리뷰 품질 향상
  → 세부 설정 활성화 (severity, checks 등)

Phase 3: 자가 학습
  → 피드백 수집 메커니즘 설계 (Stop 훅 제약 우회)
  → 학습된 규칙 → SKILL.md "학습된 규칙" 섹션 자동 갱신
  → 드리프트 방지 (만료일 + 상한선)

Phase 4: 스킬 체이닝 고도화
  → 워크플로우 마스터 스킬 (안 1)
  → 아티팩트 기반 전제조건 (안 1+3)
  → 훅 체이닝 → 스킬 자율 체이닝 전환
  → Task 도구 / 에이전트 위임 검증 후 적용
```

---

## 9. 비용

| 항목 | v0.2 | v0.3 |
|------|------|------|
| 기획 모드 | ~$0.001-0.002 | ~$0.001-0.002 (동일) |
| 코드 리뷰 + 보안 | ~$0.002-0.004 | ~$0.002-0.004 (동일) |
| 추가 비용 | 없음 | 없음 |

Haiku 호출 방식이 동일하므로 직접 비용 변화 없음.
간접 비용: SKILL.md + references/ 로드로 Haiku 프롬프트가 약간 길어질 수 있음 (무시 가능 수준).
