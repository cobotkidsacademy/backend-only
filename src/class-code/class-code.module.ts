import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClassCodeController } from './class-code.controller';
import { ClassCodeService } from './class-code.service';

@Module({
  imports: [ConfigModule],
  controllers: [ClassCodeController],
  providers: [ClassCodeService],
  exports: [ClassCodeService],
})
export class ClassCodeModule {}

