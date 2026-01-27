import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { StudentCoursesService } from './student-courses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('student-courses')
export class StudentCoursesController {
  constructor(private readonly studentCoursesService: StudentCoursesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my-courses')
  async getMyCoursesWithLevels(@Request() req) {
    return this.studentCoursesService.getCoursesForStudentClass(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('validate-code')
  async validateClassCode(
    @Request() req,
    @Body() body: { course_level_id: string; code: string },
  ) {
    return this.studentCoursesService.validateClassCode(
      req.user.sub,
      body.course_level_id,
      body.code,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('level/:levelId/details')
  async getLevelDetails(@Request() req, @Param('levelId') levelId: string) {
    return this.studentCoursesService.getLevelDetails(req.user.sub, levelId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('level/:levelId/topics')
  async getTopicsForLevel(@Param('levelId') levelId: string) {
    return this.studentCoursesService.getTopicsForLevel(levelId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('topic/:topicId/notes')
  async getTopicNotes(@Param('topicId') topicId: string) {
    return this.studentCoursesService.getTopicNotes(topicId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('record-editor-access')
  async recordEditorAccess(
    @Request() req,
    @Body() body: { username: string; course_id: string; topic_id: string; editor_type: string },
  ) {
    return this.studentCoursesService.recordEditorAccess(
      req.user.sub,
      body.username,
      body.course_id,
      body.topic_id,
      body.editor_type,
    );
  }
}
