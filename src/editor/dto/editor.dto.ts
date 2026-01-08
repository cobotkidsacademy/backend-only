import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';

export class CreateEditorDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(['coming_soon', 'available'])
  status?: 'coming_soon' | 'available';

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsUUID()
  linked_editor_id?: string;

  @IsOptional()
  @IsString()
  logo_image_url?: string;
}

export class UpdateEditorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(['coming_soon', 'available'])
  status?: 'coming_soon' | 'available';

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsUUID()
  linked_editor_id?: string;

  @IsOptional()
  @IsString()
  logo_image_url?: string;
}







