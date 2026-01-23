-- =============================================
-- Migration 031: Create Take-Away Assignment Student Points Tracking
-- =============================================
-- This table tracks total points earned by each student for each take-away assignment
-- Points are calculated from correct answers in take_away_quiz_answers

-- =============================================
-- Take-Away Assignment Student Points Table
-- =============================================
CREATE TABLE IF NOT EXISTS take_away_assignment_student_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES take_away_assignments(id) ON DELETE CASCADE,
    total_points_earned INTEGER DEFAULT 0,
    max_possible_points INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    best_percentage DECIMAL(5,2) DEFAULT 0,
    total_attempts INTEGER DEFAULT 0,
    completed_attempts INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one record per student per assignment
    UNIQUE(student_id, assignment_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_take_away_assignment_student_points_student_id 
    ON take_away_assignment_student_points(student_id);
CREATE INDEX IF NOT EXISTS idx_take_away_assignment_student_points_assignment_id 
    ON take_away_assignment_student_points(assignment_id);
CREATE INDEX IF NOT EXISTS idx_take_away_assignment_student_points_total_points 
    ON take_away_assignment_student_points(total_points_earned DESC);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE take_away_assignment_student_points ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role can access all take_away_assignment_student_points"
    ON take_away_assignment_student_points FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Function to Calculate and Update Student Points for an Assignment
-- =============================================
CREATE OR REPLACE FUNCTION calculate_take_away_assignment_student_points(
    p_student_id UUID,
    p_assignment_id UUID
)
RETURNS TABLE (
    total_points_earned INTEGER,
    max_possible_points INTEGER,
    best_score INTEGER,
    best_percentage DECIMAL(5,2),
    total_attempts INTEGER,
    completed_attempts INTEGER
) AS $$
DECLARE
    v_quiz_id UUID;
    v_max_points INTEGER;
    v_total_points INTEGER := 0;
    v_best_score INTEGER := 0;
    v_best_percentage DECIMAL(5,2) := 0;
    v_total_attempts INTEGER := 0;
    v_completed_attempts INTEGER := 0;
    v_question_points RECORD;
BEGIN
    -- Get quiz_id from assignment
    SELECT take_away_quiz_id INTO v_quiz_id
    FROM take_away_assignments
    WHERE id = p_assignment_id;
    
    IF v_quiz_id IS NULL THEN
        -- No quiz assigned, return zeros
        RETURN QUERY SELECT 0, 0, 0, 0::DECIMAL(5,2), 0, 0;
        RETURN;
    END IF;
    
    -- Get max possible points from quiz
    SELECT total_points INTO v_max_points
    FROM take_away_quizzes
    WHERE id = v_quiz_id;
    
    IF v_max_points IS NULL THEN
        v_max_points := 0;
    END IF;
    
    -- Get all attempts for this student and quiz
    SELECT 
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (WHERE status = 'completed')::INTEGER,
        COALESCE(MAX(score), 0)::INTEGER,
        COALESCE(MAX(percentage), 0)::DECIMAL(5,2)
    INTO v_total_attempts, v_completed_attempts, v_best_score, v_best_percentage
    FROM take_away_quiz_attempts
    WHERE student_id = p_student_id
      AND quiz_id = v_quiz_id;
    
    -- Calculate total points from correct answers
    -- For each question, get the best points earned across all completed attempts
    -- For multi-select: use summary records (selected_option_id is null)
    -- For single-select: use regular answer records
    SELECT COALESCE(SUM(best_points), 0) INTO v_total_points
    FROM (
        SELECT 
            q.id AS question_id,
            GREATEST(
                COALESCE(MAX(a.points_earned) FILTER (WHERE a.selected_option_id IS NULL AND a.is_correct = true), 0),
                COALESCE(MAX(a.points_earned) FILTER (WHERE a.selected_option_id IS NOT NULL AND a.is_correct = true), 0)
            ) AS best_points
        FROM take_away_quiz_questions q
        INNER JOIN take_away_quiz_attempts att ON att.quiz_id = q.quiz_id
        LEFT JOIN take_away_quiz_answers a ON a.question_id = q.id 
            AND a.attempt_id = att.id
            AND a.is_correct = true
        WHERE q.quiz_id = v_quiz_id
          AND att.student_id = p_student_id
          AND att.status = 'completed'
        GROUP BY q.id
    ) AS question_points;
    
    -- Return calculated values
    RETURN QUERY SELECT 
        v_total_points,
        v_max_points,
        v_best_score,
        v_best_percentage,
        v_total_attempts,
        v_completed_attempts;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function to Update Student Points for an Assignment
-- =============================================
CREATE OR REPLACE FUNCTION update_take_away_assignment_student_points(
    p_student_id UUID,
    p_assignment_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_points RECORD;
BEGIN
    -- Calculate points
    SELECT * INTO v_points
    FROM calculate_take_away_assignment_student_points(p_student_id, p_assignment_id);
    
    -- Insert or update the record
    INSERT INTO take_away_assignment_student_points (
        student_id,
        assignment_id,
        total_points_earned,
        max_possible_points,
        best_score,
        best_percentage,
        total_attempts,
        completed_attempts,
        last_calculated_at,
        updated_at
    )
    VALUES (
        p_student_id,
        p_assignment_id,
        v_points.total_points_earned,
        v_points.max_possible_points,
        v_points.best_score,
        v_points.best_percentage,
        v_points.total_attempts,
        v_points.completed_attempts,
        NOW(),
        NOW()
    )
    ON CONFLICT (student_id, assignment_id)
    DO UPDATE SET
        total_points_earned = EXCLUDED.total_points_earned,
        max_possible_points = EXCLUDED.max_possible_points,
        best_score = EXCLUDED.best_score,
        best_percentage = EXCLUDED.best_percentage,
        total_attempts = EXCLUDED.total_attempts,
        completed_attempts = EXCLUDED.completed_attempts,
        last_calculated_at = EXCLUDED.last_calculated_at,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Trigger to Auto-Update Points When Quiz is Submitted
-- =============================================
CREATE OR REPLACE FUNCTION trigger_update_student_points_on_quiz_submit()
RETURNS TRIGGER AS $$
DECLARE
    v_assignment_id UUID;
    v_student_id UUID;
    v_error_message TEXT;
BEGIN
    -- Only process completed attempts
    IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
        v_student_id := NEW.student_id;
        
        -- Find assignment(s) for this quiz
        FOR v_assignment_id IN
            SELECT id
            FROM take_away_assignments
            WHERE take_away_quiz_id = NEW.quiz_id
        LOOP
            BEGIN
                -- Update points for this student and assignment
                PERFORM update_take_away_assignment_student_points(v_student_id, v_assignment_id);
            EXCEPTION WHEN OTHERS THEN
                -- Log error but don't fail the transaction
                v_error_message := SQLERRM;
                RAISE WARNING 'Error updating points for student % assignment %: %', v_student_id, v_assignment_id, v_error_message;
            END;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_student_points_on_quiz_submit ON take_away_quiz_attempts;

-- Create the trigger
CREATE TRIGGER trigger_update_student_points_on_quiz_submit
    AFTER INSERT OR UPDATE ON take_away_quiz_attempts
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION trigger_update_student_points_on_quiz_submit();

-- =============================================
-- Trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_take_away_assignment_student_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists (for idempotent migration)
DROP TRIGGER IF EXISTS trigger_update_take_away_assignment_student_points_updated_at ON take_away_assignment_student_points;

-- Create the trigger
CREATE TRIGGER trigger_update_take_away_assignment_student_points_updated_at
    BEFORE UPDATE ON take_away_assignment_student_points
    FOR EACH ROW
    EXECUTE FUNCTION update_take_away_assignment_student_points_updated_at();
