# Vibe Flow - 스마트 인터뷰 시스템

> 작성일: 2026-03-23
> 상태: Draft

---

## 1. 개요

사용자가 프롬프트를 입력하면, **프로젝트 컨텍스트(CLAUDE.md, docs, 블록 정의)를 기반으로 AI가 동적으로 인터뷰 질문을 생성**하는 시스템.

고정된 체크리스트가 아니라, **이미 아는 건 안 물어보고 모르는 것만 물어본다.**

---

## 2. 문제

### 2.1 포괄적 인터뷰의 한계

```
❌ 매번 같은 질문:
  "대상 사용자가 누구인가요?"
  "기술 스택이 뭔가요?"
  "제약조건이 있나요?"

  → CLAUDE.md에 기술 스택이 적혀있는데 또 물어봄
  → 구체적인 프롬프트에도 불필요한 질문
  → 사용자 피로감 → 훅 비활성화
```

### 2.2 인터뷰 없음의 한계

```
❌ 모호한 프롬프트 그대로 실행:
  "DB 설계해줘" → 어떤 서비스? 어떤 테이블? 규모는?
  → AI가 추측으로 설계 → 원하는 결과 아님 → 재작업
```

---

## 3. 솔루션: 컨텍스트 인식 동적 인터뷰

### 3.1 핵심 원칙

```
1. 프로젝트가 이미 아는 정보는 질문하지 않는다
   → CLAUDE.md에 "PostgreSQL 사용" → DB 종류 안 물어봄

2. 블록의 필수 변수 중 빠진 것만 질문한다
   → 'DB 설계' 블록에 service_name 필수 → 없으면 물어봄

3. 프롬프트가 충분히 구체적이면 그냥 통과한다
   → 인터뷰 = 필요할 때만 작동하는 안전장치

4. 질문은 최대 3개로 제한한다
   → 사용자 피로감 방지
```

### 3.2 판단 흐름

```
사용자 프롬프트 입력
     │
     ▼
UserPromptSubmit 훅 발동
     │
     ▼
프로젝트 컨텍스트 수집
  ├─ CLAUDE.md (기술 스택, 규칙)
  ├─ docs/*.md (프로젝트 문서, 상위 50줄)
  └─ blocks/*.yaml (블록 정의, 필수 변수)
     │
     ▼
Haiku에게 분석 요청:
  "이 프롬프트 + 이 컨텍스트로 실행 가능한가?"
     │
     ├─ 충분 → PASS (질문 없이 통과)
     │
     └─ 부족 → 맥락 맞는 질문 생성 (최대 3개)
               + 매칭 블록 안내
               → additionalContext로 주입
     │
     ▼
Claude가 인터뷰 진행 또는 바로 실행
```

---

## 4. 작동 예시

### 4.1 모호한 프롬프트 → 인터뷰 발동

```
프로젝트 컨텍스트:
  CLAUDE.md: "PostgreSQL, Next.js, JWT 인증 사용"
  blocks/db-schema-design.yaml: 변수 service_name(필수), features(필수)

사용자: "DB 설계해줘"

Haiku 분석:
  ✓ DB종류 = PostgreSQL (CLAUDE.md → 안 물어봄)
  ✓ 블록 매칭: 'DB 스키마 설계'
  ✗ service_name 없음 (블록 필수 변수)
  ✗ features 없음 (블록 필수 변수)
  → 질문 필요

additionalContext 주입:
  "실행 전 확인사항:
   - 어떤 도메인의 테이블인가요? (주문, 회원, 상품 등)
   - 필요한 핵심 기능은? (CRUD, 검색, 집계 등)
   참고: 이 작업에 'DB 스키마 설계' 블록이 사용 가능합니다."

Claude → 사용자:
  "DB 설계 블록이 있습니다. 확인할게요:
   1. 어떤 도메인의 테이블인가요?
   2. 필요한 핵심 기능은?"
```

### 4.2 구체적 프롬프트 → 통과

```
사용자: "주문 시스템 DB를 설계해줘. 실시간 주문추적이랑
        쿠폰 적용이 핵심이고 일 주문 10만건 예상"

Haiku 분석:
  ✓ DB = PostgreSQL (CLAUDE.md)
  ✓ service_name = 주문 시스템
  ✓ features = 실시간 주문추적, 쿠폰
  ✓ 규모 정보도 있음
  → PASS

→ Claude가 바로 실행 시작
```

### 4.3 프로젝트 컨텍스트로 중복 질문 방지

