import { IsUUID, IsNotEmpty, IsOptional, IsDateString, IsEnum } from 'class-validator';

export interface TakeAwayAssignment {
  id: string;
  class_id: string;
  tutor_id: string;
  course_level_id: string;
  take_away_quiz_id?: string;
  enrollment_status: 'enrolled' | 'completed';
  due_date?: string;
  assigned_at: string;
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
  tutor?: {
    id: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
  };
  course_level?: {
    id: string;
    name: string;
    level_number: number;
    course?: {
      id: string;
      name: string;
      code: string;
    };
  };
  take_away_quiz?: {
    id: string;
    title: string;
    description?: string;
    questions_count: number;
    total_points: number;
    passing_score: number;
  };
}

export class CreateTakeAwayDto {
  @IsUUID()
  @IsNotEmpty()
  class_id: string;

  @IsUUID()
  @IsNotEmpty()
  tutor_id: string;

  @IsUUID()
  @IsNotEmpty()
  course_level_id: string;

  @IsUUID()
  @IsOptional()
  take_away_quiz_id?: string;

  @IsEnum(['enrolled', 'completed'])
  @IsNotEmpty()
  enrollment_status: 'enrolled' | 'completed';

  @IsDateString()
  @IsOptional()
  due_date?: string;
}

export class UpdateTakeAwayDto {
  @IsUUID()
  @IsOptional()
  tutor_id?: string;

  @IsUUID()
  @IsOptional()
  course_level_id?: string;

  @IsUUID()
  @IsOptional()
  take_away_quiz_id?: string;

  @IsEnum(['enrolled', 'completed'])
  @IsOptional()
  enrollment_status?: 'enrolled' | 'completed';

  @IsDateString()
  @IsOptional()
  due_date?: string;
}
