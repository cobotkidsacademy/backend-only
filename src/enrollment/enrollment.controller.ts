import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EnrollmentService, EnrollmentStatus } from './enrollment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @UseGuards(JwtAuthGuard)
  @Get('student/:studentId')
  async getStudentEnrollments(@Param('studentId') studentId: string) {
    return this.enrollmentService.getStudentEnrollments(studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/:studentId/courses')
  async getAllCoursesWithEnrollmentStatus(@Param('studentId') studentId: string) {
    return this.enrollmentService.getAllCoursesWithEnrollmentStatus(studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/:studentId/stats')
  async getEnrollmentStats(@Param('studentId') studentId: string) {
    return this.enrollmentService.getEnrollmentStats(studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('student/:studentId/course/:courseId')
  @HttpCode(HttpStatus.OK)
  async updateEnrollmentStatus(
    @Param('studentId') studentId: string,
    @Param('courseId') courseId: string,
    @Body() body: { status: EnrollmentStatus; progress_percentage?: number },
  ) {
    return this.enrollmentService.updateEnrollmentStatus(
      studentId,
      courseId,
      body.status,
      body.progress_percentage,
    );
  }

  // For students to enroll themselves
  @UseGuards(JwtAuthGuard)
  @Put('me/course/:courseId')
  @HttpCode(HttpStatus.OK)
  async enrollInCourse(
    @Request() req,
    @Param('courseId') courseId: string,
    @Body() body: { status?: EnrollmentStatus; progress_percentage?: number },
  ) {
    return this.enrollmentService.updateEnrollmentStatus(
      req.user.sub,
      courseId,
      body.status || 'enrolled',
      body.progress_percentage,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/courses')
  async getMyCourses(@Request() req) {
    return this.enrollmentService.getAllCoursesWithEnrollmentStatus(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  async getMyStats(@Request() req) {
    return this.enrollmentService.getEnrollmentStats(req.user.sub);
  }
}














