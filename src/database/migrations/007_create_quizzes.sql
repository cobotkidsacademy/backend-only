-- =============================================
-- Quizzes Table - Main quiz entity
-- =============================================
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    time_limit_minutes INTEGER DEFAULT 0, -- 0 means no time limit
    passing_score INTEGER DEFAULT 60, -- Percentage needed to pass
    total_points INTEGER DEFAULT 0, -- Total possible points
    questions_count INTEGER DEFAULT 0,
    shuffle_questions BOOLEAN DEFAULT false,
    shuffle_options BOOLEAN DEFAULT false,
    show_correct_answers BOOLEAN DEFAULT true, -- Show correct answers after quiz
    allow_retake BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Quiz Questions Table
-- =============================================
CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'multi_select')),
    points INTEGER DEFAULT 10,
    order_position INTEGER DEFAULT 0,
    explanation TEXT, -- Explanation shown after answering
    image_url TEXT, -- Optional image for the question
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Quiz Options Table (Answer choices)
-- =============================================
CREATE TABLE IF NOT EXISTS quiz_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false,
    order_position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Student Quiz Attempts Table
-- =============================================
CREATE TABLE IF NOT EXISTS student_quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0,
    passed BOOLEAN DEFAULT false,
    time_spent_seconds INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Student Quiz Answers Table (Individual answers per attempt)
-- =============================================
CREATE TABLE IF NOT EXISTS student_quiz_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES student_quiz_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES quiz_options(id) ON DELETE SET NULL,
    is_correct BOOLEAN DEFAULT false,
    points_earned INTEGER DEFAULT 0,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Student Best Scores Table (Highest score per quiz per student)
-- =============================================
CREATE TABLE IF NOT EXISTS student_quiz_best_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    best_score INTEGER DEFAULT 0,
    best_percentage DECIMAL(5,2) DEFAULT 0,
    attempts_count INTEGER DEFAULT 0,
    first_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One record per student per quiz
    UNIQUE(student_id, quiz_id)
);

-- =============================================
-- Student Total Points Table (Accumulated points)
-- =============================================
CREATE TABLE IF NOT EXISTS student_total_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
    total_points INTEGER DEFAULT 0,
    quizzes_completed INTEGER DEFAULT 0,
    quizzes_passed INTEGER DEFAULT 0,
    average_score DECIMAL(5,2) DEFAULT 0,
    last_quiz_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Create Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_quizzes_topic_id ON quizzes(topic_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_order ON quiz_questions(order_position);

CREATE INDEX IF NOT EXISTS idx_quiz_options_question_id ON quiz_options(question_id);

CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_student_id ON student_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_quiz_id ON student_quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_status ON student_quiz_attempts(status);

CREATE INDEX IF NOT EXISTS idx_student_quiz_answers_attempt_id ON student_quiz_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_student_quiz_answers_question_id ON student_quiz_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_student_quiz_best_scores_student_id ON student_quiz_best_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_student_quiz_best_scores_quiz_id ON student_quiz_best_scores(quiz_id);

CREATE INDEX IF NOT EXISTS idx_student_total_points_student_id ON student_total_points(student_id);
CREATE INDEX IF NOT EXISTS idx_student_total_points_total_points ON student_total_points(total_points DESC);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_quiz_best_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_total_points ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all quizzes" ON quizzes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all quiz_questions" ON quiz_questions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all quiz_options" ON quiz_options FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all student_quiz_attempts" ON student_quiz_attempts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all student_quiz_answers" ON student_quiz_answers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all student_quiz_best_scores" ON student_quiz_best_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all student_total_points" ON student_total_points FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Triggers for updated_at
-- =============================================
CREATE TRIGGER update_quizzes_updated_at 
    BEFORE UPDATE ON quizzes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quiz_questions_updated_at 
    BEFORE UPDATE ON quiz_questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quiz_options_updated_at 
    BEFORE UPDATE ON quiz_options
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_quiz_attempts_updated_at 
    BEFORE UPDATE ON student_quiz_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_quiz_best_scores_updated_at 
    BEFORE UPDATE ON student_quiz_best_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_total_points_updated_at 
    BEFORE UPDATE ON student_total_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Function to update quiz stats after question changes
-- =============================================
CREATE OR REPLACE FUNCTION update_quiz_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE quizzes 
        SET 
            questions_count = (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = OLD.quiz_id AND status = 'active'),
            total_points = COALESCE((SELECT SUM(points) FROM quiz_questions WHERE quiz_id = OLD.quiz_id AND status = 'active'), 0)
        WHERE id = OLD.quiz_id;
        RETURN OLD;
    ELSE
        UPDATE quizzes 
        SET 
            questions_count = (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = NEW.quiz_id AND status = 'active'),
            total_points = COALESCE((SELECT SUM(points) FROM quiz_questions WHERE quiz_id = NEW.quiz_id AND status = 'active'), 0)
        WHERE id = NEW.quiz_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_quiz_stats
    AFTER INSERT OR UPDATE OR DELETE ON quiz_questions
    FOR EACH ROW EXECUTE FUNCTION update_quiz_stats();

