import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../core/decorators/role.decorator';
import { RoleGuard } from '../../core/guards/role.guard';
import { StudentDashboardService } from './dashboard.service';

@Controller('student/dashboard')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('student')
export class StudentDashboardController {
  constructor(private dashboardService: StudentDashboardService) {}

  @Get()
  async getDashboard(@Request() req) {
    const studentId = req.user.sub;
    return this.dashboardService.getDashboard(studentId);
  }
}
