#!/bin/bash
# DevFlow 설치 스크립트
# 사용: curl -sSL .../install.sh | bash
# 또는: ./install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"

echo "DevFlow 설치 중..."

# HIGH-5: 의존성 체크
MISSING_DEPS=()
for dep in jq python3 claude; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    MISSING_DEPS+=("$dep")
  fi
done
if [ "${#MISSING_DEPS[@]}" -gt 0 ]; then
  echo "오류: 다음 의존성이 없습니다: ${MISSING_DEPS[*]}"
  echo "설치 후 다시 시도하세요."
  exit 1
fi

# 디렉토리 생성
mkdir -p "$TARGET_DIR/.claude/hooks"
mkdir -p "$TARGET_DIR/.devflow"

# 훅 스크립트 복사
cp "$SCRIPT_DIR/.claude/hooks/devflow-prompt.sh" "$TARGET_DIR/.claude/hooks/"
cp "$SCRIPT_DIR/.claude/hooks/devflow-code.sh" "$TARGET_DIR/.claude/hooks/"
chmod +x "$TARGET_DIR/.claude/hooks/devflow-prompt.sh"
chmod +x "$TARGET_DIR/.claude/hooks/devflow-code.sh"

# 설정 파일 복사 (이미 있으면 스킵)
if [ ! -f "$TARGET_DIR/.devflow.yaml" ]; then
  cp "$SCRIPT_DIR/.devflow.yaml" "$TARGET_DIR/.devflow.yaml"
  echo "  .devflow.yaml 생성"
else
  echo "  .devflow.yaml 이미 존재 — 스킵"
fi

# settings.json 머지
SETTINGS_FILE="$TARGET_DIR/.claude/settings.json"
DEVFLOW_HOOKS='{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/devflow-prompt.sh",
        "timeout": 15
      }]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/devflow-code.sh",
        "timeout": 30
      }]
    }]
  }
}'

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "$DEVFLOW_HOOKS" | jq '.' > "$SETTINGS_FILE"
  echo "  settings.json 생성"
else
  # HIGH-3: 기존 devflow 훅 제거 후 머지 (중복 등록 방지)
  EXISTING=$(cat "$SETTINGS_FILE")
  MERGED=$(echo "$EXISTING" | jq --argjson new "$DEVFLOW_HOOKS" '
    .hooks.UserPromptSubmit = ((.hooks.UserPromptSubmit // []) | map(select(.hooks[]?.command | test("devflow") | not))) + $new.hooks.UserPromptSubmit |
    .hooks.PostToolUse = ((.hooks.PostToolUse // []) | map(select(.hooks[]?.command | test("devflow") | not))) + $new.hooks.PostToolUse
  ' 2>/dev/null || echo "$DEVFLOW_HOOKS")
  echo "$MERGED" | jq '.' > "$SETTINGS_FILE"
  echo "  settings.json 머지 완료"
fi

# .gitignore에 .devflow/ 추가
GITIGNORE="$TARGET_DIR/.gitignore"
if [ -f "$GITIGNORE" ]; then
  if ! grep -q ".devflow/" "$GITIGNORE" 2>/dev/null; then
    echo ".devflow/" >> "$GITIGNORE"
    echo "  .gitignore에 .devflow/ 추가"
  fi
else
  echo ".devflow/" > "$GITIGNORE"
  echo "  .gitignore 생성"
fi

echo ""
echo "DevFlow 설치 완료!"
echo ""
echo "설치된 파일:"
echo "  .claude/hooks/devflow-prompt.sh  (기획 모드)"
echo "  .claude/hooks/devflow-code.sh    (개발 모드)"
echo "  .devflow.yaml                    (설정)"
echo ""
echo "사용법: 평소처럼 Claude Code를 사용하세요. DevFlow가 자동으로 동작합니다."
