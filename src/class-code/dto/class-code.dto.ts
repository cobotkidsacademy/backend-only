import { IsUUID, IsString, IsOptional, IsEnum } from 'class-validator';

export class GenerateCodeDto {
  @IsUUID()
  class_id: string;

  @IsUUID()
  @IsOptional()
  generated_by_tutor_id?: string;
}

export class ValidateCodeDto {
  @IsString()
  code: string;

  @IsUUID()
  class_id: string;
}

export type ClassCodeStatus = 'active' | 'expired' | 'used';
export type ClassStatus = 'unassigned' | 'assigned' | 'upcoming' | 'today' | 'tomorrow' | 'past';

export interface ClassCode {
  id: string;
  class_id: string;
  schedule_id: string;
  code: string;
  valid_from: string;
  valid_until: string;
  generated_by_tutor_id: string | null;
  generated_at: string;
  status: ClassCodeStatus;
  created_at: string;
  updated_at: string;
  generated_by?: {
    id: string;
    first_name: string;
    middle_name: string;
    last_name: string;
  };
}

export interface ClassWithAllocation {
  id: string;
  name: string;
  level: string;
  description?: string;
  status: string;
  school: {
    id: string;
    name: string;
    code: string;
  };
  schedule: {
    id: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
  } | null;
  lead_tutor: {
    id: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
  } | null;
  assistant_tutor: {
    id: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
  } | null;
  student_count: number;
  current_code: ClassCode | null;
  class_status: ClassStatus;
  can_generate_code: boolean;
  next_class_datetime: string | null;
  time_window: {
    starts_at: string | null;
    ends_at: string | null;
    is_within_window: boolean;
  };
}

