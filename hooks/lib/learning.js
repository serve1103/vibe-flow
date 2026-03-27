const fs = require('fs');
const path = require('path');
const { readFile, writeFile } = require('./io');

const MAX_RULES_PER_SKILL = 10;
const EXPIRY_DAYS = 30;
const THRESHOLD = 5;

// Skills excluded from learning (security should never be skipped)
const EXCLUDED_SKILLS = ['security-check'];

/**
 * Load learned rules for a skill.
 */
function loadRules(cwd, skillName) {
  const rulesPath = path.join(cwd, '.devflow', 'learned-rules', `${skillName}.json`);
  try {
    const raw = readFile(rulesPath);
    if (!raw) return { rules: [] };
    const data = JSON.parse(raw);
    return data || { rules: [] };
  } catch {
    return { rules: [] };
  }
}

/**
 * Save learned rules for a skill.
 */
function saveRules(cwd, skillName, data) {
  const dir = path.join(cwd, '.devflow', 'learned-rules');
  fs.mkdirSync(dir, { recursive: true });
  writeFile(path.join(dir, `${skillName}.json`), JSON.stringify(data, null, 2));
}

/**
 * Get active (non-expired) rules for a skill.
 */
function getActiveRules(cwd, skillName) {
  if (EXCLUDED_SKILLS.includes(skillName)) return [];

  const data = loadRules(cwd, skillName);
  const now = new Date();

  return data.rules.filter(r => {
    if (!r.expires) return true;
    return new Date(r.expires) > now;
  });
}

/**
 * Format active rules as text for Haiku prompt injection.
 */
function formatRulesForPrompt(cwd, skillName) {
  const rules = getActiveRules(cwd, skillName);
  if (rules.length === 0) return '';

  const lines = rules.map(r => `- ${r.pattern}: ${r.action} (${r.reason})`).join('\n');
  return `\n\n## 학습된 규칙 (자동 생성)\n다음 패턴은 이 프로젝트에서 무시하세요:\n${lines}`;
}

/**
 * Process feedback analysis results and update learned rules.
 * feedbackItems: [{ skill, suggestion, signal, count }]
 */
function updateRules(cwd, feedbackItems) {
  // Group by skill + suggestion pattern
  const grouped = {};
  for (const item of feedbackItems) {
    if (EXCLUDED_SKILLS.includes(item.skill)) continue;
    if (item.signal !== 'ignored' && item.signal !== 'rejected') continue;

    const key = `${item.skill}:${normalizePattern(item.suggestion)}`;
    if (!grouped[key]) {
      grouped[key] = { skill: item.skill, pattern: normalizePattern(item.suggestion), count: 0 };
    }
    grouped[key].count += (item.count || 1);
  }

  // Check threshold and create rules
  for (const entry of Object.values(grouped)) {
    if (entry.count < THRESHOLD) continue;

    const data = loadRules(cwd, entry.skill);
    const now = new Date();
    const expires = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Check if rule already exists
    const existing = data.rules.find(r => r.pattern === entry.pattern);
    if (existing) {
      existing.count = entry.count;
      existing.expires = expires.toISOString().split('T')[0];
    } else {
      data.rules.push({
        pattern: entry.pattern,
        action: 'skip',
        reason: `${entry.count}회 무시됨 — 이 프로젝트에서 의도적 패턴으로 판단`,
        created: now.toISOString().split('T')[0],
        expires: expires.toISOString().split('T')[0],
        count: entry.count
      });
    }

    // Remove expired rules
    data.rules = data.rules.filter(r => !r.expires || new Date(r.expires) > now);

    // Enforce max rules (remove oldest)
    if (data.rules.length > MAX_RULES_PER_SKILL) {
      data.rules.sort((a, b) => new Date(a.created) - new Date(b.created));
      data.rules = data.rules.slice(-MAX_RULES_PER_SKILL);
    }

    saveRules(cwd, entry.skill, data);
  }
}

/**
 * Normalize a suggestion pattern for matching.
 * Extracts key terms, lowercases, removes noise.
 */
function normalizePattern(suggestion) {
  return suggestion
    .replace(/\[.*?\]/g, '')       // Remove severity tags
    .replace(/[^\w가-힣\s→]/g, '') // Keep words + Korean + space + arrow
    .trim()
    .toLowerCase()
    .substring(0, 80);
}

module.exports = { loadRules, getActiveRules, formatRulesForPrompt, updateRules, normalizePattern };
