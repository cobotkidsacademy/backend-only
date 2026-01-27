
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { CurriculumService } from './curriculum.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssignCourseEditorDto } from '../allocation/dto/allocation.dto';

@Controller('curriculum')
export class CurriculumController {
  private readonly logger = new Logger(CurriculumController.name);

  constructor(private readonly curriculumService: CurriculumService) {}

  // ============ EXAM ENDPOINTS ============

  @Get('exams')
  @UseGuards(JwtAuthGuard)
  async getAllExams() {
    return this.curriculumService.getAllExams();
  }

  @Post('exams')
  @UseGuards(JwtAuthGuard)
  async createExam(@Body() dto: any) {
    return this.curriculumService.createExam(dto);
  }

  @Get('topics/:topicId/exams')
  @UseGuards(JwtAuthGuard)
  async getExamsByTopic(@Param('topicId') topicId: string) {
    return this.curriculumService.getExamsByTopicId(topicId);
  }

  // Specific routes must come before parameterized routes
  @Get('exams/performance')
  @UseGuards(JwtAuthGuard)
  async getExamPerformance(
    @Query('school_id') schoolId?: string,
    @Query('class_id') classId?: string,
    @Query('course_id') courseId?: string,
    @Query('course_level_id') courseLevelId?: string,
    @Query('topic_id') topicId?: string,
    @Query('exam_id') examId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('status') status?: string
  ) {
    const filters: any = {};
    if (schoolId) filters.school_id = schoolId;
    if (classId) filters.class_id = classId;
    if (courseId) filters.course_id = courseId;
    if (courseLevelId) filters.course_level_id = courseLevelId;
    if (topicId) filters.topic_id = topicId;
    if (examId) filters.exam_id = examId;
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    if (status) filters.status = status as any;
    return this.curriculumService.getExamPerformance(filters);
  }

  @Get('exams/:id')
  @UseGuards(JwtAuthGuard)
  async getExamById(@Param('id') id: string) {
    return this.curriculumService.getExamById(id);
  }

  @Put('exams/:id')
  @UseGuards(JwtAuthGuard)
  async updateExam(@Param('id') id: string, @Body() dto: any) {
    return this.curriculumService.updateExam(id, dto);
  }

  @Delete('exams/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExam(@Param('id') id: string) {
    return this.curriculumService.deleteExam(id);
  }

