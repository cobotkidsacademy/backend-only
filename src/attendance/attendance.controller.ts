import { Controller, Get, Post, Put, Body, Query, UseGuards, Request } from '@nestjs/common';
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
   */
  @UseGuards(JwtAuthGuard)
  @Get('register')
  async getAttendanceRegister(@Query() query: GetAttendanceDto) {
    return this.attendanceService.getAttendanceRegister(query);
  }
}

