#!/usr/bin/env node
// PostToolUse async observer — records Write/Edit observations for learning
const fs = require('fs');
const path = require('path');

const SECRET_PATTERN = /(?:api[_-]?key|token|secret|password|credential|auth)\s*[:=]\s*["'][^"']{8,}["']/gi;

let inputData = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => inputData += chunk);
process.stdin.on('end', () => {
  try {
    main(JSON.parse(inputData));
  } catch {
    process.stdout.write(JSON.stringify({}));
  }
});

function main(input) {
  const toolName = input.tool_name || '';
  const cwd = input.cwd || '.';
  const sessionId = input.session_id || '';

  if (toolName !== 'Write' && toolName !== 'Edit') {
    return output({});
  }

  const filePath = input.tool_input?.file_path || '';
  if (!filePath) return output({});

  // Extract context (first 50 chars of change)
  let context = '';
  if (toolName === 'Edit') {
    context = (input.tool_input?.new_string || '').substring(0, 50);
  } else {
    context = (input.tool_input?.content || '').substring(0, 50);
  }

  // Scrub secrets
  context = context.replace(SECRET_PATTERN, '[REDACTED]');

  const feedbackDir = path.join(cwd, '.devflow', 'feedback');
  fs.mkdirSync(feedbackDir, { recursive: true });

  const obsFile = path.join(feedbackDir, 'observations.jsonl');

  // Append observation
  const entry = JSON.stringify({
    timestamp: Date.now(),
    session_id: sessionId,
    tool: toolName,
    file: filePath,
    context: context
  });

  try {
    fs.appendFileSync(obsFile, entry + '\n', 'utf-8');

    // Size management: truncate if > 1MB
    const stat = fs.statSync(obsFile);
    if (stat.size > 1024 * 1024) {
      const lines = fs.readFileSync(obsFile, 'utf-8').trim().split('\n');
      const half = lines.slice(Math.floor(lines.length / 2));
      fs.writeFileSync(obsFile, half.join('\n') + '\n', 'utf-8');
    }
  } catch {
    // Non-blocking, ignore errors
  }

  output({});
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}
