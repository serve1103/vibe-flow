---
name: interview
description: |
  기획 단계에서 누락된 정보를 찾아 질문을 생성한다.
  프로젝트 상태를 분석하여 설계 문서 필요 여부를 판단한다.
  /devflow:interview로 수동 호출 가능.
next-skill: critical-review
handoff: .devflow/results/interview.json
---

# 스마트 인터뷰

## 전제 조건
- 없음 (첫 스킬)

## 절차
1. CLAUDE.md에서 프로젝트 컨텍스트 수집
2. docs/ 디렉토리에서 기존 설계 문서 확인
3. 사용자 요청에서 빠진 정보 식별
4. 최대 5-6개 질문 생성
5. 질문을 사용자에게 제시
6. .devflow/results/interview.json에 결과 저장:
   ```json
   {"timestamp": ..., "topic": "주제", "questions": [...], "answers": [...]}
   ```

## 질문 생성 규칙
- 프로젝트 컨텍스트(CLAUDE.md, docs/)에서 이미 알 수 있는 정보는 질문하지 않음
- 구현에 필수적인 결정사항만 질문 (nice-to-have 제외)

## 완료 후
다음 스킬: Skill("devflow:critical-review")

## 참조
- references/question-patterns.md: 질문 생성 패턴
