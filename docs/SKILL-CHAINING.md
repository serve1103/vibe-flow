# DevFlow Phase 4: 스킬 자율 체이닝

> 상태: 설계 (핵심 가정 검증 완료)
> 의존: Phase 2 (스킬 모듈화) + Phase 3 (자가 학습) 완료 후 진행
> 핵심: 훅 chain-step 제거 → 스킬이 Skill 도구로 다음 스킬 호출 + 아티팩트 기반 전제조건

### PoC 검증 결과 (2026-03-27)

| 가정 | 결과 | 비고 |
|------|------|------|
| Skill 도구로 다른 스킬 호출 | **검증 완료** ✓ | test-ping → Skill("test-pong") 체이닝 성공, 3턴 |
| Agent 도구로 model:haiku 소환 | **검증 완료** ✓ | Haiku 에이전트 소환 + 응답 수신 확인 |
| 에이전트 등록 없이 model 지정 | **검증 완료** ✓ | plugin.json agents 없이도 model:"haiku" 동작 |

Skill 체이닝 실측:
```
/test-ping 실행
  → Claude가 Skill 도구로 test-pong 호출
  → test-pong 응답: "pong 응답 완료"
  → 3턴, ~11초
```

Haiku 에이전트 실측:
```
Agent(model:"haiku", prompt:"1+1은?")
  → Haiku 응답: "2"
  → 본체: $0.10 + Haiku: $0.04
  → 2턴, ~9초
```

> 참고: agents/ 등록 없이도 Agent 도구의 model 파라미터만으로 Haiku 소환이 가능함. 비판적 검토의 C2(에이전트 등록 필수) 가정은 오류였음. 다만, 전용 에이전트(reviewer.md)를 등록하면 프롬프트를 재사용할 수 있어 일관성 향상.

---

## 1. 목표

훅의 chain-step 상태 관리를 제거하고, 스킬이 자율적으로 체이닝한다.

```
Phase 2: 훅이 chain-step으로 "다음 스킬 프롬프트 주입" (결정론적)
Phase 4: 스킬이 Skill 도구로 "다음 스킬 직접 호출" (자율적)
```

---

## 2. 전제조건

Phase 4 진행 전 검증 필요:

- [ ] Phase 2 스킬 모듈화가 안정적으로 동작
- [ ] Phase 3 자가 학습이 스킬 품질을 실제로 개선
- [x] Skill 도구로 스킬 간 호출이 동작하는지 확인 (2026-03-27 검증)
- [x] Agent 도구로 model:haiku 소환이 동작하는지 확인 (2026-03-27 검증)
- [ ] 훅 chain-step 제거 시 체이닝 안정성 검증

---

## 3. 아키텍처

### 3.1 Phase 2 (현재) vs Phase 4 (목표)

```
Phase 2:
  훅 → chain-step 확인 → SKILL.md 프롬프트 로드 → Haiku에 전달 → 결과 주입
  훅 → chain-step++ → 다음 스킬 프롬프트 로드 → ...

Phase 4:
  훅 → "coding-workflow 스킬을 실행하세요" (1회 주입)
  스킬 → Skill("devflow:code-review") → Skill("devflow:security-check") → ...
  각 스킬 → Task(model="haiku")로 분석 위임
```

### 3.2 구성 요소

```
hooks/
  devflow-code.js          # 얇은 라우터 (워크플로우 시작만 트리거)
  devflow-prompt.js        # 모드 판단 (기존 유지)

skills/
  coding-workflow/         # 마스터 워크플로우 스킬
    SKILL.md
  planning-workflow/       # 기획 워크플로우 스킬
    SKILL.md
  code-review/             # 개별 스킬 (Phase 2에서 이미 존재)
    SKILL.md
  ...

agents/                    # 에이전트 정의 (신규)
  reviewer.md              # 코드 리뷰 에이전트 (Haiku)
  security-reviewer.md     # 보안 검토 에이전트 (Haiku)

.devflow/
  results/                 # 아티팩트 (스킬 간 컨텍스트 전달)
```

---

## 4. 에이전트 등록

### 4.1 에이전트 파일

```markdown
<!-- agents/reviewer.md -->
---
name: reviewer
description: 코드 변경을 리뷰하고 high 이상 이슈를 JSON으로 보고
model: haiku
---

다음 코드 변경을 리뷰하세요. high 이상 심각도의 문제만 보고하세요.

심각도 기준:
- critical: 즉시 장애 (null 참조, 무한 루프, 데이터 손실)
- high: 잠재적 버그 (에러 핸들링 누락, 레이스 컨디션)

JSON으로만 응답:
문제없음: {"issues":[]}
문제있음: {"issues":[{"severity":"high","description":"설명","suggestion":"제안"}]}
```

