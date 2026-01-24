import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export type EnrollmentStatus = 'not_enrolled' | 'enrolled' | 'completed';

export interface StudentEnrollment {
  id: string;
  student_id: string;
  course_id: string;
  enrollment_status: EnrollmentStatus;
  enrolled_at?: string;
  completed_at?: string;
  progress_percentage: number;
  course?: {
    id: string;
    name: string;
    code: string;
    icon_image_url?: string;
    description?: string;
  };
}

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(@Inject('SUPABASE_CLIENT') private supabase: SupabaseClient) {}

  async getStudentEnrollments(studentId: string): Promise<StudentEnrollment[]> {
    const { data, error } = await this.supabase
      .from('student_course_enrollments')
      .select(`
        id,
        student_id,
        course_id,
        enrollment_status,
        enrolled_at,
        completed_at,
        progress_percentage,
        course:courses!student_course_enrollments_course_id_fkey(id, name, code, icon_image_url, description)
      `)
      .eq('student_id', studentId);

    if (error) {
      this.logger.error('Error fetching enrollments:', error);
      throw new NotFoundException('Failed to fetch enrollments');
    }

    // Transform the data to match the interface
    // Supabase returns course as an array, but we need it as a single object
    return (data || []).map((item: any) => ({
      id: item.id,
      student_id: item.student_id,
      course_id: item.course_id,
      enrollment_status: item.enrollment_status,
      enrolled_at: item.enrolled_at,
      completed_at: item.completed_at,
      progress_percentage: item.progress_percentage,
      course: Array.isArray(item.course) ? item.course[0] : item.course,
    }));
  }

  async getAllCoursesWithEnrollmentStatus(studentId: string) {
    this.logger.debug(`Fetching courses with enrollment status for student: ${studentId}`);
    
    // Get all courses
    const { data: courses, error: coursesError } = await this.supabase
      .from('courses')
      .select('id, name, code, icon_image_url, description, status')
      .eq('status', 'active');

    if (coursesError) {
      this.logger.error('Error fetching courses:', coursesError);
      throw new NotFoundException('Failed to fetch courses');
    }

    this.logger.debug(`Found ${courses?.length || 0} active courses`);

    // Get student enrollments
    const { data: enrollments, error: enrollmentsError } = await this.supabase
      .from('student_course_enrollments')
      .select('course_id, enrollment_status, progress_percentage')
      .eq('student_id', studentId);

    if (enrollmentsError) {
      this.logger.error('Error fetching enrollments:', enrollmentsError);
      throw new NotFoundException('Failed to fetch enrollments');
    }

    this.logger.debug(`Found ${enrollments?.length || 0} enrollments for student ${studentId}`);
    if (enrollments && enrollments.length > 0) {
      this.logger.debug('Enrollment details:', JSON.stringify(enrollments, null, 2));
    }

    // Create a map of course_id -> enrollment
    const enrollmentMap = new Map(
      (enrollments || []).map((e) => [e.course_id, e])
    );

    // Merge courses with enrollment status
    const result = (courses || []).map((course) => {
      const enrollment = enrollmentMap.get(course.id);
      const status = enrollment?.enrollment_status || 'not_enrolled';
      return {
        ...course,
        enrollment_status: status,
        progress_percentage: enrollment?.progress_percentage || 0,
      };
    });

    const enrolledCount = result.filter(c => c.enrollment_status === 'enrolled').length;
    const completedCount = result.filter(c => c.enrollment_status === 'completed').length;
    const notEnrolledCount = result.filter(c => c.enrollment_status === 'not_enrolled').length;
    
    this.logger.debug(`Result: ${enrolledCount} enrolled, ${completedCount} completed, ${notEnrolledCount} not enrolled, ${result.length} total courses`);
    
    // Log details of enrolled courses for debugging
    if (enrolledCount > 0) {
      const enrolledCourses = result.filter(c => c.enrollment_status === 'enrolled');
      this.logger.debug('Enrolled courses:', JSON.stringify(enrolledCourses.map(c => ({ id: c.id, name: c.name, status: c.enrollment_status })), null, 2));
    }

    return result;
  }

  async updateEnrollmentStatus(
    studentId: string,
    courseId: string,
    status: EnrollmentStatus,
    progressPercentage?: number,
  ) {
    // Check if enrollment exists
    const { data: existing, error: checkError } = await this.supabase
      .from('student_course_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .single();

    const updateData: any = {
      enrollment_status: status,
      updated_at: new Date().toISOString(),
    };

    if (progressPercentage !== undefined) {
      updateData.progress_percentage = progressPercentage;
    }

    if (checkError && checkError.code === 'PGRST116') {
      // Enrollment doesn't exist, create it
      const { data, error } = await this.supabase
        .from('student_course_enrollments')
        .insert({
          student_id: studentId,
          course_id: courseId,
          ...updateData,
        })
        .select()
        .single();

      if (error) {
        this.logger.error('Error creating enrollment:', error);
        throw new NotFoundException('Failed to create enrollment');
      }

      return data;
    } else {
      // Update existing enrollment
      const { data, error } = await this.supabase
        .from('student_course_enrollments')
        .update(updateData)
        .eq('student_id', studentId)
        .eq('course_id', courseId)
        .select()
        .single();

      if (error) {
        this.logger.error('Error updating enrollment:', error);
        throw new NotFoundException('Failed to update enrollment');
      }

      return data;
    }
  }

  async getEnrollmentStats(studentId: string) {
    const { data, error } = await this.supabase
      .from('student_course_enrollments')
      .select('enrollment_status')
      .eq('student_id', studentId);

    if (error) {
      this.logger.error('Error fetching enrollment stats:', error);
      return {
        total: 0,
        enrolled: 0,
        completed: 0,
        not_enrolled: 0,
      };
    }

    const stats = {
      total: data?.length || 0,
      enrolled: data?.filter((e) => e.enrollment_status === 'enrolled').length || 0,
      completed: data?.filter((e) => e.enrollment_status === 'completed').length || 0,
      not_enrolled: 0,
    };

    // Get total courses count
    const { count } = await this.supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    stats.not_enrolled = (count || 0) - stats.total;

    return stats;
  }
}

