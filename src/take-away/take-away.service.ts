import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getNairobiTime, getNairobiDayOfWeek } from '../utils/timezone.util';
import { CreateTakeAwayDto, UpdateTakeAwayDto, TakeAwayAssignment } from './dto/take-away.dto';

@Injectable()
export class TakeAwayService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async create(dto: CreateTakeAwayDto): Promise<TakeAwayAssignment> {
    // Verify class exists
    const { data: classData, error: classError } = await this.supabase
      .from('classes')
      .select('id')
      .eq('id', dto.class_id)
      .single();

    if (classError || !classData) {
      throw new NotFoundException('Class not found');
    }

    // Verify tutor exists and is assigned to the class
    const { data: tutorAssignment, error: tutorError } = await this.supabase
      .from('tutor_class_assignments')
      .select('id, tutor_id')
      .eq('class_id', dto.class_id)
      .eq('tutor_id', dto.tutor_id)
      .eq('status', 'active')
      .single();

    if (tutorError || !tutorAssignment) {
      throw new NotFoundException('Tutor not found or not assigned to this class');
    }

    // Verify course level exists and is assigned to the class
    const { data: courseLevelAssignment, error: courseLevelError } = await this.supabase
      .from('class_course_level_assignments')
      .select('id, course_level_id, enrollment_status')
      .eq('class_id', dto.class_id)
      .eq('course_level_id', dto.course_level_id)
      .single();

    if (courseLevelError || !courseLevelAssignment) {
      throw new NotFoundException('Course level not found or not assigned to this class');
    }

    // Verify enrollment status matches
    if (courseLevelAssignment.enrollment_status !== dto.enrollment_status) {
      throw new BadRequestException(
        `Enrollment status mismatch. Course level is ${courseLevelAssignment.enrollment_status}, but provided ${dto.enrollment_status}`
      );
    }

    // Verify take-away quiz exists if provided
    if (dto.take_away_quiz_id) {
      const { data: quizData, error: quizError } = await this.supabase
        .from('take_away_quizzes')
        .select('id')
        .eq('id', dto.take_away_quiz_id)
        .single();

      if (quizError || !quizData) {
        throw new NotFoundException('Take-away quiz not found');
      }
    }

    // Create take-away assignment
    const { data: insertData, error: insertError } = await this.supabase
      .from('take_away_assignments')
      .insert({
        class_id: dto.class_id,
        tutor_id: dto.tutor_id,
        course_level_id: dto.course_level_id,
        take_away_quiz_id: dto.take_away_quiz_id || null,
        enrollment_status: dto.enrollment_status,
        due_date: dto.due_date || null,
      })
      .select('id, class_id, tutor_id, course_level_id, take_away_quiz_id, enrollment_status, due_date, assigned_at, created_at, updated_at')
      .single();

    if (insertError) {
      const errorMessage = insertError.message || '';
      if (errorMessage.includes('Could not find the table') || 
          errorMessage.includes('does not exist') ||
          insertError.code === '42P01') {
        throw new BadRequestException('Take-away assignments table does not exist. Please run the database migration first.');
      }
      if (insertError.code === '23505') {
        throw new ConflictException('This quiz is already assigned as a take-away for this class, tutor, and course level');
      }
      throw new BadRequestException(`Failed to create take-away assignment: ${insertError.message}`);
    }

    // Fetch related data separately to avoid relationship cache issues
    const [classResult, tutorResult, courseLevelResult] = await Promise.all([
      this.supabase.from('classes').select('id, name, level, school_id').eq('id', insertData.class_id).single(),
      this.supabase.from('tutors').select('id, first_name, middle_name, last_name, email').eq('id', insertData.tutor_id).single(),
      this.supabase.from('course_levels').select('id, name, level_number, course_id').eq('id', insertData.course_level_id).single(),
    ]);

    // Fetch school if class has one
    let school = null;
    if (classResult.data?.school_id) {
      const { data: schoolData } = await this.supabase
        .from('schools')
        .select('id, name, code')
        .eq('id', classResult.data.school_id)
        .single();
      school = schoolData;
    }

