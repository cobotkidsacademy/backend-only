# CORS Configuration Guide

This guide explains how to configure CORS (Cross-Origin Resource Sharing) for the NestJS backend API.

## Overview

The backend uses a flexible CORS configuration that:
- ✅ Supports both development and production environments
- ✅ Allows configurable origins via environment variables
- ✅ Handles preflight OPTIONS requests automatically
- ✅ Supports credentials (cookies, authentication headers)
- ✅ Allows all standard HTTP methods (GET, POST, PUT, DELETE, PATCH)

## Environment Variables

### `ALLOWED_ORIGINS` (Recommended)

Comma-separated list of allowed origins. This is the primary way to configure CORS in production.

**Format:**
```
ALLOWED_ORIGINS=https://example.com,https://app.example.com,http://localhost:3000
```

**Examples:**

**Development:**
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Production:**
```env
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

**Multiple environments:**
```env
ALLOWED_ORIGINS=https://production.com,https://staging.com,http://localhost:3000
```

### `NODE_ENV`

Controls the environment mode:
- `development` - Includes default localhost origins automatically
- `production` - Requires `ALLOWED_ORIGINS` to be set (or allows all as fallback)

## Default Behavior

### Development Mode (`NODE_ENV=development`)

If `ALLOWED_ORIGINS` is not set, the following origins are allowed by default:
- `http://localhost:3000`
- `http://localhost:5173`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`

If `ALLOWED_ORIGINS` is set, these default origins are **added** to your list.

### Production Mode (`NODE_ENV=production`)

- **If `ALLOWED_ORIGINS` is set:** Only those origins are allowed
- **If `ALLOWED_ORIGINS` is NOT set:** All origins are allowed (⚠️ **Not recommended for security**)

## Railway Deployment

### Setting Environment Variables on Railway

1. Go to your Railway project dashboard
2. Select your backend service
3. Go to the **Variables** tab
4. Add the following variables:

```env
NODE_ENV=production
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://your-staging-domain.com
```

### Example Railway Configuration

```env
# Required
NODE_ENV=production
ALLOWED_ORIGINS=https://myapp.com,https://app.myapp.com

# Optional (if you want to allow localhost in production for testing)
ALLOWED_ORIGINS=https://myapp.com,http://localhost:3000
```

## Allowed Headers

The following headers are allowed by default:
- `Content-Type`
- `Authorization`
- `X-Requested-With`
- `Accept`
- `Origin`
- `Access-Control-Request-Method`
- `Access-Control-Request-Headers`

## Allowed Methods

All standard HTTP methods are allowed:
- `GET`
- `POST`
- `PUT`
- `DELETE`
- `PATCH`
- `OPTIONS` (for preflight requests)

## Credentials Support

The API supports credentials (cookies, authentication tokens) via:
- `credentials: true` in CORS configuration
- `withCredentials: true` in frontend requests

## Testing CORS

### Test from Browser Console

```javascript
fetch('https://your-backend-url.com/health', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  }
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error('CORS Error:', err));
```

### Test with cURL

```bash
# Test preflight request
curl -X OPTIONS https://your-backend-url.com/health \
  -H "Origin: https://your-frontend.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

# Test actual request
curl -X GET https://your-backend-url.com/health \
  -H "Origin: https://your-frontend.com" \
  -v
```

## Troubleshooting

### Error: "No 'Access-Control-Allow-Origin' header is present"

**Cause:** The origin making the request is not in the `ALLOWED_ORIGINS` list.

**Solution:**
1. Check your `ALLOWED_ORIGINS` environment variable
2. Ensure the frontend URL exactly matches (including protocol, port, trailing slashes)
3. Restart the backend server after changing environment variables

### Error: "Credentials flag is true, but the 'Access-Control-Allow-Credentials' header is not set"

**Cause:** This shouldn't happen with our configuration, but if it does, check:
1. Ensure `credentials: true` is set in CORS config (it is by default)
2. Ensure frontend uses `withCredentials: true` in requests

### Preflight requests failing

**Cause:** OPTIONS requests not being handled properly.

**Solution:** The configuration handles this automatically. If issues persist:
1. Check that the backend is running
2. Verify the endpoint exists
3. Check server logs for CORS warnings

### Localhost not working in production

**Cause:** Production mode doesn't include localhost by default.

**Solution:** Add localhost explicitly to `ALLOWED_ORIGINS`:
```env
ALLOWED_ORIGINS=https://production.com,http://localhost:3000
```

## Security Best Practices

1. **Always set `ALLOWED_ORIGINS` in production** - Don't rely on the fallback
2. **Use HTTPS in production** - Always use `https://` for production origins
3. **Be specific** - Only include origins you actually need
4. **Review regularly** - Update `ALLOWED_ORIGINS` when adding new frontend deployments
5. **Don't use wildcards** - Avoid `*` in production (though it's allowed as fallback)

## Frontend Configuration

Make sure your frontend API client is configured correctly:

```typescript
// Example: frontend/lib/api/client.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'https://your-backend-url.com',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for CORS with credentials
});
```

## Example Configurations

### Development (Local)
```env
NODE_ENV=development
# ALLOWED_ORIGINS optional - defaults to localhost:3000, localhost:5173
```

### Staging
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://staging.myapp.com,http://localhost:3000
```

### Production
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://myapp.com,https://app.myapp.com
```

### Multiple Frontends
```env
NODE_ENV=production
ALLOWED_ORIGINS=https://admin.myapp.com,https://app.myapp.com,https://student.myapp.com
```









