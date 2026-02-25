-- Drop curriculum quiz result scores feature: table, triggers, and functions.

DROP TRIGGER IF EXISTS trigger_sync_curriculum_quiz_result_score ON student_quiz_attempts;
DROP TRIGGER IF EXISTS update_curriculum_quiz_result_scores_updated_at ON curriculum_quiz_result_scores;

DROP TABLE IF EXISTS curriculum_quiz_result_scores;

DROP FUNCTION IF EXISTS sync_curriculum_quiz_result_score();
DROP FUNCTION IF EXISTS curriculum_quiz_grade_from_percentage(DECIMAL);
