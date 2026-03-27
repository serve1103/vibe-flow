const { execSync, spawnSync } = require('child_process');
const { extractJson } = require('./extract-json');

const MAX_RETRIES = 1;

function callHaiku(prompt, fallback, options = {}) {
  const budget = options.budget || 0.05;
  const retries = options.retries ?? MAX_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt++) {
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
      if (attempt < retries) continue; // Retry once
      try {
        return typeof fallback === 'string' ? JSON.parse(fallback) : fallback;
      } catch {
        return {};
      }
    } finally {
      // Cleanup: kill any orphaned claude-haiku processes from this call
      cleanupOrphanedHaiku();
    }
  }
}

/**
 * Kill orphaned claude -p --model haiku processes.
 * Called after each Haiku invocation to prevent process accumulation.
 */
function cleanupOrphanedHaiku() {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/F', '/FI', 'WINDOWTITLE eq claude*'], { timeout: 3000 });
    } else {
      // Kill haiku processes that are children of this process or orphaned
      // Use process group: only kill processes started after our PID
      const result = spawnSync('pgrep', ['-f', 'claude -p.*--model claude-haiku'], {
        encoding: 'utf-8',
        timeout: 3000
      });

      if (result.stdout) {
        const myPid = process.pid;
        const pids = result.stdout.trim().split('\n').filter(Boolean);

        for (const pidStr of pids) {
          const pid = parseInt(pidStr, 10);
          if (pid === myPid || isNaN(pid)) continue;

          // Check if process is a child or recently orphaned (ppid=1)
          try {
            const ppidResult = spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
              encoding: 'utf-8',
              timeout: 1000
            });
            const ppid = parseInt((ppidResult.stdout || '').trim(), 10);

            // Kill if orphaned (ppid=1) or child of this process
            if (ppid === 1 || ppid === myPid) {
              process.kill(pid, 'SIGTERM');
            }
          } catch {
            // Process already dead
          }
        }
      }
    }
  } catch {
    // Non-critical, ignore
  }
}

module.exports = { callHaiku };
