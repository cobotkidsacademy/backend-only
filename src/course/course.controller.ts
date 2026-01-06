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
  Logger,
} from '@nestjs/common';
import { CourseService } from './course.service';
import {
  CreateCourseDto,
  UpdateCourseDto,
  UpdateLevelDto,
  CreateTopicDto,
  UpdateTopicDto,
  CreateNoteDto,
  UpdateNoteDto,
  CreateNoteElementDto,
  UpdateNoteElementDto,
  UpdateElementsPositionDto,
} from './dto/course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('courses')
export class CourseController {
  private readonly logger = new Logger(CourseController.name);

  constructor(private readonly courseService: CourseService) {}

  // ============ COURSE ENDPOINTS ============

  @Post()
  @UseGuards(JwtAuthGuard)
  async createCourse(@Body() dto: CreateCourseDto) {
    this.logger.log(`Creating course: ${JSON.stringify(dto)}`);
    return this.courseService.createCourse(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllCourses() {
    return this.courseService.getAllCourses();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getCourseById(@Param('id') id: string) {
    return this.courseService.getCourseById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courseService.updateCourse(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourse(@Param('id') id: string) {
    return this.courseService.deleteCourse(id);
  }

  // ============ LEVEL ENDPOINTS ============

  @Get(':courseId/levels')
  @UseGuards(JwtAuthGuard)
  async getLevelsByCourse(@Param('courseId') courseId: string) {
    return this.courseService.getLevelsByCoruseId(courseId);
  }

  @Get('levels/:id')
  @UseGuards(JwtAuthGuard)
  async getLevelById(@Param('id') id: string) {
    return this.courseService.getLevelById(id);
  }

  @Put('levels/:id')
  @UseGuards(JwtAuthGuard)
  async updateLevel(@Param('id') id: string, @Body() dto: UpdateLevelDto) {
    return this.courseService.updateLevel(id, dto);
  }

  @Delete('levels/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLevel(@Param('id') id: string) {
    return this.courseService.deleteLevel(id);
  }

  // ============ TOPIC ENDPOINTS ============

  @Post('topics')
  @UseGuards(JwtAuthGuard)
  async createTopic(@Body() dto: CreateTopicDto) {
    return this.courseService.createTopic(dto);
  }

  @Get('levels/:levelId/topics')
  @UseGuards(JwtAuthGuard)
  async getTopicsByLevel(@Param('levelId') levelId: string) {
    return this.courseService.getTopicsByLevelId(levelId);
  }

  @Get('topics/:id')
  @UseGuards(JwtAuthGuard)
  async getTopicById(@Param('id') id: string) {
    return this.courseService.getTopicById(id);
  }

  @Put('topics/:id')
  @UseGuards(JwtAuthGuard)
  async updateTopic(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.courseService.updateTopic(id, dto);
  }

  @Delete('topics/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTopic(@Param('id') id: string) {
    return this.courseService.deleteTopic(id);
  }

  // ============ NOTE ENDPOINTS ============

  @Post('notes')
  @UseGuards(JwtAuthGuard)
  async createNote(@Body() dto: CreateNoteDto) {
    return this.courseService.createNote(dto);
  }

  @Get('topics/:topicId/notes')
  @UseGuards(JwtAuthGuard)
  async getNotesByTopic(@Param('topicId') topicId: string) {
    return this.courseService.getNotesByTopicId(topicId);
  }

  @Get('notes/:id')
  @UseGuards(JwtAuthGuard)
  async getNoteById(@Param('id') id: string) {
    return this.courseService.getNoteById(id);
  }

  @Put('notes/:id')
  @UseGuards(JwtAuthGuard)
  async updateNote(@Param('id') id: string, @Body() dto: UpdateNoteDto) {
    return this.courseService.updateNote(id, dto);
  }

  @Delete('notes/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNote(@Param('id') id: string) {
    return this.courseService.deleteNote(id);
  }

  // ============ NOTE ELEMENT ENDPOINTS ============

  @Post('notes/elements')
  @UseGuards(JwtAuthGuard)
  async createNoteElement(@Body() dto: CreateNoteElementDto) {
    return this.courseService.createNoteElement(dto);
  }

  @Put('notes/elements/:id')
  @UseGuards(JwtAuthGuard)
  async updateNoteElement(@Param('id') id: string, @Body() dto: UpdateNoteElementDto) {
    return this.courseService.updateNoteElement(id, dto);
  }

  @Put('notes/elements/positions')
  @UseGuards(JwtAuthGuard)
  async updateElementsPosition(@Body() dto: UpdateElementsPositionDto) {
    return this.courseService.updateElementsPosition(dto);
  }

  @Delete('notes/elements/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNoteElement(@Param('id') id: string) {
    return this.courseService.deleteNoteElement(id);
  }
}

