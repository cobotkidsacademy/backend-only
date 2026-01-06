import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TutorService } from './tutor.service';
import { CreateTutorDto, UpdateTutorDto } from './dto/tutor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('tutors')
export class TutorController {
  private readonly logger = new Logger(TutorController.name);

  constructor(private readonly tutorService: TutorService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createTutor(@Body() dto: CreateTutorDto) {
    this.logger.log(`Creating tutor: ${JSON.stringify(dto)}`);
    return this.tutorService.createTutor(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllTutors(@Query('level') level?: string) {
    if (level) {
      return this.tutorService.getTutorsByLevel(level);
    }
    return this.tutorService.getAllTutors();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTutorById(@Param('id') id: string) {
    return this.tutorService.getTutorById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateTutor(@Param('id') id: string, @Body() dto: UpdateTutorDto) {
    return this.tutorService.updateTutor(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTutor(@Param('id') id: string) {
    return this.tutorService.deleteTutor(id);
  }
}






