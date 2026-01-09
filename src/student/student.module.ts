import { Module } from '@nestjs/common';
import { StudentDashboardController } from './dashboard/dashboard.controller';
import { StudentDashboardService } from './dashboard/dashboard.service';
import { CacheModule } from '../core/cache/cache.module';
import { ResponseModule } from '../shared/response/response.module';

/**
 * Student Module (Lazy Loaded)
 * 
 * Only loads when student routes are accessed
 */
@Module({
  imports: [CacheModule, ResponseModule],
  controllers: [StudentDashboardController],
  providers: [StudentDashboardService],
  exports: [StudentDashboardService],
})
export class StudentModule {}
