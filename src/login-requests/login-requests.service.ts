import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  CreateLoginRequestDto,
  UpdateLoginRequestDto,
  LoginRequest,
  LoginRequestStatus,
} from './dto/login-request.dto';

@Injectable()
export class LoginRequestsService {
  private readonly logger = new Logger(LoginRequestsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  async createLoginRequest(
    studentUsername: string,
    tutorId: string,
  ): Promise<LoginRequest> {
    // Find student by username
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, username, first_name, last_name, class_id, school_id')
      .eq('username', studentUsername)
      .eq('status', 'active')
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found');
    }

    // Verify tutor is assigned to student's class
    const { data: assignments, error: assignmentError } = await this.supabase
      .from('tutor_class_assignments')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('class_id', student.class_id)
      .eq('status', 'active')
      .limit(1);

    if (assignmentError || !assignments || assignments.length === 0) {
      throw new BadRequestException(
        'Tutor is not assigned to this student\'s class',
      );
    }

    // Check for existing pending request
    const { data: existing } = await this.supabase
      .from('login_requests')
      .select('id')
      .eq('student_id', student.id)
      .eq('tutor_id', tutorId)
      .eq('status', 'pending')
      .single();

    if (existing) {
      throw new BadRequestException(
        'A pending login request already exists for this student',
      );
    }

    // Create login request
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes expiry

    const { data, error } = await this.supabase
      .from('login_requests')
      .insert({
        student_id: student.id,
        tutor_id: tutorId,
        student_username: studentUsername,
        status: LoginRequestStatus.PENDING,
        expires_at: expiresAt.toISOString(),
      })
      .select(`
        *,
        student:students(
          id,
          username,
          first_name,
          last_name,
          class:classes(
            id,
            name,
            school:schools(id, name)
          )
        )
      `)
      .single();

    if (error) {
      this.logger.error(`Failed to create login request: ${error.message}`);
      throw new BadRequestException('Failed to create login request');
    }

    this.logger.log(
      `Login request created: student ${studentUsername} -> tutor ${tutorId}`,
    );

    return this.transformLoginRequest(data);
  }

  async getTutorLoginRequests(tutorId: string): Promise<LoginRequest[]> {
    // Expire old requests first
    await this.expireOldRequests();

    const { data, error } = await this.supabase
      .from('login_requests')
      .select(`
        *,
        student:students(
          id,
          username,
          first_name,
          last_name,
          class:classes(
            id,
            name,
            school:schools(id, name)
          )
        )
      `)
      .eq('tutor_id', tutorId)
      .in('status', ['pending', 'approved'])
      .order('requested_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to fetch login requests: ${error.message}`,
      );
      throw new BadRequestException('Failed to fetch login requests');
    }

