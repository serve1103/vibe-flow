# Vibe Flow - 구현 계획

> 작성일: 2026-03-22
> 상태: Draft

---

## 1. 개요

7단계 구현 계획. 각 단계는 독립적으로 배포/테스트 가능하다.
Phase 2, 3, 4는 Phase 1 완료 후 병렬 진행 가능.

```
Phase 1: Foundation ─────────────────────┐
                                         ├─ Phase 5: API + CLI
Phase 2: Harness ──────── (병렬 가능) ───┤
Phase 3: Matching Engine ─ (병렬 가능) ───┤
Phase 4: Block Creator ── (병렬 가능) ───┘
                                              │
                                         Phase 6: Web UI
                                              │
                                         Phase 7: Integration
```

---

## 2. 기술 스택

| 레이어 | 기술 | 선정 이유 |
|--------|------|----------|
| 런타임 | Node.js 20+ / TypeScript | 범용, 타입 안전, 큰 생태계 |
| 패키지 매니저 | pnpm | 효율적 모노레포 지원 |
| 모노레포 | pnpm workspaces + turborepo | 독립 패키지, 점진적 빌드 |
| API | Fastify | 고성능, 스키마 검증 내장, TS 우선 |
| 웹 UI | Next.js 14 (App Router) | RSC, 좋은 DX |
| UI 컴포넌트 | shadcn/ui | 깔끔, 커스터마이징 용이 |
| DB | SQLite (WAL 모드) | MVP 및 초기 프로덕션. 단일 스키마 유지 |
| ORM | Drizzle ORM | 타입 안전, 경량 |
| 매칭 | trigger_phrases 퍼지 매칭 + IntentClassifier(Haiku) 폴백 | 벡터 DB 불필요, 외부 의존 최소화 |
| 블록 정의 | YAML + Zod 검증 | 가독성, diff 가능, 버전 관리 |
| CLI 실행 | `claude -p --output-format stream-json` | Claude Code CLI 직접 통합 |
| 테스트 | Vitest | 빠름, TS 네이티브 |
| 검증 | Zod | 런타임 타입 체크 |

---

## 3.5 Phase 0: Bootstrap (1일)

> 모노레포 셋업 + 공유 유틸리티

### 0.1 모노레포 초기화

- 루트 `package.json`, pnpm workspace, turborepo
- tsconfig.base.json (strict 모드)
- Vitest 글로벌 설정
- ESLint + Prettier

### 0.2 shared 패키지

```
위치: packages/shared/src/
파일: claude-client.ts, config.ts, logger.ts, errors.ts
```

- Claude API 래퍼 (Haiku/Sonnet/Opus 호출)
- 환경변수/설정 파일 로더
- 구조화 로거 (pino 기반)
- 커스텀 에러 타입 (VibeFlowError 등)

### Phase 0 완료 기준

- [ ] `pnpm install && pnpm build` 성공
- [ ] Claude API 래퍼로 Haiku 호출 1회 성공
- [ ] 로거, 에러 타입 단위 테스트 통과

---

## 3. Phase 1: Foundation (3-4일)

> 블록이 무엇인지 정의하고 저장하는 기반 구축

### 1.1 모노레포 초기화

```
파일: package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
의존성: 없음
```

- 루트 `package.json` (`"private": true`)
- pnpm workspace: `packages/*`
- turborepo: build/test/lint 태스크
- 공유 tsconfig: strict 모드, ESNext, Node 모듈 해석

### 1.2 block-schema 패키지

```
위치: packages/block-schema/src/
파일: schema.ts, types.ts, validate.ts, index.ts
의존성: 1.1
```

Zod 스키마 정의:
- `Block`: id, name, slug, description, version, teamId, status 등
- `PromptTemplate`: template, variables, output_format
- `ModelConfig`: modelId, temperature, maxTokens
- `QualityGate`: name, type, criteria, failAction
- `Convention`: name, description, examples
- `BlockDefinition`: 위 전체를 조합한 루트 스키마

