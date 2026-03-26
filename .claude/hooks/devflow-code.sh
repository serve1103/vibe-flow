#!/bin/bash
# DevFlow — PostToolUse 훅 (개발 모드)
# Write/Edit 후: 코드 리뷰 → 보안 검토 → 테스트 제안 → 문서 갱신 → 커밋 제안
# 한 번에 하나씩 체이닝

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

# --- 기본 체크 ---
# Write/Edit만 대상
if [ "$TOOL_NAME" != "Write" ] && [ "$TOOL_NAME" != "Edit" ]; then
  echo '{}'
  exit 0
fi

DEVFLOW_DIR="$CWD/.devflow"
CONFIG_FILE="$CWD/.devflow.yaml"
mkdir -p "$DEVFLOW_DIR"

# 기획 모드면 스킵
if [ -f "$DEVFLOW_DIR/mode" ] && [ "$(cat "$DEVFLOW_DIR/mode")" = "planning" ]; then
  echo '{}'
  exit 0
fi

# --- 파일 확장자 체크 ---
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  echo '{}'
  exit 0
fi

EXTENSION="${FILE_PATH##*.}"

# 스킵할 확장자
SKIP_EXTENSIONS=("md" "json" "yaml" "yml" "txt" "toml" "lock" "gitignore")
for ext in "${SKIP_EXTENSIONS[@]}"; do
  if [ "$EXTENSION" = "$ext" ]; then
    echo '{}'
    exit 0
  fi
done

# --- 디바운싱 ---
PENDING_FILE="$DEVFLOW_DIR/pending"
TIMESTAMP_FILE="$DEVFLOW_DIR/last-change"
NOW=$(date +%s)

# 변경 파일 기록
echo "$FILE_PATH" >> "$PENDING_FILE"

if [ -f "$TIMESTAMP_FILE" ]; then
  LAST=$(cat "$TIMESTAMP_FILE")
  DIFF=$((NOW - LAST))
  if [ "$DIFF" -lt 5 ]; then
    # 5초 미경과 — 누적만 하고 스킵
    echo "$NOW" > "$TIMESTAMP_FILE"
    echo '{}'
    exit 0
  fi
fi

echo "$NOW" > "$TIMESTAMP_FILE"

# --- 체이닝 단계 확인 ---
CHAIN_STEP_FILE="$DEVFLOW_DIR/chain-step"
CHAIN_STEP=1
if [ -f "$CHAIN_STEP_FILE" ]; then
  CHAIN_STEP=$(cat "$CHAIN_STEP_FILE")
fi

# --- 설정 로드 (간단 파싱) ---
CODE_REVIEW_ENABLED="true"
SECURITY_ENABLED="true"
TEST_ENABLED="true"
DOCS_ENABLED="true"
COMMIT_ENABLED="true"

if [ -f "$CONFIG_FILE" ]; then
  CODE_REVIEW_ENABLED=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
  c = yaml.safe_load(f)
print(str(c.get('coding',{}).get('code_review',{}).get('enabled',True)))
" 2>/dev/null || echo "True")

  SECURITY_ENABLED=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
  c = yaml.safe_load(f)
print(str(c.get('coding',{}).get('security_review',{}).get('enabled',True)))
" 2>/dev/null || echo "True")

  TEST_ENABLED=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
  c = yaml.safe_load(f)
print(str(c.get('coding',{}).get('test',{}).get('enabled',True)))
" 2>/dev/null || echo "True")

  DOCS_ENABLED=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
  c = yaml.safe_load(f)
print(str(c.get('coding',{}).get('docs',{}).get('enabled',True)))
" 2>/dev/null || echo "True")

  COMMIT_ENABLED=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
  c = yaml.safe_load(f)
print(str(c.get('coding',{}).get('commit',{}).get('enabled',True)))
" 2>/dev/null || echo "True")
fi

# --- 체이닝 실행 ---
INJECT=""

