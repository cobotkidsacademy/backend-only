import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum LoginRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export class CreateLoginRequestDto {
  @IsString()
  student_username: string;
}

export class UpdateLoginRequestDto {
  @IsEnum(LoginRequestStatus)
  status: LoginRequestStatus;
}

export interface LoginRequest {
  id: string;
  student_id: string;
  tutor_id: string;
  status: LoginRequestStatus;
  student_username: string;
  requested_at: string;
  responded_at?: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  student?: {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    class?: {
      id: string;
      name: string;
      school?: {
        id: string;
        name: string;
      };
    };
  };
}





