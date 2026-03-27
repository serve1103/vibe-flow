#!/usr/bin/env node
// Stop hook — analyzes transcript for DevFlow feedback and updates learned rules
const fs = require('fs');
const path = require('path');
const { parseTranscript, extractFeedback } = require('./lib/transcript');
const { updateRules } = require('./lib/learning');
const { readFile, writeFile, appendFile } = require('./lib/io');

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
  const transcriptPath = input.transcript_path || '';
  const cwd = input.cwd || '.';
  const sessionId = input.session_id || '';

  if (!transcriptPath) return output({});

  // Only analyze if DevFlow config exists
  const configPath = path.join(cwd, '.devflow.json');
  if (!fs.existsSync(configPath)) return output({});

  const feedbackDir = path.join(cwd, '.devflow', 'feedback');
  fs.mkdirSync(feedbackDir, { recursive: true });

  // Check if already analyzed this session to avoid duplicate work
  const lastAnalyzed = readFile(path.join(feedbackDir, 'last-analyzed'));
  if (lastAnalyzed === sessionId) return output({});

  // Parse last 200 lines of transcript (performance guard)
  const entries = parseTranscript(transcriptPath, 200);
  if (entries.length === 0) return output({});

  // Extract DevFlow feedback signals
  const feedback = extractFeedback(entries);
  if (feedback.length === 0) {
    writeFile(path.join(feedbackDir, 'last-analyzed'), sessionId);
    return output({});
  }

  // Record feedback to analysis.jsonl
  const analysisFile = path.join(feedbackDir, 'analysis.jsonl');
  for (const item of feedback) {
    const entry = JSON.stringify({
      timestamp: Date.now(),
      session_id: sessionId,
      skill: item.skill,
      suggestion: item.suggestion,
      signal: item.signal,
      file: item.file
    });
    appendFile(analysisFile, entry + '\n');
  }

  // Aggregate analysis.jsonl and update learned rules
  try {
    const raw = readFile(analysisFile);
    if (raw) {
      const allFeedback = raw.trim().split('\n')
        .filter(Boolean)
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);

      // Group by skill + normalized suggestion, count signals
      const counts = {};
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      for (const f of allFeedback) {
        if (f.timestamp < thirtyDaysAgo) continue; // Skip old entries
        const key = `${f.skill}:${f.suggestion}`;
        if (!counts[key]) {
          counts[key] = { skill: f.skill, suggestion: f.suggestion, signal: f.signal, count: 0 };
        }
        if (f.signal === 'ignored' || f.signal === 'rejected') {
          counts[key].count++;
        }
      }

      const aggregated = Object.values(counts).filter(c => c.count > 0);
      if (aggregated.length > 0) {
        updateRules(cwd, aggregated);
      }

      // Cleanup old entries (> 30 days)
      const recentEntries = allFeedback
        .filter(f => f.timestamp >= thirtyDaysAgo)
        .map(f => JSON.stringify(f))
        .join('\n');
      if (recentEntries) {
        writeFile(analysisFile, recentEntries + '\n');
      }
    }
  } catch {
    // Non-critical, continue
  }

  writeFile(path.join(feedbackDir, 'last-analyzed'), sessionId);
  output({});
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}
