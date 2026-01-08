-- =============================================
-- Class Upgrade Editor Assignments Table
-- =============================================
CREATE TABLE IF NOT EXISTS class_upgrade_editor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    editor_type VARCHAR(20) NOT NULL CHECK (editor_type IN ('inter', 'exter')),
    editor_link TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(class_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_class_upgrade_editor_assignments_class_id ON class_upgrade_editor_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_upgrade_editor_assignments_type ON class_upgrade_editor_assignments(editor_type);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE class_upgrade_editor_assignments ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all class upgrade editor assignments"
    ON class_upgrade_editor_assignments FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_class_upgrade_editor_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_class_upgrade_editor_assignments_updated_at
    BEFORE UPDATE ON class_upgrade_editor_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_class_upgrade_editor_assignments_updated_at();







