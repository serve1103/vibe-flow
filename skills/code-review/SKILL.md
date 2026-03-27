---
name: code-review
description: |
  코드 리뷰를 수행한다. 변경된 코드의 버그, 로직 오류, 설계 문제를 검출한다.
  /devflow:code-review로 수동 호출 가능.
next-skill: security-check
handoff: .devflow/results/code-review.json
---

# 코드 리뷰

## 전제 조건
- 없음 (첫 스킬)

## 절차
1. 변경된 코드를 확인 (Read 도구)
2. Agent 도구를 사용하여 Haiku 에이전트로 리뷰 위임:
   - model: haiku
   - prompt에 변경된 코드를 포함
   - "다음 코드를 리뷰하세요. high 이상만 보고. JSON으로 응답."
3. 리뷰 결과를 분석 — high 이상 이슈가 있으면 수정
4. .devflow/results/code-review.json에 결과 저장:
   ```json
   {"timestamp": ..., "issues": [...], "passed": true}
   ```

## 제약 사항
- medium/low 심각도는 보고하지 않음
- 스타일/포맷팅 이슈는 무시
- 프로젝트의 기존 패턴을 존중

## 완료 후
다음 스킬: Skill("devflow:security-check")

## 참조
- references/severity-guide.md: 심각도 기준

## 학습된 규칙
이 프로젝트의 학습된 규칙은 .devflow/learned-rules/code-review.json에 있습니다.
리뷰 전에 이 파일을 Read로 확인하고, 해당 패턴은 리뷰에서 제외하세요.