    // Fetch course if course level has one
    let course = null;
    if (courseLevelResult.data?.course_id) {
      const { data: courseData } = await this.supabase
        .from('courses')
        .select('id, name, code')
        .eq('id', courseLevelResult.data.course_id)
        .single();
      course = courseData;
    }

    // Fetch take-away quiz if it exists
    let quizData = null;
    if (insertData.take_away_quiz_id) {
      const { data: quiz } = await this.supabase
        .from('take_away_quizzes')
        .select('id, title, description, questions_count, total_points, passing_score')
        .eq('id', insertData.take_away_quiz_id)
        .single();
      quizData = quiz;
    }

    const data = {
      ...insertData,
      class: classResult.data ? {
        ...classResult.data,
        school: school,
      } : null,
      tutor: tutorResult.data || null,
      course_level: courseLevelResult.data ? {
        ...courseLevelResult.data,
        course: course,
      } : null,
      take_away_quiz: quizData,
    };

    return data;
  }

  async findAll(filters?: {
    class_id?: string;
    tutor_id?: string;
    course_level_id?: string;
    enrollment_status?: 'enrolled' | 'completed';
  }): Promise<TakeAwayAssignment[]> {
    // Select specific columns to avoid Supabase auto-expanding relationships
    // This prevents errors when the table structure doesn't match expectations
    let query = this.supabase
      .from('take_away_assignments')
      .select('id, class_id, tutor_id, course_level_id, take_away_quiz_id, enrollment_status, due_date, assigned_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (filters?.class_id) {
      query = query.eq('class_id', filters.class_id);
    }
    if (filters?.tutor_id) {
      query = query.eq('tutor_id', filters.tutor_id);
    }
    if (filters?.course_level_id) {
      query = query.eq('course_level_id', filters.course_level_id);
    }
    if (filters?.enrollment_status) {
      query = query.eq('enrollment_status', filters.enrollment_status);
    }

    const { data: assignments, error } = await query;

    if (error) {
      // If table doesn't exist or has relationship issues, return empty array
      const errorMessage = error.message || '';
      const errorCode = error.code || '';
      const errorDetails = error.details || '';
      
      // Log the error for debugging
      console.warn('Error fetching take-away assignments:', {
        message: errorMessage,
        code: errorCode,
        details: errorDetails,
        hint: error.hint,
      });
      
      // Handle various error cases gracefully - return empty array instead of throwing
      const isTableError = errorMessage.includes('Could not find the table') || 
          errorMessage.includes('does not exist') ||
          (errorMessage.includes('relation') && errorMessage.includes('does not exist')) ||
          errorCode === '42P01'; // PostgreSQL error code for "relation does not exist"
      
      const isRelationshipError = errorCode === 'PGRST200' || // PostgREST error: relationship not found
          errorMessage.includes('Could not find a relationship') ||
          errorMessage.includes('foreign key relationship') ||
          errorDetails.includes('relationship');
      
      const isColumnError = errorMessage.includes('column') && errorMessage.includes('does not exist');
      
      if (isTableError || isRelationshipError || isColumnError) {
        console.warn('Take-away assignments issue detected. Returning empty array. This is normal if migrations haven\'t been run yet.');
        return [];
      }
      
      // For other errors, still return empty array to prevent frontend crashes
      console.error('Unexpected error fetching take-away assignments, returning empty array:', error);
      return [];
    }

    if (!assignments || assignments.length === 0) {
      return [];
    }

    // Fetch related data separately to avoid relationship cache issues
    const classIds = [...new Set(assignments.map(a => a.class_id))];
    const tutorIds = [...new Set(assignments.map(a => a.tutor_id))];
    const courseLevelIds = [...new Set(assignments.map(a => a.course_level_id))];
    const quizIds = [...new Set(assignments.map(a => a.take_away_quiz_id).filter(Boolean))];

    try {
      const [classesResult, tutorsResult, courseLevelsResult, quizzesResult] = await Promise.all([
        classIds.length > 0 
          ? this.supabase.from('classes').select('id, name, level, school_id').in('id', classIds)
          : { data: [], error: null },
        tutorIds.length > 0
          ? this.supabase.from('tutors').select('id, first_name, middle_name, last_name, email').in('id', tutorIds)
          : { data: [], error: null },
        courseLevelIds.length > 0
          ? this.supabase.from('course_levels').select('id, name, level_number, course_id').in('id', courseLevelIds)
          : { data: [], error: null },
        quizIds.length > 0 
          ? this.supabase.from('take_away_quizzes').select('id, title, description, questions_count, total_points, passing_score').in('id', quizIds)
          : { data: [], error: null },
      ]);

      // Log any errors but continue
      if (classesResult.error) {
        console.warn('Error fetching classes:', classesResult.error);
      }
      if (tutorsResult.error) {
        console.warn('Error fetching tutors:', tutorsResult.error);
      }
      if (courseLevelsResult.error) {
        console.warn('Error fetching course levels:', courseLevelsResult.error);
      }
      if (quizzesResult.error) {
        console.warn('Error fetching take-away quizzes:', quizzesResult.error);
      }

      // Fetch schools for classes
      const schoolIds = [...new Set((classesResult.data || []).map(c => c.school_id).filter(Boolean))];
      const schoolsResult = schoolIds.length > 0 
        ? await this.supabase.from('schools').select('id, name, code').in('id', schoolIds)
        : { data: [] };

      // Fetch courses for course levels
      const courseIds = [...new Set((courseLevelsResult.data || []).map(cl => cl.course_id).filter(Boolean))];
      const coursesResult = courseIds.length > 0
        ? await this.supabase.from('courses').select('id, name, code').in('id', courseIds)
        : { data: [] };

      // Build lookup maps
      const classesMap = new Map((classesResult.data || []).map(c => [c.id, c]));
      const tutorsMap = new Map((tutorsResult.data || []).map(t => [t.id, t]));
      const courseLevelsMap = new Map((courseLevelsResult.data || []).map(cl => [cl.id, cl]));
      const quizzesMap = new Map((quizzesResult.data || []).map(q => [q.id, q]));
      const schoolsMap = new Map((schoolsResult.data || []).map(s => [s.id, s]));
      const coursesMap = new Map((coursesResult.data || []).map(c => [c.id, c]));

      // Combine data
      return assignments.map(assignment => ({
        ...assignment,
        class: (() => {
          const classData = classesMap.get(assignment.class_id);
          if (!classData) return null;
          return {
            ...classData,
            school: classData.school_id ? schoolsMap.get(classData.school_id) : null,
          };
        })(),
        tutor: tutorsMap.get(assignment.tutor_id) || null,
        course_level: (() => {
          const levelData = courseLevelsMap.get(assignment.course_level_id);
          if (!levelData) return null;
          return {
            ...levelData,
            course: levelData.course_id ? coursesMap.get(levelData.course_id) : null,
          };
        })(),
        take_away_quiz: assignment.take_away_quiz_id ? quizzesMap.get(assignment.take_away_quiz_id) || null : null,
      }));
    } catch (relatedDataError: any) {
      // If there's an error fetching related data, log it but return assignments without related data
      console.error('Error fetching related data for take-away assignments:', relatedDataError);
      return assignments.map(assignment => ({
        ...assignment,
        class: null,
        tutor: null,
        course_level: null,
        take_away_quiz: null,
      }));
    }
  }

  async findOne(id: string): Promise<TakeAwayAssignment> {
    const { data: assignment, error } = await this.supabase
      .from('take_away_assignments')
      .select('id, class_id, tutor_id, course_level_id, take_away_quiz_id, enrollment_status, due_date, assigned_at, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !assignment) {
      throw new NotFoundException('Take-away assignment not found');
    }

    // Fetch related data separately
    const [classResult, tutorResult, courseLevelResult, quizResult] = await Promise.all([
      this.supabase.from('classes').select('id, name, level, school_id').eq('id', assignment.class_id).single(),
      this.supabase.from('tutors').select('id, first_name, middle_name, last_name, email').eq('id', assignment.tutor_id).single(),
      this.supabase.from('course_levels').select('id, name, level_number, course_id').eq('id', assignment.course_level_id).single(),
      assignment.take_away_quiz_id
        ? this.supabase.from('take_away_quizzes').select('id, title, description, questions_count, total_points, passing_score').eq('id', assignment.take_away_quiz_id).single()
        : { data: null },
    ]);

    // Fetch school if class has one
    let school = null;
    if (classResult.data?.school_id) {
      const { data: schoolData } = await this.supabase
        .from('schools')
        .select('id, name, code')
        .eq('id', classResult.data.school_id)
        .single();
      school = schoolData;
    }

    // Fetch course if course level has one
    let course = null;
    if (courseLevelResult.data?.course_id) {
      const { data: courseData } = await this.supabase
        .from('courses')
        .select('id, name, code')
        .eq('id', courseLevelResult.data.course_id)
        .single();
      course = courseData;
    }

    return {
      ...assignment,
      class: classResult.data ? {
        ...classResult.data,
        school: school,
      } : null,
      tutor: tutorResult.data || null,
      course_level: courseLevelResult.data ? {
        ...courseLevelResult.data,
        course: course,
      } : null,
      take_away_quiz: quizResult.data || null,
    };
  }

  async update(id: string, dto: UpdateTakeAwayDto): Promise<TakeAwayAssignment> {
    const updateData: any = {};

    if (dto.tutor_id !== undefined) {
      updateData.tutor_id = dto.tutor_id;
    }
    if (dto.course_level_id !== undefined) {
      updateData.course_level_id = dto.course_level_id;
    }
    if (dto.take_away_quiz_id !== undefined) {
      updateData.take_away_quiz_id = dto.take_away_quiz_id || null;
    }
    if (dto.enrollment_status !== undefined) {
      updateData.enrollment_status = dto.enrollment_status;
    }
    if (dto.due_date !== undefined) {
      updateData.due_date = dto.due_date || null;
    }

    const { data: updatedAssignment, error } = await this.supabase
      .from('take_away_assignments')
      .update(updateData)
      .eq('id', id)
      .select('id, class_id, tutor_id, course_level_id, take_away_quiz_id, enrollment_status, due_date, assigned_at, created_at, updated_at')
      .single();

    if (error || !updatedAssignment) {
      throw new NotFoundException('Take-away assignment not found');
    }

    // Fetch related data separately (same as findOne)
    const [classResult, tutorResult, courseLevelResult, quizResult] = await Promise.all([
      this.supabase.from('classes').select('id, name, level, school_id').eq('id', updatedAssignment.class_id).single(),
      this.supabase.from('tutors').select('id, first_name, middle_name, last_name, email').eq('id', updatedAssignment.tutor_id).single(),
      this.supabase.from('course_levels').select('id, name, level_number, course_id').eq('id', updatedAssignment.course_level_id).single(),
      updatedAssignment.take_away_quiz_id
        ? this.supabase.from('take_away_quizzes').select('id, title, description, questions_count, total_points, passing_score').eq('id', updatedAssignment.take_away_quiz_id).single()
        : { data: null },
    ]);

    // Fetch school if class has one
    let school = null;
    if (classResult.data?.school_id) {
      const { data: schoolData } = await this.supabase
        .from('schools')
        .select('id, name, code')
        .eq('id', classResult.data.school_id)
        .single();
      school = schoolData;
    }

    // Fetch course if course level has one
    let course = null;
    if (courseLevelResult.data?.course_id) {
      const { data: courseData } = await this.supabase
        .from('courses')
        .select('id, name, code')
        .eq('id', courseLevelResult.data.course_id)
        .single();
      course = courseData;
    }

    return {
      ...updatedAssignment,
      class: classResult.data ? {
        ...classResult.data,
        school: school,
      } : null,
      tutor: tutorResult.data || null,
      course_level: courseLevelResult.data ? {
        ...courseLevelResult.data,
        course: course,
      } : null,
      take_away_quiz: quizResult.data || null,
    };
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('take_away_assignments')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(`Failed to delete take-away assignment: ${error.message}`);
    }
  }

  // ==================== STUDENT METHODS ====================

  async getStudentAssignments(studentId: string): Promise<(TakeAwayAssignment & { deadline?: string })[]> {
    console.log('=== getStudentAssignments ===');
    console.log('Student ID:', studentId);
    
    // Get student's class
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id, username')
      .eq('id', studentId)
      .single();

    if (studentError) {
      console.error('Error fetching student:', studentError);
      throw new BadRequestException(`Failed to fetch student: ${studentError.message}`);
    }

    if (!student) {
      console.error('Student not found:', studentId);
      throw new NotFoundException('Student not found');
    }

    if (!student.class_id) {
      console.warn('Student has no class_id:', student);
      return [];
    }

    console.log('Student class_id:', student.class_id);

    // Get assignments for student's class, ordered by creation date (newest first)
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('take_away_assignments')
      .select('id, class_id, tutor_id, course_level_id, enrollment_status, due_date, assigned_at, take_away_quiz_id, created_at, updated_at')
      .eq('class_id', student.class_id)
      .order('created_at', { ascending: false });

    if (assignmentsError) {
      console.error('Error fetching student assignments:', assignmentsError);
      throw new BadRequestException(`Failed to fetch assignments: ${assignmentsError.message}`);
    }

    console.log('Found assignments:', assignments?.length || 0);
    if (assignments && assignments.length > 0) {
      console.log('Assignment IDs:', assignments.map(a => a.id));
      console.log('Assignment class_ids:', assignments.map(a => a.class_id));
      console.log('Assignment quiz_ids:', assignments.map(a => a.take_away_quiz_id));
    }

    if (!assignments || assignments.length === 0) {
      return [];
    }

    // Fetch related data
    const classIds = [...new Set(assignments.map(a => a.class_id))];
    const courseLevelIds = [...new Set(assignments.map(a => a.course_level_id).filter(Boolean))];
    const quizIds = [...new Set(assignments.map(a => a.take_away_quiz_id).filter(Boolean))];

    const [classesResult, courseLevelsResult, quizzesResult] = await Promise.all([
      classIds.length > 0
        ? this.supabase.from('classes').select('id, name, level').in('id', classIds)
        : { data: [], error: null },
      courseLevelIds.length > 0
        ? this.supabase.from('course_levels').select('id, name, course_id').in('id', courseLevelIds)
        : { data: [], error: null },
      quizIds.length > 0
        ? this.supabase.from('take_away_quizzes').select('id, title, description, time_limit_minutes, passing_score, total_points, questions_count').in('id', quizIds)
        : { data: [], error: null },
    ]);

    // Fetch all tutors assigned to all classes at once (batch query)
    const classTutorsMap = new Map<string, Array<{ id: string; first_name: string; middle_name: string; last_name: string; email: string; role: string }>>();
    
    if (classIds.length > 0) {
      // Batch fetch all tutor assignments for all classes at once
      const { data: allTutorAssignments } = await this.supabase
        .from('tutor_class_assignments')
        .select(`
          id,
          class_id,
          tutor_id,
          role,
          tutor:tutors(
            id,
            first_name,
            middle_name,
            last_name,
            email
          )
        `)
        .in('class_id', classIds)
        .eq('status', 'active');

      // Group tutors by class_id
      if (allTutorAssignments && allTutorAssignments.length > 0) {
        allTutorAssignments.forEach((ta: any) => {
          const tutor = Array.isArray(ta.tutor) ? ta.tutor[0] : ta.tutor;
          if (!tutor) return;
          
          const classId = ta.class_id;
          if (!classTutorsMap.has(classId)) {
            classTutorsMap.set(classId, []);
          }
          
          classTutorsMap.get(classId)!.push({
            id: tutor.id || ta.tutor_id,
            first_name: tutor.first_name || '',
            middle_name: tutor.middle_name || '',
            last_name: tutor.last_name || '',
            email: tutor.email || '',
            role: ta.role || 'assistant',
          });
        });
      }
    }

    const classes = classesResult.data || [];
    const courseLevels = courseLevelsResult.data || [];
    const quizzes = quizzesResult.data || [];

    // Helper function to format tutor name
    const formatTutorName = (tutor: { first_name: string; middle_name: string; last_name: string }) => {
      const parts = [tutor.first_name, tutor.middle_name, tutor.last_name].filter(Boolean);
      return parts.join(' ') || 'N/A';
    };

    // Combine data
    const result = assignments.map(assignment => {
      const classTutors = classTutorsMap.get(assignment.class_id) || [];
      const leadTutor = classTutors.find(t => t.role === 'lead');
      const assistantTutor = classTutors.find(t => t.role === 'assistant');
      
      // Format tutor names
      const tutors = {
        lead: leadTutor ? {
          id: leadTutor.id,
          name: formatTutorName(leadTutor),
          email: leadTutor.email,
          role: 'lead',
        } : null,
        assistant: assistantTutor ? {
          id: assistantTutor.id,
          name: formatTutorName(assistantTutor),
          email: assistantTutor.email,
          role: 'assistant',
        } : null,
      };

      return {
        id: assignment.id,
        class_id: assignment.class_id,
        tutor_id: assignment.tutor_id,
        course_level_id: assignment.course_level_id,
        take_away_quiz_id: assignment.take_away_quiz_id,
        enrollment_status: assignment.enrollment_status,
        due_date: assignment.due_date,
        assigned_at: assignment.assigned_at || assignment.created_at,
        created_at: assignment.created_at,
        updated_at: assignment.updated_at,
        deadline: assignment.due_date,
        class: classes.find(c => c.id === assignment.class_id),
        tutors: tutors,
        tutor: leadTutor || assistantTutor || null, // Keep for backward compatibility
        course_level: courseLevels.find(cl => cl.id === assignment.course_level_id),
        take_away_quiz: quizzes.find(q => q.id === assignment.take_away_quiz_id),
      };
    }) as (TakeAwayAssignment & { deadline?: string; tutors?: { lead: any; assistant: any } })[];

    console.log('Returning assignments:', result.length);
    console.log('Assignments with quizzes:', result.filter(a => a.take_away_quiz).length);
    
    return result;
  }

  /**
   * Get take-away assignments for a tutor (filtered by their assigned classes)
   */
  async getTutorAssignments(tutorId: string): Promise<TakeAwayAssignment[]> {
    console.log(`[GetTutorAssignments] Fetching assignments for tutor: ${tutorId}`);

    // Get all classes assigned to this tutor
    const { data: tutorAssignments, error: tutorAssignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select('class_id')
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (tutorAssignmentsError) {
      console.error('[GetTutorAssignments] Error fetching tutor assignments:', tutorAssignmentsError);
      throw new BadRequestException(`Failed to fetch tutor assignments: ${tutorAssignmentsError.message}`);
    }

    if (!tutorAssignments || tutorAssignments.length === 0) {
      console.log('[GetTutorAssignments] Tutor has no assigned classes');
      return [];
    }

    const classIds = tutorAssignments.map(a => a.class_id);

    // Get all take-away assignments for these classes
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('take_away_assignments')
      .select('id, class_id, tutor_id, course_level_id, enrollment_status, due_date, assigned_at, take_away_quiz_id, created_at, updated_at')
      .in('class_id', classIds)
      .order('created_at', { ascending: false });

    if (assignmentsError) {
      console.error('[GetTutorAssignments] Error fetching assignments:', assignmentsError);
      throw new BadRequestException(`Failed to fetch assignments: ${assignmentsError.message}`);
    }

    if (!assignments || assignments.length === 0) {
      console.log('[GetTutorAssignments] No assignments found for tutor classes');
      return [];
    }

    // Fetch related data
    const uniqueClassIds = [...new Set(assignments.map(a => a.class_id))];
    const uniqueTutorIds = [...new Set(assignments.map(a => a.tutor_id).filter(Boolean))];
    const uniqueCourseLevelIds = [...new Set(assignments.map(a => a.course_level_id).filter(Boolean))];
    const uniqueQuizIds = [...new Set(assignments.map(a => a.take_away_quiz_id).filter(Boolean))];

    const [classesResult, tutorsResult, courseLevelsResult, quizzesResult, schoolsResult] = await Promise.all([
      uniqueClassIds.length > 0
        ? this.supabase.from('classes').select('id, name, level, school_id').in('id', uniqueClassIds)
        : { data: [], error: null },
      uniqueTutorIds.length > 0
        ? this.supabase.from('tutors').select('id, first_name, middle_name, last_name, email').in('id', uniqueTutorIds)
        : { data: [], error: null },
      uniqueCourseLevelIds.length > 0
        ? this.supabase.from('course_levels').select('id, name, level_number, course_id').in('id', uniqueCourseLevelIds)
        : { data: [], error: null },
      uniqueQuizIds.length > 0
        ? this.supabase.from('take_away_quizzes').select('id, title, description, time_limit_minutes, passing_score, total_points, questions_count').in('id', uniqueQuizIds)
        : { data: [], error: null },
      uniqueClassIds.length > 0
        ? this.supabase.from('classes').select('id, school_id').in('id', uniqueClassIds)
            .then(async (result) => {
              if (result.data && result.data.length > 0) {
                const schoolIds = [...new Set(result.data.map(c => c.school_id).filter(Boolean))];
                if (schoolIds.length > 0) {
                  return this.supabase.from('schools').select('id, name, code').in('id', schoolIds);
                }
              }
              return { data: [], error: null };
            })
        : { data: [], error: null },
    ]);

    const classes = classesResult.data || [];
    const tutors = tutorsResult.data || [];
    const courseLevels = courseLevelsResult.data || [];
    const quizzes = quizzesResult.data || [];
    const schools = schoolsResult.data || [];

    // Get course IDs for course levels
    const courseIds = [...new Set(courseLevels.map(cl => cl.course_id).filter(Boolean))];
    const coursesResult = courseIds.length > 0
      ? await this.supabase.from('courses').select('id, name, code').in('id', courseIds)
      : { data: [], error: null };
    const courses = coursesResult.data || [];

    // Build lookup maps
    const classesMap = new Map(classes.map(c => [c.id, c]));
    const tutorsMap = new Map(tutors.map(t => [t.id, t]));
    const courseLevelsMap = new Map(courseLevels.map(cl => [cl.id, cl]));
    const quizzesMap = new Map(quizzes.map(q => [q.id, q]));
    const schoolsMap = new Map(schools.map(s => [s.id, s]));
    const coursesMap = new Map(courses.map(c => [c.id, c]));

    // Combine data
    return assignments.map(assignment => ({
      ...assignment,
      class: (() => {
        const classData = classesMap.get(assignment.class_id);
        if (!classData) return null;
        return {
          ...classData,
          school: classData.school_id ? schoolsMap.get(classData.school_id) : null,
        };
      })(),
      tutor: tutorsMap.get(assignment.tutor_id) || null,
      course_level: (() => {
        const levelData = courseLevelsMap.get(assignment.course_level_id);
        if (!levelData) return null;
        return {
          ...levelData,
          course: levelData.course_id ? coursesMap.get(levelData.course_id) : null,
        };
      })(),
      take_away_quiz: assignment.take_away_quiz_id ? quizzesMap.get(assignment.take_away_quiz_id) || null : null,
    }));
  }

  /**
   * Get quiz availability time for a take-away assignment
   * Quiz becomes available 40 minutes after the class start time
   */
  async getQuizAvailabilityTime(assignmentId: string): Promise<{
    class_start_time: string | null;
    quiz_available_at: string | null;
    is_available: boolean;
    time_until_available_seconds: number;
  }> {
    console.log(`[GetQuizAvailabilityTime] Fetching availability for assignment: ${assignmentId}`);

    // Get assignment with class_id
    const { data: assignment, error: assignmentError } = await this.supabase
      .from('take_away_assignments')
      .select('id, class_id')
      .eq('id', assignmentId)
      .single();

    if (assignmentError || !assignment) {
      throw new NotFoundException('Take-away assignment not found');
    }

    // Get class schedule
    const { data: schedule, error: scheduleError } = await this.supabase
      .from('class_schedules')
      .select('day_of_week, start_time, end_time')
      .eq('class_id', assignment.class_id)
      .eq('status', 'active')
      .single();

    if (scheduleError || !schedule) {
      console.warn(`[GetQuizAvailabilityTime] No schedule found for class ${assignment.class_id}`);
      return {
        class_start_time: null,
        quiz_available_at: null,
        is_available: true, // If no schedule, allow immediate access
        time_until_available_seconds: 0,
      };
    }

    // Get current time in Nairobi timezone
    const networkTime = getNairobiTime();
    const today = getNairobiDayOfWeek(networkTime).toLowerCase();
    const scheduleDay = (schedule.day_of_week || '').trim().toLowerCase();

    // Check if today is the class day
    if (scheduleDay !== today) {
      console.log(`[GetQuizAvailabilityTime] Today (${today}) is not the class day (${scheduleDay})`);
      return {
        class_start_time: null,
        quiz_available_at: null,
        is_available: true, // If not class day, allow access
        time_until_available_seconds: 0,
      };
    }

    // Calculate class start time for today
    const startTimeStr = schedule.start_time.substring(0, 5);
    const [hours, minutes] = startTimeStr.split(':').map(Number);
    const classStartTime = new Date(networkTime);
    classStartTime.setHours(hours, minutes, 0, 0);

    // Quiz becomes available 40 minutes after class start
    const quizAvailableAt = new Date(classStartTime.getTime() + 40 * 60 * 1000);

    // Calculate time until available
    const now = networkTime;
    const timeUntilAvailable = Math.max(0, Math.floor((quizAvailableAt.getTime() - now.getTime()) / 1000));
    const isAvailable = timeUntilAvailable === 0;

    console.log(`[GetQuizAvailabilityTime] Class starts at: ${classStartTime.toISOString()}`);
    console.log(`[GetQuizAvailabilityTime] Quiz available at: ${quizAvailableAt.toISOString()}`);
    console.log(`[GetQuizAvailabilityTime] Current time: ${now.toISOString()}`);
    console.log(`[GetQuizAvailabilityTime] Time until available: ${timeUntilAvailable} seconds`);
    console.log(`[GetQuizAvailabilityTime] Is available: ${isAvailable}`);

    return {
      class_start_time: classStartTime.toISOString(),
      quiz_available_at: quizAvailableAt.toISOString(),
      is_available: isAvailable,
      time_until_available_seconds: timeUntilAvailable,
    };
  }

  async getStudentAssignmentPoints(studentId: string, assignmentId: string): Promise<{
    total_points_earned: number;
    max_possible_points: number;
    best_score: number;
    best_percentage: number;
    total_attempts: number;
    completed_attempts: number;
  } | null> {
    // First, try to update/calculate points to ensure we have the latest data
    const { error: calcError } = await this.supabase.rpc(
      'update_take_away_assignment_student_points',
      {
        p_student_id: studentId,
        p_assignment_id: assignmentId,
      }
    );

    if (calcError) {
      console.error('[GetStudentAssignmentPoints] Error calculating student points:', calcError);
      console.error('[GetStudentAssignmentPoints] Error details:', JSON.stringify(calcError, null, 2));
    }

    // Now fetch the record
    const { data, error } = await this.supabase
      .from('take_away_assignment_student_points')
      .select('*')
      .eq('student_id', studentId)
      .eq('assignment_id', assignmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No record found even after calculation - return zeros
        console.warn(`[GetStudentAssignmentPoints] No points record found for student ${studentId}, assignment ${assignmentId}`);
        return {
          total_points_earned: 0,
          max_possible_points: 0,
          best_score: 0,
          best_percentage: 0,
          total_attempts: 0,
          completed_attempts: 0,
        };
      }

      console.error('[GetStudentAssignmentPoints] Error fetching student assignment points:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    console.log(`[GetStudentAssignmentPoints] Found points for student ${studentId}, assignment ${assignmentId}:`, {
      total_points_earned: data.total_points_earned,
      max_possible_points: data.max_possible_points,
    });

    return {
      total_points_earned: data.total_points_earned || 0,
      max_possible_points: data.max_possible_points || 0,
      best_score: data.best_score || 0,
      best_percentage: data.best_percentage || 0,
      total_attempts: data.total_attempts || 0,
      completed_attempts: data.completed_attempts || 0,
    };
  }
}
