import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { SchoolModule } from './school/school.module';
import { TutorModule } from './tutor/tutor.module';
import { CourseModule } from './course/course.module';
import { AllocationModule } from './allocation/allocation.module';
import { ClassCodeModule } from './class-code/class-code.module';
import { QuizModule } from './quiz/quiz.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { StudentCoursesModule } from './student-courses/student-courses.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'], // Try multiple env file paths
      ignoreEnvFile: false, // Still try to load .env if it exists
      expandVariables: true, // Allow variable expansion in .env
    }),
    DatabaseModule,
    AuthModule,
    SchoolModule,
    TutorModule,
    CourseModule,
    AllocationModule,
    ClassCodeModule,
    QuizModule,
    EnrollmentModule,
    StudentCoursesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}



