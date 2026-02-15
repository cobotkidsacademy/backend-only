import { Injectable, NotFoundException, UnauthorizedException, forwardRef, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { MessagingGateway } from './messaging.gateway';

export type ParticipantType = 'admin' | 'tutor' | 'student';

@Injectable()
export class MessagingService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    @Inject(forwardRef(() => MessagingGateway)) private readonly gateway: MessagingGateway,
  ) {}

  private normalizeParticipants(
    typeA: ParticipantType,
    idA: string,
    typeB: ParticipantType,
    idB: string,
  ): { aType: ParticipantType; aId: string; bType: ParticipantType; bId: string } {
    const order = (t: ParticipantType) => (t === 'admin' ? 0 : t === 'student' ? 1 : 2);
    if (order(typeA) < order(typeB) || (order(typeA) === order(typeB) && idA < idB)) {
      return { aType: typeA, aId: idA, bType: typeB, bId: idB };
    }
    return { aType: typeB, aId: idB, bType: typeA, bId: idA };
  }

  private async getParticipantName(type: ParticipantType, id: string): Promise<string> {
    if (type === 'admin') {
      const { data } = await this.supabase.from('admins').select('email').eq('id', id).single();
      return data?.email || 'Admin';
    }
    if (type === 'tutor') {
      const { data } = await this.supabase
        .from('tutors')
        .select('first_name, last_name')
        .eq('id', id)
        .single();
      return data ? `${data.first_name} ${data.last_name}`.trim() : 'Tutor';
    }
    if (type === 'student') {
      const { data } = await this.supabase
        .from('students')
        .select('first_name, last_name')
        .eq('id', id)
        .single();
      return data ? `${data.first_name} ${data.last_name}`.trim() : 'Student';
    }
    return 'Unknown';
  }

  private async getStudentSchoolClass(studentId: string): Promise<{
    school_name: string;
    class_name: string;
  }> {
    const { data } = await this.supabase
      .from('students')
      .select('classes(name, schools(name))')
      .eq('id', studentId)
      .single();
    const classData = (data as any)?.classes;
    return {
      school_name: classData?.schools?.name ?? '',
      class_name: classData?.name ?? '',
    };
  }

  private sameId(a: any, b: any): boolean {
    if (a == null || b == null) return false;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  async getConversations(userRole: ParticipantType, userId: string) {
    // Use two queries instead of .or() to avoid UUID/filter issues - ensures both parties see the conversation
    const [resA, resB] = await Promise.all([
      this.supabase
        .from('conversations')
        .select('*')
        .eq('participant_a_type', userRole)
        .eq('participant_a_id', userId)
        .order('last_message_at', { ascending: false }),
      this.supabase
        .from('conversations')
        .select('*')
        .eq('participant_b_type', userRole)
        .eq('participant_b_id', userId)
        .order('last_message_at', { ascending: false }),
    ]);
    const convsA = resA.data || [];
    const convsB = resB.data || [];
    const seen = new Set<string>();
    const convs = [...convsA, ...convsB].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    convs.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());

    const result = await Promise.all(
      convs.map(async (c) => {
        let isA = c.participant_a_type === userRole && this.sameId(c.participant_a_id, userId);
        let otherType = isA ? c.participant_b_type : c.participant_a_type;
        let otherId = isA ? c.participant_b_id : c.participant_a_id;
        if (otherType === userRole && this.sameId(otherId, userId)) {
          isA = !isA;
          otherType = isA ? c.participant_b_type : c.participant_a_type;
          otherId = isA ? c.participant_b_id : c.participant_a_id;
        }
        const name = await this.getParticipantName(otherType, otherId);
        const base = {
          id: c.id,
          other_participant_type: otherType,
          other_participant_id: otherId,
          other_participant_name: name,
          last_message_at: c.last_message_at,
        };
        if (otherType === 'student') {
          const { school_name, class_name } = await this.getStudentSchoolClass(otherId);
          return { ...base, other_school_name: school_name, other_class_name: class_name };
        }
        return base;
      }),
    );
    return result;
  }

  async getConversation(conversationId: string, userRole: ParticipantType, userId: string) {
    const { data: conv, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error || !conv) throw new NotFoundException('Conversation not found');

    const isParticipant =
      (conv.participant_a_type === userRole && this.sameId(conv.participant_a_id, userId)) ||
      (conv.participant_b_type === userRole && this.sameId(conv.participant_b_id, userId));
    if (!isParticipant) throw new UnauthorizedException('Not a participant');

    let isA = conv.participant_a_type === userRole && this.sameId(conv.participant_a_id, userId);
    let otherType = isA ? conv.participant_b_type : conv.participant_a_type;
    let otherId = isA ? conv.participant_b_id : conv.participant_a_id;
    if (otherType === userRole && this.sameId(otherId, userId)) {
      isA = !isA;
      otherType = isA ? conv.participant_b_type : conv.participant_a_type;
      otherId = isA ? conv.participant_b_id : conv.participant_a_id;
    }
    const otherName = await this.getParticipantName(otherType, otherId);

    const { data: msgs } = await this.supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    return {
      id: conv.id,
      other_participant_type: otherType,
      other_participant_id: otherId,
      other_participant_name: otherName,
      messages: msgs || [],
    };
  }

  async sendMessage(
    conversationId: string,
    senderType: ParticipantType,
    senderId: string,
    content: string,
    attachmentUrl?: string,
    attachmentFilename?: string,
  ) {
    const { data: conv } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();
    if (!conv) throw new NotFoundException('Conversation not found');

    const isParticipant =
      (conv.participant_a_type === senderType && this.sameId(conv.participant_a_id, senderId)) ||
      (conv.participant_b_type === senderType && this.sameId(conv.participant_b_id, senderId));
    if (!isParticipant) throw new UnauthorizedException('Not a participant');

    const text = content || (attachmentFilename ? `📎 ${attachmentFilename}` : '');
    const payload: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderId,
      content: text,
    };
    if (attachmentUrl) payload.attachment_url = attachmentUrl;
    if (attachmentFilename) payload.attachment_filename = attachmentFilename;

    const { data: msg, error } = await this.supabase
      .from('messages')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    await this.supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    try {
      this.gateway.emitNewMessage(conversationId, msg);
    } catch (e) {
      // WebSocket emit may fail if no clients connected
    }
    return msg;
  }

  async markMessageRead(
    conversationId: string,
    messageId: string,
    userRole: ParticipantType,
    userId: string,
  ) {
    const { data: msg } = await this.supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .single();
    if (!msg) throw new NotFoundException('Message not found');

    const { data: conv } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant =
      (conv.participant_a_type === userRole && this.sameId(conv.participant_a_id, userId)) ||
      (conv.participant_b_type === userRole && this.sameId(conv.participant_b_id, userId));
    if (!isParticipant) throw new UnauthorizedException('Not a participant');

    const isReceiver =
      (msg.sender_type !== userRole || !this.sameId(msg.sender_id, userId));
    if (!isReceiver) return msg;

    const readAt = new Date().toISOString();
    await this.supabase
      .from('messages')
      .update({ read_at: readAt })
      .eq('id', messageId);

    try {
      this.gateway.emitMessageRead(conversationId, messageId, readAt);
    } catch (e) {}

    return { ...msg, read_at: readAt };
  }

  async markConversationRead(
    conversationId: string,
    userRole: ParticipantType,
    userId: string,
  ) {
    const { data: conv } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant =
      (conv.participant_a_type === userRole && this.sameId(conv.participant_a_id, userId)) ||
      (conv.participant_b_type === userRole && this.sameId(conv.participant_b_id, userId));
    if (!isParticipant) throw new UnauthorizedException('Not a participant');

    const readAt = new Date().toISOString();
    const { data: unread } = await this.supabase
      .from('messages')
      .select('id, sender_type, sender_id')
      .eq('conversation_id', conversationId)
      .is('read_at', null);
    const toMark = (unread || []).filter(
      (m) => !(m.sender_type === userRole && this.sameId(m.sender_id, userId)),
    );
    const ids = toMark.map((m) => m.id);
    if (ids.length) {
      await this.supabase
        .from('messages')
        .update({ read_at: readAt })
        .in('id', ids);
    }
    ids.forEach((id) => {
      try {
        this.gateway.emitMessageRead(conversationId, id, readAt);
      } catch (_e) {}
    });
    return { marked: ids.length };
  }

  async findOrCreateConversation(
    userRole: ParticipantType,
    userId: string,
    otherType: ParticipantType,
    otherId: string,
  ) {
    const { aType, aId, bType, bId } = this.normalizeParticipants(
      userRole,
      userId,
      otherType,
      otherId,
    );

    const { data: existing } = await this.supabase
      .from('conversations')
      .select('id')
      .eq('participant_a_type', aType)
      .eq('participant_a_id', aId)
      .eq('participant_b_type', bType)
      .eq('participant_b_id', bId)
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error } = await this.supabase
      .from('conversations')
      .insert({
        participant_a_type: aType,
        participant_a_id: aId,
        participant_b_type: bType,
        participant_b_id: bId,
      })
      .select('id')
      .single();

    if (error) throw error;
    return created.id;
  }

  async searchStudents(query: string, tutorId?: string) {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed || trimmed.length < 2) return [];
    const parts = trimmed.split(/\s+/).filter(Boolean);
    let q = this.supabase
      .from('students')
      .select('id, first_name, last_name, username, class_id, classes(name, schools(name))');
    if (parts.length >= 2) {
      q = q.ilike('first_name', `%${parts[0]}%`).ilike('last_name', `%${parts[parts.length - 1]}%`);
    } else {
      q = q.or(
        `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`,
      );
    }
    q = q.limit(20);

    if (tutorId) {
      const { data: assignments } = await this.supabase
        .from('tutor_class_assignments')
        .select('class_id')
        .eq('tutor_id', tutorId)
        .eq('status', 'active');
      const classIds = (assignments || []).map((a) => a.class_id);
      if (classIds.length) q = q.in('class_id', classIds);
    }

    const { data } = await q;
    return (data || []).map((s) => {
      const classData = (s as any).classes;
      const schoolName = classData?.schools?.name ?? '';
      const className = classData?.name ?? '';
      return {
        id: s.id,
        name: `${s.first_name} ${s.last_name}`.trim(),
        username: s.username,
        type: 'student' as const,
        school_name: schoolName,
        class_name: className,
      };
    });
  }

  async searchTutors(query: string) {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed || trimmed.length < 2) return [];
    const { data } = await this.supabase
      .from('tutors')
      .select('id, first_name, last_name, email')
      .or(
        `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`,
      )
      .limit(20);
    return (data || []).map((t) => ({
      id: t.id,
      name: `${t.first_name} ${t.last_name}`.trim(),
      email: t.email,
      type: 'tutor' as const,
    }));
  }

  async getStudentContacts(studentId: string): Promise<Array<{ type: ParticipantType; id: string; name: string }>> {
    const contacts: Array<{ type: ParticipantType; id: string; name: string }> = [];

    // Admin: use first admin as "Admin" contact
    const { data: admins } = await this.supabase.from('admins').select('id, email').limit(1);
    if (admins?.length) {
      contacts.push({ type: 'admin', id: admins[0].id, name: 'Admin' });
    }

    // Tutors assigned to student's class
    const { data: student } = await this.supabase
      .from('students')
      .select('class_id')
      .eq('id', studentId)
      .single();
    if (student?.class_id) {
      const { data: assignments } = await this.supabase
        .from('tutor_class_assignments')
        .select('tutor:tutors(id, first_name, last_name)')
        .eq('class_id', student.class_id)
        .eq('status', 'active');
      for (const a of assignments || []) {
        const t = (a as any).tutor;
        if (t) {
          contacts.push({
            type: 'tutor',
            id: t.id,
            name: `${t.first_name} ${t.last_name}`.trim(),
          });
        }
      }
    }
    return contacts;
  }

  async getTutorContacts(tutorId: string): Promise<Array<{ type: ParticipantType; id: string; name: string }>> {
    const { data: admins } = await this.supabase.from('admins').select('id, email').limit(1);
    if (!admins?.length) return [];
    return [{ type: 'admin', id: admins[0].id, name: 'Admin' }];
  }

  async getAdminContacts(): Promise<Array<{ type: ParticipantType; id: string; name: string }>> {
    return [];
  }
}
