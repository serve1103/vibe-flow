# Vibe Flow - 블록 정의 스펙

> 작성일: 2026-03-22
> 상태: Draft
> 스키마 버전: 1.0

---

## 1. 블록이란

블록(Block)은 Vibe Flow의 핵심 단위로, **개인의 AI 작업 방식을 YAML로 캡슐화한 재사용 가능한 템플릿**이다. 기본 개인 소유이며 팀에 공유 선택 가능.

하나의 블록에는 다음이 포함된다:
- 프롬프트 템플릿 (무엇을 어떻게 요청할지)
- 모델 설정 (어떤 AI 모델을 사용할지)
- 품질 게이트 (결과를 어떻게 검증할지)
- 컨벤션 (팀 규칙을 어떻게 적용할지)
- 메타데이터 (분류, 난이도, 예상 비용 등)

---

## 2. 블록 YAML 포맷

### 2.1 전체 구조

```yaml
# 블록 정의 파일 (.block.yaml)
schema_version: "1.0"

# 기본 정보
name: "DB 스키마 설계"
slug: "db-schema-design"
description: "서비스의 데이터베이스 스키마를 설계합니다. PostgreSQL 기반."
category: "database"
tags: ["database", "schema", "postgresql", "design"]

# 프롬프트 템플릿
prompt:
  system: |
    당신은 PostgreSQL 데이터베이스 설계 전문가입니다.
    다음 규칙을 반드시 따르세요:
    {{conventions}}
  template: |
    다음 서비스의 데이터베이스 스키마를 설계해주세요.

    서비스: {{service_name}}
    주요 기능: {{features}}
    {{#if additional_context}}
    추가 맥락: {{additional_context}}
    {{/if}}

    요구사항:
    - CREATE TABLE 문을 포함할 것
    - 인덱스를 포함할 것
    - 외래 키 관계를 명시할 것
    - 각 테이블에 대한 설명 주석을 포함할 것
  variables:
    - name: service_name
      type: string
      required: true
      description: "설계할 서비스의 이름"
    - name: features
      type: string
      required: true
      description: "서비스의 주요 기능 목록"
    - name: additional_context
      type: string
      required: false
      description: "추가 맥락 (기존 스키마, 제약사항 등)"
  output_format: sql

# 모델 설정
model:
  id: "claude-opus-4-6"
  temperature: 0.3
  max_tokens: 8000

# 품질 게이트
quality_gates:
  - name: "SQL 문법 확인"
    type: contains
    criteria:
      values: ["CREATE TABLE", "PRIMARY KEY"]
    fail_action: retry

  - name: "인덱스 포함 확인"
    type: regex
    criteria:
      pattern: "CREATE\\s+INDEX"
    fail_action: warn

  - name: "외래 키 관계 확인"
    type: regex
    criteria:
      pattern: "REFERENCES\\s+\\w+"
    fail_action: retry

  - name: "설계 품질 검증"
    type: custom_prompt
    criteria:
      prompt: |
        다음 SQL 스키마를 검토하고 아래 기준으로 평가해주세요:
        1. 정규화가 적절한가? (최소 3NF)
        2. 인덱스가 주요 쿼리 패턴을 커버하는가?
        3. 외래 키 관계가 올바른가?
        4. 보안 관련 필드(비밀번호 등)가 적절히 처리되는가?

        PASS 또는 FAIL로 답하고 이유를 설명하세요.
      pass_pattern: "PASS"
    fail_action: retry

# 팀 컨벤션
conventions:
  - name: "테이블 네이밍"
    description: "snake_case 사용, 복수형 (users, orders)"
    examples:
      - "users (O), User (X)"
      - "order_items (O), orderItems (X)"

  - name: "타임스탬프"
    description: "모든 테이블에 created_at, updated_at 포함"
    examples:
      - "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"

  - name: "소프트 삭제"
    description: "삭제가 필요한 테이블은 deleted_at 사용"
    examples:
      - "deleted_at TIMESTAMPTZ DEFAULT NULL"

  - name: "ID 전략"
    description: "UUID v7 사용 (시간 순서 보장)"
    examples:
      - "id UUID PRIMARY KEY DEFAULT gen_random_uuid()"

# 메타데이터
metadata:
  difficulty: medium
  estimated_duration_seconds: 120
  estimated_tokens: 5000
  trigger_phrases:
    - "DB 설계"
    - "데이터베이스 스키마"
    - "테이블 설계"
    - "ERD 만들어"
  author: "han"
  created_at: "2026-03-22T10:00:00Z"
  updated_at: "2026-03-22T10:00:00Z"

# 자가 회복 설정
retry:
  max_attempts: 3
  strategies:
    - prompt_enhancement    # 실패 피드백을 프롬프트에 포함
    - model_upgrade         # Sonnet → Opus 업그레이드
  max_cost_multiplier: 2.0  # 원본 비용의 최대 2배까지
```

