import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Get CORS configuration based on environment
 * Supports both development and production with configurable origins
 */
export function getCorsConfig(): CorsOptions {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDevelopment = nodeEnv === 'development';

  // Get allowed origins from environment variable
  // FOR PRODUCTION: Set these in your .env.production or hosting platform
  // Format: "https://cobot-system.vercel.app,https://app.cobotkids.com,https://admin.cobotkids.com"
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  let allowedOrigins: (string | RegExp)[] = [];

  if (allowedOriginsEnv) {
    // Parse comma-separated origins from environment variable
    allowedOrigins = allowedOriginsEnv.split(',').map((origin) => {
      const trimmed = origin.trim();
      
      // Handle wildcard patterns by converting to regex
      if (trimmed.includes('*')) {
        // Convert wildcard pattern to regex
        // Example: "*.vercel.app" -> /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/
        const regexPattern = trimmed
          .replace(/\./g, '\\.') // Escape dots
          .replace(/\*/g, '[a-zA-Z0-9-]+'); // Replace * with character match
        
        // In production, only allow HTTPS
        return new RegExp(`^https://${regexPattern}$`);
      }
      
      return trimmed;
    });
  } else if (isDevelopment) {
    // DEVELOPMENT: Flexible origins
    allowedOrigins = [
      /^http:\/\/localhost(:\d+)?$/, // All localhost with any port
      /^http:\/\/127\.0\.0\.1(:\d+)?$/, // All 127.0.0.1 with any port
      /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/, // All local network IPs
      /^https?:\/\/.*\.vercel\.app$/, // All Vercel deployments (http or https)
      /^https?:\/\/.*\.netlify\.app$/,
      /^https?:\/\/.*\.github\.io$/,
      /^https?:\/\/.*\.onrender\.com$/,
      /^https?:\/\/.*\.railway\.app$/,
    ];
  } else {
    // PRODUCTION DEFAULT: Strict list - UPDATE THESE!
    console.warn(
      '⚠️  PRODUCTION WARNING: ALLOWED_ORIGINS not set. Using strict defaults.',
    );
    
    // REPLACE THESE WITH YOUR ACTUAL PRODUCTION DOMAINS:
    allowedOrigins = [
      // Your Vercel frontend
      'https://cobot-system.vercel.app',
      'https://cobot-system-*.vercel.app',
      
      // Your main domain (if you have one)
      // 'https://cobotkids.com',
      // 'https://app.cobotkids.com',
      // 'https://admin.cobotkids.com',
      
      // Your backend API domain (if different)
      // 'https://api.cobotkids.com',
    ];
  }

  // Always add FRONTEND_URL from environment if set
  if (process.env.FRONTEND_URL) {
    const frontendUrls = process.env.FRONTEND_URL
      .split(',')
      .map(url => url.trim())
      .filter(url => url);
    
    if (frontendUrls.length > 0) {
      allowedOrigins = [...allowedOrigins, ...frontendUrls];
    }
  }

  // Origin validation function
  const originFunction = (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Allow requests with no origin (like mobile apps, Postman, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Log in production for security monitoring
    if (!isDevelopment) {
      console.log(`🔒 CORS check for origin: ${origin}`);
    }

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        // Exact match for strings
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        // Pattern match for regex
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      if (isDevelopment) {
        console.log(`✅ Allowed origin: ${origin}`);
      }
      return callback(null, true);
    }

    // Log blocked origin
    console.warn(`🚫 CORS blocked: ${origin} (${isDevelopment ? 'Development' : 'Production'})`);
    
    if (isDevelopment) {
      console.log(`   Allowed patterns:`, allowedOrigins);
    }
    
    callback(new Error('Not allowed by CORS'));
  };

  const corsOptions: CorsOptions = {
    origin: originFunction,
    credentials: true, // Allow cookies and authentication headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
      'X-API-Key',
      'X-CSRF-Token',
      'X-Request-ID',
      'X-Keep-Alive', // Allow keep-alive header from frontend
    ],
    exposedHeaders: [
      'Authorization',
      'Content-Type',
      'Content-Length',
      'X-Total-Count',
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 86400, // 24 hours cache for preflight
    preflightContinue: false,
    optionsSuccessStatus: 200,
  };

  // Log configuration
  console.log(`🌐 CORS: ${nodeEnv.toUpperCase()} mode`);
  console.log(`   Allowed Origins: ${allowedOrigins.length} pattern(s)`);

  return corsOptions;
}






