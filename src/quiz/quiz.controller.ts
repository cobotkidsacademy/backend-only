import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateOptionDto,
  UpdateOptionDto,
  StartAttemptDto,
  SubmitQuizDto,
} from './dto/quiz.dto';

@Controller('quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // ==================== QUIZ ROUTES ====================

  @Post()
  async createQuiz(@Body() dto: CreateQuizDto) {
    return this.quizService.createQuiz(dto);
  }

  @Get('topic/:topicId')
  async getQuizzesByTopic(@Param('topicId') topicId: string) {
    return this.quizService.getQuizzesByTopic(topicId);
  }

  // Specific routes must come before parameterized routes
  @Get('student/:quizId')
  async getQuizForStudent(
    @Param('quizId') quizId: string,
    @Query('shuffle') shuffle?: string,
  ) {
    return this.quizService.getQuizForStudent(quizId, shuffle === 'true');
  }

  @Get('leaderboard/global')
  async getGlobalLeaderboard(@Query('limit') limit?: string) {
    return this.quizService.getLeaderboard(limit ? parseInt(limit) : 10);
  }

  @Get('leaderboard/class/:classId')
  async getClassLeaderboard(
    @Param('classId') classId: string,
    @Query('limit') limit?: string,
  ) {
    return this.quizService.getClassLeaderboard(classId, limit ? parseInt(limit) : 10);
  }

  // ==================== QUIZ PERFORMANCE (ADMIN) ====================
  // MUST come before @Get(':id') to avoid route conflicts

  @Get('performance')
  async getQuizPerformance(
    @Query('school_id') schoolId?: string,
    @Query('class_id') classId?: string,
    @Query('course_id') courseId?: string,
    @Query('course_level_id') courseLevelId?: string,
    @Query('topic_id') topicId?: string,
    @Query('quiz_id') quizId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('status') status?: string,
  ) {
    return this.quizService.getQuizPerformance({
      school_id: schoolId,
      class_id: classId,
      course_id: courseId,
      course_level_id: courseLevelId,
      topic_id: topicId,
      quiz_id: quizId,
      date_from: dateFrom,
      date_to: dateTo,
      status: status as 'all' | 'passed' | 'failed' | 'in_progress' || 'all',
    });
  }

  // ==================== STUDENT PROGRESS ROUTES ====================
  // These MUST come before @Get(':id') to avoid route conflicts

  @UseGuards(JwtAuthGuard)
  @Get('student-points')
  async getStudentTotalPoints(@Request() req) {
    console.log('=== GET /quizzes/student-points ===');
    console.log('Request user:', req.user);
    console.log('Student ID from token:', req.user.sub);
    console.log('Student ID type:', typeof req.user.sub);
    
    const result = await this.quizService.getStudentTotalPoints(req.user.sub);
    
    console.log('Service result:', result);
    console.log('Returning to client:', result);
    
    // Always return an object with total_points, even if null
    return result || {
      id: '',
      student_id: req.user.sub,
      total_points: 0,
      quizzes_completed: 0,
      quizzes_passed: 0,
      average_score: 0,
      last_quiz_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('student-scores')
  async getStudentBestScores(@Request() req) {
    return this.quizService.getStudentBestScores(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student-history')
  async getStudentAttemptHistory(
    @Request() req,
    @Query('quiz_id') quizId?: string,
  ) {
    return this.quizService.getStudentAttemptHistory(req.user.sub, quizId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('progress/:quizId')
  async getStudentQuizProgress(
    @Request() req,
    @Param('quizId') quizId: string,
  ) {
    return this.quizService.getStudentQuizProgress(req.user.sub, quizId);
  }

  @Get(':id')
  async getQuizById(@Param('id') id: string) {
    return this.quizService.getQuizById(id);
  }

  @Put(':id')
  async updateQuiz(@Param('id') id: string, @Body() dto: UpdateQuizDto) {
    return this.quizService.updateQuiz(id, dto);
  }

  @Delete(':id')
  async deleteQuiz(@Param('id') id: string) {
    await this.quizService.deleteQuiz(id);
    return { success: true, message: 'Quiz deleted successfully' };
  }

  // ==================== QUESTION ROUTES ====================

  @Post('questions')
  async createQuestion(@Body() dto: CreateQuestionDto) {
    return this.quizService.createQuestion(dto);
  }

  @Get('questions/:id')
  async getQuestionById(@Param('id') id: string) {
    return this.quizService.getQuestionById(id);
  }

  @Put('questions/:id')
  async updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.quizService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  async deleteQuestion(@Param('id') id: string) {
    await this.quizService.deleteQuestion(id);
    return { success: true, message: 'Question deleted successfully' };
  }

  @Put(':quizId/questions/reorder')
  async reorderQuestions(
    @Param('quizId') quizId: string,
    @Body() body: { question_ids: string[] },
  ) {
    await this.quizService.reorderQuestions(quizId, body.question_ids);
    return { success: true, message: 'Questions reordered successfully' };
  }

  // ==================== OPTIONS ROUTES ====================

  @Post('options')
  async createOption(@Body() dto: CreateOptionDto) {
    return this.quizService.createOption(dto);
  }

  @Put('options/:id')
  async updateOption(@Param('id') id: string, @Body() dto: UpdateOptionDto) {
    return this.quizService.updateOption(id, dto);
  }

  @Delete('options/:id')
  async deleteOption(@Param('id') id: string) {
    await this.quizService.deleteOption(id);
    return { success: true, message: 'Option deleted successfully' };
  }

  // ==================== QUIZ TAKING ROUTES ====================

  @UseGuards(JwtAuthGuard)
  @Post('attempts/start')
  async startAttempt(@Request() req, @Body() dto: StartAttemptDto) {
    // Get student ID from JWT token
    const studentId = req.user.sub;
    return this.quizService.startAttempt({
      ...dto,
      student_id: studentId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('attempts/submit')
  async submitQuiz(@Request() req, @Body() dto: SubmitQuizDto) {
    // Verify the attempt belongs to the authenticated student
    return this.quizService.submitQuiz(dto, req.user.sub);
  }

  @Get('attempts/:attemptId')
  async getAttemptDetails(@Param('attemptId') attemptId: string) {
    return this.quizService.getAttemptDetails(attemptId);
  }
}

