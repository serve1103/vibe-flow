---
name: doc-update
description: |
  코드 변경에 따른 문서 갱신을 제안한다.
  /devflow:doc-update로 수동 호출 가능.
next-skill: commit
handoff: .devflow/results/doc-update.json
---

# 문서 갱신

## 전제 조건
- .devflow/results/test-suggest.json을 Read로 확인하세요.
- 파일이 없으면 Skill("devflow:test-suggest")를 먼저 실행하세요.

## 판단 기준
- API 관련 코드 변경 (route, api, endpoint, controller) → API 문서 갱신
- 데이터 모델 변경 (schema, model, migration, table) → 모델/스키마 문서 갱신
- 위에 해당하지 않으면 → 문서 갱신 불필요, 바로 다음 스킬로 이동

## 절차
1. 변경된 파일 경로를 확인
2. 판단 기준에 따라 문서 갱신 필요 여부 결정
3. 필요하면 관련 문서 갱신
4. .devflow/results/doc-update.json에 결과 저장:
   ```json
   {"timestamp": ..., "updated_files": ["docs/API.md"], "skipped": false}
   ```

## 완료 후
다음 스킬: Skill("devflow:commit")
