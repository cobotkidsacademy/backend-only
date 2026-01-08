-- =============================================
-- Migration 021: Create Attendance Records Table
-- =============================================

-- =============================================
-- Attendance Records Table
-- =============================================
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    course_level_id UUID REFERENCES course_levels(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
    marked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    marked_by UUID REFERENCES tutors(id) ON DELETE SET NULL, -- Tutor who manually marked (if any)
    login_timestamp TIMESTAMP WITH TIME ZONE, -- Student login time that triggered this attendance
    class_schedule_id UUID REFERENCES class_schedules(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- A student can only have one attendance record per class per date
    UNIQUE(student_id, class_id, attendance_date, course_level_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON attendance_records(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_course_level_id ON attendance_records(course_level_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(class_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance_records(student_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_login_timestamp ON attendance_records(login_timestamp);

-- Enable Row Level Security
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all attendance_records"
    ON attendance_records FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_attendance_records_updated_at 
    BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


