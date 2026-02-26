import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { CreateSchoolDto, UpdateSchoolDto, CreateClassDto, CreateStudentDto } from './dto/school.dto';

@Injectable()
export class SchoolService {
  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
  ) {}

  // =============================================
  // SCHOOL METHODS
  // =============================================

  async createSchool(dto: CreateSchoolDto) {
    // Generate school code if not provided
    let schoolCode = dto.code;
    if (!schoolCode) {
      schoolCode = this.generateSchoolCode(dto.name);
    }

    // Check if code already exists
    const { data: existing } = await this.supabase
      .from('schools')
      .select('id')
      .eq('code', schoolCode)
      .single();

    if (existing) {
      // Append number to make it unique
      let counter = 1;
      let newCode = schoolCode + counter;
      while (true) {
        const { data: check } = await this.supabase
          .from('schools')
          .select('id')
          .eq('code', newCode)
          .single();
        if (!check) {
          schoolCode = newCode;
          break;
        }
        counter++;
        newCode = schoolCode + counter;
      }
    }

    // Generate password
    const plainPassword = this.generatePassword(8);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    // Generate auto email
    const autoEmail = dto.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@cobotkids.edutech';

    const { data, error } = await this.supabase
      .from('schools')
      .insert({
        name: dto.name,
        code: schoolCode,
        logo_url: dto.logo_url,
        email: dto.email,
        location: dto.location,
        phone: dto.phone,
        password_hash: passwordHash,
        plain_password: plainPassword,
      })
      .select()
      .single();

    if (error) {
      throw new ConflictException(error.message);
    }

    return {
      ...data,
      auto_email: autoEmail,
      generated_password: plainPassword,
    };
  }

  async getAllSchools() {
    const { data, error } = await this.supabase
      .from('schools')
      .select(`
        *,
        classes:classes(count),
        students:students(count)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data.map(school => ({
      ...school,
      auto_email: school.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@cobotkids.edutech',
      class_count: school.classes?.[0]?.count || 0,
      student_count: school.students?.[0]?.count || 0,
    }));
  }

  async getSchoolById(id: string) {
    const { data, error } = await this.supabase
      .from('schools')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('School not found');
    }

    return {
      ...data,
      auto_email: data.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@cobotkids.edutech',
    };
  }

  async updateSchool(id: string, dto: UpdateSchoolDto) {
    const { data, error } = await this.supabase
      .from('schools')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async deleteSchool(id: string) {
    const { error } = await this.supabase
      .from('schools')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  }

  // =============================================
  // CLASS METHODS
  // =============================================

  async createClass(dto: CreateClassDto) {
    const { data, error } = await this.supabase
      .from('classes')
      .insert({
        school_id: dto.school_id,
        name: dto.name,
        level: dto.level,
        description: dto.description,
      })
      .select()
      .single();

    if (error) {
      throw new ConflictException(error.message);
    }

    return data;
  }

  private isNetworkError(err: any): boolean {
    const msg = err?.message?.toLowerCase?.() ?? '';
    return msg.includes('fetch failed') || msg.includes('network') || msg.includes('econnrefused') || err?.name === 'TypeError';
  }

  async getClassesBySchool(schoolId: string) {
    let classes: any[];
    try {
    const { data, error } = await this.supabase
      .from('classes')
      .select(`
        *,
        students:students(count)
      `)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (error) {
        if (this.isNetworkError(error)) {
          throw new ServiceUnavailableException('Database temporarily unavailable. Please try again.');
        }
      throw new Error(error.message);
      }
      classes = data ?? [];
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) throw err;
      if (this.isNetworkError(err)) {
        throw new ServiceUnavailableException('Database temporarily unavailable. Please try again.');
      }
      throw err;
    }

    if (!classes || classes.length === 0) {
      return [];
    }

    const classIds = classes.map((c: any) => c.id);

    let schedules: any[] = [];
    let tutorAssignments: any[] = [];
    let courseAssignments: any[] = [];
    let classStudents: any[] = [];
    let attempts: any[] = [];
    let attemptsError: any = null;

    try {
      const [schedRes, tutorRes, courseRes] = await Promise.all([
        this.supabase.from('class_schedules').select('id, class_id, day_of_week, start_time, end_time').in('class_id', classIds).eq('status', 'active'),
        this.supabase.from('tutor_class_assignments').select('class_id, role, tutor:tutors(id, first_name, middle_name, last_name)').in('class_id', classIds).eq('status', 'active'),
        this.supabase.from('class_course_level_assignments').select('class_id, course_level:course_levels(id, name, course:courses(id, name))').in('class_id', classIds).eq('enrollment_status', 'enrolled'),
      ]);
      schedules = schedRes.data ?? [];
      tutorAssignments = tutorRes.data ?? [];
      courseAssignments = courseRes.data ?? [];

      const studentsRes = await this.supabase.from('students').select('id, class_id').in('class_id', classIds).eq('status', 'active');
      classStudents = studentsRes.data ?? [];

      const allStudentIds = classStudents.map((s: any) => s.id);
      if (allStudentIds.length > 0) {
        const attRes = await this.supabase.from('student_quiz_attempts').select('student_id, percentage').in('student_id', allStudentIds).eq('status', 'completed');
        attempts = attRes.data ?? [];
        attemptsError = attRes.error;
      }
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        throw new ServiceUnavailableException('Database temporarily unavailable. Please try again.');
      }
      throw err;
    }

    const schedulesByClass = (schedules || []).reduce((acc: Record<string, any[]>, s: any) => {
      const key = s.class_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
      });
      return acc;
    }, {});

    const tutorsByClass = (tutorAssignments || []).reduce((acc: Record<string, { lead?: any; assistant?: any }>, a: any) => {
      const key = a.class_id;
      if (!acc[key]) acc[key] = {};
      const tutor = Array.isArray(a.tutor) ? a.tutor[0] : a.tutor;
      const name = tutor ? `${tutor.first_name || ''} ${tutor.middle_name || ''} ${tutor.last_name || ''}`.trim() : null;
      if (a.role === 'lead') acc[key].lead = tutor ? { id: tutor.id, name } : null;
      if (a.role === 'assistant') acc[key].assistant = tutor ? { id: tutor.id, name } : null;
      return acc;
    }, {});

    // Per class, take first enrolled course assignment's course name
    const courseByClass = (courseAssignments || []).reduce((acc: Record<string, any>, a: any) => {
      if (acc[a.class_id]) return acc;
      const cl = a.course_level;
      const course = cl?.course;
      const courseObj = Array.isArray(course) ? course?.[0] : course;
      acc[a.class_id] = courseObj ? { id: courseObj.id, name: courseObj.name } : null;
      return acc;
    }, {});

    const studentsByClass: Record<string, string[]> = {};
    (classStudents || []).forEach((s: any) => {
      if (!studentsByClass[s.class_id]) studentsByClass[s.class_id] = [];
      studentsByClass[s.class_id].push(s.id);
    });

    const bestPctByStudent: Record<string, number> = {};
    if (!attemptsError && attempts) {
      attempts.forEach((a: any) => {
        const current = bestPctByStudent[a.student_id] ?? 0;
        const pct =
          typeof a.percentage === 'number'
            ? a.percentage
            : parseFloat(String(a.percentage ?? 0)) || 0;
        if (pct > current) bestPctByStudent[a.student_id] = pct;
      });
    }

    // Calculate class performance: mean of student best percentages
    const categorizeScore = (pct: number): string => {
      if (pct <= 25) return 'below_expectation';
      if (pct <= 50) return 'approaching';
      if (pct <= 75) return 'meeting';
      return 'exceeding';
    };

    const classPerformance: Record<string, { average_percentage: number; performance_rating: string | null }> = {};
    Object.keys(studentsByClass).forEach((classId) => {
      const studentIds = studentsByClass[classId];
      const percentages = studentIds
        .map((sid) => bestPctByStudent[sid])
        .filter((pct) => pct > 0);
      
      if (percentages.length === 0) {
        classPerformance[classId] = { average_percentage: 0, performance_rating: null };
      } else {
        const mean = percentages.reduce((sum, pct) => sum + pct, 0) / percentages.length;
        classPerformance[classId] = {
          average_percentage: Math.round(mean * 100) / 100,
          performance_rating: categorizeScore(mean),
        };
      }
    });

    return classes.map((cls: any) => {
      const classSchedules = schedulesByClass[cls.id] || [];
      const tutors = tutorsByClass[cls.id] || {};
      const course = courseByClass[cls.id] || null;
      const perf = classPerformance[cls.id] || { average_percentage: 0, performance_rating: null };
      return {
      ...cls,
      student_count: cls.students?.[0]?.count || 0,
        course,
        lead_tutor: tutors.lead ?? null,
        assistant_tutor: tutors.assistant ?? null,
        schedules: classSchedules,
        performance_rating: perf.performance_rating,
        average_percentage: perf.average_percentage,
      };
    });
  }

  async getClassById(id: string) {
    const { data, error } = await this.supabase
      .from('classes')
      .select(`
        *,
        school:schools(id, name, code)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Class not found');
    }

    return data;
  }

  async updateClass(id: string, dto: Partial<CreateClassDto>) {
    const { data, error } = await this.supabase
      .from('classes')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async deleteClass(id: string) {
    const { error } = await this.supabase
      .from('classes')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  }

  // =============================================
  // STUDENT METHODS
  // =============================================

  async createStudent(dto: CreateStudentDto) {
    // Get school code for username generation
    const { data: school } = await this.supabase
      .from('schools')
      .select('code')
      .eq('id', dto.school_id)
      .single();

    if (!school) {
      throw new NotFoundException('School not found');
    }

    // Check if a student with the same name already exists in this school
    const existingByName = await this.findExistingStudentByName(
      dto.school_id,
      dto.first_name,
      dto.last_name,
    );

    if (existingByName) {
      // Do NOT auto-generate a new username for the same name.
      // Require the user to provide an alternative name.
      throw new ConflictException({
        message:
          'A student with this first and last name already exists in this school. Please use an alternative name.',
        conflict_type: 'student_name',
        existing_student: {
          id: existingByName.id,
          first_name: existingByName.first_name,
          last_name: existingByName.last_name,
          class_id: existingByName.class_id,
          username: existingByName.username,
        },
      });
    }

    // Generate username
    const username = await this.generateStudentUsername(
      school.code,
      dto.first_name,
      dto.last_name,
    );

    // Default password is 1234
    const plainPassword = '1234';
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const { data, error } = await this.supabase
      .from('students')
      .insert({
        class_id: dto.class_id,
        school_id: dto.school_id,
        first_name: dto.first_name,
        last_name: dto.last_name,
        username: username,
        password_hash: passwordHash,
        plain_password: plainPassword,
        email: dto.email,
        guardian_name: dto.guardian_name,
        guardian_phone: dto.guardian_phone,
        gender: dto.gender,
      })
      .select()
      .single();

    if (error) {
      throw new ConflictException(error.message);
    }

    return {
      ...data,
      generated_username: username,
      generated_password: plainPassword,
    };
  }

  async bulkCreateStudents(dto: { class_id: string; school_id: string; students: string[] }) {
    // Get school code for username generation
    const { data: school } = await this.supabase
      .from('schools')
      .select('code')
      .eq('id', dto.school_id)
      .single();

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const schoolCode = school.code;
    const defaultPassword = '1234';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // Single query: fetch ALL existing students in this school for fast lookup
    const { data: existingStudents } = await this.supabase
      .from('students')
      .select('id, first_name, last_name, username')
      .eq('school_id', dto.school_id);

    const existingByName = new Set<string>();
    const existingUsernames = new Set<string>();
    for (const s of existingStudents || []) {
      const key = `${(s.first_name || '').toLowerCase()}|${(s.last_name || '').toLowerCase()}`;
      existingByName.add(key);
      existingUsernames.add((s.username || '').toLowerCase());
    }

    const studentsToInsert: Array<{
      class_id: string;
      school_id: string;
      first_name: string;
      last_name: string;
      username: string;
      password_hash: string;
      plain_password: string;
    }> = [];
    const conflicts: any[] = [];
    const usedUsernamesInBatch = new Set<string>(existingUsernames);

    for (const studentName of dto.students) {
      const trimmed = studentName.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.length < 2 ? '' : parts.slice(1).join(' ');
      if (!firstName) continue;

      const lookupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
      if (existingByName.has(lookupKey)) {
        conflicts.push({
          full_name: trimmed,
          first_name: firstName,
          last_name: lastName,
          reason: 'already_exists',
        });
        continue;
      }

      // Generate unique username in memory (no DB calls)
      const baseUsername = `${schoolCode}-${firstName}${lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let username = baseUsername;
      let counter = 1;
      while (usedUsernamesInBatch.has(username)) {
        username = baseUsername + counter;
        counter++;
      }
      usedUsernamesInBatch.add(username);

      studentsToInsert.push({
        class_id: dto.class_id,
        school_id: dto.school_id,
        first_name: firstName,
        last_name: lastName || '',
        username,
        password_hash: passwordHash,
        plain_password: defaultPassword,
      });
      existingByName.add(lookupKey); // Prevent duplicates in same batch
    }

    let createdStudents: any[] = [];

    if (studentsToInsert.length > 0) {
      const BATCH_SIZE = 2000;
      for (let i = 0; i < studentsToInsert.length; i += BATCH_SIZE) {
        const batch = studentsToInsert.slice(i, i + BATCH_SIZE);
        const { data, error } = await this.supabase
          .from('students')
          .insert(batch)
          .select();

        if (error) {
          throw new ConflictException(error.message);
        }
        createdStudents = createdStudents.concat(data || []);
      }
    }

    if (createdStudents.length === 0 && conflicts.length === 0) {
      throw new BadRequestException('No valid students to create');
    }

    return {
      created: createdStudents.length,
      students: createdStudents.map((s: any) => ({
        ...s,
        generated_username: s.username,
        generated_password: defaultPassword,
      })),
      conflicts,
      skipped: conflicts.length,
    };
  }

  async getAllStudents() {
    const { data, error } = await this.supabase
      .from('students')
      .select(`
        *,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async getStudentsByClass(classId: string) {
    const { data, error } = await this.supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async getStudentById(id: string) {
    const { data, error } = await this.supabase
      .from('students')
      .select(`
        *,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Student not found');
    }

    return data;
  }

  async updateStudent(id: string, dto: Partial<CreateStudentDto>) {
    const { data, error } = await this.supabase
      .from('students')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Promote a student to another class (and school if the class is in a different school).
   * Only updates class_id and school_id on the student; all attendance, projects,
   * performance, and other data remain linked to the student and are preserved.
   */
  async promoteStudent(studentId: string, classId: string) {
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found');
    }

    const { data: classRow, error: classError } = await this.supabase
      .from('classes')
      .select('id, school_id')
      .eq('id', classId)
      .single();

    if (classError || !classRow) {
      throw new NotFoundException('Target class not found');
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('students')
      .update({
        class_id: classId,
        school_id: classRow.school_id,
      })
      .eq('id', studentId)
      .select(`
        *,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return updated;
  }

  async deleteStudent(id: string) {
    const { error } = await this.supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  }

  // =============================================
  // HELPER METHODS
  // =============================================

  /**
   * Find an existing student in a school by first_name + last_name
   * This is used to prevent creating multiple students with the exact same name.
   */
  private async findExistingStudentByName(
    schoolId: string,
    firstName: string,
    lastName: string,
  ) {
    if (!firstName) return null;

    const { data } = await this.supabase
      .from('students')
      .select('id, first_name, last_name, class_id, username')
      .eq('school_id', schoolId)
      .eq('first_name', firstName)
      .eq('last_name', lastName || '')
      .maybeSingle();

    return data || null;
  }

  private generateSchoolCode(name: string): string {
    // Take first letters of each word, uppercase, max 6 chars
    const words = name.replace(/[^a-zA-Z ]/g, '').split(' ');
    let code = words.map(w => w.charAt(0).toUpperCase()).join('');
    if (code.length < 3) {
      code = name.replace(/[^a-zA-Z]/g, '').substring(0, 6).toUpperCase();
    }
    return code.substring(0, 6);
  }

  private generatePassword(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async generateStudentUsername(
    schoolCode: string,
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const baseUsername = `${schoolCode}-${firstName}${lastName}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');

    let username = baseUsername;
    let counter = 1;

    // Check for uniqueness
    while (true) {
      const { data } = await this.supabase
        .from('students')
        .select('id')
        .eq('username', username)
        .single();

      if (!data) break;

      username = baseUsername + counter;
      counter++;
    }

    return username;
  }

  // =============================================
  // SCHOOL ANALYTICS METHODS
  // =============================================

  async getTutorsBySchool(schoolId: string) {
    // Get all classes for this school
    const { data: classes, error: classesError } = await this.supabase
      .from('classes')
      .select('id')
      .eq('school_id', schoolId)
      .eq('status', 'active');

    if (classesError) {
      throw new Error(classesError.message);
    }

    if (!classes || classes.length === 0) {
      return [];
    }

    const classIds = classes.map((c: any) => c.id);

    // Get all tutor assignments for these classes
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        id,
        role,
        assigned_at,
        tutor:tutors(
          id,
          first_name,
          middle_name,
          last_name,
          email,
          phone,
          level,
          status
        ),
        class:classes(
          id,
          name,
          level
        )
      `)
      .in('class_id', classIds)
      .eq('status', 'active');

    if (assignmentsError) {
      throw new Error(assignmentsError.message);
    }

    // Group by tutor and aggregate classes
    const tutorMap = new Map();
    (assignments || []).forEach((assignment: any) => {
      const tutor = Array.isArray(assignment.tutor) ? assignment.tutor[0] : assignment.tutor;
      const classData = Array.isArray(assignment.class) ? assignment.class[0] : assignment.class;
      
      if (!tutor) return;

      const tutorId = tutor.id;
      if (!tutorMap.has(tutorId)) {
        tutorMap.set(tutorId, {
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
          classes: [],
          roles: new Set(),
        });
      }

      const tutorData = tutorMap.get(tutorId);
      tutorData.classes.push({
        id: classData.id,
        name: classData.name,
        level: classData.level,
        role: assignment.role,
        assigned_at: assignment.assigned_at,
      });
      tutorData.roles.add(assignment.role);
    });

    // Convert to array and format
    return Array.from(tutorMap.values()).map((item: any) => ({
      ...item.tutor,
      classes: item.classes,
      roles: Array.from(item.roles),
      total_classes: item.classes.length,
    }));
  }

  async getStudentsBySchool(
    schoolId: string,
    filters?: { gender?: string; performance_rating?: string },
  ) {
    let query = this.supabase
      .from('students')
      .select(`
        id,
        first_name,
        last_name,
        username,
        email,
        gender,
        last_login,
        status,
        class:classes(
          id,
          name,
          level
        )
      `)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .order('first_name', { ascending: true });

    if (filters?.gender) {
      query = query.eq('gender', filters.gender);
    }

    const { data: students, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (!students || students.length === 0) {
      return [];
    }

    const studentIds = students.map((s: any) => s.id);
    const parentByStudent: Record<string, { email: string }> = {};
    const bestPctByStudent: Record<string, number> = {};

    const { data: links } = await this.supabase
      .from('parent_student_links')
      .select('student_id, parent:parents(email)')
      .in('student_id', studentIds);
    if (links) {
      links.forEach((l: any) => {
        if (parentByStudent[l.student_id]) return;
        const p = Array.isArray(l.parent) ? l.parent[0] : l.parent;
        if (p?.email) parentByStudent[l.student_id] = { email: p.email };
      });
    }

    const { data: attempts, error: attemptsError } = await this.supabase
      .from('student_quiz_attempts')
      .select('student_id, percentage')
      .in('student_id', studentIds)
      .eq('status', 'completed');
    if (!attemptsError && attempts) {
      attempts.forEach((a: any) => {
        const current = bestPctByStudent[a.student_id] ?? 0;
        const pct =
          typeof a.percentage === 'number'
            ? a.percentage
            : parseFloat(String(a.percentage ?? 0)) || 0;
        if (pct > current) bestPctByStudent[a.student_id] = pct;
      });
    }

    const categorizeScore = (pct: number): string => {
      if (pct <= 25) return 'below_expectation';
      if (pct <= 50) return 'approaching';
      if (pct <= 75) return 'meeting';
      return 'exceeding';
    };

    const result = students.map((s: any) => {
      const bestPct = bestPctByStudent[s.id] ?? 0;
      const performance_rating = bestPct > 0 ? categorizeScore(bestPct) : null;
      return {
        ...s,
        parent: parentByStudent[s.id] ?? null,
        performance_rating,
      };
    });

    if (filters?.performance_rating) {
      return result.filter((s: any) => s.performance_rating === filters.performance_rating);
    }
    return result;
  }

  async getStudentPortfolioForSchool(schoolId: string, studentId: string) {
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, school_id')
      .eq('id', studentId)
      .single();

    if (studentError || !student || student.school_id !== schoolId) {
      throw new NotFoundException('Student not found or does not belong to this school');
    }

    const { data: projects, error } = await this.supabase
      .from('student_saved_projects')
      .select(`
        id,
        project_name,
        project_title,
        project_type,
        topic_id,
        course_level_id,
        course_id,
        updated_at,
        created_at,
        topic:topics(id, name),
        course_level:course_levels(id, name),
        course:courses(id, name)
      `)
      .eq('student_id', studentId)
      .eq('is_current', true)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (projects || []).map((p: any) => {
      const topic = Array.isArray(p.topic) ? p.topic[0] : p.topic;
      const courseLevel = Array.isArray(p.course_level) ? p.course_level[0] : p.course_level;
      const course = Array.isArray(p.course) ? p.course[0] : p.course;
      return {
        id: p.id,
        project_name: p.project_name,
        project_title: p.project_title || p.project_name,
        topic_name: topic?.name,
        course_level_name: courseLevel?.name,
        course_name: course?.name,
        project_type: p.project_type || 'other',
        updated_at: p.updated_at,
        created_at: p.created_at,
      };
    });
  }

  /**
   * Get parents who have linked at least one student in this school (via parent_student_links).
   * When a parent adds a student from this school, they appear here.
   */
  async getParentsBySchool(schoolId: string) {
    const { data: schoolRow } = await this.supabase
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();
    const schoolName = (schoolRow as any)?.name ?? null;

    const { data: students, error: studentsError } = await this.supabase
      .from('students')
      .select(`
        id,
        first_name,
        last_name,
        class:classes(id, name)
      `)
      .eq('school_id', schoolId)
      .eq('status', 'active');

    if (studentsError || !students || students.length === 0) {
      return [];
    }

    const studentIds = students.map((s: any) => s.id);
    const studentMap = new Map(students.map((s: any) => [s.id, s]));

    const { data: links, error: linksError } = await this.supabase
      .from('parent_student_links')
      .select(`
        parent_id,
        student_id,
        relationship,
        parent:parents(id, first_name, last_name, email, status)
      `)
      .in('student_id', studentIds);

    if (linksError || !links || links.length === 0) {
      return [];
    }

    const byParent = new Map<string, { parent: any; relationship?: string; children: Array<{ name: string; class?: string }> }>();
    for (const link of links) {
      const parent = Array.isArray(link.parent) ? link.parent[0] : link.parent;
      if (!parent) continue;
      const pid = parent.id;
      const student = studentMap.get(link.student_id);
      const childName = student
        ? [student.first_name, student.last_name].filter(Boolean).join(' ') || 'Student'
        : 'Student';
      const classObj = student?.class;
      const className = Array.isArray(classObj) ? classObj[0]?.name : classObj?.name;

      if (!byParent.has(pid)) {
        byParent.set(pid, {
          parent: { id: parent.id, first_name: parent.first_name, last_name: parent.last_name, email: parent.email, status: parent.status },
          relationship: link.relationship,
          children: [],
        });
      }
      const entry = byParent.get(pid)!;
      if (!entry.children.some((c) => c.name === childName && c.class === className)) {
        entry.children.push({ name: childName, class: className });
      }
    }

    return Array.from(byParent.values()).map(({ parent, relationship, children }) => ({
      id: parent.id,
      name: [parent.first_name, parent.last_name].filter(Boolean).join(' ') || parent.email,
      email: parent.email,
      relationship: relationship || undefined,
      school_name: schoolName,
      children,
      status: parent.status || 'active',
    }));
  }
}



