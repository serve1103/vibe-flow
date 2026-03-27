---
name: security-check
description: |
  코드에서 보안 취약점을 검출한다.
  /devflow:security-check로 수동 호출 가능.
next-skill: test-suggest
handoff: .devflow/results/security-check.json
---

# 보안 검토

## 전제 조건
- .devflow/results/code-review.json을 Read로 확인하세요.
- 파일이 없으면 Skill("devflow:code-review")를 먼저 실행하세요.

## 절차
1. 변경된 코드를 확인
2. Agent 도구를 사용하여 Haiku 에이전트로 보안 검토 위임:
   - model: haiku
   - "다음 코드에서 보안 취약점을 체크하세요. JSON으로 응답."
3. 결과 분석 — critical/high 이슈가 있으면 수정
4. .devflow/results/security-check.json에 결과 저장:
   ```json
   {"timestamp": ..., "safe": true, "issues": [...]}
   ```

## 제약 사항
- 보안 스킬은 학습 규칙(learned-rules)이 적용되지 않음
- false positive라도 보고 (보안은 보수적으로)

## 완료 후
다음 스킬: Skill("devflow:test-suggest")

## 참조
- references/owasp-checklist.md: 보안 체크리스트
