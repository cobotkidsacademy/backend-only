import * as net from 'net';

/**
 * Check if a port is available
 * @param port - Port number to check
 * @returns Promise<boolean> - True if port is available, false otherwise
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Find an available port starting from a base port
 * @param basePort - Starting port number
 * @param maxAttempts - Maximum number of ports to try (default: 10)
 * @returns Promise<number> - Available port number
 * @throws Error if no available port found
 */
export async function findAvailablePort(
  basePort: number,
  maxAttempts: number = 10,
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = basePort + i;
    const available = await isPortAvailable(port);
    
    if (available) {
      return port;
    }
  }
  
  throw new Error(
    `No available port found in range ${basePort}-${basePort + maxAttempts - 1}`,
  );
}

/**
 * Get process ID using a specific port (cross-platform)
 * @param port - Port number
 * @returns Promise<string | null> - Process ID or null if not found
 */
export async function getProcessIdByPort(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const isWindows = process.platform === 'win32';
    
    const command = isWindows
      ? `netstat -ano | findstr :${port} | findstr LISTENING`
      : `lsof -ti:${port}`;
    
    exec(command, (error: Error | null, stdout: string) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }
      
      if (isWindows) {
        // Extract PID from Windows netstat output
        const match = stdout.match(/\s+(\d+)\s*$/);
        resolve(match ? match[1] : null);
      } else {
        // Unix/Mac: lsof returns PID directly
        resolve(stdout.trim().split('\n')[0] || null);
      }
    });
  });
}

/**
 * Kill process by port (cross-platform)
 * @param port - Port number
 * @returns Promise<boolean> - True if process was killed, false otherwise
 */
export async function killProcessByPort(port: number): Promise<boolean> {
  const pid = await getProcessIdByPort(port);
  
  if (!pid) {
    return false;
  }
  
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const isWindows = process.platform === 'win32';
    
    const command = isWindows
      ? `taskkill /F /PID ${pid}`
      : `kill -9 ${pid}`;
    
    exec(command, (error: Error | null) => {
      if (error) {
        console.warn(`Failed to kill process ${pid} on port ${port}:`, error.message);
        resolve(false);
      } else {
        console.log(`✓ Successfully killed process ${pid} on port ${port}`);
        resolve(true);
      }
    });
  });
}








