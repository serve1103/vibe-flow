function extractJson(text, fallback) {
  // Try markdown code block first (greedy inside code block boundaries)
  const cbMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (cbMatch) {
    try { return JSON.parse(cbMatch[1]); } catch {}
  }
  // Try all { ... } candidates (non-greedy, supports one level nesting)
  const candidates = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }
  try {
    return typeof fallback === 'string' ? JSON.parse(fallback) : fallback;
  } catch {
    return {};
  }
}

module.exports = { extractJson };
