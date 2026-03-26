const { execSync } = require('child_process');
const { extractJson } = require('./extract-json');

function callHaiku(prompt, fallback, options = {}) {
  const budget = options.budget || 0.05;
  try {
    const result = execSync(
      `claude -p --model claude-haiku-4-5-20251001 --max-turns 1 --max-budget-usd ${budget} --output-format json`,
      {
        input: prompt,
        encoding: 'utf-8',
        timeout: 20000,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    // claude -p --output-format json returns a result wrapper
    const wrapper = JSON.parse(result);
    const text = wrapper.result || '';
    return extractJson(text, fallback);
  } catch {
    try {
      return typeof fallback === 'string' ? JSON.parse(fallback) : fallback;
    } catch {
      return {};
    }
  }
}

module.exports = { callHaiku };
