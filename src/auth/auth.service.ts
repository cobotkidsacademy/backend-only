import { Injectable, UnauthorizedException, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { AttendanceService } from '../attendance/attendance.service';
import { CacheService } from '../core/cache/cache.service';

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
    this.logger.log(`=== STUDENT LOGIN ATTEMPT ===`);
    this.logger.log(`Username: ${username}`);

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
        this.logger.log(`Querying database for student...`);
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

      this.logger.log(`Student found: ${student.username}, ID: ${student.id}`);
      this.logger.log(`Password hash from DB (first 20 chars): ${student.password_hash?.substring(0, 20)}...`);

      // Verify password
      this.logger.log(`Comparing passwords...`);
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

      this.logger.log(`✅ Successful login for student: ${username}`);

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

  async getStudentInfo(studentId: string) {
    // Get student basic info
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

    // Get tutors assigned to the student's class
    const { data: tutorAssignments } = await this.supabase
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
      .eq('status', 'active');

    // Get course level assignments for the student's class
    const { data: courseLevelAssignments } = await this.supabase
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
      .order('created_at', { ascending: false });

    // Get student quiz performance (score category)
    const { data: studentPoints } = await this.supabase
      .from('student_total_points')
      .select('total_points, quizzes_completed')
      .eq('student_id', studentId)
      .maybeSingle();

    // Get highest quiz percentage to determine performance category
    const { data: bestScores } = await this.supabase
      .from('student_quiz_best_scores')
      .select('best_percentage')
      .eq('student_id', studentId)
      .order('best_percentage', { ascending: false })
      .limit(1);

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

    console.log('=== getStudentInfo Response ===');
    console.log('Student ID:', studentId);
    console.log('Student data:', student);
    console.log('Tutors:', tutors);
    console.log('Course levels:', courseLevels);
    console.log('Performance:', {
      category: performanceCategory,
      total_points: studentPoints?.total_points || 0,
      quizzes_completed: studentPoints?.quizzes_completed || 0,
      highest_percentage: bestScores && bestScores.length > 0 ? bestScores[0].best_percentage : 0,
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
        profile_image_url
      `)
      .eq('id', tutorId)
      .single();

    if (tutorError || !tutor) {
      throw new UnauthorizedException('Tutor not found');
    }

    return tutor;
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
        phone,
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

  async getSchoolInfo(schoolId: string) {
    const { data: school, error: schoolError } = await this.supabase
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

    if (schoolError || !school) {
      throw new UnauthorizedException('School not found');
    }

    // Fetch classes with student counts
    const { data: classes } = await this.supabase
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

    // Fetch total student count
    const { data: students } = await this.supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'active');

    const classList = (classes || []).map((cls: any) => ({
      id: cls.id,
      name: cls.name,
      level: cls.level,
      description: cls.description,
      status: cls.status,
      student_count: cls.students?.[0]?.count || 0,
    }));

    return {
      ...school,
      classes: classList,
      total_students: students?.length || 0,
      total_classes: classList.length,
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



