-- =============================================
-- Migration 041: Self Class Codes (student-generated, for home practice)
-- =============================================
-- Separate from regular class_codes (teacher-generated during class).
-- Used when students practice at home and teacher is not around.
-- Code lasts 6 hrs, 4 hr cooldown after expiry before next request.

CREATE TABLE IF NOT EXISTS self_class_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
    code VARCHAR(3) NOT NULL,
    
    -- Validity: 6 hours from generation
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Link to chat message (so we can update when expired)
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_class_codes_student_id ON self_class_codes(student_id);
CREATE INDEX IF NOT EXISTS idx_self_class_codes_class_id ON self_class_codes(class_id);
CREATE INDEX IF NOT EXISTS idx_self_class_codes_valid_until ON self_class_codes(valid_until);
CREATE INDEX IF NOT EXISTS idx_self_class_codes_status ON self_class_codes(status);
CREATE INDEX IF NOT EXISTS idx_self_class_codes_created_at ON self_class_codes(created_at);

ALTER TABLE self_class_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can access all self_class_codes"
    ON self_class_codes FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_self_class_codes_updated_at
    BEFORE UPDATE ON self_class_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Self class code usage (when student enters the code - for reports)
-- =============================================
CREATE TABLE IF NOT EXISTS self_class_code_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    self_class_code_id UUID NOT NULL REFERENCES self_class_codes(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
    used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_class_code_usage_student_id ON self_class_code_usage(student_id);
CREATE INDEX IF NOT EXISTS idx_self_class_code_usage_used_at ON self_class_code_usage(used_at);

ALTER TABLE self_class_code_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can access all self_class_code_usage"
    ON self_class_code_usage FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE self_class_codes IS 'Student-generated class codes for home practice (6hr validity, 4hr cooldown)';
COMMENT ON TABLE self_class_code_usage IS 'Records when a student used a self-generated class code';