```markdown
<!-- agents/security-reviewer.md -->
---
name: security-reviewer
description: 코드에서 보안 취약점을 검출하고 JSON으로 보고
model: haiku
---

다음 코드에서 보안 취약점을 체크하세요.
체크 항목: SQL injection, 하드코딩된 시크릿/API키, 경로 탐색, 인증 우회

JSON으로만 응답:
안전: {"safe":true}
취약점: {"safe":false,"issues":[{"severity":"critical","description":"설명"}]}
```

### 4.2 plugin.json 등록

```json
{
  "name": "devflow",
  "version": "0.4.0",
  "skills": "./skills/",
  "agents": [
    "./agents/reviewer.md",
    "./agents/security-reviewer.md"
  ],
  "hooks": "./hooks/hooks.json"
}
```

---

## 5. 스킬 체이닝 — 3중 보강

### 5.1 워크플로우 마스터 스킬 (전체 순서)

```markdown
<!-- skills/coding-workflow/SKILL.md -->
---
name: coding-workflow
description: |
  코드 변경 시 자동 실행되는 개발 워크플로우.
  훅이 이 스킬을 호출합니다. 사용자가 직접 호출하지 마세요.
---

# 개발 워크플로우

## 실행 순서 (모든 단계를 반드시 순서대로 실행)

1. Skill("devflow:code-review") 실행
2. Skill("devflow:security-check") 실행
3. Skill("devflow:test-suggest") 실행
4. Skill("devflow:doc-update") 실행 — API/스키마 변경 시만
5. Skill("devflow:commit") 실행

## 규칙
- 각 스킬을 Skill 도구로 호출하세요. 직접 수행하지 마세요.
- 스킬 완료 후 .devflow/results/에 결과 파일이 생성되었는지 확인하세요.
- 결과 파일이 없으면 해당 스킬을 다시 호출하세요.
- 모든 단계 완료 후 종료하세요.
```

### 5.2 개별 스킬의 next-skill 안내

```markdown
<!-- skills/code-review/SKILL.md -->
---
name: code-review
description: |
  코드 리뷰를 수행한다. /devflow:code-review로 수동 호출 가능.
next-skill: security-check
handoff: .devflow/results/code-review.json
---

# 코드 리뷰

## 전제 조건
- 없음 (첫 스킬)

## 절차
1. 변경된 코드를 수집 (Read 도구)
2. Task(subagent_type="devflow:reviewer", model="haiku") 소환
   - 변경된 코드를 프롬프트에 포함
   - 리뷰 결과 JSON 수신
3. 결과 분석 — high 이상 이슈가 있으면 수정
4. .devflow/results/code-review.json에 결과 저장

## 완료 후
다음 스킬: Skill("devflow:security-check")
```

### 5.3 아티팩트 기반 전제조건

```markdown
<!-- skills/security-check/SKILL.md -->
---
name: security-check
description: |
  보안 검토를 수행한다. /devflow:security-check로 수동 호출 가능.
next-skill: test-suggest
handoff: .devflow/results/security-check.json
---

# 보안 검토

## 전제 조건
- .devflow/results/code-review.json을 Read로 확인하세요.
- 파일이 없으면 Skill("devflow:code-review")를 먼저 실행하세요.

## 절차
1. 변경된 코드를 수집
2. Task(subagent_type="devflow:security-reviewer", model="haiku") 소환
3. 결과 분석 — critical/high 이슈가 있으면 수정
4. .devflow/results/security-check.json에 결과 저장

## 완료 후
다음 스킬: Skill("devflow:test-suggest")
```

---

## 6. 훅 변경 — 얇은 라우터

### devflow-code.js (Phase 4)

```
Write/Edit 감지
  ↓ cleanup + 디바운싱
  ↓ .devflow/results/ 클리어 (새 사이클 시작)
  ↓ additionalContext: "Skill(\"devflow:coding-workflow\")를 실행하세요"
```

chain-step 로직 완전 제거. 훅은 워크플로우 시작만 트리거.

### devflow-prompt.js (Phase 4)

```
프롬프트 입력
  ↓ 모드 판단 (Haiku)
  ↓ 기획 모드 → additionalContext: "Skill(\"devflow:planning-workflow\")를 실행하세요"
  ↓ 개발 모드 → 통과
```

---

## 7. 아티팩트 라이프사이클

### 7.1 생성

각 스킬이 완료 시 `.devflow/results/{skill-name}.json`에 결과 저장:

```json
// .devflow/results/code-review.json
{
  "timestamp": 1711500000,
  "files_reviewed": ["src/auth.ts", "src/routes/login.ts"],
  "issues": [],
  "passed": true
}
```

