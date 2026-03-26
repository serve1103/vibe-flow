#!/bin/bash
# DevFlow — PostToolUse 훅 (개발 모드)
# Write/Edit 후: 코드 리뷰 → 보안 검토 → 테스트 제안 → 문서 갱신 → 커밋 제안
# 한 번에 하나씩 체이닝

set -euo pipefail

# HIGH-6: claude CLI 체크
if ! command -v claude >/dev/null 2>&1; then
  exit 0
fi

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

# 스킵할 확장자 및 파일명 (MEDIUM-5: 하드코딩 목록, Phase 2에서 yaml 연동)
SKIP_EXTENSIONS=("md" "json" "yaml" "yml" "txt" "toml" "lock" "gitignore" "env" "cfg" "ini" "csv")
SKIP_FILENAMES=(".gitignore" ".dockerignore" "Makefile" "Dockerfile" "LICENSE")
BASENAME=$(basename "$FILE_PATH")
for name in "${SKIP_FILENAMES[@]}"; do
  if [ "$BASENAME" = "$name" ]; then
    echo '{}'
    exit 0
  fi
done
for ext in "${SKIP_EXTENSIONS[@]}"; do
  if [ "$EXTENSION" = "$ext" ]; then
    echo '{}'
    exit 0
  fi
done

# --- 디바운싱 (타임스탬프 비교, macOS/Linux 호환) ---
PENDING_FILE="$DEVFLOW_DIR/pending"
TIMESTAMP_FILE="$DEVFLOW_DIR/last-change"
NOW=$(date +%s)

# 변경 파일 기록 (최대 100개 제한)
echo "$FILE_PATH" >> "$PENDING_FILE"
if [ "$(wc -l < "$PENDING_FILE" 2>/dev/null || echo 0)" -gt 100 ]; then
  tail -100 "$PENDING_FILE" > "$PENDING_FILE.tmp" && mv "$PENDING_FILE.tmp" "$PENDING_FILE"
fi

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
# CRITICAL-1 & CRITICAL-2: pyyaml 제거, 환경변수로 경로 전달, 단일 python3 호출
CODE_REVIEW_ENABLED="True"
SECURITY_ENABLED="True"
TEST_ENABLED="True"
DOCS_ENABLED="True"
COMMIT_ENABLED="True"

if [ -f "$CONFIG_FILE" ]; then
  eval "$(DEVFLOW_CONFIG="$CONFIG_FILE" python3 -c "
import re, sys, os
try:
    with open(os.environ['DEVFLOW_CONFIG']) as f:
        text = f.read()
    def get_section_enabled(section, subsection):
        # Find section block
        sec = re.search(r'^' + section + r':.*?(?=\n[a-z]|\Z)', text, re.DOTALL | re.MULTILINE)
        if not sec:
            return 'True'
        sec_text = sec.group()
        # Find subsection block within section
        sub = re.search(r'^\s+' + subsection + r':.*?(?=\n\s{0,4}[a-z]|\Z)', sec_text, re.DOTALL | re.MULTILINE)
        if not sub:
            return 'True'
        sub_text = sub.group()
        m = re.search(r'enabled:\s*(true|false)', sub_text, re.IGNORECASE)
        if m:
            return 'True' if m.group(1).lower() == 'true' else 'False'
        return 'True'
    print('CODE_REVIEW_ENABLED=' + get_section_enabled('coding', 'code_review'))
    print('SECURITY_ENABLED=' + get_section_enabled('coding', 'security_review'))
    print('TEST_ENABLED=' + get_section_enabled('coding', 'test'))
    print('DOCS_ENABLED=' + get_section_enabled('coding', 'docs'))
    print('COMMIT_ENABLED=' + get_section_enabled('coding', 'commit'))
except:
    print('CODE_REVIEW_ENABLED=True')
    print('SECURITY_ENABLED=True')
    print('TEST_ENABLED=True')
    print('DOCS_ENABLED=True')
    print('COMMIT_ENABLED=True')
" 2>/dev/null)"
fi

# --- 체이닝 실행 ---
INJECT=""

