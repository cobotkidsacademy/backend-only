import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class StartConversationDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['admin', 'tutor', 'student'])
  participant_type: 'admin' | 'tutor' | 'student';

  @IsString()
  @IsNotEmpty()
  participant_id: string;
}
