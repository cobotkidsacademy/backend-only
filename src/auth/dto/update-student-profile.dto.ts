import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class UpdateStudentProfileDto {
  @IsString({ message: 'Username must be a string' })
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  first_name: string;

  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  last_name: string;

  @IsUUID('4', { message: 'School ID must be a valid UUID' })
  @IsNotEmpty({ message: 'School ID is required' })
  school_id: string;

  @IsUUID('4', { message: 'Class ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Class ID is required' })
  class_id: string;
}















