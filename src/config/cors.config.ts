import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Get CORS configuration based on environment
 * Supports both development and production with configurable origins
 */
export function getCorsConfig(): CorsOptions {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDevelopment = nodeEnv === 'development';

  // Default development origins
  const defaultDevOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];

  // Get allowed origins from environment variable
  // Format: "http://localhost:3000,https://example.com,https://app.example.com"
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  let allowedOrigins: string[] = [];

  if (allowedOriginsEnv) {
    // Parse comma-separated origins from environment variable
    allowedOrigins = allowedOriginsEnv.split(',').map((origin) => origin.trim());
  } else if (isDevelopment) {
    // In development, use default localhost origins
    allowedOrigins = defaultDevOrigins;
  } else {
    // In production without ALLOWED_ORIGINS, allow all (not recommended but safe fallback)
    // You should always set ALLOWED_ORIGINS in production
    console.warn(
      '⚠️  WARNING: ALLOWED_ORIGINS not set in production. Allowing all origins.',
    );
    allowedOrigins = ['*'];
  }

  // In development, always include localhost origins even if ALLOWED_ORIGINS is set
  if (isDevelopment) {
    const combinedOrigins = [...new Set([...defaultDevOrigins, ...allowedOrigins])];
    allowedOrigins = combinedOrigins;
  }

  // Origin validation function
  const originFunction = (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Log blocked origin for debugging
    console.warn(`🚫 CORS blocked origin: ${origin}`);
    console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
    callback(new Error('Not allowed by CORS'));
  };

  const corsOptions: CorsOptions = {
    origin: originFunction,
    credentials: true, // Allow cookies and authentication headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    exposedHeaders: [
      'Authorization',
      'Content-Type',
      'Content-Length',
      'X-Total-Count',
    ],
    preflightContinue: false, // Let NestJS handle preflight
    optionsSuccessStatus: 200, // Some legacy browsers (IE11) choke on 204
  };

  // Log CORS configuration in development
  if (isDevelopment) {
    console.log('🌐 CORS Configuration:');
    console.log(`   Environment: ${nodeEnv}`);
    console.log(`   Allowed Origins: ${allowedOrigins.join(', ')}`);
    console.log(`   Credentials: ${corsOptions.credentials}`);
  }

  return corsOptions;
}


