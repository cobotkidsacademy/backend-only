# Database Scripts

Utility scripts for database management.

## Create Admin User

This script helps you create an admin user in the database.

### Prerequisites

1. Make sure your `.env` file is configured with:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Make sure the `admins` table exists (run the migration first).

### Usage

```bash
# Using ts-node (requires ts-node to be installed)
npx ts-node src/database/scripts/create-admin.ts <email> <password>

# Example
npx ts-node src/database/scripts/create-admin.ts admin@example.com mypassword123
```

### Alternative: Using SQL directly

You can also create an admin user directly in Supabase SQL Editor using bcrypt to hash the password:

```sql
-- Replace 'your-email@example.com' and generate a bcrypt hash for your password
-- You can use online tools or Node.js to generate the hash
INSERT INTO admins (email, password_hash, role)
VALUES (
    'your-email@example.com',
    '$2b$10$YourBcryptHashHere',
    'admin'
);
```

To generate a bcrypt hash, you can use:
- Online: https://bcrypt-generator.com/
- Node.js: `bcrypt.hashSync('your-password', 10)`


















