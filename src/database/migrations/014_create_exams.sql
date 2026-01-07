-- =============================================
-- Exams Table - Similar to quizzes but for formal assessments
-- =============================================
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    -- Auto-generated exam code, e.g. EXM-AB12
    exam_code VARCHAR(20) UNIQUE,
    time_limit_minutes INTEGER DEFAULT 0, -- 0 means no time limit
    passing_score INTEGER DEFAULT 60, -- Percentage needed to pass
    total_points INTEGER DEFAULT 0,
    questions_count INTEGER DEFAULT 0,
    shuffle_questions BOOLEAN DEFAULT false,
    shuffle_options BOOLEAN DEFAULT false,
    show_correct_answers BOOLEAN DEFAULT false, -- Usually false for exams
    allow_retake BOOLEAN DEFAULT false, -- Usually false for exams
    exam_type VARCHAR(20) DEFAULT 'standard' CHECK (exam_type IN ('standard', 'final', 'midterm', 'practice')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('active', 'inactive', 'draft')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Exam Questions Table
-- =============================================
CREATE TABLE IF NOT EXISTS exam_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'multi_select', 'essay', 'short_answer')),
    points INTEGER DEFAULT 10,
    order_position INTEGER DEFAULT 0,
    explanation TEXT,
    image_url TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Exam Options Table (Answer choices)
-- =============================================
CREATE TABLE IF NOT EXISTS exam_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false,
    order_position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Student Exam Attempts Table
-- =============================================
CREATE TABLE IF NOT EXISTS student_exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 0,
    percentage DECIMAL(5,2) DEFAULT 0,
    passed BOOLEAN DEFAULT false,
    time_spent_seconds INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned', 'graded')),
    graded_by_tutor_id UUID REFERENCES tutors(id) ON DELETE SET NULL,
    graded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Student Exam Answers Table
-- =============================================
CREATE TABLE IF NOT EXISTS student_exam_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES student_exam_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES exam_options(id) ON DELETE SET NULL,
    answer_text TEXT, -- For essay/short answer questions
    is_correct BOOLEAN DEFAULT false,
    points_earned INTEGER DEFAULT 0,
    manual_grade INTEGER, -- For manually graded questions
    feedback TEXT, -- Tutor feedback
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_exams_topic_id ON exams(topic_id);
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_order ON exam_questions(order_position);
CREATE INDEX IF NOT EXISTS idx_exam_options_question_id ON exam_options(question_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_attempts_student_id ON student_exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_attempts_exam_id ON student_exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_answers_attempt_id ON student_exam_answers(attempt_id);

-- Enable Row Level Security
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_exam_answers ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access all exams" ON exams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all exam_questions" ON exam_questions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all exam_options" ON exam_options FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all student_exam_attempts" ON student_exam_attempts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all student_exam_answers" ON student_exam_answers FOR ALL USING (auth.role() = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_exam_questions_updated_at BEFORE UPDATE ON exam_questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_exam_options_updated_at BEFORE UPDATE ON exam_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_exam_attempts_updated_at BEFORE UPDATE ON student_exam_attempts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update exam stats after question changes
CREATE OR REPLACE FUNCTION update_exam_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE exams 
        SET 
            questions_count = (SELECT COUNT(*) FROM exam_questions WHERE exam_id = OLD.exam_id AND status = 'active'),
            total_points = COALESCE((SELECT SUM(points) FROM exam_questions WHERE exam_id = OLD.exam_id AND status = 'active'), 0)
        WHERE id = OLD.exam_id;
        RETURN OLD;
    ELSE
        UPDATE exams 
        SET 
            questions_count = (SELECT COUNT(*) FROM exam_questions WHERE exam_id = NEW.exam_id AND status = 'active'),
            total_points = COALESCE((SELECT SUM(points) FROM exam_questions WHERE exam_id = NEW.exam_id AND status = 'active'), 0)
        WHERE id = NEW.exam_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_exam_stats
    AFTER INSERT OR UPDATE OR DELETE ON exam_questions
    FOR EACH ROW EXECUTE FUNCTION update_exam_stats();

