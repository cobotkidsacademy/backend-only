import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

export class UpdateAdminSettingsDto {
  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;
}

export class ChangeAdminPasswordDto {
  @IsString()
  @MinLength(1, { message: 'Current password is required' })
  current_password: string;

  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters' })
  new_password: string;
}