---

## 3. 필드 상세 스펙

### 3.1 prompt (프롬프트)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `system` | string | N | 시스템 프롬프트. `{{conventions}}`로 컨벤션 자동 주입 |
| `template` | string | Y | 사용자 프롬프트 템플릿. `{{변수명}}`으로 변수 참조 |
| `variables` | Variable[] | Y | 템플릿에 사용되는 변수 목록 |
| `output_format` | string | N | 기대 출력 형식: `text`, `json`, `sql`, `code`, `markdown` |

**Variable 스펙:**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `name` | string | Y | 변수명 (snake_case) |
| `type` | string | Y | `string`, `number`, `boolean`, `array`, `json` |
| `required` | boolean | Y | 필수 입력 여부 |
| `default` | any | N | 기본값 |
| `description` | string | Y | 사용자에게 보여줄 설명 |
| `enum` | any[] | N | 허용 값 목록 |

### 3.2 model (모델 설정)

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `id` | string | N | `claude-sonnet-4-6` | 모델 ID |
| `temperature` | number | N | 0.5 | 0.0 ~ 1.0 |
| `max_tokens` | number | N | 4000 | 최대 출력 토큰 |

### 3.3 quality_gates (품질 게이트)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `name` | string | Y | 게이트 이름 (로깅/분석용) |
| `type` | enum | Y | 게이트 유형 (아래 참조) |
| `criteria` | object | Y | 유형별 검증 기준 |
| `fail_action` | enum | Y | 실패 시 동작: `retry`, `warn`, `block` |

**게이트 유형:**

| type | criteria 필드 | 설명 |
|------|--------------|------|
| `contains` | `values: string[]` | 산출물에 특정 문자열 포함 여부 |
| `regex` | `pattern: string` | 정규식 매칭 |
| `json_schema` | `schema: object` | JSON 산출물의 스키마 검증 |
| `length` | `min?: number, max?: number` | 산출물 길이 검증 |
| `code_parseable` | `language: string` | 코드 파싱 가능 여부 |
| `custom_prompt` | `prompt: string, pass_pattern: string` | AI에게 검증 요청 |

**fail_action:**

| 값 | 동작 |
|---|------|
| `retry` | 품질 게이트 실패 시 자가 회복 시도 |
| `warn` | 경고 로그만 남기고 결과 반환 |
| `block` | 실행 중단, 사용자에게 실패 알림 |

### 3.4 conventions (컨벤션)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `name` | string | Y | 컨벤션 이름 |
| `description` | string | Y | 규칙 설명 |
| `examples` | string[] | N | 올바른 예시 |

### 3.5 metadata (메타데이터)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `difficulty` | enum | N | `easy`, `medium`, `hard` |
| `estimated_duration_seconds` | number | N | 예상 실행 시간 (초) |
| `estimated_tokens` | number | N | 예상 토큰 사용량 |
| `trigger_phrases` | string[] | N | 매칭 엔진 트리거 문구 |
| `author` | string | N | 생성자 |
| `created_at` | string | N | ISO 8601 |
| `updated_at` | string | N | ISO 8601 |

### 3.6 retry (재시도 설정)

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `max_attempts` | number | N | 2 | 최대 재시도 횟수 |
| `strategies` | enum[] | N | `["prompt_enhancement"]` | 재시도 전략 |
| `max_cost_multiplier` | number | N | 2.0 | 원본 대비 최대 비용 배수 |

**재시도 전략:**

| strategy | 설명 |
|----------|------|
| `prompt_enhancement` | 실패 피드백을 프롬프트에 추가하여 재실행 |
| `model_upgrade` | 더 강력한 모델로 업그레이드 (Sonnet → Opus) |
| `prompt_restructure` | 프롬프트를 하위 단계로 분할하여 순차 실행 |

### 3.7 소유/공유 (메타데이터 외 — DB 레벨 관리)

블록의 소유권과 공유 범위는 YAML이 아닌 DB 레벨에서 관리된다:
- `owner_id`: 블록 생성자 (개인)
- `visibility`: `private` (기본, 본인만 사용) | `shared` (팀 전체에 공유)

YAML 임포트/엑스포트 시 소유/공유 정보는 포함되지 않으며, DB에서 별도 관리.

---

## 4. 추가 블록 예시

### 4.1 API 엔드포인트 설계

