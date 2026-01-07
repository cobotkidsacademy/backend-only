import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  findAvailablePort,
  isPortAvailable,
  killProcessByPort,
} from './utils/port.util';
import { getCorsConfig } from './config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS with proper configuration for development and production
  const corsOptions = getCorsConfig();
  app.enableCors(corsOptions);

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
  const autoKill = process.env.AUTO_KILL_PORT === 'true';
  const maxPortAttempts = parseInt(
    process.env.MAX_PORT_ATTEMPTS || '10',
    10,
  );

  let port: number;

  try {
    // Check if base port is available
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

    await app.listen(port);
    console.log(`🚀 Application is running on: http://localhost:${port}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    
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



