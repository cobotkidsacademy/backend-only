-- =============================================
-- Migration 011: Create class_forms table (global forms, not tied to a class)
-- =============================================

CREATE TABLE IF NOT EXISTS class_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_url TEXT,
  form_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_forms_status ON class_forms(status);


