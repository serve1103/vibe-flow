# DevFlow 개발 모드 상세 스펙

> 훅: `devflow-code.sh` (PostToolUse)
> 목적: 코드가 변경될 때마다 리뷰, 보안, 테스트, 문서, 커밋이 자동으로 따라온다

---

## 1. 발동 조건

```
Claude Code가 Write 또는 Edit 도구 사용
     │
     ├─ Write/Edit 아닌 도구 → 스킵
     ├─ 기획 모드 활성 (.devflow/mode = "planning") → 스킵
     ├─ 비코드 파일 (.md, .json, .yaml, .txt 등) → 스킵
     ├─ 디바운싱: 마지막 변경 후 5초 미경과 → 누적만 하고 스킵
     │
     └─ 코드 파일 변경 확인 → 체이닝 실행
```

---

## 2. 체이닝 (4단계 순차 실행)

한 번에 하나만 주입한다. Claude가 작업을 수행하면 다음 PostToolUse가 발동되어 다음 단계로 진행.

```
1단계: 코드 리뷰 + 보안 검토
  → 문제 발견 시 수정 지시
  → Claude가 수정하면 2단계로

2단계: 테스트 제안
  → "테스트를 작성하고 실행하세요"
  → Claude가 테스트 작성하면 3단계로

3단계: 문서 갱신 제안
  → 경로 기반 판단 (API 변경 → API 문서, 스키마 변경 → 모델 문서)
  → Claude가 문서 갱신하면 4단계로

4단계: 커밋 제안
  → "Conventional Commits 형식으로 커밋하세요"
  → 완료 후 1단계로 초기화
```

---

## 3. 1단계: 코드 리뷰

### 3.1 대상

- Write 도구로 작성된 코드 파일의 전체 내용 (최대 200줄)
- Edit 도구로 수정된 코드의 new_string 부분 (최대 200줄)

### 3.2 리뷰 기준

Haiku에게 다음을 요청:

| 심각도 | 기준 | 예시 |
|--------|------|------|
| `critical` | 즉시 장애를 유발하는 버그 | null 참조, 무한 루프, 데이터 손실 |
| `high` | 잠재적 버그 또는 심각한 설계 문제 | 에러 핸들링 누락, 레이스 컨디션, 메모리 누수 |
| `medium` | 코드 품질 문제 | 중복 코드, 비효율적 알고리즘 |
| `low` | 스타일/컨벤션 | 네이밍, 포맷팅 |

**기본 설정: high 이상만 보고** (medium/low 무시)

### 3.3 Haiku 요청 형식

```
다음 코드 변경을 리뷰하세요. high 이상 심각도의 문제만 보고하세요.

파일: {file_path}
코드:
{code_content}

JSON으로만 응답:
문제없음: {"issues":[]}
문제있음: {"issues":[{"severity":"high","description":"설명","suggestion":"제안"}]}
```

### 3.4 Haiku 응답 파싱

1. `claude -p --output-format json`은 result wrapper를 반환
2. `.result` 필드에서 실제 텍스트 추출
3. 텍스트에서 JSON 추출 (마크다운 코드블록 우선, non-greedy 매칭)
4. `issues` 배열에서 리뷰 결과 조립

### 3.5 출력 형식

```
[DevFlow 코드 리뷰]
[high] API 키가 소스 코드에 하드코딩되어 있습니다 → 환경 변수를 사용하세요
[high] SQL 인젝션 취약점 → Prepared Statement를 사용하세요

위 문제를 수정하세요.
```

---

## 4. 1단계: 보안 검토

### 4.1 체크 항목

| 항목 | 설명 | 예시 |
|------|------|------|
| `injection` | SQL/NoSQL/OS 명령어 인젝션 | 문자열 연결로 쿼리 구성 |
| `secrets` | 하드코딩된 시크릿/API 키 | `const key = "sk-live-..."` |
| `auth_bypass` | 인증/권한 우회 가능성 | 토큰 검증 없는 엔드포인트 |
| `data_exposure` | 민감 데이터 노출 | 에러 메시지에 스택트레이스 |
| `crypto` | 안전하지 않은 암호화 | MD5, SHA1 사용 |
| `path_traversal` | 경로 탐색 공격 | `../` 필터링 없는 파일 접근 |

**기본 설정 (하드코딩): injection, secrets, auth_bypass, path_traversal**

### 4.2 심각도 처리

| 심각도 | 처리 |
|--------|------|
| `critical` | additionalContext로 경고 (PostToolUse는 차단 불가) |
| `high` | additionalContext로 경고 |
| `medium/low` | 무시 |

### 4.3 Haiku 요청 형식

```
다음 코드에서 보안 취약점을 체크하세요.
체크 항목: SQL injection, 하드코딩된 시크릿/API키, 경로 탐색, 인증 우회

파일: {file_path}
코드:
{code_content}

JSON으로만 응답:
안전: {"safe":true}
취약점: {"safe":false,"issues":[{"severity":"critical","description":"설명"}]}
```

---

## 5. 2단계: 테스트 제안

### 5.1 동작

- additionalContext로 `"변경된 코드에 대한 테스트를 작성하고 실행하세요"` 주입
- Claude가 테스트를 Write하면 → 다음 PostToolUse 발동 → 3단계로 진행
- Claude가 테스트를 작성하지 않으면 (예: Bash로 기존 테스트 실행만) → 체이닝 정체
- 새 프롬프트 입력 시 chain-step이 리셋되므로 정체 문제 해소

