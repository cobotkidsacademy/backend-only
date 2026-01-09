import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../../core/cache/cache.service';
import { ResponseShapeService } from '../../shared/response/response-shape.service';

/**
 * Admin Dashboard Service
 * 
 * Optimized for:
 * - Minimal payload (< 5KB)
 * - Fast response (< 500ms)
 * - Aggregated counts only
 * - No detailed data until section opened
 */
@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private cacheService: CacheService,
    private responseShapeService: ResponseShapeService,
  ) {}

  /**
   * Get lightweight dashboard data
   * Only loads aggregated statistics
   */
  async getDashboard(adminId: string): Promise<any> {
    const cacheKey = `admin:${adminId}:dashboard`;
    
    // Try cache first (5 minute TTL)
    const cached = await this.cacheService.get<any>(cacheKey, 'admin');
    if (cached) {
      this.logger.debug(`Dashboard cache hit for admin ${adminId}`);
      return cached;
    }

    // Fetch user info (cached separately)
    const user = await this.getUserInfo(adminId);

    // Fetch aggregated statistics only (no detailed data)
    const stats = await this.getAggregatedStats();

    const dashboard = {
      user,
      stats,
    };

    // Shape response for minimal payload
    const shaped = {
      user: this.responseShapeService.shapeUser(user),
      stats,
    };

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, shaped, 300, 'admin');

    return shaped;
  }

  /**
   * Get user info (cached)
   */
  private async getUserInfo(adminId: string): Promise<any> {
    const cacheKey = `admin:${adminId}:info`;
    
    const cached = await this.cacheService.get<any>(cacheKey, 'admin');
    if (cached) {
      return cached;
    }

    const { data: admin, error } = await this.supabase
      .from('admins')
      .select('id, email, role')
      .eq('id', adminId)
      .single();

    if (error || !admin) {
      throw new Error('Admin not found');
    }

    const user = this.responseShapeService.shapeUser({
      ...admin,
      role: admin.role || 'admin',
    });

    // Cache for 15 minutes
    await this.cacheService.set(cacheKey, user, 900, 'admin');

    return user;
  }

  /**
   * Get aggregated statistics only
   * Uses count queries (fast, no data transfer)
   */
  private async getAggregatedStats(): Promise<any> {
    // Use count queries for fast aggregation
    const [schoolsCount, studentsCount, tutorsCount, coursesCount] = await Promise.all([
      this.supabase
        .from('schools')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      this.supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      this.supabase
        .from('tutors')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      this.supabase
        .from('courses')
        .select('id', { count: 'exact', head: true }),
    ]);

    return {
      total_schools: schoolsCount.count || 0,
      total_students: studentsCount.count || 0,
      total_tutors: tutorsCount.count || 0,
      total_courses: coursesCount.count || 0,
    };
  }

  /**
   * Invalidate dashboard cache
   */
  async invalidateCache(adminId: string): Promise<void> {
    await this.cacheService.delete(`admin:${adminId}:dashboard`, 'admin');
    await this.cacheService.delete(`admin:${adminId}:info`, 'admin');
  }
}
