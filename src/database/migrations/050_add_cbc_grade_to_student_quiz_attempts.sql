-- =============================================
-- Add CBC (Kenya Competency-Based Curriculum) grade column to
-- student_quiz_attempts (course > course_level > topic > quizzes).
-- Auto-calculated from percentage: below_expectation, approaching,
-- meeting, exceeding. Existing rows are backfilled.
-- =============================================

-- Add column (nullable so existing rows are valid until we backfill)
ALTER 1
ADD COLUMN IF NOT EXISTS score_category TEXT
CHECK (score_category IS NULL OR score_category IN ('below_expectation', 'approaching', 'meeting', 'exceeding'));

COMMENT ON COLUMN student_quiz_attempts.score_category IS 'CBC Kenya: below_expectation (0-25%), approaching (26-50%), meeting (51-75%), exceeding (76-100%)';

-- =============================================
-- Function: CBC Kenya grade from percentage
-- 0-25% Below Expectations, 26-50% Approaching,
-- 51-75% Meeting, 76-100% Exceeding
-- =============================================
CREATE OR REPLACE FUNCTION student_quiz_attempt_cbc_grade(pct DECIMAL)
RETURNS TEXT AS $$
BEGIN
    IF pct IS NULL THEN RETURN NULL; END IF;
    IF pct <= 25 THEN RETURN 'below_expectation'; END IF;
    IF pct <= 50 THEN RETURN 'approaching'; END IF;
    IF pct <= 75 THEN RETURN 'meeting'; END IF;
    RETURN 'exceeding';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- Trigger: auto-calculate score_category from percentage on insert/update
-- =============================================
CREATE OR REPLACE FUNCTION set_student_quiz_attempt_score_category()
RETURNS TRIGGER AS $$
BEGIN
    NEW.score_category := student_quiz_attempt_cbc_grade(NEW.percentage);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_student_quiz_attempt_score_category ON student_quiz_attempts;
CREATE TRIGGER trigger_set_student_quiz_attempt_score_category
    BEFORE INSERT OR UPDATE OF score, max_score, percentage, status ON student_quiz_attempts
    FOR EACH ROW
    EXECUTE FUNCTION set_student_quiz_attempt_score_category();

-- =============================================
-- Backfill: set score_category for all existing rows that have percentage
-- =============================================
UPDATE student_quiz_attempts
SET score_category = student_quiz_attempt_cbc_grade(percentage)
WHERE percentage IS NOT NULL
  AND (score_category IS NULL OR score_category <> student_quiz_attempt_cbc_grade(percentage));
