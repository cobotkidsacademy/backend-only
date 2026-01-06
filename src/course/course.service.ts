import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  CreateCourseDto,
  UpdateCourseDto,
  UpdateLevelDto,
  CreateTopicDto,
  UpdateTopicDto,
  CreateNoteDto,
  UpdateNoteDto,
  CreateNoteElementDto,
  UpdateNoteElementDto,
  UpdateElementsPositionDto,
} from './dto/course.dto';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
  ) {}

  // ============ COURSE METHODS ============
  
  private generateCourseCode(): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CRS-${random}`;
  }

  async createCourse(dto: CreateCourseDto) {
    this.logger.log(`Creating course: ${dto.name} with ${dto.level_count} levels`);

    // Generate unique course code
    let code = this.generateCourseCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await this.supabase
        .from('courses')
        .select('id')
        .eq('code', code)
        .single();
      
      if (!existing) break;
      code = this.generateCourseCode();
      attempts++;
    }

    // Create course
    const { data: course, error: courseError } = await this.supabase
      .from('courses')
      .insert({
        name: dto.name,
        code,
        description: dto.description || null,
        icon_image_url: dto.icon_image_url || null,
        level_count: dto.level_count,
      })
      .select()
      .single();

    if (courseError) {
      this.logger.error(`Failed to create course: ${courseError.message}`);
      throw new Error(courseError.message);
    }

    // Auto-generate levels based on level_count
    const levels = [];
    for (let i = 1; i <= dto.level_count; i++) {
      levels.push({
        course_id: course.id,
        level_number: i,
        name: `${dto.name} - Level ${i}`,
        order_index: i - 1,
      });
    }

    const { error: levelsError } = await this.supabase
      .from('course_levels')
      .insert(levels);

    if (levelsError) {
      this.logger.error(`Failed to create levels: ${levelsError.message}`);
      // Rollback course creation
      await this.supabase.from('courses').delete().eq('id', course.id);
      throw new Error(levelsError.message);
    }

    this.logger.log(`Course created: ${course.code}`);
    return this.getCourseById(course.id);
  }

  async getAllCourses() {
    const { data, error } = await this.supabase
      .from('courses')
      .select('*, course_levels(count)')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async getCourseById(id: string) {
    const { data, error } = await this.supabase
      .from('courses')
      .select('*, course_levels(*)')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Course not found');
    return data;
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    const { data, error } = await this.supabase
      .from('courses')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteCourse(id: string) {
    const { error } = await this.supabase
      .from('courses')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ LEVEL METHODS ============

  async getLevelsByCoruseId(courseId: string) {
    const { data, error } = await this.supabase
      .from('course_levels')
      .select('*, topics(count)')
      .eq('course_id', courseId)
      .order('level_number', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  async getLevelById(id: string) {
    const { data, error } = await this.supabase
      .from('course_levels')
      .select('*, course:courses(*), topics(*)')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Level not found');
    return data;
  }

  async updateLevel(id: string, dto: UpdateLevelDto) {
    this.logger.log(`Updating level ${id}: ${JSON.stringify(dto)}`);
    
    const { data, error } = await this.supabase
      .from('course_levels')
      .update({
        ...dto,
        // If setting a price > 0, automatically set is_free to false
        is_free: dto.price && dto.price > 0 ? false : dto.is_free,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteLevel(id: string) {
    const { error } = await this.supabase.from('course_levels').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ TOPIC METHODS ============

  async createTopic(dto: CreateTopicDto) {
    // Get max order_index
    const { data: existing } = await this.supabase
      .from('topics')
      .select('order_index')
      .eq('level_id', dto.level_id)
      .order('order_index', { ascending: false })
      .limit(1);

    const orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

    const { data, error } = await this.supabase
      .from('topics')
      .insert({
        level_id: dto.level_id,
        name: dto.name,
        description: dto.description || null,
        order_index: orderIndex,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getTopicsByLevelId(levelId: string) {
    const { data, error } = await this.supabase
      .from('topics')
      .select('*, notes(count)')
      .eq('level_id', levelId)
      .order('order_index', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  async getTopicById(id: string) {
    const { data, error } = await this.supabase
      .from('topics')
      .select('*, level:course_levels(*, course:courses(*)), notes(*)')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Topic not found');
    return data;
  }

  async updateTopic(id: string, dto: UpdateTopicDto) {
    const { data, error } = await this.supabase
      .from('topics')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteTopic(id: string) {
    const { error } = await this.supabase.from('topics').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ NOTE METHODS ============

  async createNote(dto: CreateNoteDto) {
    const { data: existing } = await this.supabase
      .from('notes')
      .select('order_index')
      .eq('topic_id', dto.topic_id)
      .order('order_index', { ascending: false })
      .limit(1);

    const orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

    const { data, error } = await this.supabase
      .from('notes')
      .insert({
        topic_id: dto.topic_id,
        title: dto.title || `Note ${orderIndex + 1}`,
        order_index: orderIndex,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getNotesByTopicId(topicId: string) {
    const { data, error } = await this.supabase
      .from('notes')
      .select('*, note_elements(count)')
      .eq('topic_id', topicId)
      .order('order_index', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }

  async getNoteById(id: string) {
    const { data, error } = await this.supabase
      .from('notes')
      .select('*, topic:topics(*, level:course_levels(*, course:courses(*))), note_elements(*)')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Note not found');

    // Sort elements by z_index then order_index
    if (data.note_elements) {
      data.note_elements.sort((a: any, b: any) => {
        if (a.z_index !== b.z_index) return a.z_index - b.z_index;
        return a.order_index - b.order_index;
      });
    }

    return data;
  }

  async updateNote(id: string, dto: UpdateNoteDto) {
    const { data, error } = await this.supabase
      .from('notes')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteNote(id: string) {
    const { error } = await this.supabase.from('notes').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ NOTE ELEMENT METHODS ============

  async createNoteElement(dto: CreateNoteElementDto) {
    const { data: existing } = await this.supabase
      .from('note_elements')
      .select('order_index, z_index')
      .eq('note_id', dto.note_id)
      .order('order_index', { ascending: false })
      .limit(1);

    const orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0;
    const zIndex = dto.z_index ?? (existing && existing.length > 0 ? existing[0].z_index + 1 : 0);

    const { data, error } = await this.supabase
      .from('note_elements')
      .insert({
        note_id: dto.note_id,
        element_type: dto.element_type,
        content: dto.content || '',
        position_x: dto.position_x,
        position_y: dto.position_y,
        width: dto.width || (dto.element_type === 'text' ? 300 : 200),
        height: dto.height || (dto.element_type === 'text' ? 100 : 150),
        z_index: zIndex,
        font_size: dto.font_size || 16,
        font_weight: dto.font_weight || 'normal',
        text_align: dto.text_align || 'left',
        background_color: dto.background_color,
        order_index: orderIndex,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async updateNoteElement(id: string, dto: UpdateNoteElementDto) {
    const { data, error } = await this.supabase
      .from('note_elements')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async updateElementsPosition(dto: UpdateElementsPositionDto) {
    const updates = dto.elements.map(async (element) => {
      return this.supabase
        .from('note_elements')
        .update({
          position_x: element.position_x,
          position_y: element.position_y,
          z_index: element.z_index,
        })
        .eq('id', element.id);
    });

    await Promise.all(updates);
    return { success: true };
  }

  async deleteNoteElement(id: string) {
    const { error } = await this.supabase.from('note_elements').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }
}

