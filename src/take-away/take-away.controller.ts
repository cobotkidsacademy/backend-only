import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { TakeAwayService } from './take-away.service';
import { TakeAwayQuizService } from './take-away-quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTakeAwayDto, UpdateTakeAwayDto } from './dto/take-away.dto';
import {
  CreateTakeAwayQuizDto,
  UpdateTakeAwayQuizDto,
  CreateTakeAwayQuizQuestionDto,
  UpdateTakeAwayQuizQuestionDto,
  CreateTakeAwayQuizOptionDto,
  UpdateTakeAwayQuizOptionDto,
  SubmitTakeAwayQuizAttemptDto,
} from './dto/take-away-quiz.dto';

@Controller('take-away')
export class TakeAwayController {
  constructor(
    private readonly takeAwayService: TakeAwayService,
    private readonly takeAwayQuizService: TakeAwayQuizService,
  ) {}

  @Post()
  async create(@Body() dto: CreateTakeAwayDto) {
    return this.takeAwayService.create(dto);
  }

  @Get()
  async findAll(
    @Query('class_id') classId?: string,
    @Query('tutor_id') tutorId?: string,
    @Query('course_level_id') courseLevelId?: string,
    @Query('enrollment_status') enrollmentStatus?: 'enrolled' | 'completed',
  ) {
    return this.takeAwayService.findAll({
      class_id: classId,
      tutor_id: tutorId,
      course_level_id: courseLevelId,
      enrollment_status: enrollmentStatus,
    });
  }

  // ==================== TAKE-AWAY QUIZ ROUTES ====================
  // These must come BEFORE @Get(':id') to avoid route conflicts

  @Post('quizzes')
  async createQuiz(@Body() dto: CreateTakeAwayQuizDto) {
    return this.takeAwayQuizService.create(dto);
  }

  @Get('quizzes')
  async findAllQuizzes() {
    return this.takeAwayQuizService.findAll();
  }

  @Get('quizzes/:id')
  async findOneQuiz(@Param('id') id: string) {
    return this.takeAwayQuizService.findOne(id);
  }

  @Put('quizzes/:id')
  async updateQuiz(@Param('id') id: string, @Body() dto: UpdateTakeAwayQuizDto) {
    return this.takeAwayQuizService.update(id, dto);
  }

  @Delete('quizzes/:id')
  async removeQuiz(@Param('id') id: string) {
    await this.takeAwayQuizService.remove(id);
    return { success: true, message: 'Take-away quiz deleted successfully' };
  }

  // ==================== QUESTION ROUTES ====================

  @Post('quizzes/questions')
  async createQuestion(@Body() dto: CreateTakeAwayQuizQuestionDto) {
    return this.takeAwayQuizService.createQuestion(dto);
  }

  @Get('quizzes/:quizId/questions')
  async getQuestionsByQuiz(@Param('quizId') quizId: string) {
    return this.takeAwayQuizService.getQuestionsByQuiz(quizId);
  }

  @Put('quizzes/questions/:id')
  async updateQuestion(@Param('id') id: string, @Body() dto: UpdateTakeAwayQuizQuestionDto) {
    return this.takeAwayQuizService.updateQuestion(id, dto);
  }

  @Delete('quizzes/questions/:id')
  async deleteQuestion(@Param('id') id: string) {
    await this.takeAwayQuizService.deleteQuestion(id);
    return { success: true, message: 'Question deleted successfully' };
  }

  // ==================== OPTION ROUTES ====================

  @Post('quizzes/options')
  async createOption(@Body() dto: CreateTakeAwayQuizOptionDto) {
    return this.takeAwayQuizService.createOption(dto);
  }

  @Put('quizzes/options/:id')
  async updateOption(@Param('id') id: string, @Body() dto: UpdateTakeAwayQuizOptionDto) {
    return this.takeAwayQuizService.updateOption(id, dto);
  }

  @Delete('quizzes/options/:id')
  async deleteOption(@Param('id') id: string) {
    await this.takeAwayQuizService.deleteOption(id);
    return { success: true, message: 'Option deleted successfully' };
  }

  // ==================== STUDENT ROUTES ====================
  // These must come BEFORE @Get(':id') to avoid route conflicts

