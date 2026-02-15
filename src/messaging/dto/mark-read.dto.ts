import { IsUUID } from 'class-validator';

export class MarkReadDto {
  @IsUUID()
  conversation_id: string;
}
