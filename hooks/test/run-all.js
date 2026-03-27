#!/usr/bin/env node
// DevFlow 전체 테스트 러너
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testDir = __dirname;
const testFiles = fs.readdirSync(testDir)
  .filter(f => f.startsWith('test-') && f.endsWith('.js') && f !== 'run-all.js')
  .sort();

let totalPassed = 0;
let totalFailed = 0;
const results = [];

console.log('╔════════════════════════════════════╗');
console.log('║     DevFlow Test Suite v0.5.0      ║');
console.log('╚════════════════════════════════════╝\n');

for (const file of testFiles) {
  const filePath = path.join(testDir, file);
  try {
    const output = execSync(`node "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: path.resolve(testDir, '..', '..') }
    });

    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;

    totalPassed += passed;
    totalFailed += failed;
    results.push({ file, passed, failed, status: failed === 0 ? '✓' : '✗' });
  } catch (e) {
    const output = e.stdout || '';
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;

    totalPassed += passed;
    totalFailed += failed;
    results.push({ file, passed, failed, status: '✗' });
  }
}

console.log('┌──────────────────────────────┬────────┬────────┬────────┐');
console.log('│ Test File                    │ Passed │ Failed │ Status │');
console.log('├──────────────────────────────┼────────┼────────┼────────┤');
for (const r of results) {
  const name = r.file.replace('test-', '').replace('.js', '').padEnd(28);
  console.log(`│ ${name} │ ${String(r.passed).padStart(6)} │ ${String(r.failed).padStart(6)} │   ${r.status}    │`);
}
console.log('├──────────────────────────────┼────────┼────────┼────────┤');
console.log(`│ TOTAL                        │ ${String(totalPassed).padStart(6)} │ ${String(totalFailed).padStart(6)} │   ${totalFailed === 0 ? '✓' : '✗'}    │`);
console.log('└──────────────────────────────┴────────┴────────┴────────┘');

process.exit(totalFailed > 0 ? 1 : 0);
