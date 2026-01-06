-- =============================================
-- Tutors Table
-- =============================================
CREATE TABLE IF NOT EXISTS tutors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Required fields
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    level VARCHAR(50) NOT NULL CHECK (level IN ('intern', 'tutor', 'manager', 'edl', 'operations_manager', 'curriculum_manager')),
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    phone VARCHAR(50) NOT NULL,
    
    -- Auto-generated credentials
    email VARCHAR(255) UNIQUE NOT NULL, -- fname.lname@cobotkids.edutech
    password_hash VARCHAR(255) NOT NULL,
    plain_password VARCHAR(255), -- Store for display (mname + cocobotkids2026)
    
    -- Optional fields
    id_number VARCHAR(50),
    nssf_no VARCHAR(50),
    kra_pin VARCHAR(50),
    location TEXT,
    date_of_birth DATE,
    profile_image_url TEXT,
    
    -- Status and timestamps
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for tutors
CREATE INDEX IF NOT EXISTS idx_tutors_email ON tutors(email);
CREATE INDEX IF NOT EXISTS idx_tutors_level ON tutors(level);
CREATE INDEX IF NOT EXISTS idx_tutors_status ON tutors(status);
CREATE INDEX IF NOT EXISTS idx_tutors_phone ON tutors(phone);

-- Enable Row Level Security
ALTER TABLE tutors ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all tutors"
    ON tutors FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_tutors_updated_at 
    BEFORE UPDATE ON tutors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();






