import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class SendParentCodeDto {
  @IsEmail()
  email: string;
}

export class ParentLoginWithPinDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 4, { message: 'PIN must be 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin: string;
}

export class VerifyParentCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Code must be 6 digits' })
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code: string;
}

export class ParentPinDto {
  @IsString()
  verification_token: string;

  @IsString()
  @Length(4, 4, { message: 'PIN must be 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin: string;
}

export class ParentCompleteRegistrationDto {
  @IsString()
  verification_token: string;

  @IsString()
  @Length(4, 4, { message: 'PIN must be 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin: string;

  @IsString()
  first_name: string;

  @IsString()
  last_name: string;
}

export class ResetParentPinDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Code must be 6 digits' })
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code: string;

  @IsString()
  @Length(4, 4, { message: 'PIN must be 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  new_pin: string;
}

export class ParentMessageDto {
  @IsString()
  body: string;
}

export class LinkChildDto {
  @IsString()
  student_username: string;

  @IsOptional()
  @IsString()
  relationship?: string;
}
