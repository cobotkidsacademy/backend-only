export interface CourseLevel {
  id: string;
  course_id: string;
  level_number: number;
  name: string;
  description?: string;
  enrollment_status: 'enrolled' | 'completed' | 'not_assigned';
  assignment_id?: string;
}

export interface CourseWithLevels {
  id: string;
  name: string;
  code: string;
  description?: string;
  icon_image_url?: string;
  total_levels: number;
  enrolled_levels: number;
  completed_levels: number;
  not_assigned_levels: number;
  course_status: 'completed' | 'in_progress' | 'not_started';
  levels: CourseLevel[];
}

export interface StudentCoursesResponse {
  courses: CourseWithLevels[];
  class_id: string;
  class_name: string;
}

export interface ValidateClassCodeDto {
  class_id: string;
  code: string;
}

export interface ClassCodeValidationResponse {
  valid: boolean;
  message: string;
  course_level_id?: string;
  topic_redirect_url?: string;
}







