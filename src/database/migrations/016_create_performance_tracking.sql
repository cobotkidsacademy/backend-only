-- =============================================
-- Student Performance Tracking Table
-- =============================================
CREATE TABLE IF NOT EXISTS student_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_level_id UUID NOT NULL REFERENCES course_levels(id) ON DELETE CASCADE,
    
    -- Overall performance metrics
    total_points INTEGER DEFAULT 0,
    quizzes_completed INTEGER DEFAULT 0,
    quizzes_passed INTEGER DEFAULT 0,
    exams_completed INTEGER DEFAULT 0,
    exams_passed INTEGER DEFAULT 0,
    projects_completed INTEGER DEFAULT 0,
    projects_passed INTEGER DEFAULT 0,
    
    -- Average scores
    average_quiz_score DECIMAL(5,2) DEFAULT 0,
    average_exam_score DECIMAL(5,2) DEFAULT 0,
    average_project_score DECIMAL(5,2) DEFAULT 0,
    overall_average DECIMAL(5,2) DEFAULT 0,
    
    -- Progress tracking
    topics_completed INTEGER DEFAULT 0,
    topics_total INTEGER DEFAULT 0,
    completion_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Time tracking
    total_study_time_minutes INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    enrollment_status VARCHAR(20) DEFAULT 'enrolled' CHECK (enrollment_status IN ('enrolled', 'in_progress', 'completed', 'dropped')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(student_id, course_level_id)
);

-- =============================================
-- Performance History Table (for tracking changes over time)
-- =============================================
CREATE TABLE IF NOT EXISTS performance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_level_id UUID NOT NULL REFERENCES course_levels(id) ON DELETE CASCADE,
    
    -- Snapshot of performance at this point
    total_points INTEGER DEFAULT 0,
    overall_average DECIMAL(5,2) DEFAULT 0,
    completion_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- What triggered this snapshot
    trigger_type VARCHAR(50), -- 'quiz_completed', 'exam_completed', 'project_submitted', 'manual_update'
    trigger_reference_id UUID, -- ID of the quiz/exam/project that triggered this
    
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_student_performance_student_id ON student_performance(student_id);
CREATE INDEX IF NOT EXISTS idx_student_performance_course_level_id ON student_performance(course_level_id);
CREATE INDEX IF NOT EXISTS idx_student_performance_enrollment_status ON student_performance(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_performance_history_student_id ON performance_history(student_id);
CREATE INDEX IF NOT EXISTS idx_performance_history_course_level_id ON performance_history(course_level_id);
CREATE INDEX IF NOT EXISTS idx_performance_history_recorded_at ON performance_history(recorded_at);

-- Enable Row Level Security
ALTER TABLE student_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_history ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all student_performance" ON student_performance FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all performance_history" ON performance_history FOR ALL USING (auth.role() = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER update_student_performance_updated_at BEFORE UPDATE ON student_performance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();







