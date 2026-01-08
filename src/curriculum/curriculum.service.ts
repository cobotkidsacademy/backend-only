
import { Injectable, Inject, NotFoundException, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  UnderlineType,
} from 'docx';

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

  // ============ EXAM WORD DOCUMENT GENERATION ============

  async generateExamWordDocument(examId: string): Promise<Buffer> {
    // Fetch exam with all questions and options
    const exam = await this.getExamById(examId);

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    // Map exam_questions to questions for consistency
    // The database returns exam_questions, not questions
    let questions: any[] = [];
    
    if (exam.exam_questions) {
      questions = Array.isArray(exam.exam_questions) ? exam.exam_questions : [exam.exam_questions];
    } else if (exam.questions) {
      questions = Array.isArray(exam.questions) ? exam.questions : [exam.questions];
    }
    
    this.logger.log(`Found ${questions.length} questions for exam ${examId}`);
    
    if (questions.length === 0) {
      this.logger.warn(`No questions found for exam ${examId}. Exam structure: ${JSON.stringify(Object.keys(exam))}`);
    }

    // Sort questions and their options
    const sortedQuestions = [...questions].sort(
      (a: any, b: any) => (a.order_position || 0) - (b.order_position || 0)
    );

    // Map exam_options to options for each question
    sortedQuestions.forEach((question: any, idx: number) => {
      // Ensure options is an array
      let options: any[] = [];
      if (question.exam_options) {
        options = Array.isArray(question.exam_options) ? question.exam_options : [question.exam_options];
      } else if (question.options) {
        options = Array.isArray(question.options) ? question.options : [question.options];
      }
      
      question.options = options;
      question.exam_options = options; // Keep both for compatibility
      
      // Sort options
      if (options.length > 0) {
        question.options.sort((a: any, b: any) => 
          (a.order_position || 0) - (b.order_position || 0)
        );
        question.exam_options.sort((a: any, b: any) => 
          (a.order_position || 0) - (b.order_position || 0)
        );
      }
      
      this.logger.log(`Question ${idx + 1}: "${question.question_text?.substring(0, 50) || 'No text'}" - ${question.options.length} options`);
    });

    const topic = exam.topic;
    const level = topic?.level;
    const course = level?.course;

    // Fetch admin/company info for logo
    const { data: adminData } = await this.supabase
      .from('admins')
      .select('logo_url, company_name')
      .limit(1)
      .single();

    const companyName = adminData?.company_name || 'COBOT KIDS KENYA';
    const logoUrl = adminData?.logo_url;

    // Start building the document
    const children: any[] = [];

    // Header - Ministry of Education Kenya
    children.push(
      new Paragraph({
        text: "REPUBLIC OF KENYA",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: "MINISTRY OF EDUCATION",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: "COMPETENCY BASED CURRICULUM (CBC)",
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: "─────────────────────────────────────────",
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    );

    // Company Name and Logo Section
    children.push(
      new Paragraph({
        text: companyName.toUpperCase(),
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
      }),
      new Paragraph({
        text: logoUrl ? "[Company Logo Placeholder]" : "",
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    );

    // Exam Title
    children.push(
      new Paragraph({
        text: exam.title.toUpperCase(),
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
      }),
    );

    // Exam Details Table
    const examDetailsRows = [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph("Exam Code:")],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph(exam.exam_code || "N/A")],
            width: { size: 50, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph("Course:")],
          }),
          new TableCell({
            children: [new Paragraph(course?.name || "N/A")],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph("Level:")],
          }),
          new TableCell({
            children: [
              new Paragraph(
                level
                  ? `${level.name || "Level"} ${level.level_number ?? ""}`
                  : "N/A"
              ),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph("Topic:")],
          }),
          new TableCell({
            children: [new Paragraph(topic?.name || "N/A")],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph("Time Allowed:")],
          }),
          new TableCell({
            children: [
              new Paragraph(
                exam.time_limit_minutes
                  ? `${exam.time_limit_minutes} minutes`
                  : "No time limit"
              ),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph("Total Marks:")],
          }),
          new TableCell({
            children: [new Paragraph(`${exam.total_points || 0} marks`)],
          }),
        ],
      }),
    ];

    children.push(
      new Table({
        rows: examDetailsRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1 },
          bottom: { style: BorderStyle.SINGLE, size: 1 },
          left: { style: BorderStyle.SINGLE, size: 1 },
          right: { style: BorderStyle.SINGLE, size: 1 },
        },
      }),
      new Paragraph({ text: "" }),
    );

    // Student Information Section
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "STUDENT INFORMATION",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph("Name: ___________________________________")],
                width: { size: 33, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph("Admission No: ______________________________")],
                width: { size: 33, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph("Class: _________________________________")],
                width: { size: 34, type: WidthType.PERCENTAGE },
              }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
      new Paragraph({ text: "" }),
    );

    // Instructions Section
    children.push(
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "INSTRUCTIONS TO CANDIDATES",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun("1. Write your name, admission number and class in the spaces provided."),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun(
            `2. This exam consists of ${sortedQuestions.length} questions. Answer ALL questions.`
          ),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun(`3. The total marks for this exam is ${exam.total_points || 0} marks.`),
        ],
        spacing: { after: 100 },
      }),
      exam.time_limit_minutes > 0
        ? new Paragraph({
            children: [
              new TextRun(
                `4. You have ${exam.time_limit_minutes} minutes to complete this exam.`
              ),
            ],
            spacing: { after: 100 },
          })
        : new Paragraph({
            children: [new TextRun("4. There is no time limit for this exam.")],
            spacing: { after: 100 },
          }),
      new Paragraph({
        children: [
          new TextRun(
            "5. Read all questions carefully before attempting to answer them."
          ),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun(
            "6. Write your answers clearly in the spaces provided."
          ),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun("7. Check your work before submitting."),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: "─────────────────────────────────────────",
        spacing: { after: 400 },
      }),
    );

    // Questions Section
    children.push(
      new Paragraph({
        text: "QUESTIONS",
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 400 },
      }),
    );

    // Add questions - ensure we have questions
    this.logger.log(`About to add questions to document. Count: ${sortedQuestions.length}`);
    
    if (sortedQuestions && sortedQuestions.length > 0) {
      this.logger.log(`Adding ${sortedQuestions.length} questions to document`);
      
      sortedQuestions.forEach((question: any, index: number) => {
        this.logger.log(`Processing question ${index + 1}: ${question.question_text?.substring(0, 30) || 'No text'}`);
        
        // Question number and text
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Question ${index + 1}`,
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: question.question_text || `Question ${index + 1}`,
                size: 22,
              }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `[${question.points} marks]`,
                italics: true,
                size: 20,
              }),
            ],
            spacing: { after: 200 },
          }),
        );

        // Add options if it's a multiple choice question
        const questionOptions = question.exam_options || question.options || [];
        if (
          questionOptions &&
          questionOptions.length > 0 &&
          ["multiple_choice", "true_false", "multi_select"].includes(
            question.question_type
          )
        ) {

          questionOptions.forEach((option: any, optIndex: number) => {
            const optionLetter = String.fromCharCode(65 + optIndex);
            // Add checkbox/tick box for multiple choice questions
            // Using ☐ for empty checkbox - students will tick ✓
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `   ☐ `,
                    size: 24,
                  }),
                  new TextRun({
                    text: `${optionLetter}. ${option.option_text}`,
                    size: 22,
                  }),
                ],
                spacing: { after: 80 },
                indent: { left: 200 },
              }),
            );
          });

          // For multiple choice/true false, add tick instruction
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "Answer: Tick (✓) the correct option above",
                  bold: true,
                  italics: true,
                }),
              ],
              spacing: { before: 100, after: 200 },
            }),
          );
        } else if (question.question_type === "essay") {
          // Essay questions - bigger spacing (more lines)
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "Answer:",
                  bold: true,
                }),
              ],
              spacing: { before: 100, after: 100 },
            }),
            // Multiple blank lines for essay answers
            new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________",
                }),
              ],
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________",
                }),
              ],
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________",
                }),
              ],
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________",
                }),
              ],
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________",
                }),
              ],
              spacing: { after: 200 },
            }),
          );
        } else if (question.question_type === "short_answer") {
          // Short answer questions - small blank space (1-2 lines)
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "Answer:",
                  bold: true,
                }),
              ],
              spacing: { before: 100, after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________",
                }),
              ],
              spacing: { after: 200 },
            }),
          );
        } else {
          // Default answer space for other question types
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "Answer: _______________",
                  bold: true,
                }),
              ],
              spacing: { before: 100, after: 200 },
            }),
          );
        }
      });
    } else {
      // If no questions found, add a message
      this.logger.warn(`No questions found for exam ${examId}`);
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "No questions have been added to this exam yet.",
              italics: true,
              size: 20,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 200 },
        }),
      );
    }

    // Footer Section
    children.push(
      new Paragraph({
        text: "─────────────────────────────────────────",
        spacing: { before: 600, after: 400 },
      }),
      new Paragraph({
        text: "END OF EXAM",
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      }),
    );

    // Create the document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
    });

    // Generate the document as a Buffer
    const buffer = await Packer.toBuffer(doc);
    return buffer;
  }

  // ============ EXAM ATTEMPTS METHODS ============

  async getExamAttempts(examId: string, filters?: { school_id?: string; class_id?: string }) {
    // First, get student IDs based on filters if provided
    let studentIds: string[] | undefined = undefined;
    
    if (filters?.school_id || filters?.class_id) {
      let studentQuery = this.supabase
        .from('students')
        .select('id')
        .eq('status', 'active');

      if (filters?.school_id) {
        studentQuery = studentQuery.eq('school_id', filters.school_id);
      }
      
      if (filters?.class_id) {
        studentQuery = studentQuery.eq('class_id', filters.class_id);
      }

      const { data: students, error: studentError } = await studentQuery;

      if (studentError) {
        this.logger.error('Error fetching students for filter:', studentError);
        throw new Error(studentError.message);
      }

      studentIds = students?.map((s: any) => s.id) || [];
      
      if (studentIds.length === 0) {
        // No students match the filter, return empty array
        return [];
      }
    }

    // Build query to get exam attempts with student, class, and school info
    let query = this.supabase
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
        created_at,
        updated_at,
        student:students(
          id,
          first_name,
          last_name,
          username,
          class_id,
          school_id,
          class:classes(
            id,
            name,
            level,
            school_id,
            school:schools(
              id,
              name,
              code
            )
          ),
          school:schools(
            id,
            name,
            code
          )
        )
      `)
      .eq('exam_id', examId);

    // Apply student ID filter if we have filtered student IDs
    if (studentIds && studentIds.length > 0) {
      query = query.in('student_id', studentIds);
    }

    const { data, error } = await query
      .order('started_at', { ascending: false });

    if (error) {
      this.logger.error('Error fetching exam attempts:', error);
      throw new Error(error.message);
    }

    // Transform the data to make it easier to work with
    const attempts = (data || []).map((attempt: any) => {
      const student = attempt.student;
      const classData = Array.isArray(student?.class) ? student.class[0] : student?.class;
      const school = Array.isArray(student?.school) ? student.school[0] : student?.school;
      const schoolFromClass = Array.isArray(classData?.school) ? classData.school[0] : classData?.school;

      return {
        id: attempt.id,
        student_id: attempt.student_id,
        exam_id: attempt.exam_id,
        score: attempt.score || 0,
        max_score: attempt.max_score || 0,
        percentage: attempt.percentage || 0,
        passed: attempt.passed || false,
        time_spent_seconds: attempt.time_spent_seconds || 0,
        started_at: attempt.started_at,
        completed_at: attempt.completed_at,
        status: attempt.status || 'in_progress',
        created_at: attempt.created_at,
        updated_at: attempt.updated_at,
        student: {
          id: student?.id,
          first_name: student?.first_name,
          last_name: student?.last_name,
          username: student?.username,
          full_name: student ? `${student.first_name} ${student.last_name}` : 'Unknown Student',
        },
        class: {
          id: classData?.id,
          name: classData?.name,
          level: classData?.level,
        },
        school: {
          id: school?.id || schoolFromClass?.id,
          name: school?.name || schoolFromClass?.name,
          code: school?.code || schoolFromClass?.code,
        },
      };
    });

    return attempts;
  }

  // ============ EXAM PERFORMANCE METHODS ============

  async getExamPerformance(filters: {
    school_id?: string;
    class_id?: string;
    course_id?: string;
    course_level_id?: string;
    topic_id?: string;
    exam_id?: string;
    date_from?: string;
    date_to?: string;
    status?: 'all' | 'passed' | 'failed' | 'in_progress';
  }): Promise<any> {
    this.logger.log('=== getExamPerformance ===');
    this.logger.log('Filters:', filters);

    // Build base query for attempts
    let attemptsQuery = this.supabase
      .from('student_exam_attempts')
      .select(`
        *,
        student:students(
          id,
          first_name,
          last_name,
          username,
          class_id,
          class:classes(
            id,
            name,
            school_id,
            school:schools(id, name)
          )
        ),
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
              course:courses(
                id,
                name
              )
            )
          )
        )
      `);

    // Apply filters
    if (filters.exam_id) {
      attemptsQuery = attemptsQuery.eq('exam_id', filters.exam_id);
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'passed') {
        attemptsQuery = attemptsQuery.eq('passed', true).eq('status', 'completed');
      } else if (filters.status === 'failed') {
        attemptsQuery = attemptsQuery.eq('passed', false).eq('status', 'completed');
      } else if (filters.status === 'in_progress') {
        attemptsQuery = attemptsQuery.eq('status', 'in_progress');
      }
    } else {
      // Only show completed attempts by default
      attemptsQuery = attemptsQuery.eq('status', 'completed');
    }

    if (filters.date_from) {
      attemptsQuery = attemptsQuery.gte('completed_at', filters.date_from);
    }

    if (filters.date_to) {
      attemptsQuery = attemptsQuery.lte('completed_at', filters.date_to);
    }

    const { data: attempts, error: attemptsError } = await attemptsQuery;

    if (attemptsError) {
      this.logger.error('Error fetching exam attempts:', attemptsError);
      throw new Error(`Failed to fetch exam attempts: ${attemptsError.message}`);
    }

    // Filter by school/class if provided (after fetching to handle nested relations)
    let filteredAttempts = attempts || [];

    if (filters.school_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.student?.class?.school_id === filters.school_id
      );
    }

    if (filters.class_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.student?.class_id === filters.class_id
      );
    }

    if (filters.topic_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.exam?.topic_id === filters.topic_id
      );
    }

    if (filters.course_level_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.exam?.topic?.level?.id === filters.course_level_id
      );
    }

    if (filters.course_id) {
      filteredAttempts = filteredAttempts.filter((attempt: any) => 
        attempt.exam?.topic?.level?.course_id === filters.course_id
      );
    }

    // Helper function to categorize percentage
    const categorizeScore = (percentage: number): 'below_expectation' | 'approaching' | 'meeting' | 'exceeding' => {
      if (percentage <= 25) return 'below_expectation';
      if (percentage <= 50) return 'approaching';
      if (percentage <= 75) return 'meeting';
      return 'exceeding';
    };

    // Calculate statistics
    const totalAttempts = filteredAttempts.length;
    const completedAttempts = filteredAttempts.filter((a: any) => a.status === 'completed').length;
    const passedAttempts = filteredAttempts.filter((a: any) => a.passed === true).length;
    const failedAttempts = filteredAttempts.filter((a: any) => a.passed === false && a.status === 'completed').length;
    
    const completedScores = filteredAttempts
      .filter((a: any) => a.status === 'completed')
      .map((a: any) => a.score);
    const averageScore = completedScores.length > 0
      ? completedScores.reduce((sum: number, score: number) => sum + score, 0) / completedScores.length
      : 0;

    const completedPercentages = filteredAttempts
      .filter((a: any) => a.status === 'completed')
      .map((a: any) => a.percentage);
    const averagePercentage = completedPercentages.length > 0
      ? completedPercentages.reduce((sum: number, pct: number) => sum + pct, 0) / completedPercentages.length
      : 0;

    const uniqueStudents = new Set(filteredAttempts.map((a: any) => a.student_id));
    const uniqueExams = new Set(filteredAttempts.map((a: any) => a.exam_id));

    // Group by exam
    const examMap = new Map<string, any>();
    filteredAttempts.forEach((attempt: any) => {
      const examId = attempt.exam_id;
      if (!examMap.has(examId)) {
        examMap.set(examId, {
          exam_id: examId,
          exam_title: attempt.exam?.title || 'Unknown Exam',
          topic_name: attempt.exam?.topic?.name,
          course_name: attempt.exam?.topic?.level?.course?.name,
          level_name: attempt.exam?.topic?.level?.name,
          attempts: [],
        });
      }
      examMap.get(examId)!.attempts.push(attempt);
    });

    const examData = Array.from(examMap.values()).map((exam: any) => {
      const completed = exam.attempts.filter((a: any) => a.status === 'completed');
      const passed = completed.filter((a: any) => a.passed === true);
      const failed = completed.filter((a: any) => a.passed === false);
      const scores = completed.map((a: any) => a.score);
      const percentages = completed.map((a: any) => a.percentage);
      const students = new Set(exam.attempts.map((a: any) => a.student_id));

      // Group by student to get highest score per student
      const studentHighestScores = new Map<string, number>();
      completed.forEach((attempt: any) => {
        const studentId = attempt.student_id;
        const currentHighest = studentHighestScores.get(studentId) || 0;
        if (attempt.percentage > currentHighest) {
          studentHighestScores.set(studentId, attempt.percentage);
        }
      });

      // Categorize highest scores
      const scoreCategories = {
        below_expectation: 0,
        approaching: 0,
        meeting: 0,
        exceeding: 0,
      };

      studentHighestScores.forEach((highestPercentage) => {
        const category = categorizeScore(highestPercentage);
        scoreCategories[category]++;
      });

      return {
        exam_id: exam.exam_id,
        exam_title: exam.exam_title,
        topic_name: exam.topic_name,
        course_name: exam.course_name,
        level_name: exam.level_name,
        total_attempts: exam.attempts.length,
        completed_attempts: completed.length,
        passed_attempts: passed.length,
        failed_attempts: failed.length,
        average_score: scores.length > 0 ? scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length : 0,
        average_percentage: percentages.length > 0 ? percentages.reduce((sum: number, p: number) => sum + p, 0) / percentages.length : 0,
        pass_rate: completed.length > 0 ? (passed.length / completed.length) * 100 : 0,
        total_students: students.size,
        best_score: scores.length > 0 ? Math.max(...scores) : 0,
        worst_score: scores.length > 0 ? Math.min(...scores) : 0,
        score_categories: scoreCategories,
      };
    });

    // Group by student
    const studentMap = new Map<string, any>();
    filteredAttempts.forEach((attempt: any) => {
      const studentId = attempt.student_id;
      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          student_id: studentId,
          student_name: `${attempt.student?.first_name || ''} ${attempt.student?.last_name || ''}`.trim(),
          student_username: attempt.student?.username || '',
          class_name: attempt.student?.class?.name,
          school_name: attempt.student?.class?.school?.name,
          attempts: [],
        });
      }
      studentMap.get(studentId)!.attempts.push(attempt);
    });

    const studentData = Array.from(studentMap.values()).map((student: any) => {
      const completed = student.attempts.filter((a: any) => a.status === 'completed');
      const passed = completed.filter((a: any) => a.passed === true);
      const scores = completed.map((a: any) => a.score);
      const percentages = completed.map((a: any) => a.percentage);
      const exams = new Set(completed.map((a: any) => a.exam_id));

      // Get highest score across all exams
      const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
      const highestPercentage = percentages.length > 0 ? Math.max(...percentages) : 0;
      const scoreCategory = highestPercentage > 0 ? categorizeScore(highestPercentage) : 'below_expectation';

      return {
        student_id: student.student_id,
        student_name: student.student_name,
        student_username: student.student_username,
        class_name: student.class_name,
        school_name: student.school_name,
        total_attempts: student.attempts.length,
        completed_attempts: completed.length,
        passed_attempts: passed.length,
        highest_score: highestScore,
        highest_percentage: highestPercentage,
        score_category: scoreCategory,
        exams_completed: exams.size,
      };
    });

    // Calculate overall score categories from all student highest scores
    const allStudentHighestScores = new Map<string, number>();
    filteredAttempts
      .filter((a: any) => a.status === 'completed')
      .forEach((attempt: any) => {
        const studentId = attempt.student_id;
        const currentHighest = allStudentHighestScores.get(studentId) || 0;
        if (attempt.percentage > currentHighest) {
          allStudentHighestScores.set(studentId, attempt.percentage);
        }
      });

    const overallScoreCategories = {
      below_expectation: 0,
      approaching: 0,
      meeting: 0,
      exceeding: 0,
    };

    allStudentHighestScores.forEach((highestPercentage) => {
      const category = categorizeScore(highestPercentage);
      overallScoreCategories[category]++;
    });

    return {
      stats: {
        total_attempts: totalAttempts,
        completed_attempts: completedAttempts,
        passed_attempts: passedAttempts,
        failed_attempts: failedAttempts,
        average_score: Math.round(averageScore * 100) / 100,
        average_percentage: Math.round(averagePercentage * 100) / 100,
        total_students: uniqueStudents.size,
        unique_exams: uniqueExams.size,
        score_categories: overallScoreCategories,
      },
      exam_data: examData.sort((a, b) => b.total_attempts - a.total_attempts),
      student_data: studentData.sort((a, b) => b.highest_percentage - a.highest_percentage),
    };
  }

  async getStudentExamAttemptDetails(attemptId: string): Promise<any> {
    // Get the attempt
    const { data: attempt, error: attemptError } = await this.supabase
      .from('student_exam_attempts')
      .select(`
        *,
        exam:exams(
          *,
          topic:topics(
            *,
            level:course_levels(
              *,
              course:courses(*)
            )
          )
        ),
        student:students(
          id,
          first_name,
          last_name,
          username
        )
      `)
      .eq('id', attemptId)
      .single();

    if (attemptError || !attempt) {
      throw new Error(`Exam attempt not found: ${attemptError?.message || 'Unknown error'}`);
    }

    // Get all answers for this attempt
    const { data: answers, error: answersError } = await this.supabase
      .from('student_exam_answers')
      .select(`
        *,
        question:exam_questions(
          *,
          options:exam_options(*)
        ),
        selected_option:exam_options(*)
      `)
      .eq('attempt_id', attemptId);

    if (answersError) {
      this.logger.error('Error fetching exam answers:', answersError);
      throw new Error(`Failed to fetch exam answers: ${answersError.message}`);
    }

    // Get all questions for this exam to show correct answers
    const { data: questions, error: questionsError } = await this.supabase
      .from('exam_questions')
      .select(`
        *,
        options:exam_options(*)
      `)
      .eq('exam_id', attempt.exam_id)
      .order('order_position');

    if (questionsError) {
      this.logger.error('Error fetching exam questions:', questionsError);
      throw new Error(`Failed to fetch exam questions: ${questionsError.message}`);
    }

    // Map answers by question ID for easier lookup
    const answersMap = new Map();
    (answers || []).forEach((answer: any) => {
      answersMap.set(answer.question_id, answer);
    });

    // Combine questions with student answers
    const questionsWithAnswers = (questions || []).map((question: any) => {
      const studentAnswer = answersMap.get(question.id);
      return {
        ...question,
        student_answer: studentAnswer || null,
        correct_options: question.options?.filter((opt: any) => opt.is_correct) || [],
      };
    });

    return {
      attempt: {
        ...attempt,
        student: attempt.student,
        exam: attempt.exam,
      },
      questions: questionsWithAnswers,
    };
  }

  async getStudentExamAttempts(studentId: string): Promise<any> {
    const { data: attempts, error } = await this.supabase
      .from('student_exam_attempts')
      .select(`
        id,
        exam_id,
        score,
        max_score,
        percentage,
        passed,
        started_at,
        completed_at,
        status,
        exam:exams(
          id,
          title,
          passing_score,
          topic:topics(
            id,
            name,
            level:course_levels(
              id,
              name,
              course:courses(
                id,
                name
              )
            )
          )
        )
      `)
      .eq('student_id', studentId)
      .order('completed_at', { ascending: false });

    if (error) {
      this.logger.error('Error fetching student exam attempts:', error);
      throw new Error(error.message);
    }

    return attempts || [];
  }

  // ============ STUDENT EXAM REGISTRATION ============

  async registerStudentForExam(studentId: string, examCode: string): Promise<any> {
    // Normalize exam code (remove spaces, convert to uppercase)
    const normalizedCode = examCode.trim().toUpperCase();
    
    this.logger.log(`Attempting to register student ${studentId} for exam with code: ${normalizedCode}`);

    // First, try to find exam by code without status filter to see if it exists
    const { data: examByCode, error: codeCheckError } = await this.supabase
      .from('exams')
      .select('id, exam_code, status, title')
      .eq('exam_code', normalizedCode)
      .maybeSingle();

    if (codeCheckError) {
      this.logger.error(`Error checking exam code: ${JSON.stringify(codeCheckError)}`);
      throw new BadRequestException('Failed to check exam code. Please try again.');
    }

    if (!examByCode) {
      this.logger.warn(`Exam not found with code: ${normalizedCode}`);
      throw new NotFoundException('Exam code not found. Please check the code and try again.');
    }

    if (examByCode.status !== 'active') {
      this.logger.warn(`Exam ${examByCode.id} exists but status is ${examByCode.status}, not active`);
      throw new BadRequestException(`This exam is currently ${examByCode.status}. Only active exams can be taken.`);
    }

    // Now get full exam details
    const { data: exam, error: examError } = await this.supabase
      .from('exams')
      .select('*')
      .eq('id', examByCode.id)
      .single();

    if (examError || !exam) {
      this.logger.error(`Error fetching full exam details: ${JSON.stringify(examError)}`);
      throw new BadRequestException('Failed to load exam details. Please try again.');
    }

    // Check if student already has an attempt for this exam
    const { data: existingAttempt, error: attemptError } = await this.supabase
      .from('student_exam_attempts')
      .select('id, status')
      .eq('student_id', studentId)
      .eq('exam_id', exam.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If exam doesn't allow retake and student already has a completed attempt
    if (!exam.allow_retake && existingAttempt && existingAttempt.status === 'completed') {
      throw new BadRequestException('You have already completed this exam and retakes are not allowed.');
    }

    // If there's an existing in-progress attempt, return it
    if (existingAttempt && existingAttempt.status === 'in_progress') {
      return {
        exam_id: exam.id,
        attempt_id: existingAttempt.id,
        message: 'You have an existing attempt. Continuing...',
        existing: true,
      };
    }

    // Create a new attempt
    const { data: newAttempt, error: createError } = await this.supabase
      .from('student_exam_attempts')
      .insert({
        student_id: studentId,
        exam_id: exam.id,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      this.logger.error('Error creating exam attempt:', createError);
      throw new BadRequestException('Failed to register for exam. Please try again.');
    }

    return {
      exam_id: exam.id,
      attempt_id: newAttempt.id,
      message: 'Successfully registered for exam',
      existing: false,
    };
  }

  async getExamForStudent(examId: string, attemptId?: string): Promise<any> {
    const exam = await this.getExamById(examId);

    // Remove correct answer info for student view
    if (exam.exam_questions) {
      let processedQuestions = Array.isArray(exam.exam_questions) 
        ? exam.exam_questions 
        : [exam.exam_questions];
      
      processedQuestions = processedQuestions
        .filter((q: any) => q.status === 'active')
        .map((q: any) => ({
          ...q,
          options: q.exam_options?.map((o: any) => ({
            id: o.id,
            question_id: o.question_id,
            option_text: o.option_text,
            order_position: o.order_position,
            // Don't include is_correct for student view
          })) || [],
        }));

      // Shuffle if enabled
      if (exam.shuffle_questions) {
        processedQuestions = this.shuffleArray(processedQuestions);
      }

      if (exam.shuffle_options) {
        processedQuestions.forEach((q: any) => {
          if (q.options) {
            q.options = this.shuffleArray(q.options);
          }
        });
      }

      // If attemptId is provided, get existing answers
      let existingAnswers: Record<string, any> = {};
      if (attemptId) {
        const { data: answers } = await this.supabase
          .from('student_exam_answers')
          .select('question_id, selected_option_id, answer_text')
          .eq('attempt_id', attemptId);
        
        if (answers) {
          answers.forEach((answer: any) => {
            existingAnswers[answer.question_id] = {
              selected_option_id: answer.selected_option_id,
              answer_text: answer.answer_text,
            };
          });
        }
      }

      return {
        ...exam,
        exam_questions: processedQuestions,
        questions: processedQuestions, // Also provide as 'questions' for consistency
        existing_answers: existingAnswers,
      };
    }

    return exam;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async submitExam(dto: {
    attempt_id: string;
    answers: Array<{
      question_id: string;
      selected_option_id?: string;
      answer_text?: string;
    }>;
    time_spent_seconds: number;
  }, studentId?: string): Promise<any> {
    if (!dto.attempt_id) {
      throw new BadRequestException('Attempt ID is required');
    }

    // Get the attempt
    const { data: attempt, error: attemptError } = await this.supabase
      .from('student_exam_attempts')
      .select('*, exam:exams(*)')
      .eq('id', dto.attempt_id)
      .single();

    if (attemptError || !attempt) {
      throw new NotFoundException(`Attempt not found: ${dto.attempt_id}`);
    }

    // Verify the attempt belongs to the authenticated student
    if (studentId && attempt.student_id !== studentId) {
      throw new UnauthorizedException('This attempt does not belong to you');
    }

    if (attempt.status === 'completed') {
      throw new BadRequestException('This exam has already been submitted');
    }

    // Get all questions with correct answers for grading
    const { data: questions } = await this.supabase
      .from('exam_questions')
      .select(`
        *,
        options:exam_options(*)
      `)
      .eq('exam_id', attempt.exam_id)
      .eq('status', 'active')
      .order('order_position');

    if (!questions || questions.length === 0) {
      throw new BadRequestException('Exam has no questions');
    }

    // Calculate score
    let totalScore = 0;
    let correctAnswers = 0;
    const answerResults: any[] = [];
    const answersToInsert: any[] = [];

    for (const question of questions) {
      const studentAnswer = dto.answers.find((a) => a.question_id === question.id);
      
      if (!studentAnswer) {
        // No answer provided
        answersToInsert.push({
          attempt_id: dto.attempt_id,
          question_id: question.id,
          is_correct: false,
          points_earned: 0,
        });
        answerResults.push({
          question,
          selected_option: null,
          correct_options: question.options?.filter((o: any) => o.is_correct) || [],
          is_correct: false,
          points_earned: 0,
        });
        continue;
      }

      let isCorrect = false;
      let pointsEarned = 0;

      if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
        // Single correct answer
        const correctOption = question.options?.find((o: any) => o.is_correct);
        isCorrect = correctOption && studentAnswer.selected_option_id === correctOption.id;
        pointsEarned = isCorrect ? question.points : 0;
      } else if (question.question_type === 'multi_select') {
        // Multiple correct answers - all must be selected
        const correctOptions = question.options?.filter((o: any) => o.is_correct) || [];
        const selectedOptions = dto.answers
          .filter((a) => a.question_id === question.id)
          .map((a) => a.selected_option_id);
        
        isCorrect = correctOptions.length === selectedOptions.length &&
          correctOptions.every((co: any) => selectedOptions.includes(co.id));
        pointsEarned = isCorrect ? question.points : 0;
      } else if (question.question_type === 'essay' || question.question_type === 'short_answer') {
        // Manual grading required - set points to 0 for now
        isCorrect = false;
        pointsEarned = 0;
      }

      if (isCorrect) {
        correctAnswers++;
        totalScore += pointsEarned;
      }

      // Store answer
      answersToInsert.push({
        attempt_id: dto.attempt_id,
        question_id: question.id,
        selected_option_id: studentAnswer.selected_option_id || null,
        answer_text: studentAnswer.answer_text || null,
        is_correct: isCorrect,
        points_earned: pointsEarned,
      });

      answerResults.push({
        question,
        selected_option: question.options?.find((o: any) => o.id === studentAnswer.selected_option_id),
        correct_options: question.options?.filter((o: any) => o.is_correct) || [],
        is_correct: isCorrect,
        points_earned: pointsEarned,
      });
    }

    // Insert all answers
    if (answersToInsert.length > 0) {
      const { error: insertError } = await this.supabase
        .from('student_exam_answers')
        .insert(answersToInsert);

      if (insertError) {
        this.logger.error('Error inserting exam answers:', insertError);
        throw new BadRequestException(`Failed to save answers: ${insertError.message}`);
      }
    }

    // Calculate percentage
    const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const passed = percentage >= (attempt.exam?.passing_score || 60);

    // Update attempt
    const { error: updateError } = await this.supabase
      .from('student_exam_attempts')
      .update({
        status: 'completed',
        score: totalScore,
        max_score: maxScore,
        percentage,
        passed,
        completed_at: new Date().toISOString(),
        time_spent_seconds: dto.time_spent_seconds,
      })
      .eq('id', dto.attempt_id);

    if (updateError) {
      this.logger.error('Error updating exam attempt:', updateError);
      throw new BadRequestException(`Failed to complete attempt: ${updateError.message}`);
    }

    return {
      attempt: {
        id: dto.attempt_id,
        score: totalScore,
        max_score: maxScore,
        percentage,
        passed,
      },
      correct_answers: correctAnswers,
      total_questions: questions.length,
      answers: answerResults,
    };
  }
}
