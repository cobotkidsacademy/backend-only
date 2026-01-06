import { IsString, IsOptional, IsInt, Min, Max, IsArray, IsNumber } from 'class-validator';

// ============ Course DTOs ============
export class CreateCourseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon_image_url?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  level_count: number;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon_image_url?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

// ============ Level DTOs ============
export class UpdateLevelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  is_free?: boolean;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

// ============ Topic DTOs ============
export class CreateTopicDto {
  @IsString()
  level_id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  order_index?: number;
}

// ============ Note DTOs ============
export class CreateNoteDto {
  @IsString()
  topic_id: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  order_index?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

// ============ Note Element DTOs ============
export class CreateNoteElementDto {
  @IsString()
  note_id: string;

  @IsString()
  element_type: 'text' | 'image';

  @IsOptional()
  @IsString()
  content?: string;

  @IsNumber()
  position_x: number;

  @IsNumber()
  position_y: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  z_index?: number;

  @IsOptional()
  @IsNumber()
  font_size?: number;

  @IsOptional()
  @IsString()
  font_weight?: string;

  @IsOptional()
  @IsString()
  text_align?: string;

  @IsOptional()
  @IsString()
  background_color?: string;
}

export class UpdateNoteElementDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  position_x?: number;

  @IsOptional()
  @IsNumber()
  position_y?: number;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  z_index?: number;

  @IsOptional()
  @IsNumber()
  font_size?: number;

  @IsOptional()
  @IsString()
  font_weight?: string;

  @IsOptional()
  @IsString()
  text_align?: string;

  @IsOptional()
  @IsString()
  background_color?: string;
}

export class UpdateElementsPositionDto {
  @IsArray()
  elements: {
    id: string;
    position_x: number;
    position_y: number;
    z_index?: number;
  }[];
}

