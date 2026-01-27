import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../../core/cache/cache.service';
import { ResponseShapeService } from '../../shared/response/response-shape.service';
import { CursorPaginationService } from '../../shared/pagination/cursor-pagination.service';

/**
 * Student Assignments Service
 * 
 * Optimized for on-demand loading:
 * - Assignment lists show only metadata (title, due date, status)
 * - Full assignment content loaded only when opened
 * - Paginated using cursor-based pagination
 */
@Injectable()
export class StudentAssignmentsService {
  private readonly logger = new Logger(StudentAssignmentsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private cacheService: CacheService,
    private responseShape: ResponseShapeService,
    private pagination: CursorPaginationService,
  ) {}

  /**
   * Get assignments list (metadata only, no content)
   */
  async getAssignments(
    studentId: string,
    query: {
      limit?: string;
      cursor?: string;
      status?: string;
      upcoming?: string;
    },
  ): Promise<any> {
    const { limit, cursor } = this.pagination.getPaginationParams(query);
    const status = query.status || 'all';
    const upcomingOnly = query.upcoming === 'true';

    const cacheKey = `student:${studentId}:assignments:${status}:${upcomingOnly}:${limit}:${cursor?.id || 'first'}`;

    // Cache assignment lists for 2 minutes (more dynamic than lessons)
    const cached = await this.cacheService.get<any>(cacheKey, 'assignments');
    if (cached) {
      this.logger.debug(`Assignments cache hit for student ${studentId}`);
      return cached;
    }

    // Build query
    let queryBuilder = this.supabase
      .from('assignments')
      .select(`
        id,
        title,
        due_date,
        status,
        created_at,
        lesson_id,
        lesson:lessons(id, title, course_level_id)
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    // Filter by status
    if (status !== 'all') {
      queryBuilder = queryBuilder.eq('status', status);
    }

    // Filter upcoming assignments
    if (upcomingOnly) {
      queryBuilder = queryBuilder.gte('due_date', new Date().toISOString());
    }

    // Apply cursor
    if (cursor?.id) {
      const { data: cursorAssignment } = await this.supabase
        .from('assignments')
        .select('created_at')
        .eq('id', cursor.id)
        .single();

      if (cursorAssignment) {
        queryBuilder = queryBuilder.lt('created_at', cursorAssignment.created_at);
      }
    }

    // Fetch one extra to determine if there's more
    const { data: assignments, error } = await queryBuilder.limit(limit + 1);

    if (error) {
      this.logger.error(`Error fetching assignments: ${error.message}`);
      throw new NotFoundException('Assignments not found');
    }

    // Shape response (metadata only, no content)
    const shapedAssignments = (assignments || []).map((a: any) =>
      this.responseShape.shapeAssignmentList(a),
    );

    // Build paginated response
    const response = this.pagination.buildResponse(
      shapedAssignments,
      limit,
      cursor?.id,
    );

    // Cache for 2 minutes
    await this.cacheService.set(cacheKey, response, 120, 'assignments');

    return response;
  }

  /**
   * Get single assignment with full content (loaded on-demand)
   */
  async getAssignmentById(
    studentId: string,
    assignmentId: string,
  ): Promise<any> {
    const cacheKey = `student:${studentId}:assignment:${assignmentId}:full`;

    // Cache full assignment for 5 minutes
    const cached = await this.cacheService.get<any>(cacheKey, 'assignments');
    if (cached) {
      this.logger.debug(`Assignment cache hit for student ${studentId}, assignment ${assignmentId}`);
      return cached;
    }

    // Fetch assignment with full content
    const { data: assignment, error } = await this.supabase
      .from('assignments')
      .select(`
        *,
        lesson:lessons(
          id,
          title,
          course_level_id,
          course_level:course_levels(
            id,
            name,
            course:courses(id, name, code)
          )
        )
      `)
      .eq('id', assignmentId)
      .eq('student_id', studentId)
      .single();

    if (error || !assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Shape response with full content
    const response = this.responseShape.shapeAssignmentDetail(assignment);

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, response, 300, 'assignments');

    return response;
  }

  /**
   * Submit assignment (updates cache)
   */
  async submitAssignment(
    studentId: string,
    assignmentId: string,
    submissionData: any,
  ): Promise<any> {
    // Update assignment
    const { data: assignment, error } = await this.supabase
      .from('assignments')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submission_content: submissionData.content,
        ...submissionData,
      })
      .eq('id', assignmentId)
      .eq('student_id', studentId)
      .select()
      .single();

    if (error || !assignment) {
      throw new NotFoundException('Failed to submit assignment');
    }

    // Invalidate caches
    await this.cacheService.invalidateNamespace('assignments');
    await this.cacheService.delete(`student:${studentId}:dashboard`, 'student');

    return this.responseShape.shapeAssignmentDetail(assignment);
  }

  /**
   * Invalidate assignment cache
   */
  async invalidateCache(studentId: string): Promise<void> {
    await this.cacheService.invalidateNamespace('assignments');
  }
}

