import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export type ParticipantType = 'admin' | 'tutor' | 'student' | 'school';

export interface PresenceInfo {
  userType: ParticipantType;
  userId: string;
  isOnline: boolean;
  lastSeenAt: string;
  name?: string;
}

@Injectable()
export class PresenceService {
  private presence = new Map<string, { socketIds: Set<string>; lastSeenAt: Date }>();

  constructor(@Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient) {}

  private key(userType: ParticipantType, userId: string): string {
    return `${userType}:${userId}`;
  }

  setOnline(userType: ParticipantType, userId: string, socketId: string): void {
    const k = this.key(userType, userId);
    const existing = this.presence.get(k);
    if (existing) {
      existing.socketIds.add(socketId);
      return;
    }
    this.presence.set(k, {
      socketIds: new Set([socketId]),
      lastSeenAt: new Date(),
    });
    this.upsertPresenceDb(userType, userId, true).catch(() => {});
  }

  setOffline(userType: ParticipantType, userId: string, socketId: string): void {
    const k = this.key(userType, userId);
    const existing = this.presence.get(k);
    if (!existing) return;
    existing.socketIds.delete(socketId);
    const now = new Date();
    existing.lastSeenAt = now;
    if (existing.socketIds.size === 0) {
      this.presence.delete(k);
      this.upsertPresenceDb(userType, userId, false).catch(() => {});
    }
  }

  getPresence(userType: ParticipantType, userId: string): PresenceInfo | null {
    const k = this.key(userType, userId);
    const p = this.presence.get(k);
    if (p) {
      return {
        userType,
        userId,
        isOnline: p.socketIds.size > 0,
        lastSeenAt: p.lastSeenAt.toISOString(),
      };
    }
    return null;
  }

  async getPresenceWithDb(userType: ParticipantType, userId: string): Promise<PresenceInfo> {
    const inMemory = this.getPresence(userType, userId);
    if (inMemory?.isOnline) {
      return { ...inMemory, isOnline: true };
    }
    const { data } = await this.supabase
      .from('user_presence')
      .select('is_online, last_seen_at')
      .eq('user_type', userType)
      .eq('user_id', userId)
      .maybeSingle();
    const lastSeen = data?.last_seen_at || new Date(0).toISOString();
    return {
      userType,
      userId,
      isOnline: false,
      lastSeenAt: lastSeen,
    };
  }

  private async upsertPresenceDb(
    userType: ParticipantType,
    userId: string,
    isOnline: boolean,
  ): Promise<void> {
    try {
      await this.supabase.from('user_presence').upsert(
        {
          user_type: userType,
          user_id: userId,
          is_online: isOnline,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_type,user_id' },
      );
    } catch {
      // Table might not exist yet
    }
  }

  getTyping(conversationId: string, excludeSocketId?: string): Map<string, string> {
    return new Map();
  }
}
