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
  Patch,
  Param,
  UnauthorizedException,
  Delete,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { StudentLoginDto } from './dto/student-login.dto';
import { TeamUpDto } from './dto/team-up.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { CreateParentAccountDto } from './dto/create-parent-account.dto';
import { LinkStudentDto } from './dto/link-student.dto';
import {
  SendParentCodeDto,
  VerifyParentCodeDto,
  ParentPinDto,
  ParentLoginWithPinDto,
  ParentCompleteRegistrationDto,
  ResetParentPinDto,
  LinkChildDto,
} from './dto/parent-verification.dto';
import { UpdateParentProfileDto } from './dto/update-parent-profile.dto';
import { UpdateAdminSettingsDto, ChangeAdminPasswordDto } from './dto/admin-settings.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /** Public: platform branding for favicon/title (no auth) */
  @Get('platform-branding')
  async getPlatformBranding() {
    return this.authService.getPlatformBranding();
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() loginDto: LoginDto) {
    this.logger.log(`Login request received for: ${loginDto.email}`);
    this.logger.log(`Request body: ${JSON.stringify({ email: loginDto.email, passwordLength: loginDto.password?.length })}`);
    return this.authService.adminLogin(loginDto.email, loginDto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/settings')
  async getAdminSettings(@Request() req) {
    if (req.user.role !== 'admin') throw new UnauthorizedException('Only admins can access this endpoint');
    return this.authService.getAdminSettings(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('admin/settings')
  async updateAdminSettings(@Request() req, @Body() dto: UpdateAdminSettingsDto) {
    if (req.user.role !== 'admin') throw new UnauthorizedException('Only admins can access this endpoint');
    return this.authService.updateAdminSettings(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/change-password')
  @HttpCode(HttpStatus.OK)
  async changeAdminPassword(@Request() req, @Body() dto: ChangeAdminPasswordDto) {
    if (req.user.role !== 'admin') throw new UnauthorizedException('Only admins can access this endpoint');
    return this.authService.changeAdminPassword(req.user.sub, dto.current_password, dto.new_password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/upload-logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (_, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
        if (allowed.test(file.originalname)) cb(null, true);
        else cb(new BadRequestException('Invalid file type. Use jpg, png, gif, webp or svg.'), false);
      },
    }),
  )
  async uploadAdminLogo(@UploadedFile() file: { buffer: Buffer; originalname: string }, @Request() req) {
    if (req.user.role !== 'admin') throw new UnauthorizedException('Only admins can access this endpoint');
    if (!file) throw new BadRequestException('No file provided');
    const uploadDir = path.join(process.cwd(), 'uploads', 'branding');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = path.extname(file.originalname) || '.png';
    const safeName = `logo-${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, file.buffer);
    const baseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:3001';
    const url = `${baseUrl.replace(/\/$/, '')}/uploads/branding/${safeName}`;
    return { url, filename: file.originalname };
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

  @Post('parent/login-with-pin')
  @HttpCode(HttpStatus.OK)
  async parentLoginWithPin(@Body() dto: ParentLoginWithPinDto) {
    return this.authService.parentLoginWithPin(dto.email, dto.pin);
  }

  @Post('parent/forgot-pin')
  @HttpCode(HttpStatus.OK)
  async parentForgotPin(@Body() dto: SendParentCodeDto) {
    return this.authService.parentRequestPinReset(dto.email);
  }

  @Post('parent/reset-pin')
  @HttpCode(HttpStatus.OK)
  async parentResetPin(@Body() dto: ResetParentPinDto) {
    return this.authService.parentResetPin(dto.email, dto.code, dto.new_pin);
  }

  @Post('parent/send-code')
  @HttpCode(HttpStatus.OK)
  async parentSendCode(@Body() dto: SendParentCodeDto) {
    return this.authService.parentSendVerificationCode(dto.email);
  }

  @Post('parent/verify-code')
  @HttpCode(HttpStatus.OK)
  async parentVerifyCode(@Body() dto: VerifyParentCodeDto) {
    return this.authService.parentVerifyCode(dto.email, dto.code);
  }

  @Post('parent/set-pin')
  @HttpCode(HttpStatus.OK)
  async parentSetPin(@Body() dto: ParentPinDto) {
    return this.authService.parentSetPin(dto.verification_token, dto.pin);
  }

  @Post('parent/submit-pin')
  @HttpCode(HttpStatus.OK)
  async parentSubmitPin(@Body() dto: ParentPinDto) {
    return this.authService.parentSubmitPin(dto.verification_token, dto.pin);
  }

  @Post('parent/send-register-code')
  @HttpCode(HttpStatus.OK)
  async parentSendRegisterCode(@Body() dto: SendParentCodeDto) {
    return this.authService.parentSendRegisterCode(dto.email);
  }

  @Post('parent/verify-register-code')
  @HttpCode(HttpStatus.OK)
  async parentVerifyRegisterCode(@Body() dto: VerifyParentCodeDto) {
    return this.authService.parentVerifyRegisterCode(dto.email, dto.code);
  }

  @Post('parent/complete-registration')
  @HttpCode(HttpStatus.CREATED)
  async parentCompleteRegistration(@Body() dto: ParentCompleteRegistrationDto) {
    return this.authService.parentCompleteRegistration(
      dto.verification_token,
      dto.pin,
      dto.first_name,
      dto.last_name,
    );
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

  /** Check if usernames are valid for team-up (same class, active). Student only. */
  @UseGuards(JwtAuthGuard)
  @Post('student/team-up/check')
  @HttpCode(HttpStatus.OK)
  async teamUpCheck(@Request() req, @Body() dto: TeamUpDto) {
    if (req.user?.role !== 'student') {
      throw new UnauthorizedException('Only students can use team-up');
    }
    return this.authService.teamUpCheck(req.user.sub, dto.usernames);
  }

  /** Register teammates as logged in and mark attendance. Student only. */
  @UseGuards(JwtAuthGuard)
  @Post('student/team-up')
  @HttpCode(HttpStatus.OK)
  async teamUp(@Request() req, @Body() dto: TeamUpDto) {
    if (req.user?.role !== 'student') {
      throw new UnauthorizedException('Only students can use team-up');
    }
    return this.authService.teamUp(req.user.sub, dto.usernames);
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
  @Patch('tutor/me')
  async updateTutorDisplayClassName(@Request() req, @Body() dto: { display_class_name?: string | null }) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can update this');
    }
    return this.authService.updateTutorDisplayClassName(
      req.user.sub,
      dto.display_class_name ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put('tutor/me/profile')
  async updateTutorProfile(
    @Request() req,
    @Body()
    dto: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      profile_image_url?: string | null;
      display_class_name?: string | null;
    },
  ) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can update this');
    }
    return this.authService.updateTutorProfile(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('parent/me')
  async getParentInfo(@Request() req) {
    return this.authService.getParentInfo(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('parent/me/profile')
  async updateParentProfile(@Request() req, @Body() dto: UpdateParentProfileDto) {
    if (req.user.role !== 'parent') throw new UnauthorizedException('Only parents can update profile');
    return this.authService.updateParentProfile(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('parent/upload-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
        if (allowed.test(file.originalname)) cb(null, true);
        else cb(new BadRequestException('Invalid file type. Use jpg, png, gif, webp or svg.'), false);
      },
    }),
  )
  async uploadParentPhoto(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Request() req,
  ) {
    if (req.user.role !== 'parent') throw new UnauthorizedException('Only parents can upload photo');
    if (!file) throw new BadRequestException('No file provided');
    const parentId = req.user.sub;
    const uploadDir = path.join(process.cwd(), 'uploads', 'parents', parentId);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = path.extname(file.originalname) || '.png';
    const safeName = `profile-${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, file.buffer);
    const baseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:3001';
    const url = `${baseUrl.replace(/\/$/, '')}/uploads/parents/${parentId}/${safeName}`;
    return { url };
  }

  @UseGuards(JwtAuthGuard)
  @Post('parent/link-child')
  @HttpCode(HttpStatus.CREATED)
  async linkChild(@Request() req, @Body() dto: LinkChildDto) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can link a child');
    }
    return this.authService.linkChildToParent(req.user.sub, dto.student_username, dto.relationship);
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

  // Get student quiz attempts (course > course level > topic > quizzes + results) for parent report
  @UseGuards(JwtAuthGuard)
  @Get('parent/student/:studentId/quizzes')
  async getStudentQuizzes(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can view student quizzes');
    }
    return this.authService.getStudentQuizAttemptsForParent(req.user.sub, studentId);
  }

  // Get student take-away assignments (for parent report)
  @UseGuards(JwtAuthGuard)
  @Get('parent/student/:studentId/take-away')
  async getStudentTakeAway(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can view student take-away');
    }
    return this.authService.getStudentTakeAwayForParent(req.user.sub, studentId);
  }

  // Get student portfolio (for parent report)
  @UseGuards(JwtAuthGuard)
  @Get('parent/student/:studentId/portfolio')
  async getStudentPortfolio(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can view student portfolio');
    }
    return this.authService.getStudentPortfolioForParent(req.user.sub, studentId);
  }

  // Get student overview - courses + tutors (for parent report)
  @UseGuards(JwtAuthGuard)
  @Get('parent/student/:studentId/overview')
  async getStudentOverview(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'parent') {
      throw new UnauthorizedException('Only parents can view student overview');
    }
    return this.authService.getStudentOverviewForParent(req.user.sub, studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/student/:studentId')
  async getStudentInfoForAdmin(@Param('studentId') studentId: string) {
    // Admin can view any student's profile
    return this.authService.getStudentInfo(studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/parents')
  async getParentsForAdmin(@Request() req, @Query('school_id') schoolId?: string) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can access this endpoint');
    }
    return this.authService.getParentsForAdmin(schoolId || undefined);
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



