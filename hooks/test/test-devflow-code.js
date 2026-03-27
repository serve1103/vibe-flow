#!/usr/bin/env node
// Unit test: devflow-code.js logic (without Haiku)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; }
}

const testCwd = '/tmp/devflow-test-code';
const devflowDir = path.join(testCwd, '.devflow');
const codePath = path.resolve(__dirname, '..', 'devflow-code.js');

function runHook(input) {
  try {
    return execSync(`echo '${JSON.stringify(input)}' | node "${codePath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      cwd: testCwd
    });
  } catch (e) {
    return e.stdout || '';
  }
}

console.log('=== devflow-code.js tests ===\n');

// Setup: create minimal .devflow.json
fs.mkdirSync(testCwd, { recursive: true });
fs.writeFileSync(path.join(testCwd, '.devflow.json'), JSON.stringify({
  planning: { enabled: true },
  coding: { code_review: { enabled: true }, security_review: { enabled: true }, test: { enabled: true }, commit: { enabled: true }, docs: { enabled: true } },
  skip: { prefix: '!', extensions: ['md','json','txt'], filenames: ['.gitignore'], prefixes: ['.env'], paths: ['hooks/', 'skills/', '.devflow/'] }
}));

// Test 1: Non Write/Edit is ignored
console.log('skip logic:');
let result = runHook({ tool_name: 'Read', cwd: testCwd });
assert(result.trim() === '{}', 'Read tool ignored');

// Test 2: Skip extensions
result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/tmp/test.md' } });
assert(result.trim() === '{}', '.md extension skipped');

// Test 3: Skip filenames
result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/tmp/.gitignore' } });
assert(result.trim() === '{}', '.gitignore skipped');

// Test 4: Skip prefixes (.env)
result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/tmp/.env.local' } });
assert(result.trim() === '{}', '.env.local skipped');

// Test 5: Skip paths (self-reference)
console.log('\nself-reference prevention:');
result = runHook({ tool_name: 'Edit', cwd: testCwd, tool_input: { file_path: '/project/hooks/devflow-code.js' } });
assert(result.trim() === '{}', 'hooks/ path skipped');

result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/project/skills/code-review/SKILL.md' } });
assert(result.trim() === '{}', 'skills/ path skipped');

result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/project/.devflow/results/test.json' } });
assert(result.trim() === '{}', '.devflow/ path skipped');

// Test 6: Planning mode skip
console.log('\nplanning mode:');
fs.mkdirSync(devflowDir, { recursive: true });
fs.writeFileSync(path.join(devflowDir, 'mode'), 'planning');
result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/src/app.js' } });
assert(result.trim() === '{}', 'planning mode skipped');

// Test 7: Workflow active skip
console.log('\nworkflow-active:');
fs.writeFileSync(path.join(devflowDir, 'mode'), 'coding');
fs.writeFileSync(path.join(devflowDir, 'workflow-active'), 'true');
result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/src/app.js' } });
assert(result.trim() === '{}', 'workflow-active skipped');

// Test 8: Normal file triggers workflow
console.log('\nworkflow trigger:');
fs.writeFileSync(path.join(devflowDir, 'workflow-active'), '');
fs.writeFileSync(path.join(devflowDir, 'mode'), 'coding');
// Clear debouncing state so it doesn't skip
try { fs.unlinkSync(path.join(devflowDir, 'last-change')); } catch {}
try { fs.unlinkSync(path.join(devflowDir, 'pending')); } catch {}
result = runHook({ tool_name: 'Write', cwd: testCwd, tool_input: { file_path: '/src/app.js' } });
const parsed = JSON.parse(result.trim());
assert(parsed.hookSpecificOutput !== undefined, 'workflow triggered');
assert(parsed.hookSpecificOutput?.additionalContext?.includes('coding-workflow'), 'coding-workflow injected');

// Cleanup
fs.rmSync(testCwd, { recursive: true, force: true });

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
