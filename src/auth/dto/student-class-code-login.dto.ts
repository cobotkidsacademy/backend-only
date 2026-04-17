import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class StudentClassCodeLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Class code is required' })
  @Matches(/^\d{3}$/, { message: 'Class code must be 3 digits' })
  code: string;
}