YAML 직렬화/역직렬화 유틸리티 포함.

### 1.3 block-store 패키지

```
위치: packages/block-store/src/
파일: db/schema.ts, db/migrations/, repository.ts, versioning.ts, analytics.ts
의존성: 1.2
```

- Drizzle ORM 테이블: blocks, block_versions, block_executions, teams
- `BlockRepository`: create, findById, findBySlug, findByTeam, update, archive, search
- `VersionManager`: createVersion, getVersionHistory, rollbackToVersion, diffVersions
- `AnalyticsTracker`: recordExecution, getBlockUsageStats, getTeamUsageStats
- SQLite (WAL 모드)

### 1.4 Phase 1 테스트

```
위치: packages/block-schema/__tests__/, packages/block-store/__tests__/
```

- 블록 스키마 검증 (유효/무효)
- YAML 라운드트립
- CRUD 작업
- 버전 관리
- 팀 격리 (A팀 블록이 B팀에 안 보임)

### Phase 1 완료 기준

- [ ] `pnpm install && pnpm build` 성공
- [ ] 블록 YAML을 스키마로 검증, 명확한 에러 메시지
- [ ] 블록 CRUD + 버전 관리 동작
- [ ] 실행 분석 기록 및 조회
- [ ] 모든 테스트 통과
- [ ] 참조용 샘플 블록 YAML 파일 존재

---

## 4. Phase 2: Harness (4-5일)

> 블록을 Claude Code CLI로 실행하고 품질을 보장하는 래퍼

### 2.1 ClaudeExecutor

```
파일: packages/harness/src/executor.ts
```

- `claude -p --output-format stream-json` child process 생성
- stream-json 파싱 (line-by-line JSON)
- `--model` 블록 설정 전달
- `--session-id` 세션 지속
- 타임아웃 (예상 시간 x3)
- EventEmitter 기반 스트리밍 이벤트

### 2.2 ContextInjector

```
파일: packages/harness/src/context-injector.ts
```

- `{{변수}}` 치환
- 컨벤션 주입 (시스템 프롬프트 "Rules" 섹션)
- 이전 블록 산출물 주입 (블록 체이닝)
- 출력 포맷 지시 추가
- 디버그 모드 (조립된 프롬프트만 출력)

### 2.3 QualityGateValidator

```
파일: packages/harness/src/quality-gate.ts
```

게이트 유형별 구현:
- `contains`: 문자열 포함 여부
- `regex`: 정규식 매칭
- `json_schema`: JSON Schema 검증
- `custom_prompt`: AI에게 검증 요청
- `length`: 길이 범위
- `code_parseable`: 코드 파싱 시도

### 2.4 SelfHealer

```
파일: packages/harness/src/self-healer.ts
```

재시도 전략:
1. Prompt Enhancement: 실패 피드백 포함 재실행
2. Model Upgrade: Sonnet → Opus
3. Prompt Restructure: 복잡한 프롬프트를 단계별로 분할

제한: 최대 3회, 비용 2x 상한

### 2.5 CodeReviewer (파이프라인 고정 스테이지)

```
파일: packages/harness/src/code-reviewer.ts
```

- 코드 산출물일 때만 자동 발동 (output_format이 code/sql일 때)
- Haiku로 빠른 리뷰: 버그, 로직 오류, 컨벤션 준수
- 결과를 산출물에 리뷰 코멘트로 첨부
- 심각한 이슈 발견 시 warn 또는 block

### 2.6 SecurityReviewer (파이프라인 고정 스테이지)

```
파일: packages/harness/src/security-reviewer.ts
```

- 코드 산출물일 때만 자동 발동
- OWASP Top 10, 인젝션, 인증 취약점 체크
- Haiku로 빠른 보안 스캔
- 취약점 발견 시 심각도별 분류 (critical → block, high → warn)

### 2.7 OutputNormalizer

```
파일: packages/harness/src/output-normalizer.ts
```

