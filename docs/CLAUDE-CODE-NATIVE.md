# Vibe Flow - Claude Code 네이티브 기능 활용 전략

> 작성일: 2026-03-22
> 상태: Draft
> 참조: claude-code-remote-channels-guide.md

---

## 1. 원칙

> **Claude Code가 이미 제공하는 것은 만들지 않는다.**

Vibe Flow는 Claude Code를 대체하지 않고, **위에 올라가서 강화한다.**
채널, 웹 접근, 인증, 세션 관리는 모두 Claude Code 네이티브 기능을 사용한다.

---

## 2. 활용하는 네이티브 기능

### 2.1 Remote Control (웹/모바일 접근)

| Claude Code 기능 | Vibe Flow 활용 |
|-----------------|----------------|
| `claude --remote-control` | Creator가 웹에서 세션 접근 |
| `claude.ai/code` 웹 UI | 세션 모니터링, 승인 |
| QR 코드 모바일 접속 | 이동 중 결과 확인 |

**Vibe Flow가 만들지 않는 것:**
- 자체 웹 세션 뷰어
- 모바일 앱
- 세션 모니터링 UI

**Vibe Flow가 만드는 것:**
- Creator 전용 대시보드 (블록 관리, 분석) — 이건 Remote Control과 다른 용도

### 2.2 Channels (메신저 연동)

| Claude Code 기능 | Vibe Flow 활용 |
|-----------------|----------------|
| `plugin:telegram` | Consumer의 텔레그램 접근 |
| `plugin:discord` | Consumer의 디스코드 접근 |
| 양방향 채팅 | 자연어 → 블록 매칭 → 결과 응답 |
| 웹훅 | CI/CD 알림 → 자동 대응 |
| sender allowlist | 팀 멤버 접근 제어 |

**Vibe Flow가 만들지 않는 것:**
- 텔레그램 봇
- 디스코드 봇
- 메시지 전송/수신 로직
- 봇 인증/보안

**Vibe Flow가 만드는 것:**
- 채널별 산출물 포맷팅 (channel-adapter.ts)
- CLAUDE.md를 통한 Vibe Flow 호출 지시

### 2.3 프로그래매틱 실행

| Claude Code 기능 | Vibe Flow 활용 |
|-----------------|----------------|
| `claude -p` (print 모드) | 비대화형 블록 실행 |
| `--output-format stream-json` | 실시간 스트리밍 출력 |
| `--model` | 블록별 모델 설정 전달 |
| `--session-id` | 세션 연속성 유지 |
| `--resume` | 이전 세션 이어가기 |
| `--max-budget-usd` | 블록별 비용 상한 |
| `--json-schema` | 구조화된 출력 검증 |

**Vibe Flow가 만들지 않는 것:**
- AI 실행 엔진
- 모델 호출 로직
- 토큰 관리

**Vibe Flow가 만드는 것:**
- ClaudeExecutor: CLI 프로세스 관리 래퍼
- 컨텍스트 주입, 품질 검증, 재시도 로직

### 2.4 세션 관리

| Claude Code 기능 | Vibe Flow 활용 |
|-----------------|----------------|
| `--session-id` | 프로젝트별 세션 추적 |
| `--resume` | 중단된 작업 재개 |
| 세션 히스토리 | 이전 블록 실행 결과 참조 |

### 2.5 보안

| Claude Code 기능 | Vibe Flow 활용 |
|-----------------|----------------|
| sender allowlist | 채널 접근 제어 |
| claude.ai 인증 | 사용자 인증 |
| Team/Enterprise 관리 | 조직 정책 |

**Vibe Flow가 추가하는 보안:**
- 팀 API 키 인증 (API 서버용)
- 팀별 데이터 격리
- 블록별 비용 한도

---

## 3. 핵심 통합 지점: CLAUDE.md

Vibe Flow와 Claude Code의 연결 고리는 **CLAUDE.md** 파일이다.

```markdown
# CLAUDE.md

## Vibe Flow 연동

이 프로젝트는 Vibe Flow 블록 시스템을 사용합니다.

### 블록 실행 규칙
사용자가 작업을 요청하면:
1. `vf execute --dry-run '<요청>'` 으로 매칭 블록을 확인합니다
2. 블록이 매칭되면 (confidence >= 0.8) `vf execute '<요청>'`을 실행합니다
3. 블록이 매칭되지 않으면 일반 Claude Code 동작을 수행합니다

### 예시
- 사용자: "DB 설계해줘" → `vf execute "DB 설계해줘"` 실행
- 사용자: "이 버그 고쳐줘" → 매칭 블록 없음 → 일반 Claude Code

### 팀 컨벤션
- 코드 스타일: [팀 컨벤션 파일 참조]
- 커밋 메시지: Conventional Commits 형식
```

**동작 흐름:**

```
텔레그램 사용자: "인증 API 설계해줘"
     │
     ▼
Claude Code Channels (텔레그램 플러그인)
     │ 메시지 수신
     ▼
Claude Code 세션
     │ CLAUDE.md 읽음
     │ "Vibe Flow 블록 확인해야 함"
     ▼
vf execute --dry-run "인증 API 설계해줘"
     │ 매칭 엔진 실행
     │ "API 설계" 블록 (confidence: 0.91)
     ▼
vf execute "인증 API 설계해줘"
     │ 하네스 실행
     │ 컨텍스트 주입 + CLI 호출 + 품질 검증
     ▼
결과 → Claude Code → 텔레그램 사용자
```

