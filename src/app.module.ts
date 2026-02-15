import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KeepAliveService } from './core/keep-alive.service';
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
import { LoginRequestsModule } from './login-requests/login-requests.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { EditorModule } from './editor/editor.module';
import { AttendanceModule } from './attendance/attendance.module';
import { BugsModule } from './bugs/bugs.module';
import { FormsModule } from './forms/forms.module';
import { TakeAwayModule } from './take-away/take-away.module';
import { MessagingModule } from './messaging/messaging.module';
import { SelfClassCodeModule } from './self-class-code/self-class-code.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // In production (Railway/Docker), use environment variables only
      // In development, try to load from .env files
      envFilePath: process.env.NODE_ENV === 'production' ? undefined : ['.env', '.env.local'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      expandVariables: true,
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
    LoginRequestsModule,
    CurriculumModule,
    EditorModule,
    AttendanceModule,
    BugsModule,
    FormsModule,
    TakeAwayModule,
    MessagingModule,
    SelfClassCodeModule,
  ],
  controllers: [AppController],
  providers: [AppService, KeepAliveService],
})
export class AppModule {}



