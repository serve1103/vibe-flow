#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./lib/config');
const { callHaiku } = require('./lib/haiku');
const { readFile, writeFile, appendFile, readFileLines, limitFileLines } = require('./lib/io');
const { cleanupStaleState, checkRecovery } = require('./lib/cleanup');

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
  const toolName = input.tool_name || '';
  const cwd = input.cwd || '.';
  const devflowDir = path.join(cwd, '.devflow');
  const config = loadConfig(cwd);

  // Only Write/Edit
  if (toolName !== 'Write' && toolName !== 'Edit') return output({});

  // Cleanup stale state (30min threshold)
  cleanupStaleState(devflowDir);

  fs.mkdirSync(devflowDir, { recursive: true });

  // Recovery: if orphaned processes were killed, restart from step 1
  if (checkRecovery(devflowDir)) {
    writeFile(path.join(devflowDir, 'chain-step'), '1');
    writeFile(path.join(devflowDir, 'pending'), '');
  }

  // Skip if planning mode
  const mode = readFile(path.join(devflowDir, 'mode'));
  if (mode === 'planning') return output({});

  // File path check
  const filePath = input.tool_input?.file_path || '';
  if (!filePath) return output({});

  const basename = path.basename(filePath);
  const ext = path.extname(filePath).replace('.', '');

  // Skip filenames
  const skipFilenames = config.skip?.filenames || [];
  if (skipFilenames.includes(basename)) return output({});

  // Skip prefixes (.env, .env.local, etc.)
  const skipPrefixes = config.skip?.prefixes || ['.env'];
  for (const prefix of skipPrefixes) {
    if (basename.startsWith(prefix)) return output({});
  }

  // Skip extensions
  const skipExts = config.skip?.extensions || [];
  if (skipExts.includes(ext)) return output({});

  // Debouncing (5000 millisecond threshold)
  const pendingFile = path.join(devflowDir, 'pending');
  const timestampFile = path.join(devflowDir, 'last-change');
  const now = Date.now();

  // Note: race condition possible with concurrent hooks, acceptable for MVP
  appendFile(pendingFile, filePath + '\n');
  limitFileLines(pendingFile, 100);

  const lastChange = parseInt(readFile(timestampFile) || '0', 10);
  if (lastChange > 0 && (now - lastChange) < 5000) {
    writeFile(timestampFile, String(now));
    return output({});
  }
  writeFile(timestampFile, String(now));

  // Chain step
  const chainStepFile = path.join(devflowDir, 'chain-step');
  const chainStep = parseInt(readFile(chainStepFile) || '1', 10);

  let inject = '';

  switch (chainStep) {
    case 1: {
      // Step 1: Code review + Security review
      let pendingFiles = readFileLines(pendingFile);
      pendingFiles = [...new Set(pendingFiles)].join(', ');
      writeFile(pendingFile, '');

      if (!pendingFiles) pendingFiles = filePath;

      // Save review targets for step 3
      writeFile(path.join(devflowDir, 'review-targets'), pendingFiles);

      // Get code content (include old/new for Edit tool)
      let codeContent = '';
      if (toolName === 'Edit') {
        const oldStr = input.tool_input?.old_string || '';
        const newStr = input.tool_input?.new_string || '';
        codeContent = `변경 전:\n${oldStr}\n\n변경 후:\n${newStr}`;
      } else {
        codeContent = input.tool_input?.content || input.tool_input?.new_string || '';
        const totalLines = codeContent.split('\n').length;
        const lines = codeContent.split('\n').slice(0, 200);
        codeContent = lines.join('\n');
        if (totalLines > 200) codeContent += `\n\n... (${totalLines}줄 중 200줄만 표시)`;
      }

      if (!codeContent.trim()) {
        writeFile(chainStepFile, '2');
        return output({});
      }

      let reviewResult = '';

      // Code review
      if (config.coding.code_review?.enabled) {
        const reviewPrompt = `다음 코드 변경을 리뷰하세요. high 이상 심각도의 문제만 보고하세요.\n\n파일: ${pendingFiles}\n코드:\n<code>\n${codeContent}\n</code>\n\nJSON으로만 응답:\n문제없음: {"issues":[]}\n문제있음: {"issues":[{"severity":"high","description":"설명","suggestion":"제안"}]}`;

        const review = callHaiku(reviewPrompt, { issues: [] });
        if (review.issues && review.issues.length > 0) {
          const issues = review.issues.map(i => `[${i.severity}] ${i.description} → ${i.suggestion}`).join('\n');
          reviewResult += `[DevFlow 코드 리뷰]\n${issues}\n\n`;
        }
      }

      // Security review
      if (config.coding.security_review?.enabled) {
        const secPrompt = `다음 코드에서 보안 취약점을 체크하세요.\n체크 항목: SQL injection, 하드코딩된 시크릿/API키, 경로 탐색, 인증 우회\n\n파일: ${pendingFiles}\n코드:\n<code>\n${codeContent}\n</code>\n\nJSON으로만 응답:\n안전: {"safe":true}\n취약점: {"safe":false,"issues":[{"severity":"critical","description":"설명"}]}`;

        const security = callHaiku(secPrompt, { safe: true });
        if (security.safe === false && security.issues) {
          const secIssues = security.issues.map(i => `[${i.severity}] ${i.description}`).join('\n');
          reviewResult += `[DevFlow 보안 검토]\n${secIssues}\n\n`;
        }
      }

      if (reviewResult) inject = reviewResult + '위 문제를 수정하세요.';
      writeFile(chainStepFile, '2');
      break;
    }

    case 2: {
      // Step 2: Test suggestion
      if (config.coding.test?.enabled) {
        inject = '[DevFlow] 변경된 코드에 대한 테스트를 작성하고 실행하세요.';
      }
      writeFile(chainStepFile, '3');
      break;
    }

    case 3: {
      // Step 3: Docs update suggestion (path-based)
      let docSuggest = '';
      if (config.coding.docs?.enabled) {
        const reviewTargets = readFile(path.join(devflowDir, 'review-targets')) || filePath;
        if (/route|api|endpoint|controller/i.test(reviewTargets)) {
          docSuggest = 'API 관련 코드가 변경되었습니다. API 문서를 갱신하세요.';
        } else if (/schema|model|migration|table/i.test(reviewTargets)) {
          docSuggest = '데이터 모델 관련 코드가 변경되었습니다. 모델/스키마 문서를 갱신하세요.';
        }
      }

      if (docSuggest) {
        inject = `[DevFlow] ${docSuggest}`;
        writeFile(chainStepFile, '4');
      } else {
        // Skip to commit
        if (config.coding.commit?.enabled) {
          inject = '[DevFlow] 모든 변경이 완료되었으면 커밋하세요. Conventional Commits 형식을 사용하세요.';
        }
        writeFile(chainStepFile, '1');
        writeFile(pendingFile, '');
      }
      break;
    }

    case 4: {
      // Step 4: Commit suggestion
      if (config.coding.commit?.enabled) {
        inject = '[DevFlow] 모든 변경이 완료되었으면 커밋하세요. Conventional Commits 형식을 사용하세요.';
      }
      writeFile(chainStepFile, '1');
      writeFile(pendingFile, '');
      break;
    }

    default:
      writeFile(chainStepFile, '1');
      break;
  }

  if (inject) {
    output({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: inject
      }
    });
  } else {
    output({});
  }
}

// Utility functions
function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}
