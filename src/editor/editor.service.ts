import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateEditorDto, UpdateEditorDto } from './dto/editor.dto';

@Injectable()
export class EditorService {
  private readonly logger = new Logger(EditorService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
  ) {}

  async createEditor(dto: CreateEditorDto) {
    this.logger.log(`Creating editor: ${dto.name}`);
    
    const { data, error } = await this.supabase
      .from('editors')
      .insert({
        name: dto.name,
        description: dto.description || null,
        icon: dto.icon || null,
        color: dto.color || null,
        status: dto.status || 'coming_soon',
        link: dto.link || null,
        linked_editor_id: dto.linked_editor_id || null,
        logo_image_url: dto.logo_image_url || null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Error creating editor: ${JSON.stringify(error)}`);
      throw new Error(`Failed to create editor: ${error.message}`);
    }

    return data;
  }

  async getAllEditors() {
    const { data, error } = await this.supabase
      .from('editors')
      .select(`
        *,
        linked_editor:linked_editor_id (
          id,
          name
        )
      `)
      .order('name', { ascending: true });

    if (error) {
      this.logger.error(`Error fetching editors: ${JSON.stringify(error)}`);
      throw new Error(`Failed to fetch editors: ${error.message}`);
    }

    return data || [];
  }

  async getEditorById(id: string) {
    const { data, error } = await this.supabase
      .from('editors')
      .select(`
        *,
        linked_editor:linked_editor_id (
          id,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      this.logger.error(`Error fetching editor: ${JSON.stringify(error)}`);
      throw new NotFoundException(`Editor not found: ${error.message}`);
    }

    return data;
  }

  async updateEditor(id: string, dto: UpdateEditorDto) {
    this.logger.log(`Updating editor: ${id}`);
    
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.link !== undefined) updateData.link = dto.link;
    if (dto.linked_editor_id !== undefined) updateData.linked_editor_id = dto.linked_editor_id;
    if (dto.logo_image_url !== undefined) updateData.logo_image_url = dto.logo_image_url;

    const { data, error } = await this.supabase
      .from('editors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error updating editor: ${JSON.stringify(error)}`);
      throw new Error(`Failed to update editor: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundException(`Editor with id ${id} not found`);
    }

    return data;
  }

  async deleteEditor(id: string) {
    this.logger.log(`Deleting editor: ${id}`);
    
    const { error } = await this.supabase
      .from('editors')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Error deleting editor: ${JSON.stringify(error)}`);
      throw new Error(`Failed to delete editor: ${error.message}`);
    }
  }
}