- 구조화 데이터 추출 (코드 블록, JSON, 파일 경로)
- 대화형 잡담 제거 ("Sure, here's..." 등)
- 코드 리뷰/보안 검토 결과 첨부
- 실행 요약 생성
- `NormalizedOutput`: { raw, cleaned, structured, summary, artifacts[], reviews[] }

### 2.8 BlockHarness (통합 파이프라인)

```
파일: packages/harness/src/index.ts
```

`execute(block, input, context)`:
컨텍스트 주입 → 실행 → 품질 검증 → (실패 시 자가회복) → 코드 리뷰 → 보안 검토 → 정규화 → 분석 기록

### Phase 2 완료 기준

- [ ] 블록을 CLI로 실행하고 결과 스트리밍
- [ ] 템플릿 변수 정상 주입
- [ ] 품질 게이트 동작 (regex, contains, json-schema)
- [ ] 실패 시 프롬프트 보강 재시도
- [ ] 코드 리뷰 스테이지 동작 (코드 산출물 자동 감지)
- [ ] 보안 검토 스테이지 동작 (OWASP 체크)
- [ ] 산출물 정규화 (리뷰 결과 포함)
- [ ] dry-run 모드
- [ ] 모든 테스트 통과

---

## 5. Phase 3: Matching Engine (1-2일)

> 자연어 → 최적 블록 매칭 (벡터 매칭 제거로 단순화)

### 3.1 IntentClassifier

```
파일: packages/matching-engine/src/classifier.ts
```

- Claude API tool_use로 구조화된 의도 추출
- 결과: { category, action, entities, constraints, confidence }
- LRU 캐시
- 모호한 의도는 복수 분류 반환

### 3.2 TriggerMatcher

```
파일: packages/matching-engine/src/trigger-matcher.ts
```

- trigger_phrases 퍼지 매칭 (1순위, 비용 0, 지연 <1ms)
- 정규화: 소문자 변환, 조사 제거, 공백 정규화
- Levenshtein distance + n-gram 유사도
- 팀별 trigger_phrases 인덱스

> 비판적 검토 결과: 팀당 수십 개 블록에 벡터 DB(vectra)는 과잉 엔지니어링.
> trigger_phrases 퍼지 매칭 + IntentClassifier 폴백으로 단순화.
> 벡터 매칭이 필요해지는 시점(블록 100개+)에 도입해도 늦지 않음.

### 3.3 ConfidenceRanker

```
파일: packages/matching-engine/src/ranker.ts
```

점수 공식:
```
score = (0.5 * classifierCategoryMatch)
      + (0.3 * triggerPhraseMatch)
      + (0.2 * recentUsageBoost)
```

임계값:
- >= 0.8: 자동 실행
- 0.5 ~ 0.8: 확인 요청 ("DB 설계 블록을 실행할까요?")
- < 0.5: 매칭 실패

### Phase 3 완료 기준

- [ ] 자연어 → 블록 매칭 + 신뢰도 점수
- [ ] 모호한 입력 → 확인 프롬프트 + 대안 제시
- [ ] 낮은 신뢰도 → "매칭 실패" + 블록 생성 제안
- [ ] 명시적 참조 (`block:slug`) 바이패스
- [ ] 팀 격리
- [ ] 모든 테스트 통과

---

## 6. Phase 4: Block Creator (3-4일)

> AI와 대화로 블록 생성

### 4.1 CreatorConversation

```
파일: packages/block-creator/src/conversation.ts
```

대화 상태 머신:
```
INTENT → PROMPT_DESIGN → QUALITY_GATES → CONVENTIONS → TEST_RUN → FINALIZE
```

- 각 상태별 진입 프롬프트, 검증, 전이 로직
- 비선형 점프 지원 ("프롬프트 다시 수정할게")
- 세션 직렬화 (재개 가능)

### 4.2 BlockBuilder

```
파일: packages/block-creator/src/block-builder.ts
```

- 점진적 블록 조립
- AI 추천 기본값 (모델, 품질 게이트)
- 실시간 YAML 프리뷰 생성
- 단계별 검증

