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

    // Generate email: fname.lname@cobotkids.edutech
    const baseEmail = `${dto.first_name.toLowerCase()}.${dto.last_name.toLowerCase()}@cobotkids.edutech`;
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

    // Generate password: mname + cocobotkids2026
    const plainPassword = `${dto.middle_name.toLowerCase()}cocobotkids2026`;
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
    // If names are being updated, regenerate email
    let updateData: any = { ...dto };

    if (dto.first_name || dto.last_name) {
      const currentTutor = await this.getTutorById(id);
      const firstName = dto.first_name || currentTutor.first_name;
      const lastName = dto.last_name || currentTutor.last_name;
      
      const newEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@cobotkids.edutech`.replace(/[^a-z0-9.@]/g, '');
      
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

    const { data, error } = await this.supabase
      .from('tutors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
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
}






