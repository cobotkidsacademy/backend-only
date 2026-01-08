-- =============================================
-- Migration 009: Add Class Course Level Assignments
-- =============================================

-- =============================================
-- Create Class Course Level Assignments Table
-- =============================================
CREATE TABLE IF NOT EXISTS class_course_level_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    course_level_id UUID NOT NULL REFERENCES course_levels(id) ON DELETE CASCADE,
    enrollment_status VARCHAR(20) NOT NULL DEFAULT 'enrolled' 
        CHECK (enrollment_status IN ('enrolled', 'completed')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(class_id, course_level_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_class_course_levels_class_id ON class_course_level_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_course_levels_course_level_id ON class_course_level_assignments(course_level_id);
CREATE INDEX IF NOT EXISTS idx_class_course_levels_status ON class_course_level_assignments(enrollment_status);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE class_course_level_assignments ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all class course level assignments"
    ON class_course_level_assignments FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_class_course_levels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_class_course_levels_updated_at
    BEFORE UPDATE ON class_course_level_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_class_course_levels_updated_at();

-- =============================================
-- Function to automatically set completed_at timestamp
-- =============================================
CREATE OR REPLACE FUNCTION set_class_course_level_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Set completed_at when status changes to 'completed'
    IF NEW.enrollment_status = 'completed' AND (OLD.enrollment_status IS NULL OR OLD.enrollment_status != 'completed') THEN
        NEW.completed_at = NOW();
    END IF;
    
    -- Clear completed_at when status changes from 'completed' to 'enrolled'
    IF NEW.enrollment_status = 'enrolled' AND OLD.enrollment_status = 'completed' THEN
        NEW.completed_at = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_class_course_level_completed_at_trigger
    BEFORE INSERT OR UPDATE ON class_course_level_assignments
    FOR EACH ROW
    EXECUTE FUNCTION set_class_course_level_completed_at();










