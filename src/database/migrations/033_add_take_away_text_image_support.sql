-- =============================================
-- Migration 033: Enhance Take-Away Quiz content
-- - Allow question to be text, image, or both
-- - Allow options to be text, image, or both
-- =============================================

-- Make question_text optional so questions can be image-only
ALTER TABLE take_away_quiz_questions
  ALTER COLUMN question_text DROP NOT NULL;

-- Add optional image field for options
ALTER TABLE take_away_quiz_options
  ADD COLUMN IF NOT EXISTS option_image_url TEXT;