### 5.2 설정

```yaml
coding:
  test:
    enabled: true
    suggest: true          # 테스트 작성 제안
    command: "npm test"    # 참고용 (Claude에게 전달)
```

---

## 6. 3단계: 문서 갱신 제안

### 6.1 경로 기반 판단

| 파일 경로 패턴 | 문서 갱신 제안 |
|---------------|---------------|
| `route`, `api`, `endpoint`, `controller` | "API 관련 코드가 변경되었습니다. API 문서를 갱신하세요." |
| `schema`, `model`, `migration`, `table` | "데이터 모델 관련 코드가 변경되었습니다. 모델/스키마 문서를 갱신하세요." |
| 위에 해당 안 됨 | 문서 갱신 제안 스킵 |

> 제약: 경로 패턴에 매칭되지 않으면 문서 갱신을 제안하지 않는다.
> 이 경우 체이닝이 3단계에서 정체될 수 있으나, 새 프롬프트 입력 시 chain-step이 리셋되어 해소된다.

### 6.2 제약

- 경로 기반이므로 false positive 가능 (`navigator.ts`에 "route" 매칭 등)
- Phase 1에서는 이 수준으로 충분. 정확도가 필요하면 Haiku 분석으로 확장 가능

---

## 7. 4단계: 커밋 제안

### 7.1 동작

- additionalContext로 `"Conventional Commits 형식으로 커밋하세요"` 주입
- Claude가 커밋을 수행하면 체이닝 완료
- chain-step을 1로 초기화

### 7.2 Conventional Commits 형식

```
feat: 새 기능
fix: 버그 수정
refactor: 리팩토링
docs: 문서 변경
test: 테스트
chore: 빌드/설정
```

---

## 8. 디바운싱

### 8.1 목적

파일 10개를 연속 수정할 때 Haiku를 10번 호출하는 것을 방지.

### 8.2 메커니즘 (타임스탬프 비교, sleep 아님)

```
PostToolUse 발동
  ↓
.devflow/pending에 변경 파일 추가
  ↓
.devflow/last-change 타임스탬프 확인
  ↓
마지막 변경 후 5초 경과?
  ├─ 경과 → 누적 변경 일괄 리뷰 실행
  └─ 미경과 → 타임스탬프 갱신, 스킵 (누적만)
```

- `sleep`이 아니므로 블로킹 없음
- 연속 편집의 **마지막** 편집 이후 5초 경과 시 리뷰 실행
- 단, 첫 번째 편집은 타임스탬프 파일이 없으므로 항상 통과

### 8.3 pending 파일

```
# .devflow/pending (예시)
src/auth.ts
src/routes/login.ts
src/models/user.ts
```

1단계에서 `sort -u`로 중복 제거 후 Haiku에게 전달. 리뷰 후 초기화.

---

## 9. 상태 파일

| 파일 | 내용 | 값 |
|------|------|-----|
| `.devflow/mode` | 현재 모드 | `"coding"` (기획 모드면 스킵) |
| `.devflow/chain-step` | 체이닝 단계 | `1`~`4` (새 프롬프트 시 1로 리셋) |
| `.devflow/pending` | 디바운싱 변경 파일 목록 | 파일 경로 (줄 단위) |
| `.devflow/last-change` | 마지막 변경 타임스탬프 | Unix timestamp |

---

## 10. 설정

```yaml
# .devflow.yaml
coding:
  code_review:
    enabled: true
    severity: high         # 이 심각도 이상만 보고

  security_review:
    enabled: true
    checks:                # 활성화할 체크 항목
      - injection
      - secrets
      - auth_bypass

  test:
    enabled: true
    suggest: true

  commit:
    enabled: true
    format: conventional
    auto: false            # 제안만 (자동 커밋 아님)

  docs:
    enabled: true
    suggest: true
```

> Phase 1 한계: 각 기능의 `enabled` 토글만 동작. `severity`, `checks`, `command`, `format`, `auto`, `suggest` 등 세부 설정은 Phase 2에서 구현 예정. 현재는 하드코딩된 기본값을 사용.

---

## 11. 비용

| 항목 | 비용 | 지연 |
|------|------|------|
| 코드 리뷰 (Haiku) | ~$0.001 | ~3-5초 |
| 보안 검토 (Haiku) | ~$0.001 | ~3-5초 |
| 1단계 총 비용 | ~$0.002 | ~6-10초 (순차) |
| 2-4단계 | $0 | <1ms (Haiku 미호출) |

디바운싱이 동작하면 연속 편집에서 1회만 과금.

---

## 12. 제약사항

- **PostToolUse는 차단 불가**: 코드는 이미 작성된 상태. 수정 지시만 가능
- **체이닝 정체**: Write/Edit 없이 작업하면 (Bash만) 다음 단계로 안 넘어감 → 새 프롬프트 시 리셋으로 해소
- **코드 200줄 제한**: 긴 파일은 잘림. 불완전한 코드 분석 가능
- **경로 기반 문서 판단**: false positive 가능 (Phase 1 수준)
- **순차 Haiku 호출**: 1단계에서 ~6-10초 지연. 타임아웃 30초 내 동작
