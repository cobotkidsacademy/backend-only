import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  UnauthorizedException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingService } from './messaging.service';
import { PresenceService, ParticipantType } from './presence.service';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { MarkReadDto } from './dto/mark-read.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly presenceService: PresenceService,
    private readonly configService: ConfigService,
  ) {}

  private getUser(req: any): { role: 'admin' | 'tutor' | 'student' | 'school'; id: string } {
    const role = req.user?.role;
    if (!['admin', 'tutor', 'student', 'school'].includes(role)) {
      throw new UnauthorizedException('Only admin, tutor, student, or school can use messaging');
    }
    const id = req.user?.sub ?? req.user?.id;
    if (!id) throw new UnauthorizedException('User ID missing');
    return { role, id };
  }

  @Get('conversations')
  async getConversations(@Request() req) {
    const { role, id } = this.getUser(req);
    return this.messagingService.getConversations(role, id);
  }

  @Get('conversations/:id')
  async getConversation(@Param('id') id: string, @Request() req) {
    const { role, id: userId } = this.getUser(req);
    return this.messagingService.getConversation(id, role, userId);
  }

  @Post('send')
  async sendMessage(@Body() dto: SendMessageDto, @Request() req) {
    const { role, id } = this.getUser(req);
    const content = dto.content ?? '';
    if (!content.trim() && !dto.attachment_url) {
      throw new BadRequestException('Message must have content or attachment');
    }
    const msg = await this.messagingService.sendMessage(
      dto.conversation_id,
      role,
      id,
      content,
      dto.attachment_url,
      dto.attachment_filename,
    );
    return msg;
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|zip)$/i;
        if (allowed.test(file.originalname)) cb(null, true);
        else cb(new BadRequestException('Invalid file type'), false);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: { buffer: Buffer; originalname: string }, @Request() req) {
    this.getUser(req);
    if (!file) throw new BadRequestException('No file provided');
    const uploadDir = path.join(process.cwd(), 'uploads', 'messages');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const ext = path.extname(file.originalname) || '';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, file.buffer);
    const baseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:3001';
    const url = `${baseUrl.replace(/\/$/, '')}/uploads/messages/${safeName}`;
    return { url, filename: file.originalname };
  }

  @Post('mark-read')
  async markRead(@Body() dto: MarkReadDto, @Request() req) {
    const { role, id } = this.getUser(req);
    return this.messagingService.markConversationRead(dto.conversation_id, role, id);
  }

  @Post('conversations/start')
  async startConversation(@Body() dto: StartConversationDto, @Request() req) {
    const { role, id } = this.getUser(req);
    const conversationId = await this.messagingService.findOrCreateConversation(
      role,
      id,
      dto.participant_type,
      dto.participant_id,
    );
    return { conversation_id: conversationId };
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const { role, id } = this.getUser(req);
    return this.messagingService.getUnreadCount(role, id);
  }

  @Get('contacts')
  async getContacts(@Request() req) {
    const { role, id } = this.getUser(req);
    if (role === 'student') return this.messagingService.getStudentContacts(id);
    if (role === 'tutor') return this.messagingService.getTutorContacts(id);
    if (role === 'school') return this.messagingService.getSchoolContacts(id);
    return this.messagingService.getAdminContacts();
  }

  @Get('search/students')
  async searchStudents(@Query('q') q: string, @Request() req) {
    const { role, id } = this.getUser(req);
    if (role !== 'tutor' && role !== 'admin') {
      throw new UnauthorizedException('Only tutor or admin can search students');
    }
    if (!q || q.trim().length < 2) return [];
    const tutorId = role === 'tutor' ? id : undefined;
    return this.messagingService.searchStudents(q.trim(), tutorId);
  }

  @Get('presence/:userType/:userId')
  async getPresence(
    @Param('userType') userType: ParticipantType,
    @Param('userId') userId: string,
  ) {
    return this.presenceService.getPresenceWithDb(userType as ParticipantType, userId);
  }

  @Get('search/tutors')
  async searchTutors(@Query('q') q: string, @Request() req) {
    const { role } = this.getUser(req);
    if (role !== 'admin') {
      throw new UnauthorizedException('Only admin can search tutors');
    }
    if (!q || q.trim().length < 2) return [];
    return this.messagingService.searchTutors(q.trim());
  }
}