```
사용자: "로그인 만들어줘"

Haiku 분석:
  ✓ 인증 방식 = JWT (CLAUDE.md → 안 물어봄)
  ✓ 프레임워크 = Next.js (CLAUDE.md → 안 물어봄)
  ✗ 소셜 로그인 포함 여부 불명
  ✗ 회원가입 범위 불명
  → 질문 필요 (2개만)

Claude → 사용자:
  "JWT + Next.js 기반으로 만들게요. 확인할게요:
   1. 소셜 로그인(Google, Kakao 등) 포함?
   2. 회원가입도 같이? 아니면 로그인만?"
```

### 4.4 디버깅 요청 → 바로 통과

```
사용자: "이 에러 고쳐줘" + 스택트레이스 첨부

Haiku 분석:
  ✓ 에러 정보 충분
  ✓ 매칭 블록 없음 (버그픽스는 블록보다 직접 처리가 적합)
  → PASS

→ Claude가 바로 디버깅 시작
```

### 4.5 매우 모호한 프롬프트 → 핵심 질문

```
사용자: "우리 서비스 리팩토링하자"

Haiku 분석:
  ✗ 어떤 부분? (전체 서비스 중)
  ✗ 목적? (성능, 가독성, 확장성)
  ✗ 범위? (건드리면 안 되는 부분)
  → 질문 필요 (3개)

Claude → 사용자:
  "리팩토링 전에 확인할게요:
   1. 어떤 부분을 리팩토링? (특정 모듈, API, 전체?)
   2. 목적이 뭔가요? (성능 개선, 코드 정리, 확장성?)
   3. 건드리면 안 되는 부분이 있나요?"
```

---

## 5. 기술 구현

### 5.1 훅 설정

```json
// .claude/settings.json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/smart-interview.sh",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

> 훅 출력 형식은 Claude Code 공식 스펙을 따른다:
> - exit 0: 성공 (stdout JSON 파싱)
> - exit 2: 차단 (stderr를 에러 메시지로 사용)
> - 기타 exit code: 비차단 에러 (계속 진행)

### 5.2 훅 스크립트

```bash
#!/bin/bash
# .claude/hooks/smart-interview.sh
# 프로젝트 컨텍스트 기반 동적 인터뷰 생성

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# ─────────────────────────────────────
# 1. 프로젝트 컨텍스트 수집
# ─────────────────────────────────────
CONTEXT=""

# CLAUDE.md (프로젝트 규칙, 기술 스택)
if [ -f "$CWD/CLAUDE.md" ]; then
  CONTEXT+="## 프로젝트 규칙 (CLAUDE.md)\n$(cat "$CWD/CLAUDE.md")\n\n"
fi