    return (data || []).map((item) => this.transformLoginRequest(item));
  }

  async getPendingLoginRequests(tutorId: string): Promise<LoginRequest[]> {
    await this.expireOldRequests();

    const { data, error } = await this.supabase
      .from('login_requests')
      .select(`
        *,
        student:students(
          id,
          username,
          first_name,
          last_name,
          class:classes(
            id,
            name,
            school:schools(id, name)
          )
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to fetch pending requests');
    }

    return (data || []).map((item) => this.transformLoginRequest(item));
  }

  async updateLoginRequest(
    requestId: string,
    tutorId: string,
    dto: UpdateLoginRequestDto,
  ): Promise<{ request: LoginRequest; token?: string }> {
    // Verify request exists and belongs to tutor
    const { data: request, error: requestError } = await this.supabase
      .from('login_requests')
      .select('*, student:students(id, username, first_name, last_name)')
      .eq('id', requestId)
      .eq('tutor_id', tutorId)
      .single();

    if (requestError || !request) {
      throw new NotFoundException('Login request not found');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Request is no longer pending');
    }

    // Update request
    const updateData: any = {
      status: dto.status,
      responded_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await this.supabase
      .from('login_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(`
        *,
        student:students(
          id,
          username,
          first_name,
          last_name,
          class:classes(
            id,
            name,
            school:schools(id, name)
          )
        )
      `)
      .single();

    if (updateError) {
      throw new BadRequestException('Failed to update login request');
    }

    let token: string | undefined;

    // If approved, generate login token for student
    if (dto.status === LoginRequestStatus.APPROVED) {
      const student = Array.isArray(updated.student)
        ? updated.student[0]
        : updated.student;

      if (student) {
        // Get full student data for token
        const { data: fullStudent } = await this.supabase
          .from('students')
          .select('id, username, first_name, last_name, email, class_id, school_id')
          .eq('id', student.id)
          .single();

        if (fullStudent) {
          // Generate JWT token for student
          const payload = {
            sub: fullStudent.id,
            username: fullStudent.username,
            type: 'student',
          };

          token = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: '7d',
          });

          this.logger.log(
            `Login request approved: student ${fullStudent.username} logged in via tutor approval`,
          );
        }
      }
    }

    return {
      request: this.transformLoginRequest(updated),
      token,
    };
  }

  async getStudentPendingRequest(
    studentUsername: string,
  ): Promise<LoginRequest | null> {
    await this.expireOldRequests();

    const { data: student } = await this.supabase
      .from('students')
      .select('id')
      .eq('username', studentUsername)
      .single();

    if (!student) {
      return null;
    }

    const { data } = await this.supabase
      .from('login_requests')
      .select('*')
      .eq('student_id', student.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ? this.transformLoginRequest(data) : null;
  }

  async getStudentApprovedToken(
    studentUsername: string,
  ): Promise<{ token: string; user: any } | null> {
    await this.expireOldRequests();

    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, username, first_name, last_name, email, class_id, school_id')
      .eq('username', studentUsername)
      .single();

    if (studentError || !student) {
      return null;
    }

    // Check for recently approved request (within last 5 minutes)
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const { data: approvedRequest } = await this.supabase
      .from('login_requests')
      .select('*')
      .eq('student_id', student.id)
      .eq('status', 'approved')
      .gte('responded_at', fiveMinutesAgo.toISOString())
      .order('responded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!approvedRequest) {
      return null;
    }

    // Generate JWT token for student
    const payload = {
      sub: student.id,
      username: student.username,
      type: 'student',
    };

    const token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '7d',
    });

    return {
      token,
      user: {
        id: student.id,
        username: student.username,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
      },
    };
  }

  async getTutorsForStudent(studentUsername: string) {
    // Find student by username
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, username, class_id')
      .eq('username', studentUsername)
      .eq('status', 'active')
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found');
    }

    // Get tutors assigned to student's class
    const { data: assignments, error: assignmentError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        tutor_id,
        role,
        tutor:tutors(
          id,
          first_name,
          middle_name,
          last_name,
          email,
          level
        )
      `)
      .eq('class_id', student.class_id)
      .eq('status', 'active');

    if (assignmentError) {
      throw new BadRequestException('Failed to fetch tutors');
    }

    // Transform and return tutors
    return (assignments || []).map((assignment: any) => {
      const tutor = Array.isArray(assignment.tutor)
        ? assignment.tutor[0]
        : assignment.tutor;
      return {
        id: tutor.id,
        first_name: tutor.first_name,
        middle_name: tutor.middle_name,
        last_name: tutor.last_name,
        email: tutor.email,
        level: tutor.level,
        role: assignment.role,
      };
    });
  }

  private async expireOldRequests(): Promise<void> {
    await this.supabase.rpc('expire_old_login_requests');
  }

  private transformLoginRequest(data: any): LoginRequest {
    const student = Array.isArray(data.student)
      ? data.student[0]
      : data.student;

    return {
      id: data.id,
      student_id: data.student_id,
      tutor_id: data.tutor_id,
      status: data.status,
      student_username: data.student_username,
      requested_at: data.requested_at,
      responded_at: data.responded_at,
      expires_at: data.expires_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      student: student
        ? {
            id: student.id,
            username: student.username,
            first_name: student.first_name,
            last_name: student.last_name,
            class: student.class
              ? {
                  id: student.class.id,
                  name: student.class.name,
                  school: student.class.school
                    ? {
                        id: student.class.school.id,
                        name: student.class.school.name,
                      }
                    : undefined,
                }
              : undefined,
          }
        : undefined,
    };
  }
}

