import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from './presence.service';

interface AuthenticatedSocket {
  id: string;
  handshake: { auth?: { token?: string }; headers?: { authorization?: string } };
  data: { userType?: string; userId?: string };
  join: (room: string) => void;
  leave: (room: string) => void;
  to: (room: string) => { emit: (event: string, data: any) => void };
  emit: (event: string, data: any) => void;
}

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessagingGateway.name);
  private typingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly presenceService: PresenceService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.emit('error', { message: 'Authentication required' });
        return;
      }
      const secret = this.configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
      const payload = this.jwtService.verify(token, { secret });
      const role = payload.role;
      const userId = payload.sub;
      if (!['admin', 'tutor', 'student', 'school', 'parent'].includes(role)) {
        client.emit('error', { message: 'Invalid role' });
        return;
      }
      (client as any).data = { userType: role, userId };
      this.presenceService.setOnline(role, userId, client.id);
      client.join(`user:${role}:${userId}`);
      this.broadcastPresence(role, userId, true);
    } catch (err) {
      this.logger.warn(`WebSocket auth failed: ${err.message}`);
      client.emit('error', { message: 'Invalid token' });
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const data = (client as any).data;
    if (data?.userType && data?.userId) {
      this.presenceService.setOffline(data.userType, data.userId, client.id);
      this.broadcastPresence(data.userType, data.userId, false);
      this.clearTyping(client, data.userType, data.userId);
    }
  }

  private broadcastPresence(userType: string, userId: string, isOnline: boolean) {
    this.server.emit('presence:update', {
      userType,
      userId,
      isOnline,
      lastSeenAt: new Date().toISOString(),
    });
  }

  private clearTyping(client: AuthenticatedSocket, userType: string, userId: string) {
    const rooms = (client as any).rooms;
    if (rooms) {
      for (const room of rooms) {
        if (room.startsWith('conv:')) {
          client.to(room).emit('typing:stop', { userType, userId });
        }
      }
    }
  }

  @SubscribeMessage('conversation:join')
  handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { userType, userId } = (client as any).data || {};
    if (!userType || !userId || !data?.conversationId) return;
    client.join(`conv:${data.conversationId}`);
  }

  @SubscribeMessage('conversation:leave')
  handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (data?.conversationId) {
      client.leave(`conv:${data.conversationId}`);
    }
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const { userType, userId } = (client as any).data || {};
    if (!userType || !userId || !data?.conversationId) return;
    const key = `typing:${data.conversationId}:${userType}:${userId}`;
    if (this.typingTimers.has(key)) {
      clearTimeout(this.typingTimers.get(key));
    }
    client.to(`conv:${data.conversationId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userType,
      userId,
    });
    const t = setTimeout(() => {
      this.typingTimers.delete(key);
      client.to(`conv:${data.conversationId}`).emit('typing:stop', { userType, userId });
    }, 3000);
    this.typingTimers.set(key, t);
  }

  emitNewMessage(conversationId: string, message: any, recipientRoom?: string) {
    this.server.to(`conv:${conversationId}`).emit('message:new', message);
    if (recipientRoom) {
      this.server.to(recipientRoom).emit('message:new', message);
    }
  }

  emitMessageRead(conversationId: string, messageId: string, readAt: string) {
    this.server.to(`conv:${conversationId}`).emit('message:read', { messageId, readAt });
  }

  emitMessageUpdated(conversationId: string, message: { id: string; content: string }) {
    this.server.to(`conv:${conversationId}`).emit('message:updated', message);
  }

  async getPresence(userType: string, userId: string) {
    return this.presenceService.getPresenceWithDb(userType as any, userId);
  }
}
