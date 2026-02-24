import { Module } from '@nestjs/common';
import { StudentCoursesService } from './student-courses.service';
import { StudentCoursesController } from './student-courses.controller';
import { DatabaseModule } from '../database/database.module';
import { SelfClassCodeModule } from '../self-class-code/self-class-code.module';

@Module({
  imports: [DatabaseModule, SelfClassCodeModule],
  controllers: [StudentCoursesController],
  providers: [StudentCoursesService],
  exports: [StudentCoursesService],
})
export class StudentCoursesModule {}















