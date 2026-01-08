import { Controller, Get, Post, Put, Body, Query, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, GetAttendanceDto, AutoMarkAttendanceDto } from './dto/attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * Automatically mark attendance based on student login
   * This should be called when a student logs in
   */
  @Post('auto-mark')
  async autoMarkAttendance(@Body() dto: AutoMarkAttendanceDto) {
    return this.attendanceService.autoMarkAttendance(dto);
  }

  /**
   * Manually mark attendance
   */
  @UseGuards(JwtAuthGuard)
  @Post('mark')
  async markAttendance(@Body() dto: MarkAttendanceDto, @Request() req) {
    const markedBy = req.user?.sub; // Get user ID from JWT
    return this.attendanceService.markAttendance(dto, markedBy);
  }

  /**
   * Get attendance register (Kenyan government format)
   * For tutors: only allows access to classes they're assigned to
   */
  @UseGuards(JwtAuthGuard)
  @Get('register')
  async getAttendanceRegister(@Query() query: GetAttendanceDto, @Request() req) {
    // If user is a tutor, verify they're assigned to this class
    if (req.user?.role === 'tutor') {
      const isAssigned = await this.attendanceService.isTutorAssignedToClass(req.user.sub, query.class_id);
      if (!isAssigned) {
        throw new UnauthorizedException('You are not assigned to this class');
      }
    }
    return this.attendanceService.getAttendanceRegister(query);
  }

  /**
   * Get tutor's assigned classes for attendance
   */
  @UseGuards(JwtAuthGuard)
  @Get('tutor/classes')
  async getTutorClasses(@Request() req) {
    if (req.user?.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.attendanceService.getTutorAssignedClasses(req.user.sub);
  }
}

