-- =============================================
-- Migration 036: Student class code usage (for report: topic learned per day)
-- =============================================

CREATE TABLE IF NOT EXISTS student_class_code_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_code_id UUID NOT NULL REFERENCES class_codes(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
    used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_class_code_usage_student_id ON student_class_code_usage(student_id);
CREATE INDEX IF NOT EXISTS idx_student_class_code_usage_used_at ON student_class_code_usage(used_at);
CREATE INDEX IF NOT EXISTS idx_student_class_code_usage_topic_id ON student_class_code_usage(topic_id);

ALTER TABLE student_class_code_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can access all student_class_code_usage"
    ON student_class_code_usage FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE student_class_code_usage IS 'Records when a student used a class code (to show topic learned that day in reports)';
