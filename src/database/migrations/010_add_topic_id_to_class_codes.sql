-- =============================================
-- Migration 010: Add topic_id to class_codes
-- =============================================

-- Add topic_id column to class_codes table
ALTER TABLE class_codes 
ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES topics(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_class_codes_topic_id ON class_codes(topic_id);
