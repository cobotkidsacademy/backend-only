-- =============================================
-- Migration 030: Update Take-Away Assignments
-- Remove quiz_id and add take_away_quiz_id
-- =============================================
-- 
-- IMPORTANT: Only run this migration if you already have the take_away_assignments table
-- with the old quiz_id column. If you're creating the table fresh, migration 028 already
-- uses take_away_quiz_id, so this migration is NOT needed.
--
-- Prerequisites:
-- 1. Migration 029 must be run first (creates take_away_quizzes table)
-- 2. This migration updates existing tables from the old structure to the new one
--
-- WARNING: This migration will DROP the quiz_id column if it exists.
-- Make sure you have backed up any important data before running this.
-- =============================================

-- Check if quiz_id column exists before dropping
DO $$
BEGIN
    -- Only proceed if the table exists and has the quiz_id column
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'take_away_assignments' 
        AND column_name = 'quiz_id'
    ) THEN
        -- First, drop the old foreign key constraint and index
        ALTER TABLE take_away_assignments 
            DROP CONSTRAINT IF EXISTS take_away_assignments_quiz_id_fkey;

        DROP INDEX IF EXISTS idx_take_away_quiz_id;

        -- Drop the old quiz_id column
        ALTER TABLE take_away_assignments 
            DROP COLUMN quiz_id;
            
        RAISE NOTICE 'Successfully removed quiz_id column from take_away_assignments';
    ELSE
        RAISE NOTICE 'quiz_id column does not exist. Skipping drop operation.';
    END IF;
END $$;

-- Add the new take_away_quiz_id column (only if it doesn't exist)
ALTER TABLE IF EXISTS take_away_assignments 
    ADD COLUMN IF NOT EXISTS take_away_quiz_id UUID REFERENCES take_away_quizzes(id) ON DELETE CASCADE;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_take_away_assignments_quiz_id ON take_away_assignments(take_away_quiz_id);

-- Drop old unique constraint/index if it exists
ALTER TABLE IF EXISTS take_away_assignments 
    DROP CONSTRAINT IF EXISTS take_away_assignments_class_id_tutor_id_course_level_id_quiz_id_key;

DROP INDEX IF EXISTS idx_take_away_assignments_unique_quiz;

-- Create unique index for non-null take_away_quiz_id values
CREATE UNIQUE INDEX IF NOT EXISTS idx_take_away_assignments_unique_quiz 
    ON take_away_assignments(class_id, tutor_id, course_level_id, take_away_quiz_id)
    WHERE take_away_quiz_id IS NOT NULL;
