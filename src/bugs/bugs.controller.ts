import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BugsService, CreateBugDto, UpdateBugDto } from './bugs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('bugs')
export class BugsController {
  constructor(private readonly bugsService: BugsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBug(@Body() dto: CreateBugDto) {
    return this.bugsService.createBug(dto);
  }

  @Post('load-test')
  @HttpCode(HttpStatus.CREATED)
  async createLoadTestBug(@Body() testResults: any) {
    return this.bugsService.createLoadTestBug(testResults);
  }

  @Get()
  async getAllBugs() {
    return this.bugsService.getAllBugs();
  }

  @Get(':id')
  async getBugById(@Param('id') id: string) {
    return this.bugsService.getBugById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateBug(@Param('id') id: string, @Body() dto: UpdateBugDto) {
    return this.bugsService.updateBug(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBug(@Param('id') id: string) {
    return this.bugsService.deleteBug(id);
  }
}


