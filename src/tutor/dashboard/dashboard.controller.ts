import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../core/decorators/role.decorator';
import { RoleGuard } from '../../core/guards/role.guard';
import { TutorDashboardService } from './dashboard.service';

@Controller('tutor/dashboard')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('tutor')
export class TutorDashboardController {
  constructor(private dashboardService: TutorDashboardService) {}

  @Get()
  async getDashboard(@Request() req) {
    const tutorId = req.user.sub;
    return this.dashboardService.getDashboard(tutorId);
  }
}
