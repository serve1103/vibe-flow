const fs = require('fs');

/**
 * Parse Claude Code transcript JSONL file.
 * Returns array of message objects from the last N lines.
 */
function parseTranscript(transcriptPath, maxLines) {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Only parse last N lines to avoid performance issues
    const start = maxLines ? Math.max(0, lines.length - maxLines) : 0;
    const entries = [];

    for (let i = start; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Extract DevFlow review suggestions and their outcomes from transcript.
 * Returns array of { skill, suggestion, signal, file }
 */
function extractFeedback(entries) {
  const feedback = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Find DevFlow additionalContext injections
    const devflowContext = findDevFlowContext(entry);
    if (!devflowContext) continue;

    const skill = detectSkill(devflowContext);
    const suggestion = extractSuggestion(devflowContext);
    const reviewedFiles = extractReviewedFiles(devflowContext);

    // Look ahead for Claude's response
    const signal = determineSignal(entries, i, reviewedFiles);

    if (skill && suggestion) {
      feedback.push({
        skill,
        suggestion: suggestion.substring(0, 100),
        signal,
        file: reviewedFiles[0] || ''
      });
    }
  }

  return feedback;
}

function findDevFlowContext(entry) {
  // Look for DevFlow markers in various message structures
  const text = JSON.stringify(entry);
  if (text.includes('[DevFlow')) {
    // Extract the DevFlow-related content
    const match = text.match(/\[DevFlow[^\]]*\][^"']*/);
    return match ? match[0] : null;
  }
  return null;
}

function detectSkill(context) {
  if (/코드 리뷰|code.?review/i.test(context)) return 'code-review';
  if (/보안 검토|security/i.test(context)) return 'security-check';
  if (/테스트|test/i.test(context)) return 'test-suggest';
  if (/문서 갱신|doc/i.test(context)) return 'doc-update';
  if (/커밋|commit/i.test(context)) return 'commit';
  if (/기획 모드|인터뷰/i.test(context)) return 'interview';
  if (/비판적 검토/i.test(context)) return 'critical-review';
  return null;
}

function extractSuggestion(context) {
  // Extract the core suggestion text
  const lines = context.split('\n').filter(l => l.trim());
  // Find lines with severity markers or suggestion content
  for (const line of lines) {
    if (/\[(high|critical)\]/.test(line)) return line.trim();
  }
  return lines[0] || '';
}

function extractReviewedFiles(context) {
  const files = [];
  const match = context.match(/파일:\s*(.+)/);
  if (match) {
    files.push(...match[1].split(',').map(f => f.trim()));
  }
  return files;
}

function determineSignal(entries, devflowIndex, reviewedFiles) {
  // Look at the next few entries after DevFlow injection
  for (let j = devflowIndex + 1; j < Math.min(devflowIndex + 5, entries.length); j++) {
    const next = entries[j];
    const text = JSON.stringify(next);

    // Check for user rejection keywords
    if (/불필요|무시|스킵|skip|ignore/i.test(text)) {
      return 'rejected';
    }

    // Check for Edit/Write on the same reviewed files
    if (text.includes('Write') || text.includes('Edit')) {
      if (reviewedFiles.length === 0) return 'accepted';
      // Check if the edit targets a reviewed file
      for (const f of reviewedFiles) {
        if (text.includes(f)) return 'accepted';
      }
    }
  }

  return 'ignored';
}

module.exports = { parseTranscript, extractFeedback };
