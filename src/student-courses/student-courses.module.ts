import { Module } from '@nestjs/common';
import { StudentCoursesService } from './student-courses.service';
import { StudentCoursesController } from './student-courses.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StudentCoursesController],
  providers: [StudentCoursesService],
  exports: [StudentCoursesService],
})
export class StudentCoursesModule {}







