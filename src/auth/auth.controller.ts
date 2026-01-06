import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Get,
  Logger,
  Query,
  Put,
  Param,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { StudentLoginDto } from './dto/student-login.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() loginDto: LoginDto) {
    this.logger.log(`Login request received for: ${loginDto.email}`);
    this.logger.log(`Request body: ${JSON.stringify({ email: loginDto.email, passwordLength: loginDto.password?.length })}`);
    return this.authService.adminLogin(loginDto.email, loginDto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/verify')
  async verifyToken(@Request() req) {
    return {
      user: req.user,
      message: 'Token is valid',
    };
  }

  @Post('student/login')
  @HttpCode(HttpStatus.OK)
  async studentLogin(@Body() loginDto: StudentLoginDto) {
    this.logger.log(`Student login request received for: ${loginDto.username}`);
    return this.authService.studentLogin(loginDto.username, loginDto.password);
  }

  @Post('tutor/login')
  @HttpCode(HttpStatus.OK)
  async tutorLogin(@Body() loginDto: LoginDto) {
    this.logger.log(`Tutor login request received for: ${loginDto.email}`);
    return this.authService.tutorLogin(loginDto.email, loginDto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('student/verify')
  async verifyStudentToken(@Request() req) {
    return {
      user: req.user,
      message: 'Token is valid',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/me')
  async getStudentInfo(@Request() req) {
    return this.authService.getStudentInfo(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tutor/verify')
  async verifyTutorToken(@Request() req) {
    return {
      user: req.user,
      message: 'Token is valid',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me')
  async getTutorInfo(@Request() req) {
    return this.authService.getTutorInfo(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/student/:studentId')
  async getStudentInfoForAdmin(@Param('studentId') studentId: string) {
    // Admin can view any student's profile
    return this.authService.getStudentInfo(studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('student/profile')
  async updateStudentProfile(@Request() req, @Body() body: { profile_image_url: string }) {
    return this.authService.updateStudentProfile(req.user.sub, body.profile_image_url);
  }

  @UseGuards(JwtAuthGuard)
  @Put('student/profile/full')
  async updateStudentProfileFull(@Request() req, @Body() dto: UpdateStudentProfileDto) {
    return this.authService.updateStudentProfileFull(req.user.sub, dto);
  }

  // Debug endpoint - test password hashing
  @Get('test-hash')
  async testHash(@Query('password') password: string) {
    if (!password) {
      return { error: 'Please provide a password query parameter: /auth/test-hash?password=yourpassword' };
    }
    return this.authService.testPasswordHash(password);
  }
}



