import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AllocationService } from './allocation.service';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  AssignTutorDto,
  UpdateAssignmentDto,
  AssignCourseLevelDto,
  UpdateCourseLevelStatusDto,
  AssignCourseEditorDto,
  UpdateCourseEditorDto,
} from './dto/allocation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('allocations')
export class AllocationController {
  constructor(private readonly allocationService: AllocationService) {}

  // ==================== ALLOCATION OVERVIEW ====================

  @Get()
  async getAllocations() {
    return this.allocationService.getAllocations();
  }

  @UseGuards(JwtAuthGuard)
  @Get('class/:classId/performance')
  async getClassPerformance(@Request() req, @Param('classId') classId: string) {
    if (req.user.role !== 'admin' && req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only admin or tutor can access this endpoint');
    }
    if (req.user.role === 'tutor') {
      const { data: assignment } = await this.allocationService['supabase']
        .from('tutor_class_assignments')
        .select('id')
        .eq('tutor_id', req.user.sub)
        .eq('class_id', classId)
        .eq('status', 'active')
        .single();
      if (!assignment) {
        throw new UnauthorizedException('Tutor does not have access to this class');
      }
    }
    return this.allocationService.getClassPerformanceData(classId);
  }

  @Get('class/:classId')
  async getAllocationByClass(@Param('classId') classId: string) {
    return this.allocationService.getAllocationByClass(classId);
  }

  // ==================== CLASS SCHEDULES ====================

  @Post('schedules')
  async createSchedule(@Body() dto: CreateScheduleDto) {
    return this.allocationService.createSchedule(dto);
  }

  @Put('schedules/:id')
  async updateSchedule(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.allocationService.updateSchedule(id, dto);
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Param('id') id: string) {
    await this.allocationService.deleteSchedule(id);
    return { message: 'Schedule deleted successfully' };
  }

  @Get('schedules')
  async getAllSchedules(@Query('classId') classId?: string) {
    if (classId) {
      return this.allocationService.getSchedulesByClass(classId);
    }
    return this.allocationService.getAllSchedules();
  }

  // ==================== TUTOR ASSIGNMENTS ====================

  @Post('assignments')
  async assignTutor(@Body() dto: AssignTutorDto) {
    return this.allocationService.assignTutor(dto);
  }

  @Put('assignments/:id')
  async updateAssignment(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.allocationService.updateAssignment(id, dto);
  }

  @Delete('assignments/:id')
  async unassignTutor(@Param('id') id: string) {
    await this.allocationService.unassignTutor(id);
    return { message: 'Tutor unassigned successfully' };
  }

  @Get('assignments')
  async getAssignments(@Query('tutorId') tutorId?: string, @Query('classId') classId?: string) {
    if (tutorId) {
      return this.allocationService.getAssignmentsByTutor(tutorId);
    }
    if (classId) {
      return this.allocationService.getAssignmentsByClass(classId);
    }
    return this.allocationService.getAllAssignments();
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me')
  async getMyTutorDetails(@Request() req) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getTutorDetails(req.user.sub);
  }

  @Get('tutor/:tutorId')
  async getTutorDetails(@Param('tutorId') tutorId: string) {
    return this.allocationService.getTutorDetails(tutorId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/schools')
  async getMySchools(@Request() req) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getTutorSchools(req.user.sub);
  }

  // More specific routes must come before less specific ones
  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/schools/:schoolId/performance')
  async getSchoolPerformance(@Request() req, @Param('schoolId') schoolId: string) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getSchoolPerformanceData(req.user.sub, schoolId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/schools/:schoolId')
  async getMySchoolDetails(@Request() req, @Param('schoolId') schoolId: string) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getTutorSchoolDetails(req.user.sub, schoolId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/students')
  async getMyStudents(@Request() req, @Query('school_id') schoolId?: string, @Query('class_id') classId?: string, @Query('name') name?: string) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getTutorStudents(req.user.sub, {
      school_id: schoolId,
      class_id: classId,
      name: name,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/students/exceeding')
  async getMyStudentsExceeding(@Request() req) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getTutorStudentsExceeding(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/students/:studentId/exam')
  async getStudentExamData(@Request() req, @Param('studentId') studentId: string) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    // Verify tutor has access to this student (student must be in tutor's assigned classes)
    const students = await this.allocationService.getTutorStudents(req.user.sub);
    const hasAccess = students.some((s: any) => s.id === studentId);
    if (!hasAccess) {
      throw new UnauthorizedException('You do not have access to this student');
    }
    return this.allocationService.getStudentExamData(studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/performance/all-schools')
  async getTutorAllSchoolsPerformance(@Request() req) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getTutorAllSchoolsPerformanceData(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/performance')
  async getPerformanceData(
    @Request() req,
    @Query('school_id') schoolId?: string,
    @Query('class_id') classId?: string,
    @Query('course_level_id') courseLevelId?: string,
    @Query('name') name?: string,
  ) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.allocationService.getTutorPerformanceData(req.user.sub, {
      school_id: schoolId,
      class_id: classId,
      course_level_id: courseLevelId,
      name: name,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/classes/:classId/verify')
  async verifyClassAccess(@Request() req, @Param('classId') classId: string) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    // Verify tutor has access to this class
    const { data: assignment } = await this.allocationService['supabase']
      .from('tutor_class_assignments')
      .select('id')
      .eq('tutor_id', req.user.sub)
      .eq('class_id', classId)
      .eq('status', 'active')
      .single();
    
    if (!assignment) {
      throw new UnauthorizedException('Tutor does not have access to this class');
    }
    
    return { hasAccess: true };
  }

  // ==================== CLASS COURSE LEVEL ASSIGNMENTS ====================

  @Post('course-levels')
  async assignCourseLevel(@Body() dto: AssignCourseLevelDto) {
    return this.allocationService.assignCourseLevel(dto);
  }

  @Put('course-levels/:id')
  async updateCourseLevelStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCourseLevelStatusDto,
  ) {
    return this.allocationService.updateCourseLevelStatus(id, dto);
  }

  @Delete('course-levels/:id')
  async deleteCourseLevelAssignment(@Param('id') id: string) {
    await this.allocationService.deleteCourseLevelAssignment(id);
    return { message: 'Course level assignment deleted successfully' };
  }

  @Get('course-levels/class/:classId')
  async getClassCourseLevels(@Param('classId') classId: string) {
    return this.allocationService.getClassCourseLevels(classId);
  }

  // ==================== COURSE EDITOR ASSIGNMENTS ====================

  @Post('course-editors')
  async assignCourseEditor(@Body() dto: AssignCourseEditorDto) {
    return this.allocationService.assignCourseEditor(dto);
  }

  @Put('course-editors/:id')
  async updateCourseEditor(
    @Param('id') id: string,
    @Body() dto: UpdateCourseEditorDto,
  ) {
    return this.allocationService.updateCourseEditor(id, dto);
  }

  @Delete('course-editors/:id')
  async deleteCourseEditorAssignment(@Param('id') id: string) {
    await this.allocationService.deleteCourseEditorAssignment(id);
    return { message: 'Course editor assignment deleted successfully' };
  }

  @Get('course-editors')
  async getAllCourseEditorAssignments() {
    return this.allocationService.getAllCourseEditorAssignments();
  }
}

