# DevFlow — 컨셉 문서

> 작성일: 2026-03-26
> 상태: Draft

---

## 1. 한 줄 정의

> **Claude Code에 개발 프로세스를 입히는 경량 확장.**
> 코드를 고치면 리뷰, 보안, 테스트, 커밋이 자동으로 따라온다.
> 설치는 파일 복사 3초. 서버 없음. 의존성 없음.

---

## 2. 문제

```
Claude Code는 강력하지만 "시키는 것만 한다"

나: "이 버그 고쳐줘"
AI: (고침) "수정했습니다"
나: "...코드 리뷰는?"
AI: (리뷰) "문제 없습니다"
나: "...보안은?"
AI: (검토) "괜찮습니다"
나: "...테스트는?"
AI: (작성) "테스트 통과합니다"
나: "...커밋해"
AI: (커밋)

매번. 이. 순서를. 직접. 지시해야. 한다.
까먹으면 리뷰 없이 커밋되고, 보안 검토 없이 넘어간다.
```

---

## 3. 해결

```
DevFlow 설치 후:

나: "이 버그 고쳐줘"
AI: (고침)
    → 코드 리뷰 자동 실행... ✓
    → 보안 검토 자동 실행... ✓
    → 테스트 작성+실행... ✓ 3/3
    → 커밋: "fix: 주문 취소 시 환불 누락 수정"

    완료했습니다.

내가 한 것: "고쳐줘" 한마디
자동으로 된 것: 리뷰, 보안, 테스트, 커밋
```

---

## 4. 무엇인가

Claude Code의 훅 시스템을 이용해서, **코드가 변경될 때마다 자동으로 개발 프로세스를 실행**하는 도구.

```
Claude Code (기본)        Claude Code + DevFlow
─────────────────        ─────────────────────
코드 수정                 코드 수정
  ↓                        ↓
끝.                       코드 리뷰 (자동)
                           ↓
                          보안 검토 (자동)
                           ↓
                          테스트 (자동)
                           ↓
                          커밋 (자동)
                           ↓
                          문서 갱신 (자동)
                           ↓
                          끝.
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
      devflow.sh          # 핵심: PostToolUse 훅
    settings.json          # 훅 등록 (자동 머지)

  .devflow.yaml            # 프로세스 설정 (커스터마이징 가능)
  .devflow/                # 런타임 상태 (gitignore)
    last-review.json       # 마지막 리뷰 결과
```

### 5.3 동작 흐름

```
Claude Code가 Write/Edit 도구로 코드를 수정
     │
     ▼
PostToolUse 훅 발동 (devflow.sh)
     │
     ├─ 코드 파일인가? (.ts, .js, .py, .go, .sql 등)
     │   └─ 아니면 → 통과 (문서, 설정 파일 등은 스킵)
     │
     ├─ .devflow.yaml 로드 → 활성화된 프로세스 확인
     │
     ├─ 코드 리뷰 (활성화 시)
     │   → Haiku에게 "이 코드 변경에 버그/로직 오류 있나?"
     │   → 문제 발견 시 additionalContext로 "이 부분 수정 필요" 주입
     │
     ├─ 보안 검토 (활성화 시)
     │   → Haiku에게 "인젝션, 시크릿 노출, 인증 우회 있나?"
     │   → critical 발견 시 차단, high 이하는 경고
     │
     └─ 결과를 .devflow/last-review.json에 저장
```

```
Claude Code 작업이 끝날 때 (Stop 훅)
     │
     ▼
Stop 훅 발동 (devflow.sh)
     │
     ├─ 코드 변경이 있었나? (git diff 확인)
     │   └─ 없으면 → 통과
     │
     ├─ 테스트 실행 (활성화 시)
     │   → "변경된 코드에 대한 테스트를 작성/실행하세요" 주입
     │
     ├─ 커밋 제안 (활성화 시)
     │   → "Conventional Commits 형식으로 커밋하세요" 주입
     │
     └─ 문서 갱신 제안 (활성화 시)
        → "변경된 API가 있으면 문서를 업데이트하세요" 주입
```

### 5.4 설정 파일

```yaml
# .devflow.yaml — 이것만 수정하면 프로세스 커스터마이징 끝

# 코드 변경 시 자동 실행할 프로세스
on_code_change:
  code_review:
    enabled: true
    severity: high       # high 이상만 보고 (low/medium 무시)

  security_review:
    enabled: true
    block_on: critical   # critical만 차단, 나머지는 경고
    checks:
      - injection
      - secrets
      - auth_bypass

# 작업 완료 시 자동 실행할 프로세스
on_task_complete:
  test:
    enabled: true
    command: "npm test"  # 기존 테스트 러너 사용
    auto_write: true     # 테스트 없으면 작성 제안

  commit:
    enabled: true
    format: conventional # conventional commits
    auto: false          # 자동 커밋이 아닌 제안만

  docs:
    enabled: false       # 기본 비활성 (원하면 켜기)
    targets:
      - README.md
      - docs/API.md
```

