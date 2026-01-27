-- =============================================
-- Migration 033: Add is_internal field to editors table
-- =============================================

-- Add is_internal column to editors table
ALTER TABLE editors 
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT FALSE;

-- Create index for is_internal
CREATE INDEX IF NOT EXISTS idx_editors_is_internal ON editors(is_internal);

-- Update comment
COMMENT ON COLUMN editors.is_internal IS 'If true, editor is configured as internal (part of our system) and should open directly without iframe. If false, editor is external and requires iframe rendering.';

