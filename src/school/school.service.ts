import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
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

  async getClassesBySchool(schoolId: string) {
    const { data, error } = await this.supabase
      .from('classes')
      .select(`
        *,
        students:students(count)
      `)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data.map(cls => ({
      ...cls,
      student_count: cls.students?.[0]?.count || 0,
    }));
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
}



