import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  findAvailablePort,
  isPortAvailable,
  killProcessByPort,
} from './utils/port.util';
import { getCorsConfig } from './config/cors.config';
import { ResponseCompressInterceptor } from './core/interceptors/response-compress.interceptor';
import { PerformanceInterceptor } from './core/interceptors/performance.interceptor';
import * as express from 'express';
// Compression middleware (install: npm install compression @types/compression)
// For now, using conditional import to avoid breaking if not installed
let compression: any;
try {
  compression = require('compression');
} catch (e) {
  console.warn('⚠️  Compression middleware not installed. Install with: npm install compression @types/compression');
}

async function bootstrap() {
  // Set timezone to Africa/Nairobi for all date operations
  process.env.TZ = 'Africa/Nairobi';
  
  const app = await NestFactory.create(AppModule, {
    bodyParser: true, // Enable body parser
  });

  // Increase body parser limit to handle large .sb3 files (base64 encoded)
  // Default is 100kb, we need much more for Scratch projects
  // 50MB should be enough for most projects (base64 increases size by ~33%)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  console.log('✅ Body parser configured with 50MB limit for .sb3 file uploads');

  // Enable compression (gzip/brotli) for all responses
  // This significantly reduces bandwidth, critical for low-bandwidth scenarios
  if (compression) {
    app.use(compression({
      filter: (req: any, res: any) => {
        // Compress all responses except when explicitly disabled
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6, // Balance between compression ratio and CPU usage (1-9)
      threshold: 1024, // Only compress responses larger than 1KB
    }));
    console.log('✅ Response compression enabled');
  }

  // Enable CORS with proper configuration for development and production
  const corsOptions = getCorsConfig();
  app.enableCors(corsOptions);

  // Add global HTTP keep-alive headers middleware
  app.use((req: any, res: any, next: any) => {
    // Set keep-alive headers to maintain persistent connections
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=65, max=1000'); // 65 seconds, max 1000 requests
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Global interceptors for performance optimization
  app.useGlobalInterceptors(
    new ResponseCompressInterceptor(), // Removes null/undefined fields, reduces payload size by 10-30%
    new PerformanceInterceptor(), // Logs response times, detects slow requests
  );

  // Global validation pipe with detailed error messages
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Changed to false to be more lenient
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => {
          const constraints = error.constraints
            ? Object.values(error.constraints)
            : [];
          console.log(`Validation error for ${error.property}:`, constraints);
          return `${error.property}: ${constraints.join(', ')}`;
        });
        console.log('All validation errors:', messages);
        return new BadRequestException(messages);
      },
    }),
  );

  // Get base port from environment or default to 3001
  const basePort = parseInt(process.env.PORT || '3001', 10);
  const isProduction = process.env.NODE_ENV === 'production';
  const autoKill = process.env.AUTO_KILL_PORT === 'true';
  const maxPortAttempts = parseInt(
    process.env.MAX_PORT_ATTEMPTS || '10',
    10,
  );

  let port: number;

  try {
    // In production (e.g., Railway), skip port checking and use PORT directly
    if (isProduction) {
      port = basePort;
      console.log(`🚀 Production mode: Using port ${port} from environment variable`);
    } else {
      // In development, check if port is available
      const basePortAvailable = await isPortAvailable(basePort);

      if (!basePortAvailable) {
        console.warn(
          `⚠️  Port ${basePort} is already in use. Attempting to find an available port...`,
        );

        // Optionally try to kill the process on the base port
        if (autoKill) {
          console.log(`Attempting to kill process on port ${basePort}...`);
          const killed = await killProcessByPort(basePort);
          if (killed) {
            // Wait a moment for the port to be released
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const nowAvailable = await isPortAvailable(basePort);
            if (nowAvailable) {
              port = basePort;
              console.log(`✓ Port ${basePort} is now available after killing the process.`);
            } else {
              port = await findAvailablePort(basePort, maxPortAttempts);
              console.log(
                `⚠️  Port ${basePort} still in use. Using alternative port: ${port}`,
              );
            }
          } else {
            port = await findAvailablePort(basePort, maxPortAttempts);
            console.log(
              `⚠️  Could not kill process on port ${basePort}. Using alternative port: ${port}`,
            );
          }
        } else {
          // Find next available port
          port = await findAvailablePort(basePort, maxPortAttempts);
          console.log(
            `ℹ️  Using alternative port: ${port} (base port ${basePort} was in use)`,
          );
        }
      } else {
        port = basePort;
      }
    }

    const server = await app.listen(port);
    
    // Configure HTTP keep-alive settings to prevent connections from timing out
    if (server && typeof server.setTimeout === 'function') {
      // Set server timeout to 2 minutes (prevents connections from hanging)
      server.setTimeout(120000);
      server.keepAliveTimeout = 65000; // 65 seconds (slightly above default client timeout)
      server.headersTimeout = 66000; // 66 seconds (should be > keepAliveTimeout)
    }
    
    console.log(`🚀 Application is running on: http://localhost:${port}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 HTTP Keep-Alive enabled (65s timeout)`);
    
    if (port !== basePort) {
      console.warn(
        `⚠️  NOTE: Server is running on port ${port} instead of ${basePort}.`,
      );
      console.warn(
        `   Update your frontend API_BASE_URL or set PORT=${port} environment variable.`,
      );
    }
  } catch (error) {
    console.error('❌ Failed to start application:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check if another process is using the port');
    console.error('   2. Set AUTO_KILL_PORT=true to automatically kill processes');
    console.error('   3. Manually kill the process:');
    console.error('      Windows: netstat -ano | findstr :3001');
    console.error('      Mac/Linux: lsof -ti:3001 | xargs kill -9');
    console.error('   4. Use a different port: PORT=3002 npm run start:dev');
    process.exit(1);
  }
}
bootstrap();



