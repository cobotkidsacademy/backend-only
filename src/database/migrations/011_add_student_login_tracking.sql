-- =============================================
-- Migration 011: Add Student Login Tracking
-- =============================================

-- Add login tracking columns to students table
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- Create index for last_login for faster queries
CREATE INDEX IF NOT EXISTS idx_students_last_login ON students(last_login);

-- Create index for login_count
CREATE INDEX IF NOT EXISTS idx_students_login_count ON students(login_count);










