-- =============================================
-- Projects Table
-- =============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT, -- Detailed project instructions
    requirements TEXT, -- Project requirements checklist
    max_points INTEGER DEFAULT 100,
    due_date TIMESTAMP WITH TIME ZONE,
    allow_late_submission BOOLEAN DEFAULT false,
    late_penalty_percentage INTEGER DEFAULT 10, -- Percentage deduction per day late
    submission_type VARCHAR(20) DEFAULT 'file' CHECK (submission_type IN ('file', 'text', 'link', 'mixed')),
    max_file_size_mb INTEGER DEFAULT 10,
    allowed_file_types TEXT[], -- Array of allowed extensions: ['pdf', 'doc', 'docx']
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('active', 'inactive', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Student Project Submissions Table
-- =============================================
CREATE TABLE IF NOT EXISTS student_project_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    submission_text TEXT, -- For text submissions
    submission_link TEXT, -- For link submissions
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_late BOOLEAN DEFAULT false,
    days_late INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'returned', 'resubmitted')),
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0,
    feedback TEXT, -- Tutor feedback
    graded_by_tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
    graded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, project_id) -- One submission per student per project
);

-- =============================================
-- Project Submission Files Table
-- =============================================
CREATE TABLE IF NOT EXISTS project_submission_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES student_project_submissions(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    file_type VARCHAR(50),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_topic_id ON projects(topic_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_student_project_submissions_student_id ON student_project_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_student_project_submissions_project_id ON student_project_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_submission_files_submission_id ON project_submission_files(submission_id);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_project_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_submission_files ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all projects" ON projects FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all student_project_submissions" ON student_project_submissions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all project_submission_files" ON project_submission_files FOR ALL USING (auth.role() = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_project_submissions_updated_at BEFORE UPDATE ON student_project_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();








