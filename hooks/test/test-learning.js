#!/usr/bin/env node
// Unit test: learning.js
const { loadRules, getActiveRules, formatRulesForPrompt, updateRules, normalizePattern } = require('../lib/learning');
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

const testCwd = '/tmp/devflow-test-learning';
const rulesDir = path.join(testCwd, '.devflow', 'learned-rules');

// Setup
fs.mkdirSync(rulesDir, { recursive: true });

console.log('=== learning.js tests ===\n');

// Test 1: loadRules empty
console.log('loadRules:');
const empty = loadRules(testCwd, 'code-review');
assert(empty.rules.length === 0, 'empty rules for new skill');

// Test 2: normalizePattern
console.log('\nnormalizePattern:');
const p1 = normalizePattern('[high] try-catch 누락 → 에러 핸들링 추가');
assert(p1.includes('trycatch 누락'), `pattern preserved: "${p1}"`);
assert(p1.includes('에러 핸들링 추가'), `suggestion preserved in: "${p1}"`);

const p2 = normalizePattern('[critical] SQL injection → Prepared Statement 사용');
assert(p2.includes('sql injection'), `normalized: "${p2}"`);

// Test 3: updateRules below threshold (should not create rule)
console.log('\nupdateRules:');
updateRules(testCwd, [
  { skill: 'code-review', suggestion: 'try-catch 누락', signal: 'ignored', count: 3 }
]);
const belowThreshold = loadRules(testCwd, 'code-review');
assert(belowThreshold.rules.length === 0, 'no rule below threshold (3 < 5)');

// Test 4: updateRules at threshold (should create rule)
updateRules(testCwd, [
  { skill: 'code-review', suggestion: 'try-catch 누락', signal: 'ignored', count: 5 }
]);
const atThreshold = loadRules(testCwd, 'code-review');
assert(atThreshold.rules.length === 1, `rule created at threshold: ${atThreshold.rules.length}`);
assert(atThreshold.rules[0].action === 'skip', `action is skip: ${atThreshold.rules[0].action}`);

// Test 5: getActiveRules returns non-expired rules
console.log('\ngetActiveRules:');
const active = getActiveRules(testCwd, 'code-review');
assert(active.length === 1, `1 active rule: ${active.length}`);

// Test 6: security-check excluded from learning
updateRules(testCwd, [
  { skill: 'security-check', suggestion: 'SQL injection 경고', signal: 'ignored', count: 10 }
]);
const secRules = getActiveRules(testCwd, 'security-check');
assert(secRules.length === 0, 'security-check excluded from learning');

// Test 7: formatRulesForPrompt
console.log('\nformatRulesForPrompt:');
const formatted = formatRulesForPrompt(testCwd, 'code-review');
assert(formatted.includes('학습된 규칙'), `contains header: ${formatted.substring(0, 50)}...`);
assert(formatted.includes('skip'), 'contains skip action');

// Test 8: formatRulesForPrompt empty for security
const secFormatted = formatRulesForPrompt(testCwd, 'security-check');
assert(secFormatted === '', 'empty for security-check');

// Test 9: max rules enforcement
console.log('\nmax rules:');
for (let i = 0; i < 15; i++) {
  updateRules(testCwd, [
    { skill: 'code-review', suggestion: `pattern-${i}`, signal: 'ignored', count: 5 }
  ]);
}
const maxRules = loadRules(testCwd, 'code-review');
assert(maxRules.rules.length <= 10, `max 10 rules enforced: ${maxRules.rules.length}`);

// Test 10: expired rules filtered
console.log('\nexpired rules:');
const expiredData = {
  rules: [{
    pattern: 'old pattern',
    action: 'skip',
    reason: 'test',
    created: '2020-01-01',
    expires: '2020-02-01',
    count: 5
  }]
};
fs.writeFileSync(path.join(rulesDir, 'test-expire.json'), JSON.stringify(expiredData));
const expiredActive = getActiveRules(testCwd, 'test-expire');
assert(expiredActive.length === 0, 'expired rule filtered out');

// Cleanup
fs.rmSync(testCwd, { recursive: true, force: true });

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
