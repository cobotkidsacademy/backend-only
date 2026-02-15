import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversation_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsString()
  attachment_url?: string;

  @IsOptional()
  @IsString()
  attachment_filename?: string;
}
