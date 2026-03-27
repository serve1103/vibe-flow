---
name: commit
description: |
  Conventional Commits 형식으로 커밋을 제안한다.
  /devflow:commit으로 수동 호출 가능.
---

# 커밋 제안

## 전제 조건
- .devflow/results/doc-update.json 또는 .devflow/results/test-suggest.json을 Read로 확인하세요.
- 이전 단계가 완료되었는지 확인.

## 절차
1. 모든 변경 사항을 git status로 확인
2. Conventional Commits 형식으로 커밋 메시지 생성
3. 커밋을 제안 (자동 커밋하지 않고 사용자 확인 후 커밋)
4. .devflow/results/commit.json에 결과 저장:
   ```json
   {"timestamp": ..., "commit_message": "feat: ..."}
   ```

## Conventional Commits 형식
- feat: 새 기능
- fix: 버그 수정
- refactor: 리팩토링
- docs: 문서 변경
- test: 테스트
- chore: 빌드/설정

## 참조
- references/conventional-commits.md: 상세 형식

## 완료
이 스킬이 마지막입니다. 워크플로우 종료.
