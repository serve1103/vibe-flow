---
name: critical-review
description: |
  작업의 잠재적 문제점, 위험, 고려사항을 분석한다.
  /devflow:critical-review로 수동 호출 가능.
next-skill: doc-update
handoff: .devflow/results/critical-review.json
---

# 비판적 검토

## 전제 조건
- .devflow/results/interview.json을 Read로 확인하세요.
- 파일이 없으면 Skill("devflow:interview")를 먼저 실행하세요.

## 절차
1. 인터뷰 결과(.devflow/results/interview.json)를 읽기
2. 기술적/보안/설계 리스크 분석
3. 누락된 edge case 식별
4. 구체적 대안과 함께 우려사항 제시
5. .devflow/results/critical-review.json에 결과 저장:
   ```json
   {"timestamp": ..., "concerns": [...], "recommendations": [...]}
   ```

## 검토 기준
- 기술적 리스크: 복잡도, 성능, 확장성
- 보안 리스크: 인증, 데이터 보호, 규정 준수
- 설계 리스크: 기존 시스템과의 충돌, 의존성
- 누락된 edge case

## 완료 후
다음 스킬: Skill("devflow:doc-update")
