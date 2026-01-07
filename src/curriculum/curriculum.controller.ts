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
} from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
  async createOrUpdateCourseEditor(@Body() dto: any) {
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