### 7.2 무효화

훅이 새 Write/Edit를 감지하면 `.devflow/results/`를 클리어:

```javascript
// devflow-code.js
const resultsDir = path.join(devflowDir, 'results');
if (fs.existsSync(resultsDir)) {
  const files = fs.readdirSync(resultsDir);
  for (const f of files) fs.unlinkSync(path.join(resultsDir, f));
}
```

### 7.3 전제조건 검사

다음 스킬이 이전 스킬의 결과 파일을 Read로 확인:
- 있으면 → 진행
- 없으면 → 이전 스킬 호출

---

## 8. 폴백 전략

| 실패 시나리오 | 대응 |
|--------------|------|
| Skill 도구 호출 실패 | SKILL.md에 "실패 시 직접 수행" 지시 포함 |
| Task(haiku) 타임아웃 | Claude 본체가 직접 리뷰 (고비용이지만 동작) |
| 아티팩트 미생성 | 워크플로우 스킬이 재시도 1회 후 스킵 |
| 체이닝 중단 | 다음 프롬프트에서 훅이 워크플로우 재시작 |
| Phase 4 불안정 | plugin.json에서 agents 제거 → Phase 2 모드로 즉시 롤백 |

---

## 9. 마이그레이션 (Phase 2 → Phase 4)

### 전제: Phase 2, 3이 안정적으로 동작한 이후

1. `agents/` 디렉토리 생성, reviewer.md + security-reviewer.md 작성
2. `plugin.json`에 `"agents"` 필드 추가
3. `skills/coding-workflow/SKILL.md` 작성 (Skill 도구 체이닝)
4. `skills/planning-workflow/SKILL.md` 작성
5. 각 개별 스킬 SKILL.md에 Task 위임 + next-skill + 전제조건 추가
6. `devflow-code.js`에서 chain-step 로직 제거 → 워크플로우 스킬 호출로 교체
7. `.devflow/results/` 클리어 로직 추가
8. 테스트: 자동 체이닝 + 수동 호출 + 폴백 검증
9. Phase 2 폴백 코드는 제거하지 않고 비활성화 (롤백용)

### 롤백

- `plugin.json`에서 `"agents"` 필드 제거
- `devflow-code.js`에서 chain-step 로직 재활성화
- 즉시 Phase 2 모드로 복원

---

## 10. 비용

| 항목 | Phase 2 | Phase 4 |
|------|---------|---------|
| 기획 모드 판단 | ~$0.001-0.002 (Haiku execSync) | ~$0.001-0.002 (Haiku execSync) |
| 코드 리뷰 | ~$0.001-0.002 (Haiku execSync) | ~$0.001-0.002 (Haiku Task) |
| 보안 검토 | ~$0.001-0.002 (Haiku execSync) | ~$0.001-0.002 (Haiku Task) |
| 오버헤드 | 없음 | Task 세션 초기화 비용 (미미) |

Haiku 호출 횟수는 동일. Task 오버헤드는 시스템 프롬프트 로딩 정도.

---

## 11. 제약 사항

- **Skill 도구 의존**: Claude가 Skill 도구를 호출하지 않으면 체이닝 중단. 워크플로우 스킬의 프롬프트 품질이 핵심
- **에이전트 등록 필수**: plugin.json에 agents 배열로 명시적 등록 필요. 디렉토리 경로는 거부됨
- **아티팩트 경쟁**: 동시 세션에서 같은 `.devflow/results/` 사용 시 경쟁 조건
- **Phase 2 검증 선행**: Phase 2가 안정적이지 않으면 Phase 4 진행 불가
- **비용 불확실성**: Task로 Haiku 소환 시 세션 초기화 오버헤드가 execSync보다 클 수 있음. 실측 필요

---

## 12. Phase 로드맵 최종

```
Phase 1 (v0.2, 현재): 훅 기반 자동화
  ✓ 기획 모드 + 개발 모드
  ✓ 4단계 체이닝
  ✓ 자원 관리

Phase 2 (v0.3): 스킬 모듈화
  → 하드코딩 프롬프트 → SKILL.md 분리
  → references/ + examples/ 품질 향상
  → 수동 호출 지원
  → 세부 설정 활성화

Phase 3 (v0.4): 자가 학습
  → PostToolUse async 관찰
  → Stop 훅 transcript 분석
  → 학습 규칙 자동 갱신

Phase 4 (v0.5): 스킬 자율 체이닝
  → agents/ 등록 (Haiku 에이전트)
  → Skill 도구로 스킬 간 호출
  → Task 도구로 Haiku 위임
  → 아티팩트 기반 전제조건
  → 훅 chain-step 제거
```
