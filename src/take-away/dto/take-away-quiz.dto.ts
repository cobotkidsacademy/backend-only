import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsUUID, IsIn, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ==================== Interfaces ====================

export interface TakeAwayQuiz {
  id: string;
  title: string;
  description?: string;
  time_limit_minutes: number;
  passing_score: number;
  total_points: number;
  questions_count: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_correct_answers: boolean;
  allow_retake: boolean;
  status: 'active' | 'inactive' | 'draft';
  created_at: string;
  updated_at: string;
  questions?: TakeAwayQuizQuestion[];
}

export interface TakeAwayQuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'multi_select';
  points: number;
  order_position: number;
  explanation?: string;
  image_url?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  options?: TakeAwayQuizOption[];
}

export interface TakeAwayQuizOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  order_position: number;
  created_at: string;
  updated_at: string;
}

export interface TakeAwayQuizAttempt {
  id: string;
  student_id: string;
  quiz_id: string;
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  time_spent_seconds: number;
  started_at: string;
  completed_at?: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  created_at: string;
  updated_at: string;
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
  };
  quiz?: TakeAwayQuiz;
  answers?: TakeAwayQuizAnswer[];
}

export interface TakeAwayQuizAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_id?: string;
  is_correct: boolean;
  points_earned: number;
  answered_at: string;
  question?: TakeAwayQuizQuestion;
  selected_option?: TakeAwayQuizOption;
}

// ==================== DTOs ====================

export class CreateTakeAwayQuizDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  time_limit_minutes?: number;

  @IsOptional()
  @IsNumber()
  passing_score?: number;

  @IsOptional()
  @IsBoolean()
  shuffle_questions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffle_options?: boolean;

  @IsOptional()
  @IsBoolean()
  show_correct_answers?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_retake?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'draft'])
  status?: 'active' | 'inactive' | 'draft';
}

export class UpdateTakeAwayQuizDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  time_limit_minutes?: number;

  @IsOptional()
  @IsNumber()
  passing_score?: number;

  @IsOptional()
  @IsBoolean()
  shuffle_questions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffle_options?: boolean;

  @IsOptional()
  @IsBoolean()
  show_correct_answers?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_retake?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'draft'])
  status?: 'active' | 'inactive' | 'draft';
}

export class CreateTakeAwayQuizQuestionDto {
  @IsUUID()
  @IsNotEmpty({ message: 'Quiz ID is required' })
  quiz_id: string;

  @IsString()
  @IsNotEmpty({ message: 'Question text is required' })
  question_text: string;

  @IsOptional()
  @IsString()
  @IsIn(['multiple_choice', 'true_false', 'multi_select'])
  question_type?: 'multiple_choice' | 'true_false' | 'multi_select';

  @IsOptional()
  @IsNumber()
  points?: number;

  @IsOptional()
  @IsNumber()
  order_position?: number;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class UpdateTakeAwayQuizQuestionDto {
  @IsOptional()
  @IsString()
  question_text?: string;

  @IsOptional()
  @IsString()
  @IsIn(['multiple_choice', 'true_false', 'multi_select'])
  question_type?: 'multiple_choice' | 'true_false' | 'multi_select';

  @IsOptional()
  @IsNumber()
  points?: number;

  @IsOptional()
  @IsNumber()
  order_position?: number;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class CreateTakeAwayQuizOptionDto {
  @IsUUID()
  @IsNotEmpty({ message: 'Question ID is required' })
  question_id: string;

  @IsString()
  @IsNotEmpty({ message: 'Option text is required' })
  option_text: string;

  @IsBoolean()
  is_correct: boolean;

  @IsOptional()
  @IsNumber()
  order_position?: number;
}

export class UpdateTakeAwayQuizOptionDto {
  @IsOptional()
  @IsString()
  option_text?: string;

  @IsOptional()
  @IsBoolean()
  is_correct?: boolean;

  @IsOptional()
  @IsNumber()
  order_position?: number;
}

export class StartTakeAwayQuizAttemptDto {
  @IsOptional()
  @IsUUID()
  student_id?: string; // Will be set from JWT token if not provided

  @IsUUID()
  @IsNotEmpty()
  quiz_id: string;
}

export class SubmitTakeAwayQuizAttemptDto {
  @IsUUID()
  @IsNotEmpty({ message: 'Attempt ID is required' })
  attempt_id: string;

  @IsArray()
  @IsNotEmpty({ message: 'Answers are required' })
  @ValidateNested({ each: true })
  @Type(() => TakeAwayQuizAnswerDto)
  answers: TakeAwayQuizAnswerDto[];

  @IsNumber()
  @IsNotEmpty({ message: 'Time spent is required' })
  time_spent_seconds: number;
}

export class TakeAwayQuizAnswerDto {
  @IsUUID()
  @IsNotEmpty()
  question_id: string;

  @IsOptional()
  @IsUUID()
  selected_option_id?: string;
}
