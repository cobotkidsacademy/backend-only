-- =============================================
-- Migration 020: Create Editors Table
-- =============================================

-- =============================================
-- Create Editors Table
-- =============================================
CREATE TABLE IF NOT EXISTS editors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(10), -- Emoji or icon identifier
    color VARCHAR(100), -- Tailwind gradient classes like "from-orange-500 to-orange-600"
    status VARCHAR(20) DEFAULT 'coming_soon' CHECK (status IN ('coming_soon', 'available')),
    link TEXT, -- External link URL
    linked_editor_id UUID REFERENCES editors(id) ON DELETE SET NULL, -- Link to another editor
    logo_image_url TEXT, -- URL to logo image
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_editors_name ON editors(name);
CREATE INDEX IF NOT EXISTS idx_editors_status ON editors(status);
CREATE INDEX IF NOT EXISTS idx_editors_linked_editor_id ON editors(linked_editor_id);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE editors ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all editors"
    ON editors FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_editors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_editors_updated_at
    BEFORE UPDATE ON editors
    FOR EACH ROW
    EXECUTE FUNCTION update_editors_updated_at();

-- =============================================
-- Insert Default Editors
-- =============================================
INSERT INTO editors (name, description, icon, color, status) VALUES
    ('Scratch', 'Visual block-based programming editor', '🎨', 'from-orange-500 to-orange-600', 'coming_soon'),
    ('Python', 'Python programming environment', '🐍', 'from-blue-500 to-blue-600', 'coming_soon'),
    ('AppLab', 'Code.org AppLab programming environment', '📱', 'from-purple-500 to-purple-600', 'coming_soon'),
    ('HTML', 'HTML + CSS editor', '🌐', 'from-red-500 to-red-600', 'coming_soon'),
    ('HTML + CSS + JS', 'Full-stack web development editor', '💻', 'from-green-500 to-green-600', 'coming_soon'),
    ('JavaScript', 'JavaScript programming environment', '⚡', 'from-yellow-500 to-yellow-600', 'coming_soon'),
    ('Arduino Simulation', 'Arduino microcontroller simulation', '🔌', 'from-teal-500 to-teal-600', 'coming_soon'),
    ('Ethical Hacking', 'Ethical hacking and cybersecurity tools', '🔒', 'from-gray-700 to-gray-800', 'coming_soon'),
    ('VSC Editor', 'Visual Studio Code-like editor', '📝', 'from-indigo-500 to-indigo-600', 'coming_soon'),
    ('React', 'React.js development environment', '⚛️', 'from-cyan-500 to-cyan-600', 'coming_soon'),
    ('Node.js', 'Node.js server-side programming', '🟢', 'from-emerald-500 to-emerald-600', 'coming_soon')
ON CONFLICT (name) DO NOTHING;









