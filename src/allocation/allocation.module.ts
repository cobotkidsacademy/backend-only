import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AllocationController } from './allocation.controller';
import { AllocationService } from './allocation.service';

@Module({
  imports: [ConfigModule],
  controllers: [AllocationController],
  providers: [AllocationService],
  exports: [AllocationService],
})
export class AllocationModule {}

