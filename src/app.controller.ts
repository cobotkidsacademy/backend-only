import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private configService: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('debug-env')
  debugEnv() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    return {
      supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET',
      supabaseKeySet: !!this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
      jwtSecretSet: !!jwtSecret,
      jwtSecretLength: jwtSecret?.length || 0,
      frontendUrl: this.configService.get<string>('FRONTEND_URL') || 'NOT SET',
      port: this.configService.get<string>('PORT') || '3001',
    };
  }

  @Get('test-db')
  async testDatabase() {
    try {
      // Get admins with password hash info (for debugging only)
      const { data, error, count } = await this.supabase
        .from('admins')
        .select('id, email, role, password_hash', { count: 'exact' })
        .limit(5);

      const adminsInfo = data?.map(admin => ({
        id: admin.id,
        email: admin.email,
        role: admin.role,
        passwordHashPrefix: admin.password_hash?.substring(0, 7) || 'NO HASH',
        passwordHashLength: admin.password_hash?.length || 0,
        isValidBcryptFormat: admin.password_hash?.startsWith('$2') || false,
      })) || [];

      return {
        success: !error,
        error: error?.message || null,
        adminCount: count || (data?.length || 0),
        admins: adminsInfo,
        message: error
          ? 'Database connection failed. Check your Supabase credentials and RLS policies.'
          : 'Database connection successful.',
        troubleshooting: {
          checkPasswordHash: 'Password hash should start with $2a$, $2b$, or $2y$ and be ~60 chars',
          checkRole: 'Role must be "admin" for login to work',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Database connection error.',
      };
    }
  }

  @Get('dashboard/stats')
  async getDashboardStats() {
    try {
      // Get total students count
      const { count: totalStudents } = await this.supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get active tutors count
      const { count: activeTutors } = await this.supabase
        .from('tutors')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get total courses count
      const { count: totalCourses } = await this.supabase
        .from('courses')
        .select('id', { count: 'exact', head: true });

      // Get active schools count
      const { count: activeSchools } = await this.supabase
        .from('schools')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get total classes count
      const { count: totalClasses } = await this.supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get students created in last 30 days for growth calculation
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: studentsLastMonth } = await this.supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Get tutors created in last 30 days
      const { count: tutorsLastMonth } = await this.supabase
        .from('tutors')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Get courses created in last 30 days
      const { count: coursesLastMonth } = await this.supabase
        .from('courses')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Calculate percentage changes (comparing last 30 days growth)
      const calculateChange = (current: number, lastMonth: number) => {
        if (current === 0) return "0.0";
        const previous = current - lastMonth;
        if (previous === 0) return lastMonth > 0 ? "100.0" : "0.0";
        const change = ((lastMonth / previous) * 100);
        return change.toFixed(1);
      };

      return {
        students: {
          total: totalStudents || 0,
          change: calculateChange(totalStudents || 0, studentsLastMonth || 0),
          changeType: (studentsLastMonth || 0) > 0 ? 'positive' : 'neutral',
        },
        tutors: {
          total: activeTutors || 0,
          change: calculateChange(activeTutors || 0, tutorsLastMonth || 0),
          changeType: (tutorsLastMonth || 0) > 0 ? 'positive' : 'neutral',
        },
        courses: {
          total: totalCourses || 0,
          change: calculateChange(totalCourses || 0, coursesLastMonth || 0),
          changeType: (coursesLastMonth || 0) > 0 ? 'positive' : 'neutral',
        },
        schools: {
          total: activeSchools || 0,
          change: '0.0',
          changeType: 'neutral' as const,
        },
        classes: {
          total: totalClasses || 0,
        },
      };
    } catch (error) {
      return {
        error: error.message,
        students: { total: 0, change: '0.0', changeType: 'neutral' },
        tutors: { total: 0, change: '0.0', changeType: 'neutral' },
        courses: { total: 0, change: '0.0', changeType: 'neutral' },
        schools: { total: 0, change: '0.0', changeType: 'neutral' },
        classes: { total: 0 },
      };
    }
  }
}