```yaml
schema_version: "1.0"
name: "REST API 설계"
slug: "rest-api-design"
description: "RESTful API 엔드포인트를 설계합니다. OpenAPI 스펙 출력."
category: "api"
tags: ["api", "rest", "openapi", "design"]

prompt:
  system: |
    당신은 REST API 설계 전문가입니다.
    OpenAPI 3.0 스펙 형식으로 출력합니다.
    {{conventions}}
  template: |
    다음 기능의 REST API를 설계해주세요.

    서비스: {{service_name}}
    기능: {{feature_description}}
    인증 방식: {{auth_method}}

    다음을 포함해주세요:
    - 엔드포인트 목록 (method, path, 설명)
    - 요청/응답 스키마
    - 에러 응답 형식
    - 페이지네이션 (목록 API인 경우)
  variables:
    - name: service_name
      type: string
      required: true
      description: "서비스 이름"
    - name: feature_description
      type: string
      required: true
      description: "구현할 기능 설명"
    - name: auth_method
      type: string
      required: false
      default: "JWT Bearer"
      description: "인증 방식"
      enum: ["JWT Bearer", "API Key", "OAuth 2.0", "Session"]
  output_format: json

model:
  id: "claude-sonnet-4-6"
  temperature: 0.3
  max_tokens: 6000

quality_gates:
  - name: "OpenAPI 구조 확인"
    type: contains
    criteria:
      values: ["paths", "components"]
    fail_action: retry

  - name: "에러 응답 포함"
    type: regex
    criteria:
      pattern: "[45]\\d{2}"
    fail_action: warn

  - name: "JSON 유효성"
    type: code_parseable
    criteria:
      language: "json"
    fail_action: retry

conventions:
  - name: "URL 네이밍"
    description: "kebab-case, 복수형 리소스"
    examples:
      - "/api/v1/order-items (O)"
      - "/api/v1/orderItem (X)"
  - name: "에러 형식"
    description: "RFC 7807 Problem Details"
    examples:
      - '{"type": "...", "title": "...", "status": 400, "detail": "..."}'

metadata:
  difficulty: medium
  estimated_tokens: 4000
  trigger_phrases:
    - "API 설계"
    - "엔드포인트 설계"
    - "REST API 만들어"
    - "API 스펙"
```

### 4.2 코드 리뷰

```yaml
schema_version: "1.0"
name: "코드 리뷰"
slug: "code-review"
description: "코드를 리뷰하고 개선 사항을 제안합니다."
category: "review"
tags: ["review", "quality", "security"]

prompt:
  system: |
    당신은 시니어 코드 리뷰어입니다. 건설적이고 구체적인 피드백을 제공합니다.
    {{conventions}}
  template: |
    다음 코드를 리뷰해주세요.

    파일: {{file_path}}
    언어: {{language}}
    맥락: {{context}}

    리뷰 기준:
    1. 버그 및 논리 오류
    2. 보안 취약점 (OWASP Top 10)
    3. 성능 이슈
    4. 가독성 및 유지보수성
    5. 팀 컨벤션 준수 여부

    각 항목에 대해 구체적인 라인 번호와 개선 제안을 포함해주세요.
  variables:
    - name: file_path
      type: string
      required: true
      description: "리뷰할 파일 경로"
    - name: language
      type: string
      required: false
      default: "auto-detect"
      description: "프로그래밍 언어"
    - name: context
      type: string
      required: false
      description: "코드의 맥락 (PR 설명, 변경 이유 등)"
  output_format: markdown

model:
  id: "claude-opus-4-6"
  temperature: 0.2
  max_tokens: 4000

quality_gates:
  - name: "구체적 피드백 확인"
    type: regex
    criteria:
      pattern: "라인|line|Line"
    fail_action: warn

  - name: "보안 섹션 포함"
    type: contains
    criteria:
      values: ["보안", "security"]
    fail_action: warn

metadata:
  difficulty: easy
  estimated_tokens: 3000
  trigger_phrases:
    - "코드 리뷰"
    - "리뷰해줘"
    - "코드 검토"
    - "PR 리뷰"
```

---

## 5. 블록 생명주기

```
  draft → active → archived
    │        │
    │        └─ 수정 시 자동 버전 생성
    │           (이전 YAML 스냅샷 보존)
    │
    └─ 테스트 통과 전까지 draft 유지

상태 설명:
  draft:    생성 중 또는 테스트 미통과. 다른 팀원에게 노출되지 않음 (private 상태).
  active:   팀에서 사용 가능. 매칭 엔진에 등록됨.
  archived: 더 이상 사용하지 않음. 매칭에서 제외되지만 기록은 보존.
```

---

## 6. 버전 관리

블록이 수정될 때마다 자동으로 이전 버전이 스냅샷된다.

```
v1 → v2 → v3 (현재)

각 버전에 저장되는 것:
  - 전체 definition_yaml
  - 변경 로그 (changelog)
  - 변경자 (created_by)
  - 변경 시점 (created_at)

롤백: 특정 버전의 YAML로 현재 블록을 덮어쓰기 (새 버전으로 기록)
비교: 두 버전 간 YAML 텍스트 diff
```