**리스크와 완화:**

| 리스크 | 완화 |
|--------|------|
| Claude Code가 CLAUDE.md 지시를 무시할 수 있음 | 지시를 매우 구체적으로 작성, 예시 포함 |
| 복잡한 지시는 따르기 어려움 | 단순하게 유지: "vf 명령어 실행" 하나만 |
| 폴백 필요 | 사용자가 직접 `/vibeflow "요청"` 슬래시 커맨드 사용 가능 |

---

## 4. Channels 설정 가이드 (Consumer용)

### 4.1 텔레그램 설정 (관리자가 1회 수행)

```bash
# 1. 텔레그램 봇 생성 (@BotFather → /newbot)
# 2. Claude Code에서 설정
/plugin install telegram@claude-plugins-official
/telegram:configure <BOT_TOKEN>

# 3. Vibe Flow + Channels 모드로 시작
claude --remote-control --channels plugin:telegram@claude-plugins-official

# 4. 팀원 등록
# 각 팀원이 봇에 메시지 → 페어링 코드 → 등록
/telegram:access pair <code>
/telegram:access policy allowlist
```

### 4.2 디스코드 설정 (관리자가 1회 수행)

```bash
# 1. Discord Developer Portal에서 봇 생성
# 2. Claude Code에서 설정
/plugin install discord@claude-plugins-official
/discord:configure <BOT_TOKEN>

# 3. 시작
claude --remote-control --channels plugin:discord@claude-plugins-official

# 4. 팀원 등록
/discord:access pair <code>
/discord:access policy allowlist
```

### 4.3 동시 채널 설정

```bash
# 텔레그램 + 디스코드 + Remote Control 동시 활성화
claude --remote-control \
  --channels plugin:telegram@claude-plugins-official \
  --channels plugin:discord@claude-plugins-official
```

---

## 5. 현재 제약사항

| 항목 | 상태 | 영향 |
|------|------|------|
| Slack Channels 미지원 | Claude Code v2.1.80 기준 텔레그램/디스코드만 | Slack은 추후 지원 대기 |
| 세션 열려있어야 Channels 동작 | 프로세스 상시 실행 필요 | 서버 환경에서 tmux/screen으로 해결 |
| 하나의 프로세스당 하나의 원격 세션 | 동시 다중 사용자 제한 | 팀원별 프로세스 또는 큐 기반 처리 |
| claude.ai 로그인 필수 | API 키만으로는 Channels 불가 | claude.ai 계정 필수 |
| 네트워크 장애 10분 타임아웃 | Remote Control 연결 끊김 | 재연결 필요 |
| claude.ai OAuth 인증 필수 | Channels/Remote Control 모두 | API 키만으로 불가. 서버 배포 시 `claude setup-token` 사용 |
| Channels Research Preview | 구문 변경 가능성 | 핵심 로직을 훅 기반으로 구현하여 Channels 의존도 최소화 |
| 최소 버전 요구 | Remote Control v2.1.51+, Channels v2.1.80+ | CI/CD에서 버전 체크 필요 |

### 5.1 다중 사용자 처리 전략

현재 Claude Code는 프로세스당 하나의 세션만 지원하므로, 팀 사용 시:

**권장: 프로세스 풀 (N=3) + 큐 (MVP부터 적용)**

> 비판적 검토 결과: "팀용" 제품의 MVP가 "1명씩 순차 처리"이면 가치 제안이 성립하지 않음.
> 10명 팀 동시 요청은 현실적으로 2-3명. 워커 풀 N=3이면 대부분 커버.

```
서버 시작 시 워커 슬롯 3개 예약
→ 요청 도착 시 가용 슬롯에 claude -p --session-id <unique> 생성
→ 모든 슬롯 사용 중이면 큐 대기 (예상 대기 시간 알림)
→ 프로세스 완료 후 슬롯 반환
→ 블록 체이닝: 이전 실행 결과를 DB에서 읽어 컨텍스트 주입
```

**제약사항:**
- 콜드 스타트 오버헤드 (프로세스당 3-5초)
- 프로세스당 수백MB 메모리 점유
- OAuth 토큰 동시 세션 정책 검증 필요
- 향후 Claude Agent SDK 도입으로 프로세스 오버헤드 해소 가능

---

## 6. 향후 Claude Code 기능 활용 계획

| Claude Code 기능 (예상/희망) | Vibe Flow 활용 계획 |
|------|------|
| Slack Channels 지원 | 즉시 Consumer 채널로 추가 |
| 다중 동시 세션 | 팀 병렬 처리 개선 |
| 블록/스킬 네이티브 지원 | Vibe Flow 블록 포맷을 네이티브로 이식 |
| 팀 관리 기능 | Vibe Flow 팀 관리를 네이티브로 위임 |
| Webhook API | Channels 대신 직접 API 통합 |
