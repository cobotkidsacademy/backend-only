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
import { EditorService } from './editor.service';
import { CreateEditorDto, UpdateEditorDto } from './dto/editor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('editors')
export class EditorController {
  private readonly logger = new Logger(EditorController.name);

  constructor(private readonly editorService: EditorService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createEditor(@Body() dto: CreateEditorDto) {
    this.logger.log(`Creating editor: ${JSON.stringify(dto)}`);
    return this.editorService.createEditor(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllEditors() {
    return this.editorService.getAllEditors();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getEditorById(@Param('id') id: string) {
    return this.editorService.getEditorById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateEditor(@Param('id') id: string, @Body() dto: UpdateEditorDto) {
    return this.editorService.updateEditor(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEditor(@Param('id') id: string) {
    return this.editorService.deleteEditor(id);
  }
}