### 4.3 BlockTester

```
파일: packages/block-creator/src/block-tester.ts
```

- 샘플 입력으로 테스트 실행
- 품질 게이트 결과 표시
- 실패 시 AI가 개선 제안
- 다수 테스트 케이스 지원
- 버전 간 회귀 테스트

### Phase 4 완료 기준

- [ ] 대화로 블록 생성 완료
- [ ] AI가 품질 게이트/모델/컨벤션 제안
- [ ] 저장 전 테스트 실행
- [ ] 실패 시 개선 제안
- [ ] 생성된 YAML이 유효하고 가독성 좋음
- [ ] 모든 테스트 통과

---

## 7. Phase 5: API + CLI (4-5일)

> 모든 기능을 REST API와 CLI로 노출

### 5.1-5.5 Fastify API 서버

```
위치: packages/api/
```

엔드포인트:
- `POST/GET/PUT/DELETE /api/blocks` — 블록 CRUD
- `POST /api/execute` — 블록 실행 (SSE 스트리밍)
- `POST /api/creator/start|message|test|save` — 블록 생성 대화
- `GET /api/analytics/*` — 분석

인증: 팀 API 키 (Bearer), 100 req/min rate limit

### 5.6 CLI (`vf` 명령어)

```
위치: packages/cli/
```

- `vf serve` — API 서버 시작
- `vf execute "자연어"` — 매칭 + 실행
- `vf blocks list|show|create|import|export`
- `vf config set team-key <key>`

### Phase 5 완료 기준

- [ ] `vf serve`로 서버 시작 (포트 3000)
- [ ] API로 블록 CRUD 동작
- [ ] `vf execute "자연어"` → 블록 매칭 + 스트리밍 출력
- [ ] 블록 생성 대화 API 동작
- [ ] API 키 인증 + rate limiting
- [ ] 분석 API 데이터 반환
- [ ] 모든 테스트 통과

---

## 8. Phase 6: Creator Web UI (5-6일)

> 블록 Creator 전용 대시보드

### 6.1-6.6 Next.js 웹 앱

```
위치: packages/web/
```

페이지:
- `/blocks` — 블록 목록 (카드 그리드, 검색, 필터)
- `/blocks/:id` — 블록 상세 (개요, YAML 에디터, 버전, 분석, 테스트)
- `/blocks/new` — 대화형 생성 (좌: 채팅, 우: 라이브 YAML 프리뷰)
- `/analytics` — 팀 분석 대시보드
- `/settings` — 팀 설정, API 키 관리

기술: Next.js 14 + shadcn/ui + recharts (차트) + Monaco Editor (YAML)

### Phase 6 완료 기준

- [ ] 블록 목록 + 검색/필터
- [ ] 블록 상세 (전체 탭 동작)
- [ ] 대화형 생성 + 라이브 YAML 프리뷰
- [ ] 분석 대시보드 차트
- [ ] 설정 페이지 (API 키, 팀 설정)
- [ ] 프론트엔드 테스트 통과

---

## 9. Phase 7: Integration (3-4일)

> Claude Code 네이티브 채널과 연결

### 7.1 CLAUDE.md 통합

```
파일: /Users/han/develop/AI-Agent/CLAUDE.md
```

Claude Code가 자동으로 읽는 CLAUDE.md에 Vibe Flow 연동 지시를 작성.
텔레그램/디스코드 Channels 세션에서도 동일하게 동작.

### 7.2 채널 어댑터

```
파일: packages/harness/src/channel-adapter.ts
```

채널별 산출물 포맷팅 (텔레그램: 간결, 디스코드: 임베드, 웹: 풀 마크다운)

### 7.3 세션 매니저

```
파일: packages/harness/src/session-manager.ts
```

연속 블록 실행 간 컨텍스트 유지. 이전 블록 산출물 자동 참조.

### Phase 7 완료 기준

