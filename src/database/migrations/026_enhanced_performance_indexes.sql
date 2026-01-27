-- Enhanced Performance Indexes for 100K+ Concurrent Users
-- Additional indexes for lessons, assignments, and analytics queries
--
-- Run this after 025_performance_indexes.sql

-- ============================================
-- LESSON INDEXES (Critical for on-demand loading)
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lessons') THEN
        -- Course level lookups (most common query)
        CREATE INDEX IF NOT EXISTS idx_lessons_course_level_id 
            ON lessons(course_level_id) WHERE course_level_id IS NOT NULL;
        
        -- Order index for pagination (cursor-based)
        CREATE INDEX IF NOT EXISTS idx_lessons_course_level_order 
            ON lessons(course_level_id, order_index) WHERE course_level_id IS NOT NULL;
        
        -- Topic lookups
        CREATE INDEX IF NOT EXISTS idx_lessons_topic_id 
            ON lessons(topic_id) WHERE topic_id IS NOT NULL;
        
        -- Created date for cursor pagination
        CREATE INDEX IF NOT EXISTS idx_lessons_created_at 
            ON lessons(created_at DESC);
    END IF;

    -- Student lesson progress (critical for dashboard performance)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_lesson_progress') THEN
        -- Student + lesson lookup (most common)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_student_lesson_progress_student_lesson 
            ON student_lesson_progress(student_id, lesson_id);
        
        -- Student + completion status (dashboard queries)
        CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_student_completed 
            ON student_lesson_progress(student_id, completed) WHERE completed = true;
        
        -- Course level progress aggregation
        CREATE INDEX IF NOT EXISTS idx_student_lesson_progress_lesson 
            ON student_lesson_progress(lesson_id);
    END IF;
END $$;

-- ============================================
-- ASSIGNMENT INDEXES (Critical for pagination)
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assignments') THEN
        -- Student + status lookup (most common query)
        CREATE INDEX IF NOT EXISTS idx_assignments_student_status 
            ON assignments(student_id, status) WHERE student_id IS NOT NULL;
        
        -- Student + due date (upcoming assignments)
        CREATE INDEX IF NOT EXISTS idx_assignments_student_due_date 
            ON assignments(student_id, due_date DESC) WHERE student_id IS NOT NULL;
        
        -- Lesson assignments
        CREATE INDEX IF NOT EXISTS idx_assignments_lesson_id 
            ON assignments(lesson_id) WHERE lesson_id IS NOT NULL;
        
        -- Created date for cursor pagination
        CREATE INDEX IF NOT EXISTS idx_assignments_created_at 
            ON assignments(created_at DESC);
        
        -- Composite for upcoming assignments query
        CREATE INDEX IF NOT EXISTS idx_assignments_student_upcoming 
            ON assignments(student_id, due_date, status) 
            WHERE student_id IS NOT NULL AND status = 'pending' AND due_date >= CURRENT_DATE;
    END IF;
END $$;

-- ============================================
-- ENROLLMENT INDEXES (Enhanced)
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_course_enrollments') THEN
        -- Student enrollments (dashboard queries)
        CREATE INDEX IF NOT EXISTS idx_enrollments_student_id 
            ON student_course_enrollments(student_id) WHERE student_id IS NOT NULL;
        
        -- Course level enrollments
        CREATE INDEX IF NOT EXISTS idx_enrollments_course_level_id 
            ON student_course_enrollments(course_level_id) WHERE course_level_id IS NOT NULL;
        
        -- Composite for student dashboard (student + enrollment date)
        CREATE INDEX IF NOT EXISTS idx_enrollments_student_date 
            ON student_course_enrollments(student_id, enrollment_date DESC) 
            WHERE student_id IS NOT NULL;
        
        -- Class enrollments (tutor queries)
        CREATE INDEX IF NOT EXISTS idx_enrollments_class_id 
            ON student_course_enrollments(class_id) WHERE class_id IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- TUTOR CLASS ASSIGNMENT INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tutor_class_assignments') THEN
        -- Tutor + status (dashboard queries)
        CREATE INDEX IF NOT EXISTS idx_tutor_class_assignments_tutor_status 
            ON tutor_class_assignments(tutor_id, status) 
            WHERE tutor_id IS NOT NULL AND status = 'active';
        
        -- Class assignments
        CREATE INDEX IF NOT EXISTS idx_tutor_class_assignments_class_id 
            ON tutor_class_assignments(class_id) WHERE class_id IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- QUIZ/EXAM INDEXES (For analytics)
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quiz_attempts') THEN
        -- Student quiz attempts
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id 
            ON quiz_attempts(student_id) WHERE student_id IS NOT NULL;
        
        -- Quiz + student (performance queries)
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_student 
            ON quiz_attempts(quiz_id, student_id) WHERE quiz_id IS NOT NULL AND student_id IS NOT NULL;
        
        -- Created date for analytics
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_created_at 
            ON quiz_attempts(created_at DESC);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_quiz_best_scores') THEN
        -- Student best scores
        CREATE INDEX IF NOT EXISTS idx_student_quiz_best_scores_student_id 
            ON student_quiz_best_scores(student_id) WHERE student_id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_total_points') THEN
        -- Student points lookup
        CREATE UNIQUE INDEX IF NOT EXISTS idx_student_total_points_student_id 
            ON student_total_points(student_id) WHERE student_id IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- NOTIFICATION INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        -- Student notifications (unread count queries)
        CREATE INDEX IF NOT EXISTS idx_notifications_student_read 
            ON notifications(student_id, read) 
            WHERE student_id IS NOT NULL AND read = false;
        
        -- Created date for pagination
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
            ON notifications(created_at DESC);
    END IF;
