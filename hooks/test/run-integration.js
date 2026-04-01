#!/usr/bin/env node
// DevFlow 통합 테스트 — 실제 Claude 세션에서 전체 훅 동작 검증
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const DEVFLOW_DIR = path.join(PROJECT_ROOT, '.devflow');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const SETTINGS_BAK = SETTINGS_PATH + '.bak';

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, name) {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; errors.push(name); }
}

function setup() {
  // Backup existing settings
  if (fs.existsSync(SETTINGS_PATH)) {
    fs.renameSync(SETTINGS_PATH, SETTINGS_BAK);
  }

  // Clean state
  fs.rmSync(DEVFLOW_DIR, { recursive: true, force: true });

  // Create settings with hooks
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
    hooks: {
      UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: `node ${PROJECT_ROOT}/hooks/devflow-prompt.js`, timeout: 30 }] }],
      PostToolUse: [{
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: `node ${PROJECT_ROOT}/hooks/devflow-code.js`, timeout: 30 },
          { type: 'command', command: `node ${PROJECT_ROOT}/hooks/devflow-observe.js`, timeout: 10, async: true }
        ]
      }],
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: `node ${PROJECT_ROOT}/hooks/devflow-analyze.js`, timeout: 10 }] }]
    }
  }));
}

function cleanup() {
  // Restore settings
  fs.unlinkSync(SETTINGS_PATH);
  if (fs.existsSync(SETTINGS_BAK)) {
    fs.renameSync(SETTINGS_BAK, SETTINGS_PATH);
  } else {
    try { fs.rmdirSync(CLAUDE_DIR); } catch {}
  }

  // Clean state
  fs.rmSync(DEVFLOW_DIR, { recursive: true, force: true });

  // Kill orphaned processes
  try {
    execSync('pkill -9 -f "claude -p.*--model claude-haiku" 2>/dev/null', { timeout: 5000 });
  } catch {}

  // Clean test files
  try { fs.unlinkSync('/tmp/devflow-integ-1.js'); } catch {}
  try { fs.unlinkSync('/tmp/devflow-integ-2.js'); } catch {}
}

function runClaude(prompt, maxTurns = 3) {
  try {
    return execSync(`echo '${prompt}' | claude -p --max-turns ${maxTurns} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 120000,
      cwd: PROJECT_ROOT
    });
  } catch (e) {
    return e.stdout || '';
  }
}

function readState(file) {
  try { return fs.readFileSync(path.join(DEVFLOW_DIR, file), 'utf-8').trim(); } catch { return null; }
}

function fileExists(file) {
  return fs.existsSync(path.join(DEVFLOW_DIR, file));
}

// ═══════════════════════════════════════════
console.log('╔════════════════════════════════════════╗');
console.log('║   DevFlow Integration Test Suite       ║');
console.log('╚════════════════════════════════════════╝\n');

setup();
console.log('Setup complete.\n');

// ═══ Test 1: 일반 파일 Write → 훅 동작 검증 ═══
console.log('Test 1: 일반 파일 Write → 전체 훅 동작');
const result1 = runClaude('Write a file /tmp/devflow-integ-1.js with content "const x = 1;", then stop.');
console.log(`  Claude: ${result1.trim().substring(0, 80)}`);

// Wait for async hooks
try { execSync('sleep 3'); } catch {}

assert(readState('mode') === 'coding', 'mode = coding (모드 판단)');
assert(fileExists('workflow-active'), 'workflow-active 생성 (워크플로우 트리거)');
assert(fileExists('feedback/observations.jsonl'), 'observations.jsonl 생성 (관찰 기록)');
assert(fileExists('feedback/last-analyzed'), 'last-analyzed 생성 (Stop 분석)');

if (fileExists('feedback/observations.jsonl')) {
  const obs = fs.readFileSync(path.join(DEVFLOW_DIR, 'feedback/observations.jsonl'), 'utf-8').trim();
  const entry = JSON.parse(obs.split('\n')[0]);
  assert(entry.tool === 'Write', `관찰: tool=${entry.tool}`);
  assert(entry.file === '/tmp/devflow-integ-1.js', `관찰: file=${entry.file}`);
  assert(entry.session_id && entry.session_id.length > 0, `관찰: session_id 존재`);
}

if (fileExists('feedback/last-analyzed')) {
  const la = readState('feedback/last-analyzed');
  assert(la && la.includes(':'), `분석: dedupeKey 형식 (${la})`);
}

// ═══ Test 2: Skip 확장자 → 훅 스킵 검증 ═══
console.log('\nTest 2: .json 파일 Write → 스킵 확인');
fs.rmSync(DEVFLOW_DIR, { recursive: true, force: true });
const result2 = runClaude('Write a file /tmp/devflow-integ-skip.json with content "{\\"test\\":1}", then stop.');
try { execSync('sleep 3'); } catch {}

const obs2Exists = fileExists('feedback/observations.jsonl');
if (obs2Exists) {
  const obs2 = fs.readFileSync(path.join(DEVFLOW_DIR, 'feedback/observations.jsonl'), 'utf-8').trim();
  // observe.js는 Write/Edit 모두 기록하지만, devflow-code.js는 .json을 스킵
  assert(!fileExists('workflow-active') || readState('workflow-active') === '', '.json은 워크플로우 미트리거');
} else {
  assert(true, '.json은 관찰도 스킵 (확장자 필터)');
}
try { fs.unlinkSync('/tmp/devflow-integ-skip.json'); } catch {}

// ═══ Test 3: DevFlow 자체 파일 Edit → 자기 참조 방지 ═══
console.log('\nTest 3: DevFlow 자체 파일 Edit → 자기 참조 방지');
fs.rmSync(DEVFLOW_DIR, { recursive: true, force: true });
const result3 = runClaude('Read the file /Users/han/develop/AI-Agent/hooks/lib/io.js, then add a comment "// integration-test" at line 1 and stop.');
try { execSync('sleep 3'); } catch {}

const workflowAfterSelf = readState('workflow-active');
assert(!workflowAfterSelf || workflowAfterSelf !== 'true', '자기 참조: workflow 미트리거');

// Restore io.js
try { execSync('git checkout hooks/lib/io.js', { cwd: PROJECT_ROOT }); } catch {}

// ═══ Results ═══
console.log('\n╔════════════════════════════════════════╗');
console.log(`║   Results: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 15 - String(passed).length - String(failed).length))}║`);
console.log('╚════════════════════════════════════════╝');

if (errors.length > 0) {
  console.log('\nFailed:');
  errors.forEach(e => console.log(`  ✗ ${e}`));
}

// Cleanup
console.log('\nCleaning up...');
cleanup();
console.log('Done.');

process.exit(failed > 0 ? 1 : 0);