  @UseGuards(JwtAuthGuard)
  @Get('student/assignments')
  async getStudentAssignments(@Request() req) {
    console.log('=== GET /take-away/student/assignments ===');
    console.log('Student ID from token:', req.user?.sub);
    try {
      const result = await this.takeAwayService.getStudentAssignments(req.user.sub);
      console.log('Returning assignments:', result.length);
      return result;
    } catch (error) {
      console.error('Error in getStudentAssignments:', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('student/attempts/start')
  async startAttempt(@Request() req, @Body() body: { quiz_id: string }) {
    return this.takeAwayQuizService.startAttempt(req.user.sub, body.quiz_id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('student/attempts/submit')
  async submitAttempt(@Request() req, @Body() dto: SubmitTakeAwayQuizAttemptDto) {
    return this.takeAwayQuizService.submitAttempt(dto.attempt_id, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/attempts')
  async getStudentAttempts(@Request() req, @Query('quiz_id') quizId?: string) {
    return this.takeAwayQuizService.getStudentAttempts(req.user.sub, quizId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/attempts/:attemptId/results')
  async getAttemptResults(@Request() req, @Param('attemptId') attemptId: string) {
    return this.takeAwayQuizService.getAttemptResults(attemptId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/quiz/:quizId/points')
  async getTotalPointsEarned(@Request() req, @Param('quizId') quizId: string) {
    return this.takeAwayQuizService.getTotalPointsEarned(req.user.sub, quizId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/assignment/:assignmentId/availability')
  async getQuizAvailability(@Param('assignmentId') assignmentId: string) {
    console.log('=== GET /take-away/student/assignment/:assignmentId/availability ===');
    try {
      const result = await this.takeAwayService.getQuizAvailabilityTime(assignmentId);
      console.log('Returning quiz availability:', result);
      return result;
    } catch (error) {
      console.error('Error in getQuizAvailability:', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/assignment/:assignmentId/points')
  async getStudentAssignmentPoints(
    @Request() req,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.takeAwayService.getStudentAssignmentPoints(req.user.sub, assignmentId);
  }

  // ==================== TUTOR ROUTES ====================
  // These must come BEFORE @Get(':id') to avoid route conflicts

  @UseGuards(JwtAuthGuard)
  @Get('tutor/assignments')
  async getTutorAssignments(@Request() req) {
    console.log('=== GET /take-away/tutor/assignments ===');
    console.log('Tutor ID from token:', req.user?.sub);
    try {
      const result = await this.takeAwayService.getTutorAssignments(req.user.sub);
      console.log('Returning tutor assignments:', result.length);
      return result;
    } catch (error) {
      console.error('Error in getTutorAssignments:', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('tutor')
  async createTutorTakeAway(@Request() req, @Body() dto: CreateTakeAwayDto) {
    console.log('=== POST /take-away/tutor ===');
    console.log('Tutor ID from token:', req.user?.sub);
    
    // Ensure the tutor_id in DTO matches the authenticated tutor
    if (dto.tutor_id !== req.user.sub) {
      throw new BadRequestException('Tutor ID mismatch. You can only create take-aways for yourself.');
    }

    try {
      const result = await this.takeAwayService.create(dto);
      console.log('Created tutor take-away:', result.id);
      return result;
    } catch (error) {
      console.error('Error in createTutorTakeAway:', error);
      throw error;
    }
  }

  // ==================== ADMIN ROUTES ====================
  // These must come BEFORE @Get(':id') to avoid route conflicts

  // Admin endpoint to get assignment performance
  // Route must be before @Get(':id') to avoid conflicts
  @Get('admin/assignment/:assignmentId/performance')
  async getAssignmentPerformance(@Param('assignmentId') assignmentId: string) {
    try {
      console.log(`[Controller] getAssignmentPerformance called with assignmentId: ${assignmentId}`);
      const result = await this.takeAwayQuizService.getAssignmentPerformance(assignmentId);
      console.log(`[Controller] getAssignmentPerformance returning ${result?.length || 0} records`);
      return result;
    } catch (error: any) {
      console.error('[GetAssignmentPerformance] Controller error:', error);
      throw error;
    }
  }

  // Debug endpoint to test answer validation
  @Get('debug/validate-answer')
  async validateAnswer(
    @Query('question_id') questionId: string,
    @Query('option_id') optionId: string,
  ) {
    return this.takeAwayQuizService.validateAnswer(questionId, optionId);
  }

  // ==================== ASSIGNMENT ROUTES ====================
  // These must come AFTER all specific routes

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.takeAwayService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTakeAwayDto) {
    return this.takeAwayService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.takeAwayService.remove(id);
    return { success: true, message: 'Take-away assignment deleted successfully' };
  }
}
