#!/usr/bin/env node
// Unit test: devflow-observe.js logic (without stdin)
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; }
}

const testCwd = '/tmp/devflow-test-observe';
const feedbackDir = path.join(testCwd, '.devflow', 'feedback');

console.log('=== devflow-observe.js tests ===\n');

// Test via direct execution with mock input
const { execSync } = require('child_process');
const observePath = path.resolve(__dirname, '..', 'devflow-observe.js');

// Test 1: Write tool creates observation
console.log('observation recording:');
fs.rmSync(testCwd, { recursive: true, force: true });
const input1 = JSON.stringify({
  tool_name: 'Write',
  cwd: testCwd,
  session_id: 'test-session',
  tool_input: { file_path: '/src/app.js', content: 'console.log("hello")' }
});
execSync(`echo '${input1}' | node "${observePath}"`, { encoding: 'utf-8' });
const obsFile = path.join(feedbackDir, 'observations.jsonl');
assert(fs.existsSync(obsFile), 'observations.jsonl created');

const obs = JSON.parse(fs.readFileSync(obsFile, 'utf-8').trim());
assert(obs.tool === 'Write', `tool: ${obs.tool}`);
assert(obs.file === '/src/app.js', `file: ${obs.file}`);
assert(obs.context.includes('console.log'), `context: ${obs.context}`);
assert(obs.session_id === 'test-session', `session_id: ${obs.session_id}`);

// Test 2: Edit tool records observation
const input2 = JSON.stringify({
  tool_name: 'Edit',
  cwd: testCwd,
  session_id: 'test-session',
  tool_input: { file_path: '/src/auth.ts', new_string: 'if (token) { verify(); }' }
});
execSync(`echo '${input2}' | node "${observePath}"`, { encoding: 'utf-8' });
const lines = fs.readFileSync(obsFile, 'utf-8').trim().split('\n');
assert(lines.length === 2, `2 observations recorded: ${lines.length}`);

// Test 3: Non Write/Edit is ignored
const input3 = JSON.stringify({ tool_name: 'Read', cwd: testCwd });
execSync(`echo '${input3}' | node "${observePath}"`, { encoding: 'utf-8' });
const lines2 = fs.readFileSync(obsFile, 'utf-8').trim().split('\n');
assert(lines2.length === 2, `Read ignored, still 2: ${lines2.length}`);

// Test 4: Secret scrubbing
console.log('\nsecret scrubbing:');
const input4 = JSON.stringify({
  tool_name: 'Write',
  cwd: testCwd,
  tool_input: { file_path: '/config.js', content: 'api_key: "sk-live-abc123def456ghi789"' }
});
execSync(`echo '${input4}' | node "${observePath}"`, { encoding: 'utf-8' });
const lines3 = fs.readFileSync(obsFile, 'utf-8').trim().split('\n');
const lastObs = JSON.parse(lines3[lines3.length - 1]);
assert(!lastObs.context.includes('sk-live'), `secret scrubbed: ${lastObs.context}`);

// Cleanup
fs.rmSync(testCwd, { recursive: true, force: true });

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
