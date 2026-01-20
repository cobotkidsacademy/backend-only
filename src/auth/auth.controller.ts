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
  UnauthorizedException,
  Delete,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { StudentLoginDto } from './dto/student-login.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { CreateParentAccountDto } from './dto/create-parent-account.dto';
import { LinkStudentDto } from './dto/link-student.dto';
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

  @Post('parent/login')
  @HttpCode(HttpStatus.OK)
  async parentLogin(@Body() loginDto: LoginDto) {
    this.logger.log(`Parent login request received for: ${loginDto.email}`);
    return this.authService.parentLogin(loginDto.email, loginDto.password);
  }

  @Post('parent/login-with-student')
  @HttpCode(HttpStatus.OK)
  async parentLoginWithStudent(@Body() loginDto: StudentLoginDto) {
    this.logger.log(`Parent login with student credentials request received for: ${loginDto.username}`);
    return this.authService.parentLoginWithStudent(loginDto.username, loginDto.password);
  }

  @Post('school/login')
  @HttpCode(HttpStatus.OK)
  async schoolLogin(@Body() loginDto: LoginDto) {
    this.logger.log(`School login request received for: ${loginDto.email}`);
    return this.authService.schoolLogin(loginDto.email, loginDto.password);
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
  @Get('parent/me')
  async getParentInfo(@Request() req) {
    return this.authService.getParentInfo(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('school/verify')
  async verifySchoolToken(@Request() req) {
    return {
      user: req.user,
      message: 'Token is valid',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('school/me')
  async getSchoolInfo(@Request() req) {
    return this.authService.getSchoolInfo(req.user.sub);
  }

  // Create parent account from student session (after logging in with student credentials)
  @UseGuards(JwtAuthGuard)
  @Post('parent/create-account')
  @HttpCode(HttpStatus.CREATED)
  async createParentAccount(@Request() req, @Body() dto: CreateParentAccountDto) {
    // req.user.sub should be the student ID when logged in as student
    // But we need to check the role - if it's a student, use student ID, if it's already a parent, use parent ID
    if (req.user.role === 'student') {
      return this.authService.createParentAccount(req.user.sub, dto);
    } else {
      throw new UnauthorizedException('This endpoint is only available when logged in as a student');
    }
  }

  // Link a student to parent account by username
  @UseGuards(JwtAuthGuard)
  @Post('parent/link-student')
  @HttpCode(HttpStatus.CREATED)
  async linkStudent(@Request() req, @Body() dto: LinkStudentDto) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can link students');
    }
    return this.authService.linkStudentToParent(req.user.sub, dto.student_username, dto.relationship || 'child');
  }

  // Unlink a student from parent account
  @UseGuards(JwtAuthGuard)
  @Delete('parent/unlink-student/:studentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkStudent(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can unlink students');
    }
    return this.authService.unlinkStudentFromParent(req.user.sub, studentId);
  }

  // Get student course levels (for parent viewing their child's courses)
  @UseGuards(JwtAuthGuard)
  @Get('parent/student/:studentId/courses')
  async getStudentCourseLevels(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can view student courses');
    }
    return this.authService.getStudentCourseLevelsForParent(req.user.sub, studentId);
  }

  // Get student exam attempts (for parent viewing their child's exams)
  @UseGuards(JwtAuthGuard)
  @Get('parent/student/:studentId/exams')
  async getStudentExamAttempts(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can view student exams');
    }
    return this.authService.getStudentExamAttemptsForParent(req.user.sub, studentId);
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
  @Put('student/profile/details')
  async updateStudentProfileDetails(
    @Request() req,
    @Body() body: {
      guardian_name?: string;
      guardian_phone?: string;
      gender?: 'male' | 'female' | 'other' | null;
      date_of_birth?: string | null;
      profile_image_url?: string;
    },
  ) {
    return this.authService.updateStudentProfileDetails(req.user.sub, body);
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



