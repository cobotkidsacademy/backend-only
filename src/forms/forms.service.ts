import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class FormsService {
  constructor(@Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient) {}

  async getForms() {
    const { data, error } = await this.supabase
      .from('class_forms')
      .select('id, name, icon_url, form_url, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async createForm(dto: { name: string; icon_url?: string; form_url: string }) {
    const { data, error } = await this.supabase
      .from('class_forms')
      .insert({
        name: dto.name,
        icon_url: dto.icon_url,
        form_url: dto.form_url,
        status: 'active',
      })
      .select('id, name, icon_url, form_url, status, created_at')
      .single();

    if (error) {
      throw new ConflictException(error.message);
    }

    return data;
  }

  async deleteForm(id: string) {
    const { error } = await this.supabase
      .from('class_forms')
      .update({ status: 'inactive' })
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  }

  async updateForm(
    id: string,
    dto: { name?: string; icon_url?: string | null; form_url?: string },
  ) {
    const updatePayload: any = {};
    if (dto.name !== undefined) updatePayload.name = dto.name;
    if (dto.icon_url !== undefined) updatePayload.icon_url = dto.icon_url || null;
    if (dto.form_url !== undefined) updatePayload.form_url = dto.form_url;

    const { data, error } = await this.supabase
      .from('class_forms')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, icon_url, form_url, status, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}


