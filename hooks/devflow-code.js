#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./lib/config');
const { readFile, writeFile, appendFile, limitFileLines } = require('./lib/io');
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

  // Recovery: if orphaned processes were killed, reset workflow
  if (checkRecovery(devflowDir)) {
    writeFile(path.join(devflowDir, 'workflow-active'), '');
  }

  // Skip if planning mode
  const mode = readFile(path.join(devflowDir, 'mode'));
  if (mode === 'planning') return output({});

  // File path check + path traversal prevention
  const rawPath = input.tool_input?.file_path || '';
  if (!rawPath) return output({});
  const filePath = path.resolve(rawPath);
  // Block paths containing traversal sequences
  if (rawPath.includes('..')) return output({});

  const basename = path.basename(filePath);
  const ext = path.extname(filePath).replace('.', '');

  // Skip DevFlow's own files (self-reference prevention)
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
  if (pluginRoot && filePath.startsWith(pluginRoot)) return output({});

  // Skip paths (configurable directories)
  const skipPaths = config.skip?.paths || ['hooks/', 'skills/', 'agents/', '.devflow/'];
  for (const sp of skipPaths) {
    if (filePath.includes(sp)) return output({});
  }

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

  appendFile(pendingFile, filePath + '\n');
  limitFileLines(pendingFile, 100);

  const lastChange = parseInt(readFile(timestampFile) || '0', 10);
  if (lastChange > 0 && (now - lastChange) < 5000) {
    writeFile(timestampFile, String(now));
    return output({});
  }
  writeFile(timestampFile, String(now));

  // Skip files written during active workflow (prevents pending contamination)
  // Atomic creation with 'wx' flag prevents TOCTOU race condition
  const workflowFile = path.join(devflowDir, 'workflow-active');
  try {
    fs.writeFileSync(workflowFile, 'true', { flag: 'wx' });
  } catch {
    // File already exists — workflow is active, skip
    return output({});
  }

  // New workflow cycle — clear results and trigger
  const resultsDir = path.join(devflowDir, 'results');
  fs.rmSync(resultsDir, { recursive: true, force: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  // Inject workflow skill invocation
  const inject = '[DevFlow] Skill("devflow:coding-workflow")를 실행하세요.';

  output({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: inject
    }
  });
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}
