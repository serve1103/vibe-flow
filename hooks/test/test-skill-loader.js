#!/usr/bin/env node
// Unit test: skill-loader.js with learned rules
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

const testCwd = '/tmp/devflow-test-skill-loader';
const rulesDir = path.join(testCwd, '.devflow', 'learned-rules');
fs.mkdirSync(rulesDir, { recursive: true });

// Set PLUGIN_ROOT so skill-loader finds skills/
process.env.CLAUDE_PLUGIN_ROOT = '/Users/han/develop/AI-Agent';

const { loadSkillPrompt } = require('../lib/skill-loader');

console.log('=== skill-loader.js tests ===\n');

// Test 1: Load skill without learned rules
console.log('loadSkillPrompt:');
const basic = loadSkillPrompt('code-review');
assert(basic !== null, 'code-review loaded');
assert(basic.includes('코드 리뷰'), 'contains skill content');
assert(basic.includes('severity-guide'), 'references inlined');

// Test 2: Load skill with cwd but no rules
const withCwd = loadSkillPrompt('code-review', testCwd);
assert(withCwd !== null, 'code-review with cwd loaded');
assert(!withCwd.includes('학습된 규칙'), 'no learned rules section (empty)');

// Test 3: Load skill with learned rules
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
fs.writeFileSync(path.join(rulesDir, 'code-review.json'), JSON.stringify({
  rules: [{
    pattern: 'try-catch 누락',
    action: 'skip',
    reason: '5회 무시됨',
    created: '2026-03-27',
    expires: tomorrow,
    count: 5
  }]
}));

const withRules = loadSkillPrompt('code-review', testCwd);
assert(withRules.includes('학습된 규칙'), 'learned rules section present');
assert(withRules.includes('try-catch 누락'), 'rule content included');
assert(withRules.includes('skip'), 'skip action included');

// Test 4: Security skill excludes learned rules
fs.writeFileSync(path.join(rulesDir, 'security-check.json'), JSON.stringify({
  rules: [{ pattern: 'SQL injection', action: 'skip', reason: 'test', expires: tomorrow, count: 5 }]
}));
const secSkill = loadSkillPrompt('security-check', testCwd);
assert(!secSkill.includes('학습된 규칙'), 'security-check has no learned rules');

// Test 5: Missing skill returns null
const missing = loadSkillPrompt('nonexistent', testCwd);
assert(missing === null, 'missing skill returns null');

// Test 6: Load without cwd (no rules applied)
const noCwd = loadSkillPrompt('code-review');
assert(noCwd !== null, 'loads without cwd');
assert(!noCwd.includes('학습된 규칙'), 'no rules without cwd');

// Cleanup
fs.rmSync(testCwd, { recursive: true, force: true });

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
