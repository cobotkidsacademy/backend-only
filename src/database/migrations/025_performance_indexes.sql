-- Performance Optimization Indexes
-- These indexes are critical for supporting 100,000+ concurrent users
--
-- IMPORTANT: This migration uses DO blocks to safely check for table existence
-- before creating indexes. This prevents errors if tables don't exist yet.
-- You can run this migration multiple times safely.

-- ============================================
-- STUDENT INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'students') THEN
        -- Username lookup (login performance)
        CREATE INDEX IF NOT EXISTS idx_students_username ON students(username);
        CREATE INDEX IF NOT EXISTS idx_students_email ON students(email) WHERE email IS NOT NULL;
        
        -- Class and school lookups (dashboard performance)
        CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id) WHERE class_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id) WHERE school_id IS NOT NULL;
        
        -- Status filtering (active students only)
        CREATE INDEX IF NOT EXISTS idx_students_status ON students(status) WHERE status = 'active';
        
        -- Composite index for common queries (class + status)
        CREATE INDEX IF NOT EXISTS idx_students_class_status ON students(class_id, status) WHERE class_id IS NOT NULL;
        
        -- Login tracking
        CREATE INDEX IF NOT EXISTS idx_students_last_login ON students(last_login DESC) WHERE last_login IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- TUTOR INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tutors') THEN
        -- Email lookup (login performance)
        CREATE INDEX IF NOT EXISTS idx_tutors_email ON tutors(email);
        CREATE INDEX IF NOT EXISTS idx_tutors_status ON tutors(status) WHERE status = 'active';
    END IF;
END $$;

-- ============================================
-- ADMIN INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admins') THEN
        -- Email lookup (login performance)
        CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
        CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);
    END IF;
END $$;

-- ============================================
-- SCHOOL INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schools') THEN
        CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code);
        CREATE INDEX IF NOT EXISTS idx_schools_email ON schools(email) WHERE email IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_schools_auto_email ON schools(auto_email) WHERE auto_email IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status) WHERE status = 'active';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'classes') THEN
        CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);
        CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status) WHERE status = 'active';
    END IF;
END $$;

-- ============================================
-- PARENT INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parents') THEN
        CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(email);
        CREATE INDEX IF NOT EXISTS idx_parents_status ON parents(status) WHERE status = 'active';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'parent_student_links') THEN
        CREATE INDEX IF NOT EXISTS idx_parent_student_links_parent_id ON parent_student_links(parent_id);
        CREATE INDEX IF NOT EXISTS idx_parent_student_links_student_id ON parent_student_links(student_id);
    END IF;
END $$;

-- ============================================
-- ENROLLMENT INDEXES
-- ============================================
-- Note: Using student_course_enrollments (actual table name from migration 008)

-- Student enrollments (dashboard queries)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_course_enrollments') THEN
        CREATE INDEX IF NOT EXISTS idx_student_enrollments_student_id ON student_course_enrollments(student_id);
        CREATE INDEX IF NOT EXISTS idx_student_enrollments_course_id ON student_course_enrollments(course_id);
        CREATE INDEX IF NOT EXISTS idx_student_enrollments_status ON student_course_enrollments(enrollment_status);
        CREATE INDEX IF NOT EXISTS idx_student_enrollments_enrolled_at ON student_course_enrollments(enrolled_at DESC) WHERE enrolled_at IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- COURSE INDEXES
-- ============================================
-- Note: These indexes may already exist from migration 004, but creating them again is safe

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'courses') THEN
        CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);
        CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_levels') THEN
        CREATE INDEX IF NOT EXISTS idx_course_levels_course_id ON course_levels(course_id);
        CREATE INDEX IF NOT EXISTS idx_course_levels_level_number ON course_levels(course_id, level_number);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_course_level_assignments') THEN
        CREATE INDEX IF NOT EXISTS idx_class_course_levels_class_id ON class_course_level_assignments(class_id);
        CREATE INDEX IF NOT EXISTS idx_class_course_levels_course_level_id ON class_course_level_assignments(course_level_id);
        CREATE INDEX IF NOT EXISTS idx_class_course_levels_status ON class_course_level_assignments(enrollment_status);
    END IF;
END $$;

-- ============================================
-- NOTES/TOPICS INDEXES (Lessons are stored as notes in topics)
-- ============================================

-- Topics (organized by course level)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'topics') THEN
        CREATE INDEX IF NOT EXISTS idx_topics_level_id ON topics(level_id);
        CREATE INDEX IF NOT EXISTS idx_topics_order ON topics(level_id, order_index);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes') THEN
        CREATE INDEX IF NOT EXISTS idx_notes_topic_id ON notes(topic_id);
        CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(topic_id, order_index);
    END IF;
