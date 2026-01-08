import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateParentAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(4)
  @MaxLength(4)
  password: string;

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}







