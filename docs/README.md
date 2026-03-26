# Vibe Flow Documentation

> 바이브코딩의 재현 불가능성을 "블록"이라는 표준 단위로 해결하고,
> 팀원은 어디서든 대화만으로 그 표준을 실행하는 플랫폼.

## 문서 목록

| 문서 | 내용 |
|------|------|
| [CONCEPT.md](./CONCEPT.md) | 프로젝트 배경, 핵심 문제, 솔루션 컨셉 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 시스템 아키텍처, 레이어 구조, 데이터 흐름 |
| [BLOCK-SPEC.md](./BLOCK-SPEC.md) | 블록 정의 스펙 (YAML 포맷, 스키마, 예시) |
| [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) | 7단계 구현 계획, 파일 구조, 타임라인 |
| [COMPETITIVE-ANALYSIS.md](./COMPETITIVE-ANALYSIS.md) | 시장 분석, 경쟁 제품 비교, 포지셔닝 |
| [CLAUDE-CODE-NATIVE.md](./CLAUDE-CODE-NATIVE.md) | Claude Code 네이티브 기능 활용 전략 |
| [SMART-INTERVIEW.md](./SMART-INTERVIEW.md) | 컨텍스트 인식 동적 인터뷰 시스템 (Hook 기반) |

## 빠른 이해

```
문제: 바이브코딩은 개인에겐 강력하지만 팀에선 카오스
      같은 요청 + 다른 사람 + 다른 시간 = 다른 품질

해결: 파이프라인 = 팀의 고정 품질 기준 (코드 리뷰, 보안 검토)
      블록 = 개인의 작업 템플릿 (공유 선택 가능)
      누가 어떤 블록을 쓰든 파이프라인이 품질 보장

사용: 팀원이 자기만의 블록을 만들고 (또는 블록 없이) 자연어로 요청
      뒤에서 블록 매칭 → 실행 → 코드 리뷰 → 보안 검토 자동 수행
      좋은 블록은 팀에 공유 가능
```
