#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./lib/config');
const { callHaiku } = require('./lib/haiku');
const { writeFile, removeFile } = require('./lib/io');
const { runCleanup } = require('./lib/cleanup');
const { loadSkillPrompt } = require('./lib/skill-loader');

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

  // Cleanup stale state + orphaned processes
  runCleanup(cwd);

  // Ensure state dir
  fs.mkdirSync(devflowDir, { recursive: true });

  // Reset workflow on new prompt
  writeFile(path.join(devflowDir, 'workflow-active'), '');
  writeFile(path.join(devflowDir, 'pending'), '');

  // Load config
  const config = loadConfig(cwd);

  // Skip if planning disabled
  if (!config.planning.enabled) return output({});

  // Skip mode (! prefix)
  if (prompt.startsWith(config.skip?.prefix || '!')) {
    removeFile(path.join(devflowDir, 'mode'));
    removeFile(path.join(devflowDir, 'workflow-active'));
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
  const interviewSkill = loadSkillPrompt('interview', cwd);
  const haikuPrompt = interviewSkill
    ? `${interviewSkill}\n\n## 프로젝트 컨텍스트\n${context}\n\n## 사용자 프롬프트\n<user_input>\n${prompt}\n</user_input>`
    : `당신은 개발 프로세스 판단기입니다.\n\n## 판단 규칙\n1. 프롬프트의 작업 주제를 추출하세요\n2. 프로젝트 컨텍스트의 docs/ 파일 목록에서 해당 주제의 설계/기획 문서가 있는지 확인하세요\n3. 설계 문서가 있으면 → 개발 준비 완료 (pass)\n4. 설계 문서가 없으면 → 기획이 필요 (plan)\n5. 단순 질문, 버그 수정, 리팩토링은 → pass\n\nJSON으로만 응답:\n개발 모드: {"mode":"pass"}\n기획 모드: {"mode":"plan","topic":"주제","missing":["빠진 정보1"],"concerns":["우려사항1"]}\n\n## 프로젝트 컨텍스트\n${context}\n\n## 사용자 프롬프트\n<user_input>\n${prompt}\n</user_input>`;

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
  if (missing) inject += `## 확인이 필요한 사항\n${missing}\n\n`;
  if (concerns) inject += `## 비판적 검토 필요\n${concerns}\n\n`;
  inject += `Skill("devflow:planning-workflow")를 실행하세요.`;

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
