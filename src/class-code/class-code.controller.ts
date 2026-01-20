import { Controller, Get, Post, Body, Param, Query, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ClassCodeService } from './class-code.service';
import { GenerateCodeDto, ValidateCodeDto, ClassStatus } from './dto/class-code.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('class-codes')
export class ClassCodeController {
  constructor(private readonly classCodeService: ClassCodeService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateCode(@Body() dto: GenerateCodeDto, @Request() req) {
    // If user is a tutor, set the generated_by_tutor_id
    if (req.user.role === 'tutor') {
      dto.generated_by_tutor_id = req.user.sub;
    }
    
    // Log the request for debugging
    console.log('Generate code request:', {
      class_id: dto.class_id,
      topic_id: dto.topic_id,
      generated_by_tutor_id: dto.generated_by_tutor_id,
    });
    
    return this.classCodeService.generateCode(dto);
  }

  @Post('validate')
  async validateCode(@Body() dto: ValidateCodeDto) {
    return this.classCodeService.validateCode(dto);
  }

  // Specific routes must come before parameterized routes
  @UseGuards(JwtAuthGuard)
  @Get('tutor/me/classes')
  async getMyClasses(@Request() req) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    const result = await this.classCodeService.getTutorClassesWithAllocation(req.user.sub);
    const serverTime = await this.classCodeService.getServerTimePublic();
    return {
      data: result,
      server_time: serverTime.toISOString(),
    };
  }

  @Get('classes')
  async getClassesWithAllocation(
    @Query('school_id') schoolId?: string,
    @Query('level') level?: string,
    @Query('status') status?: ClassStatus,
  ) {
    const result = await this.classCodeService.getClassesWithAllocation({
      school_id: schoolId,
      level: level,
      status: status,
    });
    
    // Get network time for the response
    const serverTime = await this.classCodeService.getServerTimePublic();
    
    return {
      data: result,
      server_time: serverTime.toISOString(),
    };
  }

  @Get('class/:classId/active')
  async getActiveCodeForClass(@Param('classId') classId: string) {
    const code = await this.classCodeService.getActiveCodeForClass(classId);
    const serverTime = await this.classCodeService.getServerTimePublic();
    return { code, server_time: serverTime.toISOString() };
  }

  @Get('class/:classId/history')
  async getCodeHistory(@Param('classId') classId: string) {
    return this.classCodeService.getCodeHistory(classId);
  }

  @Get('server-time')
  async getServerTime() {
    const serverTime = await this.classCodeService.getServerTimePublic();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    return {
      server_time: serverTime.toISOString(),
      server_time_local: serverTime.toLocaleString(),
      day_of_week: days[serverTime.getDay()],
      hours: serverTime.getHours(),
      minutes: serverTime.getMinutes(),
    };
  }

  @Get('debug/:classId')
  async debugClass(@Param('classId') classId: string) {
    return this.classCodeService.debugClassInfo(classId);
  }

  @Get('class/:classId/topics')
  @UseGuards(JwtAuthGuard)
  async getTopicsForClass(@Param('classId') classId: string) {
    return this.classCodeService.getTopicsForEnrolledLevels(classId);
  }
}