---

## 6. 사용 예시

### 6.1 기본 사용 (설치만 하면 됨)

```
$ claude
> 주문 취소 함수에서 환불 처리가 빠져있어, 수정해줘

(Claude가 코드 수정)

[DevFlow] 코드 리뷰...
  ⚠ high: try-catch 없음 (refund.ts:23)
  → "refundService.process()에 에러 핸들링을 추가하세요"

(Claude가 자동 수정)

[DevFlow] 보안 검토... ✓ 이상 없음

(Claude의 작업 완료)

[DevFlow] 테스트 제안:
  → "환불 처리 테스트를 작성하세요"

(Claude가 테스트 작성 + 실행)

[DevFlow] 커밋 제안:
  → "fix: 주문 취소 시 환불 처리 추가"
  커밋할까요?

> 응
```

### 6.2 급한 수정 (프로세스 스킵)

```
$ claude
> !hotfix 프로덕션 500 에러, OrderService.ts 45번 줄 null 체크 추가해

(! 접두사 = DevFlow 스킵)
(Claude가 수정하고 끝. 리뷰/테스트 없이 빠르게.)
```

### 6.3 프로세스 커스터마이징

```yaml
# .devflow.yaml

# 보안에 민감한 프로젝트: 보안 리뷰 강화
on_code_change:
  security_review:
    enabled: true
    block_on: high         # high도 차단 (더 엄격)
    checks:
      - injection
      - secrets
      - auth_bypass
      - data_exposure       # 추가 체크
      - crypto              # 추가 체크

# 테스트 커버리지 중시하는 프로젝트
on_task_complete:
  test:
    enabled: true
    command: "npm test -- --coverage"
    min_coverage: 80       # 80% 미만이면 경고
```

---

## 7. OMC 등 기존 도구와의 비교

| | Claude Code (기본) | OMC | **DevFlow** |
|---|---|---|---|
| 코드 리뷰 | 시키면 함 | code-reviewer 에이전트 | **코드 변경 시 자동** |
| 보안 검토 | 시키면 함 | security-reviewer 에이전트 | **코드 변경 시 자동** |
| 테스트 | 시키면 함 | tdd-guide 에이전트 | **작업 완료 시 자동 제안** |
| 커밋 | 시키면 함 | commit protocol | **작업 완료 시 자동 제안** |
| 설치 | 기본 | 복잡한 설정 | **파일 복사 3초** |
| 설정 | CLAUDE.md | 다수의 설정 파일 | **YAML 1개** |
| 학습 곡선 | 없음 | 높음 (40+ 에이전트) | **없음 (설치하면 그냥 동작)** |
| 범위 | 범용 AI 도구 | 범용 오케스트레이션 | **개발 프로세스 특화** |
| 핵심 차이 | "시키면 한다" | "스킬을 호출한다" | **"알아서 따라온다"** |

---

## 8. 기술 제약

- Claude Code v2.1.51+ 필요 (훅 시스템)
- PostToolUse 훅 타임아웃 내 동작 (코드 리뷰/보안 검토: Haiku ~2초)
- Stop 훅에서 additionalContext 주입으로 테스트/커밋 제안
- Haiku 호출 비용: 코드 변경당 ~$0.002 (리뷰 + 보안)

---

## 9. 범위

### 만드는 것

- `devflow.sh` — PostToolUse + Stop 훅 스크립트 1개
- `.devflow.yaml` — 설정 파일 스키마 + 기본값
- `install.sh` — 설치 스크립트 (파일 복사 + settings.json 머지)
- README.md — 설치/사용 가이드

### 만들지 않는 것

- 서버, API, 웹 UI
- DB, 상태 저장 (파일 시스템만)
- 블록, 체인, 워크플로우 정의 시스템
- 팀 관리, 인증, 공유 기능
- 패키지 매니저 배포 (npm 등)

---

## 10. 확장 경로

```
Phase 1 (지금): 개인용, 셸 스크립트, 파일 복사
     ↓ 검증: "자동 리뷰+보안이 진짜 개발 품질을 올리는가?"

Phase 2: 프로세스 학습
     → "이 프로젝트에서는 DB 변경 후 항상 마이그레이션을 만드네"
     → 패턴 감지 → 자동 제안
     ↓ 검증: "학습된 패턴이 유용한가?"

Phase 3: 팀 공유
     → .devflow.yaml을 팀원과 공유 (Git으로)
     → 같은 프로세스, 같은 품질 기준
     ↓ 검증: "팀에서 실제로 품질이 균일해지는가?"

Phase 4: 플랫폼
     → 여기서 비로소 서버, 웹 UI, 분석 대시보드 필요
     → Vibe Flow v1의 기능이 이 시점에 자연스럽게 도입
```
