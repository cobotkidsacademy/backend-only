-- =============================================
-- Migration 029: Create Take-Away Quiz System
-- =============================================

-- =============================================
-- Take-Away Quizzes Table
-- =============================================
CREATE TABLE IF NOT EXISTS take_away_quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    time_limit_minutes INTEGER DEFAULT 0,
    passing_score INTEGER DEFAULT 60,
    total_points INTEGER DEFAULT 0,
    questions_count INTEGER DEFAULT 0,
    shuffle_questions BOOLEAN DEFAULT false,
    shuffle_options BOOLEAN DEFAULT false,
    show_correct_answers BOOLEAN DEFAULT true,
    allow_retake BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Take-Away Quiz Questions Table
-- =============================================
CREATE TABLE IF NOT EXISTS take_away_quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES take_away_quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) DEFAULT 'multiple_choice' 
        CHECK (question_type IN ('multiple_choice', 'true_false', 'multi_select')),
    points INTEGER DEFAULT 10,
    order_position INTEGER DEFAULT 0,
    explanation TEXT,
    image_url TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Take-Away Quiz Options Table (Answer choices)
-- =============================================
CREATE TABLE IF NOT EXISTS take_away_quiz_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES take_away_quiz_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false,
    order_position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Take-Away Quiz Attempts Table (Student Submissions)
-- =============================================
CREATE TABLE IF NOT EXISTS take_away_quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES take_away_quizzes(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0,
    passed BOOLEAN DEFAULT false,
    time_spent_seconds INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'in_progress' 
        CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Take-Away Quiz Answers Table (Individual answers)
-- =============================================
CREATE TABLE IF NOT EXISTS take_away_quiz_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES take_away_quiz_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES take_away_quiz_questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES take_away_quiz_options(id) ON DELETE SET NULL,
    is_correct BOOLEAN DEFAULT false,
    points_earned INTEGER DEFAULT 0,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Indexes for Performance
-- =============================================

-- Take-Away Quizzes indexes
CREATE INDEX IF NOT EXISTS idx_take_away_quizzes_status ON take_away_quizzes(status);

-- Take-Away Quiz Questions indexes
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_questions_quiz_id ON take_away_quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_questions_order ON take_away_quiz_questions(quiz_id, order_position);

-- Take-Away Quiz Options indexes
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_options_question_id ON take_away_quiz_options(question_id);
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_options_order ON take_away_quiz_options(question_id, order_position);

-- Take-Away Quiz Attempts indexes
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_attempts_student_id ON take_away_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_attempts_quiz_id ON take_away_quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_attempts_status ON take_away_quiz_attempts(status);

-- Take-Away Quiz Answers indexes
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_answers_attempt_id ON take_away_quiz_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_answers_question_id ON take_away_quiz_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_take_away_quiz_answers_option_id ON take_away_quiz_answers(selected_option_id);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE take_away_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE take_away_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE take_away_quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE take_away_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE take_away_quiz_answers ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role can access all take_away_quizzes"
    ON take_away_quizzes FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all take_away_quiz_questions"
    ON take_away_quiz_questions FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all take_away_quiz_options"
    ON take_away_quiz_options FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all take_away_quiz_attempts"
    ON take_away_quiz_attempts FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all take_away_quiz_answers"
    ON take_away_quiz_answers FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Triggers for updated_at
-- =============================================

-- Take-Away Quizzes trigger
CREATE OR REPLACE FUNCTION update_take_away_quizzes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_take_away_quizzes_updated_at
    BEFORE UPDATE ON take_away_quizzes
    FOR EACH ROW
    EXECUTE FUNCTION update_take_away_quizzes_updated_at();

-- Take-Away Quiz Questions trigger
CREATE OR REPLACE FUNCTION update_take_away_quiz_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_take_away_quiz_questions_updated_at
    BEFORE UPDATE ON take_away_quiz_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_take_away_quiz_questions_updated_at();

-- Take-Away Quiz Options trigger
CREATE OR REPLACE FUNCTION update_take_away_quiz_options_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_take_away_quiz_options_updated_at
    BEFORE UPDATE ON take_away_quiz_options
    FOR EACH ROW
    EXECUTE FUNCTION update_take_away_quiz_options_updated_at();

-- Take-Away Quiz Attempts trigger
CREATE OR REPLACE FUNCTION update_take_away_quiz_attempts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_take_away_quiz_attempts_updated_at
    BEFORE UPDATE ON take_away_quiz_attempts
    FOR EACH ROW
    EXECUTE FUNCTION update_take_away_quiz_attempts_updated_at();