END $$;

-- ============================================
-- ATTENDANCE INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN
        -- Student attendance lookups
        CREATE INDEX IF NOT EXISTS idx_attendance_student_date 
            ON attendance(student_id, date DESC) WHERE student_id IS NOT NULL;
        
        -- Class attendance (tutor queries)
        CREATE INDEX IF NOT EXISTS idx_attendance_class_date 
            ON attendance(class_id, date DESC) WHERE class_id IS NOT NULL;
        
        -- Date range queries (reports)
        CREATE INDEX IF NOT EXISTS idx_attendance_date 
            ON attendance(date DESC);
    END IF;
END $$;

-- ============================================
-- ANALYTICS MATERIALIZED VIEWS (Optional - for very heavy queries)
-- ============================================

-- Uncomment these for production if you need pre-aggregated analytics
-- They need to be refreshed periodically (e.g., every 5 minutes via cron)

/*
DO $$
BEGIN
    -- Student progress summary (for dashboards)
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'student_progress_summary') THEN
        CREATE MATERIALIZED VIEW student_progress_summary AS
        SELECT 
            s.id AS student_id,
            s.class_id,
            s.school_id,
            COUNT(DISTINCT e.course_level_id) AS enrolled_courses_count,
            COUNT(DISTINCT CASE WHEN slp.completed = true THEN slp.lesson_id END) AS completed_lessons_count,
            COUNT(DISTINCT a.id) AS total_assignments_count,
            COUNT(DISTINCT CASE WHEN a.status = 'submitted' THEN a.id END) AS submitted_assignments_count,
            COUNT(DISTINCT CASE WHEN a.status = 'pending' AND a.due_date >= CURRENT_DATE THEN a.id END) AS upcoming_assignments_count,
            COALESCE(stp.total_points, 0) AS total_points,
            COALESCE(stp.quizzes_completed, 0) AS quizzes_completed
        FROM students s
        LEFT JOIN student_course_enrollments e ON e.student_id = s.id
        LEFT JOIN student_lesson_progress slp ON slp.student_id = s.id
        LEFT JOIN assignments a ON a.student_id = s.id
        LEFT JOIN student_total_points stp ON stp.student_id = s.id
        WHERE s.status = 'active'
        GROUP BY s.id, s.class_id, s.school_id, stp.total_points, stp.quizzes_completed;

        CREATE UNIQUE INDEX idx_student_progress_summary_student_id 
            ON student_progress_summary(student_id);
    END IF;

    -- Class statistics (for tutor dashboards)
    IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'class_statistics') THEN
        CREATE MATERIALIZED VIEW class_statistics AS
        SELECT 
            c.id AS class_id,
            c.school_id,
            COUNT(DISTINCT s.id) AS student_count,
            COUNT(DISTINCT e.course_level_id) AS course_count,
            COUNT(DISTINCT CASE WHEN a.status = 'pending' THEN a.id END) AS pending_assignments_count,
            AVG(slp.completed::int) AS avg_lesson_completion_rate
        FROM classes c
        LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
        LEFT JOIN student_course_enrollments e ON e.class_id = c.id
        LEFT JOIN assignments a ON a.student_id = s.id
        LEFT JOIN student_lesson_progress slp ON slp.student_id = s.id
        WHERE c.status = 'active'
        GROUP BY c.id, c.school_id;

        CREATE UNIQUE INDEX idx_class_statistics_class_id 
            ON class_statistics(class_id);
    END IF;
END $$;
*/

-- ============================================
-- INDEX MAINTENANCE NOTES
-- ============================================
-- 
-- These indexes are optimized for read-heavy workloads (100K+ concurrent users)
-- Monitor index usage with:
--   SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';
--
-- Rebuild indexes periodically if needed:
--   REINDEX INDEX CONCURRENTLY idx_students_username;
--
-- Analyze tables after major data changes:
--   ANALYZE students;
--   ANALYZE enrollments;
--   ANALYZE lessons;
--   ANALYZE assignments;

