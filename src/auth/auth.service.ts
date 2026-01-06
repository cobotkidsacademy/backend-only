import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private jwtService: JwtService,
  ) {}

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
        .eq('role', 'admin')
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

  async studentLogin(username: string, password: string) {
    this.logger.log(`=== STUDENT LOGIN ATTEMPT ===`);
    this.logger.log(`Username: ${username}`);
    this.logger.log(`Password length: ${password?.length || 0}`);

    try {
      // Query student from Supabase
      this.logger.log(`Querying database for student...`);
      const { data: student, error } = await this.supabase
      .from('students')
      .select('id, username, password_hash, first_name, last_name, status, class_id, school_id, login_count, last_login')
      .eq('username', username)
      .single();

      if (error) {
        this.logger.error(`Database error: ${JSON.stringify(error)}`);
        throw new UnauthorizedException('Invalid credentials');
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
      this.logger.log(`Password valid: ${isPasswordValid}`);

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password attempt for username: ${username}`);
        throw new UnauthorizedException('Invalid username or password');
      }

      // Update login tracking (last_login and login_count)
      const currentLoginCount = (student as any).login_count || 0;
      await this.supabase
        .from('students')
        .update({
          last_login: new Date().toISOString(),
          login_count: currentLoginCount + 1,
        })
        .eq('id', student.id);

      // Generate JWT token
      const payload = {
        sub: student.id,
        username: student.username,
        role: 'student',
      };

      const token = this.jwtService.sign(payload);

      this.logger.log(`✅ Successful login for student: ${username}`);

      return {
        token,
        user: {
          id: student.id,
          username: student.username,
          first_name: student.first_name,
          last_name: student.last_name,
          role: 'student',
          class_id: student.class_id,
          school_id: student.school_id,
        },
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

  async tutorLogin(email: string, password: string) {
    this.logger.log(`=== TUTOR LOGIN ATTEMPT ===`);
    this.logger.log(`Email: ${email}`);
    this.logger.log(`Password length: ${password?.length || 0}`);

    try {
      // Query tutor from Supabase
      this.logger.log(`Querying database for tutor...`);
      const { data: tutor, error } = await this.supabase
        .from('tutors')
        .select('id, email, password_hash, first_name, middle_name, last_name, level, status')
        .eq('email', email)
        .single();

      if (error) {
        this.logger.error(`Database error: ${JSON.stringify(error)}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!tutor) {
        this.logger.warn(`Tutor not found for email: ${email}`);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Check if tutor is active
      if (tutor.status !== 'active') {
        this.logger.warn(`Tutor account is not active: ${email}`);
        throw new UnauthorizedException('Your account is not active. Please contact your administrator.');
      }

      this.logger.log(`Tutor found: ${tutor.email}, ID: ${tutor.id}`);

      // Verify password
      this.logger.log(`Comparing passwords...`);
      const isPasswordValid = await bcrypt.compare(password, tutor.password_hash);
      this.logger.log(`Password valid: ${isPasswordValid}`);

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password attempt for email: ${email}`);
        throw new UnauthorizedException('Invalid email or password');
      }

      // Generate JWT token
      const payload = {
        sub: tutor.id,
        email: tutor.email,
        role: 'tutor',
      };

      const token = this.jwtService.sign(payload);

      this.logger.log(`✅ Successful login for tutor: ${email}`);

      return {
        token,
        user: {
          id: tutor.id,
          email: tutor.email,
          first_name: tutor.first_name,
          middle_name: tutor.middle_name,
          last_name: tutor.last_name,
          level: tutor.level,
          role: 'tutor',
        },
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
}



