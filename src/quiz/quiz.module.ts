import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}

