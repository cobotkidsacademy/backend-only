import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

export interface AttendanceRecord {
  id: string;
  student_id: string;
  class_id: string;
  course_level_id?: string;
  attendance_date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  marked_at: string;
  marked_by?: string;
  login_timestamp?: string;
  class_schedule_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StudentAttendanceInfo {
  student_id: string;
  first_name: string;
  last_name: string;
  username: string;
  attendance: AttendanceRecord[];
}

export interface AttendanceRegisterEntry {
  student_id: string;
  student_name: string;
  student_number?: string;
  attendance: {
    [date: string]: 'present' | 'absent' | 'late' | 'excused' | null;
  };
}

export interface AttendanceRegister {
  class_id: string;
  class_name: string;
  course_level_id?: string;
  course_level_name?: string;
  course_name?: string;
  school_id: string;
  school_name: string;
  lead_tutor?: {
    id: string;
    name: string;
  };
  assistant_tutor?: {
    id: string;
    name: string;
  };
  date_range: {
    start_date: string;
    end_date: string;
  };
  dates: string[];
  entries: AttendanceRegisterEntry[];
  summary: {
    total_students: number;
    total_days: number;
    attendance_rate: number;
  };
}

export class MarkAttendanceDto {
  @IsString()
  student_id: string;

  @IsString()
  class_id: string;

  @IsOptional()
  @IsString()
  course_level_id?: string;

  @IsDateString()
  attendance_date: string;

  @IsIn(['present', 'absent', 'late', 'excused'])
  status: 'present' | 'absent' | 'late' | 'excused';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class GetAttendanceDto {
  @IsString()
  class_id: string;

  @IsOptional()
  @IsString()
  course_level_id?: string;

  @IsDateString()
  start_date: string;

  @IsOptional()
  @IsDateString()
  end_date?: string; // Optional - backend calculates 12 weeks from start_date

  @IsOptional()
  @IsString()
  student_id?: string;
}

export class AutoMarkAttendanceDto {
  @IsString()
  student_id: string;

  @IsDateString()
  login_timestamp: string;
}

