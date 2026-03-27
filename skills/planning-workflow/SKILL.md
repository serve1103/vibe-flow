---
name: planning-workflow
description: |
  기획이 필요한 작업에서 자동 실행되는 기획 워크플로우.
  훅이 이 스킬을 호출합니다. 사용자가 직접 호출하지 마세요.
---

# 기획 워크플로우

## 실행 순서 (모든 단계를 반드시 순서대로 실행)

1. Skill("devflow:interview") 실행 — 누락된 정보 질문
2. Skill("devflow:critical-review") 실행 — 비판적 검토
3. Skill("devflow:doc-update") 실행 — docs/에 설계 문서 작성

## 규칙
- 각 스킬을 Skill 도구로 호출하세요. 직접 수행하지 마세요.
- 사용자의 답변을 받은 후 다음 단계로 진행하세요.
- 설계 문서 작성 후 "구현할까요?"라고 확인하세요.
