# Port Management Guide

This guide explains how to handle port conflicts in the NestJS backend application.

## Features

✅ **Automatic Port Finding**: If port 3001 is busy, automatically tries 3002, 3003, etc.  
✅ **Cross-Platform Support**: Works on Windows, Mac, and Linux  
✅ **Process Killing**: Optionally kill processes blocking ports  
✅ **Graceful Error Handling**: Clear error messages and troubleshooting tips  

## Quick Start

### Basic Usage

```bash
# Standard start (will auto-find port if 3001 is busy)
npm run start:dev

# Start with automatic process killing
npm run start:dev:kill

# Start on a specific port
PORT=3002 npm run start:dev
```

## Environment Variables

Add these to your `.env` file:

```env
# Base port (default: 3001)
PORT=3001

# Automatically kill processes on port conflicts (default: false)
AUTO_KILL_PORT=true

# Maximum port attempts when finding available port (default: 10)
MAX_PORT_ATTEMPTS=10
```

## NPM Scripts

### Development

- `npm run start:dev` - Start with auto port finding
- `npm run start:dev:kill` - Start with auto-kill enabled
- `npm run start:dev:port` - Start on port 3002

### Port Management

- `npm run kill:3001` - Kill process on port 3001
- `npm run kill:port [port]` - Kill process on any port
- `npm run check:port [port]` - Check if a port is available

## Manual Port Management

### Windows

```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process by PID
taskkill /F /PID <process_id>

# Or use the script
npm run kill:port 3001
```

### Mac / Linux

```bash
# Find process using port 3001
lsof -ti:3001

# Kill process
lsof -ti:3001 | xargs kill -9

# Or use the script
npm run kill:port 3001
```

## How It Works

1. **Port Check**: On startup, checks if the base port (3001) is available
2. **Auto-Increment**: If busy, automatically tries next ports (3002, 3003, etc.)
3. **Process Killing**: If `AUTO_KILL_PORT=true`, attempts to kill the blocking process
4. **Error Handling**: Provides clear error messages and troubleshooting tips

## Example Output

### Port Available
```
🚀 Application is running on: http://localhost:3001
📝 Environment: development
```

### Port Busy (Auto-Increment)
```
⚠️  Port 3001 is already in use. Attempting to find an available port...
ℹ️  Using alternative port: 3002 (base port 3001 was in use)
🚀 Application is running on: http://localhost:3002
⚠️  NOTE: Server is running on port 3002 instead of 3001.
   Update your frontend API_BASE_URL or set PORT=3002 environment variable.
```

### Port Busy (Auto-Kill)
```
⚠️  Port 3001 is already in use. Attempting to find an available port...
Attempting to kill process on port 3001...
✓ Successfully killed process 12345 on port 3001
✓ Port 3001 is now available after killing the process.
🚀 Application is running on: http://localhost:3001
```

## Troubleshooting

### Port Still in Use After Killing

1. Wait a few seconds for the port to be released
2. Check if multiple processes are using the port
3. Restart your terminal/IDE
4. Use a different port: `PORT=3002 npm run start:dev`

### Frontend Can't Connect

If the backend starts on a different port, update your frontend:

```typescript
// frontend/lib/api/client.ts
const API_BASE_URL = "http://localhost:3002"; // Update to match backend port
```

Or set the port in `.env`:
```env
PORT=3001
```

## Advanced Usage

### Custom Port Range

```typescript
// In main.ts, modify:
const maxPortAttempts = 20; // Try up to 20 ports
```

### Programmatic Usage

```typescript
import { findAvailablePort, killProcessByPort } from './utils/port.util';

// Find available port
const port = await findAvailablePort(3001, 10);

// Kill process on port
await killProcessByPort(3001);
```








