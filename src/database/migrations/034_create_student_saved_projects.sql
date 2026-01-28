-- =============================================
-- Migration 034: Create Student Saved Projects Table
-- =============================================
-- This table stores student's saved programming projects from various editors
-- (Scratch, HTML, JavaScript, Python, etc.)

-- =============================================
-- Student Saved Projects Table
-- =============================================
CREATE TABLE IF NOT EXISTS student_saved_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    course_level_id UUID NOT NULL REFERENCES course_levels(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    
    -- Project identification
    project_name VARCHAR(255) NOT NULL, -- Name of the project (usually topic name or custom name)
    project_title VARCHAR(255), -- Optional custom title
    
    -- Editor information
    editor_type VARCHAR(20) NOT NULL CHECK (editor_type IN ('inter', 'exter')),
    editor_url TEXT, -- URL of the editor used
    
    -- Project data storage
    project_data JSONB, -- For Scratch projects: stores the full project JSON
    project_html TEXT, -- For HTML projects: stores the HTML content
    project_code TEXT, -- For code-based projects (JavaScript, Python, etc.)
    project_files JSONB, -- For projects with multiple files: array of {name, content, type}
    
    -- Project metadata
    project_type VARCHAR(50) DEFAULT 'scratch' CHECK (project_type IN ('scratch', 'html', 'javascript', 'python', 'other')),
    file_format VARCHAR(20) DEFAULT 'json', -- 'json', 'html', 'js', 'py', 'sb3', etc.
    file_size_bytes BIGINT, -- Size of the project data
    
    -- Project state
    is_autosaved BOOLEAN DEFAULT false, -- True if auto-saved, false if manually saved
    version INTEGER DEFAULT 1, -- Version number for project revisions
    is_current BOOLEAN DEFAULT true, -- True for the latest version of a project
    
    -- Thumbnail/preview
    thumbnail_url TEXT, -- URL to project thumbnail/preview image
    
    -- Additional metadata
    metadata JSONB, -- Store additional metadata (tags, description, etc.)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_student_id ON student_saved_projects(student_id);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_topic_id ON student_saved_projects(topic_id);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_course_level_id ON student_saved_projects(course_level_id);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_course_id ON student_saved_projects(course_id);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_editor_type ON student_saved_projects(editor_type);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_project_type ON student_saved_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_is_current ON student_saved_projects(is_current);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_updated_at ON student_saved_projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_student_topic ON student_saved_projects(student_id, topic_id);

-- Composite index for common queries (student + course level + is_current)
CREATE INDEX IF NOT EXISTS idx_student_saved_projects_portfolio ON student_saved_projects(student_id, course_level_id, is_current) WHERE is_current = true;

-- Enable Row Level Security
ALTER TABLE student_saved_projects ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all student_saved_projects" 
    ON student_saved_projects FOR ALL 
    USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_student_saved_projects_updated_at 
    BEFORE UPDATE ON student_saved_projects 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE student_saved_projects IS 'Stores student saved programming projects from various editors (Scratch, HTML, JavaScript, etc.)';
COMMENT ON COLUMN student_saved_projects.project_data IS 'JSONB field for storing Scratch project data (sprites, scripts, etc.)';
COMMENT ON COLUMN student_saved_projects.project_html IS 'TEXT field for storing HTML projects';
COMMENT ON COLUMN student_saved_projects.project_code IS 'TEXT field for storing code-based projects (JavaScript, Python, etc.)';
COMMENT ON COLUMN student_saved_projects.project_files IS 'JSONB array for projects with multiple files: [{name, content, type}, ...]';
COMMENT ON COLUMN student_saved_projects.is_current IS 'True for the latest version. Older versions can be kept for history.';
COMMENT ON COLUMN student_saved_projects.version IS 'Version number for tracking project revisions';

