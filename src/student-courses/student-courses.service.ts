import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  CourseWithLevels,
  CourseLevel,
  StudentCoursesResponse,
  ClassCodeValidationResponse,
} from './dto/student-courses.dto';

@Injectable()
export class StudentCoursesService {
  constructor(@Inject('SUPABASE_CLIENT') private supabase: SupabaseClient) {}

  async getCoursesForStudentClass(studentId: string): Promise<StudentCoursesResponse> {
    // Get student's class
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id, class:classes(id, name, level)')
      .eq('id', studentId)
      .single();

    if (studentError || !student || !student.class_id) {
      throw new NotFoundException('Student or class not found');
    }

    const classId = student.class_id;
    const classData = Array.isArray(student.class) ? student.class[0] : student.class;

    // Get all active courses with their levels
    const { data: courses, error: coursesError } = await this.supabase
      .from('courses')
      .select(`
        id,
        name,
        code,
        description,
        icon_image_url,
        level_count,
        course_levels(
          id,
          course_id,
          level_number,
          name,
          description,
          status
        )
      `)
      .eq('status', 'active')
      .order('name');

    if (coursesError) {
      throw new BadRequestException(coursesError.message);
    }

    // Get class course level assignments for this class
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('class_course_level_assignments')
      .select('id, course_level_id, enrollment_status')
      .eq('class_id', classId);

    if (assignmentsError) {
      throw new BadRequestException(assignmentsError.message);
    }

    // Create a map of course_level_id to assignment
    const assignmentMap = new Map(
      (assignments || []).map((a: any) => [a.course_level_id, a])
    );

    // Build the response
    const coursesWithLevels: CourseWithLevels[] = (courses || []).map((course: any) => {
      const levels = (course.course_levels || [])
        .filter((l: any) => l.status === 'active')
        .sort((a: any, b: any) => a.level_number - b.level_number)
        .map((level: any) => {
          const assignment = assignmentMap.get(level.id);
          return {
            id: level.id,
            course_id: level.course_id,
            level_number: level.level_number,
            name: level.name,
            description: level.description,
            enrollment_status: assignment
              ? assignment.enrollment_status
              : 'not_assigned',
            assignment_id: assignment?.id,
          } as CourseLevel;
        });

      const enrolledLevels = levels.filter(
        (l: CourseLevel) => l.enrollment_status === 'enrolled'
      ).length;
      const completedLevels = levels.filter(
        (l: CourseLevel) => l.enrollment_status === 'completed'
      ).length;
      const notAssignedLevels = levels.filter(
        (l: CourseLevel) => l.enrollment_status === 'not_assigned'
      ).length;

      // Determine course status
      let courseStatus: 'completed' | 'in_progress' | 'not_started';
      if (completedLevels === levels.length && levels.length > 0) {
        courseStatus = 'completed';
      } else if (enrolledLevels > 0 || completedLevels > 0) {
        courseStatus = 'in_progress';
      } else {
        courseStatus = 'not_started';
      }

      return {
        id: course.id,
        name: course.name,
        code: course.code,
        description: course.description,
        icon_image_url: course.icon_image_url,
        total_levels: levels.length,
        enrolled_levels: enrolledLevels,
        completed_levels: completedLevels,
        not_assigned_levels: notAssignedLevels,
        course_status: courseStatus,
        levels,
      };
    });

    return {
      courses: coursesWithLevels,
      class_id: classId,
      class_name: classData?.name || 'Unknown Class',
    };
  }

  async validateClassCode(
    studentId: string,
    courseLevelId: string,
    code: string,
  ): Promise<ClassCodeValidationResponse> {
    // Verify student exists and get class_id
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found');
    }

    const classId = student.class_id;

    // Get current network time
    const { data: timeData } = await this.supabase.rpc('get_current_timestamp');
    const networkTime = timeData ? new Date(timeData) : new Date();

    // Verify the class code and get topic info
    const { data: classCode, error: codeError } = await this.supabase
      .from('class_codes')
      .select(`
        *,
        topic:topics(
          id,
          name,
          level_id,
          course_level:course_levels(
            id,
            course_id,
            course:courses(id, name, code)
          )
        )
      `)
      .eq('class_id', classId)
      .eq('code', code)
      .eq('status', 'active')
      .gt('valid_until', networkTime.toISOString())
      .single();

    if (codeError || !classCode) {
      return {
        valid: false,
        message: 'Invalid or expired class code',
      };
    }

    // If topic is specified in code, verify it belongs to the selected course level
    if (classCode.topic_id && classCode.topic) {
      const topicLevelId = classCode.topic.level_id;
      if (topicLevelId !== courseLevelId) {
        return {
          valid: false,
          message: 'This code is for a different course level',
        };
      }
    }

    // If topic is specified, pre-fetch topic notes (note_elements) for faster loading
    let topicNotes = null;
    if (classCode.topic_id && classCode.topic) {
      try {
        // Get all notes for this topic first
        const { data: notes } = await this.supabase
          .from('notes')
          .select('id')
          .eq('topic_id', classCode.topic_id)
          .eq('status', 'active');

        if (notes && notes.length > 0) {
          // Get all note_elements for these notes (this is what frontend uses)
          const noteIds = notes.map((n: any) => n.id);
          const { data: noteElements } = await this.supabase
            .from('note_elements')
            .select(`
              id,
              element_type,
              content,
              position_x,
              position_y,
              width,
              height,
              z_index,
              font_size,
              font_weight,
              font_family,
              font_color,
              text_align,
              background_color,
              note_id,
              order_index
            `)
            .in('note_id', noteIds)
            .order('z_index', { ascending: true });
          
          topicNotes = noteElements || [];
        }
      } catch (err) {
        // Don't fail validation if notes fetch fails
        console.error('Error pre-fetching notes:', err);
      }
    }

