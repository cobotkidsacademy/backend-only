-- =============================================
-- Migration 042: Create Class Code system admin user
-- =============================================
-- This admin appears as "Class Code" in every student's chat list.
-- Used for self-study class code requests. Cannot log in (system user).
-- Password hash below is bcrypt of a long random string (never used for login).

INSERT INTO admins (id, email, password_hash, role, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'classcode@system',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE email = 'classcode@system');
