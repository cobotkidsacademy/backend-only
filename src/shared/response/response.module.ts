import { Module } from '@nestjs/common';
import { ResponseShapeService } from './response-shape.service';

@Module({
  providers: [ResponseShapeService],
  exports: [ResponseShapeService],
})
export class ResponseModule {}