    return {
      valid: true,
      message: 'Class code verified successfully',
      course_level_id: courseLevelId,
      topic_id: classCode.topic_id || null,
      topic: classCode.topic || null,
      topic_notes: topicNotes,
    };
  }

  async getLevelDetails(studentId: string, levelId: string): Promise<any> {
    // Get student's class
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found');
    }

    // Get level info with course
    const { data: level, error: levelError } = await this.supabase
      .from('course_levels')
      .select(`
        id,
        level_number,
        name,
        description,
        status,
        course:courses(id, name, code, icon_image_url)
      `)
      .eq('id', levelId)
      .single();

    if (levelError || !level) {
      throw new NotFoundException('Level not found');
    }

    // Get assignment status for this student's class
    const { data: assignment } = await this.supabase
      .from('class_course_level_assignments')
      .select('id, enrollment_status')
      .eq('class_id', student.class_id)
      .eq('course_level_id', levelId)
      .single();

    // Get topics for this level
    const { data: topics, error: topicsError } = await this.supabase
      .from('topics')
      .select(`
        id,
        name,
        description,
        order_index,
        status
      `)
      .eq('level_id', levelId)
      .eq('status', 'active')
      .order('order_index', { ascending: true });

    if (topicsError) {
      throw new BadRequestException(topicsError.message);
    }

    // Count notes for each topic (notes -> note_elements)
    const topicsWithCounts = await Promise.all(
      (topics || []).map(async (topic: any) => {
        // Count notes for this topic
        const { count: notesCount } = await this.supabase
          .from('notes')
          .select('*', { count: 'exact', head: true })
          .eq('topic_id', topic.id)
          .eq('status', 'active');

        // Count note_elements for all notes in this topic
        const { data: notes } = await this.supabase
          .from('notes')
          .select('id')
          .eq('topic_id', topic.id)
          .eq('status', 'active');

        let elementsCount = 0;
        if (notes && notes.length > 0) {
          const noteIds = notes.map((n: any) => n.id);
          const { count } = await this.supabase
            .from('note_elements')
            .select('*', { count: 'exact', head: true })
            .in('note_id', noteIds);
          elementsCount = count || 0;
        }

        return {
          ...topic,
          title: topic.name, // Map name to title for frontend compatibility
          notes_count: elementsCount,
        };
      })
    );

    const courseData = Array.isArray(level.course) ? level.course[0] : level.course;

    return {
      level: {
        id: level.id,
        level_number: level.level_number,
        name: level.name,
        description: level.description,
        course_id: courseData?.id,
        course_name: courseData?.name || 'Unknown Course',
        course_icon: courseData?.icon_image_url,
        enrollment_status: assignment?.enrollment_status || 'not_assigned',
      },
      topics: topicsWithCounts,
    };
  }

  async getTopicNotes(topicId: string): Promise<any[]> {
    // First get all notes for this topic
    const { data: notes, error: notesError } = await this.supabase
      .from('notes')
      .select('id')
      .eq('topic_id', topicId)
      .eq('status', 'active');

    if (notesError) {
      throw new BadRequestException(notesError.message);
    }

    if (!notes || notes.length === 0) {
      return [];
    }

    // Get all note_elements for these notes
    const noteIds = notes.map((n: any) => n.id);
    const { data: noteElements, error: elementsError } = await this.supabase
      .from('note_elements')
      .select(`
        id,
        element_type,
        content,
        position_x,
        position_y,
        width,
        height,
        z_index,
        font_size,
        font_weight,
        font_family,
        font_color,
        text_align,
        background_color,
        order_index
      `)
      .in('note_id', noteIds)
      .order('z_index', { ascending: true });

    if (elementsError) {
      throw new BadRequestException(elementsError.message);
    }

    return noteElements || [];
  }

  async getTopicsForLevel(courseLevelId: string): Promise<any[]> {
    const { data: topics, error } = await this.supabase
      .from('topics')
      .select('id, name, description, order_index')
      .eq('level_id', courseLevelId)
      .eq('status', 'active')
      .order('order_index', { ascending: true });

    if (error) {
      throw new BadRequestException(error.message);
    }

    // Map name to title for frontend compatibility
    return (topics || []).map((topic: any) => ({
      ...topic,
      title: topic.name,
    }));
  }

  async recordEditorAccess(
    studentId: string,
    username: string,
    courseId: string,
    topicId: string,
    editorType: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verify student exists and matches username
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, username')
      .eq('id', studentId)
      .eq('username', username)
      .single();

    if (studentError || !student) {
      throw new NotFoundException('Student not found or username mismatch');
    }

    // Verify course exists
    const { data: course, error: courseError } = await this.supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      throw new NotFoundException('Course not found');
    }

    // Verify topic exists
    const { data: topic, error: topicError } = await this.supabase
      .from('topics')
      .select('id')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new NotFoundException('Topic not found');
    }

    // Log the editor access (you can create a table for this or use existing logging mechanism)
    // For now, we'll just return success - you can extend this to store in a database table
    console.log('Editor access recorded:', {
      studentId,
      username,
      courseId,
      topicId,
      editorType,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'Editor access recorded successfully',
    };
  }
}
