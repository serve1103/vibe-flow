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
- 어떤 단계도 스킵하지 마세요.
