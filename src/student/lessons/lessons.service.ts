import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../../core/cache/cache.service';
import { ResponseShapeService } from '../../shared/response/response-shape.service';
import { CursorPaginationService } from '../../shared/pagination/cursor-pagination.service';

/**
 * Student Lessons Service
 * 
 * Optimized for on-demand loading:
 * - Lesson lists are paginated (cursor-based)
 * - Lesson content is loaded only when opened
 * - Video URLs are provided but video is not preloaded
 * - Related assignments loaded separately
 */
@Injectable()
export class StudentLessonsService {
  private readonly logger = new Logger(StudentLessonsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private cacheService: CacheService,
    private responseShape: ResponseShapeService,
    private pagination: CursorPaginationService,
  ) {}

  /**
   * Get lessons for a course level (paginated list, no content)
   */
  async getLessonsByCourseLevel(
    studentId: string,
    courseLevelId: string,
    query: { limit?: string; cursor?: string },
  ): Promise<any> {
    const { limit, cursor } = this.pagination.getPaginationParams(query);
    const cacheKey = `student:${studentId}:lessons:${courseLevelId}:${limit}:${cursor?.id || 'first'}`;

    // Cache lesson lists for 5 minutes
    const cached = await this.cacheService.get<any>(cacheKey, 'lessons');
    if (cached) {
      this.logger.debug(`Lessons cache hit for student ${studentId}, courseLevel ${courseLevelId}`);
      return cached;
    }

    // Get student's progress for this course level
    const { data: progress } = await this.supabase
      .from('student_lesson_progress')
      .select('lesson_id, completed')
      .eq('student_id', studentId);

    const completedLessons = new Set(
      (progress || [])
        .filter((p: any) => p.completed)
        .map((p: any) => p.lesson_id),
    );

    // Build query with cursor
    let queryBuilder = this.supabase
      .from('lessons')
      .select('id, title, order_index, video_url, created_at')
      .eq('course_level_id', courseLevelId)
      .order('order_index', { ascending: true });

    if (cursor?.id) {
      // Get cursor lesson to determine offset
      const { data: cursorLesson } = await this.supabase
        .from('lessons')
        .select('order_index')
        .eq('id', cursor.id)
        .single();

      if (cursorLesson) {
        queryBuilder = queryBuilder.gt('order_index', cursorLesson.order_index);
      }
    }

    // Fetch one extra to determine if there's more
    const { data: lessons, error } = await queryBuilder.limit(limit + 1);

    if (error) {
      this.logger.error(`Error fetching lessons: ${error.message}`);
      throw new NotFoundException('Lessons not found');
    }

    // Add completion status
    const lessonsWithProgress = (lessons || []).map((lesson: any) => ({
      ...lesson,
      completed: completedLessons.has(lesson.id),
      // DO NOT include content here - loaded on-demand
    }));

    // Shape response
    const shapedLessons = lessonsWithProgress.map((l: any) =>
      this.responseShape.shapeLessonList(l),
    );

    // Build paginated response
    const response = this.pagination.buildResponse(
      shapedLessons,
      limit,
      cursor?.id,
    );

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, response, 300, 'lessons');

    return response;
  }

  /**
   * Get single lesson with full content (loaded on-demand when clicked)
   */
  async getLessonById(studentId: string, lessonId: string): Promise<any> {
    const cacheKey = `student:${studentId}:lesson:${lessonId}:full`;

    // Cache full lesson for 15 minutes (content doesn't change frequently)
    const cached = await this.cacheService.get<any>(cacheKey, 'lessons');
    if (cached) {
      this.logger.debug(`Lesson cache hit for student ${studentId}, lesson ${lessonId}`);
      return cached;
    }

    // Fetch lesson with content
    const { data: lesson, error } = await this.supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .single();

    if (error || !lesson) {
      throw new NotFoundException('Lesson not found');
    }

    // Get student progress for this lesson
    const { data: progress } = await this.supabase
      .from('student_lesson_progress')
      .select('completed, last_accessed_at')
      .eq('student_id', studentId)
      .eq('lesson_id', lessonId)
      .maybeSingle();

    // Get related assignments (lightweight, no full content)
    const { data: assignments } = await this.supabase
      .from('assignments')
      .select('id, title, due_date, status')
      .eq('lesson_id', lessonId)
      .eq('student_id', studentId);

    // Shape response with full content
    const response = this.responseShape.shapeLessonDetail({
      ...lesson,
      completed: progress?.completed || false,
      last_accessed_at: progress?.last_accessed_at,
      assignments: assignments || [],
    });

    // Cache for 15 minutes
    await this.cacheService.set(cacheKey, response, 900, 'lessons');

    return response;
  }

  /**
   * Mark lesson as accessed (for analytics, non-blocking)
   */
  async markLessonAccessed(studentId: string, lessonId: string): Promise<void> {
    // This is done asynchronously to not block the lesson load
    this.supabase
      .from('student_lesson_progress')
      .upsert({
        student_id: studentId,
        lesson_id: lessonId,
        last_accessed_at: new Date().toISOString(),
        completed: false,
      })
      .catch((err) => {
        this.logger.warn(`Failed to mark lesson accessed: ${err.message}`);
      });

    // Invalidate cache
    await this.cacheService.delete(`student:${studentId}:lesson:${lessonId}:full`, 'lessons');
  }

  /**
   * Invalidate lesson cache
   */
  async invalidateCache(studentId: string, courseLevelId?: string): Promise<void> {
    if (courseLevelId) {
      // Invalidate specific course level cache
      await this.cacheService.invalidateNamespace('lessons');
    } else {
      // Invalidate all lesson cache for student
      const keys = [
        `student:${studentId}:lesson:*:full`,
        `student:${studentId}:lessons:*`,
      ];
      // Note: In a production Redis setup, we'd use pattern matching
      // For now, namespace invalidation works
      await this.cacheService.invalidateNamespace('lessons');
    }
  }
}
