import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../core/decorators/role.decorator';
import { RoleGuard } from '../../core/guards/role.guard';
import { AdminDashboardService } from './dashboard.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('admin')
export class AdminDashboardController {
  constructor(private dashboardService: AdminDashboardService) {}

  @Get()
  async getDashboard(@Request() req) {
    const adminId = req.user.sub;
    return this.dashboardService.getDashboard(adminId);
  }
}
