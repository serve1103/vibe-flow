# DevFlow

> Claude Code에 개발 프로세스를 입히는 경량 확장.
> 기획하면 인터뷰+검토가, 코드를 고치면 리뷰+보안+테스트가 자동으로 따라온다.

## 문제

Claude Code는 강력하지만 "시키는 것만 한다":

- 기획할 때: AI가 스스로 질문하고 검토해주면 좋겠는데, 매번 시켜야 한다
- 코딩할 때: 리뷰, 보안, 테스트, 커밋을 매번 지시해야 한다. 까먹으면 리뷰 없이 넘어간다

**DevFlow는 이 반복을 자동화한다.**

## 동작 방식

### 기획 모드 (UserPromptSubmit)

```
"주문 취소에 환불 기능을 추가하고 싶어"

[DevFlow] docs/에 환불 설계 문서가 없음 → 기획 모드 발동

  - 스마트 인터뷰: "동기/비동기 환불? 부분 환불 지원?"
  - 비판적 검토: "멱등성 처리 필요, 환불 실패 시 재시도 전략"
  - 문서 갱신: docs/에 설계 문서 작성 요청

→ 설계 완료 후 구현으로 전환
```

### 개발 모드 (PostToolUse)

```
코드 변경 감지 → 4단계 자동 체이닝:

  1단계: 코드 리뷰 + 보안 검토 (Haiku)
  2단계: 테스트 작성 제안
  3단계: 문서 갱신 제안 (API/스키마 변경 시)
  4단계: 커밋 제안 (Conventional Commits)
```

### 스킵 모드

```
> !프로덕션 500 에러, null 체크 추가해

→ "!" 접두사로 DevFlow 비활성, 빠르게 수정만
```

## 설치

### Claude Code 플러그인 (권장)

```bash
claude /plugin install github:serve1103/vibe-flow
```

### 로컬 설치

```bash
git clone https://github.com/serve1103/vibe-flow.git
claude /plugin install ./vibe-flow
```

### 설정 커스텀 (선택)

프로젝트 루트에 `.devflow.json`을 생성하면 기본 설정을 덮어씁니다:

```json
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
    "extensions": ["md", "json", "yaml", "yml", "txt", "toml", "lock", "env", "cfg", "ini", "csv"],
    "filenames": [".gitignore", ".dockerignore", "Makefile", "Dockerfile", "LICENSE"],
    "prefixes": [".env"]
  }
}
```

## 요구사항

- Claude Code v2.1.51+
- Node.js (Claude Code 설치 시 이미 포함)
- 추가 의존성 없음 (zero dependencies)

## 프로젝트 구조

```
.claude-plugin/
  plugin.json             # 플러그인 매니페스트
  marketplace.json        # 배포 정의

hooks/
  hooks.json              # 훅 이벤트 등록
  devflow-prompt.js       # 기획 모드 (UserPromptSubmit)
  devflow-code.js         # 개발 모드 (PostToolUse)
  devflow-observe.js      # 관찰 기록 (PostToolUse async)
  devflow-analyze.js      # 피드백 분석 (Stop)
  lib/
    config.js             # 설정 로드
    haiku.js              # Haiku LLM 호출 (실패 시 1회 재시도)
    extract-json.js       # LLM 응답 JSON 추출
    io.js                 # 파일 I/O 유틸리티
    cleanup.js            # 자원 관리 (스테일 정리 + 고아 프로세스 킬)
    skill-loader.js       # SKILL.md 로드 + 학습 규칙 인라인
    transcript.js         # transcript JSONL 파싱
    learning.js           # 학습 규칙 관리

skills/                   # 스킬 모듈 (수동 호출: /devflow:스킬명)
  coding-workflow/        # 개발 워크플로우 마스터
  planning-workflow/      # 기획 워크플로우 마스터
  code-review/            # 코드 리뷰 + references/
  security-check/         # 보안 검토 + references/
  test-suggest/           # 테스트 제안
  doc-update/             # 문서 갱신
  commit/                 # 커밋 제안 + references/
  interview/              # 스마트 인터뷰 + references/
  critical-review/        # 비판적 검토

agents/                   # Haiku 에이전트 정의
  reviewer.md             # 코드 리뷰 에이전트
  security-reviewer.md    # 보안 검토 에이전트

.devflow.json             # 프로세스 설정 (프로젝트별)
.devflow/                 # 런타임 상태 (자동 생성, .gitignore 권장)
  results/                # 스킬 완료 아티팩트
  feedback/               # 관찰/분석 데이터
  learned-rules/          # 자가 학습 규칙
```

## 자원 관리

DevFlow는 자원을 자동으로 정리합니다:

- **스테일 상태 정리** — `.devflow/` 상태가 30분 이상 경과하면 자동 초기화 (매 훅 실행 시)
- **고아 프로세스 킬** — 타임아웃된 Haiku 프로세스를 탐지하고 SIGTERM (프롬프트 입력 시)
- **자동 복구** — 고아 프로세스 킬 후 워크플로우 리셋 (다음 Write/Edit 시)
- **워크플로우 쿨다운** — 5분 내 중복 워크플로우 트리거 방지 (무한 루프 차단)
- **Haiku 재시도** — LLM 호출 실패 시 1회 자동 재시도

## 비용

| 항목 | 비용 | 지연 |
|------|------|------|
| 기획 모드 (Haiku 1회) | ~$0.001-0.002 | ~2-5초 |
| 개발 모드 1단계 (Haiku 2회) | ~$0.002-0.004 | ~6-10초 |
| 개발 모드 2-4단계 | $0 | <1ms |

디바운싱으로 연속 편집 시 Haiku 1회만 호출.

## 설정 옵션

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `planning.enabled` | `true` | 기획 모드 활성화 |
| `coding.code_review.enabled` | `true` | 코드 리뷰 |
| `coding.security_review.enabled` | `true` | 보안 검토 |
| `coding.test.enabled` | `true` | 테스트 제안 |
| `coding.commit.enabled` | `true` | 커밋 제안 |
| `coding.docs.enabled` | `true` | 문서 갱신 제안 |
| `skip.prefix` | `"!"` | 이 접두사로 시작하면 DevFlow 비활성 |
| `skip.extensions` | `["md","json",...]` | 코드 리뷰 스킵 확장자 |
| `skip.filenames` | `[".gitignore",...]` | 스킵 파일명 |
| `skip.prefixes` | `[".env"]` | 이 접두사로 시작하는 파일명 스킵 |

## 라이선스

MIT
