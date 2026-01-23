import { Module } from '@nestjs/common';
import { TakeAwayController } from './take-away.controller';
import { TakeAwayService } from './take-away.service';
import { TakeAwayQuizService } from './take-away-quiz.service';

@Module({
  controllers: [TakeAwayController],
  providers: [TakeAwayService, TakeAwayQuizService],
  exports: [TakeAwayService, TakeAwayQuizService],
})
export class TakeAwayModule {}
