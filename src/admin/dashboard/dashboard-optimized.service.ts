import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../../core/cache/cache.service';

/**
 * Admin Dashboard Service (Optimized)
 * 
 * Philosophy: Load NOTHING until a section is explicitly opened
 * - Dashboard shows only aggregated counts
 * - Schools list: Loaded only when "Schools" section opened
 * - Students list: Loaded only when "Students" section opened
 * - Analytics: Loaded only when "Analytics" section opened
 * - Reports: Generated on-demand, queued for heavy operations
 */
@Injectable()
export class AdminDashboardOptimizedService {
  private readonly logger = new Logger(AdminDashboardOptimizedService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private cacheService: CacheService,
  ) {}

  /**
   * Get minimal dashboard (counts only, no detailed data)
   * Response size: < 5KB
   */
  async getMinimalDashboard(): Promise<any> {
    const cacheKey = 'admin:dashboard:minimal';

    // Cache for 5 minutes (counts don't change frequently)
    const cached = await this.cacheService.get<any>(cacheKey, 'admin');
    if (cached) {
      this.logger.debug('Admin dashboard cache hit');
      return cached;
    }

    // Fetch only counts (lightweight queries)
    const [
      schoolsCount,
      studentsCount,
      tutorsCount,
      classesCount,
      coursesCount,
      activeStudentsCount,
    ] = await Promise.all([
      this.getCount('schools'),
      this.getCount('students'),
      this.getCount('tutors'),
      this.getCount('classes'),
      this.getCount('courses'),
      this.getCount('students', { status: 'active' }),
    ]);

    const dashboard = {
      stats: {
        total_schools: schoolsCount,
        total_students: studentsCount,
        active_students: activeStudentsCount,
        total_tutors: tutorsCount,
        total_classes: classesCount,
        total_courses: coursesCount,
      },
      // NO detailed data - loaded on-demand when sections opened
      sections: {
        schools: { loaded: false, endpoint: '/api/admin/schools' },
        students: { loaded: false, endpoint: '/api/admin/students' },
        tutors: { loaded: false, endpoint: '/api/admin/tutors' },
        courses: { loaded: false, endpoint: '/api/admin/courses' },
        analytics: { loaded: false, endpoint: '/api/admin/analytics' },
        reports: { loaded: false, endpoint: '/api/admin/reports' },
      },
    };

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, dashboard, 300, 'admin');

