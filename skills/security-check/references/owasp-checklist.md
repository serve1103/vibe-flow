# OWASP 기반 보안 체크리스트

| 항목 | 설명 | 예시 |
|------|------|------|
| injection | SQL/NoSQL/OS 명령어 인젝션 | 문자열 연결로 쿼리 구성 |
| secrets | 하드코딩된 시크릿/API 키 | `const key = "sk-live-..."` |
| auth_bypass | 인증/권한 우회 가능성 | 토큰 검증 없는 엔드포인트 |
| data_exposure | 민감 데이터 노출 | 에러 메시지에 스택트레이스 |
| crypto | 안전하지 않은 암호화 | MD5, SHA1 사용 |
| path_traversal | 경로 탐색 공격 | `../` 필터링 없는 파일 접근 |

기본 체크: injection, secrets, auth_bypass, path_traversal
