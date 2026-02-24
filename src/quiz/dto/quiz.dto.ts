import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsIn, IsUUID, IsArray } from 'class-validator';

// ==================== Interfaces ====================

export interface Quiz {
  id: string;
  topic_id: string;
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
  topic?: {
    id: string;
    name: string;
    level?: {
      id: string;
      name: string;
      course?: {
        id: string;
        name: string;
      };
    };
  };
  questions?: QuizQuestion[];
}

export interface QuizQuestion {
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
  options?: QuizOption[];
}

export interface QuizOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  order_position: number;
  created_at: string;
  updated_at: string;
}

export interface StudentQuizAttempt {
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
  quiz?: Quiz;
  answers?: StudentQuizAnswer[];
}

export interface StudentQuizAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_id?: string;
  is_correct: boolean;
  points_earned: number;
  answered_at: string;
  question?: QuizQuestion;
  selected_option?: QuizOption;
}

export interface StudentQuizBestScore {
  id: string;
  student_id: string;
  quiz_id: string;
  best_score: number;
  best_percentage: number;
  attempts_count: number;
  first_attempt_at: string;
  last_attempt_at: string;
  created_at: string;
  updated_at: string;
  quiz?: Quiz;
}

export interface StudentTotalPoints {
  id: string;
  student_id: string;
  total_points: number;
  quizzes_completed: number;
  quizzes_passed: number;
  average_score: number;
  last_quiz_at?: string;
  created_at: string;
  updated_at: string;
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
  };
}

// ==================== DTOs ====================

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty({ message: 'Topic ID is required' })
  topic_id: string;

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
  @IsIn(['active', 'inactive', 'draft'], { message: 'Status must be active, inactive, or draft' })
  status?: 'active' | 'inactive' | 'draft';
}

export class UpdateQuizDto {
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

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'Quiz ID is required' })
  quiz_id: string;

  @IsString()
  @IsNotEmpty({ message: 'Question text is required' })
  question_text: string;

  @IsOptional()
  @IsString()
  @IsIn(['multiple_choice', 'true_false', 'multi_select'], { message: 'Question type must be multiple_choice, true_false, or multi_select' })
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
  options?: CreateOptionDto[];
}

export class UpdateQuestionDto {
  question_text?: string;
  question_type?: 'multiple_choice' | 'true_false' | 'multi_select';
  points?: number;
  order_position?: number;
  explanation?: string;
  image_url?: string;
  status?: 'active' | 'inactive';
}

export class CreateOptionDto {
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

export class UpdateOptionDto {
  option_text?: string;
  is_correct?: boolean;
  order_position?: number;
}

export class StartAttemptDto {
  @IsOptional()
  @IsString()
  student_id?: string; // Will be set from JWT token if not provided
  @IsString()
  @IsNotEmpty()
  quiz_id: string;
}

export class SubmitAnswerDto {
  attempt_id: string;
  question_id: string;
  selected_option_id: string;
}

export class CompleteAttemptDto {
  attempt_id: string;
  time_spent_seconds: number;
}

export class SubmitQuizDto {
  @IsString()
  @IsNotEmpty({ message: 'Attempt ID is required' })
  attempt_id: string;

  @IsNotEmpty({ message: 'Answers are required' })
  answers: {
    question_id: string;
    selected_option_id: string;
  }[];

  @IsNumber()
  @IsNotEmpty({ message: 'Time spent is required' })
  time_spent_seconds: number;

  /** Teamed-up student IDs to apply the same quiz result to (same class only). */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  team_member_ids?: string[];
}

// ==================== Response Types ====================

export interface QuizWithDetails extends Quiz {
  topic: {
    id: string;
    name: string;
    level: {
      id: string;
      name: string;
      course: {
        id: string;
        name: string;
      };
    };
  };
  questions: QuizQuestion[];
}

export interface AttemptResult {
  attempt: StudentQuizAttempt;
  correct_answers: number;
  total_questions: number;
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  is_new_high_score: boolean;
  points_earned: number;
  total_points: number;
  answers: {
    question: QuizQuestion;
    selected_option?: QuizOption;
    correct_option: QuizOption;
    is_correct: boolean;
    points_earned: number;
  }[];
}

export interface LeaderboardEntry {
  rank: number;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
  };
  total_points: number;
  quizzes_completed: number;
  quizzes_passed: number;
  average_score: number;
}

export interface StudentQuizProgress {
  quiz: Quiz;
  best_score?: StudentQuizBestScore;
  last_attempt?: StudentQuizAttempt;
  can_retake: boolean;
  status: 'not_started' | 'in_progress' | 'completed' | 'passed';
}

