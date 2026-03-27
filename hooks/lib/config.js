const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  planning: { enabled: true },
  coding: {
    code_review: { enabled: true },
    security_review: { enabled: true },
    test: { enabled: true },
    commit: { enabled: true },
    docs: { enabled: true }
  },
  skip: {
    prefix: '!',
    extensions: ['md','json','yaml','yml','txt','toml','lock','env','cfg','ini','csv'],
    filenames: ['.gitignore','.dockerignore','Makefile','Dockerfile','LICENSE'],
    prefixes: ['.env'],
    paths: ['.devflow/', '.claude/']
  }
};

function loadConfig(cwd) {
  const configPath = path.join(cwd, '.devflow.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(raw);
    return deepMerge(DEFAULTS, userConfig);
  } catch {
    return DEFAULTS;
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { loadConfig, DEFAULTS };