case "$CHAIN_STEP" in
  1)
    # 1단계: 코드 리뷰 + 보안 검토 (HIGH-1: 병렬 실행)
    PENDING_FILES=""
    if [ -f "$PENDING_FILE" ]; then
      PENDING_FILES=$(sort -u "$PENDING_FILE" | tr '\n' ', ')
      > "$PENDING_FILE"  # 초기화
    fi

    if [ -z "$PENDING_FILES" ]; then
      PENDING_FILES="$FILE_PATH"
    fi

    # 코드 내용 수집 (MEDIUM-4: 절단 시 표시 추가)
    CODE_RAW=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
    if [ -z "$CODE_RAW" ]; then
      CODE_RAW=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
    fi
    TOTAL_LINES=$(echo "$CODE_RAW" | wc -l | tr -d ' ')
    CODE_CONTENT=$(echo "$CODE_RAW" | head -200)
    if [ "$TOTAL_LINES" -gt 200 ]; then
      CODE_CONTENT+=$'\n\n'"... (${TOTAL_LINES}줄 중 200줄만 표시)"
    fi

    if [ -z "$CODE_CONTENT" ]; then
      echo '{}'; exit 0
    fi

    REVIEW_RESULT=""

    # JSON 추출 헬퍼 함수
    extract_json() {
      local fallback="$1"
      python3 -c "
import sys, json, re
text = sys.stdin.read()
cb = re.search(r'\`\`\`(?:json)?\s*(\{.*?\})\s*\`\`\`', text, re.DOTALL)
if cb:
    try:
        obj = json.loads(cb.group(1))
        print(json.dumps(obj)); sys.exit()
    except: pass
for m in re.finditer(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text):
    try:
        obj = json.loads(m.group())
        print(json.dumps(obj)); sys.exit()
    except: continue
print(sys.argv[1])
" "$fallback" 2>/dev/null || echo "$fallback"
    }

    # 코드 리뷰 (순차 실행)
    if [ "$CODE_REVIEW_ENABLED" = "True" ]; then
      REVIEW_PROMPT="다음 코드 변경을 리뷰하세요. high 이상 심각도의 문제만 보고하세요."$'\n\n'"파일: ${PENDING_FILES}"$'\n'"코드:"$'\n'"${CODE_CONTENT}"$'\n\n'"JSON으로만 응답:"$'\n'"문제없음: {\"issues\":[]}"$'\n'"문제있음: {\"issues\":[{\"severity\":\"high\",\"description\":\"설명\",\"suggestion\":\"제안\"}]}"

      REVIEW=$(printf '%s' "$REVIEW_PROMPT" | claude -p \
        --model claude-haiku-4-5-20251001 \
        --max-turns 1 \
        --max-budget-usd 0.05 \
        --output-format json \
        2>/dev/null) || REVIEW='{"issues":[]}'

      REVIEW_TEXT=$(echo "$REVIEW" | jq -r '.result // empty' 2>/dev/null)
      if [ -n "$REVIEW_TEXT" ]; then
        REVIEW=$(printf '%s' "$REVIEW_TEXT" | extract_json '{"issues":[]}')
      fi

      ISSUES=$(echo "$REVIEW" | jq -r '.issues[]? | "[\(.severity)] \(.description) → \(.suggestion)"' 2>/dev/null)
      if [ -n "$ISSUES" ]; then
        REVIEW_RESULT+="[DevFlow 코드 리뷰]"$'\n'"$ISSUES"$'\n\n'
      fi
    fi

    # 보안 검토 (순차 실행)
    if [ "$SECURITY_ENABLED" = "True" ]; then
      SEC_PROMPT="다음 코드에서 보안 취약점을 체크하세요."$'\n'"체크 항목: SQL injection, 하드코딩된 시크릿/API키, 경로 탐색, 인증 우회"$'\n\n'"파일: ${PENDING_FILES}"$'\n'"코드:"$'\n'"${CODE_CONTENT}"$'\n\n'"JSON으로만 응답:"$'\n'"안전: {\"safe\":true}"$'\n'"취약점: {\"safe\":false,\"issues\":[{\"severity\":\"critical\",\"description\":\"설명\"}]}"

      SECURITY=$(printf '%s' "$SEC_PROMPT" | claude -p \
        --model claude-haiku-4-5-20251001 \
        --max-turns 1 \
        --max-budget-usd 0.05 \
        --output-format json \
        2>/dev/null) || SECURITY='{"safe":true}'

      SEC_TEXT=$(echo "$SECURITY" | jq -r '.result // empty' 2>/dev/null)
      if [ -n "$SEC_TEXT" ]; then
        SECURITY=$(printf '%s' "$SEC_TEXT" | extract_json '{"safe":true}')
      fi

      IS_SAFE=$(echo "$SECURITY" | jq -r '.safe // true' 2>/dev/null)
      if [ "$IS_SAFE" = "false" ]; then
        SEC_ISSUES=$(echo "$SECURITY" | jq -r '.issues[]? | "[\(.severity)] \(.description)"' 2>/dev/null)
        REVIEW_RESULT+="[DevFlow 보안 검토]"$'\n'"$SEC_ISSUES"$'\n\n'
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
    # 3단계: 문서 갱신 제안 (매칭 안 되면 4단계로 자동 건너뜀)
    DOC_SUGGEST=""
    if [ "$DOCS_ENABLED" = "True" ]; then
      PENDING_ALL="$FILE_PATH"
      if [ -f "$PENDING_FILE" ]; then
        PENDING_ALL+=" $(cat "$PENDING_FILE" 2>/dev/null)"
      fi
      if echo "$PENDING_ALL" | grep -qiE "route|api|endpoint|controller"; then
        DOC_SUGGEST="API 관련 코드가 변경되었습니다. API 문서를 갱신하세요."
      elif echo "$PENDING_ALL" | grep -qiE "schema|model|migration|table"; then
        DOC_SUGGEST="데이터 모델 관련 코드가 변경되었습니다. 모델/스키마 문서를 갱신하세요."
      fi
    fi

    if [ -n "$DOC_SUGGEST" ]; then
      INJECT="[DevFlow] $DOC_SUGGEST"
      echo "4" > "$CHAIN_STEP_FILE"
    else
      # 문서 갱신 불필요 → 4단계(커밋)로 바로 건너뜀
      if [ "$COMMIT_ENABLED" = "True" ]; then
        INJECT="[DevFlow] 모든 변경이 완료되었으면 커밋하세요. Conventional Commits 형식을 사용하세요."
      fi
      echo "1" > "$CHAIN_STEP_FILE"
      > "$PENDING_FILE" 2>/dev/null
    fi
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
  INJECT_ESCAPED=$(printf '%s' "$INJECT" | jq -Rs .)
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":${INJECT_ESCAPED}}}"
else
  echo '{}'
fi

exit 0
