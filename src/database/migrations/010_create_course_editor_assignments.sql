-- =============================================
-- Migration 010: Create Course Editor Assignments
-- =============================================

-- =============================================
-- Create Course Editor Assignments Table
-- =============================================
CREATE TABLE IF NOT EXISTS course_editor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    editor_type VARCHAR(20) NOT NULL CHECK (editor_type IN ('inter', 'exter')),
    editor_link TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(course_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_course_editor_assignments_course_id ON course_editor_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_editor_assignments_type ON course_editor_assignments(editor_type);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE course_editor_assignments ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all course editor assignments"
    ON course_editor_assignments FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_course_editor_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_course_editor_assignments_updated_at
    BEFORE UPDATE ON course_editor_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_course_editor_assignments_updated_at();










