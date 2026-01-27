-- =============================================
-- Migration 008: Add Student Profile Image and Course Enrollments
-- =============================================

-- =============================================
-- 1. Add profile_image_url to students table
-- =============================================
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- =============================================
-- 2. Create Student Course Enrollments Table
-- =============================================
CREATE TABLE IF NOT EXISTS student_course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrollment_status VARCHAR(20) NOT NULL DEFAULT 'not_enrolled' 
        CHECK (enrollment_status IN ('not_enrolled', 'enrolled', 'completed')),
    enrolled_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, course_id)
);

-- Create indexes for student_course_enrollments
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student_id ON student_course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_course_id ON student_course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_status ON student_course_enrollments(enrollment_status);

-- =============================================
-- 3. Enable Row Level Security
-- =============================================
ALTER TABLE student_course_enrollments ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all student enrollments"
    ON student_course_enrollments FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- 4. Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_student_enrollments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_student_enrollments_updated_at
    BEFORE UPDATE ON student_course_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_student_enrollments_updated_at();

-- =============================================
-- 5. Function to automatically set enrolled_at and completed_at timestamps
-- =============================================
CREATE OR REPLACE FUNCTION set_enrollment_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Set enrolled_at when status changes to 'enrolled'
    IF NEW.enrollment_status = 'enrolled' AND (OLD.enrollment_status IS NULL OR OLD.enrollment_status != 'enrolled') THEN
        NEW.enrolled_at = NOW();
    END IF;
    
    -- Set completed_at when status changes to 'completed'
    IF NEW.enrollment_status = 'completed' AND (OLD.enrollment_status IS NULL OR OLD.enrollment_status != 'completed') THEN
        NEW.completed_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_enrollment_timestamps_trigger
    BEFORE INSERT OR UPDATE ON student_course_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION set_enrollment_timestamps();

-- =============================================
-- 6. Initialize enrollments for existing students (optional - sets all to 'not_enrolled')
-- =============================================
-- This is optional - you can run this to create enrollment records for all students and courses
-- Uncomment if you want to initialize existing data:
/*
INSERT INTO student_course_enrollments (student_id, course_id, enrollment_status)
SELECT s.id, c.id, 'not_enrolled'
FROM students s
CROSS JOIN courses c
WHERE NOT EXISTS (
    SELECT 1 FROM student_course_enrollments sce
    WHERE sce.student_id = s.id AND sce.course_id = c.id
);
*/