  @Get('exams/:id/download')
  @UseGuards(JwtAuthGuard)
  async downloadExam(@Param('id') id: string, @Res() res: Response) {
    try {
      const buffer = await this.curriculumService.generateExamWordDocument(id);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="exam-${id}.docx"`);
      res.send(buffer);
    } catch (error: any) {
      this.logger.error('Error generating exam document:', error);
      res.status(500).json({ message: error.message || 'Failed to generate exam document' });
    }
  }

  @Get('exams/:id/attempts')
  @UseGuards(JwtAuthGuard)
  async getExamAttempts(
    @Param('id') id: string,
    @Query('school_id') schoolId?: string,
    @Query('class_id') classId?: string
  ) {
    const filters: { school_id?: string; class_id?: string } = {};
    if (schoolId) filters.school_id = schoolId;
    if (classId) filters.class_id = classId;
    return this.curriculumService.getExamAttempts(id, filters);
  }

  @Get('exam-attempts/:attemptId/details')
  @UseGuards(JwtAuthGuard)
  async getExamAttemptDetails(@Param('attemptId') attemptId: string) {
    return this.curriculumService.getStudentExamAttemptDetails(attemptId);
  }

  @Get('students/:studentId/exam-attempts')
  @UseGuards(JwtAuthGuard)
  async getStudentExamAttempts(@Param('studentId') studentId: string) {
    return this.curriculumService.getStudentExamAttempts(studentId);
  }

  @Post('exams/register')
  @UseGuards(JwtAuthGuard)
  async registerForExam(@Request() req, @Body() body: { exam_code: string }) {
    if (req.user.role !== 'student') {
      throw new BadRequestException('Only students can register for exams');
    }
    if (!body.exam_code || !body.exam_code.trim()) {
      throw new BadRequestException('Exam code is required');
    }
    return this.curriculumService.registerStudentForExam(req.user.sub, body.exam_code);
  }

  @Get('exams/student/:examId')
  @UseGuards(JwtAuthGuard)
  async getExamForStudent(
    @Request() req,
    @Param('examId') examId: string,
    @Query('attempt_id') attemptId?: string
  ) {
    if (req.user.role !== 'student') {
      throw new BadRequestException('Only students can access this endpoint');
    }
    return this.curriculumService.getExamForStudent(examId, attemptId);
  }

  @Post('exams/attempts/submit')
  @UseGuards(JwtAuthGuard)
  async submitExam(@Request() req, @Body() dto: any) {
    if (req.user.role !== 'student') {
      throw new BadRequestException('Only students can submit exams');
    }
    return this.curriculumService.submitExam(dto, req.user.sub);
  }

  // ============ EXAM QUESTION ENDPOINTS ============

  @Post('exam-questions')
  @UseGuards(JwtAuthGuard)
  async createExamQuestion(@Body() dto: any) {
    return this.curriculumService.createExamQuestion(dto);
  }

  @Put('exam-questions/:id')
  @UseGuards(JwtAuthGuard)
  async updateExamQuestion(@Param('id') id: string, @Body() dto: any) {
    return this.curriculumService.updateExamQuestion(id, dto);
  }

  @Delete('exam-questions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExamQuestion(@Param('id') id: string) {
    return this.curriculumService.deleteExamQuestion(id);
  }

  // ============ EXAM OPTION ENDPOINTS ============

  @Post('exam-options')
  @UseGuards(JwtAuthGuard)
  async createExamOption(@Body() dto: any) {
    return this.curriculumService.createExamOption(dto);
  }

  @Put('exam-options/:id')
  @UseGuards(JwtAuthGuard)
  async updateExamOption(@Param('id') id: string, @Body() dto: any) {
    return this.curriculumService.updateExamOption(id, dto);
  }

  @Delete('exam-options/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExamOption(@Param('id') id: string) {
    return this.curriculumService.deleteExamOption(id);
  }

  // ============ PROJECT ENDPOINTS ============

  @Post('projects')
  @UseGuards(JwtAuthGuard)
  async createProject(@Body() dto: any) {
    return this.curriculumService.createProject(dto);
  }

  @Get('topics/:topicId/projects')
  @UseGuards(JwtAuthGuard)
  async getProjectsByTopic(@Param('topicId') topicId: string) {
    return this.curriculumService.getProjectsByTopicId(topicId);
  }

  @Get('projects/:id')
  @UseGuards(JwtAuthGuard)
  async getProjectById(@Param('id') id: string) {
    return this.curriculumService.getProjectById(id);
  }

  @Put('projects/:id')
  @UseGuards(JwtAuthGuard)
  async updateProject(@Param('id') id: string, @Body() dto: any) {
    return this.curriculumService.updateProject(id, dto);
  }

  @Delete('projects/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProject(@Param('id') id: string) {
    return this.curriculumService.deleteProject(id);
  }

  // ============ PERFORMANCE ENDPOINTS ============

  @Get('performance/student/:studentId/course-level/:courseLevelId')
  @UseGuards(JwtAuthGuard)
  async getStudentPerformance(
    @Param('studentId') studentId: string,
    @Param('courseLevelId') courseLevelId: string,
  ) {
    return this.curriculumService.getStudentPerformance(studentId, courseLevelId);
  }

  @Get('performance/course-level/:courseLevelId')
  @UseGuards(JwtAuthGuard)
  async getAllPerformanceByCourseLevel(@Param('courseLevelId') courseLevelId: string) {
    return this.curriculumService.getAllPerformanceByCourseLevel(courseLevelId);
  }

  @Put('performance/student/:studentId/course-level/:courseLevelId')
  @UseGuards(JwtAuthGuard)
  async updatePerformance(
    @Param('studentId') studentId: string,
    @Param('courseLevelId') courseLevelId: string,
    @Body() dto: any,
  ) {
    return this.curriculumService.updatePerformance(studentId, courseLevelId, dto);
  }

  // ============ TEACHER GUIDE ENDPOINTS ============

  @Post('teacher-guides')
  @UseGuards(JwtAuthGuard)
  async createTeacherGuide(@Body() dto: any) {
    return this.curriculumService.createTeacherGuide(dto);
  }

  @Get('classes/:classId/teacher-guides')
  @UseGuards(JwtAuthGuard)
  async getTeacherGuidesByClass(@Param('classId') classId: string) {
    return this.curriculumService.getTeacherGuidesByClass(classId);
  }

  @Get('teacher-guides/:id')
  @UseGuards(JwtAuthGuard)
  async getTeacherGuideById(@Param('id') id: string) {
    return this.curriculumService.getTeacherGuideById(id);
  }

  @Put('teacher-guides/:id')
  @UseGuards(JwtAuthGuard)
  async updateTeacherGuide(@Param('id') id: string, @Body() dto: any) {
    return this.curriculumService.updateTeacherGuide(id, dto);
  }

  @Delete('teacher-guides/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTeacherGuide(@Param('id') id: string) {
    return this.curriculumService.deleteTeacherGuide(id);
  }

  // ============ CLASS UPGRADE EDITOR ENDPOINTS ============

  @Post('class-upgrade-editors')
  @UseGuards(JwtAuthGuard)
  async createOrUpdateClassUpgradeEditor(@Body() dto: any) {
    return this.curriculumService.createOrUpdateClassUpgradeEditor(dto);
  }

  @Get('classes/:classId/upgrade-editor')
  @UseGuards(JwtAuthGuard)
  async getClassUpgradeEditor(@Param('classId') classId: string) {
    return this.curriculumService.getClassUpgradeEditor(classId);
  }

  @Delete('classes/:classId/upgrade-editor')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClassUpgradeEditor(@Param('classId') classId: string) {
    return this.curriculumService.deleteClassUpgradeEditor(classId);
  }

  // ============ COURSE EDITOR ENDPOINTS ============

  @Post('course-editors')
  @UseGuards(JwtAuthGuard)
  async createOrUpdateCourseEditor(@Body() dto: AssignCourseEditorDto) {
    return this.curriculumService.createOrUpdateCourseEditor(dto);
  }

  @Get('courses/:courseId/editor')
  @UseGuards(JwtAuthGuard)
  async getCourseEditor(@Param('courseId') courseId: string) {
    return this.curriculumService.getCourseEditor(courseId);
  }

  @Delete('courses/:courseId/editor')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourseEditor(@Param('courseId') courseId: string) {
    return this.curriculumService.deleteCourseEditor(courseId);
  }
}
