import { Controller, Get, Query, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KpiService } from './kpi.service';

@Controller('kpi')
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @UseGuards(JwtAuthGuard)
  @Get('tutor/me')
  async getMyKpi(@Request() req, @Query('school_id') schoolId?: string) {
    if (req.user.role !== 'tutor') {
      throw new UnauthorizedException('Only tutors can access this endpoint');
    }
    return this.kpiService.getMyKpi(req.user.sub, schoolId || undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tutors')
  async getAllTutorsKpi(@Request() req, @Query('school_id') schoolId?: string) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can access this endpoint');
    }
    return this.kpiService.getAllTutorsKpi(schoolId || undefined);
  }
}
