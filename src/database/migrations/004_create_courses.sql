-- =============================================
-- Courses Table
-- =============================================
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated: CRS-XXXX
    description TEXT,
    icon_image_url TEXT,
    level_count INTEGER NOT NULL DEFAULT 1 CHECK (level_count >= 1 AND level_count <= 20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Course Levels Table (auto-generated based on level_count)
-- =============================================
CREATE TABLE IF NOT EXISTS course_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    level_number INTEGER NOT NULL CHECK (level_number >= 1),
    name VARCHAR(255) NOT NULL, -- Auto: "CourseName - Level X"
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    
    -- Pricing
    is_free BOOLEAN DEFAULT true,
    price DECIMAL(10, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'KES',
    
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(course_id, level_number)
);

-- =============================================
-- Topics Table
-- =============================================
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_id UUID NOT NULL REFERENCES course_levels(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Notes Table (with drag-drop position data)
-- =============================================
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title VARCHAR(255),
    order_index INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Note Elements Table (text/image blocks with position)
-- =============================================
CREATE TABLE IF NOT EXISTS note_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    element_type VARCHAR(20) NOT NULL CHECK (element_type IN ('text', 'image')),
    content TEXT, -- For text: the actual text. For image: URL
    
    -- Position data for drag-drop
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    width INTEGER DEFAULT 300,
    height INTEGER DEFAULT 100,
    z_index INTEGER DEFAULT 0,
    
    -- Styling
    font_size INTEGER DEFAULT 16,
    font_weight VARCHAR(20) DEFAULT 'normal',
    font_family VARCHAR(100) DEFAULT 'Inter',
    font_color VARCHAR(50) DEFAULT '#000000',
    text_align VARCHAR(20) DEFAULT 'left',
    background_color VARCHAR(50),
    
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_course_levels_course_id ON course_levels(course_id);
CREATE INDEX IF NOT EXISTS idx_topics_level_id ON topics(level_id);
CREATE INDEX IF NOT EXISTS idx_notes_topic_id ON notes(topic_id);
CREATE INDEX IF NOT EXISTS idx_note_elements_note_id ON note_elements(note_id);

-- Enable Row Level Security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_elements ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all courses" ON courses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all course_levels" ON course_levels FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all topics" ON topics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all notes" ON notes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all note_elements" ON note_elements FOR ALL USING (auth.role() = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_course_levels_updated_at BEFORE UPDATE ON course_levels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_note_elements_updated_at BEFORE UPDATE ON note_elements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

