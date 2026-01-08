# Railway Deployment Guide - CORS Configuration

## Quick Setup for Railway

### Step 1: Set Environment Variables on Railway

1. Go to your Railway project: https://railway.app
2. Select your backend service
3. Click on the **Variables** tab
4. Add the following environment variables:

```env
NODE_ENV=production
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-domain.com
```

### Step 2: For Your Current Setup

Since your backend is at: `https://backend-only-production-eeb6.up.railway.app/`

And your frontend is at: `http://localhost:3000` (development)

**Set on Railway:**
```env
NODE_ENV=production
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Or if you have a production frontend:**
```env
NODE_ENV=production
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-frontend.com
```

### Step 3: Update Frontend API URL

Make sure your frontend is pointing to the Railway backend:

```typescript
// frontend/lib/api/client.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://backend-only-production-eeb6.up.railway.app";
```

Or set in your frontend `.env.local`:
```env
NEXT_PUBLIC_API_URL=https://backend-only-production-eeb6.up.railway.app
```

## Testing CORS After Deployment

### Test from Browser Console

Open your frontend (http://localhost:3000) and run in the browser console:

```javascript
fetch('https://backend-only-production-eeb6.up.railway.app/health', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  }
})
.then(res => res.json())
.then(data => console.log('✅ CORS Working!', data))
.catch(err => console.error('❌ CORS Error:', err));
```

### Expected Response

If CORS is configured correctly, you should see:
```json
{
  "status": "ok",
  "timestamp": "2026-01-06T..."
}
```

## Common Issues

### Issue: Still getting CORS errors after setting ALLOWED_ORIGINS

**Solution:**
1. Make sure you **redeployed** the backend after setting the environment variable
2. Check that the origin in `ALLOWED_ORIGINS` **exactly matches** your frontend URL (including `http://` vs `https://`, port numbers, trailing slashes)
3. Check Railway logs for CORS warnings: `🚫 CORS blocked origin: ...`

### Issue: Preflight requests failing

**Solution:**
The configuration handles OPTIONS requests automatically. If issues persist:
1. Check Railway logs to see if the backend is receiving requests
2. Verify the endpoint exists (e.g., `/health`)
3. Ensure the backend is running and accessible

### Issue: Credentials not working

**Solution:**
1. Ensure `withCredentials: true` is set in your frontend API client
2. Check that `credentials: true` is in CORS config (it is by default)
3. Verify cookies/tokens are being sent in requests

## Railway Environment Variables Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `production` | Environment mode |
| `ALLOWED_ORIGINS` | Recommended | `http://localhost:3000,https://app.com` | Comma-separated allowed origins |
| `PORT` | Auto | `3001` | Railway sets this automatically |
| `SUPABASE_URL` | Yes | `https://xxx.supabase.co` | Your Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `eyJ...` | Your Supabase service role key |
| `JWT_SECRET` | Yes | `your-secret-key` | JWT signing secret |

## Production Checklist

- [ ] Set `NODE_ENV=production` on Railway
- [ ] Set `ALLOWED_ORIGINS` with your production frontend URL
- [ ] Test CORS from your frontend
- [ ] Verify `/health` endpoint is accessible
- [ ] Check Railway logs for any CORS warnings
- [ ] Update frontend `API_BASE_URL` to point to Railway backend

## Support

If you're still experiencing CORS issues:

1. Check Railway logs: Look for `🚫 CORS blocked origin:` messages
2. Verify environment variables are set correctly
3. Test the `/health` endpoint directly: `https://backend-only-production-eeb6.up.railway.app/health`
4. Check browser console for specific CORS error messages





