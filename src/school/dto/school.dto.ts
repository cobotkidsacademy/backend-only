import { IsString, IsOptional, MinLength } from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @MinLength(2, { message: 'School name must be at least 2 characters' })
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateClassDto {
  @IsString()
  school_id: string;

  @IsString()
  @MinLength(1, { message: 'Class name is required' })
  name: string;

  @IsString()
  level: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateStudentDto {
  @IsString()
  class_id: string;

  @IsString()
  school_id: string;

  @IsString()
  @MinLength(1, { message: 'First name is required' })
  first_name: string;

  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  last_name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  guardian_name?: string;

  @IsOptional()
  @IsString()
  guardian_phone?: string;

  @IsOptional()
  @IsString()
  gender?: string;
}
