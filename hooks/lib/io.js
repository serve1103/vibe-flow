const fs = require('fs');

function readFile(p) {
  try { return fs.readFileSync(p, 'utf-8').trim(); } catch { return ''; }
}

function writeFile(p, content) {
  try { fs.writeFileSync(p, content, 'utf-8'); } catch {}
}

function appendFile(p, content) {
  try { fs.appendFileSync(p, content, 'utf-8'); } catch {}
}

function readFileLines(p) {
  return readFile(p).split('\n').map(s => s.trim()).filter(Boolean);
}

function limitFileLines(p, max) {
  const lines = readFileLines(p);
  if (lines.length > max) {
    writeFile(p, lines.slice(-max).join('\n') + '\n');
  }
}

function removeFile(p) {
  try { fs.unlinkSync(p); } catch {}
}

module.exports = { readFile, writeFile, appendFile, readFileLines, limitFileLines, removeFile };
