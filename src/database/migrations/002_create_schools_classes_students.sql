-- =============================================
-- Schools Table
-- =============================================
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    logo_url TEXT,
    email VARCHAR(255),
    auto_email VARCHAR(255) GENERATED ALWAYS AS (
        LOWER(REPLACE(REPLACE(name, ' ', ''), '''', '')) || '@cobotkids.edutech'
    ) STORED,
    password_hash VARCHAR(255) NOT NULL,
    plain_password VARCHAR(255), -- Store for display (in production, use secure method)
    location TEXT,
    phone VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for schools
CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);

-- =============================================
-- Classes Table
-- =============================================
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    level VARCHAR(50) NOT NULL CHECK (level IN ('level1', 'level2', 'level3', 'advanced')),
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Create indexes for classes
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_level ON classes(level);

-- =============================================
-- Students Table
-- =============================================
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    plain_password VARCHAR(50) DEFAULT '1234', -- Store for display
    email VARCHAR(255),
    guardian_name VARCHAR(255),
    guardian_phone VARCHAR(50),
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', NULL)),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for students
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_username ON students(username);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all schools"
    ON schools FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all classes"
    ON classes FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all students"
    ON students FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE TRIGGER update_schools_updated_at 
    BEFORE UPDATE ON schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at 
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at 
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Helper function to generate school code
-- =============================================
CREATE OR REPLACE FUNCTION generate_school_code(school_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_code TEXT;
    final_code TEXT;
    counter INT := 1;
BEGIN
    -- Generate base code from first 3 letters of each word, uppercase
    base_code := UPPER(
        SUBSTRING(
            REGEXP_REPLACE(school_name, '[^a-zA-Z ]', '', 'g'),
            1, 6
        )
    );
    
    -- Remove spaces and limit to 6 chars
    base_code := REPLACE(base_code, ' ', '');
    base_code := SUBSTRING(base_code, 1, 6);
    
    final_code := base_code;
    
    -- Check for uniqueness and add number if needed
    WHILE EXISTS (SELECT 1 FROM schools WHERE code = final_code) LOOP
        final_code := base_code || counter::TEXT;
        counter := counter + 1;
    END LOOP;
    
    RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Helper function to generate student username
-- =============================================
CREATE OR REPLACE FUNCTION generate_student_username(
    school_code TEXT,
    fname TEXT,
    lname TEXT
)
RETURNS TEXT AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    counter INT := 1;
BEGIN
    -- Generate base username: schoolcode-fname+lname (lowercase, no spaces)
    base_username := LOWER(school_code || '-' || 
        REGEXP_REPLACE(fname, '[^a-zA-Z]', '', 'g') || 
        REGEXP_REPLACE(lname, '[^a-zA-Z]', '', 'g')
    );
    
    final_username := base_username;
    
    -- Check for uniqueness and add number if needed
    WHILE EXISTS (SELECT 1 FROM students WHERE username = final_username) LOOP
        final_username := base_username || counter::TEXT;
        counter := counter + 1;
    END LOOP;
    
    RETURN final_username;
END;
$$ LANGUAGE plpgsql;
















