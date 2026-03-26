# Vibe Flow - 아키텍처 문서

> 작성일: 2026-03-22
> 상태: Draft

---

## 1. 시스템 전체 구조

```
┌─────────────────────────────────────────────────────┐
│  채널 레이어 — Claude Code 네이티브                    │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │
│  │Remote    │ │Telegram  │ │Discord            │   │
│  │Control   │ │Channel   │ │Channel            │   │
│  │(웹/모바일)│ │(봇)      │ │(봇)               │   │
│  └────┬─────┘ └────┬─────┘ └────┬──────────────┘   │
│       └────────────┴────────────┘                   │
│                    │ 네이티브                         │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                    │ Vibe Flow                       │
│                    ▼                                │
│  ┌─────────────────────────────────────────┐       │
│  │  🧠 블록 매칭 엔진                        │       │
│  │  사용자 입력 → 의도 파악 → 블록 선택        │       │
│  └──────────────┬──────────────────────────┘       │
│                 │                                   │
│  ┌──────────────▼──────────────────────────┐       │
│  │  🔧 하네스 레이어                         │       │
│  │  컨텍스트 주입 → 실행 → 품질 검증 → 정규화  │       │
│  └──────────────┬──────────────────────────┘       │
│                 │                                   │
│  ┌──────────────▼──────────────────────────┐       │
│  │  ⚡ Claude Code CLI                      │       │
│  │  claude -p --output-format stream-json   │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│  ┌─────────────────────────────────────────┐       │
│  │  📦 블록 저장소 + Creator 웹 UI           │       │
│  └─────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

---

## 2. 레이어 상세

### 2.1 채널 레이어 (Claude Code 네이티브)

Vibe Flow가 구현하지 않는 영역. Claude Code의 네이티브 기능을 그대로 활용한다.

| 기능 | Claude Code 기능 | 용도 |
|------|-----------------|------|
| 웹/모바일 접근 | Remote Control (`claude --remote-control`) | 팀원의 웹 접근 |
| 텔레그램 | Channels (`plugin:telegram`) | 팀원의 메시지 기반 사용 |
| 디스코드 | Channels (`plugin:discord`) | 팀원의 메시지 기반 사용 |
| 세션 관리 | `--session-id`, `--resume` | 작업 연속성 유지 |
| 보안 | sender allowlist | 승인된 사용자만 접근 |

> **참고**: Channels는 Research Preview 상태 (v2.1.80+). 구문이 변경될 수 있음.
> Remote Control은 v2.1.51+ 필요. 양쪽 모두 claude.ai OAuth 인증 필수 (API 키 불가).

### 2.2 블록 매칭 엔진

사용자의 자연어 입력을 받아 가장 적합한 블록을 찾는 엔진.

```
입력: "우리 서비스의 DB를 설계해줘"

처리 흐름:
  1. 의도 분류 (Intent Classifier)
     → { category: "database", action: "design", confidence: 0.92 }

  2. 트리거 문구 퍼지 매칭 (Trigger Matcher)
     → 블록의 trigger_phrases와 입력의 퍼지 매칭 (정규화, 조사 제거)
     → 비용 0, 지연 <1ms

  3. 신뢰도 랭킹 (Confidence Ranker)
     → 분류 결과 + 트리거 매칭 + 사용 빈도 종합
     → 최종 점수 산출

  4. 결정
     → score >= 0.8: 자동 실행
     → 0.5 ~ 0.8: 사용자에게 확인 ("DB 설계 블록을 실행할까요?")
     → < 0.5: 매칭 실패, 일반 Claude Code로 처리

