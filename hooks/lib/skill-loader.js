const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.resolve(__dirname, '..', '..');

function loadSkillPrompt(skillName) {
  const skillDir = path.join(PLUGIN_ROOT, 'skills', skillName);
  const skillPath = path.join(skillDir, 'SKILL.md');

  try {
    let content = fs.readFileSync(skillPath, 'utf-8');
    // frontmatter 제거
    content = content.replace(/^---[\s\S]*?---\n/, '').trim();

    // references/ 인라인
    const refsDir = path.join(skillDir, 'references');
    if (fs.existsSync(refsDir)) {
      const entries = fs.readdirSync(refsDir, { withFileTypes: true });
      const refs = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name);
      for (const ref of refs) {
        const refContent = fs.readFileSync(path.join(refsDir, ref), 'utf-8').trim();
        if (refContent) {
          content += `\n\n---\n## ${ref.replace('.md', '')}\n${refContent}`;
        }
      }
    }

    return content;
  } catch {
    return null; // 스킬 없으면 null → 폴백 프롬프트 사용
  }
}

module.exports = { loadSkillPrompt };
