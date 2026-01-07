import { IsString, IsOptional, MinLength, IsDateString } from 'class-validator';

export class CreateTutorDto {
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  first_name: string;

  @IsString()
  @MinLength(2, { message: 'Middle name must be at least 2 characters' })
  middle_name: string;

  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  last_name: string;

  @IsString()
  level: string; // intern, tutor, manager, edl, operations_manager, curriculum_manager

  @IsString()
  gender: string; // male, female, other

  @IsString()
  phone: string;

  // Optional fields
  @IsOptional()
  @IsString()
  id_number?: string;

  @IsOptional()
  @IsString()
  nssf_no?: string;

  @IsOptional()
  @IsString()
  kra_pin?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  profile_image_url?: string;
}

export class UpdateTutorDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  middle_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  id_number?: string;

  @IsOptional()
  @IsString()
  nssf_no?: string;

  @IsOptional()
  @IsString()
  kra_pin?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  profile_image_url?: string;

  @IsOptional()
  @IsString()
  status?: string;
}