출력: { block: BlockDefinition, confidence: 0.92, alternatives: [...] }
```

**구성 요소:**

| 모듈 | 파일 | 역할 |
|------|------|------|
| TriggerMatcher | `trigger-matcher.ts` | trigger_phrases 퍼지 매칭 (1순위, 비용 0) |
| IntentClassifier | `classifier.ts` | Claude API(Haiku) tool_use로 의도 추출 (2순위 폴백) |
| ConfidenceRanker | `ranker.ts` | 다중 신호 종합 + 임계값 판정 |

### 2.3 하네스 레이어

블록을 실제로 실행하고 품질을 보장하는 래퍼.

```
파이프라인 전체 흐름:

  ┌─────────────────┐
  │ Context Injector │ ← 세션 기억 + 블록 템플릿 + 변수 + 컨벤션
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │    Executor      │ ← claude -p --output-format stream-json
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │  Quality Gate    │ ← 블록 내장 게이트 (regex, contains 등)
  └────────┬────────┘
           │
     통과? ─┼─ No → Self Healer (최대 3회, 2x 비용 상한)
           │
           Yes
           ▼
  ┌─────────────────┐
  │  Code Review     │ ← 파이프라인 고정 스테이지 (코드 산출물일 때)
  │  (자동 리뷰)     │   버그, 로직 오류, 컨벤션 준수 검증
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │  Security Review │ ← 파이프라인 고정 스테이지 (코드 산출물일 때)
  │  (보안 검토)     │   OWASP Top 10, 인젝션, 인증 취약점
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │ Output Normalizer│ → 포맷팅, 요약, 채널별 적응 → 결과 반환
  └─────────────────┘
```

**구성 요소:**

| 모듈 | 파일 | 역할 |
|------|------|------|
| ClaudeExecutor | `executor.ts` | CLI 프로세스 생성, stream-json 파싱, 타임아웃 관리 |
| ContextInjector | `context-injector.ts` | 세션 기억 로드, 템플릿 변수 치환, 컨벤션 주입 |
| QualityGateValidator | `quality-gate.ts` | 블록 내장 게이트 검증 (regex/contains/json-schema/custom-prompt) |
| CodeReviewer | `code-reviewer.ts` | 파이프라인 고정: 자동 코드 리뷰 (버그, 로직, 컨벤션) |
| SecurityReviewer | `security-reviewer.ts` | 파이프라인 고정: 보안 검토 (OWASP Top 10, 인젝션) |
| SelfHealer | `self-healer.ts` | 실패 시 재시도 전략 오케스트레이션 |
| OutputNormalizer | `output-normalizer.ts` | 산출물 정규화 (구조화, 정리, 요약) |
| BlockHarness | `index.ts` | 위 모듈을 파이프라인으로 조합하는 통합 인터페이스 |

### 2.4 블록 저장소

블록의 CRUD, 버전 관리, 사용 분석을 담당.

```
테이블 구조:

blocks
├── id (PK)
├── owner_id (FK → users)
├── slug (unique per owner)
├── name
├── description
├── definition_yaml (TEXT)
├── status (draft | active | archived)
├── visibility (private | shared)
├── schema_version
├── created_by
├── created_at
└── updated_at

block_versions
├── id (PK)
├── block_id (FK)
├── version (INT)
├── definition_yaml (TEXT)
├── changelog
├── created_by
└── created_at

block_executions
├── id (PK)
├── block_id (FK)
├── team_id (FK)
├── user_id
├── input
├── output
├── status (success | failed | retried)
├── quality_gate_results (JSON)
├── duration_ms
├── tokens_used
├── model_used
├── retry_count
└── created_at

teams
├── id (PK)
├── name
├── slug
├── default_model
├── default_conventions (JSON)
└── created_at

users
├── id (PK)
├── team_id (FK)
├── external_id (채널별 사용자 ID — 텔레그램/디스코드)
├── display_name
├── role (member | admin)
├── created_at
└── updated_at
```

### 2.5 API 서버

모든 기능을 REST API로 노출하는 Fastify 서버.

```
엔드포인트:

