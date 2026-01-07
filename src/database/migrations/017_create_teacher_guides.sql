-- =============================================
-- Teacher Guides Table (for specific classes)
-- =============================================
CREATE TABLE IF NOT EXISTS teacher_guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    course_level_id UUID NOT NULL REFERENCES course_levels(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Guide content
    content TEXT, -- Main guide content (can be markdown/HTML)
    objectives TEXT[], -- Array of learning objectives
    materials_needed TEXT[], -- Array of required materials
    teaching_strategies TEXT, -- Teaching strategies and approaches
    assessment_notes TEXT, -- Notes on how to assess student progress
    common_mistakes TEXT, -- Common mistakes students make
    extension_activities TEXT, -- Additional activities for advanced students
    
    -- Metadata
    estimated_duration_minutes INTEGER,
    difficulty_level VARCHAR(20) DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('active', 'inactive', 'draft')),
    
    created_by_tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(class_id, course_level_id) -- One guide per class per course level
);

-- =============================================
-- Teacher Guide Attachments Table
-- =============================================
CREATE TABLE IF NOT EXISTS teacher_guide_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id UUID NOT NULL REFERENCES teacher_guides(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size_bytes BIGINT,
    attachment_type VARCHAR(20) DEFAULT 'resource' CHECK (attachment_type IN ('resource', 'worksheet', 'answer_key', 'presentation', 'video', 'other')),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Teacher Guide Sections Table (for structured content)
-- =============================================
CREATE TABLE IF NOT EXISTS teacher_guide_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id UUID NOT NULL REFERENCES teacher_guides(id) ON DELETE CASCADE,
    section_title VARCHAR(255) NOT NULL,
    section_content TEXT,
    section_type VARCHAR(20) DEFAULT 'content' CHECK (section_type IN ('content', 'activity', 'assessment', 'homework', 'notes')),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_teacher_guides_class_id ON teacher_guides(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_guides_course_level_id ON teacher_guides(course_level_id);
CREATE INDEX IF NOT EXISTS idx_teacher_guides_status ON teacher_guides(status);
CREATE INDEX IF NOT EXISTS idx_teacher_guide_attachments_guide_id ON teacher_guide_attachments(guide_id);
CREATE INDEX IF NOT EXISTS idx_teacher_guide_sections_guide_id ON teacher_guide_sections(guide_id);
CREATE INDEX IF NOT EXISTS idx_teacher_guide_sections_order ON teacher_guide_sections(order_index);

-- Enable Row Level Security
ALTER TABLE teacher_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_guide_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_guide_sections ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all teacher_guides" ON teacher_guides FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all teacher_guide_attachments" ON teacher_guide_attachments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all teacher_guide_sections" ON teacher_guide_sections FOR ALL USING (auth.role() = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER update_teacher_guides_updated_at BEFORE UPDATE ON teacher_guides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teacher_guide_sections_updated_at BEFORE UPDATE ON teacher_guide_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


