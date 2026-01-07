import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { LoginRequestsService } from './login-requests.service';
import {
  CreateLoginRequestDto,
  UpdateLoginRequestDto,
  LoginRequestStatus,
} from './dto/login-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('login-requests')
export class LoginRequestsController {
  private readonly logger = new Logger(LoginRequestsController.name);

  constructor(private readonly loginRequestsService: LoginRequestsService) {}

  @Post()
  async createLoginRequest(@Body() dto: CreateLoginRequestDto & { tutor_id?: string }) {
    if (!dto.tutor_id) {
      throw new BadRequestException('tutor_id is required');
    }
    return this.loginRequestsService.createLoginRequest(dto.student_username, dto.tutor_id);
  }

  @Get('student/:username/tutors')
  async getTutorsForStudent(@Param('username') username: string) {
    return this.loginRequestsService.getTutorsForStudent(username);
  }

  @Get('tutor/me')
  @UseGuards(JwtAuthGuard)
  async getMyLoginRequests(@Request() req) {
    const tutorId = req.user.id;
    return this.loginRequestsService.getTutorLoginRequests(tutorId);
  }

  @Get('tutor/me/pending')
  @UseGuards(JwtAuthGuard)
  async getMyPendingRequests(@Request() req) {
    const tutorId = req.user.id;
    return this.loginRequestsService.getPendingLoginRequests(tutorId);
  }

  @Get('student/:username/pending')
  async getStudentPendingRequest(@Param('username') username: string) {
    return this.loginRequestsService.getStudentPendingRequest(username);
  }

  @Get('student/:username/token')
  async getStudentApprovedToken(@Param('username') username: string) {
    const result = await this.loginRequestsService.getStudentApprovedToken(username);
    if (!result) {
      throw new NotFoundException('No approved login request found');
    }
    return result;
  }

  @Put(':id/approve')
  @UseGuards(JwtAuthGuard)
  async approveLoginRequest(@Param('id') id: string, @Request() req) {
    const tutorId = req.user.id;
    return this.loginRequestsService.updateLoginRequest(id, tutorId, {
      status: LoginRequestStatus.APPROVED,
    });
  }

  @Put(':id/reject')
  @UseGuards(JwtAuthGuard)
  async rejectLoginRequest(@Param('id') id: string, @Request() req) {
    const tutorId = req.user.id;
    return this.loginRequestsService.updateLoginRequest(id, tutorId, {
      status: LoginRequestStatus.REJECTED,
    });
  }
}

