#!/usr/bin/env node
// Unit test: cleanup.js
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; }
}

const testCwd = '/tmp/devflow-test-cleanup';
const devflowDir = path.join(testCwd, '.devflow');

// Setup
fs.mkdirSync(devflowDir, { recursive: true });

const { cleanupStaleState, checkRecovery, runCleanup } = require('../lib/cleanup');

console.log('=== cleanup.js tests ===\n');

// Test 1: cleanupStaleState does nothing on fresh state
console.log('cleanupStaleState:');
cleanupStaleState(devflowDir);
assert(true, 'no crash on empty dir');

// Test 2: non-stale state preserved
fs.writeFileSync(path.join(devflowDir, 'last-change'), String(Date.now()));
fs.writeFileSync(path.join(devflowDir, 'mode'), 'coding');
fs.writeFileSync(path.join(devflowDir, 'workflow-active'), 'true');
cleanupStaleState(devflowDir);
assert(fs.existsSync(path.join(devflowDir, 'mode')), 'non-stale mode preserved');
assert(fs.existsSync(path.join(devflowDir, 'workflow-active')), 'non-stale workflow-active preserved');

// Test 3: stale state cleaned
fs.writeFileSync(path.join(devflowDir, 'last-change'), String(Date.now() - 31 * 60 * 1000));
fs.writeFileSync(path.join(devflowDir, 'pending'), 'file.js\n');
fs.writeFileSync(path.join(devflowDir, 'workflow-active'), 'true');
cleanupStaleState(devflowDir);
assert(!fs.existsSync(path.join(devflowDir, 'pending')), 'stale pending removed');
assert(!fs.existsSync(path.join(devflowDir, 'mode')), 'stale mode removed');
assert(!fs.existsSync(path.join(devflowDir, 'workflow-active')), 'stale workflow-active removed');

// Test 4: checkRecovery
console.log('\ncheckRecovery:');
assert(!checkRecovery(devflowDir), 'no recovery needed when no flag');

fs.writeFileSync(path.join(devflowDir, 'needs-recovery'), String(Date.now()));
assert(checkRecovery(devflowDir), 'recovery needed when flag exists');
assert(!checkRecovery(devflowDir), 'flag consumed after check');

// Test 5: runCleanup
console.log('\nrunCleanup:');
const result = runCleanup(testCwd);
assert(typeof result.killed === 'number', `runCleanup returns killed count: ${result.killed}`);

// Cleanup
fs.rmSync(testCwd, { recursive: true, force: true });

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
