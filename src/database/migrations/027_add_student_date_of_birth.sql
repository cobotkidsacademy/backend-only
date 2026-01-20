-- =============================================
-- Migration 027: Add Date of Birth to Students
-- =============================================

-- Add date_of_birth column to students table
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS date_of_birth DATE;
