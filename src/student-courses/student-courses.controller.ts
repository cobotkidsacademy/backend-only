import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { StudentCoursesService } from './student-courses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { Res } from '@nestjs/common';

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

  /**
   * Fast path: validate a class code without the client needing to know the course_level_id.
   * This avoids the frontend making N sequential validate requests across levels.
   */
  @UseGuards(JwtAuthGuard)
  @Post('validate-code-any')
  async validateClassCodeAny(
    @Request() req,
    @Body() body: { code: string },
  ) {
    return this.studentCoursesService.validateClassCodeAny(req.user.sub, body.code);
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

  @UseGuards(JwtAuthGuard)
  @Get('my-portfolio')
  async getMyPortfolio(@Request() req) {
    return this.studentCoursesService.getStudentPortfolio(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('save-project')
  async saveProject(
    @Request() req,
    @Body() body: {
      project_id?: string; // Optional: ID of existing project to update
      topic_id: string;
      course_level_id: string;
      course_id: string;
      project_name: string;
      project_title?: string;
      editor_type: 'inter' | 'exter';
      editor_url?: string;
      project_data?: any;
      project_html?: string;
      project_code?: string;
      project_files?: any[];
      project_type?: string;
      file_format?: string;
      is_autosaved?: boolean;
    },
  ) {
    console.log('Save project request received:', {
      studentId: req.user.sub,
      projectId: body.project_id,
      topicId: body.topic_id,
      courseId: body.course_id,
      levelId: body.course_level_id,
      projectName: body.project_name,
    });
    return this.studentCoursesService.saveStudentProject(req.user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('project/:projectId')
  async getProject(@Request() req, @Param('projectId') projectId: string) {
    return this.studentCoursesService.getStudentProject(req.user.sub, projectId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('project/:projectId/sb3')
  async downloadProjectSb3(
    @Request() req,
    @Param('projectId') projectId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.studentCoursesService.getStudentProjectSb3(
      req.user.sub,
      projectId,
    );

    res.setHeader('Content-Type', 'application/x.scratch.sb3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Get('topic/:topicId/projects')
  async getTopicProjects(@Request() req, @Param('topicId') topicId: string) {
    return this.studentCoursesService.getStudentProjectsByTopic(req.user.sub, topicId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('topic/:topicId/details')
  async getTopicDetails(@Param('topicId') topicId: string) {
    return this.studentCoursesService.getTopicDetails(topicId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('broadcast-green-flag')
  async broadcastGreenFlag(
    @Request() req,
    @Body() body: {
      student_id: string;
      topic_id: string;
      course_id: string;
      course_level_id: string;
      action: string;
      timestamp: string;
    },
  ) {
    // Verify the student_id matches the authenticated user
    if (req.user.sub !== body.student_id) {
      throw new BadRequestException('Student ID mismatch');
    }
    
    // Log the green flag click (you can extend this to store in database or broadcast to other services)
    console.log('Green flag clicked:', {
      studentId: body.student_id,
      topicId: body.topic_id,
      courseId: body.course_id,
      timestamp: body.timestamp,
    });
    
    return {
      success: true,
      message: 'Green flag broadcast received',
    };
  }
}
