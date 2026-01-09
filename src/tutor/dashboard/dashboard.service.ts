import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../../core/cache/cache.service';
import { ResponseShapeService } from '../../shared/response/response-shape.service';

/**
 * Tutor Dashboard Service
 * 
 * Optimized for:
 * - Minimal payload (< 10KB)
 * - Fast response (< 500ms)
 * - Only assigned classes
 * - No student details until class opened
 */
@Injectable()
export class TutorDashboardService {
  private readonly logger = new Logger(TutorDashboardService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private cacheService: CacheService,
    private responseShapeService: ResponseShapeService,
  ) {}

  /**
   * Get lightweight dashboard data
   * Only loads assigned classes
   */
  async getDashboard(tutorId: string): Promise<any> {
    const cacheKey = `tutor:${tutorId}:dashboard`;
    
    // Try cache first (5 minute TTL)
    const cached = await this.cacheService.get<any>(cacheKey, 'tutor');
    if (cached) {
      this.logger.debug(`Dashboard cache hit for tutor ${tutorId}`);
      return cached;
    }

    // Fetch user info (cached separately)
    const user = await this.getUserInfo(tutorId);

    // Fetch only assigned classes (minimal fields)
    const classes = await this.getAssignedClasses(tutorId);

    const dashboard = {
      user,
      assigned_classes: classes,
    };

    // Shape response for minimal payload
    const shaped = {
      user: this.responseShapeService.shapeUser(user),
      assigned_classes: classes.map((cls: any) => ({
        id: cls.id,
        name: cls.name,
        level: cls.level,
        student_count: cls.student_count,
      })),
    };

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, shaped, 300, 'tutor');

    return shaped;
  }

  /**
   * Get user info (cached)
   */
  private async getUserInfo(tutorId: string): Promise<any> {
    const cacheKey = `tutor:${tutorId}:info`;
    
    const cached = await this.cacheService.get<any>(cacheKey, 'tutor');
    if (cached) {
      return cached;
    }

    const { data: tutor, error } = await this.supabase
      .from('tutors')
      .select('id, email, first_name, middle_name, last_name, level')
      .eq('id', tutorId)
      .single();

    if (error || !tutor) {
      throw new Error('Tutor not found');
    }

    const user = this.responseShapeService.shapeUser({
      ...tutor,
      role: 'tutor',
    });

    // Cache for 15 minutes
    await this.cacheService.set(cacheKey, user, 900, 'tutor');

    return user;
  }

  /**
   * Get assigned classes only (minimal fields)
   */
  private async getAssignedClasses(tutorId: string): Promise<any[]> {
    const { data: assignments, error } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        id,
        role,
        class:classes(
          id,
          name,
          level,
          description
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (error || !assignments) {
      return [];
    }

    // Get student counts for each class (lightweight query)
    const classes = await Promise.all(
      assignments.map(async (assignment: any) => {
        const classData = Array.isArray(assignment.class)
          ? assignment.class[0]
          : assignment.class;

        if (!classData) return null;

        // Get student count (lightweight)
        const { count } = await this.supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', classData.id)
          .eq('status', 'active');

        return {
          id: classData.id,
          name: classData.name,
          level: classData.level,
          description: classData.description,
          student_count: count || 0,
          role: assignment.role,
        };
      }),
    );

    return classes.filter(Boolean);
  }

  /**
   * Invalidate dashboard cache
   */
  async invalidateCache(tutorId: string): Promise<void> {
    await this.cacheService.delete(`tutor:${tutorId}:dashboard`, 'tutor');
    await this.cacheService.delete(`tutor:${tutorId}:info`, 'tutor');
  }
}
