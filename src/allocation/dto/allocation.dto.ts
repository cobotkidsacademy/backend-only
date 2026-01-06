import { IsString, IsUUID, IsEnum, IsOptional, Matches } from 'class-validator';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type TutorRole = 'lead' | 'assistant';

// ==================== Class Schedule DTOs ====================

export class CreateScheduleDto {
  @IsUUID()
  class_id: string;

  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  day_of_week: DayOfWeek;

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'start_time must be in HH:MM format' })
  start_time: string;

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'end_time must be in HH:MM format' })
  end_time: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  day_of_week?: DayOfWeek;

  @IsOptional()
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'start_time must be in HH:MM format' })
  start_time?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'end_time must be in HH:MM format' })
  end_time?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

// ==================== Tutor Assignment DTOs ====================

export class AssignTutorDto {
  @IsUUID()
  tutor_id: string;

  @IsUUID()
  class_id: string;

  @IsEnum(['lead', 'assistant'])
  role: TutorRole;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsEnum(['lead', 'assistant'])
  role?: TutorRole;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

// ==================== Response Types ====================

export interface ClassSchedule {
  id: string;
  class_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  class?: {
    id: string;
    name: string;
    level: string;
    school?: {
      id: string;
      name: string;
      code: string;
    };
  };
}

export interface TutorAssignment {
  id: string;
  tutor_id: string;
  class_id: string;
  role: TutorRole;
  status: 'active' | 'inactive';
  assigned_at: string;
  created_at: string;
  updated_at: string;
  tutor?: {
    id: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
    phone: string;
    level: string;
  };
  class?: {
    id: string;
    name: string;
    level: string;
    school?: {
      id: string;
      name: string;
      code: string;
    };
  };
}

// ==================== Class Course Level Assignment DTOs ====================

export class AssignCourseLevelDto {
  @IsUUID()
  class_id: string;

  @IsUUID()
  course_level_id: string;

  @IsEnum(['enrolled', 'completed'])
  enrollment_status: 'enrolled' | 'completed';
}

export class UpdateCourseLevelStatusDto {
  @IsEnum(['enrolled', 'completed'])
  enrollment_status: 'enrolled' | 'completed';
}

export interface ClassCourseLevelAssignment {
  id: string;
  class_id: string;
  course_level_id: string;
  enrollment_status: 'enrolled' | 'completed';
  assigned_at: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  course_level?: {
    id: string;
    course_id: string;
    level_number: number;
    name: string;
    course?: {
      id: string;
      name: string;
      code: string;
    };
  };
  class?: {
    id: string;
    name: string;
    level: string;
  };
}

export interface AllocationDetail {
  class: {
    id: string;
    name: string;
    level: string;
    school: {
      id: string;
      name: string;
      code: string;
    };
  };
  schedule: ClassSchedule | null;
  lead_tutor: TutorAssignment | null;
  assistant_tutor: TutorAssignment | null;
  course_levels?: ClassCourseLevelAssignment[];
  student_count: number;
}

// ==================== Course Editor Assignment DTOs ====================

export class AssignCourseEditorDto {
  @IsUUID()
  course_id: string;

  @IsEnum(['inter', 'exter'])
  editor_type: 'inter' | 'exter';

  @IsString()
  editor_link: string;
}

export class UpdateCourseEditorDto {
  @IsOptional()
  @IsEnum(['inter', 'exter'])
  editor_type?: 'inter' | 'exter';

  @IsOptional()
  @IsString()
  editor_link?: string;
}

export interface CourseEditorAssignment {
  id: string;
  course_id: string;
  editor_type: 'inter' | 'exter';
  editor_link: string;
  created_at: string;
  updated_at: string;
  course?: {
    id: string;
    name: string;
    code: string;
  };
}


