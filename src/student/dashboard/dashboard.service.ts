import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../../core/cache/cache.service';
import { ResponseShapeService } from '../../shared/response/response-shape.service';

/**
 * Student Dashboard Service
 * 
 * Optimized for:
 * - Minimal payload (< 10KB)
 * - Fast response (< 500ms)
 * - Only enrolled courses
 * - No assignments until requested
 */
@Injectable()
export class StudentDashboardService {
  private readonly logger = new Logger(StudentDashboardService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private cacheService: CacheService,
    private responseShapeService: ResponseShapeService,
  ) {}

  /**
   * Get lightweight dashboard data
   * Only loads essential information
   */
  async getDashboard(studentId: string): Promise<any> {
    const cacheKey = `student:${studentId}:dashboard`;
    
    // Try cache first (5 minute TTL)
    const cached = await this.cacheService.get<any>(cacheKey, 'student');
    if (cached) {
      this.logger.debug(`Dashboard cache hit for student ${studentId}`);
      return cached;
    }

    // Fetch user info (cached separately)
    const user = await this.getUserInfo(studentId);

    // Fetch only enrolled courses (minimal fields)
    const courses = await this.getEnrolledCourses(studentId);

    // Get counts only (not full data)
    const assignmentsCount = await this.getUpcomingAssignmentsCount(studentId);
    const notificationsCount = await this.getNotificationsCount(studentId);

    const dashboard = {
      user,
      enrolled_courses: courses,
      upcoming_assignments_count: assignmentsCount,
      notifications_count: notificationsCount,
    };

    // Shape response for minimal payload
    const shaped = this.responseShapeService.shapeDashboard(dashboard);

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, shaped, 300, 'student');

    return shaped;
  }

  /**
   * Get user info (cached)
   */
  private async getUserInfo(studentId: string): Promise<any> {
    const cacheKey = `student:${studentId}:info`;
    
    const cached = await this.cacheService.get<any>(cacheKey, 'student');
    if (cached) {
      return cached;
    }

    const { data: student, error } = await this.supabase
      .from('students')
      .select('id, username, first_name, last_name, class_id, school_id')
      .eq('id', studentId)
      .single();

    if (error || !student) {
      throw new Error('Student not found');
    }

    const user = this.responseShapeService.shapeUser({
      ...student,
      role: 'student',
    });

    // Cache for 15 minutes
    await this.cacheService.set(cacheKey, user, 900, 'student');

    return user;
  }

  /**
   * Get enrolled courses only (minimal fields)
   */
  private async getEnrolledCourses(studentId: string): Promise<any[]> {
    const { data: enrollments, error } = await this.supabase
      .from('enrollments')
      .select(`
        id,
        progress_percentage,
        course_level:course_levels(
          id,
          name,
          level_number,
          course:courses(id, name, code)
        )
      `)
      .eq('student_id', studentId)
      .order('enrollment_date', { ascending: false })
      .limit(20); // Limit to 20 courses

    if (error || !enrollments) {
      return [];
    }

    // Get next lesson for each course
    const courses = await Promise.all(
      enrollments.map(async (enrollment: any) => {
        const courseLevel = Array.isArray(enrollment.course_level)
          ? enrollment.course_level[0]
          : enrollment.course_level;
        const course = Array.isArray(courseLevel?.course)
          ? courseLevel.course[0]
          : courseLevel?.course;

        // Get next lesson (lightweight query)
        const nextLesson = await this.getNextLesson(
          studentId,
          courseLevel?.id,
        );

        return {
          id: course?.id,
          name: course?.name,
          code: course?.code,
          progress: enrollment.progress_percentage || 0,
          next_lesson_id: nextLesson?.id,
          next_lesson_title: nextLesson?.title,
        };
      }),
    );

    return courses.map((c) => this.responseShapeService.shapeCourseList(c));
  }

  /**
   * Get next lesson for a course level (lightweight)
   */
  private async getNextLesson(
    studentId: string,
    courseLevelId: string,
  ): Promise<{ id: string; title: string } | null> {
    if (!courseLevelId) return null;

    // Get completed lesson IDs
    const { data: completed } = await this.supabase
      .from('student_lesson_progress')
      .select('lesson_id')
      .eq('student_id', studentId)
      .eq('completed', true);

    const completedIds = (completed || []).map((c: any) => c.lesson_id);

    // Get next incomplete lesson
    const { data: nextLesson } = await this.supabase
      .from('lessons')
      .select('id, title')
      .eq('course_level_id', courseLevelId)
      .not('id', 'in', `(${completedIds.join(',')})`)
      .order('order_index', { ascending: true })
      .limit(1)
      .single();

    return nextLesson || null;
  }

  /**
   * Get upcoming assignments count only
   */
  private async getUpcomingAssignmentsCount(studentId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('status', 'pending')
      .gte('due_date', new Date().toISOString());

    return error ? 0 : (count || 0);
  }

  /**
   * Get notifications count only
   */
  private async getNotificationsCount(studentId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('read', false);

    return error ? 0 : (count || 0);
  }

  /**
   * Invalidate dashboard cache
   */
  async invalidateCache(studentId: string): Promise<void> {
    await this.cacheService.delete(`student:${studentId}:dashboard`, 'student');
    await this.cacheService.delete(`student:${studentId}:info`, 'student');
  }
}
