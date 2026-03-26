#!/usr/bin/env node
// Resolve plugin root (fallback to script directory's parent)
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || require('path').resolve(__dirname, '..');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./lib/config');
const { callHaiku } = require('./lib/haiku');
const { writeFile, removeFile } = require('./lib/io');

// Read stdin
let inputData = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => inputData += chunk);
process.stdin.on('end', () => {
  try {
    main(JSON.parse(inputData));
  } catch {
    output({});
  }
});

function main(input) {
  const prompt = input.prompt || '';
  const cwd = input.cwd || '.';
  const devflowDir = path.join(cwd, '.devflow');

  // Ensure state dir
  fs.mkdirSync(devflowDir, { recursive: true });

  // Reset chain on new prompt
  writeFile(path.join(devflowDir, 'chain-step'), '1');
  writeFile(path.join(devflowDir, 'pending'), '');

  // Load config
  const config = loadConfig(cwd);

  // Skip if planning disabled
  if (!config.planning.enabled) return output({});

  // Skip mode (! prefix)
  if (prompt.startsWith(config.skip?.prefix || '!')) {
    removeFile(path.join(devflowDir, 'mode'));
    removeFile(path.join(devflowDir, 'chain-step'));
    return output({});
  }

  // Empty prompt
  if (!prompt.trim()) return output({});

  // Collect project context
  let context = '';
  const claudeMd = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, 'utf-8').split('\n').slice(0, 50).join('\n');
    context += `## CLAUDE.md\n${content}\n\n`;
  }

  const docsDir = path.join(cwd, 'docs');
  if (fs.existsSync(docsDir)) {
    const entries = fs.readdirSync(docsDir, { withFileTypes: true });
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name);
    context += `## docs/ 파일 목록\n`;
    for (const f of files) {
      const firstLine = fs.readFileSync(path.join(docsDir, f), 'utf-8').split('\n')[0] || '';
      context += `- ${f}: ${firstLine}\n`;
    }
    context += '\n';
  }

  // Ask Haiku for mode decision
  const haikuPrompt = `당신은 개발 프로세스 판단기입니다.

## 판단 규칙
1. 프롬프트의 작업 주제를 추출하세요
2. 프로젝트 컨텍스트의 docs/ 파일 목록에서 해당 주제의 설계/기획 문서가 있는지 확인하세요
3. 설계 문서가 있으면 → 개발 준비 완료 (pass)
4. 설계 문서가 없으면 → 기획이 필요 (plan)
5. 단순 질문, 버그 수정, 리팩토링은 → pass

JSON으로만 응답:
개발 모드: {"mode":"pass"}
기획 모드: {"mode":"plan","topic":"주제","missing":["빠진 정보1"],"concerns":["우려사항1"]}

## 프로젝트 컨텍스트
${context}

## 사용자 프롬프트
<user_input>
${prompt}
</user_input>`;

  const analysis = callHaiku(haikuPrompt, { mode: 'pass' });

  if (analysis.mode === 'pass') {
    writeFile(path.join(devflowDir, 'mode'), 'coding');
    return output({});
  }

  // Planning mode
  writeFile(path.join(devflowDir, 'mode'), 'planning');

  const topic = analysis.topic || '알 수 없음';
  const missing = (analysis.missing || []).map(m => `  - ${m}`).join('\n');
  const concerns = (analysis.concerns || []).map(c => `  - ${c}`).join('\n');

  let inject = `[DevFlow 기획 모드] 주제: ${topic}\n\n`;
  if (missing) inject += `## 확인이 필요한 사항\n다음을 사용자에게 질문한 후 진행하세요:\n${missing}\n\n`;
  if (concerns) inject += `## 비판적 검토\n다음 우려사항을 고려하세요:\n${concerns}\n\n`;
  inject += `## 요청사항\n1. 위 질문에 대한 답변을 받으세요\n2. 답변을 기반으로 설계를 정리하세요\n3. docs/ 디렉토리에 설계 문서를 작성하세요\n4. 설계가 완료되면 구현 여부를 확인하세요`;

  output({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: inject
    }
  });
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}
