const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readFile, writeFile, removeFile } = require('./io');

/**
 * Cleanup stale .devflow/ state and orphaned processes.
 * Called at the start of each hook to ensure clean state.
 */

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function cleanupStaleState(devflowDir) {
  if (!fs.existsSync(devflowDir)) return;

  const timestampFile = path.join(devflowDir, 'last-change');
  const lastChange = parseInt(readFile(timestampFile) || '0', 10);

  if (lastChange <= 0) return;

  const elapsed = Date.now() - lastChange;
  if (elapsed > STALE_THRESHOLD_MS) {
    // State is stale — reset everything
    removeFile(path.join(devflowDir, 'chain-step'));
    removeFile(path.join(devflowDir, 'pending'));
    removeFile(path.join(devflowDir, 'last-change'));
    removeFile(path.join(devflowDir, 'review-targets'));
    removeFile(path.join(devflowDir, 'mode'));
  }
}

function killOrphanedProcesses() {
  try {
    const platform = process.platform;
    let pids = [];

    if (platform === 'win32') {
      // Windows: find claude processes with -p flag
      const result = execSync(
        'wmic process where "commandline like \'%claude -p%--model claude-haiku%\'" get processid',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      pids = result.split('\n')
        .map(line => line.trim())
        .filter(line => /^\d+$/.test(line));
    } else {
      // macOS/Linux: find claude -p processes older than 60 seconds
      const result = execSync(
        'ps aux | grep "[c]laude -p.*--model claude-haiku" | awk \'{print $2, $10}\'',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();

      if (!result) return 0;

      // Filter processes running longer than 60 seconds
      const lines = result.split('\n').filter(Boolean);
      for (const line of lines) {
        const [pid, time] = line.split(/\s+/);
        if (pid && isStaleProcess(time)) {
          pids.push(pid);
        }
      }
    }

    // Kill orphaned processes
    let killed = 0;
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 'SIGTERM');
        killed++;
      } catch {
        // Process already dead or no permission
      }
    }
    return killed;
  } catch {
    return 0;
  }
}

function isStaleProcess(timeStr) {
  if (!timeStr) return false;
  // ps time format: MM:SS or H:MM:SS
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    // MM:SS — stale if > 1 minute
    return parts[0] >= 1;
  }
  if (parts.length === 3) {
    // H:MM:SS — always stale
    return true;
  }
  return false;
}

function runCleanup(cwd) {
  const devflowDir = path.join(cwd, '.devflow');
  const staleCleared = cleanupStaleState(devflowDir);
  const killed = killOrphanedProcesses();
  return { killed };
}

module.exports = { cleanupStaleState, killOrphanedProcesses, runCleanup };
