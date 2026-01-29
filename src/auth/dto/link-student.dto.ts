import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class LinkStudentDto {
  @IsString()
  @IsNotEmpty()
  student_username: string;

  @IsString()
  @IsOptional()
  relationship?: string;
}