# docs/ (프로젝트 문서 — 각 파일 상위 50줄)
if [ -d "$CWD/docs" ]; then
  for f in "$CWD/docs"/*.md; do
    [ -f "$f" ] && CONTEXT+="## 문서: $(basename "$f")\n$(head -50 "$f")\n\n"
  done
fi

# 블록 정의 (어떤 블록이 있고, 어떤 변수가 필요한지)
if [ -d "$CWD/blocks" ]; then
  for f in "$CWD/blocks"/*.yaml; do
    [ -f "$f" ] && CONTEXT+="## 블록: $(basename "$f")\n$(cat "$f")\n\n"
  done
fi

# ─────────────────────────────────────
# 2. Haiku에게 분석 요청
# ─────────────────────────────────────
ANALYSIS=$(claude -p \
  --model claude-haiku-4-5-20251001 \
  --max-turns 1 \
  --max-budget-usd 0.01 \
  --output-format json \
  <<EOF
당신은 프로젝트 컨텍스트를 기반으로 사용자 프롬프트의 충분성을 판단합니다.

## 프로젝트 컨텍스트
$CONTEXT

## 사용자 프롬프트
$PROMPT

## 판단 규칙
1. 프로젝트 컨텍스트에서 이미 알 수 있는 정보는 절대 질문하지 마세요
2. 매칭되는 블록이 있으면, 해당 블록의 필수 변수(required: true) 중
   프롬프트에서 유추할 수 없는 것만 질문하세요
3. 프롬프트가 충분히 구체적이면 질문 없이 통과하세요
4. 질문은 최대 3개, 해당 맥락에 꼭 필요한 것만
5. 에러 수정, 간단한 질문, 정보 요청 등은 인터뷰 없이 통과

JSON 형식으로만 응답:
충분한 경우: {"pass": true}
질문 필요:  {"pass": false, "questions": ["질문1", "질문2"], "matched_block": "블록slug 또는 null", "reason": "왜 질문이 필요한지 한줄"}
EOF
)

# ─────────────────────────────────────
# 3. 결과 처리
# ─────────────────────────────────────

# PASS이면 그냥 통과
if echo "$ANALYSIS" | jq -e '.pass == true' >/dev/null 2>&1; then
  echo '{}'
  exit 0
fi

# 질문 생성
QUESTIONS=$(echo "$ANALYSIS" | jq -r '.questions[]?' 2>/dev/null | sed 's/^/- /')
BLOCK=$(echo "$ANALYSIS" | jq -r '.matched_block // empty' 2>/dev/null)

# 주입할 컨텍스트 조립
INJECT="## 실행 전 확인사항\n다음을 사용자에게 확인한 후 진행하세요:\n${QUESTIONS}"

if [ -n "$BLOCK" ] && [ "$BLOCK" != "null" ]; then
  INJECT+="\n\n참고: 이 작업에 '${BLOCK}' 블록이 사용 가능합니다."
fi

# JSON 이스케이프 후 반환
INJECT_ESCAPED=$(echo -e "$INJECT" | jq -Rs .)
echo "{\"additionalContext\": ${INJECT_ESCAPED}}"
exit 0
```

### 5.3 이중 안전장치 (선택)

인터뷰를 받았는데도 Claude가 무시하고 바로 실행하는 경우를 방지:

```json
// .claude/settings.json 에 추가
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "agent",
            "prompt": "대화 기록을 확인하세요. 사용자에게 확인 질문이 제시되었다면, 사용자가 해당 질문에 답변했는지 검증하세요. 답변이 없으면 block하세요. 답변이 있거나 질문이 없었으면 통과시키세요.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

---

## 6. 비용 및 성능

| 항목 | 값 |
|------|-----|
| Haiku 분석 비용 | ~$0.001/요청 |
| 컨텍스트 수집 | ~0.5초 (파일 I/O) |
| Haiku 응답 | ~1-2초 |
| 총 지연 | ~2-3초 (PASS 시 사용자 체감 최소) |
| 질문 생성 시 | 사용자가 답변하는 시간이 지배적 (훅 지연 무시 가능) |

---

## 7. 설정 옵션

### 7.1 인터뷰 민감도 조정

훅 스크립트 내 프롬프트를 수정하여 민감도 조절 가능:

```
엄격 모드: "조금이라도 모호하면 질문하세요"
  → 초기 팀 온보딩 시 유용

균형 모드: "핵심 정보가 빠진 경우에만 질문하세요" (기본값)
  → 일상 사용에 적합

느슨 모드: "매우 모호한 경우에만 질문하세요"
  → 숙련된 팀원용
```

### 7.2 특정 프롬프트 패턴 바이패스

빠른 작업은 인터뷰 없이 통과시키고 싶을 때:

```bash
# smart-interview.sh 상단에 추가
# 바이패스 패턴
case "$PROMPT" in
  "fix "*|"고쳐"*|"버그"*|"에러"*)
    echo '{}'; exit 0 ;;  # 디버깅은 인터뷰 스킵
  "//"*)
    echo '{}'; exit 0 ;;  # // 접두사는 인터뷰 스킵
esac
```

### 7.3 인터뷰 비활성화

```bash
# 임시 비활성화: 프롬프트 앞에 ! 붙이기
# "!DB 설계해줘" → 인터뷰 스킵

if [[ "$PROMPT" == "!"* ]]; then
  echo '{}'
  exit 0
fi
```

---

## 8. Vibe Flow 통합 계획

스마트 인터뷰는 Vibe Flow의 **블록 매칭 엔진과 자연스럽게 결합**된다:

```
UserPromptSubmit 훅
     │
     ├─ 컨텍스트 수집 (CLAUDE.md + docs + blocks)
     ├─ Haiku 분석 (충분성 판단 + 블록 매칭)
     │
     ├─ 충분 + 블록 매칭 → 바로 블록 실행
     ├─ 충분 + 블록 없음 → 일반 Claude Code 실행
     ├─ 부족 + 블록 매칭 → 블록 변수 기반 질문 + 블록 안내
     └─ 부족 + 블록 없음 → 일반 맥락 질문

→ 인터뷰와 블록 매칭이 하나의 훅에서 동시에 처리됨
```

구현 시점: **Phase 7 (Integration)** 에서 CLAUDE.md 통합과 함께 내장.