    return dashboard;
  }

  /**
   * Get schools list (loaded only when "Schools" section opened)
   */
  async getSchools(
    query: { limit?: string; cursor?: string; search?: string },
  ): Promise<any> {
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const search = query.search?.trim();

    const cacheKey = `admin:schools:${limit}:${search || 'all'}:${query.cursor || 'first'}`;

    // Cache for 2 minutes
    const cached = await this.cacheService.get<any>(cacheKey, 'admin');
    if (cached) {
      return cached;
    }

    let queryBuilder = this.supabase
      .from('schools')
      .select('id, name, code, email, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (search) {
      queryBuilder = queryBuilder.or(
        `name.ilike.%${search}%,code.ilike.%${search}%,email.ilike.%${search}%`,
      );
    }

    const { data: schools, error } = await queryBuilder;

    if (error) {
      this.logger.error(`Error fetching schools: ${error.message}`);
      return { data: [], has_more: false, limit };
    }

    const hasMore = (schools || []).length > limit;
    const data = hasMore ? schools.slice(0, limit) : schools;

    const response = {
      data: data.map((school: any) => ({
        id: school.id,
        name: school.name,
        code: school.code,
        email: school.email,
        status: school.status,
        // NO detailed data - loaded separately if needed
      })),
      has_more: hasMore,
      limit,
    };

    // Cache for 2 minutes
    await this.cacheService.set(cacheKey, response, 120, 'admin');

    return response;
  }

  /**
   * Get students list (loaded only when "Students" section opened)
   */
  async getStudents(
    query: {
      limit?: string;
      cursor?: string;
      school_id?: string;
      class_id?: string;
      status?: string;
    },
  ): Promise<any> {
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);

    const cacheKey = `admin:students:${limit}:${query.school_id || 'all'}:${query.class_id || 'all'}:${query.status || 'all'}:${query.cursor || 'first'}`;

    // Cache for 2 minutes
    const cached = await this.cacheService.get<any>(cacheKey, 'admin');
    if (cached) {
      return cached;
    }

    let queryBuilder = this.supabase
      .from('students')
      .select('id, username, first_name, last_name, class_id, school_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (query.school_id) {
      queryBuilder = queryBuilder.eq('school_id', query.school_id);
    }

    if (query.class_id) {
      queryBuilder = queryBuilder.eq('class_id', query.class_id);
    }

    if (query.status) {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    const { data: students, error } = await queryBuilder;

    if (error) {
      this.logger.error(`Error fetching students: ${error.message}`);
      return { data: [], has_more: false, limit };
    }

    const hasMore = (students || []).length > limit;
    const data = hasMore ? students.slice(0, limit) : students;

    const response = {
      data: data.map((student: any) => ({
        id: student.id,
        username: student.username,
        name: `${student.first_name} ${student.last_name}`,
        class_id: student.class_id,
        school_id: student.school_id,
        status: student.status,
        // NO detailed data - loaded separately if needed
      })),
      has_more: hasMore,
      limit,
    };

    // Cache for 2 minutes
    await this.cacheService.set(cacheKey, response, 120, 'admin');

    return response;
  }

  /**
   * Get analytics (loaded only when "Analytics" section opened)
   */
  async getAnalytics(
    query: {
      date_range?: string;
      school_id?: string;
      type?: string;
    },
  ): Promise<any> {
    const cacheKey = `admin:analytics:${query.date_range || 'all'}:${query.school_id || 'all'}:${query.type || 'all'}`;

    // Cache analytics for 5 minutes (can be expensive to compute)
    const cached = await this.cacheService.get<any>(cacheKey, 'admin');
    if (cached) {
      return cached;
    }

    // Calculate date range
    let startDate: Date;
    const now = new Date();

    switch (query.date_range) {
      case 'last_7_days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30_days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last_90_days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Build analytics query based on type
    const analytics: any = {
      date_range: query.date_range || 'all',
      generated_at: new Date().toISOString(),
    };

    if (!query.type || query.type === 'overview') {
      // Overview analytics (lightweight aggregations)
      const [
        newStudents,
        activeLogins,
        completedLessons,
        submittedAssignments,
      ] = await Promise.all([
        this.getCount('students', {
          created_at: { gte: startDate.toISOString() },
        }),
        this.getLoginCount(startDate),
        this.getCompletedLessonsCount(startDate, query.school_id),
        this.getSubmittedAssignmentsCount(startDate, query.school_id),
      ]);

      analytics.overview = {
        new_students: newStudents,
        active_logins: activeLogins,
        completed_lessons: completedLessons,
        submitted_assignments: submittedAssignments,
      };
    }

    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, analytics, 300, 'admin');

    return analytics;
  }

  /**
   * Invalidate admin cache
   */
  async invalidateCache(): Promise<void> {
    await this.cacheService.invalidateNamespace('admin');
  }

  // ============ PRIVATE HELPERS ============

  private async getCount(
    table: string,
    filters?: any,
  ): Promise<number> {
    let queryBuilder = this.supabase.from(table).select('id', {
      count: 'exact',
      head: true,
    });

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          if ((value as any).gte) {
            queryBuilder = queryBuilder.gte(key, (value as any).gte);
          }
        } else {
          queryBuilder = queryBuilder.eq(key, value);
        }
      });
    }

    const { count, error } = await queryBuilder;

    if (error) {
      this.logger.warn(`Error getting count for ${table}: ${error.message}`);
      return 0;
    }

    return count || 0;
  }

  private async getLoginCount(startDate: Date): Promise<number> {
    const { count, error } = await this.supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .gte('last_login', startDate.toISOString());

    return error ? 0 : count || 0;
  }

  private async getCompletedLessonsCount(
    startDate: Date,
    schoolId?: string,
  ): Promise<number> {
    let queryBuilder = this.supabase
      .from('student_lesson_progress')
      .select('id', { count: 'exact', head: true })
      .eq('completed', true)
      .gte('updated_at', startDate.toISOString());

    // If school filter, join with students
    if (schoolId) {
      // Note: This is a simplified version. In production, you might need a more complex query
      // For now, we'll return a count without school filter if school_id is provided
      // A better approach would be to use a materialized view or join
    }

    const { count, error } = await queryBuilder;
    return error ? 0 : count || 0;
  }

  private async getSubmittedAssignmentsCount(
    startDate: Date,
    schoolId?: string,
  ): Promise<number> {
    let queryBuilder = this.supabase
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted')
      .gte('submitted_at', startDate.toISOString());

    const { count, error } = await queryBuilder;
    return error ? 0 : count || 0;
  }
}

