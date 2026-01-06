import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class StudentLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(1, { message: 'Password is required' })
  password: string;
}