블록 관리:
  POST   /api/blocks              블록 생성
  GET    /api/blocks              블록 목록 (검색, 필터, 페이지네이션) (쿼리: ?scope=mine|shared|all)
  GET    /api/blocks/:id          블록 상세
  PUT    /api/blocks/:id          블록 수정 (자동 버전 생성)
  DELETE /api/blocks/:id          블록 아카이브
  GET    /api/blocks/:id/versions 버전 히스토리
  POST   /api/blocks/:id/rollback 버전 롤백
  GET    /api/blocks/:id/yaml     YAML 다운로드
  POST   /api/blocks/import       YAML 임포트
  POST   /api/blocks/:id/share    블록 공유 토글

실행:
  POST   /api/execute             블록 실행 (SSE 스트리밍)
  GET    /api/executions/:id      실행 결과 조회
  GET    /api/executions          최근 실행 목록

블록 생성 대화:
  POST   /api/creator/start              대화 시작
  POST   /api/creator/:sessionId/message 메시지 전송
  GET    /api/creator/:sessionId/preview YAML 프리뷰
  POST   /api/creator/:sessionId/test    테스트 실행
  POST   /api/creator/:sessionId/save    저장

분석:
  GET    /api/analytics/blocks/:id       블록별 통계
  GET    /api/analytics/team/:teamId     팀 통계
  GET    /api/analytics/matching         매칭 정확도

인증:
  Authorization: Bearer <team-api-key>
  Rate limit: 100 req/min per key
```

### 2.6 CLI (`vf` 명령어)

```bash
# 서버
vf serve                                    # API 서버 시작

# 블록 실행
vf execute "DB 설계해줘"                      # 자연어 → 블록 매칭 → 실행
vf execute --block db-design --var table=users  # 명시적 블록 실행

# 블록 관리
vf blocks list                              # 블록 목록
vf blocks show <slug>                       # 블록 상세
vf blocks create                            # 대화형 블록 생성
vf blocks import <file.yaml>                # YAML 임포트
vf blocks export <slug>                     # YAML 내보내기

# 설정
vf config set team-key <key>                # API 키 설정
```

### 2.7 Creator 웹 UI

블록 생성자 전용 대시보드. Next.js 14 + shadcn/ui.

```
페이지 구성:

/blocks          블록 목록 (카드 그리드, 검색, 필터)
/blocks/:id      블록 상세 (탭: 개요, YAML 에디터, 버전, 분석, 테스트)
/blocks/new      대화형 블록 생성 (좌: 채팅, 우: 라이브 YAML 프리뷰)
/analytics       팀 분석 대시보드
/settings        팀 설정, API 키, 매칭 임계값
```

---

## 3. Claude Code 통합 메커니즘

Vibe Flow와 Claude Code의 핵심 연결 지점은 **CLAUDE.md** 파일이다.

```markdown
# CLAUDE.md (프로젝트 루트에 배치)

## Vibe Flow Integration

이 프로젝트는 Vibe Flow 블록 시스템을 사용합니다.

사용자가 작업을 요청하면:
1. `vf execute --dry-run '<요청>'` 으로 매칭 블록 확인
2. 매칭 신뢰도 0.8 이상이면 `vf execute '<요청>'` 실행
3. 매칭 실패 시 일반 Claude Code로 처리

이 규칙은 Channels(텔레그램/디스코드) 세션에서도 동일하게 적용됩니다.
```

```
작동 흐름:

사용자 (텔레그램) ──→ Claude Code (Channels)
                         │
                         ├─ CLAUDE.md 읽음
                         ├─ "vf execute --dry-run" 호출
                         ├─ 블록 매칭됨 (confidence: 0.92)
                         ├─ "vf execute" 호출
                         ├─ 블록 실행 + 품질 검증
                         └─ 결과를 텔레그램으로 반환
```

**장점**: 커스텀 봇 코드 불필요. Claude Code가 알아서 Vibe Flow를 호출.
**리스크**: CLAUDE.md 지시 따르기가 확률적. `/vibeflow` 슬래시 커맨드를 폴백으로 제공.

### 3.1 확정적 통합: UserPromptSubmit 훅 (권장)

CLAUDE.md 지시는 확률적이므로, 훅 기반 확정적 통합을 **주 메커니즘**으로 사용한다.

```
UserPromptSubmit 훅 발동
     │
     ├─ vf execute --dry-run '<요청>'
     │
     ├─ 매칭 성공 (>= 0.8) → additionalContext로 블록 실행 지시 주입
     ├─ 매칭 모호 (0.5~0.8) → additionalContext로 확인 질문 주입
     └─ 매칭 실패 (< 0.5) → 통과 (일반 Claude Code 처리)
