#!/usr/bin/env node
// Unit test: haiku.js
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

console.log('=== haiku.js tests ===\n');

// Test 1: module loads
let haiku;
try {
  haiku = require('../lib/haiku');
  assert(true, 'haiku.js loads successfully');
} catch (e) {
  assert(false, `load failed: ${e.message}`);
  process.exit(1);
}

// Test 2: callHaiku exported
assert(typeof haiku.callHaiku === 'function', 'callHaiku is a function');

// Test 3: returns fallback when claude unavailable
const result = haiku.callHaiku('test', { issues: [] }, { retries: 0 });
assert(result !== undefined, `returns fallback: ${JSON.stringify(result)}`);
assert(Array.isArray(result.issues), 'fallback has issues array');

// Test 4: string fallback parsed
const result2 = haiku.callHaiku('test', '{"safe":true}', { retries: 0 });
assert(result2.safe === true, `string fallback parsed: ${JSON.stringify(result2)}`);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
