import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  HttpCode,
  HttpStatus,
  Param,
  Request,
  UnauthorizedException,
  UseGuards,
  Post,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FormsService } from './forms.service';
import { CreateClassFormDto } from '../school/dto/school.dto';

@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  // Get all active forms (global, not tied to any school or class)
  @Get()
  @UseGuards(JwtAuthGuard)
  async getForms(@Request() req) {
    // Any authenticated role can view/open forms
    return this.formsService.getForms();
  }

  // Create a new global form
  @Post()
  @UseGuards(JwtAuthGuard)
  async createForm(@Body() dto: CreateClassFormDto, @Request() req) {
    if (req.user.role !== 'school' && req.user.role !== 'admin') {
      throw new UnauthorizedException('Only schools or admins can create forms');
    }

    return this.formsService.createForm({
      name: dto.name,
      icon_url: dto.icon_url,
      form_url: dto.form_url,
    });
  }

  // Soft delete a form
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteForm(@Param('id') id: string, @Request() req) {
    if (req.user.role !== 'school' && req.user.role !== 'admin') {
      throw new UnauthorizedException('Only schools or admins can delete forms');
    }
    return this.formsService.deleteForm(id);
  }

  // Update an existing form
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateForm(
    @Param('id') id: string,
    @Body() dto: Partial<CreateClassFormDto>,
    @Request() req,
  ) {
    if (req.user.role !== 'school' && req.user.role !== 'admin') {
      throw new UnauthorizedException('Only schools or admins can update forms');
    }
    return this.formsService.updateForm(id, {
      name: dto.name,
      icon_url: dto.icon_url,
      form_url: dto.form_url,
    });
  }
}



