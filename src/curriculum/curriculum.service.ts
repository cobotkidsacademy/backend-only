import { Injectable, Inject, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private supabase: SupabaseClient,
  ) {}

  // ============ EXAM METHODS ============

  private generateExamCode(): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EXM-${random}`;
  }

  async getAllExams() {
    const { data, error } = await this.supabase
      .from('exams')
      .select(
        `
        id,
        exam_code,
        title,
        exam_type,
        status,
        created_at,
        topic:topics(
          id,
          name,
          level:course_levels(
            id,
            level_number,
            name,
            course:courses(
              id,
              name,
              code
            )
          )
        )
      `,
      )
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async createExam(dto: any) {
    // Generate a unique exam code
    let examCode = this.generateExamCode();
    let attempts = 0;

    while (attempts < 10) {
      const { data: existing } = await this.supabase
        .from('exams')
        .select('id')
        .eq('exam_code', examCode)
        .single();

      if (!existing) break;
      examCode = this.generateExamCode();
      attempts++;
    }

    const { data, error } = await this.supabase
      .from('exams')
      .insert({
        topic_id: dto.topic_id,
        title: dto.title,
        description: dto.description || null,
        exam_code: examCode,
        time_limit_minutes: dto.time_limit_minutes || 0,
        passing_score: dto.passing_score || 60,
        shuffle_questions: dto.shuffle_questions || false,
        shuffle_options: dto.shuffle_options || false,
        show_correct_answers: dto.show_correct_answers || false,
        allow_retake: dto.allow_retake || false,
        exam_type: dto.exam_type || 'standard',
        status: dto.status || 'draft',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getExamsByTopicId(topicId: string) {
    const { data, error } = await this.supabase
      .from('exams')
      .select('*, exam_questions(count)')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async getExamById(id: string) {
    const { data, error } = await this.supabase
      .from('exams')
      .select('*, topic:topics(*, level:course_levels(*, course:courses(*))), exam_questions(*, exam_options(*))')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Exam not found');
    return data;
  }

  async updateExam(id: string, dto: any) {
    const { data, error } = await this.supabase
      .from('exams')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteExam(id: string) {
    const { error } = await this.supabase.from('exams').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ EXAM QUESTION METHODS ============

  async createExamQuestion(dto: any) {
    const { data: existing } = await this.supabase
      .from('exam_questions')
      .select('order_position')
      .eq('exam_id', dto.exam_id)
      .order('order_position', { ascending: false })
      .limit(1);

    const orderPosition = existing && existing.length > 0 ? existing[0].order_position + 1 : 0;

    const { data, error } = await this.supabase
      .from('exam_questions')
      .insert({
        exam_id: dto.exam_id,
        question_text: dto.question_text,
        question_type: dto.question_type || 'multiple_choice',
        points: dto.points || 10,
        order_position: orderPosition,
        explanation: dto.explanation || null,
        image_url: dto.image_url || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async updateExamQuestion(id: string, dto: any) {
    const { data, error } = await this.supabase
      .from('exam_questions')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteExamQuestion(id: string) {
    const { error } = await this.supabase.from('exam_questions').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ EXAM OPTION METHODS ============

  async createExamOption(dto: any) {
    const { data: existing } = await this.supabase
      .from('exam_options')
      .select('order_position')
      .eq('question_id', dto.question_id)
      .order('order_position', { ascending: false })
      .limit(1);

    const orderPosition = existing && existing.length > 0 ? existing[0].order_position + 1 : 0;

    const { data, error } = await this.supabase
      .from('exam_options')
      .insert({
        question_id: dto.question_id,
        option_text: dto.option_text,
        is_correct: dto.is_correct || false,
        order_position: orderPosition,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async updateExamOption(id: string, dto: any) {
    const { data, error } = await this.supabase
      .from('exam_options')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteExamOption(id: string) {
    const { error } = await this.supabase.from('exam_options').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ PROJECT METHODS ============

  async createProject(dto: any) {
    const { data, error } = await this.supabase
      .from('projects')
      .insert({
        topic_id: dto.topic_id,
        title: dto.title,
        description: dto.description || null,
        instructions: dto.instructions || null,
        requirements: dto.requirements || null,
        max_points: dto.max_points || 100,
        due_date: dto.due_date || null,
        allow_late_submission: dto.allow_late_submission || false,
        late_penalty_percentage: dto.late_penalty_percentage || 10,
        submission_type: dto.submission_type || 'file',
        max_file_size_mb: dto.max_file_size_mb || 10,
        allowed_file_types: dto.allowed_file_types || ['pdf', 'doc', 'docx'],
        status: dto.status || 'draft',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getProjectsByTopicId(topicId: string) {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*, student_project_submissions(count)')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async getProjectById(id: string) {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*, topic:topics(*, level:course_levels(*, course:courses(*))))')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Project not found');
    return data;
  }

  async updateProject(id: string, dto: any) {
    const { data, error } = await this.supabase
      .from('projects')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteProject(id: string) {
    const { error } = await this.supabase.from('projects').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ PERFORMANCE METHODS ============

  async getStudentPerformance(studentId: string, courseLevelId: string) {
    const { data, error } = await this.supabase
      .from('student_performance')
      .select('*')
      .eq('student_id', studentId)
      .eq('course_level_id', courseLevelId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  }

  async getAllPerformanceByCourseLevel(courseLevelId: string) {
    const { data, error } = await this.supabase
      .from('student_performance')
      .select('*, student:students(id, first_name, last_name, username)')
      .eq('course_level_id', courseLevelId)
      .order('overall_average', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async updatePerformance(studentId: string, courseLevelId: string, dto: any) {
    // Check if performance record exists
    const { data: existing } = await this.supabase
      .from('student_performance')
      .select('id')
      .eq('student_id', studentId)
      .eq('course_level_id', courseLevelId)
      .single();

    if (existing) {
      const { data, error } = await this.supabase
        .from('student_performance')
        .update(dto)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    } else {
      const { data, error } = await this.supabase
        .from('student_performance')
        .insert({
          student_id: studentId,
          course_level_id: courseLevelId,
          ...dto,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }
  }

  // ============ TEACHER GUIDE METHODS ============

  async createTeacherGuide(dto: any) {
    const { data, error } = await this.supabase
      .from('teacher_guides')
      .insert({
        class_id: dto.class_id,
        course_level_id: dto.course_level_id,
        title: dto.title,
        description: dto.description || null,
        content: dto.content || null,
        objectives: dto.objectives || [],
        materials_needed: dto.materials_needed || [],
        teaching_strategies: dto.teaching_strategies || null,
        assessment_notes: dto.assessment_notes || null,
        common_mistakes: dto.common_mistakes || null,
        extension_activities: dto.extension_activities || null,
        estimated_duration_minutes: dto.estimated_duration_minutes || null,
        difficulty_level: dto.difficulty_level || 'medium',
        status: dto.status || 'draft',
        created_by_tutor_id: dto.created_by_tutor_id || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getTeacherGuidesByClass(classId: string) {
    const { data, error } = await this.supabase
      .from('teacher_guides')
      .select('*, course_level:course_levels(*, course:courses(*))')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async getTeacherGuideById(id: string) {
    const { data, error } = await this.supabase
      .from('teacher_guides')
      .select('*, class:classes(*, school:schools(*)), course_level:course_levels(*, course:courses(*)), teacher_guide_sections(*), teacher_guide_attachments(*)')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Teacher guide not found');
    return data;
  }

  async updateTeacherGuide(id: string, dto: any) {
    const { data, error } = await this.supabase
      .from('teacher_guides')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteTeacherGuide(id: string) {
    const { error } = await this.supabase.from('teacher_guides').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ CLASS UPGRADE EDITOR ASSIGNMENT METHODS ============

  async createOrUpdateClassUpgradeEditor(dto: any) {
    // Check if assignment exists
    const { data: existing } = await this.supabase
      .from('class_upgrade_editor_assignments')
      .select('id')
      .eq('class_id', dto.class_id)
      .single();

    if (existing) {
      const { data, error } = await this.supabase
        .from('class_upgrade_editor_assignments')
        .update({
          editor_type: dto.editor_type,
          editor_link: dto.editor_link,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    } else {
      const { data, error } = await this.supabase
        .from('class_upgrade_editor_assignments')
        .insert({
          class_id: dto.class_id,
          editor_type: dto.editor_type,
          editor_link: dto.editor_link,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }
  }

  async getClassUpgradeEditor(classId: string) {
    const { data, error } = await this.supabase
      .from('class_upgrade_editor_assignments')
      .select('*, class:classes(*)')
      .eq('class_id', classId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  }

  async deleteClassUpgradeEditor(classId: string) {
    const { error } = await this.supabase
      .from('class_upgrade_editor_assignments')
      .delete()
      .eq('class_id', classId);

    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ============ COURSE EDITOR ASSIGNMENT METHODS ============

  async createOrUpdateCourseEditor(dto: any) {
    // Check if assignment exists
    const { data: existing } = await this.supabase
      .from('course_editor_assignments')
      .select('id')
      .eq('course_id', dto.course_id)
      .single();

    if (existing) {
      const { data, error } = await this.supabase
        .from('course_editor_assignments')
        .update({
          editor_type: dto.editor_type,
          editor_link: dto.editor_link,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    } else {
      const { data, error } = await this.supabase
        .from('course_editor_assignments')
        .insert({
          course_id: dto.course_id,
          editor_type: dto.editor_type,
          editor_link: dto.editor_link,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }
  }

  async getCourseEditor(courseId: string) {
    const { data, error } = await this.supabase
      .from('course_editor_assignments')
      .select('*, course:courses(*)')
      .eq('course_id', courseId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  }

  async deleteCourseEditor(courseId: string) {
    const { error } = await this.supabase
      .from('course_editor_assignments')
      .delete()
      .eq('course_id', courseId);

    if (error) throw new Error(error.message);
    return { success: true };
  }
}