```

**장점**: 100% 확정적 실행 (LLM의 지시 따르기에 의존하지 않음)
**CLAUDE.md**: 폴백 및 보조 역할로 유지

### 3.2 순환 참조 차단

vf 하네스가 `claude -p`를 호출할 때, 해당 프로세스가 CLAUDE.md를 읽고 다시 `vf execute`를 호출하는 순환을 차단해야 한다.

```
차단 메커니즘:
  1. 하네스가 claude -p 호출 시 환경변수 VF_INTERNAL=1 설정
  2. CLAUDE.md에 "VF_INTERNAL 환경변수가 설정된 경우 vf execute 호출 금지" 명시
  3. 훅 스크립트에서 VF_INTERNAL=1이면 즉시 통과 (인터뷰/매칭 스킵)
  4. 추가 안전장치: claude -p 호출 시 --system-prompt 으로 "vf 명령어 호출 금지" 주입
```

---

## 4. 데이터 흐름

### 4.1 팀원 실행 흐름 (텔레그램)

```
1. 사용자 → 텔레그램: "우리 서비스의 인증 API 설계해줘"
2. 텔레그램 → Claude Code Channels: 메시지 전달
3. Claude Code → CLAUDE.md 확인 → vf execute --dry-run
4. vf CLI → 매칭 엔진: 트리거 퍼지 매칭 + 의도 분류 폴백
5. 매칭 엔진 → "API 설계" 블록 (confidence: 0.88)
6. vf CLI → 하네스: 블록 실행 요청
7. 하네스 → 컨텍스트 주입: 블록 템플릿 + 팀 컨벤션 + 세션 맥락
8. 하네스 → Claude CLI: claude -p "조립된 프롬프트"
9. Claude CLI → 결과 생성
10. 하네스 → 품질 게이트: regex + custom-prompt 검증
11. (통과) 하네스 → 산출물 정규화
12. vf CLI → Claude Code: 결과 반환
13. Claude Code → 텔레그램: 포맷된 결과 전달
14. 하네스 → 분석 기록: 실행 로그 저장
```

### 4.2 블록 생성 흐름 (웹 UI)

```
1. Creator → 웹 UI: "API 설계 블록 만들고 싶어요"
2. 웹 UI → API: POST /api/creator/start
3. API → Block Creator: 대화 시작
4. Block Creator → Claude API: "어떤 종류의 API?" (소크라테스식 질문)
5. (여러 턴의 대화)
6. Block Creator → Block Builder: 대화에서 블록 정의 조립
7. 웹 UI: 실시간 YAML 프리뷰 업데이트
8. Creator → "테스트해볼게요"
9. API → 하네스: 샘플 입력으로 테스트 실행
10. 하네스 → 결과 + 품질 게이트 결과 반환
11. Creator → "저장"
12. API → 블록 저장소: 블록 저장
13. 매칭 엔진: 트리거 문구 인덱스 업데이트
```

---

## 5. 기술 스택

| 레이어 | 기술 | 선정 이유 |
|--------|------|----------|
| 런타임 | Node.js 20+ / TypeScript | 범용성, 타입 안전성 |
| 모노레포 | pnpm workspaces + turborepo | 효율적 의존성 관리, 점진적 빌드 |
| API | Fastify | 고성능, 스키마 검증 내장, TS 친화 |
| 웹 UI | Next.js 14 (App Router) + shadcn/ui | RSC, 좋은 DX, 접근성 |
| DB | SQLite (WAL 모드) | MVP 및 초기 프로덕션. 동시 쓰기 경합 시 비동기 배치 처리 |
| ORM | Drizzle ORM | 타입 안전, 경량. SQLite 단일 스키마 |
| 검증 | Zod | 런타임 타입 체크, 스키마 우선 |
| 테스트 | Vitest | 빠름, TS 네이티브 |
| CLI 실행 | child_process → `claude -p` | Claude Code CLI 직접 통합 |

---

## 6. 프로젝트 디렉토리 구조

```
/Users/han/develop/AI-Agent/
  package.json                    # 루트 워크스페이스 설정
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  CLAUDE.md                       # Claude Code 통합 설정 (Phase 7)

  docs/                           # 문서
    README.md
    CONCEPT.md
    ARCHITECTURE.md
    BLOCK-SPEC.md
    IMPLEMENTATION-PLAN.md
    COMPETITIVE-ANALYSIS.md
    CLAUDE-CODE-NATIVE.md

  packages/
    block-schema/                 # 블록 정의 타입 + 검증
      src/
        schema.ts                 # Zod 스키마
        types.ts                  # TypeScript 타입
        validate.ts               # 검증 유틸리티
        index.ts

    block-store/                  # 블록 저장소 (DB)
      src/
        db/
          schema.ts               # Drizzle 테이블 정의
          migrations/              # SQL 마이그레이션
        repository.ts             # CRUD
        versioning.ts             # 버전 관리
        analytics.ts              # 사용 추적
        index.ts

    matching-engine/              # 자연어 → 블록 매칭
      src/
        classifier.ts             # 의도 분류 (Claude API)
        trigger-matcher.ts        # 트리거 문구 퍼지 매칭
        ranker.ts                 # 신뢰도 점수 + 판정
        index.ts

    harness/                      # Claude Code CLI 실행 래퍼
      src/
        executor.ts               # CLI 프로세스 관리
        context-injector.ts       # 컨텍스트 조립
        quality-gate.ts           # 품질 검증
        code-reviewer.ts          # 파이프라인 고정: 코드 리뷰
        security-reviewer.ts      # 파이프라인 고정: 보안 검토
        self-healer.ts            # 재시도 로직
        output-normalizer.ts      # 산출물 정규화
        channel-adapter.ts        # 채널별 포맷팅
        session-manager.ts        # 세션 연속성
        index.ts

    block-creator/                # 대화형 블록 생성
      src/
        conversation.ts           # 멀티턴 대화 관리
        block-builder.ts          # 대화 → YAML 조립
        block-tester.ts           # 저장 전 테스트
        index.ts

    api/                          # Fastify API 서버
      src/
        server.ts
        routes/
          blocks.ts               # 블록 CRUD
          execute.ts              # 블록 실행 (SSE)
          analytics.ts            # 분석
          teams.ts                # 팀 관리
          creator.ts              # 블록 생성 대화
        middleware/
          auth.ts                 # API 키 인증
          team-scope.ts           # 팀 격리
        index.ts

    web/                          # Next.js Creator 대시보드
      src/
        app/
          layout.tsx
          page.tsx                # 대시보드 홈
          blocks/
            page.tsx              # 블록 목록
            [id]/page.tsx         # 블록 상세
            new/page.tsx          # 대화형 생성
          analytics/page.tsx      # 분석
          settings/page.tsx       # 설정
        components/
        lib/
          api-client.ts

    cli/                          # vf CLI
      src/
        commands/
          execute.ts
          list.ts
          create.ts
          serve.ts
        index.ts
```

---

## 7. 보안 고려사항

| 영역 | 접근 방식 |
|------|----------|
| API 인증 | 팀 단위 API 키 (Bearer token) |
| 채널 접근 | Claude Code sender allowlist |
| 팀 격리 | 모든 쿼리에 team_id 스코핑 |
| CLI 실행 | `claude -p` 프로세스 격리, 타임아웃 강제 |
| 비용 보호 | 블록별/팀별 일일 비용 한도 |
| 프롬프트 인젝션 | 사용자 입력을 템플릿 변수로 격리 (시스템 프롬프트와 분리) |
