#!/usr/bin/env node
// Unit test: transcript.js
const { parseTranscript, extractFeedback } = require('../lib/transcript');
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

// Create temp transcript JSONL
const tmpFile = path.join('/tmp', 'devflow-test-transcript.jsonl');

console.log('=== transcript.js tests ===\n');

// Test 1: parseTranscript basic
console.log('parseTranscript:');
const sampleEntries = [
  { type: 'user', message: { content: '버그 고쳐줘' } },
  { type: 'assistant', message: { content: '수정하겠습니다' } },
  { type: 'tool_use', tool_name: 'Edit', tool_input: { file_path: 'src/auth.ts' } },
  { type: 'hook', additionalContext: '[DevFlow 코드 리뷰]\n[high] try-catch 누락 → 에러 핸들링 추가\n\n위 문제를 수정하세요.' },
  { type: 'tool_use', tool_name: 'Edit', tool_input: { file_path: 'src/auth.ts' } },
  { type: 'hook', additionalContext: '[DevFlow 보안 검토]\n이상 없음' },
  { type: 'hook', additionalContext: '[DevFlow] 테스트 제안\n테스트를 작성하세요' },
  { type: 'assistant', message: { content: '다른 작업을 합니다' } }
];

fs.writeFileSync(tmpFile, sampleEntries.map(e => JSON.stringify(e)).join('\n'));
const parsed = parseTranscript(tmpFile, 100);
assert(parsed.length === 8, `parsed ${parsed.length} entries (expected 8)`);

// Test 2: parseTranscript maxLines
const parsedLimited = parseTranscript(tmpFile, 3);
assert(parsedLimited.length === 3, `maxLines=3 → ${parsedLimited.length} entries`);

// Test 3: parseTranscript missing file
const parsedMissing = parseTranscript('/tmp/nonexistent.jsonl', 100);
assert(parsedMissing.length === 0, 'missing file → empty array');

// Test 4: extractFeedback finds DevFlow contexts
console.log('\nextractFeedback:');
const feedback = extractFeedback(parsed);
assert(feedback.length > 0, `found ${feedback.length} feedback items`);

// Test 5: detects code-review skill
const codeReview = feedback.find(f => f.skill === 'code-review');
assert(codeReview !== undefined, 'detected code-review skill');

// Test 6: accepted signal (Edit on same file after review)
if (codeReview) {
  assert(codeReview.signal === 'accepted', `code-review signal: ${codeReview.signal} (expected accepted)`);
}

// Test 7: detects test-suggest skill
const testSuggest = feedback.find(f => f.skill === 'test-suggest');
assert(testSuggest !== undefined, 'detected test-suggest skill');

// Test 8: ignored signal (no Edit after test suggest, just assistant message)
if (testSuggest) {
  assert(testSuggest.signal === 'ignored', `test-suggest signal: ${testSuggest.signal} (expected ignored)`);
}

// Test 9: does NOT match non-DevFlow entries
const userEntry = [{ type: 'user', message: { content: 'I saw [DevFlow review] yesterday' } }];
const noFeedback = extractFeedback(userEntry);
assert(noFeedback.length === 0, 'no false positive from user message');

// Cleanup
fs.unlinkSync(tmpFile);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
