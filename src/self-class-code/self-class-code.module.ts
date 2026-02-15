import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { SelfClassCodeController } from './self-class-code.controller';
import { SelfClassCodeService } from './self-class-code.service';
import { MessagingModule } from '../messaging/messaging.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, PassportModule, AuthModule, MessagingModule],
  controllers: [SelfClassCodeController],
  providers: [SelfClassCodeService],
  exports: [SelfClassCodeService],
})
export class SelfClassCodeModule {}
