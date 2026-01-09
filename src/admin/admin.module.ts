import { Module } from '@nestjs/common';
import { AdminDashboardController } from './dashboard/dashboard.controller';
import { AdminDashboardService } from './dashboard/dashboard.service';
import { CacheModule } from '../core/cache/cache.module';
import { ResponseModule } from '../shared/response/response.module';

/**
 * Admin Module (Lazy Loaded)
 * 
 * Only loads when admin routes are accessed
 */
@Module({
  imports: [CacheModule, ResponseModule],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
  exports: [AdminDashboardService],
})
export class AdminModule {}