- [ ] CLAUDE.md로 Claude Code가 Vibe Flow 우선 호출
- [ ] 채널별 포맷팅 동작
- [ ] 연속 블록 실행 간 컨텍스트 유지
- [ ] 텔레그램 → 블록 매칭 → 실행 → 응답 E2E 동작

---

## 10. 리스크 및 완화

| 리스크 | 심각도 | 완화 |
|--------|--------|------|
| CLAUDE.md 지시 따르기 불확실 | 높음 | 명확한 지시 + `/vibeflow` 폴백 커맨드 |
| Claude Code CLI 인터페이스 변경 | 높음 | ClaudeExecutor 추상화로 격리 |
| 품질 게이트 오탐 | 중간 | warn 모드 기본, Creator가 조정 |
| 재시도 비용 폭발 | 중간 | 최대 3회, 2x 상한, 일일 한도 |
| 잘못된 블록 매칭 | 중간 | 신뢰도 임계값 + 확인 단계 |
| 대화형 생성 품질 | 중간 | 테스트 필수, AI 품질게이트 제안 |
| Channels Research Preview 구문 변경 | 중간 | 훅 기반 확정적 통합으로 Channels 의존도 최소화 |
| Drizzle SQLite↔PostgreSQL 스키마 비호환 | 중간 | MVP는 SQLite 단일 타겟, 프로덕션 전환 시 스키마 마이그레이션 별도 수행 |

---

## 11. 타임라인

| Phase | 소요 | 시작 조건 |
|-------|------|----------|
| Phase 0: Bootstrap | 1일 | 즉시 |
| Phase 1: Foundation | 3-4일 | Phase 0 |
| Phase 2: Harness | 4-5일 | Phase 1 |
| Phase 3: Matching | 1-2일 | Phase 1 (2와 병렬, 벡터 매칭 제거로 단축) |
| Phase 4: Creator | 3-4일 | Phase 1 (2,3과 병렬) |
| Phase 5: API + CLI | 4-5일 | Phase 1-4 |
| Phase 6: Web UI | 5-6일 | Phase 5 |
| Phase 7: Integration | 3-4일 | Phase 5-6 |
| **합계** | **~4-5주** | 병렬 시 ~3주 |

> 비판적 검토 참고: 위 일정은 AI 코딩 활용을 전제한 낙관적 산정.
> 1인 개발 시 현실적으로 6-8주, 보수적으로 8-12주 소요 가능.

### 11.1 MVP 범위 정의

**Tier 1 — 핵심 MVP (이것 없이는 가치 없음)**
- Phase 0: Bootstrap
- Phase 1: Foundation (블록 스키마 + 저장)
- Phase 2A: Harness Core (실행 + 품질 게이트, 코드 리뷰/보안 검토 제외)
- Phase 3: Matching Engine
- Phase 5 일부: CLI (`vf execute`, `vf blocks`)

**Tier 2 — 빠른 후속 (MVP 직후)**
- Phase 2B: Harness Advanced (코드 리뷰 + 보안 검토)
- Phase 4: Block Creator (대화형 생성)
- Phase 5 나머지: API 서버
- Smart Interview 훅

**Tier 3 — 확장 (검증 후)**
- Phase 6: Web UI
- Phase 7: CLAUDE.md/Channels 통합

---

## 12. 성공 기준 (전체)

- [ ] 팀원이 AI 대화로 5분 안에 블록 생성
- [ ] 팀원이 텔레그램에서 "DB 설계해줘" → 블록 자동 매칭 & 실행
- [ ] **같은 요청, 다른 사람 → 같은 품질** (표준화 달성)
- [ ] 블록이 버전 관리되고 시간에 따라 개선됨
- [ ] Claude Code를 대체하지 않고 강화
- [ ] 최소 3개 실제 팀 시나리오에서 블록 워크플로우 수요 검증
- [ ] 동시 3명 이상의 팀원이 병렬로 블록 실행 가능
- [ ] 커스텀 봇 코드 없이 Claude Code Channels로 메시징 처리