case "$CHAIN_STEP" in
  1)
    # 1단계: 코드 리뷰 + 보안 검토
    PENDING_FILES=""
    if [ -f "$PENDING_FILE" ]; then
      PENDING_FILES=$(sort -u "$PENDING_FILE" | tr '\n' ', ')
      > "$PENDING_FILE"  # 초기화
    fi

    if [ -z "$PENDING_FILES" ]; then
      PENDING_FILES="$FILE_PATH"
    fi

    # 코드 내용 수집 (Write의 경우 tool_input.content 사용)
    CODE_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' | head -200)
    if [ -z "$CODE_CONTENT" ]; then
      # Edit의 경우 new_string 사용
      CODE_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' | head -200)
    fi

    if [ -z "$CODE_CONTENT" ]; then
      echo '{}'; exit 0
    fi

    REVIEW_RESULT=""

    # 코드 리뷰
    if [ "$CODE_REVIEW_ENABLED" = "True" ]; then
      REVIEW_PROMPT="다음 코드 변경을 리뷰하세요. high 이상 심각도의 문제만 보고하세요.\n\n파일: $PENDING_FILES\n코드:\n$CODE_CONTENT\n\nJSON으로만 응답:\n문제없음: {\"issues\":[]}\n문제있음: {\"issues\":[{\"severity\":\"high\",\"description\":\"설명\",\"suggestion\":\"제안\"}]}"

      REVIEW=$(echo -e "$REVIEW_PROMPT" | claude -p \
        --model claude-haiku-4-5-20251001 \
        --max-turns 1 \
        --max-budget-usd 0.05 \
        --output-format json \
        2>/dev/null) || REVIEW='{"issues":[]}'

      # result wrapper에서 실제 응답 추출
      REVIEW_TEXT=$(echo "$REVIEW" | jq -r '.result // empty' 2>/dev/null)
      if [ -n "$REVIEW_TEXT" ]; then
        REVIEW_PARSED=$(echo "$REVIEW_TEXT" | python3 -c "import sys,json,re; t=sys.stdin.read(); m=re.search(r'\{.*\}',t,re.DOTALL); print(m.group() if m else '{\"issues\":[]}')" 2>/dev/null || echo '{"issues":[]}')
        REVIEW="$REVIEW_PARSED"
      fi
      ISSUES=$(echo "$REVIEW" | jq -r '.issues[]? | "[\(.severity)] \(.description) → \(.suggestion)"' 2>/dev/null)
      if [ -n "$ISSUES" ]; then
        REVIEW_RESULT+="[DevFlow 코드 리뷰]\n$ISSUES\n\n"
      fi
    fi

    # 보안 검토
    if [ "$SECURITY_ENABLED" = "True" ]; then
      SEC_PROMPT="다음 코드에서 보안 취약점을 체크하세요.\n체크 항목: SQL injection, 하드코딩된 시크릿/API키, 경로 탐색, 인증 우회\n\n파일: $PENDING_FILES\n코드:\n$CODE_CONTENT\n\nJSON으로만 응답:\n안전: {\"safe\":true}\n취약점: {\"safe\":false,\"issues\":[{\"severity\":\"critical\",\"description\":\"설명\"}]}"

      SECURITY=$(echo -e "$SEC_PROMPT" | claude -p \
        --model claude-haiku-4-5-20251001 \
        --max-turns 1 \
        --max-budget-usd 0.05 \
        --output-format json \
        2>/dev/null) || SECURITY='{"safe":true}'

      # result wrapper에서 실제 응답 추출
      SEC_TEXT=$(echo "$SECURITY" | jq -r '.result // empty' 2>/dev/null)
      if [ -n "$SEC_TEXT" ]; then
        SEC_PARSED=$(echo "$SEC_TEXT" | python3 -c "import sys,json,re; t=sys.stdin.read(); m=re.search(r'\{.*\}',t,re.DOTALL); print(m.group() if m else '{\"safe\":true}')" 2>/dev/null || echo '{"safe":true}')
        SECURITY="$SEC_PARSED"
      fi
      IS_SAFE=$(echo "$SECURITY" | jq -r '.safe // true' 2>/dev/null)
      if [ "$IS_SAFE" = "false" ]; then
        SEC_ISSUES=$(echo "$SECURITY" | jq -r '.issues[]? | "[\(.severity)] \(.description)"' 2>/dev/null)
        REVIEW_RESULT+="[DevFlow 보안 검토]\n$SEC_ISSUES\n\n"
      fi
    fi

    if [ -n "$REVIEW_RESULT" ]; then
      REVIEW_RESULT+="위 문제를 수정하세요."
      INJECT="$REVIEW_RESULT"
    fi

    # 다음 단계로
    echo "2" > "$CHAIN_STEP_FILE"
    ;;

  2)
    # 2단계: 테스트 제안
    if [ "$TEST_ENABLED" = "True" ]; then
      INJECT="[DevFlow] 변경된 코드에 대한 테스트를 작성하고 실행하세요."
    fi
    echo "3" > "$CHAIN_STEP_FILE"
    ;;

  3)
    # 3단계: 문서 갱신 제안
    if [ "$DOCS_ENABLED" = "True" ]; then
      # 경로 기반 문서 갱신 판단
      PENDING_FILES=""
      if [ -f "$PENDING_FILE" ]; then
        PENDING_FILES=$(cat "$PENDING_FILE" 2>/dev/null)
      fi

      DOC_SUGGEST=""
      if echo "$FILE_PATH $PENDING_FILES" | grep -qiE "route|api|endpoint|controller"; then
        DOC_SUGGEST="API 관련 코드가 변경되었습니다. API 문서를 갱신하세요."
      elif echo "$FILE_PATH $PENDING_FILES" | grep -qiE "schema|model|migration|table"; then
        DOC_SUGGEST="데이터 모델 관련 코드가 변경되었습니다. 모델/스키마 문서를 갱신하세요."
      fi

      if [ -n "$DOC_SUGGEST" ]; then
        INJECT="[DevFlow] $DOC_SUGGEST"
      fi
    fi
    echo "4" > "$CHAIN_STEP_FILE"
    ;;

  4)
    # 4단계: 커밋 제안
    if [ "$COMMIT_ENABLED" = "True" ]; then
      INJECT="[DevFlow] 모든 변경이 완료되었으면 커밋하세요. Conventional Commits 형식을 사용하세요."
    fi
    # 체이닝 초기화
    echo "1" > "$CHAIN_STEP_FILE"
    > "$PENDING_FILE" 2>/dev/null
    ;;

  *)
    echo "1" > "$CHAIN_STEP_FILE"
    ;;
esac

# --- 결과 반환 ---
if [ -n "$INJECT" ]; then
  INJECT_ESCAPED=$(echo -e "$INJECT" | jq -Rs .)
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":${INJECT_ESCAPED}}}"
else
  echo '{}'
fi

exit 0
