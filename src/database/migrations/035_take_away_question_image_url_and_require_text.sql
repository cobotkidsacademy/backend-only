-- =============================================
-- Migration 035: Take-Away Quiz Question image url + require text
-- - Add question_image_url column (separate from legacy image_url)
-- - Restore question_text NOT NULL (if a prior migration dropped it)
-- =============================================

-- Add optional question_image_url field
ALTER TABLE take_away_quiz_questions
  ADD COLUMN IF NOT EXISTS question_image_url TEXT;

-- Ensure question_text is not null (convert existing NULLs to empty string first)
UPDATE take_away_quiz_questions
SET question_text = ''
WHERE question_text IS NULL;

ALTER TABLE take_away_quiz_questions
  ALTER COLUMN question_text SET NOT NULL;


