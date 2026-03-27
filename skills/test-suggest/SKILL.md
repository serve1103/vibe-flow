---
name: test-suggest
description: |
  변경된 코드에 대한 테스트 작성을 제안한다.
  /devflow:test-suggest로 수동 호출 가능.
next-skill: doc-update
handoff: .devflow/results/test-suggest.json
---

# 테스트 제안

## 전제 조건
- .devflow/results/security-check.json을 Read로 확인하세요.
- 파일이 없으면 Skill("devflow:security-check")를 먼저 실행하세요.

## 절차
1. 변경된 코드와 이전 스킬 결과를 확인
2. 변경된 함수/모듈에 대한 단위 테스트 작성
3. 기존 테스트 프레임워크가 있으면 그것을 사용
4. 테스트 작성 후 실행하여 통과 확인
5. .devflow/results/test-suggest.json에 결과 저장:
   ```json
   {"timestamp": ..., "tests_written": ["파일1", "파일2"]}
   ```

## 완료 후
다음 스킬: Skill("devflow:doc-update")
