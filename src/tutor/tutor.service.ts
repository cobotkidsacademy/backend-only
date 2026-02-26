import { Injectable, Inject, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import { CreateTutorDto, UpdateTutorDto } from './dto/tutor.dto';

@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
  ) {}

  async createTutor(dto: CreateTutorDto) {
    this.logger.log(`Creating tutor: ${dto.first_name} ${dto.last_name}`);

    // Generate email: fname.lname@cobotkids.com
    const baseEmail = `${dto.first_name.toLowerCase()}.${dto.last_name.toLowerCase()}@cobotkids.com`;
    let email = baseEmail.replace(/[^a-z0-9.@]/g, '');

    // Check if email exists and make unique if needed
    let counter = 1;
    let finalEmail = email;
    while (true) {
      const { data: existing } = await this.supabase
        .from('tutors')
        .select('id')
        .eq('email', finalEmail)
        .single();

      if (!existing) break;
      finalEmail = email.replace('@', `${counter}@`);
      counter++;
    }

    // Default password for all new tutors
    const plainPassword = 'cobotkids2026';
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const { data, error } = await this.supabase
      .from('tutors')
      .insert({
        first_name: dto.first_name,
        middle_name: dto.middle_name,
        last_name: dto.last_name,
        level: dto.level,
        gender: dto.gender,
        phone: dto.phone,
        email: finalEmail,
        password_hash: passwordHash,
        plain_password: plainPassword,
        id_number: dto.id_number || null,
        nssf_no: dto.nssf_no || null,
        kra_pin: dto.kra_pin || null,
        location: dto.location || null,
        date_of_birth: dto.date_of_birth || null,
        profile_image_url: dto.profile_image_url || null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create tutor: ${error.message}`);
      throw new ConflictException(error.message);
    }

    this.logger.log(`Tutor created successfully: ${finalEmail}`);

    return {
      ...data,
      generated_email: finalEmail,
      generated_password: plainPassword,
    };
  }

  async getAllTutors() {
    const { data, error } = await this.supabase
      .from('tutors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async getTutorById(id: string) {
    const { data, error } = await this.supabase
      .from('tutors')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Tutor not found');
    }

    return data;
  }

  async updateTutor(id: string, dto: UpdateTutorDto) {
    // Get current tutor record so we can detect level/name changes
    const currentTutor = await this.getTutorById(id);

    // If names are being updated, regenerate tutor email
    let updateData: any = { ...dto };

    if (dto.first_name || dto.last_name) {
      const firstName = dto.first_name || currentTutor.first_name;
      const lastName = dto.last_name || currentTutor.last_name;

      const newEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@cobotkids.com`.replace(
        /[^a-z0-9.@]/g,
        '',
      );

      // Check if new email is different and available
      if (newEmail !== currentTutor.email) {
        const { data: existing } = await this.supabase
          .from('tutors')
          .select('id')
          .eq('email', newEmail)
          .neq('id', id)
          .single();

        if (!existing) {
          updateData.email = newEmail;
        }
      }
    }

    // Detect level/role transitions for manager/EDL roles
    const managerLevels = ['manager', 'curriculum_manager', 'operations_manager', 'edl'];
    const isCurrentlyManager = managerLevels.includes(currentTutor.level);
    const newLevel = dto.level || currentTutor.level;
    const isNewManager = managerLevels.includes(newLevel);

    let managerAdminCredentials: { email: string; password: string; role: string } | null = null;

    // If moving from manager-level back to intern/tutor etc, deactivate existing manager admin
    if (dto.level && isCurrentlyManager && !isNewManager && currentTutor.manager_admin_email) {
      await this.supabase
        .from('admins')
        .update({ role: 'disabled' })
        .eq('email', currentTutor.manager_admin_email);

      updateData.manager_admin_email = null;
      updateData.manager_admin_plain_password = null;
      updateData.manager_admin_role = null;
    }

    // If moving into a manager-level role (or changing between manager roles), (re)create credentials
    if (dto.level && isNewManager) {
      const firstName = (dto.first_name || currentTutor.first_name || '').toLowerCase();

      // Map level to email prefix (field name)
      let fieldName = dto.level;
      if (dto.level === 'operations_manager') {
        fieldName = 'operations';
      } else if (dto.level === 'curriculum_manager') {
        fieldName = 'curriculum';
      }

      // Email: fieldname.fname.cobotkid@edutech
      const baseAdminEmail = `${fieldName}.${firstName}.cobotkid@edutech`.replace(
        /[^a-z0-9.@]/g,
        '',
      );

      // Ensure uniqueness if needed
      let adminEmail = baseAdminEmail;
      let counter = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: existingAdmin } = await this.supabase
          .from('admins')
          .select('id')
          .eq('email', adminEmail)
          .maybeSingle();

        if (!existingAdmin) break;
        adminEmail = baseAdminEmail.replace('@', `${counter}@`);
        counter++;
      }

      // Generate password: 5 letters/digits + 1 symbol
      const lettersDigits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const symbols = '!@#$%&*?';

      const randomChar = (chars: string) =>
        chars.charAt(Math.floor(Math.random() * chars.length));

      let core = '';
      for (let i = 0; i < 5; i++) {
        core += randomChar(lettersDigits);
      }
      const symbol = randomChar(symbols);
      const plainPassword = core + symbol;

      const passwordHash = await bcrypt.hash(plainPassword, 10);

      // Try to update existing admin for this tutor if it exists, otherwise create a new one
      let adminError = null as any;
      if (currentTutor.manager_admin_email) {
        const { error } = await this.supabase
          .from('admins')
          .update({
            email: adminEmail,
            password_hash: passwordHash,
            role: dto.level,
          })
          .eq('email', currentTutor.manager_admin_email);
        adminError = error;
      } else {
        const { error } = await this.supabase.from('admins').insert({
          email: adminEmail,
          password_hash: passwordHash,
          role: dto.level,
        });
        adminError = error;
      }

      if (adminError) {
        this.logger.error(
          `Failed to create/update manager/EDL admin for tutor ${id}: ${adminError.message}`,
        );
      } else {
        managerAdminCredentials = {
          email: adminEmail,
          password: plainPassword,
          role: dto.level,
        };

        // Also store these details on the tutor record for later viewing in the admin UI
        updateData.manager_admin_email = adminEmail;
        updateData.manager_admin_plain_password = plainPassword;
        updateData.manager_admin_role = dto.level;
      }
    }

    const { data, error } = await this.supabase
      .from('tutors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Return tutor plus any generated manager/EDL admin credentials
    return {
      ...data,
      manager_admin_credentials: managerAdminCredentials || undefined,
    };
  }

  async deleteTutor(id: string) {
    const { error } = await this.supabase
      .from('tutors')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  }

  async getTutorsByLevel(level: string) {
    const { data, error } = await this.supabase
      .from('tutors')
      .select('*')
      .eq('level', level)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Reset tutor login to new format: email = fname.lname@cobotkids.com, password = cobotkids2026
   */
  async resetTutorCredentials(tutorId: string) {
    const tutor = await this.getTutorById(tutorId);
    const firstName = (tutor.first_name || '').trim().toLowerCase();
    const lastName = (tutor.last_name || '').trim().toLowerCase();
    const baseEmail = `${firstName}.${lastName}@cobotkids.com`.replace(/[^a-z0-9.@]/g, '');
    let finalEmail = baseEmail;
    let counter = 1;
    while (true) {
      const { data: existing } = await this.supabase
        .from('tutors')
        .select('id')
        .eq('email', finalEmail)
        .single();
      if (!existing || existing.id === tutorId) break;
      finalEmail = baseEmail.replace('@', `${counter}@`);
      counter++;
    }
    const plainPassword = 'cobotkids2026';
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const { data, error } = await this.supabase
      .from('tutors')
      .update({
        email: finalEmail,
        password_hash: passwordHash,
        plain_password: plainPassword,
      })
      .eq('id', tutorId)
      .select()
      .single();
    if (error) throw new ConflictException('Failed to reset credentials');
    return {
      ...data,
      generated_email: finalEmail,
      generated_password: plainPassword,
    };
  }

  async getAvailableLevels() {
    // Return available tutor levels based on database constraint
    // These match the CHECK constraint in the database
    return {
      levels: [
        { value: 'intern', label: 'Intern' },
        { value: 'tutor', label: 'Tutor' },
        { value: 'manager', label: 'Manager' },
        { value: 'edl', label: 'EDL' },
        { value: 'operations_manager', label: 'Operations Manager' },
        { value: 'curriculum_manager', label: 'Curriculum Manager' },
      ],
    };
  }
}








