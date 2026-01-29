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

  /**
   * Validate class code without requiring the client to provide a course level.
   * Returns the matched course_id/course_level_id/topic_id so the UI can navigate immediately.
   */
  async validateClassCodeAny(studentId: string, code: string): Promise<any> {
    if (!code || typeof code !== 'string' || !/^\d{3}$/.test(code)) {
      return { valid: false, message: 'Invalid code format' };
    }

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

    // Find the active code for this class
    const { data: classCode, error: codeError } = await this.supabase
      .from('class_codes')
      .select(
        `
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
      `,
      )
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

    const courseLevelId: string | null = classCode?.topic?.level_id || null;
    const courseId: string | null = classCode?.topic?.course_level?.course_id || null;

    if (!courseLevelId || !courseId) {
      // Code exists but is missing topic/level mapping; treat as invalid for navigation
      return {
        valid: false,
        message: 'This class code is not linked to a course level',
      };
    }

    // Ensure the class is actually enrolled/completed for that course level (basic safety)
    const { data: assignment, error: assignmentError } = await this.supabase
      .from('class_course_level_assignments')
      .select('id, enrollment_status')
      .eq('class_id', classId)
      .eq('course_level_id', courseLevelId)
      .in('enrollment_status', ['enrolled', 'completed'])
      .maybeSingle();

    if (assignmentError || !assignment) {
      return {
        valid: false,
        message: 'This code is for a course level not assigned to your class',
      };
    }

    // Pre-fetch topic notes (note_elements) for faster loading (same logic as validateClassCode)
    let topicNotes = null;
    if (classCode.topic_id && classCode.topic) {
      try {
        const { data: notes } = await this.supabase
          .from('notes')
          .select('id')
          .eq('topic_id', classCode.topic_id)
          .eq('status', 'active');

        if (notes && notes.length > 0) {
          const noteIds = notes.map((n: any) => n.id);
          const { data: noteElements } = await this.supabase
            .from('note_elements')
            .select(
              `
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
            `,
            )
            .in('note_id', noteIds)
            .order('z_index', { ascending: true });

          topicNotes = noteElements || [];
        }
      } catch (err) {
        console.error('Error pre-fetching notes:', err);
      }
    }

    return {
      valid: true,
      message: 'Class code verified successfully',
      course_id: courseId,
      course_level_id: courseLevelId,
      topic_id: classCode.topic_id || null,
      topic: classCode.topic || null,
      topic_notes: topicNotes,
    };
  }

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

  async getStudentPortfolio(studentId: string): Promise<any[]> {
    // Get all student saved projects (from student_saved_projects table)
    const { data: savedProjects, error: savedProjectsError } = await this.supabase
      .from('student_saved_projects')
      .select(`
        id,
        project_name,
        project_title,
        topic_id,
        course_level_id,
        course_id,
        editor_type,
        editor_url,
        project_type,
        updated_at,
        created_at,
        last_accessed_at,
        topic:topics(
          id,
          name
        ),
        course_level:course_levels(
          id,
          name
        ),
        course:courses(
          id,
          name
        )
      `)
      .eq('student_id', studentId)
      .eq('is_current', true)
      .order('updated_at', { ascending: false });

    if (savedProjectsError) {
      throw new BadRequestException(`Failed to fetch saved projects: ${savedProjectsError.message}`);
    }

    // Also get project submissions for backward compatibility
    const { data: submissions, error: submissionsError } = await this.supabase
      .from('student_project_submissions')
      .select(`
        id,
        project_id,
        submitted_at,
        updated_at,
        project:projects(
          id,
          title,
          topic_id,
          topic:topics(
            id,
            name,
            level_id,
            course_level:course_levels(
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
      `)
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false });

    if (submissionsError) {
      console.error('Error fetching project submissions:', submissionsError);
      // Don't throw, just log - we can still return saved projects
    }

    const portfolioItems: any[] = [];

    // Add saved projects
    if (savedProjects && savedProjects.length > 0) {
      savedProjects.forEach((savedProject: any) => {
        const topic = Array.isArray(savedProject.topic) ? savedProject.topic[0] : savedProject.topic;
        const courseLevel = Array.isArray(savedProject.course_level) ? savedProject.course_level[0] : savedProject.course_level;
        const course = Array.isArray(savedProject.course) ? savedProject.course[0] : savedProject.course;

        portfolioItems.push({
          id: savedProject.id,
          project_id: savedProject.id, // Use saved project ID
          topic_id: savedProject.topic_id,
          topic_name: topic?.name || savedProject.project_name,
          course_level_id: savedProject.course_level_id,
          course_level_name: courseLevel?.name || 'Unknown Level',
          course_id: savedProject.course_id,
          course_name: course?.name || 'Unknown Course',
          project_title: savedProject.project_title || savedProject.project_name,
          editor_type: savedProject.editor_type || 'inter',
          editor_url: savedProject.editor_url || '',
          project_type: savedProject.project_type,
          saved_at: savedProject.created_at,
          updated_at: savedProject.updated_at,
          is_saved_project: true, // Flag to identify saved projects vs submissions
        });
      });
    }

    // Add project submissions (for backward compatibility)
    if (submissions && submissions.length > 0) {
      submissions
        .filter((submission: any) => submission.project && submission.project.topic)
        .forEach((submission: any) => {
          const project = submission.project;
          const topic = project.topic;
          const courseLevel = topic.course_level;
          const course = courseLevel?.course;

          portfolioItems.push({
            id: submission.id,
            project_id: project.id,
            topic_id: topic.id,
            topic_name: topic.name,
            course_level_id: courseLevel?.id || '',
            course_level_name: courseLevel?.name || 'Unknown Level',
            course_id: course?.id || '',
            course_name: course?.name || 'Unknown Course',
            project_title: project.title,
            editor_type: 'inter' as 'inter' | 'exter',
            editor_url: '',
            saved_at: submission.submitted_at,
            updated_at: submission.updated_at,
            is_saved_project: false, // Flag to identify saved projects vs submissions
          });
        });
    }

    // Fetch editor info for topics that don't have it
    const topicIds = [...new Set(portfolioItems.map((item: any) => item.topic_id))];
    if (topicIds.length > 0) {
      const { data: topics, error: topicsError } = await this.supabase
        .from('topics')
        .select('id, editor_type, editor_url')
        .in('id', topicIds);

      if (!topicsError && topics) {
        const topicMap = new Map(topics.map((t: any) => [t.id, t]));
        portfolioItems.forEach((item: any) => {
          if (!item.editor_url || !item.editor_type) {
            const topic = topicMap.get(item.topic_id);
            if (topic) {
              item.editor_type = item.editor_type || topic.editor_type || 'inter';
              item.editor_url = item.editor_url || topic.editor_url || '';
            }
          }
        });
      }
    }

    return portfolioItems;
  }

  async saveStudentProject(
    studentId: string,
    projectData: {
      project_id?: string; // Optional: ID of existing project to update
      topic_id: string;
      course_level_id: string;
      course_id: string;
      project_name: string;
      project_title?: string;
      editor_type: 'inter' | 'exter';
      editor_url?: string;
      project_data?: any;
      project_html?: string;
      project_code?: string;
      project_files?: any[];
      project_type?: string;
      file_format?: string;
      is_autosaved?: boolean;
    },
  ): Promise<any> {
    console.log('Saving project:', {
      studentId,
      projectId: projectData.project_id,
      topicId: projectData.topic_id,
      courseId: projectData.course_id,
      levelId: projectData.course_level_id,
      projectName: projectData.project_name,
      hasProjectData: !!projectData.project_data,
      projectDataType: typeof projectData.project_data,
      projectDataKeys: projectData.project_data ? Object.keys(projectData.project_data) : [],
      sb3Base64Length: projectData.project_data?.sb3Base64 ? projectData.project_data.sb3Base64.length : 0,
    });

    // Verify student exists
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      console.error('Student lookup error:', studentError);
      throw new NotFoundException(`Student not found: ${studentId}`);
    }

    // Verify topic exists - try without .single() first to see if it exists
    const { data: topics, error: topicError } = await this.supabase
      .from('topics')
      .select('id, name, status')
      .eq('id', projectData.topic_id);

    if (topicError) {
      console.error('Topic lookup error:', topicError);
      throw new NotFoundException(`Topic lookup failed: ${topicError.message}`);
    }
    
    if (!topics || topics.length === 0) {
      console.error(`Topic not found with ID: ${projectData.topic_id}`);
      // Try to find similar topics for debugging
      const { data: allTopics } = await this.supabase
        .from('topics')
        .select('id, name')
        .limit(5);
      console.log('Sample topics in database:', allTopics);
      throw new NotFoundException(`Topic not found with ID: ${projectData.topic_id}`);
    }
    
    const topic = topics[0];
    
    // Check if topic is active
    if (topic.status && topic.status !== 'active') {
      console.warn(`Topic ${projectData.topic_id} is not active (status: ${topic.status})`);
    }

    // Calculate file size
    let fileSizeBytes = 0;
    if (projectData.project_data) {
      fileSizeBytes += JSON.stringify(projectData.project_data).length;
    }
    if (projectData.project_html) {
      fileSizeBytes += projectData.project_html.length;
    }
    if (projectData.project_code) {
      fileSizeBytes += projectData.project_code.length;
    }
    if (projectData.project_files) {
      fileSizeBytes += JSON.stringify(projectData.project_files).length;
    }

    // Define session threshold: 1 hour (3600000 ms)
    // If project was accessed within 1 hour, update it; otherwise create new version
    const SESSION_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
    const now = new Date();
    let shouldUpdate = false;
    let projectToUpdate = null;

    // If project_id is provided, check if we should update it
    if (projectData.project_id) {
      const { data: existingProjectById, error: projectByIdError } = await this.supabase
        .from('student_saved_projects')
        .select('id, version, last_accessed_at, is_current, student_id, topic_id')
        .eq('id', projectData.project_id)
        .single();

      if (!projectByIdError && existingProjectById) {
        // Verify the project belongs to this student and topic
        if (
          existingProjectById.student_id === studentId &&
          existingProjectById.topic_id === projectData.topic_id
        ) {
          const lastAccessed = new Date(existingProjectById.last_accessed_at);
          const timeSinceLastAccess = now.getTime() - lastAccessed.getTime();

          // If accessed recently (within session threshold), update it
          if (timeSinceLastAccess < SESSION_THRESHOLD_MS && existingProjectById.is_current) {
            shouldUpdate = true;
            projectToUpdate = existingProjectById;
          }
        }
      }
    }

    // If not updating by project_id, check for existing current project
    if (!shouldUpdate) {
      const { data: existingProject, error: existingError } = await this.supabase
        .from('student_saved_projects')
        .select('id, version, last_accessed_at')
        .eq('student_id', studentId)
        .eq('topic_id', projectData.topic_id)
        .eq('is_current', true)
        .single();

      if (existingProject && !existingError) {
        const lastAccessed = new Date(existingProject.last_accessed_at);
        const timeSinceLastAccess = now.getTime() - lastAccessed.getTime();

        // If accessed recently (within session threshold), update it
        if (timeSinceLastAccess < SESSION_THRESHOLD_MS) {
          shouldUpdate = true;
          projectToUpdate = existingProject;
        }
      }
    }

    // If we should update, update the existing project
    if (shouldUpdate && projectToUpdate) {
      const { data: updatedProject, error: updateError } = await this.supabase
        .from('student_saved_projects')
        .update({
          project_name: projectData.project_name,
          project_title: projectData.project_title || projectData.project_name,
          editor_type: projectData.editor_type || 'inter',
          editor_url: projectData.editor_url || '',
          project_data: projectData.project_data || null,
          project_html: projectData.project_html || null,
          project_code: projectData.project_code || null,
          project_files: projectData.project_files ? JSON.stringify(projectData.project_files) : null,
          project_type: projectData.project_type || 'scratch',
          file_format: projectData.file_format || 'sb3', // Default to 'sb3' for Scratch projects
          file_size_bytes: fileSizeBytes,
          is_autosaved: projectData.is_autosaved || false,
          last_accessed_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', projectToUpdate.id)
        .select()
        .single();

      if (updateError) {
        throw new BadRequestException(`Failed to update project: ${updateError.message}`);
      }

      console.log('Updated existing project:', updatedProject.id);
      return updatedProject;
    }

    // Otherwise, create a new version
    // Mark old current version as not current if it exists
    const { data: oldCurrentProject } = await this.supabase
      .from('student_saved_projects')
      .select('id, version')
      .eq('student_id', studentId)
      .eq('topic_id', projectData.topic_id)
      .eq('is_current', true)
      .maybeSingle();

    let version = 1;
    if (oldCurrentProject) {
      // Mark old version as not current
      await this.supabase
        .from('student_saved_projects')
        .update({ is_current: false })
        .eq('id', oldCurrentProject.id);

      version = (oldCurrentProject.version || 1) + 1;
    }

    // Insert new project version
    const { data: savedProject, error: saveError } = await this.supabase
      .from('student_saved_projects')
      .insert({
        student_id: studentId,
        topic_id: projectData.topic_id,
        course_level_id: projectData.course_level_id,
        course_id: projectData.course_id,
        project_name: projectData.project_name,
        project_title: projectData.project_title || projectData.project_name,
        editor_type: projectData.editor_type || 'inter',
        editor_url: projectData.editor_url || '',
        project_data: projectData.project_data || null,
        project_html: projectData.project_html || null,
        project_code: projectData.project_code || null,
        project_files: projectData.project_files ? JSON.stringify(projectData.project_files) : null,
        project_type: projectData.project_type || 'scratch',
        file_format: projectData.file_format || 'sb3', // Default to 'sb3' for Scratch projects
        file_size_bytes: fileSizeBytes,
        is_autosaved: projectData.is_autosaved || false,
        version: version,
        is_current: true,
        last_accessed_at: now.toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      throw new BadRequestException(`Failed to save project: ${saveError.message}`);
    }

    console.log('Created new project version:', savedProject.id, 'version:', version);
    return savedProject;
  }

  async getStudentProject(studentId: string, projectId: string): Promise<any> {
    console.log('Getting project:', { studentId, projectId });
    
    // Get project and verify it belongs to the student
    const { data: projects, error: projectError } = await this.supabase
      .from('student_saved_projects')
      .select(`
        *,
        topic:topics(
          id,
          name
        ),
        course_level:course_levels(
          id,
          name
        ),
        course:courses(
          id,
          name
        )
      `)
      .eq('id', projectId)
      .eq('student_id', studentId);

    if (projectError) {
      console.error('Project lookup error:', projectError);
      throw new NotFoundException(`Project lookup failed: ${projectError.message}`);
    }

    if (!projects || projects.length === 0) {
      console.error(`Project not found: projectId=${projectId}, studentId=${studentId}`);
      // Check if project exists but belongs to different student
      const { data: otherProject } = await this.supabase
        .from('student_saved_projects')
        .select('id, student_id')
        .eq('id', projectId)
        .single();
      
      if (otherProject) {
        throw new NotFoundException(`Project not found or access denied. Project exists but belongs to different student.`);
      }
      throw new NotFoundException(`Project not found with ID: ${projectId}`);
    }

    const project = projects[0];

    // Update last_accessed_at
    await this.supabase
      .from('student_saved_projects')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', projectId);

    // Parse project_files if it's a string
    if (project.project_files && typeof project.project_files === 'string') {
      try {
        project.project_files = JSON.parse(project.project_files);
      } catch (e) {
        // If parsing fails, keep as is
      }
    }

    // Parse project_data if it contains sb3Base64
    if (project.project_data && typeof project.project_data === 'object') {
      // project_data is already a JSON object, no need to parse
      // But if it has sb3Base64, we keep it as is for the frontend
    }

    console.log('Project retrieved successfully:', {
      id: project.id,
      projectName: project.project_name,
      hasProjectData: !!project.project_data,
      projectType: project.project_type
    });

    return project;
  }

  async getStudentProjectSb3(
    studentId: string,
    projectId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.getStudentProject(studentId, projectId);

    const sb3Base64 = project?.project_data?.sb3Base64;
    if (!sb3Base64 || typeof sb3Base64 !== 'string') {
      throw new BadRequestException('Project does not contain sb3 data');
    }

    // Basic filename safety
    const rawName = (project.project_title || project.project_name || 'project').toString();
    const safeBase = rawName.replace(/[^a-zA-Z0-9 _.-]/g, '').trim() || 'project';
    const filename = `${safeBase}.sb3`;

    const buffer = Buffer.from(sb3Base64, 'base64');
    return { buffer, filename };
  }

  async getStudentProjectsByTopic(studentId: string, topicId: string): Promise<any[]> {
    // Get all projects for this student and topic (including old versions)
    const { data: projects, error: projectsError } = await this.supabase
      .from('student_saved_projects')
      .select('*')
      .eq('student_id', studentId)
      .eq('topic_id', topicId)
      .order('version', { ascending: false });

    if (projectsError) {
      throw new BadRequestException(`Failed to fetch projects: ${projectsError.message}`);
    }

    // Parse project_files for each project
    return (projects || []).map((project: any) => {
      if (project.project_files && typeof project.project_files === 'string') {
        try {
          project.project_files = JSON.parse(project.project_files);
        } catch (e) {
          // If parsing fails, keep as is
        }
      }
      return project;
    });
  }

  async getTopicDetails(topicId: string): Promise<any> {
    const { data: topic, error: topicError } = await this.supabase
      .from('topics')
      .select(`
        id,
        name,
        description,
        level_id,
        course_level:course_levels(
          id,
          name,
          course_id,
          course:courses(
            id,
            name
          )
        )
      `)
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new NotFoundException('Topic not found');
    }

    return {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      level_id: topic.level_id,
      course_level: topic.course_level,
    };
  }
}
