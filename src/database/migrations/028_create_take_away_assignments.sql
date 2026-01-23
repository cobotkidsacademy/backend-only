-- =============================================
-- Migration 028: Create Take-Away Assignments
-- =============================================
-- NOTE: This migration references take_away_quizzes table which is created in migration 029.
-- If you get an error about take_away_quizzes not existing, run migration 029 first,
-- then re-run this migration.

-- =============================================
-- Take-Away Assignments Table
-- Links take-away quizzes to classes, tutors, course levels, and enrollment status
-- =============================================
CREATE TABLE IF NOT EXISTS take_away_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
    course_level_id UUID NOT NULL REFERENCES course_levels(id) ON DELETE CASCADE,
    take_away_quiz_id UUID REFERENCES take_away_quizzes(id) ON DELETE CASCADE,
    enrollment_status VARCHAR(20) NOT NULL DEFAULT 'enrolled' 
        CHECK (enrollment_status IN ('enrolled', 'completed')),
    due_date DATE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- A take-away quiz can be assigned once per class/tutor/course_level combination
    -- Note: take_away_quiz_id is nullable initially
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_take_away_class_id ON take_away_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_take_away_tutor_id ON take_away_assignments(tutor_id);
CREATE INDEX IF NOT EXISTS idx_take_away_course_level_id ON take_away_assignments(course_level_id);
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_id ON take_away_assignments(take_away_quiz_id);
CREATE INDEX IF NOT EXISTS idx_take_away_enrollment_status ON take_away_assignments(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_take_away_due_date ON take_away_assignments(due_date);

-- Create unique constraint for non-null take_away_quiz_id values
-- This ensures a quiz can only be assigned once per class/tutor/course_level combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_take_away_assignments_unique_quiz 
    ON take_away_assignments(class_id, tutor_id, course_level_id, take_away_quiz_id)
    WHERE take_away_quiz_id IS NOT NULL;

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE take_away_assignments ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all take-away assignments"
    ON take_away_assignments FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_take_away_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_take_away_assignments_updated_at
    BEFORE UPDATE ON take_away_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_take_away_assignments_updated_at();
