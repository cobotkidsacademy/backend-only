#!/usr/bin/env node

/**
 * Check if a port is available
 * Usage: node scripts/check-port.js [port]
 * Example: node scripts/check-port.js 3001
 */

const net = require('net');

const port = process.argv[2] || process.env.PORT || '3001';

function checkPort(port) {
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

async function main() {
  const portNum = parseInt(port, 10);

  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    console.error(`✗ Invalid port number: ${port}`);
    process.exit(1);
  }

  console.log(`Checking port ${portNum}...`);

  const available = await checkPort(portNum);

  if (available) {
    console.log(`✓ Port ${portNum} is available`);
    process.exit(0);
  } else {
    console.log(`✗ Port ${portNum} is already in use`);
    console.log('\nTo kill the process using this port:');
    if (process.platform === 'win32') {
      console.log(`  Windows: netstat -ano | findstr :${portNum}`);
      console.log(`  Then: taskkill /F /PID <process_id>`);
    } else {
      console.log(`  Mac/Linux: lsof -ti:${portNum} | xargs kill -9`);
    }
    console.log(`\nOr use: npm run kill:port ${portNum}`);
    process.exit(1);
  }
}

main();









