# Claude Code Remote Control & Channels 활용 가이드

> 작성일: 2026-03-22
> 기반: Claude Code 공식 문서, 커뮤니티 가이드, 기술 블로그
> 대상 버전: Claude Code v2.1.80+

---

## 목차

1. [개요](#1-개요)
2. [Remote Control — 어디서든 세션 이어가기](#2-remote-control--어디서든-세션-이어가기)
3. [Channels — 텔레그램/디스코드로 Claude Code 제어](#3-channels--텔레그램디스코드로-claude-code-제어)
4. [두 기능 조합 워크플로우](#4-두-기능-조합-워크플로우)
5. [요구사항 및 제약사항](#5-요구사항-및-제약사항)
6. [트러블슈팅](#6-트러블슈팅)
7. [참고 자료](#7-참고-자료)

---

## 1. 개요

Claude Code는 터미널 기반 CLI 도구이지만, **Remote Control**과 **Channels** 두 가지 기능을 통해 터미널 밖에서도 세션을 제어할 수 있다.

| 기능 | 핵심 역할 | 접속 방식 |
|------|----------|----------|
| **Remote Control** | 세션 전체를 원격에서 이어가기 | claude.ai/code 웹 UI, 모바일 앱 |
| **Channels** | 메신저를 통한 메시지 푸시 & 응답 | 텔레그램 봇, 디스코드 봇 |

두 기능 모두 **코드 실행은 로컬 머신에서 유지**되며, 채팅 메시지만 Anthropic API를 경유한다.

---

## 2. Remote Control — 어디서든 세션 이어가기

### 2.1 개념

터미널에서 실행 중인 Claude Code 세션을 **휴대폰, 태블릿, 다른 PC의 브라우저**에서 그대로 이어서 사용하는 기능이다. 파일이나 코드는 이동하지 않고, 채팅 메시지만 Anthropic API 브릿지를 통해 전달된다.

### 2.2 시작 방법

세 가지 방식으로 시작할 수 있다.

```bash
# 방법 1: 전용 서버 모드 (세션 없이 원격 연결 대기)
claude remote-control

# 방법 2: 대화형 세션 시작 + 원격 접속 허용
claude --remote-control

# 방법 3: 이미 실행 중인 세션 내에서 활성화
/remote-control
# 또는 단축 명령어
/rc
```

### 2.3 원격 기기에서 연결하기

| 방법 | 절차 |
|------|------|
| **QR 코드** | 터미널에서 `스페이스바` 누르면 QR 코드 표시 → 폰 카메라로 스캔 |
| **세션 URL** | 터미널에 출력되는 URL을 브라우저에 직접 입력 |
| **세션 목록** | claude.ai/code 접속 → 활성 세션 목록에서 클릭 |

### 2.4 실전 활용 시나리오

#### 시나리오 1: 퇴근 후 빌드 모니터링

```
1. 회사 PC에서 claude --remote-control 로 세션 시작
2. "이 프로젝트 전체 테스트 실행하고 실패하면 원인 분석해줘" 지시
3. 퇴근 후 폰에서 claude.ai/code 접속
4. 테스트 결과 확인 & 추가 지시 가능
```

#### 시나리오 2: 이동 중 코드 리뷰

```
1. 데스크톱에서 /remote-control 실행
2. 통근 중 폰에서 접속
3. "PR #42 변경사항 요약해줘" → 리뷰 코멘트 작성 지시
```

#### 시나리오 3: 장시간 작업 위임

```
1. claude remote-control 서버 모드 실행
2. 대규모 리팩토링 작업 지시
3. 다른 작업 하다가 폰으로 진행상황 확인
4. 도구 실행 승인이 필요한 경우 → 폰에서 즉시 승인/거부
```

### 2.5 주의사항

- **claude.ai 로그인 필수** — API 키 인증은 지원되지 않음
- **터미널이 열려 있어야 함** — 터미널을 닫으면 세션도 종료
- **네트워크 장애 10분 이상 시 타임아웃** 발생
- **하나의 프로세스당 하나의 원격 세션**만 연결 가능

---

## 3. Channels — 텔레그램/디스코드로 Claude Code 제어

### 3.1 개념

Channels는 MCP 서버를 통해 **텔레그램, 디스코드 등 외부 메신저에서 Claude Code 세션으로 메시지를 푸시**하는 기능이다. Claude가 메시지를 읽고 답장까지 보내는 **양방향 채팅 브릿지**를 제공한다.

핵심 특징:

- **양방향 채팅** — 메신저에서 지시하고, Claude가 메신저로 응답
- **단방향 웹훅** — CI/CD, 에러 트래커 등의 알림을 세션으로 푸시
- **보안** — sender allowlist로 승인된 사용자만 메시지 전송 가능
- **세션이 열려 있을 때만** 이벤트 수신 가능

### 3.2 텔레그램 설정 (약 5분 소요)

#### Step 1: 텔레그램 봇 생성

1. 텔레그램에서 `@BotFather` 검색
2. `/newbot` 명령어 전송
3. 봇 이름과 username 입력
4. **봇 토큰**을 복사해 둔다

#### Step 2: Claude Code에서 플러그인 설치 & 설정

```bash
# 플러그인 설치
/plugin install telegram@claude-plugins-official

# 토큰 설정
/telegram:configure <YOUR_BOT_TOKEN>

# 채널 모드로 Claude Code 재시작
claude --channels plugin:telegram@claude-plugins-official
```

#### Step 3: 페어링 및 보안 설정

```bash
# 텔레그램에서 생성한 봇에게 아무 메시지 전송 → 페어링 코드 확인

# Claude Code 터미널에서 페어링
/telegram:access pair <code>

# 본인만 사용할 수 있도록 보안 잠금
/telegram:access policy allowlist
```

### 3.3 디스코드 설정

#### Step 1: 디스코드 봇 생성

1. Discord Developer Portal (https://discord.com/developers/applications) 접속
2. **New Application** → 이름 입력 → 생성
3. 좌측 **Bot** 메뉴 → **Reset Token** → 토큰 복사
4. **Privileged Gateway Intents** → **Message Content Intent** 활성화
5. 좌측 **OAuth2** → **URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`
6. 생성된 URL로 봇을 서버에 초대

#### Step 2: Claude Code에서 플러그인 설치 & 설정

```bash
# 플러그인 설치
/plugin install discord@claude-plugins-official

# 토큰 설정
/discord:configure <YOUR_BOT_TOKEN>

# 채널 모드로 Claude Code 재시작
claude --channels plugin:discord@claude-plugins-official
```

#### Step 3: 페어링 및 보안 설정

```bash
# 디스코드에서 봇에게 DM으로 메시지 전송 → 페어링 코드 확인

# Claude Code 터미널에서 페어링
/discord:access pair <code>

# 보안 잠금
/discord:access policy allowlist
```

### 3.4 빠른 체험: Fakechat (로컬 데모)

봇 설정 없이 Channels 기능을 바로 체험할 수 있는 로컬 데모 채널이다.

```bash
# 설치
/plugin install fakechat@claude-plugins-official

# 채널 모드로 시작
claude --channels plugin:fakechat@claude-plugins-official

# 브라우저에서 http://localhost:8787 열기
# → 메시지 입력하면 Claude가 수신 후 응답
```

### 3.5 실전 활용 시나리오

#### 시나리오 1: 폰에서 개발 지시

```
[텔레그램 대화]

나: "src/api/users.ts에서 cursor 기반 페이지네이션 추가해줘"
Claude Bot: "users.ts를 수정했습니다. cursor 기반 페이지네이션을
             추가하고, 기존 offset 방식은 deprecated 처리했습니다."

나: "테스트도 작성해줘"
Claude Bot: "users.test.ts에 3개 테스트 케이스를 추가했습니다."
```

#### 시나리오 2: CI/CD 알림 수신 & 자동 대응

```
[웹훅으로 CI 실패 알림 → Claude 세션으로 푸시]
Channel Event: "GitHub Actions: build failed on PR #55"

Claude: (자동으로 에러 로그 분석 → 원인 파악 → 수정)

[텔레그램으로 결과 보고]
Claude Bot: "빌드 실패 원인은 타입 에러였습니다.
             수정 커밋을 푸시했습니다."
```

#### 시나리오 3: 에러 모니터링 + 즉시 대응

```
[Sentry 웹훅 → Claude 세션]
Channel Event: "Sentry alert: TypeError in /api/checkout"

Claude: (관련 코드 분석 → 핫픽스 준비)

[디스코드로 보고]
Claude Bot: "checkout 핸들러에서 null 체크 누락. 수정 PR 생성할까요?"
나: "ㅇㅇ"
Claude Bot: "PR #58 생성 완료"
```

### 3.6 보안 모델

- 모든 채널은 **sender allowlist**를 유지하며, 승인된 ID만 메시지 전송 가능
- 페어링 과정에서 본인의 sender ID가 allowlist에 등록됨
- `policy allowlist` 설정 후에는 등록되지 않은 사용자의 메시지를 무시
- Team/Enterprise 플랜에서는 관리자가 managed settings로 채널 비활성화 가능

---

## 4. 두 기능 조합 워크플로우

### 4.1 아키텍처

```
┌──────────────────────────────────────────────────┐
│              로컬 PC (터미널)                      │
│                                                  │
│   claude --remote-control                        │
│          --channels plugin:telegram@...           │
│                                                  │
│   ┌─────────────────┐  ┌──────────────────────┐  │
│   │  Remote Control  │  │  Channels            │  │
│   │  (웹 UI 브릿지)   │  │  (메신저 브릿지)      │  │
│   └────────┬─────────┘  └──────────┬───────────┘  │
│            │                       │              │
└────────────┼───────────────────────┼──────────────┘
             │                       │
        claude.ai/code          텔레그램 봇
        (세션 전체 제어)         (빠른 메시지/알림)
```

### 4.2 상황별 추천 기능

| 상황 | 추천 기능 | 이유 |
|------|----------|------|
| 세션을 폰에서 완전히 이어가고 싶을 때 | **Remote Control** | 전체 UI 및 히스토리 접근 |
| 짧은 지시/확인만 보내고 싶을 때 | **Channels** (텔레그램) | 메신저에서 빠른 메시지 전송 |
| CI/배포 알림을 받고 자동 대응 | **Channels** (웹훅) | 이벤트 기반 자동 트리거 |
| 도구 실행 승인을 원격으로 | **둘 다 가능** | Channels의 권한 릴레이 기능 |
| 팀원과 함께 세션 모니터링 | **Channels** (디스코드 채널) | 다수 사용자가 동일 채널 관찰 |
| 복잡한 코드 확인 및 세밀한 제어 | **Remote Control** | 전체 대화 맥락 및 파일 뷰 |

### 4.3 동시 사용 예시

```bash
# 텔레그램 채널 + 리모트 컨트롤 동시 활성화
claude --remote-control --channels plugin:telegram@claude-plugins-official
```

**하루 워크플로우:**

```
[아침] 데스크톱에서 작업 시작
  ↓
[점심] 텔레그램으로 빠르게 상태 확인
  ↓  "지금 어디까지 했어?" → Claude Bot 응답
  ↓
[오후 외출] claude.ai/code에서 Remote Control 접속
  ↓  세션 전체 맥락 확인 & 추가 작업 지시
  ↓
[저녁] CI 빌드 완료 알림 → 텔레그램으로 수신
  ↓  "테스트 전부 통과했어?" → Claude Bot 응답
  ↓
[귀가] 데스크톱에서 다시 터미널로 복귀
```

---

## 5. 요구사항 및 제약사항

### 5.1 시스템 요구사항

| 항목 | Remote Control | Channels |
|------|---------------|----------|
| **최소 버전** | v2.1.51+ | v2.1.80+ |
| **인증** | claude.ai 로그인 필수 | claude.ai 로그인 필수 |
| **지원 플랜** | Pro, Max, Team, Enterprise | Pro, Max, Team, Enterprise |
| **추가 설정** | 없음 | 봇 토큰 발급 필요 |
| **Team/Enterprise** | 관리자 활성화 필요 | 관리자 활성화 필요 |

### 5.2 제약사항

**Remote Control:**

- 하나의 프로세스당 하나의 원격 세션만 연결 가능
- 터미널이 닫히면 세션 종료
- 10분 이상 네트워크 장애 시 타임아웃
- API 키 인증 미지원

**Channels:**

- 현재 텔레그램, 디스코드만 지원 (Slack 미지원)
- 세션이 열려 있을 때만 이벤트 수신
- claude.ai 로그인 필수 (Console/API 키 인증 미지원)

---

## 6. 트러블슈팅

### 6.1 Remote Control

| 문제 | 해결 방법 |
|------|----------|
| QR 코드가 표시되지 않음 | `스페이스바`를 눌러 토글, 터미널 크기 확인 |
| 연결이 안 됨 | `claude --version`으로 v2.1.51+ 확인 |
| 세션 목록에 안 보임 | claude.ai에 동일 계정으로 로그인했는지 확인 |
| 갑자기 연결 끊김 | 네트워크 상태 확인, 터미널이 열려 있는지 확인 |
| "Organization policy" 에러 | Team/Enterprise 관리자에게 활성화 요청 |

### 6.2 Channels

| 문제 | 해결 방법 |
|------|----------|
| 봇이 응답하지 않음 | 세션이 `--channels` 플래그로 시작되었는지 확인 |
| 페어링 코드가 안 뜸 | 봇 토큰이 올바른지 `/telegram:configure` 재실행 |
| "Unauthorized sender" | `/telegram:access pair <code>` 재실행 |
| 디스코드 봇이 메시지를 못 읽음 | Message Content Intent 활성화 확인 |
| Claude가 자동 응답하지 않음 | allowlist에 본인 ID가 등록되었는지 확인 |

### 6.3 Enterprise 환경 설정

Team/Enterprise 관리자가 기능을 활성화하는 방법:

```
claude.ai → Admin settings → Claude Code

- Remote Control: remoteControlEnabled → true
- Channels: channelsEnabled → true
```

또는 managed settings JSON:

```json
{
  "remoteControlEnabled": true,
  "channelsEnabled": true
}
```

---

## 7. 참고 자료

### 공식 문서

- [Remote Control 문서](https://code.claude.com/docs/en/remote-control)
- [Channels 문서](https://code.claude.com/docs/en/channels)
- [Claude Code Changelog](https://docs.anthropic.com/en/docs/claude-code/changelog)

### 커뮤니티 가이드

- [I Control Claude Code From My Phone Now (DEV Community)](https://dev.to/ji_ai/i-control-claude-code-from-my-phone-now-heres-the-5-minute-telegram-setup-3b99)
- [2 Platforms, 3 Commands: Claude Code Channels Setup Guide (DEV Community)](https://dev.to/ji_ai/2-platforms-3-commands-claude-code-channels-setup-guide-33li)
- [Claude Code Remote Control Guide (Geeky Gadgets)](https://www.geeky-gadgets.com/claude-code-remote-control-guide-2026/)
- [Simon Willison's TIL: Claude Code Remote Control](https://simonwillison.net/2026/Feb/25/claude-code-remote-control/)

### 기술 기사

- [MacStories: Hands-On with Claude Code's Telegram and Discord Integrations](https://www.macstories.net/stories/first-look-hands-on-with-claude-codes-new-telegram-and-discord-integrations/)
- [VentureBeat: Anthropic's Claude Code Channels](https://venturebeat.com/orchestration/anthropic-just-shipped-an-openclaw-killer-called-claude-code-channels)

---

> 이 문서는 2026년 3월 22일 기준으로 작성되었습니다.
> Claude Code 버전 업데이트에 따라 기능이 변경될 수 있으므로 공식 문서를 함께 참고하세요.
