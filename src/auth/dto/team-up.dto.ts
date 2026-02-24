import { IsArray, IsString, ArrayMaxSize } from 'class-validator';

export class TeamUpDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20, { message: 'Maximum 20 teammates at once' })
  usernames: string[];
}
