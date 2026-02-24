import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { SelfClassCodeService } from './self-class-code.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('self-class-codes')
export class SelfClassCodeController {
  constructor(private readonly selfClassCodeService: SelfClassCodeService) {}

  @Post('request')
  @UseGuards(JwtAuthGuard)
  async requestClassCode(@Request() req: any) {
    if (req.user?.role !== 'student') {
      throw new UnauthorizedException('Only students can request self-study class codes');
    }
    const studentId = req.user.sub;
    return this.selfClassCodeService.requestClassCode(studentId);
  }

  @Get('eligibility')
  @UseGuards(JwtAuthGuard)
  async getEligibility(@Request() req: any) {
    if (req.user?.role !== 'student') {
      throw new UnauthorizedException('Only students can check eligibility');
    }
    const studentId = req.user.sub;
    return this.selfClassCodeService.getEligibility(studentId);
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  async validateCode(
    @Body() body: { code: string; class_id: string },
    @Request() req: any,
  ) {
    if (req.user?.role !== 'student') {
      throw new UnauthorizedException('Only students can validate self-study codes');
    }
    const studentId = req.user.sub;
    if (!body?.code || !body?.class_id) {
      return { valid: false, message: 'Missing code or class_id' };
    }
    return this.selfClassCodeService.validateSelfClassCode(
      studentId,
      body.code,
      body.class_id,
    );
  }
}
