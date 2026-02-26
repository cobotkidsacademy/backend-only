import { Injectable, UnauthorizedException, Logger, NotFoundException, Inject, forwardRef, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AttendanceService } from '../attendance/attendance.service';
import { CacheService } from '../core/cache/cache.service';
import { MailerService } from '../mailer/mailer.service';
import { TakeAwayService } from '../take-away/take-away.service';
import { StudentCoursesService } from '../student-courses/student-courses.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // In-memory rate limiting for login attempts (prevents brute force)
  private readonly loginAttempts = new Map<string, { count: number; resetAt: number }>();
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private jwtService: JwtService,
    @Inject(forwardRef(() => AttendanceService))
    private attendanceService: AttendanceService,
    private cacheService: CacheService,
    private mailerService: MailerService,
    private takeAwayService: TakeAwayService,
    private studentCoursesService: StudentCoursesService,
  ) {}

  // ============ ADMIN LOGIN ============
  async adminLogin(email: string, password: string) {
    this.logger.log(`=== LOGIN ATTEMPT ===`);
    this.logger.log(`Email: ${email}`);
    this.logger.log(`Password length: ${password?.length || 0}`);

    try {
      // Query admin user from Supabase
      this.logger.log(`Querying database for admin...`);
      const { data: admin, error } = await this.supabase
        .from('admins')
          .select('id, email, password_hash, role')
          .eq('email', email)
        .single();

      if (error) {
        this.logger.error(`Database error: ${JSON.stringify(error)}`);
        throw new UnauthorizedException('Invalid credentials - database error');
      }

      if (!admin) {
        this.logger.warn(`Admin not found for email: ${email}`);
        throw new UnauthorizedException('Invalid credentials - user not found');
      }

      this.logger.log(`Admin found: ${admin.email}, ID: ${admin.id}`);
      this.logger.log(`Password hash from DB (first 20 chars): ${admin.password_hash?.substring(0, 20)}...`);
      this.logger.log(`Password hash length: ${admin.password_hash?.length || 0}`);

      // Verify password
      this.logger.log(`Comparing passwords...`);
      const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
      this.logger.log(`Password valid: ${isPasswordValid}`);

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password attempt for email: ${email}`);
        throw new UnauthorizedException('Invalid credentials - wrong password');
      }

      // Generate JWT token
      const payload = {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
      };

      const token = this.jwtService.sign(payload);

      this.logger.log(`✅ Successful login for admin: ${email}`);

      return {
        token,
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Login error: ${error.message}`, error.stack);
      throw new UnauthorizedException('Login failed. Please check your credentials and try again.');
    }
  }

  // Debug method to test password hashing
  // Debug method to test password hashing
  async testPasswordHash(password: string) {
    const hash = await bcrypt.hash(password, 10);
    const isValid = await bcrypt.compare(password, hash);
    return {
      originalPassword: password,
      generatedHash: hash,
      verificationResult: isValid,
    };
  }

  async validateUser(userId: string) {
    try {
      const { data: user, error } = await this.supabase
        .from('admins')
        .select('id, email, role')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return null;
      }

      return user;
    } catch (error) {
      return null;
    }
  }

  // ============ STUDENT LOGIN & PROFILE ============
  async studentLogin(username: string, password: string) {
    try {
      // Check rate limiting
      const rateLimitKey = `login:student:${username}`;
      if (this.isRateLimited(rateLimitKey)) {
        throw new UnauthorizedException('Too many login attempts. Please try again in 15 minutes.');
      }

      // Check cache for user metadata (non-sensitive data)
      const cachedUserKey = `user:student:${username}:meta`;
      let cachedUser = await this.cacheService.get<any>(cachedUserKey, 'auth');
      
      let student;
      if (cachedUser && cachedUser.username === username) {
        // User exists in cache, fetch only password hash
        this.logger.debug(`User metadata cache hit for ${username}`);
        const { data: studentData, error } = await this.supabase
          .from('students')
          .select('id, username, password_hash, status, first_name, last_name, class_id, school_id, login_count, last_login')
          .eq('id', cachedUser.id)
          .single();
        
        if (error || !studentData) {
          // Cache invalid, fetch fresh
          cachedUser = null;
        } else {
          student = studentData;
        }
      }

      // If not cached, fetch from database
      if (!student) {
        const { data: studentData, error } = await this.supabase
          .from('students')
          .select('id, username, password_hash, first_name, last_name, status, class_id, school_id, login_count, last_login')
          .eq('username', username)
          .single();
        
        if (error) {
          this.logger.error(`Database error: ${JSON.stringify(error)}`);
          this.recordFailedAttempt(rateLimitKey);
          throw new UnauthorizedException('Invalid credentials');
        }
        student = studentData;
      }

      if (!student) {
        this.logger.warn(`Student not found for username: ${username}`);
        throw new UnauthorizedException('Invalid username or password');
      }

      // Check if student is active
      if (student.status !== 'active') {
        this.logger.warn(`Student account is not active: ${username}`);
        throw new UnauthorizedException('Your account is not active. Please contact your administrator.');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, student.password_hash);
      
      if (!isPasswordValid) {
        this.logger.warn(`Invalid password attempt for username: ${username}`);
        this.recordFailedAttempt(rateLimitKey);
        throw new UnauthorizedException('Invalid username or password');
      }

      // Clear rate limit on successful login
      this.clearRateLimit(rateLimitKey);

      // Update login tracking (last_login and login_count)
      const currentLoginCount = (student as any).login_count || 0;
      const loginTimestamp = new Date().toISOString();
      await this.supabase
        .from('students')
        .update({
          last_login: loginTimestamp,
          login_count: currentLoginCount + 1,
        })
        .eq('id', student.id);

      // Auto-mark attendance on login
      // This is done asynchronously to not block login
      this.attendanceService.autoMarkAttendance({
        student_id: student.id,
        login_timestamp: loginTimestamp,
      }).catch((err) => {
        this.logger.warn(`Failed to auto-mark attendance for student ${student.id}: ${err.message}`, err.stack);
      });

      // Generate JWT token
      const payload = {
        sub: student.id,
        username: student.username,
        role: 'student',
      };

      const token = this.jwtService.sign(payload);

      // Cache user metadata for 15 minutes (non-sensitive data only)
      const userMeta = {
        id: student.id,
        username: student.username,
        first_name: student.first_name,
        last_name: student.last_name,
        role: 'student',
        class_id: student.class_id,
        school_id: student.school_id,
      };
      await this.cacheService.set(`user:student:${student.id}:meta`, userMeta, 900, 'auth'); // 15 min TTL
      await this.cacheService.set(cachedUserKey, { id: student.id, username: student.username }, 900, 'auth');

      return {
        token,
        user: userMeta,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Student login error: ${error.message}`, error.stack);
      throw new UnauthorizedException('Login failed. Please check your credentials and try again.');
    }
  }

  /**
   * Check if student usernames are valid for team-up (exist, active, same class as host).
   * Used when students share one device and the logged-in student adds teammates by username.
   */
  async teamUpCheck(hostStudentId: string, usernames: string[]): Promise<{
    valid: Array<{ username: string; id: string; first_name: string; last_name: string }>;
    invalid: Array<{ username: string; reason: string }>;
  }> {
    const normalized = usernames.map((u) => (u || '').trim().toLowerCase()).filter(Boolean);
    const unique = [...new Set(normalized)];

    const { data: host, error: hostError } = await this.supabase
      .from('students')
      .select('id, class_id, school_id, username')
      .eq('id', hostStudentId)
      .single();

    if (hostError || !host) {
      throw new NotFoundException('Logged-in student not found');
    }

    const valid: Array<{ username: string; id: string; first_name: string; last_name: string }> = [];
    const invalid: Array<{ username: string; reason: string }> = [];

    for (const username of unique) {
      const { data: student, error } = await this.supabase
        .from('students')
        .select('id, username, first_name, last_name, class_id, status')
        .ilike('username', username)
        .maybeSingle();

      if (error || !student) {
        invalid.push({ username, reason: 'Username not found' });
        continue;
      }
      if (student.status !== 'active') {
        invalid.push({ username: student.username, reason: 'Account is not active' });
        continue;
      }
      if (student.id === hostStudentId) {
        invalid.push({ username: student.username, reason: 'Cannot add yourself' });
        continue;
      }
      if (student.class_id !== host.class_id) {
        invalid.push({ username: student.username, reason: 'Not in the same class' });
        continue;
      }
      valid.push({
        username: student.username,
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
      });
    }

    return { valid, invalid };
  }

  /**
   * Register teammates as logged in and mark attendance for each.
   * Only students that pass teamUpCheck (same class, active) should be in usernames.
   */
  async teamUp(hostStudentId: string, usernames: string[]): Promise<{
    teamed: Array<{ id: string; username: string; first_name: string; last_name: string; login_timestamp: string }>;
    invalid: Array<{ username: string; reason: string }>;
  }> {
    const check = await this.teamUpCheck(hostStudentId, usernames);
    const loginTimestamp = new Date().toISOString();
    const teamed: Array<{ id: string; username: string; first_name: string; last_name: string; login_timestamp: string }> = [];

    // Mark the logged-in student (host) as present for this session
    this.attendanceService.markPresentForSession(hostStudentId, loginTimestamp).catch((err) => {
      this.logger.warn(`Failed to mark host attendance: ${err.message}`);
    });

    for (const v of check.valid) {
      const { data: student } = await this.supabase
        .from('students')
        .select('id, login_count')
        .eq('id', v.id)
        .single();

      if (!student) continue;

      const currentLoginCount = (student as any).login_count || 0;
      await this.supabase
        .from('students')
        .update({
          last_login: loginTimestamp,
          login_count: currentLoginCount + 1,
        })
        .eq('id', v.id);

      this.attendanceService.markPresentForSession(v.id, loginTimestamp).catch((err) => {
        this.logger.warn(`Failed to mark teammate attendance ${v.id}: ${err.message}`);
      });

      teamed.push({
        id: v.id,
        username: v.username,
        first_name: v.first_name,
        last_name: v.last_name,
        login_timestamp: loginTimestamp,
      });
    }

    return { teamed, invalid: check.invalid };
  }

  async getStudentInfo(studentId: string) {
    // Get student basic info first (needed for class_id)
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select(`
        id,
        username,
        first_name,
        last_name,
        email,
        profile_image_url,
        gender,
        guardian_name,
        guardian_phone,
        date_of_birth,
        status,
        last_login,
        login_count,
        class_id,
        school_id,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      throw new UnauthorizedException('Student not found');
    }

    // Run all independent queries in parallel for better performance
    const [tutorAssignmentsResult, courseLevelAssignmentsResult, studentPointsResult, bestScoresResult] = await Promise.all([
      // Get tutors assigned to the student's class
      this.supabase
        .from('tutor_class_assignments')
        .select(`
          id,
          role,
          tutor:tutors(
            id,
            first_name,
            middle_name,
            last_name,
            email,
            phone
          )
        `)
        .eq('class_id', student.class_id)
        .eq('status', 'active'),
      
      // Get course level assignments for the student's class
      this.supabase
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
        .order('created_at', { ascending: false }),
      
      // Get student quiz performance (score category)
      this.supabase
        .from('student_total_points')
        .select('total_points, quizzes_completed')
        .eq('student_id', studentId)
        .maybeSingle(),
      
      // Get highest quiz percentage to determine performance category
      this.supabase
        .from('student_quiz_best_scores')
        .select('best_percentage')
        .eq('student_id', studentId)
        .order('best_percentage', { ascending: false })
        .limit(1),
    ]);

    const tutorAssignments = tutorAssignmentsResult.data;
    const courseLevelAssignments = courseLevelAssignmentsResult.data;
    const studentPoints = studentPointsResult.data;
    const bestScores = bestScoresResult.data;

    // Determine performance category based on highest percentage
    let performanceCategory = 'below_expectation';
    if (bestScores && bestScores.length > 0) {
      const highestPercentage = bestScores[0].best_percentage;
      if (highestPercentage > 75) {
        performanceCategory = 'exceeding';
      } else if (highestPercentage > 50) {
        performanceCategory = 'meeting';
      } else if (highestPercentage > 25) {
        performanceCategory = 'approaching';
      }
    }

    // Format tutors
    const tutors = (tutorAssignments || []).map((assignment: any) => {
      const tutor = assignment.tutor || {};
      const nameParts = [
        tutor.first_name || '',
        tutor.middle_name || '',
        tutor.last_name || ''
      ].filter(Boolean);
      return {
        id: tutor.id,
        name: nameParts.join(' ') || 'Unknown Tutor',
        role: assignment.role,
        email: tutor.email,
        phone: tutor.phone,
      };
    });

    // Format course levels
    const courseLevels = (courseLevelAssignments || []).map((assignment: any) => {
      const courseLevel = assignment.course_level || {};
      const course = courseLevel.course || {};
      return {
        id: courseLevel.id,
        name: courseLevel.name || 'Unknown Level',
        course_name: course.name,
        enrollment_status: assignment.enrollment_status,
      };
    });

    return {
      ...student,
      tutors: tutors.length > 0 ? tutors : undefined,
      course_levels: courseLevels.length > 0 ? courseLevels : undefined,
      performance: {
        category: performanceCategory,
        total_points: studentPoints?.total_points || 0,
        quizzes_completed: studentPoints?.quizzes_completed || 0,
        highest_percentage: bestScores && bestScores.length > 0 ? bestScores[0].best_percentage : 0,
      },
    };
  }

  async updateStudentProfile(studentId: string, profileImageUrl: string) {
    const { data, error } = await this.supabase
      .from('students')
      .update({ profile_image_url: profileImageUrl })
      .eq('id', studentId)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating student profile:', error);
      throw new UnauthorizedException('Failed to update profile');
    }

    return data;
  }

  async updateStudentProfileDetails(
    studentId: string,
    updateData: {
      guardian_name?: string;
      guardian_phone?: string;
      gender?: 'male' | 'female' | 'other' | null;
      date_of_birth?: string | null;
      profile_image_url?: string;
    },
  ) {
    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateData.guardian_name !== undefined) {
      updatePayload.guardian_name = updateData.guardian_name || null;
    }
    if (updateData.guardian_phone !== undefined) {
      updatePayload.guardian_phone = updateData.guardian_phone || null;
    }
    if (updateData.gender !== undefined) {
      updatePayload.gender = updateData.gender || null;
    }
    if (updateData.date_of_birth !== undefined) {
      updatePayload.date_of_birth = updateData.date_of_birth || null;
    }
    if (updateData.profile_image_url !== undefined) {
      updatePayload.profile_image_url = updateData.profile_image_url || null;
    }

    const { data, error } = await this.supabase
      .from('students')
      .update(updatePayload)
      .eq('id', studentId)
      .select(`
        id,
        username,
        first_name,
        last_name,
        email,
        profile_image_url,
        gender,
        guardian_name,
        guardian_phone,
        date_of_birth,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .single();

    if (error) {
      this.logger.error('Error updating student profile details:', error);
      throw new UnauthorizedException('Failed to update profile details');
    }

    return data;
  }

  async updateStudentProfileFull(
    studentId: string,
    updateData: {
      username: string;
      first_name: string;
      last_name: string;
      school_id: string;
      class_id: string;
    },
  ) {
    // Check if username is already taken by another student
    const { data: existingStudent } = await this.supabase
      .from('students')
      .select('id')
      .eq('username', updateData.username)
      .neq('id', studentId)
      .single();

    if (existingStudent) {
      throw new UnauthorizedException('Username is already taken');
    }

    // Verify school exists
    const { data: school } = await this.supabase
      .from('schools')
      .select('id')
      .eq('id', updateData.school_id)
      .single();

    if (!school) {
      throw new UnauthorizedException('School not found');
    }

    // Verify class exists and belongs to the school
    const { data: classData } = await this.supabase
      .from('classes')
      .select('id, school_id')
      .eq('id', updateData.class_id)
      .single();

    if (!classData) {
      throw new UnauthorizedException('Class not found');
    }

    if (classData.school_id !== updateData.school_id) {
      throw new UnauthorizedException('Class does not belong to the selected school');
    }

    // Update student profile
    const { data, error } = await this.supabase
      .from('students')
      .update({
        username: updateData.username,
        first_name: updateData.first_name,
        last_name: updateData.last_name,
        school_id: updateData.school_id,
        class_id: updateData.class_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentId)
      .select(`
        id,
        username,
        first_name,
        last_name,
        email,
        status,
        profile_image_url,
        class:classes(id, name, level),
        school:schools(id, name, code)
      `)
      .single();

    if (error) {
      this.logger.error('Error updating student profile:', error);
      throw new UnauthorizedException('Failed to update profile');
    }

    return data;
  }

  // ============ TUTOR LOGIN & PROFILE ============
  async tutorLogin(email: string, password: string) {
    this.logger.log(`=== TUTOR LOGIN ATTEMPT ===`);
    this.logger.log(`Email: ${email}`);

    try {
      // Check rate limiting
      const rateLimitKey = `login:tutor:${email}`;
      if (this.isRateLimited(rateLimitKey)) {
        throw new UnauthorizedException('Too many login attempts. Please try again in 15 minutes.');
      }

      // Check cache for user metadata
      const cachedUserKey = `user:tutor:${email}:meta`;
      let cachedUser = await this.cacheService.get<any>(cachedUserKey, 'auth');
      
      let tutor;
      if (cachedUser && cachedUser.email === email) {
        // Fetch only password hash and status
        const { data: tutorData, error } = await this.supabase
          .from('tutors')
          .select('id, email, password_hash, first_name, middle_name, last_name, level, status')
          .eq('id', cachedUser.id)
          .single();
        
        if (error || !tutorData) {
          cachedUser = null;
        } else {
          tutor = tutorData;
        }
      }

      // If not cached, fetch from database
      if (!tutor) {
        this.logger.log(`Querying database for tutor...`);
        const { data: tutorData, error } = await this.supabase
          .from('tutors')
          .select('id, email, password_hash, first_name, middle_name, last_name, level, status')
          .eq('email', email)
          .single();

        if (error) {
          this.logger.error(`Database error: ${JSON.stringify(error)}`);
          this.recordFailedAttempt(rateLimitKey);
          throw new UnauthorizedException('Invalid credentials');
        }

        if (!tutorData) {
          this.logger.warn(`Tutor not found for email: ${email}`);
          this.recordFailedAttempt(rateLimitKey);
          throw new UnauthorizedException('Invalid email or password');
        }

        tutor = tutorData;
      }

      // Check if tutor is active
      if (tutor.status !== 'active') {
        this.logger.warn(`Tutor account is not active: ${email}`);
        throw new UnauthorizedException('Your account is not active. Please contact your administrator.');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, tutor.password_hash);

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password attempt for email: ${email}`);
        this.recordFailedAttempt(rateLimitKey);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Clear rate limit on successful login
      this.clearRateLimit(rateLimitKey);

      // Generate JWT token
      const payload = {
        sub: tutor.id,
        email: tutor.email,
        role: 'tutor',
      };

      const token = this.jwtService.sign(payload);

      // Cache user metadata for 15 minutes
      const userMeta = {
        id: tutor.id,
        email: tutor.email,
        first_name: tutor.first_name,
        middle_name: tutor.middle_name,
        last_name: tutor.last_name,
        level: tutor.level,
        role: 'tutor',
      };
      await this.cacheService.set(`user:tutor:${tutor.id}:meta`, userMeta, 900, 'auth');
      await this.cacheService.set(cachedUserKey, { id: tutor.id, email: tutor.email }, 900, 'auth');

      this.logger.log(`✅ Successful login for tutor: ${email}`);

      return {
        token,
        user: userMeta,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Tutor login error: ${error.message}`, error.stack);
      throw new UnauthorizedException('Login failed. Please check your credentials and try again.');
    }
  }

  async getTutorInfo(tutorId: string) {
    // Get tutor basic info
    const { data: tutor, error: tutorError } = await this.supabase
      .from('tutors')
      .select(`
        id,
        email,
        first_name,
        middle_name,
        last_name,
        level,
        phone,
        status,
        profile_image_url,
        display_class_name
      `)
      .eq('id', tutorId)
      .single();

    if (tutorError || !tutor) {
      throw new UnauthorizedException('Tutor not found');
    }

    return tutor;
  }

  async updateTutorDisplayClassName(tutorId: string, displayClassName: string | null) {
    const { data, error } = await this.supabase
      .from('tutors')
      .update({ display_class_name: displayClassName ? displayClassName.trim() || null : null })
      .eq('id', tutorId)
      .select()
      .single();

    if (error) throw new UnauthorizedException('Failed to update');
    return data;
  }

  /** Tutor self-service: update own profile (name, phone, profile image, display class name). */
  async updateTutorProfile(
    tutorId: string,
    dto: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      profile_image_url?: string | null;
      display_class_name?: string | null;
    },
  ) {
    const payload: Record<string, unknown> = {};
    if (dto.first_name !== undefined) payload.first_name = dto.first_name?.trim() || null;
    if (dto.last_name !== undefined) payload.last_name = dto.last_name?.trim() || null;
    if (dto.phone !== undefined) payload.phone = dto.phone?.trim() || null;
    if (dto.profile_image_url !== undefined) payload.profile_image_url = dto.profile_image_url?.trim() || null;
    if (dto.display_class_name !== undefined) payload.display_class_name = dto.display_class_name?.trim() || null;
    if (Object.keys(payload).length === 0) {
      return this.getTutorInfo(tutorId);
    }
    const { data, error } = await this.supabase
      .from('tutors')
      .update(payload)
      .eq('id', tutorId)
      .select()
      .single();
    if (error) throw new UnauthorizedException('Failed to update profile');
    return data;
  }

  // ============ PARENT LOGIN & PROFILE ============

  async parentLogin(email: string, password: string) {
    this.logger.log(`=== PARENT LOGIN ATTEMPT ===`);
    this.logger.log(`Email: ${email}`);

    try {
      // Check rate limiting
      const rateLimitKey = `login:parent:${email}`;
      if (this.isRateLimited(rateLimitKey)) {
        throw new UnauthorizedException('Too many login attempts. Please try again in 15 minutes.');
      }

      // Check cache for user metadata
      const cachedUserKey = `user:parent:${email}:meta`;
      let cachedUser = await this.cacheService.get<any>(cachedUserKey, 'auth');
      
      let parent;
      if (cachedUser && cachedUser.email === email) {
        const { data: parentData, error } = await this.supabase
          .from('parents')
          .select('id, email, password_hash, first_name, last_name, status')
          .eq('id', cachedUser.id)
          .single();
        
        if (error || !parentData) {
          cachedUser = null;
        } else {
          parent = parentData;
        }
      }

      // If not cached, fetch from database
      if (!parent) {
        this.logger.log(`Querying database for parent...`);
        const { data: parentData, error } = await this.supabase
          .from('parents')
          .select('id, email, password_hash, first_name, last_name, status')
          .eq('email', email)
          .single();

        if (error) {
          this.logger.error(`Database error (parent login): ${JSON.stringify(error)}`);
          this.recordFailedAttempt(rateLimitKey);
          throw new UnauthorizedException('Invalid credentials');
        }

        if (!parentData) {
          this.logger.warn(`Parent not found for email: ${email}`);
          this.recordFailedAttempt(rateLimitKey);
          throw new UnauthorizedException('Invalid email or password');
        }

        parent = parentData;
      }

      // Check if parent is active
      if (parent.status !== 'active') {
        this.logger.warn(`Parent account is not active: ${email}`);
        throw new UnauthorizedException('Your account is not active. Please contact your administrator.');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, parent.password_hash);

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password attempt for parent email: ${email}`);
        this.recordFailedAttempt(rateLimitKey);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Clear rate limit on successful login
      this.clearRateLimit(rateLimitKey);

      // Generate JWT token
      const payload = {
        sub: parent.id,
        email: parent.email,
        role: 'parent',
      };

      const token = this.jwtService.sign(payload);

      this.logger.log(`✅ Successful login for parent: ${email}`);

      return {
        token,
        user: {
          id: parent.id,
          email: parent.email,
          first_name: parent.first_name,
          last_name: parent.last_name,
          role: 'parent',
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Parent login error: ${error.message}`, (error as any).stack);
      throw new UnauthorizedException('Login failed. Please check your credentials and try again.');
    }
  }

  async parentLoginWithStudent(username: string, password: string) {
    this.logger.log(`=== PARENT LOGIN WITH STUDENT CREDENTIALS ===`);
    this.logger.log(`Username: ${username}`);
    this.logger.log(`Password length: ${password?.length || 0}`);

    try {
      // First, try to login as student
      const studentLoginResult = await this.studentLogin(username, password);
      
      if (!studentLoginResult || !studentLoginResult.user) {
        throw new UnauthorizedException('Invalid student credentials');
      }

      const studentId = studentLoginResult.user.id;

      // Check if a parent account already exists linked to this student
      const { data: existingLink } = await this.supabase
        .from('parent_student_links')
        .select(`
          parent_id,
          parent:parents(
            id,
            email,
            first_name,
            last_name,
            status
          )
        `)
        .eq('student_id', studentId)
        .limit(1)
        .maybeSingle();

      let parentId: string;
      let parentData: any;

      if (existingLink && existingLink.parent) {
        // Use existing parent account
        // Handle both array and single object from Supabase
        const parent = Array.isArray(existingLink.parent) 
          ? existingLink.parent[0] 
          : existingLink.parent;
        
        if (parent) {
          parentId = parent.id;
          parentData = parent;

          // Check if parent is active
          if (parentData.status !== 'active') {
            throw new UnauthorizedException('Your parent account is not active. Please contact your administrator.');
          }
        } else {
          // Parent link exists but parent data is missing, need to create new parent
          const { data: student } = await this.supabase
            .from('students')
            .select('first_name, last_name')
            .eq('id', studentId)
            .single();

          const tempEmail = `${username}@parent.cobotkids.edutech`;
          const tempPassword = 'parent123';
          const passwordHash = await bcrypt.hash(tempPassword, 10);

          const { data: newParent, error: createError } = await this.supabase
            .from('parents')
            .insert({
              email: tempEmail,
              password_hash: passwordHash,
              first_name: student?.first_name || 'Parent',
              last_name: student?.last_name || 'User',
              status: 'active',
            })
            .select()
            .single();

          if (createError) {
            this.logger.error(`Error creating parent account (link exists): ${JSON.stringify(createError)}`);
            
            // Check if table doesn't exist
            if (createError.message?.includes("Could not find the table") || createError.code === 'PGRST205') {
              this.logger.error('Parents table does not exist. Please run migration 019_create_parents.sql');
              throw new UnauthorizedException('Database configuration error: Parents table not found. Please contact your administrator.');
            }
            
            // If email already exists, try to fetch it
            if (createError.code === '23505' || createError.message?.includes('duplicate') || createError.message?.includes('unique')) {
              const { data: existingParent } = await this.supabase
                .from('parents')
                .select('id, email, first_name, last_name, status')
                .eq('email', tempEmail)
                .single();
              
              if (existingParent) {
                parentId = existingParent.id;
                parentData = existingParent;
              } else {
                throw new UnauthorizedException(`Failed to create parent account: ${createError.message}`);
              }
            } else {
              throw new UnauthorizedException(`Failed to create parent account: ${createError.message}`);
            }
          } else if (!newParent) {
            throw new UnauthorizedException('Failed to create parent account: No data returned');
          } else {
            parentId = newParent.id;
            parentData = newParent;
          }

          // Update the link with new parent ID
          await this.supabase
            .from('parent_student_links')
            .update({ parent_id: parentId })
            .eq('student_id', studentId);
        }
      } else {
        // Create a new parent account for this student
        // Generate a temporary email based on student username
        const tempEmail = `${username}@parent.cobotkids.edutech`;
        
        // Check if email already exists
        const { data: existingParent } = await this.supabase
          .from('parents')
          .select('id, email, first_name, last_name, status')
          .eq('email', tempEmail)
          .maybeSingle();

        if (existingParent) {
          parentId = existingParent.id;
          parentData = existingParent;
        } else {
          // Create new parent account
          const { data: student } = await this.supabase
            .from('students')
            .select('first_name, last_name')
            .eq('id', studentId)
            .single();

          // Generate a temporary password (parents can change this later)
          const tempPassword = 'parent123'; // Default password
          const passwordHash = await bcrypt.hash(tempPassword, 10);

          const { data: newParent, error: createError } = await this.supabase
            .from('parents')
            .insert({
              email: tempEmail,
              password_hash: passwordHash,
              first_name: student?.first_name || 'Parent',
              last_name: student?.last_name || 'User',
              status: 'active',
            })
            .select()
            .single();

          if (createError) {
            this.logger.error(`Error creating parent account (new): ${JSON.stringify(createError)}`);
            
            // Check if table doesn't exist
            if (createError.message?.includes("Could not find the table") || createError.code === 'PGRST205') {
              this.logger.error('Parents table does not exist. Please run migration 019_create_parents.sql');
              throw new UnauthorizedException('Database configuration error: Parents table not found. Please contact your administrator.');
            }
            
            // If email already exists, try to fetch it
            if (createError.code === '23505' || createError.message?.includes('duplicate') || createError.message?.includes('unique')) {
              const { data: existingParent } = await this.supabase
                .from('parents')
                .select('id, email, first_name, last_name, status')
                .eq('email', tempEmail)
                .single();
              
              if (existingParent) {
                parentId = existingParent.id;
                parentData = existingParent;
              } else {
                throw new UnauthorizedException(`Failed to create parent account: ${createError.message}`);
              }
            } else {
              throw new UnauthorizedException(`Failed to create parent account: ${createError.message}`);
            }
          } else if (!newParent) {
            throw new UnauthorizedException('Failed to create parent account: No data returned');
          } else {
            parentId = newParent.id;
            parentData = newParent;
          }
        }

        // Link student to parent if not already linked
        const { data: linkCheck } = await this.supabase
          .from('parent_student_links')
          .select('id')
          .eq('parent_id', parentId)
          .eq('student_id', studentId)
          .maybeSingle();

        if (!linkCheck) {
          await this.supabase
            .from('parent_student_links')
            .insert({
              parent_id: parentId,
              student_id: studentId,
              relationship: 'child',
            });
        }
      }

      // Generate parent JWT token
      const payload = {
        sub: parentId,
        email: parentData.email,
        role: 'parent',
      };

      const token = this.jwtService.sign(payload);

      this.logger.log(`✅ Successful parent login with student credentials: ${username}`);

      return {
        token,
        user: {
          id: parentId,
          email: parentData.email,
          first_name: parentData.first_name,
          last_name: parentData.last_name,
          role: 'parent',
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Parent login with student error: ${error.message}`, (error as any).stack);
      throw new UnauthorizedException('Login failed. Please check your credentials and try again.');
    }
  }

  async getParentInfo(parentId: string) {
    const { data: parent, error: parentError } = await this.supabase
      .from('parents')
      .select(`
        id,
        first_name,
        last_name,
        email,
        status,
        created_at,
        updated_at
      `)
      .eq('id', parentId)
      .single();

    if (parentError || !parent) {
      throw new UnauthorizedException('Parent not found');
    }

    // Optionally, fetch linked students
    const { data: links } = await this.supabase
      .from('parent_student_links')
      .select(`
        id,
        relationship,
        student:students(
          id,
          first_name,
          last_name,
          username,
          class:classes(id, name, level),
          school:schools(id, name, code)
        )
      `)
      .eq('parent_id', parentId);

    const children =
      (links || []).map((link: any) => ({
        id: link.student?.id,
        first_name: link.student?.first_name,
        last_name: link.student?.last_name,
        username: link.student?.username,
        relationship: link.relationship,
        class: link.student?.class,
        school: link.student?.school,
      })) || [];

    return {
      ...parent,
      children: children.length > 0 ? children : undefined,
    };
  }

  // ---------- Parent: login with 4-digit PIN ----------
  async parentLoginWithPin(email: string, pin: string): Promise<{ token: string; user: any }> {
    const normalizedEmail = email.trim().toLowerCase();
    const { data: parent, error } = await this.supabase
      .from('parents')
      .select('id, email, first_name, last_name, pin_hash, status')
      .eq('email', normalizedEmail)
      .single();

    if (error || !parent) {
      throw new UnauthorizedException('Invalid email or PIN.');
    }
    if (parent.status !== 'active') {
      throw new UnauthorizedException('Your account is not active.');
    }
    const pinHash = (parent as any).pin_hash;
    if (!pinHash) {
      throw new UnauthorizedException('Please use the verification code flow to set your PIN first.');
    }
    const valid = await bcrypt.compare(pin, pinHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or PIN.');
    }
    const payload = { sub: parent.id, email: parent.email, role: 'parent' };
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: {
        id: parent.id,
        email: parent.email,
        first_name: parent.first_name,
        last_name: parent.last_name,
        role: 'parent',
      },
    };
  }

  async parentSendVerificationCode(email: string): Promise<{ success: true }> {
    const normalizedEmail = email.trim().toLowerCase();
    const rateLimitKey = `parent:sendcode:${normalizedEmail}`;
    if (this.isRateLimited(rateLimitKey)) {
      throw new UnauthorizedException('Too many attempts. Please try again in 15 minutes.');
    }
    const { data: parent, error } = await this.supabase
      .from('parents')
      .select('id, email, status')
      .eq('email', normalizedEmail)
      .single();

    if (error || !parent) {
      this.recordFailedAttempt(rateLimitKey);
      throw new UnauthorizedException('No parent account found for this email.');
    }
    if (parent.status !== 'active') {
      throw new UnauthorizedException('Your account is not active.');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const cacheKey = `parent:code:${normalizedEmail}`;
    await this.cacheService.set(cacheKey, { code }, 600, 'auth');
    try {
      await this.mailerService.sendVerificationCode(normalizedEmail, code);
    } catch (err: any) {
      this.logger.error(`Parent send code failed: ${err?.message || err}`);
      throw new UnauthorizedException('We could not send the verification email. Please try again later.');
    }
    this.clearRateLimit(rateLimitKey);
    return { success: true };
  }

  async parentVerifyCode(
    email: string,
    code: string,
  ): Promise<{ verification_token: string; requires_pin_set: boolean; user?: any }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cacheKey = `parent:code:${normalizedEmail}`;
    const stored = await this.cacheService.get<{ code: string }>(cacheKey, 'auth');
    if (!stored || stored.code !== code) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }
    const { data: parent, error } = await this.supabase
      .from('parents')
      .select('id, email, first_name, last_name, pin_hash')
      .eq('email', normalizedEmail)
      .single();

    if (error || !parent) {
      throw new UnauthorizedException('Parent account not found.');
    }
    await this.cacheService.delete(cacheKey, 'auth');
    const verificationToken = randomBytes(24).toString('hex');
    const tokenKey = `parent:verified:${verificationToken}`;
    await this.cacheService.set(tokenKey, { email: normalizedEmail, parentId: parent.id }, 300, 'auth');
    const requiresPinSet = !(parent as any).pin_hash;
    return {
      verification_token: verificationToken,
      requires_pin_set: requiresPinSet,
      user: requiresPinSet ? { id: parent.id, email: parent.email, first_name: parent.first_name, last_name: parent.last_name } : undefined,
    };
  }

  async parentSetPin(verificationToken: string, pin: string): Promise<{ token: string; user: any }> {
    const tokenKey = `parent:verified:${verificationToken}`;
    const stored = await this.cacheService.get<{ email: string; parentId: string }>(tokenKey, 'auth');
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired verification. Please start over.');
    }
    const { data: parent, error } = await this.supabase
      .from('parents')
      .select('id, email, first_name, last_name, pin_hash')
      .eq('id', stored.parentId)
      .single();

    if (error || !parent) {
      throw new UnauthorizedException('Parent not found.');
    }
    if ((parent as any).pin_hash) {
      throw new UnauthorizedException('PIN already set. Use Enter PIN to sign in.');
    }
    const pinHash = await bcrypt.hash(pin, 10);
    const { error: updateError } = await this.supabase
      .from('parents')
      .update({ pin_hash: pinHash, updated_at: new Date().toISOString() })
      .eq('id', stored.parentId);

    if (updateError) {
      throw new UnauthorizedException('Failed to set PIN.');
    }
    await this.cacheService.delete(tokenKey, 'auth');
    const payload = { sub: parent.id, email: parent.email, role: 'parent' };
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: { id: parent.id, email: parent.email, first_name: parent.first_name, last_name: parent.last_name, role: 'parent' },
    };
  }

  async parentSubmitPin(verificationToken: string, pin: string): Promise<{ token: string; user: any }> {
    const tokenKey = `parent:verified:${verificationToken}`;
    const stored = await this.cacheService.get<{ email: string; parentId: string }>(tokenKey, 'auth');
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired verification. Please start over.');
    }
    const { data: parent, error } = await this.supabase
      .from('parents')
      .select('id, email, first_name, last_name, pin_hash')
      .eq('id', stored.parentId)
      .single();

    if (error || !parent) {
      throw new UnauthorizedException('Parent not found.');
    }
    const valid = await bcrypt.compare(pin, (parent as any).pin_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid PIN.');
    }
    await this.cacheService.delete(tokenKey, 'auth');
    const payload = { sub: parent.id, email: parent.email, role: 'parent' };
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: { id: parent.id, email: parent.email, first_name: parent.first_name, last_name: parent.last_name, role: 'parent' },
    };
  }

  async parentSendRegisterCode(email: string): Promise<{ success: true }> {
    const normalizedEmail = email.trim().toLowerCase();
    const rateLimitKey = `parent:register:send:${normalizedEmail}`;
    if (this.isRateLimited(rateLimitKey)) {
      throw new UnauthorizedException('Too many attempts. Please try again in 15 minutes.');
    }
    const { data: existing } = await this.supabase
      .from('parents')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      throw new UnauthorizedException('An account with this email already exists. Please log in.');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const cacheKey = `parent:register:code:${normalizedEmail}`;
    await this.cacheService.set(cacheKey, { code }, 600, 'auth');
    try {
      await this.mailerService.sendVerificationCode(normalizedEmail, code);
    } catch (err: any) {
      this.logger.error(`Parent register send code failed: ${err?.message || err}`);
      throw new UnauthorizedException('We could not send the verification email. Please try again later.');
    }
    this.clearRateLimit(rateLimitKey);
    return { success: true };
  }

  async parentVerifyRegisterCode(email: string, code: string): Promise<{ verification_token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cacheKey = `parent:register:code:${normalizedEmail}`;
    const stored = await this.cacheService.get<{ code: string }>(cacheKey, 'auth');
    if (!stored || stored.code !== code) {
      throw new UnauthorizedException('Invalid or expired verification code.');
    }
    await this.cacheService.delete(cacheKey, 'auth');
    const verificationToken = randomBytes(24).toString('hex');
    const tokenKey = `parent:register:verified:${verificationToken}`;
    await this.cacheService.set(tokenKey, { email: normalizedEmail }, 300, 'auth');
    return { verification_token: verificationToken };
  }

  async parentCompleteRegistration(
    verificationToken: string,
    pin: string,
    first_name: string,
    last_name: string,
  ): Promise<{ token: string; user: any }> {
    const tokenKey = `parent:register:verified:${verificationToken}`;
    const stored = await this.cacheService.get<{ email: string }>(tokenKey, 'auth');
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired verification. Please start over.');
    }
    const normalizedEmail = stored.email.trim().toLowerCase();
    const { data: existing } = await this.supabase
      .from('parents')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      await this.cacheService.delete(tokenKey, 'auth');
      throw new UnauthorizedException('An account with this email already exists. Please log in.');
    }
    const pinHash = await bcrypt.hash(pin, 10);
    const { data: parent, error } = await this.supabase
      .from('parents')
      .insert({
        email: normalizedEmail,
        first_name: (first_name || '').trim() || 'Parent',
        last_name: (last_name || '').trim() || 'User',
        pin_hash: pinHash,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Parent registration insert error: ${JSON.stringify(error)}`);
      throw new UnauthorizedException('Failed to create account.');
    }
    await this.cacheService.delete(tokenKey, 'auth');
    try {
      await this.mailerService.sendWelcomeCredentials(normalizedEmail, (first_name || '').trim());
    } catch (err: any) {
      this.logger.warn(`Welcome email failed: ${err?.message || err}. Account was created.`);
    }
    const payload = { sub: parent.id, email: parent.email, role: 'parent' };
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: { id: parent.id, email: parent.email, first_name: parent.first_name, last_name: parent.last_name, role: 'parent' },
    };
  }

  async parentRequestPinReset(email: string): Promise<{ success: true }> {
    const normalizedEmail = email.trim().toLowerCase();
    const { data: parent, error } = await this.supabase
      .from('parents')
      .select('id, status')
      .eq('email', normalizedEmail)
      .single();

    if (error || !parent) {
      throw new UnauthorizedException('No parent account found for this email.');
    }
    if (parent.status !== 'active') {
      throw new UnauthorizedException('Your account is not active.');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const cacheKey = `parent:pinreset:${normalizedEmail}`;
    await this.cacheService.set(cacheKey, { code }, 600, 'auth');
    try {
      await this.mailerService.sendPinResetCode(normalizedEmail, code);
    } catch (err: any) {
      this.logger.error(`PIN reset send failed: ${err?.message || err}`);
      throw new UnauthorizedException('We could not send the reset code. Please try again later.');
    }
    return { success: true };
  }

  async parentResetPin(email: string, code: string, new_pin: string): Promise<{ success: true }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cacheKey = `parent:pinreset:${normalizedEmail}`;
    const stored = await this.cacheService.get<{ code: string }>(cacheKey, 'auth');
    if (!stored || stored.code !== code) {
      throw new UnauthorizedException('Invalid or expired code.');
    }
    const { data: parent, error } = await this.supabase
      .from('parents')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (error || !parent) {
      throw new UnauthorizedException('Parent not found.');
    }
    const pinHash = await bcrypt.hash(new_pin, 10);
    const { error: updateError } = await this.supabase
      .from('parents')
      .update({ pin_hash: pinHash, updated_at: new Date().toISOString() })
      .eq('id', parent.id);

    if (updateError) {
      throw new UnauthorizedException('Failed to reset PIN.');
    }
    await this.cacheService.delete(cacheKey, 'auth');
    return { success: true };
  }

  async linkChildToParent(parentId: string, studentUsername: string, relationship?: string) {
    const username = (studentUsername || '').trim().toLowerCase();
    if (!username) throw new UnauthorizedException('Student username is required');

    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id')
      .eq('username', username)
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found with that username');
    }

    const { error: linkError } = await this.supabase
      .from('parent_student_links')
      .insert({
        parent_id: parentId,
        student_id: student.id,
        relationship: relationship?.trim() || null,
      });

    if (linkError) {
      if (linkError.code === '23505') {
        throw new UnauthorizedException('This child is already linked to your account');
      }
      this.logger.error(`linkChildToParent: ${linkError.message}`);
      throw new UnauthorizedException('Failed to link child');
    }

    return { success: true, message: 'Child linked successfully' };
  }

  // ============ SCHOOL LOGIN & PROFILE ============
  async schoolLogin(email: string, password: string) {
    this.logger.log(`=== SCHOOL LOGIN ATTEMPT ===`);
    this.logger.log(`Email: ${email}`);
    this.logger.log(`Password length: ${password?.length || 0}`);

    try {
      // Query school from Supabase - can use either email or auto_email
      this.logger.log(`Querying database for school...`);
      // First try email, then try auto_email
      let { data: school, error } = await this.supabase
        .from('schools')
        .select('id, name, code, email, auto_email, password_hash, status, location, phone')
        .eq('email', email)
        .single();

      // If not found by email, try auto_email
      if (error || !school) {
        const { data: schoolByAutoEmail, error: autoEmailError } = await this.supabase
          .from('schools')
          .select('id, name, code, email, auto_email, password_hash, status, location, phone')
          .eq('auto_email', email)
          .single();
        
        if (!autoEmailError && schoolByAutoEmail) {
          school = schoolByAutoEmail;
          error = null;
        }
      }

      if (error) {
        this.logger.error(`Database error: ${JSON.stringify(error)}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!school) {
        this.logger.warn(`School not found for email: ${email}`);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Check if school is active
      if (school.status !== 'active') {
        this.logger.warn(`School account is not active: ${email}`);
        throw new UnauthorizedException('Your account is not active. Please contact your administrator.');
      }

      this.logger.log(`School found: ${school.name}, ID: ${school.id}`);

      // Verify password
      this.logger.log(`Comparing passwords...`);
      const isPasswordValid = await bcrypt.compare(password, school.password_hash);
      this.logger.log(`Password valid: ${isPasswordValid}`);

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password attempt for email: ${email}`);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Generate JWT token
      const payload = {
        sub: school.id,
        email: school.email || school.auto_email,
        role: 'school',
      };

      const token = this.jwtService.sign(payload);

      this.logger.log(`✅ Successful login for school: ${school.name}`);

      return {
        token,
        user: {
          id: school.id,
          name: school.name,
          code: school.code,
          email: school.email || school.auto_email,
          role: 'school',
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`School login error: ${error.message}`, (error as any).stack);
      throw new UnauthorizedException('Login failed. Please check your credentials and try again.');
    }
  }

  private isNetworkError(err: any): boolean {
    const msg = err?.message?.toLowerCase?.() ?? '';
    return msg.includes('fetch failed') || msg.includes('network') || msg.includes('econnrefused') || err?.name === 'TypeError';
  }

  async getSchoolInfo(schoolId: string) {
    let school: any;
    let schoolError: any;
    try {
      const res = await this.supabase
        .from('schools')
        .select(`
          id,
          name,
          code,
          email,
          auto_email,
          location,
          phone,
          status,
          logo_url,
          created_at,
          updated_at
        `)
        .eq('id', schoolId)
        .single();
      school = res.data;
      schoolError = res.error;
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        throw new ServiceUnavailableException('Database temporarily unavailable. Please try again.');
      }
      throw err;
    }

    if (schoolError || !school) {
      if (schoolError && this.isNetworkError(schoolError)) {
        throw new ServiceUnavailableException('Database temporarily unavailable. Please try again.');
      }
      throw new UnauthorizedException('School not found');
    }

    // Fetch classes with student counts
    let classes: any[] = [];
    let totalStudentsCount: number | null = null;
    try {
      const { data: classesData } = await this.supabase
        .from('classes')
        .select(`
          id,
          name,
          level,
          description,
          status,
          students:students(count)
        `)
        .eq('school_id', schoolId)
        .eq('status', 'active');
      classes = classesData ?? [];

      const { count } = await this.supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'active');
      totalStudentsCount = count ?? 0;
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        throw new ServiceUnavailableException('Database temporarily unavailable. Please try again.');
      }
      throw err;
    }

    const classList = (classes || []).map((cls: any) => ({
      id: cls.id,
      name: cls.name,
      level: cls.level,
      description: cls.description,
      status: cls.status,
      student_count: cls.students?.[0]?.count || 0,
    }));

    // Overall school performance: mean of best quiz % of all students who have done quizzes
    let overall_performance_rating: string | null = null;
    let overall_average_percentage: number = 0;
    try {
      const { data: schoolStudents } = await this.supabase
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('status', 'active');
      const studentIds = (schoolStudents || []).map((s: any) => s.id);
      if (studentIds.length > 0) {
        const { data: attempts } = await this.supabase
          .from('student_quiz_attempts')
          .select('student_id, percentage')
          .in('student_id', studentIds)
          .eq('status', 'completed');
        const bestPctByStudent: Record<string, number> = {};
        (attempts || []).forEach((a: any) => {
          const current = bestPctByStudent[a.student_id] ?? 0;
          const pct = typeof a.percentage === 'number' ? a.percentage : parseFloat(String(a.percentage ?? 0)) || 0;
          if (pct > current) bestPctByStudent[a.student_id] = pct;
        });
        const percentages = Object.values(bestPctByStudent).filter((p) => p > 0);
        if (percentages.length > 0) {
          const mean = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
          overall_average_percentage = Math.round(mean * 100) / 100;
          if (mean <= 25) overall_performance_rating = 'below_expectation';
          else if (mean <= 50) overall_performance_rating = 'approaching';
          else if (mean <= 75) overall_performance_rating = 'meeting';
          else overall_performance_rating = 'exceeding';
        }
      }
    } catch {
      // leave overall as null/0 on error
    }

    return {
      ...school,
      classes: classList,
      total_students: totalStudentsCount ?? 0,
      total_classes: classList.length,
      overall_performance_rating,
      overall_average_percentage,
    };
  }

  // Create parent account from student login session
  async createParentAccount(
    studentId: string,
    dto: {
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
    },
  ) {
    this.logger.log(`Creating parent account for student: ${studentId}`);

    // Check if email already exists
    const { data: existingParent } = await this.supabase
      .from('parents')
      .select('id')
      .eq('email', dto.email)
      .single();

    if (existingParent) {
      throw new UnauthorizedException('An account with this email already exists');
    }

    // Get student info to use for parent name if not provided
    const { data: student } = await this.supabase
      .from('students')
      .select('first_name, last_name')
      .eq('id', studentId)
      .single();

    // Hash password (4-digit password)
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create parent account
    const { data: parent, error } = await this.supabase
      .from('parents')
      .insert({
        email: dto.email,
        password_hash: passwordHash,
        first_name: dto.first_name || student?.first_name || 'Parent',
        last_name: dto.last_name || student?.last_name || '',
        phone: dto.phone || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Error creating parent account: ${error.message}`);
      throw new UnauthorizedException('Failed to create parent account');
    }

    // Automatically link the student to this parent
    await this.linkStudentToParent(parent.id, studentId, 'child');

    // Generate JWT token for the new parent account
    const payload = {
      sub: parent.id,
      email: parent.email,
      role: 'parent',
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`✅ Parent account created: ${parent.email}`);

    return {
      token,
      user: {
        id: parent.id,
        email: parent.email,
        first_name: parent.first_name,
        last_name: parent.last_name,
        role: 'parent',
      },
    };
  }

  // Link a student to a parent by username
  async linkStudentToParent(
    parentId: string,
    studentIdOrUsername: string,
    relationship: string = 'child',
  ) {
    this.logger.log(`Linking student to parent: ${parentId}`);

    // Check if studentIdOrUsername is a UUID (student ID) or username
    let studentId: string;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      studentIdOrUsername,
    );

    if (isUUID) {
      studentId = studentIdOrUsername;
    } else {
      // It's a username, find the student
      const { data: student, error: studentError } = await this.supabase
        .from('students')
        .select('id')
        .eq('username', studentIdOrUsername)
        .single();

      if (studentError || !student) {
        throw new UnauthorizedException('Student not found with that username');
      }

      studentId = student.id;
    }

    // Check if link already exists
    const { data: existingLink } = await this.supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('student_id', studentId)
      .single();

    if (existingLink) {
      throw new UnauthorizedException('This student is already linked to your account');
    }

    // Create the link
    const { data: link, error } = await this.supabase
      .from('parent_student_links')
      .insert({
        parent_id: parentId,
        student_id: studentId,
        relationship: relationship,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Error linking student: ${error.message}`);
      throw new UnauthorizedException('Failed to link student');
    }

    this.logger.log(`✅ Student linked to parent`);
    return link;
  }

  // Get student course levels for parent
  async getStudentCourseLevelsForParent(parentId: string, studentId: string) {
    // Verify parent has access to this student
    const { data: link } = await this.supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('student_id', studentId)
      .single();

    if (!link) {
      throw new UnauthorizedException('You do not have access to this student');
    }

    // Get student's class
    const { data: student } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', studentId)
      .single();

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Get course level assignments for the student's class
    const { data: assignments } = await this.supabase
      .from('class_course_level_assignments')
      .select(`
        id,
        course_level_id,
        enrollment_status,
        course_level:course_levels(
          id,
          name,
          level_number,
          description,
          course:courses(id, name, code)
        )
      `)
      .eq('class_id', student.class_id)
      .order('created_at', { ascending: true });

    if (!assignments) {
      return { courses: [] };
    }

    // Transform the data
    const coursesMap = new Map();
    
    assignments.forEach((assignment: any) => {
      const level = Array.isArray(assignment.course_level) 
        ? assignment.course_level[0] 
        : assignment.course_level;
      
      if (!level) return;

      const course = Array.isArray(level.course) 
        ? level.course[0] 
        : level.course;

      const courseId = course?.id || 'unknown';
      
      if (!coursesMap.has(courseId)) {
        coursesMap.set(courseId, {
          id: courseId,
          name: course?.name || 'Unknown Course',
          code: course?.code || '',
          levels: [],
        });
      }

      const courseData = coursesMap.get(courseId);
      courseData.levels.push({
        id: level.id,
        course_id: courseId,
        level_number: level.level_number,
        name: level.name,
        description: level.description,
        enrollment_status: assignment.enrollment_status,
        assignment_id: assignment.id,
      });
    });

    return {
      courses: Array.from(coursesMap.values()),
    };
  }

  // Get student exam attempts for parent
  async getStudentExamAttemptsForParent(parentId: string, studentId: string) {
    // Verify parent has access to this student
    const { data: link } = await this.supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('student_id', studentId)
      .single();

    if (!link) {
      throw new UnauthorizedException('You do not have access to this student');
    }

    // Get exam attempts
    const { data: attempts, error } = await this.supabase
      .from('student_exam_attempts')
      .select(`
        id,
        student_id,
        exam_id,
        score,
        max_score,
        percentage,
        passed,
        time_spent_seconds,
        started_at,
        completed_at,
        status,
        exam:exams(
          id,
          title,
          total_points,
          passing_score,
          topic_id,
          topic:topics(
            id,
            name,
            level_id,
            level:course_levels(
              id,
              name,
              course_id,
              course:courses(id, name)
            )
          )
        )
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Error fetching exam attempts: ${JSON.stringify(error)}`);
      return [];
    }

    return (attempts || []).map((attempt: any) => ({
      id: attempt.id,
      student_id: attempt.student_id,
      exam_id: attempt.exam_id,
      score: attempt.score,
      max_score: attempt.max_score,
      percentage: attempt.percentage,
      passed: attempt.passed,
      time_spent_seconds: attempt.time_spent_seconds || 0,
      started_at: attempt.started_at,
      completed_at: attempt.completed_at,
      status: attempt.status,
      exam: attempt.exam ? {
        id: attempt.exam.id,
        title: attempt.exam.title,
        total_points: attempt.exam.total_points,
        passing_score: attempt.exam.passing_score,
        topic: attempt.exam.topic ? {
          id: attempt.exam.topic.id,
          name: attempt.exam.topic.name,
          level: attempt.exam.topic.level ? {
            id: attempt.exam.topic.level.id,
            name: attempt.exam.topic.level.name,
            course: attempt.exam.topic.level.course ? {
              id: attempt.exam.topic.level.course.id,
              name: attempt.exam.topic.level.course.name,
            } : undefined,
          } : undefined,
        } : undefined,
      } : undefined,
    }));
  }

  // Get student quiz attempts (course > course level > topic > quizzes) with results for parent report
  async getStudentQuizAttemptsForParent(parentId: string, studentId: string) {
    const { data: link } = await this.supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('student_id', studentId)
      .single();
    if (!link) {
      throw new UnauthorizedException('You do not have access to this student');
    }
    const { data: attempts, error } = await this.supabase
      .from('student_quiz_attempts')
      .select(`
        id,
        student_id,
        quiz_id,
        score,
        max_score,
        percentage,
        passed,
        status,
        started_at,
        completed_at,
        quiz:quizzes(
          id,
          title,
          total_points,
          passing_score,
          topic_id,
          topic:topics(
            id,
            name,
            level_id,
            level:course_levels(
              id,
              name,
              course_id,
              course:courses(id, name, code)
            )
          )
        )
      `)
      .eq('student_id', studentId)
      .order('completed_at', { ascending: false });

    if (error) {
      this.logger.error(`getStudentQuizAttemptsForParent: ${error.message}`);
      return [];
    }
    const levelNorm = (l: any) => (Array.isArray(l) ? l[0] : l);
    const courseNorm = (c: any) => (Array.isArray(c) ? c[0] : c);
    return (attempts || []).map((a: any) => {
      const quiz = a.quiz;
      const topic = quiz ? levelNorm(quiz.topic) : null;
      const level = topic ? levelNorm(topic.level) : null;
      const course = level ? courseNorm(level.course) : null;
      return {
        id: a.id,
        student_id: a.student_id,
        quiz_id: a.quiz_id,
        score: a.score,
        max_score: a.max_score,
        percentage: a.percentage,
        passed: a.passed,
        status: a.status,
        started_at: a.started_at,
        completed_at: a.completed_at,
        quiz: quiz ? {
          id: quiz.id,
          title: quiz.title,
          total_points: quiz.total_points,
          passing_score: quiz.passing_score,
          topic_id: quiz.topic_id,
          topic: topic ? {
            id: topic.id,
            name: topic.name,
            level: level ? { id: level.id, name: level.name, course } : undefined,
            course,
          } : undefined,
        } : undefined,
      };
    });
  }

  // Get student take-away assignments for parent (report)
  async getStudentTakeAwayForParent(parentId: string, studentId: string) {
    const { data: link } = await this.supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('student_id', studentId)
      .single();
    if (!link) {
      throw new UnauthorizedException('You do not have access to this student');
    }
    return this.takeAwayService.getStudentAssignments(studentId);
  }

  // Get student portfolio for parent (report)
  async getStudentPortfolioForParent(parentId: string, studentId: string) {
    const { data: link } = await this.supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('student_id', studentId)
      .single();
    if (!link) {
      throw new UnauthorizedException('You do not have access to this student');
    }
    return this.studentCoursesService.getStudentPortfolio(studentId);
  }

  // Get student overview (courses + tutors) for parent (report)
  async getStudentOverviewForParent(parentId: string, studentId: string) {
    const { data: link } = await this.supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_id', parentId)
      .eq('student_id', studentId)
      .single();
    if (!link) {
      throw new UnauthorizedException('You do not have access to this student');
    }
    const courseLevelsPayload = await this.getStudentCourseLevelsForParent(parentId, studentId);
    const { data: student } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', studentId)
      .single();
    let tutors: { id: string; first_name: string; middle_name?: string; last_name: string; email: string; role?: string }[] = [];
    if (student?.class_id) {
      const { data: tutorAssignments } = await this.supabase
        .from('tutor_class_assignments')
        .select(`
          tutor_id,
          role,
          tutor:tutors(id, first_name, middle_name, last_name, email)
        `)
        .eq('class_id', student.class_id)
        .eq('status', 'active');
      if (tutorAssignments?.length) {
        tutors = tutorAssignments.map((ta: any) => {
          const t = Array.isArray(ta.tutor) ? ta.tutor[0] : ta.tutor;
          return {
            id: t?.id ?? ta.tutor_id,
            first_name: t?.first_name ?? '',
            middle_name: t?.middle_name,
            last_name: t?.last_name ?? '',
            email: t?.email ?? '',
            role: ta.role,
          };
        });
      }
    }
    return {
      courses: courseLevelsPayload.courses ?? [],
      tutors,
    };
  }

  // Unlink a student from a parent
  async unlinkStudentFromParent(parentId: string, studentId: string) {
    const { error } = await this.supabase
      .from('parent_student_links')
      .delete()
      .eq('parent_id', parentId)
      .eq('student_id', studentId);

    if (error) {
      this.logger.error(`Error unlinking student: ${error.message}`);
      throw new UnauthorizedException('Failed to unlink student');
    }

    return { success: true };
  }

  /**
   * List parents who have linked at least one student. For admin dashboard.
   * Optionally filter by school_id so only parents with a student in that school are returned.
   */
  async getParentsForAdmin(schoolId?: string) {
    let linksQuery = this.supabase
      .from('parent_student_links')
      .select(`
        parent_id,
        student_id,
        relationship,
        parent:parents(id, first_name, last_name, email, status),
        student:students(
          id,
          first_name,
          last_name,
          class_id,
          class:classes(id, name),
          school_id,
          school:schools(id, name)
        )
      `);

    const { data: links, error } = await linksQuery;
    if (error) {
      this.logger.error(`getParentsForAdmin: ${error.message}`);
      return [];
    }
    if (!links || links.length === 0) return [];

    let filtered = links;
    if (schoolId) {
      filtered = links.filter((l: any) => {
        const s = Array.isArray(l.student) ? l.student[0] : l.student;
        return s?.school_id === schoolId;
      });
    }

    const byParent = new Map<
      string,
      { parent: any; children: Array<{ name: string; class?: string; school?: string }> }
    >();
    for (const link of filtered) {
      const parent = Array.isArray(link.parent) ? link.parent[0] : link.parent;
      const student = Array.isArray(link.student) ? link.student[0] : link.student;
      if (!parent) continue;
      const pid = parent.id;
      const childName = student ? [student.first_name, student.last_name].filter(Boolean).join(' ') || 'Student' : 'Student';
      const classObj = student?.class as { id?: string; name?: string } | { id?: string; name?: string }[] | undefined;
      const schoolObj = student?.school as { id?: string; name?: string } | { id?: string; name?: string }[] | undefined;
      const className = Array.isArray(classObj) ? classObj[0]?.name : (classObj as { name?: string })?.name;
      const schoolName = Array.isArray(schoolObj) ? schoolObj[0]?.name : (schoolObj as { name?: string })?.name;

      if (!byParent.has(pid)) {
        byParent.set(pid, {
          parent: { id: parent.id, first_name: parent.first_name, last_name: parent.last_name, email: parent.email, status: parent.status },
          children: [] as Array<{ name: string; class?: string; school?: string }>,
        });
      }
      const entry = byParent.get(pid)!;
      const childEntry = { name: childName, class: className, school: schoolName };
      const seen = new Set(entry.children.map((c) => (c as { name: string; class?: string }).name + '|' + (c as { name: string; class?: string }).class));
      if (!seen.has(childEntry.name + '|' + childEntry.class)) {
        entry.children.push(childEntry);
      }
    }

    return Array.from(byParent.values()).map(({ parent, children }) => {
      const schoolNames = [...new Set(children.map((c) => c.school).filter(Boolean))] as string[];
      return {
        id: parent.id,
        name: [parent.first_name, parent.last_name].filter(Boolean).join(' ') || parent.email,
        email: parent.email,
        school: schoolNames.length ? schoolNames.join(', ') : undefined,
        children,
        status: parent.status || 'active',
      };
    });
  }

  // ============ RATE LIMITING HELPERS ============
  
  /**
   * Check if an identifier is rate limited
   */
  private isRateLimited(key: string): boolean {
    const attempt = this.loginAttempts.get(key);
    if (!attempt) {
      return false;
    }

    // Check if lockout period has expired
    if (Date.now() > attempt.resetAt) {
      this.loginAttempts.delete(key);
      return false;
    }

    return attempt.count >= this.MAX_LOGIN_ATTEMPTS;
  }

  /**
   * Record a failed login attempt
   */
  private recordFailedAttempt(key: string): void {
    const attempt = this.loginAttempts.get(key);
    if (!attempt) {
      this.loginAttempts.set(key, {
        count: 1,
        resetAt: Date.now() + this.LOCKOUT_DURATION,
      });
    } else {
      // If lockout period expired, reset
      if (Date.now() > attempt.resetAt) {
        this.loginAttempts.set(key, {
          count: 1,
          resetAt: Date.now() + this.LOCKOUT_DURATION,
        });
      } else {
        // Increment count
        attempt.count++;
      }
    }

    // Clean up old entries periodically (every 1000 attempts)
    if (this.loginAttempts.size > 10000) {
      this.cleanupOldAttempts();
    }
  }

  /**
   * Clear rate limit for successful login
   */
  private clearRateLimit(key: string): void {
    this.loginAttempts.delete(key);
  }

  /**
   * Clean up old rate limit entries
   */
  private cleanupOldAttempts(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.loginAttempts.forEach((attempt, key) => {
      if (now > attempt.resetAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.loginAttempts.delete(key));
    this.logger.debug(`Cleaned up ${keysToDelete.length} expired rate limit entries`);
  }
}



