#!/bin/bash
# DevFlow — UserPromptSubmit 훅 (기획 모드)
# 프롬프트 입력 시: 프로젝트 상태 기반으로 기획/개발 모드 판단
# 기획 모드: 스마트 인터뷰 + 비판적 검토 + 문서 갱신 제안

set -euo pipefail

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

# --- 설정 로드 ---
CONFIG_FILE="$CWD/.devflow.yaml"
DEVFLOW_DIR="$CWD/.devflow"
mkdir -p "$DEVFLOW_DIR"

# 기획 모드 비활성화 시 통과
if [ -f "$CONFIG_FILE" ]; then
  PLANNING_ENABLED=$(python3 -c "
import yaml, sys
try:
  with open('$CONFIG_FILE') as f:
    c = yaml.safe_load(f)
  print(c.get('planning', {}).get('enabled', True))
except: print('True')
" 2>/dev/null || echo "True")
  if [ "$PLANNING_ENABLED" = "False" ]; then
    echo '{}'
    exit 0
  fi
fi

# --- 스킵 모드 ---
# ! 접두사면 DevFlow 비활성
if [[ "$PROMPT" == "!"* ]]; then
  # 모드 초기화
  rm -f "$DEVFLOW_DIR/mode" "$DEVFLOW_DIR/chain-step"
  echo '{}'
  exit 0
fi

# 프롬프트가 비어있으면 통과
if [ -z "$PROMPT" ]; then
  echo '{}'
  exit 0
fi

# --- 프로젝트 상태 기반 모드 판단 ---
# Haiku에게 프롬프트에서 작업 주제를 추출하고, docs/에 관련 문서가 있는지 판단 요청

# 프로젝트 컨텍스트 수집
CONTEXT=""

if [ -f "$CWD/CLAUDE.md" ]; then
  CONTEXT+="## CLAUDE.md\n$(head -50 "$CWD/CLAUDE.md")\n\n"
fi

# docs/ 파일 목록
if [ -d "$CWD/docs" ]; then
  DOCS_LIST=$(ls "$CWD/docs"/*.md 2>/dev/null | xargs -I{} basename {} | tr '\n' ', ')
  CONTEXT+="## docs/ 파일 목록\n$DOCS_LIST\n\n"
  # 각 파일의 제목(첫 줄)만 수집
  for f in "$CWD/docs"/*.md; do
    [ -f "$f" ] && CONTEXT+="- $(basename "$f"): $(head -1 "$f")\n"
  done
  CONTEXT+="\n"
fi

# Haiku에게 분석 요청
HAIKU_PROMPT=$(cat <<'PROMPT_END'
당신은 개발 프로세스 판단기입니다.

## 판단 규칙
1. 프롬프트의 작업 주제를 추출하세요
2. 프로젝트 컨텍스트의 docs/ 파일 목록에서 해당 주제의 설계/기획 문서가 있는지 확인하세요
3. 설계 문서가 있으면 → 개발 준비 완료 (pass)
4. 설계 문서가 없으면 → 기획이 필요 (plan)
5. 단순 질문, 버그 수정, 리팩토링은 → pass

JSON으로만 응답:
개발 모드: {"mode":"pass"}
기획 모드: {"mode":"plan","topic":"주제","missing":["빠진 정보1","빠진 정보2"],"concerns":["우려사항1"]}
PROMPT_END
)

FULL_PROMPT="$(echo -e "$HAIKU_PROMPT")\n\n## 프로젝트 컨텍스트\n$(echo -e "$CONTEXT")\n\n## 사용자 프롬프트\n$PROMPT"

ANALYSIS=$(echo -e "$FULL_PROMPT" | claude -p \
  --model claude-haiku-4-5-20251001 \
  --max-turns 1 \
  --max-budget-usd 0.05 \
  --output-format json \
  2>/dev/null) || ANALYSIS='{"mode":"pass"}'

# --- 결과 처리 ---
# claude -p --output-format json은 result wrapper를 반환하므로 .result에서 실제 응답 추출
RESULT_TEXT=$(echo "$ANALYSIS" | jq -r '.result // empty' 2>/dev/null)
if [ -n "$RESULT_TEXT" ]; then
  # result 텍스트에서 JSON 추출 (여러 줄, 마크다운 코드블록 포함 대응)
  PARSED=$(echo "$RESULT_TEXT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
# 마크다운 코드블록 안의 JSON 추출
m = re.search(r'\{.*\}', text, re.DOTALL)
if m:
    try:
        obj = json.loads(m.group())
        print(json.dumps(obj))
    except:
        print('{\"mode\":\"pass\"}')
else:
    print('{\"mode\":\"pass\"}')
" 2>/dev/null || echo '{"mode":"pass"}')
  ANALYSIS="$PARSED"
fi
MODE=$(echo "$ANALYSIS" | jq -r '.mode // "pass"' 2>/dev/null || echo "pass")

if [ "$MODE" = "pass" ]; then
  # 개발 모드 — 통과
  echo "coding" > "$DEVFLOW_DIR/mode"
  echo "1" > "$DEVFLOW_DIR/chain-step"
  echo '{}'
  exit 0
fi

# --- 기획 모드 발동 ---
echo "planning" > "$DEVFLOW_DIR/mode"

TOPIC=$(echo "$ANALYSIS" | jq -r '.topic // "알 수 없음"' 2>/dev/null)
MISSING=$(echo "$ANALYSIS" | jq -r '.missing[]? // empty' 2>/dev/null | sed 's/^/  - /')
CONCERNS=$(echo "$ANALYSIS" | jq -r '.concerns[]? // empty' 2>/dev/null | sed 's/^/  - /')

# additionalContext 조립
INJECT="[DevFlow 기획 모드] 주제: ${TOPIC}\n\n"

if [ -n "$MISSING" ]; then
  INJECT+="## 확인이 필요한 사항\n다음을 사용자에게 질문한 후 진행하세요:\n${MISSING}\n\n"
fi

if [ -n "$CONCERNS" ]; then
  INJECT+="## 비판적 검토\n다음 우려사항을 고려하세요:\n${CONCERNS}\n\n"
fi

INJECT+="## 요청사항\n"
INJECT+="1. 위 질문에 대한 답변을 받으세요\n"
INJECT+="2. 답변을 기반으로 설계를 정리하세요\n"
INJECT+="3. docs/ 디렉토리에 설계 문서를 작성하세요\n"
INJECT+="4. 설계가 완료되면 구현 여부를 확인하세요"

INJECT_ESCAPED=$(echo -e "$INJECT" | jq -Rs .)

echo "{\"hookSpecificOutput\":{\"hookEventName\":\"UserPromptSubmit\",\"additionalContext\":${INJECT_ESCAPED}}}"
exit 0
