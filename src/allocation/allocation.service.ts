import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  AssignTutorDto,
  UpdateAssignmentDto,
  AssignCourseLevelDto,
  UpdateCourseLevelStatusDto,
  AssignCourseEditorDto,
  UpdateCourseEditorDto,
  ClassSchedule,
  TutorAssignment,
  ClassCourseLevelAssignment,
  CourseEditorAssignment,
  AllocationDetail,
} from './dto/allocation.dto';

@Injectable()
export class AllocationService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ==================== CLASS SCHEDULES ====================

  async createSchedule(dto: CreateScheduleDto): Promise<ClassSchedule> {
    // Validate time range (compare as strings in HH:MM format)
    const startMinutes = this.timeToMinutes(dto.start_time);
    const endMinutes = this.timeToMinutes(dto.end_time);
    if (startMinutes >= endMinutes) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check if class exists
    const { data: classData, error: classError } = await this.supabase
      .from('classes')
      .select('id')
      .eq('id', dto.class_id)
      .single();

    if (classError || !classData) {
      throw new NotFoundException('Class not found');
    }

    // Create schedule
    const { data, error } = await this.supabase
      .from('class_schedules')
      .insert({
        class_id: dto.class_id,
        day_of_week: dto.day_of_week,
        start_time: dto.start_time,
        end_time: dto.end_time,
      })
      .select(`
        *,
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Schedule already exists for this class on this day');
      }
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async updateSchedule(id: string, dto: UpdateScheduleDto): Promise<ClassSchedule> {
    // If updating times, validate range
    if (dto.start_time && dto.end_time) {
      const startMinutes = this.timeToMinutes(dto.start_time);
      const endMinutes = this.timeToMinutes(dto.end_time);
      if (startMinutes >= endMinutes) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    const { data, error } = await this.supabase
      .from('class_schedules')
      .update(dto)
      .eq('id', id)
      .select(`
        *,
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Schedule already exists for this class on this day');
      }
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Schedule not found');
    }

    return data;
  }

  async deleteSchedule(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('class_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  async getSchedulesByClass(classId: string): Promise<ClassSchedule[]> {
    const { data, error } = await this.supabase
      .from('class_schedules')
      .select(`
        *,
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .eq('class_id', classId)
      .order('day_of_week');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  async getAllSchedules(): Promise<ClassSchedule[]> {
    const { data, error } = await this.supabase
      .from('class_schedules')
      .select(`
        *,
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .order('day_of_week');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  // ==================== TUTOR ASSIGNMENTS ====================

  async assignTutor(dto: AssignTutorDto): Promise<TutorAssignment> {
    // Check if tutor exists
    const { data: tutorData, error: tutorError } = await this.supabase
      .from('tutors')
      .select('id, status')
      .eq('id', dto.tutor_id)
      .single();

    if (tutorError || !tutorData) {
      throw new NotFoundException('Tutor not found');
    }

    if (tutorData.status !== 'active') {
      throw new BadRequestException('Cannot assign inactive tutor');
    }

    // Check if class exists
    const { data: classData, error: classError } = await this.supabase
      .from('classes')
      .select('id, status')
      .eq('id', dto.class_id)
      .single();

    if (classError || !classData) {
      throw new NotFoundException('Class not found');
    }

    // Check current assignments for this class
    const { data: existingAssignments } = await this.supabase
      .from('tutor_class_assignments')
      .select('id, role')
      .eq('class_id', dto.class_id)
      .eq('status', 'active');

    if (existingAssignments && existingAssignments.length >= 2) {
      throw new BadRequestException('Class already has maximum number of tutors (2)');
    }

    // Check if role is already taken
    const roleExists = existingAssignments?.some(a => a.role === dto.role);
    if (roleExists) {
      throw new ConflictException(`Class already has a ${dto.role} tutor assigned`);
    }

    // Create assignment
    const { data, error } = await this.supabase
      .from('tutor_class_assignments')
      .insert({
        tutor_id: dto.tutor_id,
        class_id: dto.class_id,
        role: dto.role,
        assigned_at: new Date().toISOString(),
      })
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email, phone, level),
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('Tutor is already assigned to this class');
      }
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async updateAssignment(id: string, dto: UpdateAssignmentDto): Promise<TutorAssignment> {
    // If changing role, check if new role is available
    if (dto.role) {
      const { data: currentAssignment } = await this.supabase
        .from('tutor_class_assignments')
        .select('class_id, role')
        .eq('id', id)
        .single();

      if (currentAssignment && currentAssignment.role !== dto.role) {
        const { data: existingRole } = await this.supabase
          .from('tutor_class_assignments')
          .select('id')
          .eq('class_id', currentAssignment.class_id)
          .eq('role', dto.role)
          .eq('status', 'active')
          .single();

        if (existingRole) {
          throw new ConflictException(`Class already has a ${dto.role} tutor assigned`);
        }
      }
    }

    const { data, error } = await this.supabase
      .from('tutor_class_assignments')
      .update(dto)
      .eq('id', id)
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email, phone, level),
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Assignment not found');
    }

    return data;
  }

  async unassignTutor(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('tutor_class_assignments')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  async getAssignmentsByTutor(tutorId: string): Promise<TutorAssignment[]> {
    const { data, error } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email, phone, level),
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active')
      .order('assigned_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  async getTutorDetails(tutorId: string): Promise<any> {
    // Get tutor info
    const { data: tutor, error: tutorError } = await this.supabase
      .from('tutors')
      .select('id, first_name, middle_name, last_name, email, phone, level, status')
      .eq('id', tutorId)
      .single();

    if (tutorError || !tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Get all assignments for this tutor
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        id,
        class_id,
        role,
        assigned_at,
        class:classes(
          id,
          name,
          level,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentsError) {
      throw new BadRequestException(assignmentsError.message);
    }

    // Get student counts for each class
    const classIds = (assignments || []).map((a: any) => a.class_id);
    const { data: studentCounts } = await this.supabase
      .from('students')
      .select('class_id')
      .in('class_id', classIds)
      .eq('status', 'active');

    // Group by school
    const schoolsMap = new Map();
    
    (assignments || []).forEach((assignment: any) => {
      const classData = Array.isArray(assignment.class) ? assignment.class[0] : assignment.class;
      if (!classData || !classData.school) return;

      const school = Array.isArray(classData.school) ? classData.school[0] : classData.school;
      const schoolId = school.id;

      if (!schoolsMap.has(schoolId)) {
        schoolsMap.set(schoolId, {
          id: school.id,
          name: school.name,
          code: school.code,
          classes: [],
        });
      }

      const studentCount = studentCounts?.filter((s: any) => s.class_id === classData.id).length || 0;

      schoolsMap.get(schoolId).classes.push({
        id: classData.id,
        name: classData.name,
        level: classData.level,
        role: assignment.role,
        assigned_at: assignment.assigned_at,
        student_count: studentCount,
      });
    });

    // Calculate totals
    const totalClasses = (assignments || []).length;
    const totalStudents = studentCounts?.length || 0;
    const totalSchools = schoolsMap.size;

    return {
      tutor: {
        id: tutor.id,
        first_name: tutor.first_name,
        middle_name: tutor.middle_name,
        last_name: tutor.last_name,
        email: tutor.email,
        phone: tutor.phone,
        level: tutor.level,
        status: tutor.status,
      },
      schools: Array.from(schoolsMap.values()),
      summary: {
        total_schools: totalSchools,
        total_classes: totalClasses,
        total_students: totalStudents,
      },
    };
  }

  async getTutorSchools(tutorId: string) {
    // Get all assignments for this tutor
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        class_id,
        class:classes(
          id,
          name,
          level,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentsError) {
      throw new BadRequestException(assignmentsError.message);
    }

    // Group by school and get unique schools with counts
    const schoolsMap = new Map();
    const classIds: string[] = [];
    
    (assignments || []).forEach((assignment: any) => {
      const classData = Array.isArray(assignment.class) ? assignment.class[0] : assignment.class;
      if (!classData || !classData.school) return;

      const school = Array.isArray(classData.school) ? classData.school[0] : classData.school;
      const schoolId = school.id;

      if (!schoolsMap.has(schoolId)) {
        schoolsMap.set(schoolId, {
          id: school.id,
          name: school.name,
          code: school.code,
          class_ids: [],
        });
      }

      // Track class IDs for this school
      schoolsMap.get(schoolId).class_ids.push(classData.id);
      classIds.push(classData.id);
    });

    // Get student counts for all classes
    const { data: students } = await this.supabase
      .from('students')
      .select('class_id')
      .in('class_id', classIds)
      .eq('status', 'active');

    // Calculate counts for each school
    const schoolsWithCounts = Array.from(schoolsMap.values()).map((school: any) => {
      const schoolClassIds = school.class_ids;
      const studentCount = students?.filter((s: any) => schoolClassIds.includes(s.class_id)).length || 0;
      
      return {
        id: school.id,
        name: school.name,
        code: school.code,
        class_count: schoolClassIds.length,
        student_count: studentCount,
      };
    });

    return schoolsWithCounts;
  }

  async getTutorSchoolDetails(tutorId: string, schoolId: string) {
    // Verify tutor has access to this school
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        id,
        class_id,
        role,
        assigned_at,
        class:classes(
          id,
          name,
          level,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentsError) {
      throw new BadRequestException(assignmentsError.message);
    }

    // Filter assignments for this school
    const schoolAssignments = (assignments || []).filter((assignment: any) => {
      const classData = Array.isArray(assignment.class) ? assignment.class[0] : assignment.class;
      const school = classData?.school ? (Array.isArray(classData.school) ? classData.school[0] : classData.school) : null;
      return school?.id === schoolId;
    });

    if (schoolAssignments.length === 0) {
      throw new NotFoundException('School not found or tutor does not have access to this school');
    }

    // Get school info from first assignment
    const firstClass = Array.isArray(schoolAssignments[0].class) ? schoolAssignments[0].class[0] : schoolAssignments[0].class;
    const school = Array.isArray(firstClass.school) ? firstClass.school[0] : firstClass.school;

    // Get class IDs for this school
    const classIds = schoolAssignments.map((a: any) => {
      const classData = Array.isArray(a.class) ? a.class[0] : a.class;
      return classData.id;
    });

    // Get student counts and login info
    const { data: students } = await this.supabase
      .from('students')
      .select('id, class_id, last_login, login_count')
      .in('class_id', classIds)
      .eq('status', 'active');

    // Calculate performance metrics
    const totalStudents = students?.length || 0;
    const studentsWithLogin = students?.filter((s: any) => s.last_login).length || 0;
    const totalLogins = students?.reduce((sum: number, s: any) => sum + (s.login_count || 0), 0) || 0;
    const loginRate = totalStudents > 0 ? (studentsWithLogin / totalStudents) * 100 : 0;

    // Get classes with student counts
    const classes = schoolAssignments.map((assignment: any) => {
      const classData = Array.isArray(assignment.class) ? assignment.class[0] : assignment.class;
      const studentCount = students?.filter((s: any) => s.class_id === classData.id).length || 0;
      return {
        id: classData.id,
        name: classData.name,
        level: classData.level,
        role: assignment.role,
        assigned_at: assignment.assigned_at,
        student_count: studentCount,
      };
    });

    return {
      school: {
        id: school.id,
        name: school.name,
        code: school.code,
      },
      overview: {
        total_classes: classes.length,
        total_students: totalStudents,
        students_with_login: studentsWithLogin,
        login_rate: Math.round(loginRate * 100) / 100,
        total_logins: totalLogins,
      },
      classes,
    };
  }

  async getSchoolPerformanceData(tutorId: string, schoolId: string) {
    // Get all classes assigned to this tutor in this school
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        class_id,
        class:classes(
          id,
          name,
          level,
          school_id,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentsError) {
      throw new BadRequestException(assignmentsError.message);
    }

    // Filter by school
    const schoolAssignments = (assignments || []).filter((a: any) => {
      const classData = Array.isArray(a.class) ? a.class[0] : a.class;
      const school = Array.isArray(classData.school) ? classData.school[0] : classData.school;
      return school?.id === schoolId;
    });

    if (schoolAssignments.length === 0) {
      throw new NotFoundException('School not found or tutor does not have access to this school');
    }

    const firstClass = Array.isArray(schoolAssignments[0].class) ? schoolAssignments[0].class[0] : schoolAssignments[0].class;
    const school = Array.isArray(firstClass.school) ? firstClass.school[0] : firstClass.school;

    const classIds = schoolAssignments.map((a: any) => {
      const classData = Array.isArray(a.class) ? a.class[0] : a.class;
      return classData.id;
    });

    // Get all students in these classes
    const { data: students } = await this.supabase
      .from('students')
      .select('id, class_id')
      .in('class_id', classIds)
      .eq('status', 'active');

    const totalStudents = students?.length || 0;

    // Get course level assignments for these classes
    const { data: courseLevelAssignments } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        class_id,
        course_level_id,
        enrollment_status,
        course_level:course_levels(
          id,
          name,
          course:courses(id, name)
        )
      `)
      .in('class_id', classIds)
      .eq('enrollment_status', 'enrolled');

    // Get topics for these course levels
    const courseLevelIds = (courseLevelAssignments || []).map((a: any) => {
      const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
      return level.id;
    });

    let topics: any[] = [];
    if (courseLevelIds.length > 0) {
      const { data: topicsData } = await this.supabase
        .from('topics')
        .select('id')
        .in('level_id', courseLevelIds)
        .eq('status', 'active');
      topics = topicsData || [];
    }

    const totalLessons = topics.length;

    // Get student quiz best scores to calculate completed lessons
    const studentIds = (students || []).map((s: any) => s.id);
    const { data: quizzes } = await this.supabase
      .from('quizzes')
      .select('id, topic_id')
      .in('topic_id', topics.map((t: any) => t.id))
      .eq('status', 'active');

    const quizIds = (quizzes || []).map((q: any) => q.id);
    let completedLessons = 0;
    if (studentIds.length > 0 && quizIds.length > 0) {
      const { data: bestScores } = await this.supabase
        .from('student_quiz_best_scores')
        .select('quiz_id')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds);
      
      // Count unique topic completions (at least one quiz passed per topic)
      const completedTopics = new Set();
      (bestScores || []).forEach((score: any) => {
        const quiz = (quizzes || []).find((q: any) => q.id === score.quiz_id);
        if (quiz) {
          completedTopics.add(quiz.topic_id);
        }
      });
      completedLessons = completedTopics.size;
    }

    // Get most enrolled class
    const classEnrollmentMap = new Map();
    (courseLevelAssignments || []).forEach((a: any) => {
      const count = classEnrollmentMap.get(a.class_id) || 0;
      classEnrollmentMap.set(a.class_id, count + 1);
    });

    let mostEnrolledClass = null;
    let maxEnrollments = 0;
    schoolAssignments.forEach((a: any) => {
      const classData = Array.isArray(a.class) ? a.class[0] : a.class;
      const enrollments = classEnrollmentMap.get(classData.id) || 0;
      if (enrollments > maxEnrollments) {
        maxEnrollments = enrollments;
        const level = (courseLevelAssignments || []).find((cla: any) => cla.class_id === classData.id);
        const courseLevel = level ? (Array.isArray(level.course_level) ? level.course_level[0] : level.course_level) : null;
        const course = courseLevel ? (Array.isArray(courseLevel.course) ? courseLevel.course[0] : courseLevel.course) : null;
        mostEnrolledClass = {
          class_name: classData.name,
          enrollments: enrollments,
          course_name: course?.name || 'Unknown',
        };
      }
    });

    // Calculate overall school rating (average of all student best scores)
    let overallRating = 0;
    if (studentIds.length > 0 && quizIds.length > 0) {
      const { data: allBestScores } = await this.supabase
        .from('student_quiz_best_scores')
        .select('best_percentage')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds);
      
      if (allBestScores && allBestScores.length > 0) {
        const totalPercentage = allBestScores.reduce((sum: number, s: any) => sum + (s.best_percentage || 0), 0);
        overallRating = totalPercentage / allBestScores.length;
      }
    }

    // Get class statistics
    const classStats = await Promise.all(
      schoolAssignments.map(async (a: any) => {
        const classData = Array.isArray(a.class) ? a.class[0] : a.class;
        const classStudents = students?.filter((s: any) => s.class_id === classData.id) || [];
        const classStudentIds = classStudents.map((s: any) => s.id);

        // Get enrollments for this class
        const classEnrollments = (courseLevelAssignments || []).filter((cla: any) => cla.class_id === classData.id).length;

        // Get topics for this class's course levels
        const classCourseLevelIds = (courseLevelAssignments || [])
          .filter((cla: any) => cla.class_id === classData.id)
          .map((cla: any) => {
            const level = Array.isArray(cla.course_level) ? cla.course_level[0] : cla.course_level;
            return level.id;
          });

        let classTopics: any[] = [];
        if (classCourseLevelIds.length > 0) {
          const { data: classTopicsData } = await this.supabase
            .from('topics')
            .select('id')
            .in('level_id', classCourseLevelIds)
            .eq('status', 'active');
          classTopics = classTopicsData || [];
        }

        const totalClassLessons = classTopics.length;

        // Calculate completed lessons for this class
        const { data: classQuizzes } = await this.supabase
          .from('quizzes')
          .select('id, topic_id')
          .in('topic_id', classTopics.map((t: any) => t.id))
          .eq('status', 'active');

        const classQuizIds = (classQuizzes || []).map((q: any) => q.id);
        let completedClassLessons = 0;
        if (classStudentIds.length > 0 && classQuizIds.length > 0) {
          const { data: classBestScores } = await this.supabase
            .from('student_quiz_best_scores')
            .select('quiz_id')
            .in('student_id', classStudentIds)
            .in('quiz_id', classQuizIds);
          
          const completedClassTopics = new Set();
          (classBestScores || []).forEach((score: any) => {
            const quiz = (classQuizzes || []).find((q: any) => q.id === score.quiz_id);
            if (quiz) {
              completedClassTopics.add(quiz.topic_id);
            }
          });
          completedClassLessons = completedClassTopics.size;
        }

        // Calculate average performance for this class
        let avgPerformance = 0;
        if (classStudentIds.length > 0 && classQuizIds.length > 0) {
          const { data: classScores } = await this.supabase
            .from('student_quiz_best_scores')
            .select('best_percentage')
            .in('student_id', classStudentIds)
            .in('quiz_id', classQuizIds);
          
          if (classScores && classScores.length > 0) {
            const total = classScores.reduce((sum: number, s: any) => sum + (s.best_percentage || 0), 0);
            avgPerformance = total / classScores.length;
          }
        }

        return {
          class_id: classData.id,
          class_name: classData.name,
          enrollments: classEnrollments,
          completed_lessons: completedClassLessons,
          total_lessons: totalClassLessons,
          average_performance: Math.round(avgPerformance * 100) / 100,
        };
      })
    );

    // Calculate student performance distribution
    const performanceDistribution = {
      no_attempt: 0,
      below_expectation: 0,
      approaching: 0,
      meeting: 0,
      exceeding: 0,
    };

    if (studentIds.length > 0 && quizIds.length > 0) {
      const { data: studentBestScores } = await this.supabase
        .from('student_quiz_best_scores')
        .select('student_id, best_percentage')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds);

      const studentHighestScores = new Map();
      (studentBestScores || []).forEach((score: any) => {
        const current = studentHighestScores.get(score.student_id) || 0;
        if (score.best_percentage > current) {
          studentHighestScores.set(score.student_id, score.best_percentage);
        }
      });

      studentIds.forEach((studentId: string) => {
        const highestScore = studentHighestScores.get(studentId) || 0;
        if (highestScore === 0) {
          performanceDistribution.no_attempt++;
        } else if (highestScore <= 25) {
          performanceDistribution.below_expectation++;
        } else if (highestScore <= 50) {
          performanceDistribution.approaching++;
        } else if (highestScore <= 75) {
          performanceDistribution.meeting++;
        } else {
          performanceDistribution.exceeding++;
        }
      });
    } else {
      performanceDistribution.no_attempt = totalStudents;
    }

    // Calculate 10 weekly average quiz points (simplified - using last 10 weeks)
    const weeklyTrends: any[] = [];
    const now = new Date();
    for (let i = 9; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7 + 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      // Get quiz attempts in this week
      const { data: weekAttempts } = await this.supabase
        .from('student_quiz_attempts')
        .select('percentage, quiz_id, quiz:quizzes(topic_id, topic:topics(level_id, level:course_levels(course_id, course:courses(id, name))))')
        .in('student_id', studentIds)
        .gte('created_at', weekStart.toISOString())
        .lt('created_at', weekEnd.toISOString())
        .eq('status', 'completed');

      // Group by course and calculate average
      const courseAverages: any = {};
      (weekAttempts || []).forEach((attempt: any) => {
        const quiz = attempt.quiz;
        if (!quiz) return;
        const topic = Array.isArray(quiz.topic) ? quiz.topic[0] : quiz.topic;
        if (!topic) return;
        const level = Array.isArray(topic.level) ? topic.level[0] : topic.level;
        if (!level) return;
        const course = Array.isArray(level.course) ? level.course[0] : level.course;
        if (!course) return;

        if (!courseAverages[course.id]) {
          courseAverages[course.id] = {
            course_name: course.name,
            scores: [],
          };
        }
        courseAverages[course.id].scores.push(attempt.percentage || 0);
      });

      const weekData: any = {
        week: `Week ${10 - i}`,
        courses: Object.keys(courseAverages).map((courseId) => ({
          course_id: courseId,
          course_name: courseAverages[courseId].course_name,
          average_score: courseAverages[courseId].scores.length > 0
            ? Math.round((courseAverages[courseId].scores.reduce((sum: number, s: number) => sum + s, 0) / courseAverages[courseId].scores.length) * 100) / 100
            : 0,
        })),
      };
      weeklyTrends.push(weekData);
    }

    return {
      school: {
        id: school.id,
        name: school.name,
        code: school.code,
      },
      kpis: {
        total_students: totalStudents,
        lessons_completed: completedLessons,
        total_lessons: totalLessons,
        most_enrolled_class: mostEnrolledClass,
        overall_rating: Math.round(overallRating * 100) / 100,
      },
      class_statistics: classStats,
      performance_distribution: performanceDistribution,
      weekly_trends: weeklyTrends,
    };
  }

  /**
   * Performance data for the tutor across ALL schools (all classes they teach).
   * Same response shape as getSchoolPerformanceData for dashboard chart and total students.
   */
  async getTutorAllSchoolsPerformanceData(tutorId: string) {
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select('class_id, class:classes(id, name, level)')
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentsError) throw new BadRequestException(assignmentsError.message);

    const classIds = (assignments || [])
      .map((a: any) => (Array.isArray(a.class) ? a.class[0] : a.class)?.id)
      .filter(Boolean);
    if (classIds.length === 0) {
      return {
        kpis: { total_students: 0, lessons_completed: 0, total_lessons: 0, most_enrolled_class: null, overall_rating: 0 },
        performance_distribution: { no_attempt: 0, below_expectation: 0, approaching: 0, meeting: 0, exceeding: 0 },
        weekly_trends: [],
      };
    }

    const { data: students } = await this.supabase
      .from('students')
      .select('id, class_id')
      .in('class_id', classIds)
      .eq('status', 'active');
    const totalStudents = students?.length || 0;
    const studentIds = (students || []).map((s: any) => s.id);

    const { data: courseLevelAssignments } = await this.supabase
      .from('class_course_level_assignments')
      .select('course_level_id')
      .in('class_id', classIds)
      .eq('enrollment_status', 'enrolled');
    const courseLevelIds = [...new Set((courseLevelAssignments || []).map((a: any) => a.course_level_id))];

    let topics: any[] = [];
    if (courseLevelIds.length > 0) {
      const { data: topicsData } = await this.supabase
        .from('topics')
        .select('id')
        .in('level_id', courseLevelIds)
        .eq('status', 'active');
      topics = topicsData || [];
    }
    const totalLessons = topics.length;

    const { data: quizzes } = await this.supabase
      .from('quizzes')
      .select('id, topic_id')
      .in('topic_id', topics.map((t: any) => t.id))
      .eq('status', 'active');
    const quizIds = (quizzes || []).map((q: any) => q.id);

    let completedLessons = 0;
    if (studentIds.length > 0 && quizIds.length > 0) {
      const { data: bestScores } = await this.supabase
        .from('student_quiz_best_scores')
        .select('quiz_id')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds);
      const completedTopics = new Set();
      (bestScores || []).forEach((score: any) => {
        const quiz = (quizzes || []).find((q: any) => q.id === score.quiz_id);
        if (quiz) completedTopics.add(quiz.topic_id);
      });
      completedLessons = completedTopics.size;
    }

    let overallRating = 0;
    if (studentIds.length > 0 && quizIds.length > 0) {
      const { data: allBestScores } = await this.supabase
        .from('student_quiz_best_scores')
        .select('best_percentage')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds);
      if (allBestScores && allBestScores.length > 0) {
        const totalPct = allBestScores.reduce((sum: number, s: any) => sum + (s.best_percentage || 0), 0);
        overallRating = totalPct / allBestScores.length;
      }
    }

    const performanceDistribution = {
      no_attempt: 0,
      below_expectation: 0,
      approaching: 0,
      meeting: 0,
      exceeding: 0,
    };
    if (studentIds.length > 0 && quizIds.length > 0) {
      const { data: studentBestScores } = await this.supabase
        .from('student_quiz_best_scores')
        .select('student_id, best_percentage')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds);
      const studentHighestScores = new Map();
      (studentBestScores || []).forEach((score: any) => {
        const current = studentHighestScores.get(score.student_id) || 0;
        if (score.best_percentage > current) studentHighestScores.set(score.student_id, score.best_percentage);
      });
      studentIds.forEach((id: string) => {
        const highest = studentHighestScores.get(id) || 0;
        if (highest === 0) performanceDistribution.no_attempt++;
        else if (highest <= 25) performanceDistribution.below_expectation++;
        else if (highest <= 50) performanceDistribution.approaching++;
        else if (highest <= 75) performanceDistribution.meeting++;
        else performanceDistribution.exceeding++;
      });
    } else {
      performanceDistribution.no_attempt = totalStudents;
    }

    return {
      kpis: {
        total_students: totalStudents,
        lessons_completed: completedLessons,
        total_lessons: totalLessons,
        most_enrolled_class: null,
        overall_rating: Math.round(overallRating * 100) / 100,
      },
      performance_distribution: performanceDistribution,
      weekly_trends: [],
    };
  }

  async getTutorStudents(tutorId: string, filters?: { school_id?: string; class_id?: string; name?: string }) {
    // Get all classes assigned to this tutor
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        class_id,
        class:classes(
          id,
          name,
          level,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentsError) {
      throw new BadRequestException(assignmentsError.message);
    }

    if (!assignments || assignments.length === 0) {
      return [];
    }

    // Extract class IDs
    const classIds = assignments.map((a: any) => {
      const classData = Array.isArray(a.class) ? a.class[0] : a.class;
      return classData.id;
    });

    // Build query for students
    let studentQuery = this.supabase
      .from('students')
      .select(`
        id,
        username,
        first_name,
        last_name,
        email,
        profile_image_url,
        last_login,
        login_count,
        status,
        class_id,
        school_id,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .in('class_id', classIds)
      .eq('status', 'active');

    // Apply filters
    if (filters?.school_id) {
      studentQuery = studentQuery.eq('school_id', filters.school_id);
    }
    if (filters?.class_id) {
      studentQuery = studentQuery.eq('class_id', filters.class_id);
    }
    if (filters?.name) {
      studentQuery = studentQuery.or(`first_name.ilike.%${filters.name}%,last_name.ilike.%${filters.name}%,username.ilike.%${filters.name}%`);
    }

    const { data: students, error: studentsError } = await studentQuery.order('first_name');

    if (studentsError) {
      throw new BadRequestException(studentsError.message);
    }

    // Get quiz progress for all students
    const studentIds = (students || []).map((s: any) => s.id);
    let quizProgress: any[] = [];
    if (studentIds.length > 0) {
      const { data: progressData } = await this.supabase
        .from('student_total_points')
        .select('student_id, total_points, quizzes_completed, average_score')
        .in('student_id', studentIds);
      quizProgress = progressData || [];
    }

    // Create a map of student_id -> quiz progress
    const progressMap = new Map();
    quizProgress.forEach((progress: any) => {
      progressMap.set(progress.student_id, {
        total_points: progress.total_points || 0,
        quizzes_completed: progress.quizzes_completed || 0,
        average_score: progress.average_score || 0,
      });
    });

    // Combine student data with quiz progress
    const studentsWithProgress = (students || []).map((student: any) => {
      const progress = progressMap.get(student.id) || {
        total_points: 0,
        quizzes_completed: 0,
        average_score: 0,
      };

      const classData = Array.isArray(student.class) ? student.class[0] : student.class;
      const schoolData = Array.isArray(student.school) ? student.school[0] : student.school;

      return {
        id: student.id,
        username: student.username,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
        profile_image_url: student.profile_image_url,
        last_login: student.last_login,
        login_count: student.login_count || 0,
        status: student.status,
        class: classData ? {
          id: classData.id,
          name: classData.name,
          level: classData.level,
        } : null,
        school: schoolData ? {
          id: schoolData.id,
          name: schoolData.name,
          code: schoolData.code,
        } : null,
        quiz_progress: progress,
      };
    });

    return studentsWithProgress;
  }

  /**
   * Returns up to 5 students (in tutor's classes) who have at least one quiz attempt
   * with score_category = 'exceeding' in student_quiz_attempts. Same response shape as getTutorStudents.
   */
  async getTutorStudentsExceeding(tutorId: string) {
    const allStudents = await this.getTutorStudents(tutorId);
    const studentIds = (allStudents || []).map((s: any) => s.id);
    if (studentIds.length === 0) return [];

    const { data: exceedingAttempts } = await this.supabase
      .from('student_quiz_attempts')
      .select('student_id')
      .in('student_id', studentIds)
      .eq('score_category', 'exceeding')
      .eq('status', 'completed');

    const countByStudent = new Map<string, number>();
    (exceedingAttempts || []).forEach((row: any) => {
      countByStudent.set(row.student_id, (countByStudent.get(row.student_id) || 0) + 1);
    });
    const sortedStudentIds = Array.from(countByStudent.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, 5);

    const set = new Set(sortedStudentIds);
    return (allStudents || []).filter((s: any) => set.has(s.id));
  }

  async getStudentExamData(studentId: string) {
    // Get student's class
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found');
    }

    // Get course levels assigned to the student's class
    const { data: courseLevelAssignments, error: assignmentError } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        id,
        course_level_id,
        enrollment_status,
        course_level:course_levels(
          id,
          name,
          level_number,
          course:courses(id, name, code)
        )
      `)
      .eq('class_id', student.class_id)
      .eq('enrollment_status', 'enrolled')
      .order('created_at', { ascending: true });

    if (assignmentError) {
      throw new BadRequestException(assignmentError.message);
    }

    // Get all topics for these course levels
    const courseLevelIds = (courseLevelAssignments || []).map((a: any) => {
      const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
      return level.id;
    });

    let topics: any[] = [];
    if (courseLevelIds.length > 0) {
      const { data: topicsData, error: topicsError } = await this.supabase
        .from('topics')
        .select(`
          id,
          name,
          order_index,
          level_id,
          level:course_levels(
            id,
            name,
            level_number,
            course:courses(id, name)
          )
        `)
        .in('level_id', courseLevelIds)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (topicsError) {
        throw new BadRequestException(topicsError.message);
      }
      topics = topicsData || [];
    }

    // Get all quizzes for these topics
    const topicIds = (topics || []).map((t: any) => t.id);
    let quizzes: any[] = [];
    if (topicIds.length > 0) {
      const { data: quizzesData, error: quizzesError } = await this.supabase
        .from('quizzes')
        .select('id, title, topic_id, passing_score, total_points')
        .in('topic_id', topicIds)
        .eq('status', 'active');

      if (quizzesError) {
        throw new BadRequestException(quizzesError.message);
      }
      quizzes = quizzesData || [];
    }

    // Create a map of quiz_id -> quiz (for passing_score lookup)
    const quizMap = new Map();
    quizzes.forEach((quiz: any) => {
      quizMap.set(quiz.id, quiz);
    });

    // Get student's quiz best scores
    const quizIds = (quizzes || []).map((q: any) => q.id);
    let bestScores: any[] = [];
    if (quizIds.length > 0) {
      const { data: scoresData, error: scoresError } = await this.supabase
        .from('student_quiz_best_scores')
        .select('quiz_id, best_percentage, best_score')
        .eq('student_id', studentId)
        .in('quiz_id', quizIds);
      
      if (scoresError) {
        throw new BadRequestException(scoresError.message);
      }
      bestScores = scoresData || [];
    }

    const pctToCategory = (pct: number): string => {
      if (pct == null || Number.isNaN(pct)) return 'below_expectation';
      if (pct <= 25) return 'below_expectation';
      if (pct <= 50) return 'approaching';
      if (pct <= 75) return 'meeting';
      return 'exceeding';
    };

    // Create a map of quiz_id -> best score (calculate passed based on passing_score)
    const scoreMap = new Map();
    bestScores.forEach((score: any) => {
      const quiz = quizMap.get(score.quiz_id);
      const passingScore = quiz?.passing_score || 0;
      const pct = score.best_percentage || 0;
      const passed = pct >= passingScore;
      scoreMap.set(score.quiz_id, {
        percentage: pct,
        score: score.best_score || 0,
        passed,
        score_category: pctToCategory(pct),
      });
    });

    // Group topics by course level
    const levelMap = new Map();
    
    (courseLevelAssignments || []).forEach((assignment: any) => {
      const level = Array.isArray(assignment.course_level) ? assignment.course_level[0] : assignment.course_level;
      const course = Array.isArray(level.course) ? level.course[0] : level.course;
      
      if (!levelMap.has(level.id)) {
        levelMap.set(level.id, {
          course_level_id: level.id,
          course_level_name: level.name,
          level_number: level.level_number,
          course_id: course?.id,
          course_name: course?.name || 'Unknown Course',
          topics: [],
        });
      }
    });

    // Add topics to their respective levels
    (topics || []).forEach((topic: any) => {
      const level = Array.isArray(topic.level) ? topic.level[0] : topic.level;
      if (!level || !levelMap.has(level.id)) return;

      // Get quizzes for this topic
      const topicQuizzes = (quizzes || []).filter((q: any) => q.topic_id === topic.id);
      
      // Check if student has completed/passed any quiz for this topic
      let topicCompleted = false;
      let topicPassed = false;
      const quizResults: any[] = [];

      topicQuizzes.forEach((quiz: any) => {
        const score = scoreMap.get(quiz.id);
        if (score) {
          topicCompleted = true;
          if (score.passed) {
            topicPassed = true;
          }
          quizResults.push({
            quiz_id: quiz.id,
            quiz_title: quiz.title,
            percentage: Number(score.percentage),
            score: score.score,
            max_score: quiz.total_points,
            passed: score.passed,
            score_category: score.score_category || pctToCategory(Number(score.percentage)),
          });
        }
      });

      levelMap.get(level.id).topics.push({
        topic_id: topic.id,
        topic_name: topic.name,
        order_index: topic.order_index,
        completed: topicCompleted,
        passed: topicPassed,
        quiz_results: quizResults,
      });
    });

    return Array.from(levelMap.values());
  }

  async getTutorPerformanceData(
    tutorId: string,
    filters?: { school_id?: string; class_id?: string; course_level_id?: string; name?: string }
  ) {
    // Get all classes assigned to this tutor
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        class_id,
        class:classes(
          id,
          name,
          level,
          school_id,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentsError) {
      throw new BadRequestException(assignmentsError.message);
    }

    if (!assignments || assignments.length === 0) {
      return [];
    }

    // Extract class IDs
    const classIds = assignments.map((a: any) => {
      const classData = Array.isArray(a.class) ? a.class[0] : a.class;
      return classData.id;
    });

    // Build query for students
    let studentQuery = this.supabase
      .from('students')
      .select(`
        id,
        username,
        first_name,
        last_name,
        class_id,
        school_id,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .in('class_id', classIds)
      .eq('status', 'active');

    // Apply filters
    if (filters?.school_id) {
      studentQuery = studentQuery.eq('school_id', filters.school_id);
    }
    if (filters?.class_id) {
      studentQuery = studentQuery.eq('class_id', filters.class_id);
    }
    if (filters?.name) {
      studentQuery = studentQuery.or(`first_name.ilike.%${filters.name}%,last_name.ilike.%${filters.name}%,username.ilike.%${filters.name}%`);
    }

    const { data: students, error: studentsError } = await studentQuery.order('first_name');

    if (studentsError) {
      throw new BadRequestException(studentsError.message);
    }

    // Get course levels assigned to these classes
    const { data: courseLevelAssignments, error: assignmentError } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        class_id,
        course_level_id,
        enrollment_status,
        course_level:course_levels(
          id,
          name,
          level_number,
          course:courses(id, name)
        )
      `)
      .in('class_id', classIds)
      .eq('enrollment_status', 'enrolled');

    if (assignmentError) {
      throw new BadRequestException(assignmentError.message);
    }

    // Filter by course_level_id if provided
    let filteredAssignments = courseLevelAssignments || [];
    if (filters?.course_level_id) {
      filteredAssignments = filteredAssignments.filter((a: any) => {
        const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
        return level.id === filters.course_level_id;
      });
    }

    // Get all topics for these course levels
    const courseLevelIds = filteredAssignments.map((a: any) => {
      const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
      return level.id;
    });

    let topics: any[] = [];
    if (courseLevelIds.length > 0) {
      const { data: topicsData, error: topicsError } = await this.supabase
        .from('topics')
        .select(`
          id,
          name,
          order_index,
          level_id,
          level:course_levels(
            id,
            name,
            course:courses(id, name)
          )
        `)
        .in('level_id', courseLevelIds)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      if (topicsError) {
        throw new BadRequestException(topicsError.message);
      }
      topics = topicsData || [];
    }

    // Get all quizzes for these topics
    const topicIds = (topics || []).map((t: any) => t.id);
    let quizzes: any[] = [];
    if (topicIds.length > 0) {
      const { data: quizzesData, error: quizzesError } = await this.supabase
        .from('quizzes')
        .select('id, title, topic_id, passing_score, total_points')
        .in('topic_id', topicIds)
        .eq('status', 'active');

      if (quizzesError) {
        throw new BadRequestException(quizzesError.message);
      }
      quizzes = quizzesData || [];
    }

    const studentIds = (students || []).map((s: any) => s.id);

    // Include quizzes that any of these students have attempted (so we don't miss data)
    if (studentIds.length > 0) {
      const { data: attemptedQuizRows } = await this.supabase
        .from('student_quiz_attempts')
        .select('quiz_id')
        .in('student_id', studentIds)
        .eq('status', 'completed');
      const attemptedQuizIds = [...new Set((attemptedQuizRows || []).map((r: any) => r.quiz_id).filter(Boolean))];
      const existingQuizIds = new Set(quizzes.map((q: any) => q.id));
      const missingQuizIds = attemptedQuizIds.filter((id) => !existingQuizIds.has(id));
      if (missingQuizIds.length > 0) {
        const { data: extraQuizzes } = await this.supabase
          .from('quizzes')
          .select('id, title, topic_id, passing_score, total_points')
          .in('id', missingQuizIds)
          .eq('status', 'active');
        const extraTopicIds = [...new Set((extraQuizzes || []).map((q: any) => q.topic_id).filter(Boolean))];
        const existingTopicIds = new Set((topics || []).map((t: any) => t.id));
        const needTopicIds = extraTopicIds.filter((id) => !existingTopicIds.has(id));
        if (needTopicIds.length > 0) {
          const { data: extraTopics } = await this.supabase
            .from('topics')
            .select('id, name, order_index, level_id')
            .in('id', needTopicIds)
            .eq('status', 'active');
          if (extraTopics?.length) {
            topics = [...(topics || []), ...extraTopics];
          }
        }
        if (extraQuizzes?.length) {
          quizzes = [...quizzes, ...extraQuizzes];
        }
      }
    }

    const quizIds = quizzes.map((q: any) => q.id);
    const scoreMap = new Map<string, { best_score: number; percentage: number; score_category: string | null }>();
    if (studentIds.length > 0 && quizIds.length > 0) {
      // Fetch score_category from student_quiz_attempts (050_add_cbc_grade...)
      const { data: attemptsData, error: attemptsError } = await this.supabase
        .from('student_quiz_attempts')
        .select('student_id, quiz_id, score, percentage, score_category')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds)
        .eq('status', 'completed');

      if (attemptsError) {
        throw new BadRequestException(attemptsError.message);
      }
      const cbcGradeFromPct = (pct: number): string | null => {
        if (pct == null || Number.isNaN(pct)) return null;
        if (pct <= 25) return 'below_expectation';
        if (pct <= 50) return 'approaching';
        if (pct <= 75) return 'meeting';
        return 'exceeding';
      };
      const attempts = attemptsData || [];
      attempts.forEach((a: any) => {
        const key = `${a.student_id}_${a.quiz_id}`;
        const existing = scoreMap.get(key);
        const pct = Number(a.percentage ?? 0);
        const score = Number(a.score ?? 0);
        const category = a.score_category ?? cbcGradeFromPct(pct);
        if (!existing || pct > existing.percentage) {
          scoreMap.set(key, {
            best_score: score,
            percentage: pct,
            score_category: category,
          });
        }
      });
    }

    const cbcGradeFromPct = (pct: number): string | null => {
      if (pct == null || Number.isNaN(pct)) return null;
      if (pct <= 25) return 'below_expectation';
      if (pct <= 50) return 'approaching';
      if (pct <= 75) return 'meeting';
      return 'exceeding';
    };
    const overallByStudent = new Map<string, { average_percentage: number; score_category: string | null }>();
    (students || []).forEach((s: any) => {
      const percentages: number[] = [];
      scoreMap.forEach((val, key) => {
        if (key.startsWith(`${s.id}_`)) percentages.push(val.percentage);
      });
      const avg = percentages.length > 0 ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0;
      overallByStudent.set(s.id, {
        average_percentage: Math.round(avg * 100) / 100,
        score_category: percentages.length > 0 ? cbcGradeFromPct(avg) : null,
      });
    });

    const quizMap = new Map();
    quizzes.forEach((quiz: any) => {
      quizMap.set(quiz.id, quiz);
    });

    const result: any[] = [];
    const studentMap = new Map();

    (students || []).forEach((student: any) => {
      const classData = Array.isArray(student.class) ? student.class[0] : student.class;
      const schoolData = Array.isArray(student.school) ? student.school[0] : student.school;

      const studentKey = `${student.school_id}_${student.class_id}`;
      if (!studentMap.has(studentKey)) {
        studentMap.set(studentKey, {
          school: schoolData ? {
            id: schoolData.id,
            name: schoolData.name,
            code: schoolData.code,
          } : null,
          class: classData ? {
            id: classData.id,
            name: classData.name,
            level: classData.level,
          } : null,
          students: [],
        });
      }

      const studentClassId = student.class_id;
      const studentCourseLevels = filteredAssignments
        .filter((a: any) => {
          const c = Array.isArray(a.class) ? a.class[0] : a.class;
          return c?.id === studentClassId;
        })
        .map((a: any) => {
          const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
          return level?.id;
        })
        .filter(Boolean);

      // Include topics from enrolled levels + topics where this student has an attempt
      const studentTopics = (topics || []).filter((t: any) => {
        const level = Array.isArray(t.level) ? t.level[0] : t.level;
        const levelId = level?.id ?? t.level_id;
        if (studentCourseLevels.includes(levelId)) return true;
        const hasAttempt = quizzes.some((q: any) => q.topic_id === t.id && scoreMap.get(`${student.id}_${q.id}`));
        return !!hasAttempt;
      });

      // Build topic results
      const topicResults: any[] = [];
      studentTopics.forEach((topic: any) => {
        const topicQuizzes = quizzes.filter((q: any) => q.topic_id === topic.id);
        const quizResults: any[] = [];

        topicQuizzes.forEach((quiz: any) => {
          const scoreKey = `${student.id}_${quiz.id}`;
          const score = scoreMap.get(scoreKey);
          if (score) {
            const percentage = score.percentage;
            const passed = percentage >= (quiz.passing_score || 0);
            quizResults.push({
              student_id: student.id,
              topic_id: topic.id,
              quiz_id: quiz.id,
              passed: passed,
              percentage: percentage,
              category: score.score_category,
            });
          } else {
            quizResults.push({
              student_id: student.id,
              topic_id: topic.id,
              quiz_id: quiz.id,
              passed: false,
              percentage: 0,
              category: null,
            });
          }
        });

        topicResults.push({
          topic_id: topic.id,
          topic_name: topic.name,
          quizzes: quizResults,
        });
      });

      studentMap.get(studentKey).students.push({
        id: student.id,
        username: student.username,
        first_name: student.first_name,
        last_name: student.last_name,
        topics: topicResults,
        overall_average_percentage: (overallByStudent.get(student.id) ?? {}).average_percentage ?? 0,
        overall_score_category: (overallByStudent.get(student.id) ?? {}).score_category ?? null,
      });
    });

    return Array.from(studentMap.values());
  }

  /**
   * Class performance data for admin report (same structure as getTutorPerformanceData).
   * Returns one class group with students and their topic/quiz results (score_category from student_quiz_attempts).
   */
  async getClassPerformanceData(classId: string) {
    const { data: classRow, error: classError } = await this.supabase
      .from('classes')
      .select('id, name, level, school_id, school:schools(id, name, code)')
      .eq('id', classId)
      .single();
    if (classError || !classRow) {
      throw new BadRequestException('Class not found');
    }
    const schoolData = Array.isArray((classRow as any).school) ? (classRow as any).school[0] : (classRow as any).school;
    const students = await this.supabase
      .from('students')
      .select('id, username, first_name, last_name, class_id, school_id')
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('first_name');
    const studentsData = students.data || [];
    const { data: courseLevelAssignments } = await this.supabase
      .from('class_course_level_assignments')
      .select('course_level:course_levels(id, name, level_number, course:courses(id, name))')
      .eq('class_id', classId)
      .eq('enrollment_status', 'enrolled');
    const courseLevelIds = (courseLevelAssignments || []).map((a: any) => {
      const level = Array.isArray(a.course_level) ? a.course_level[0] : a.course_level;
      return level?.id;
    }).filter(Boolean);
    let topics: any[] = [];
    if (courseLevelIds.length > 0) {
      const { data: topicsData } = await this.supabase
        .from('topics')
        .select('id, name, order_index, level_id')
        .in('level_id', courseLevelIds)
        .eq('status', 'active')
        .order('order_index', { ascending: true });
      topics = topicsData || [];
    }
    const topicIds = topics.map((t: any) => t.id);
    let quizzes: any[] = [];
    if (topicIds.length > 0) {
      const { data: quizzesData } = await this.supabase
        .from('quizzes')
        .select('id, title, topic_id, passing_score, total_points')
        .in('topic_id', topicIds)
        .eq('status', 'active');
      quizzes = quizzesData || [];
    }
    const studentIds = studentsData.map((s: any) => s.id);

    // Include quizzes that students in this class have attempted (so we don't miss data when attempts
    // are for topics outside the class's enrolled course levels)
    if (studentIds.length > 0) {
      const { data: attemptedQuizRows } = await this.supabase
        .from('student_quiz_attempts')
        .select('quiz_id')
        .in('student_id', studentIds)
        .eq('status', 'completed');
      const attemptedQuizIds = [...new Set((attemptedQuizRows || []).map((r: any) => r.quiz_id).filter(Boolean))];
      const existingQuizIds = new Set(quizzes.map((q: any) => q.id));
      const missingQuizIds = attemptedQuizIds.filter((id) => !existingQuizIds.has(id));
      if (missingQuizIds.length > 0) {
        const { data: extraQuizzes } = await this.supabase
          .from('quizzes')
          .select('id, title, topic_id, passing_score, total_points')
          .in('id', missingQuizIds)
          .eq('status', 'active');
        const extraTopicIds = [...new Set((extraQuizzes || []).map((q: any) => q.topic_id).filter(Boolean))];
        const existingTopicIds = new Set(topics.map((t: any) => t.id));
        const needTopicIds = extraTopicIds.filter((id) => !existingTopicIds.has(id));
        if (needTopicIds.length > 0) {
          const { data: extraTopics } = await this.supabase
            .from('topics')
            .select('id, name, order_index, level_id')
            .in('id', needTopicIds)
            .eq('status', 'active');
          if (extraTopics?.length) {
            topics = [...topics, ...extraTopics].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
          }
        }
        if (extraQuizzes?.length) {
          quizzes = [...quizzes, ...extraQuizzes];
        }
      }
    }

    const quizIds = quizzes.map((q: any) => q.id);
    const scoreMap = new Map<string, { best_score: number; percentage: number; score_category: string | null }>();
    if (studentIds.length > 0 && quizIds.length > 0) {
      // score_category from student_quiz_attempts (migration 050_add_cbc_grade_to_student_quiz_attempts.sql:
      // trigger + student_quiz_attempt_cbc_grade(percentage) → below_expectation|approaching|meeting|exceeding)
      const { data: attemptsData } = await this.supabase
        .from('student_quiz_attempts')
        .select('student_id, quiz_id, score, percentage, score_category')
        .in('student_id', studentIds)
        .in('quiz_id', quizIds)
        .eq('status', 'completed');
      const cbcGradeFromPct = (pct: number): string | null => {
        if (pct == null || Number.isNaN(pct)) return null;
        if (pct <= 25) return 'below_expectation';
        if (pct <= 50) return 'approaching';
        if (pct <= 75) return 'meeting';
        return 'exceeding';
      };
      (attemptsData || []).forEach((a: any) => {
        const key = `${a.student_id}_${a.quiz_id}`;
        const existing = scoreMap.get(key);
        const pct = Number(a.percentage ?? 0);
        const score = Number(a.score ?? 0);
        const category = a.score_category ?? cbcGradeFromPct(pct);
        if (!existing || pct > existing.percentage) {
          scoreMap.set(key, {
            best_score: score,
            percentage: pct,
            score_category: category,
          });
        }
      });
    }
    const topicResultsByStudent = new Map<string, any[]>();
    studentsData.forEach((student: any) => {
      // Use all topics (enrolled + any with attempts by class students) so we show every attempt
      const studentTopics = topics;
      const topicResults: any[] = [];
      studentTopics.forEach((topic: any) => {
        const topicQuizzes = quizzes.filter((q: any) => q.topic_id === topic.id);
        const quizResults: any[] = [];
        topicQuizzes.forEach((quiz: any) => {
          const scoreKey = `${student.id}_${quiz.id}`;
          const score = scoreMap.get(scoreKey);
          if (score) {
            quizResults.push({
              student_id: student.id,
              topic_id: topic.id,
              quiz_id: quiz.id,
              passed: score.percentage >= (quiz.passing_score || 0),
              percentage: score.percentage,
              category: score.score_category,
            });
          } else {
            quizResults.push({
              student_id: student.id,
              topic_id: topic.id,
              quiz_id: quiz.id,
              passed: false,
              percentage: 0,
              category: null,
            });
          }
        });
        topicResults.push({ topic_id: topic.id, topic_name: topic.name, quizzes: quizResults });
      });
      topicResultsByStudent.set(student.id, topicResults);
    });

    const cbcGradeFromPct = (pct: number): string | null => {
      if (pct == null || Number.isNaN(pct)) return null;
      if (pct <= 25) return 'below_expectation';
      if (pct <= 50) return 'approaching';
      if (pct <= 75) return 'meeting';
      return 'exceeding';
    };
    const overallByStudent = new Map<string, { average_percentage: number; score_category: string | null }>();
    studentsData.forEach((s: any) => {
      const percentages: number[] = [];
      scoreMap.forEach((val, key) => {
        if (key.startsWith(`${s.id}_`)) percentages.push(val.percentage);
      });
      const average_percentage = percentages.length > 0
        ? percentages.reduce((a, b) => a + b, 0) / percentages.length
        : 0;
      overallByStudent.set(s.id, {
        average_percentage: Math.round(average_percentage * 100) / 100,
        score_category: percentages.length > 0 ? cbcGradeFromPct(average_percentage) : null,
      });
    });

    return [{
      school: schoolData ? { id: schoolData.id, name: schoolData.name, code: schoolData.code } : null,
      class: { id: classRow.id, name: classRow.name, level: classRow.level },
      students: studentsData.map((s: any) => {
        const overall = overallByStudent.get(s.id);
        return {
          id: s.id,
          username: s.username,
          first_name: s.first_name,
          last_name: s.last_name,
          topics: topicResultsByStudent.get(s.id) || [],
          overall_average_percentage: overall?.average_percentage ?? 0,
          overall_score_category: overall?.score_category ?? null,
        };
      }),
    }];
  }

  async getAssignmentsByClass(classId: string): Promise<TutorAssignment[]> {
    const { data, error } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email, phone, level),
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('role');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  async getAllAssignments(): Promise<TutorAssignment[]> {
    const { data, error } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email, phone, level),
        class:classes(id, name, level, school:schools(id, name, code))
      `)
      .eq('status', 'active')
      .order('assigned_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  // ==================== ALLOCATION OVERVIEW ====================

  async getAllocations(): Promise<AllocationDetail[]> {
    // Get all classes with their schools
    const { data: classes, error: classError } = await this.supabase
      .from('classes')
      .select(`
        id, name, level, status,
        school:schools(id, name, code)
      `)
      .eq('status', 'active')
      .order('name');

    if (classError) {
      throw new BadRequestException(classError.message);
    }

    // Get all schedules
    const { data: schedules } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('status', 'active');

    // Get all assignments with tutors
    const { data: assignments } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email, phone, level)
      `)
      .eq('status', 'active');

    // Get student counts
    const { data: studentCounts } = await this.supabase
      .from('students')
      .select('class_id')
      .eq('status', 'active');

    // Get all course level assignments
    const { data: courseLevelAssignments } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        id,
        class_id,
        course_level_id,
        enrollment_status,
        assigned_at,
        completed_at,
        created_at,
        updated_at,
        course_level:course_levels(
          id,
          course_id,
          level_number,
          name,
          course:courses(id, name, code)
        )
      `);

    // Build allocation details
    const allocations: AllocationDetail[] = (classes || []).map(cls => {
      const classSchedules = schedules?.filter(s => s.class_id === cls.id) || [];
      const classAssignments = assignments?.filter(a => a.class_id === cls.id) || [];
      const studentCount = studentCounts?.filter(s => s.class_id === cls.id).length || 0;
      const classCourseLevels = (courseLevelAssignments || [])
        .filter((cla: any) => cla.class_id === cls.id)
        .map((item: any) => {
          const courseLevel = Array.isArray(item.course_level) ? item.course_level[0] : item.course_level;
          const course = courseLevel?.course ? (Array.isArray(courseLevel.course) ? courseLevel.course[0] : courseLevel.course) : null;
          
          return {
            id: item.id,
            class_id: item.class_id,
            course_level_id: item.course_level_id,
            enrollment_status: item.enrollment_status,
            assigned_at: item.assigned_at,
            completed_at: item.completed_at,
            created_at: item.created_at,
            updated_at: item.updated_at,
            course_level: courseLevel ? {
              id: courseLevel.id,
              course_id: courseLevel.course_id,
              level_number: courseLevel.level_number,
              name: courseLevel.name,
              course: course,
            } : null,
          };
        });

      return {
        class: {
          id: cls.id,
          name: cls.name,
          level: cls.level,
          school: cls.school as any,
        },
        schedule: classSchedules[0] || null,
        lead_tutor: classAssignments.find(a => a.role === 'lead') || null,
        assistant_tutor: classAssignments.find(a => a.role === 'assistant') || null,
        course_levels: classCourseLevels,
        student_count: studentCount,
      };
    });

    return allocations;
  }

  async getAllocationByClass(classId: string): Promise<AllocationDetail> {
    // Get class with school
    const { data: cls, error: classError } = await this.supabase
      .from('classes')
      .select(`
        id, name, level, status,
        school:schools(id, name, code)
      `)
      .eq('id', classId)
      .single();

    if (classError || !cls) {
      throw new NotFoundException('Class not found');
    }

    // Get schedule
    const { data: schedules } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('class_id', classId)
      .eq('status', 'active');

    // Get assignments
    const { data: assignments } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email, phone, level)
      `)
      .eq('class_id', classId)
      .eq('status', 'active');

    // Get student count
    const { count: studentCount } = await this.supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'active');

    // Get course level assignments
    const { data: courseLevelsData, error: courseLevelsError } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        id,
        class_id,
        course_level_id,
        enrollment_status,
        assigned_at,
        completed_at,
        created_at,
        updated_at,
        course_level:course_levels(
          id,
          course_id,
          level_number,
          name,
          course:courses(id, name, code)
        )
      `)
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    // Transform the data to ensure proper structure (Supabase may return arrays for relationships)
    const courseLevels = courseLevelsData ? courseLevelsData.map((item: any) => {
      const courseLevel = Array.isArray(item.course_level) ? item.course_level[0] : item.course_level;
      const course = courseLevel?.course ? (Array.isArray(courseLevel.course) ? courseLevel.course[0] : courseLevel.course) : null;
      
      return {
        id: item.id,
        class_id: item.class_id,
        course_level_id: item.course_level_id,
        enrollment_status: item.enrollment_status,
        assigned_at: item.assigned_at,
        completed_at: item.completed_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
        course_level: courseLevel ? {
          id: courseLevel.id,
          course_id: courseLevel.course_id,
          level_number: courseLevel.level_number,
          name: courseLevel.name,
          course: course,
        } : null,
      };
    }) : [];

    return {
      class: {
        id: cls.id,
        name: cls.name,
        level: cls.level,
        school: cls.school as any,
      },
      schedule: schedules?.[0] || null,
      lead_tutor: assignments?.find(a => a.role === 'lead') || null,
      assistant_tutor: assignments?.find(a => a.role === 'assistant') || null,
      course_levels: courseLevels,
      student_count: studentCount || 0,
    };
  }

  // ==================== CLASS COURSE LEVEL ASSIGNMENTS ====================

  async assignCourseLevel(dto: AssignCourseLevelDto): Promise<ClassCourseLevelAssignment> {
    // Check if class exists
    const { data: classData, error: classError } = await this.supabase
      .from('classes')
      .select('id, status')
      .eq('id', dto.class_id)
      .single();

    if (classError || !classData) {
      throw new NotFoundException('Class not found');
    }

    // Check if course level exists
    const { data: levelData, error: levelError } = await this.supabase
      .from('course_levels')
      .select('id, course_id, level_number, name')
      .eq('id', dto.course_level_id)
      .single();

    if (levelError || !levelData) {
      throw new NotFoundException('Course level not found');
    }

    // Check if assignment already exists (use maybeSingle to avoid error if not found)
    const { data: existing, error: checkError } = await this.supabase
      .from('class_course_level_assignments')
      .select('id')
      .eq('class_id', dto.class_id)
      .eq('course_level_id', dto.course_level_id)
      .maybeSingle();

    if (existing && !checkError) {
      // Update existing assignment
      const { data, error } = await this.supabase
        .from('class_course_level_assignments')
        .update({
          enrollment_status: dto.enrollment_status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(`
          *,
          course_level:course_levels(
            id,
            course_id,
            level_number,
            name,
            course:courses(id, name, code)
          ),
          class:classes(id, name, level)
        `)
        .single();

      if (error) {
        throw new BadRequestException('Failed to update course level assignment');
      }

      return data;
    } else {
      // Create new assignment
      const { data, error } = await this.supabase
        .from('class_course_level_assignments')
        .insert({
          class_id: dto.class_id,
          course_level_id: dto.course_level_id,
          enrollment_status: dto.enrollment_status,
        })
        .select(`
          *,
          course_level:course_levels(
            id,
            course_id,
            level_number,
            name,
            course:courses(id, name, code)
          ),
          class:classes(id, name, level)
        `)
        .single();

      if (error) {
        if (error.code === '23505') {
          // If unique constraint violation, try to update instead
          const { data: existingAssignment } = await this.supabase
            .from('class_course_level_assignments')
            .select('id')
            .eq('class_id', dto.class_id)
            .eq('course_level_id', dto.course_level_id)
            .single();

          if (existingAssignment) {
            const { data: updated, error: updateError } = await this.supabase
              .from('class_course_level_assignments')
              .update({
                enrollment_status: dto.enrollment_status,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingAssignment.id)
              .select(`
                *,
                course_level:course_levels(
                  id,
                  course_id,
                  level_number,
                  name,
                  course:courses(id, name, code)
                ),
                class:classes(id, name, level)
              `)
              .single();

            if (updateError) {
              throw new BadRequestException('Failed to update course level assignment');
            }

            return updated;
          }
        }
        throw new BadRequestException('Failed to assign course level');
      }

      return data;
    }
  }

  async updateCourseLevelStatus(
    assignmentId: string,
    dto: UpdateCourseLevelStatusDto,
  ): Promise<ClassCourseLevelAssignment> {
    const { data, error } = await this.supabase
      .from('class_course_level_assignments')
      .update({
        enrollment_status: dto.enrollment_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .select(`
        *,
        course_level:course_levels(
          id,
          course_id,
          level_number,
          name,
          course:courses(id, name, code)
        ),
        class:classes(id, name, level)
      `)
      .single();

    if (error || !data) {
      throw new NotFoundException('Course level assignment not found');
    }

    return data;
  }

  async getClassCourseLevels(classId: string): Promise<ClassCourseLevelAssignment[]> {
    const { data, error } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        *,
        course_level:course_levels(
          id,
          course_id,
          level_number,
          name,
          course:courses(id, name, code)
        ),
        class:classes(id, name, level)
      `)
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new NotFoundException('Failed to fetch course level assignments');
    }

    return data || [];
  }

  async deleteCourseLevelAssignment(assignmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('class_course_level_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      throw new NotFoundException('Course level assignment not found');
    }
  }

  // ==================== COURSE EDITOR ASSIGNMENTS ====================

  async assignCourseEditor(dto: AssignCourseEditorDto): Promise<CourseEditorAssignment> {
    // Check if course exists
    const { data: courseData, error: courseError } = await this.supabase
      .from('courses')
      .select('id')
      .eq('id', dto.course_id)
      .single();

    if (courseError || !courseData) {
      throw new NotFoundException('Course not found');
    }

    // Validate URL format
    try {
      new URL(dto.editor_link);
    } catch {
      throw new BadRequestException('Invalid editor link URL format');
    }

    // Check if assignment already exists
    const { data: existing } = await this.supabase
      .from('course_editor_assignments')
      .select('id')
      .eq('course_id', dto.course_id)
      .maybeSingle();

    if (existing) {
      // Update existing assignment
      const { data, error } = await this.supabase
        .from('course_editor_assignments')
        .update({
          editor_type: dto.editor_type,
          editor_link: dto.editor_link,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(`
          *,
          course:courses(id, name, code)
        `)
        .single();

      if (error) {
        throw new BadRequestException('Failed to update course editor assignment');
      }

      return data;
    } else {
      // Create new assignment
      const { data, error } = await this.supabase
        .from('course_editor_assignments')
        .insert({
          course_id: dto.course_id,
          editor_type: dto.editor_type,
          editor_link: dto.editor_link,
        })
        .select(`
          *,
          course:courses(id, name, code)
        `)
        .single();

      if (error) {
        throw new BadRequestException('Failed to create course editor assignment');
      }

      return data;
    }
  }

  async updateCourseEditor(
    assignmentId: string,
    dto: UpdateCourseEditorDto,
  ): Promise<CourseEditorAssignment> {
    // Validate URL format if provided
    if (dto.editor_link) {
      try {
        new URL(dto.editor_link);
      } catch {
        throw new BadRequestException('Invalid editor link URL format');
      }
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (dto.editor_type) {
      updateData.editor_type = dto.editor_type;
    }
    if (dto.editor_link) {
      updateData.editor_link = dto.editor_link;
    }

    const { data, error } = await this.supabase
      .from('course_editor_assignments')
      .update(updateData)
      .eq('id', assignmentId)
      .select(`
        *,
        course:courses(id, name, code)
      `)
      .single();

    if (error || !data) {
      throw new NotFoundException('Course editor assignment not found');
    }

    return data;
  }

  async getAllCourseEditorAssignments(): Promise<CourseEditorAssignment[]> {
    const { data, error } = await this.supabase
      .from('course_editor_assignments')
      .select(`
        *,
        course:courses(id, name, code)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to fetch course editor assignments');
    }

    return data || [];
  }

  async deleteCourseEditorAssignment(assignmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('course_editor_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      throw new NotFoundException('Course editor assignment not found');
    }
  }

  // Helper method to convert time string to minutes for comparison
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

