import { Injectable } from '@nestjs/common';

/**
 * Response Shaping Service
 * 
 * Ensures minimal payloads by:
 * - Removing unnecessary fields
 * - Flattening nested structures when possible
 * - Selecting only requested fields
 */
@Injectable()
export class ResponseShapeService {
  /**
   * Shape user response (minimal)
   */
  shapeUser(user: any): {
    id: string;
    name: string;
    role: string;
    email?: string;
  } {
    return {
      id: user.id,
      name: this.getUserName(user),
      role: user.role || 'student',
      email: user.email,
    };
  }

  /**
   * Shape course response (minimal for list)
   */
  shapeCourseList(course: any): {
    id: string;
    name: string;
    code?: string;
    progress?: number;
    next_lesson_id?: string;
    next_lesson_title?: string;
  } {
    return {
      id: course.id,
      name: course.name,
      code: course.code,
      progress: course.progress_percentage || course.progress,
      next_lesson_id: course.next_lesson_id,
      next_lesson_title: course.next_lesson_title,
    };
  }

  /**
   * Shape course response (detailed)
   */
  shapeCourseDetail(course: any): any {
    return {
      id: course.id,
      name: course.name,
      code: course.code,
      description: course.description,
      levels: (course.levels || []).map((level: any) => ({
        id: level.id,
        name: level.name,
        level_number: level.level_number,
        progress: level.progress_percentage || 0,
        lessons_count: level.lessons_count || 0,
        completed_lessons: level.completed_lessons || 0,
      })),
      total_progress: course.total_progress || 0,
    };
  }

  /**
   * Shape lesson response (minimal for list)
   */
  shapeLessonList(lesson: any): {
    id: string;
    title: string;
    order_index: number;
    completed: boolean;
    video_url?: string;
  } {
    return {
      id: lesson.id,
      title: lesson.title,
      order_index: lesson.order_index || 0,
      completed: lesson.completed || false,
      video_url: lesson.video_url,
    };
  }

  /**
   * Shape lesson response (detailed - loaded on-demand)
   */
  shapeLessonDetail(lesson: any): any {
    return {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      video_url: lesson.video_url,
      video_metadata: lesson.video_metadata,
      order_index: lesson.order_index,
      assignments: (lesson.assignments || []).map((assign: any) => ({
        id: assign.id,
        title: assign.title,
        due_date: assign.due_date,
        status: assign.status,
      })),
    };
  }

  /**
   * Shape assignment response (minimal for list)
   */
  shapeAssignmentList(assignment: any): {
    id: string;
    title: string;
    due_date: string;
    status: string;
    lesson_id?: string;
  } {
    return {
      id: assignment.id,
      title: assignment.title,
      due_date: assignment.due_date,
      status: assignment.status,
      lesson_id: assignment.lesson_id,
    };
  }

  /**
   * Shape assignment response (detailed - loaded on-demand)
   */
  shapeAssignmentDetail(assignment: any): any {
    return {
      id: assignment.id,
      title: assignment.title,
      content: assignment.content,
      due_date: assignment.due_date,
      status: assignment.status,
      lesson: assignment.lesson
        ? {
            id: assignment.lesson.id,
            title: assignment.lesson.title,
          }
        : undefined,
    };
  }

  /**
   * Shape dashboard response (minimal)
   */
  shapeDashboard(data: {
    user: any;
    courses?: any[];
    assignments_count?: number;
    notifications_count?: number;
  }): any {
    return {
      user: this.shapeUser(data.user),
      enrolled_courses: (data.courses || []).map((c) => this.shapeCourseList(c)),
      upcoming_assignments_count: data.assignments_count || 0,
      notifications_count: data.notifications_count || 0,
    };
  }

  /**
   * Get user name from various user objects
   */
  private getUserName(user: any): string {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    if (user.name) {
      return user.name;
    }
    if (user.username) {
      return user.username;
    }
    if (user.email) {
      return user.email.split('@')[0];
    }
    return 'User';
  }

  /**
   * Select only specified fields from object
   */
  selectFields<T>(obj: any, fields: string[]): Partial<T> {
    const result: any = {};
    fields.forEach((field) => {
      if (obj[field] !== undefined) {
        result[field] = obj[field];
      }
    });
    return result;
  }
}
