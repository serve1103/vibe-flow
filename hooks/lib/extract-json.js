function extractJson(text, fallback) {
  // Try markdown code block first
  const cbMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (cbMatch) {
    try { return JSON.parse(cbMatch[1]); } catch {}
  }
  // Try all { ... } candidates (non-greedy, supports one level nesting)
  const candidates = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }
  return typeof fallback === 'string' ? JSON.parse(fallback) : fallback;
}

module.exports = { extractJson };
