---
name: doc-update
description: |
  코드 변경에 따른 문서 갱신을 제안한다.
  /devflow:doc-update로 수동 호출 가능.
---

# 문서 갱신

변경된 코드와 관련된 문서를 갱신하세요.

## 판단 기준
- API 관련 코드 변경 (route, api, endpoint, controller) → API 문서 갱신
- 데이터 모델 변경 (schema, model, migration, table) → 모델/스키마 문서 갱신
- 위에 해당하지 않으면 문서 갱신 불필요

## 규칙
- 기존 문서 형식을 따를 것
- 변경 사항만 반영 (전체 재작성 금지)