END $$;

-- ============================================
-- ASSIGNMENT INDEXES
-- ============================================
-- Note: Assignments may be in course_editor_assignments or class_upgrade_editor_assignments
-- Creating indexes only if tables exist

DO $$
BEGIN
    -- Course editor assignments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_editor_assignments') THEN
        CREATE INDEX IF NOT EXISTS idx_course_editor_assignments_student_id ON course_editor_assignments(student_id);
        CREATE INDEX IF NOT EXISTS idx_course_editor_assignments_course_id ON course_editor_assignments(course_id);
    END IF;
    
    -- Class upgrade editor assignments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'class_upgrade_editor_assignments') THEN
        CREATE INDEX IF NOT EXISTS idx_class_upgrade_assignments_class_id ON class_upgrade_editor_assignments(class_id);
    END IF;
END $$;

-- ============================================
-- QUIZ INDEXES
-- ============================================
-- Note: Using student_quiz_attempts (actual table name from migration 007)

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_quiz_attempts') THEN
        -- These indexes may already exist from migration 007, but creating them again is safe
        CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_student_id ON student_quiz_attempts(student_id);
        CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_quiz_id ON student_quiz_attempts(quiz_id);
        CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_created_at ON student_quiz_attempts(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_student_created ON student_quiz_attempts(student_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_student_quiz_attempts_status ON student_quiz_attempts(status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_quiz_best_scores') THEN
        CREATE INDEX IF NOT EXISTS idx_student_quiz_best_scores_student_id ON student_quiz_best_scores(student_id);
        CREATE INDEX IF NOT EXISTS idx_student_quiz_best_scores_quiz_id ON student_quiz_best_scores(quiz_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_total_points') THEN
        CREATE INDEX IF NOT EXISTS idx_student_total_points_student_id ON student_total_points(student_id);
    END IF;
END $$;

-- ============================================
-- PROGRESS TRACKING INDEXES
-- ============================================

DO $$
BEGIN
    -- Student performance tracking (from migration 016)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_performance') THEN
        CREATE INDEX IF NOT EXISTS idx_student_performance_student_id ON student_performance(student_id);
        CREATE INDEX IF NOT EXISTS idx_student_performance_course_level_id ON student_performance(course_level_id);
        CREATE INDEX IF NOT EXISTS idx_student_performance_enrollment_status ON student_performance(enrollment_status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'performance_history') THEN
        CREATE INDEX IF NOT EXISTS idx_performance_history_student_id ON performance_history(student_id);
        CREATE INDEX IF NOT EXISTS idx_performance_history_course_level_id ON performance_history(course_level_id);
        CREATE INDEX IF NOT EXISTS idx_performance_history_recorded_at ON performance_history(recorded_at DESC);
    END IF;
END $$;

-- ============================================
-- TUTOR CLASS ASSIGNMENTS
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tutor_class_assignments') THEN
        -- Tutor class assignments
        CREATE INDEX IF NOT EXISTS idx_tutor_assignments_tutor_id ON tutor_class_assignments(tutor_id);
        CREATE INDEX IF NOT EXISTS idx_tutor_assignments_class_id ON tutor_class_assignments(class_id);
        CREATE INDEX IF NOT EXISTS idx_tutor_assignments_status ON tutor_class_assignments(status) WHERE status = 'active';
        
        -- Composite for tutor dashboard queries
        CREATE INDEX IF NOT EXISTS idx_tutor_assignments_tutor_status ON tutor_class_assignments(tutor_id, status) 
          WHERE status = 'active';
    END IF;
END $$;

-- ============================================
-- NOTIFICATION INDEXES
-- ============================================
-- Note: Notifications table may not exist yet - creating indexes only if table exists

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        CREATE INDEX IF NOT EXISTS idx_notifications_student_id ON notifications(student_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(student_id, read) WHERE read = false;
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
    END IF;
END $$;

-- ============================================
-- ATTENDANCE INDEXES
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN
        -- Student attendance
        CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date DESC);
        CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, attendance_date DESC);
    END IF;
END $$;

-- ============================================
-- PERFORMANCE NOTES
-- ============================================

-- These indexes are designed for:
-- 1. Fast login queries (username/email lookup)
-- 2. Fast dashboard queries (student enrollments, assignments)
-- 3. Fast tutor queries (assigned classes)
-- 4. Efficient pagination (order by indexes)
-- 5. Composite queries (multiple WHERE conditions)

-- Monitor index usage:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- ORDER BY idx_scan DESC;

-- If an index is not being used (idx_scan = 0), consider removing it
-- to reduce write overhead.
