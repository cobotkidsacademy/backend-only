#!/usr/bin/env node

/**
 * Cross-platform script to kill a process using a specific port
 * Usage: node scripts/kill-port.js [port]
 * Example: node scripts/kill-port.js 3001
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const port = process.argv[2] || process.env.PORT || '3001';

async function getProcessId(port) {
  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      const { stdout } = await execPromise(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
      );
      const match = stdout.match(/\s+(\d+)\s*$/);
      return match ? match[1] : null;
    } else {
      // Mac/Linux
      const { stdout } = await execPromise(`lsof -ti:${port}`);
      return stdout.trim().split('\n')[0] || null;
    }
  } catch (error) {
    return null;
  }
}

async function killProcess(pid) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;

  try {
    await execPromise(command);
    console.log(`✓ Successfully killed process ${pid} on port ${port}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to kill process ${pid}:`, error.message);
    return false;
  }
}

async function main() {
  console.log(`Checking port ${port}...`);

  const pid = await getProcessId(port);

  if (!pid) {
    console.log(`ℹ️  No process found using port ${port}`);
    process.exit(0);
  }

  console.log(`Found process ${pid} using port ${port}`);
  const killed = await killProcess(pid);

  if (killed) {
    console.log(`✓ Port ${port} is now free`);
    process.exit(0);
  } else {
    console.error(`✗ Failed to free port ${port}`);
    process.exit(1);
  }
}

main();










