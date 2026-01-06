# Troubleshooting Guide

## Missing Supabase Configuration Error

If you're seeing the error:
```
Error: Missing Supabase configuration
```

This means the backend cannot find the required Supabase environment variables.

### Quick Diagnosis

Run the configuration check:
```bash
cd backend
npm run check:config
```

This will show you exactly which variables are missing.

### Solutions

#### Solution 1: Create .env File (Local Development)

1. Copy the example file:
   ```bash
   cd backend
   cp env.example.txt .env
   ```

2. Edit `.env` and fill in your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   JWT_SECRET=your-super-secret-jwt-key-min-32-characters
   JWT_EXPIRES_IN=24h
   PORT=3001
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   ```

3. Get your Supabase credentials:
   - Go to your Supabase project dashboard
   - Navigate to **Settings** → **API**
   - Copy the **Project URL** (for `SUPABASE_URL`)
   - Copy the **service_role** key (for `SUPABASE_SERVICE_ROLE_KEY`) - ⚠️ Keep this secret!

#### Solution 2: Docker Environment Variables

If running in Docker, set environment variables in your `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - PORT=3001
      - NODE_ENV=production
      - FRONTEND_URL=${FRONTEND_URL}
    env_file:
      - .env  # Optional: also load from .env file
```

Or pass them directly:
```bash
docker run -e SUPABASE_URL=your_url -e SUPABASE_SERVICE_ROLE_KEY=your_key ...
```

#### Solution 3: System Environment Variables

Set them in your shell:
```bash
# Linux/Mac
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Windows PowerShell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### Enhanced Error Messages

The updated error handler will now show:
- Which specific variables are missing
- Available environment variables (for debugging)
- Current working directory
- Whether running in Docker

This helps identify configuration issues faster.

### Verification

After setting up your configuration, verify it works:

```bash
cd backend
npm run check:config
```

You should see all green checkmarks ✅.

### Still Having Issues?

1. **Check file location**: The `.env` file must be in the `backend/` directory
2. **Check file name**: It must be exactly `.env` (not `.env.txt` or `env.txt`)
3. **Check permissions**: Ensure the file is readable
4. **Restart the server**: After creating/modifying `.env`, restart the backend
5. **Check Docker volumes**: If using Docker, ensure `.env` is mounted or env vars are passed

