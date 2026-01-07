import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { SchoolService } from './school.service';
import { CreateSchoolDto, UpdateSchoolDto, CreateClassDto, CreateStudentDto } from './dto/school.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('schools')
export class SchoolController {
  private readonly logger = new Logger(SchoolController.name);

  constructor(private readonly schoolService: SchoolService) {}

  // =============================================
  // SCHOOL ENDPOINTS
  // =============================================

  @Post()
  @UseGuards(JwtAuthGuard)
  async createSchool(@Body() dto: CreateSchoolDto) {
    this.logger.log(`Creating school with data: ${JSON.stringify(dto)}`);
    return this.schoolService.createSchool(dto);
  }

  // Debug endpoint without auth - REMOVE IN PRODUCTION
  @Post('debug-create')
  async debugCreateSchool(@Body() body: any) {
    this.logger.log(`DEBUG - Raw body received: ${JSON.stringify(body)}`);
    return { received: body, message: 'Debug endpoint - check backend console' };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllSchools() {
    return this.schoolService.getAllSchools();
  }

  // =============================================
  // STUDENT ENDPOINTS (must come before :id routes)
  // =============================================

  @Get('students')
  @UseGuards(JwtAuthGuard)
  async getAllStudents() {
    return this.schoolService.getAllStudents();
  }

  @Get('students/:id')
  @UseGuards(JwtAuthGuard)
  async getStudentById(@Param('id') id: string) {
    return this.schoolService.getStudentById(id);
  }

  // =============================================
  // SCHOOL ENDPOINTS
  // =============================================

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getSchoolById(@Param('id') id: string) {
    return this.schoolService.getSchoolById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateSchool(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolService.updateSchool(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSchool(@Param('id') id: string) {
    return this.schoolService.deleteSchool(id);
  }

  // =============================================
  // CLASS ENDPOINTS
  // =============================================

  @Post('classes')
  @UseGuards(JwtAuthGuard)
  async createClass(@Body() dto: CreateClassDto) {
    this.logger.log(`Creating class with data: ${JSON.stringify(dto)}`);
    return this.schoolService.createClass(dto);
  }

  @Get(':schoolId/classes')
  @UseGuards(JwtAuthGuard)
  async getClassesBySchool(@Param('schoolId') schoolId: string) {
    return this.schoolService.getClassesBySchool(schoolId);
  }

  @Get('classes/:id')
  @UseGuards(JwtAuthGuard)
  async getClassById(@Param('id') id: string) {
    return this.schoolService.getClassById(id);
  }

  @Put('classes/:id')
  @UseGuards(JwtAuthGuard)
  async updateClass(@Param('id') id: string, @Body() dto: Partial<CreateClassDto>) {
    return this.schoolService.updateClass(id, dto);
  }

  @Delete('classes/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClass(@Param('id') id: string) {
    return this.schoolService.deleteClass(id);
  }

  // =============================================
  // STUDENT ENDPOINTS (continued)
  // =============================================

  @Post('students')
  @UseGuards(JwtAuthGuard)
  async createStudent(@Body() dto: CreateStudentDto) {
    this.logger.log(`Creating student with data: ${JSON.stringify(dto)}`);
    return this.schoolService.createStudent(dto);
  }

  @Get('classes/:classId/students')
  @UseGuards(JwtAuthGuard)
  async getStudentsByClass(@Param('classId') classId: string) {
    return this.schoolService.getStudentsByClass(classId);
  }

  @Put('students/:id')
  @UseGuards(JwtAuthGuard)
  async updateStudent(@Param('id') id: string, @Body() dto: Partial<CreateStudentDto>) {
    return this.schoolService.updateStudent(id, dto);
  }

  @Delete('students/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStudent(@Param('id') id: string) {
    return this.schoolService.deleteStudent(id);
  }

  // =============================================
  // SCHOOL ANALYTICS ENDPOINTS
  // =============================================

  @UseGuards(JwtAuthGuard)
  @Get('me/tutors')
  async getSchoolTutors(@Request() req) {
    // Only allow schools to access their own data
    if (req.user.role !== 'school') {
      throw new UnauthorizedException('Only schools can access this endpoint');
    }
    return this.schoolService.getTutorsBySchool(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/students')
  async getSchoolStudents(@Request() req) {
    // Only allow schools to access their own data
    if (req.user.role !== 'school') {
      throw new UnauthorizedException('Only schools can access this endpoint');
    }
    return this.schoolService.getStudentsBySchool(req.user.sub);
  }

}