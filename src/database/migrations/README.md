# Database Migrations

Run these SQL scripts in your Supabase SQL editor to set up the database schema.

## Setup Instructions

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the migration files in order:
   - `001_create_admins_table.sql` - Creates the admins table for authentication

## Default Admin Account

After running the migration, you'll need to create an admin account. You can do this by:

1. Using Supabase SQL Editor to insert an admin with a hashed password
2. Creating a script to hash the password and insert the admin

### Example: Create Admin User

```sql
-- Replace 'your-email@example.com' and hash your password using bcrypt
-- You can use online bcrypt generators or create a script
INSERT INTO admins (email, password_hash, role)
VALUES (
    'your-email@example.com',
    '$2b$10$YourBcryptHashHere',
    'admin'
);
```

**Important**: The default admin in the migration uses a placeholder hash. You must create your own admin account with a properly hashed password.



















