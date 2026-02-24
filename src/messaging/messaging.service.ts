import { Injectable, NotFoundException, UnauthorizedException, forwardRef, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { MessagingGateway } from './messaging.gateway';

export type ParticipantType = 'admin' | 'tutor' | 'student' | 'school';

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
    const order = (t: ParticipantType) =>
      t === 'admin' ? 0 : t === 'school' ? 1 : t === 'student' ? 2 : 3;
    const normA = (idA || '').toLowerCase();
    const normB = (idB || '').toLowerCase();
    if (order(typeA) < order(typeB) || (order(typeA) === order(typeB) && normA < normB)) {
      return { aType: typeA, aId: idA, bType: typeB, bId: idB };
    }
    return { aType: typeB, aId: idB, bType: typeA, bId: idA };
  }

  private async getParticipantName(type: ParticipantType, id: string): Promise<string> {
    if (type === 'admin') {
      const { data } = await this.supabase.from('admins').select('email').eq('id', id).single();
      if (data?.email === 'classcode@system') return 'Class Code';
      return data?.email || 'Admin';
    }
    if (type === 'school') {
      const { data } = await this.supabase.from('schools').select('name').eq('id', id).single();
      return data?.name || 'School';
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

  private async getStudentDetails(studentId: string): Promise<{
    school_name: string;
    class_name: string;
    profile_image_url: string | null;
    first_name: string;
    username: string;
  }> {
    const { data } = await this.supabase
      .from('students')
      .select('profile_image_url, first_name, username, classes(name, schools(name))')
      .eq('id', studentId)
      .single();
    const classData = (data as any)?.classes;
    return {
      school_name: classData?.schools?.name ?? '',
      class_name: classData?.name ?? '',
      profile_image_url: (data as any)?.profile_image_url ?? null,
      first_name: (data as any)?.first_name ?? '',
      username: (data as any)?.username ?? '',
    };
  }

  private async getTutorParticipantDetails(tutorId: string): Promise<{
    profile_image_url: string | null;
    first_name: string;
    display_class_name?: string;
  }> {
    const { data } = await this.supabase
      .from('tutors')
      .select('profile_image_url, first_name, display_class_name')
      .eq('id', tutorId)
      .single();
    return {
      profile_image_url: (data as any)?.profile_image_url ?? null,
      first_name: (data as any)?.first_name ?? '',
      display_class_name: (data as any)?.display_class_name ?? undefined,
    };
  }

  private sameId(a: any, b: any): boolean {
    if (a == null || b == null) return false;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  async getConversations(userRole: ParticipantType, userId: string) {
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

    const byType: { admin: string[]; tutor: string[]; student: string[]; school: string[] } = {
      admin: [],
      tutor: [],
      student: [],
      school: [],
    };
    for (const c of convs) {
      let isA = c.participant_a_type === userRole && this.sameId(c.participant_a_id, userId);
      let otherType = isA ? c.participant_b_type : c.participant_a_type;
      let otherId = isA ? c.participant_b_id : c.participant_a_id;
      if (otherType === userRole && this.sameId(otherId, userId)) {
        isA = !isA;
        otherType = isA ? c.participant_b_type : c.participant_a_type;
        otherId = isA ? c.participant_b_id : c.participant_a_id;
      }
      if (otherId && (byType as any)[otherType]) (byType as any)[otherType].push(otherId);
    }
    const unique = (arr: string[]) => [...new Set(arr)];

    const [adminsData, tutorsData, studentsData, schoolsData] = await Promise.all([
      byType.admin.length
        ? this.supabase.from('admins').select('id, email').in('id', unique(byType.admin))
        : Promise.resolve({ data: [] }),
      byType.tutor.length
        ? this.supabase.from('tutors').select('id, first_name, last_name, profile_image_url, display_class_name').in('id', unique(byType.tutor))
        : Promise.resolve({ data: [] }),
      byType.student.length
        ? this.supabase
            .from('students')
            .select('id, first_name, last_name, username, profile_image_url, classes(name, schools(name))')
            .in('id', unique(byType.student))
        : Promise.resolve({ data: [] }),
      byType.school.length
        ? this.supabase.from('schools').select('id, name').in('id', unique(byType.school))
        : Promise.resolve({ data: [] }),
    ]);

    const adminMap = new Map<string, { name: string }>();
    (adminsData.data || []).forEach((a: any) => adminMap.set(a.id, { name: a.email || 'Admin' }));
    const schoolMap = new Map<string, { name: string }>();
    (schoolsData.data || []).forEach((s: any) => schoolMap.set(s.id, { name: s.name || 'School' }));
    const tutorMap = new Map<
      string,
      { name: string; profile_image_url: string | null; first_name: string; class_name?: string }
    >();
    const tutorClassMap = new Map<string, string>();
    if (byType.tutor.length > 0 && userRole === 'school') {
      const { data: classRows } = await this.supabase
        .from('classes')
        .select('id')
        .eq('school_id', userId);
      const classIds = (classRows || []).map((c: any) => c.id);
      if (classIds.length > 0) {
        const { data: asn } = await this.supabase
          .from('tutor_class_assignments')
          .select('tutor_id, class:classes(name)')
          .in('tutor_id', unique(byType.tutor))
          .in('class_id', classIds)
          .eq('status', 'active');
        for (const a of asn || []) {
          const tutorId = (a as any).tutor_id;
          const className = (a as any).class?.name;
          if (tutorId && className) {
            const existing = tutorClassMap.get(tutorId) || '';
            const parts = existing ? existing.split(', ') : [];
            if (!parts.includes(className)) parts.push(className);
            tutorClassMap.set(tutorId, parts.join(', '));
          }
        }
      }
    }
    (tutorsData.data || []).forEach((t: any) => {
      const class_name = userRole === 'school' ? (tutorClassMap.get(t.id) || undefined) : undefined;
      const fullName = `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'Tutor';
      const displayName = (t.display_class_name || '').trim();
      const name = userRole === 'student' && displayName ? displayName : fullName;
      tutorMap.set(t.id, {
        name,
        profile_image_url: t.profile_image_url ?? null,
        first_name: t.first_name || '',
        class_name: class_name || undefined,
      });
    });
    const studentMap = new Map<
      string,
      { name: string; school_name: string; class_name: string; profile_image_url: string | null; first_name: string; username: string }
    >();
    (studentsData.data || []).forEach((s: any) => {
      const classData = s?.classes;
      studentMap.set(s.id, {
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student',
        school_name: classData?.schools?.name ?? '',
        class_name: classData?.name ?? '',
        profile_image_url: s.profile_image_url ?? null,
        first_name: s.first_name ?? '',
        username: s.username ?? '',
      });
    });

    const convIds = convs.map((c) => c.id);
    const unreadByConv = new Map<string, number>();
    const lastMessageByConv = new Map<string, string>();
    if (convIds.length > 0) {
      const [unreadRes, lastMsgRes] = await Promise.all([
        this.supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', convIds)
          .is('read_at', null)
          .or(`sender_type.neq.${userRole},sender_id.neq.${userId}`),
        this.supabase
          .from('messages')
          .select('conversation_id, content, attachment_url')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false }),
      ]);
      for (const m of unreadRes.data || []) {
        unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
      }
      const seenConv = new Set<string>();
      for (const m of lastMsgRes.data || []) {
        if (!seenConv.has(m.conversation_id)) {
          seenConv.add(m.conversation_id);
          lastMessageByConv.set(
            m.conversation_id,
            m.content || (m.attachment_url ? '📎 Attachment' : ''),
          );
        }
      }
    }

    return convs.map((c) => {
      let isA = c.participant_a_type === userRole && this.sameId(c.participant_a_id, userId);
      let otherType = isA ? c.participant_b_type : c.participant_a_type;
      let otherId = isA ? c.participant_b_id : c.participant_a_id;
      if (otherType === userRole && this.sameId(otherId, userId)) {
        isA = !isA;
        otherType = isA ? c.participant_b_type : c.participant_a_type;
        otherId = isA ? c.participant_b_id : c.participant_a_id;
      }
      const base = {
        id: c.id,
        other_participant_type: otherType,
        other_participant_id: otherId,
        other_participant_name: 'Unknown',
        last_message_at: c.last_message_at,
        unread_count: unreadByConv.get(c.id) || 0,
        last_message_preview: lastMessageByConv.get(c.id) || null,
      };
      if (otherType === 'admin') {
        const a = adminMap.get(otherId);
        return { ...base, other_participant_name: a?.name ?? 'Admin' };
      }
      if (otherType === 'school') {
        const s = schoolMap.get(otherId);
        return { ...base, other_participant_name: s?.name ?? 'School' };
      }
      if (otherType === 'tutor') {
        const t = tutorMap.get(otherId);
        return t
          ? {
              ...base,
              other_participant_name: t.name,
              other_profile_image_url: t.profile_image_url,
              other_first_name: t.first_name,
              ...(t.class_name ? { other_class_name: t.class_name } : {}),
            }
          : base;
      }
      if (otherType === 'student') {
        const st = studentMap.get(otherId);
        return st
          ? {
              ...base,
              other_participant_name: st.name,
              other_school_name: st.school_name,
              other_class_name: st.class_name,
              other_profile_image_url: st.profile_image_url,
              other_first_name: st.first_name,
              other_username: st.username,
            }
          : { ...base, other_participant_name: 'Student' };
      }
      return base;
    });
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
    const [otherName, detailsResult, msgsRes] = await Promise.all([
      this.getParticipantName(otherType, otherId),
      otherType === 'student'
        ? this.getStudentDetails(otherId)
        : otherType === 'tutor'
          ? (async () => {
              const d = await this.getTutorParticipantDetails(otherId);
              const assign: Record<string, unknown> = {
                other_profile_image_url: d.profile_image_url,
                other_first_name: d.first_name,
              };
      if (userRole === 'student' && d.display_class_name?.trim()) {
        assign.other_display_class_name = d.display_class_name.trim();
      }
      if (userRole === 'school') {
        const { data: classRows } = await this.supabase
          .from('classes')
          .select('id')
          .eq('school_id', userId);
        const classIds = (classRows || []).map((c: any) => c.id);
        if (classIds.length > 0) {
          const { data: asn } = await this.supabase
            .from('tutor_class_assignments')
            .select('class:classes(name)')
            .eq('tutor_id', otherId)
            .in('class_id', classIds)
            .eq('status', 'active');
          const classNames = [...new Set((asn || []).map((a: any) => a?.class?.name).filter(Boolean))];
          if (classNames.length > 0) assign.other_class_name = classNames.join(', ');
        }
      }
              return assign;
            })()
          : Promise.resolve({}),
      this.supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
    ]);
    const msgs = msgsRes?.data || [];

    const extra: Record<string, unknown> = {};
    let finalName = otherName;
    if (otherType === 'student' && detailsResult) {
      const d = detailsResult as { school_name: string; class_name: string; profile_image_url: string | null; first_name: string; username: string };
      Object.assign(extra, {
        other_school_name: d.school_name,
        other_class_name: d.class_name,
        other_profile_image_url: d.profile_image_url,
        other_first_name: d.first_name,
        other_username: d.username,
      });
    } else if (otherType === 'tutor' && detailsResult) {
      Object.assign(extra, detailsResult);
      if (userRole === 'student' && (detailsResult as any).other_display_class_name) {
        finalName = (detailsResult as any).other_display_class_name;
        delete (extra as any).other_display_class_name;
      }
    }

    return {
      id: conv.id,
      other_participant_type: otherType,
      other_participant_id: otherId,
      other_participant_name: finalName,
      messages: msgs || [],
      ...extra,
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
      const recipient =
        conv.participant_a_type === senderType && this.sameId(conv.participant_a_id, senderId)
          ? { type: conv.participant_b_type, id: conv.participant_b_id }
          : { type: conv.participant_a_type, id: conv.participant_a_id };
      const recipientRoom = `user:${recipient.type}:${recipient.id}`;
      this.gateway.emitNewMessage(conversationId, msg, recipientRoom);
    } catch (e) {
      // WebSocket emit may fail if no clients connected
    }
    return msg;
  }

  /** Update message content (e.g. when self-class-code expires) */
  async updateMessageContent(
    messageId: string,
    conversationId: string,
    newContent: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('messages')
      .update({ content: newContent })
      .eq('id', messageId)
      .eq('conversation_id', conversationId);

    if (error) return;

    try {
      this.gateway.emitMessageUpdated(conversationId, { id: messageId, content: newContent });
    } catch (e) {
      /* ignore */
    }
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

  async getUnreadCount(userRole: ParticipantType, userId: string): Promise<{ count: number }> {
    const [resA, resB] = await Promise.all([
      this.supabase
        .from('conversations')
        .select('id')
        .eq('participant_a_type', userRole)
        .eq('participant_a_id', userId),
      this.supabase
        .from('conversations')
        .select('id')
        .eq('participant_b_type', userRole)
        .eq('participant_b_id', userId),
    ]);
    const ids = [
      ...(resA.data || []).map((c) => c.id),
      ...(resB.data || []).map((c) => c.id),
    ];
    const convIds = [...new Set(ids)];
    if (convIds.length === 0) return { count: 0 };
    const { count, error } = await this.supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .is('read_at', null)
      .or(`sender_type.neq.${userRole},sender_id.neq.${userId}`);
    if (error) return { count: 0 };
    return { count: count ?? 0 };
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
      .select('id, first_name, last_name, username, profile_image_url, class_id, classes(name, schools(name))');
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
        first_name: s.first_name,
        username: s.username,
        profile_image_url: (s as any).profile_image_url ?? null,
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
      .select('id, first_name, last_name, email, profile_image_url')
      .or(
        `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`,
      )
      .limit(20);
    return (data || []).map((t: any) => ({
      id: t.id,
      name: `${t.first_name} ${t.last_name}`.trim(),
      first_name: t.first_name,
      email: t.email,
      profile_image_url: t.profile_image_url ?? null,
      type: 'tutor' as const,
    }));
  }

  async getStudentContacts(studentId: string): Promise<Array<{ type: ParticipantType; id: string; name: string; first_name?: string; profile_image_url?: string | null; class_name?: string }>> {
    const contacts: Array<{ type: ParticipantType; id: string; name: string; first_name?: string; profile_image_url?: string | null; class_name?: string }> = [];

    // Class Code: always first for all students (self-study class code requests)
    const { data: classCodeAdmin } = await this.supabase
      .from('admins')
      .select('id, email')
      .eq('email', 'classcode@system')
      .maybeSingle();
    if (classCodeAdmin) {
      contacts.push({ type: 'admin', id: classCodeAdmin.id, name: 'Class Code' });
    }

    // Admin: prefer admin@example.com, fallback to first admin (exclude classcode@system)
    let admin: { id: string; email: string } | null = null;
    const { data: superAdmin } = await this.supabase
      .from('admins')
      .select('id, email')
      .eq('email', 'admin@example.com')
      .maybeSingle();
    if (superAdmin) admin = superAdmin;
    else {
      const { data: first } = await this.supabase
        .from('admins')
        .select('id, email')
        .neq('email', 'classcode@system')
        .limit(1);
      if (first?.length) admin = first[0];
    }
    if (admin) {
      contacts.push({ type: 'admin', id: admin.id, name: 'Super Admin ready to chat' });
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
        .select('tutor:tutors(id, first_name, last_name, profile_image_url, display_class_name)')
        .eq('class_id', student.class_id)
        .eq('status', 'active');
      for (const a of assignments || []) {
        const t = (a as any).tutor;
        if (t) {
          const displayName = (t.display_class_name || '').trim();
          const fullName = `${t.first_name} ${t.last_name}`.trim();
          contacts.push({
            type: 'tutor',
            id: t.id,
            name: displayName || fullName,
            first_name: t.first_name,
            profile_image_url: t.profile_image_url ?? null,
            class_name: displayName ? fullName : undefined,
          });
        }
      }
    }
    return contacts;
  }

  async getTutorContacts(tutorId: string): Promise<Array<{ type: ParticipantType; id: string; name: string }>> {
    const { data: superAdmin } = await this.supabase
      .from('admins')
      .select('id, email')
      .eq('email', 'admin@example.com')
      .maybeSingle();
    const admin = superAdmin ?? (await this.supabase.from('admins').select('id, email').limit(1)).data?.[0];
    if (!admin) return [];
    return [{ type: 'admin', id: admin.id, name: 'Super Admin ready to chat' }];
  }

  async getAdminContacts(): Promise<Array<{ type: ParticipantType; id: string; name: string }>> {
    return [];
  }

  /** Contacts for school: Office Admin (admin@example.com) + all assigned tutors (lead & assistant) for all classes */
  async getSchoolContacts(schoolId: string): Promise<Array<{ type: ParticipantType; id: string; name: string; first_name?: string; profile_image_url?: string | null; class_name?: string }>> {
    const contacts: Array<{ type: ParticipantType; id: string; name: string; first_name?: string; profile_image_url?: string | null; class_name?: string }> = [];

    const { data: superAdmin } = await this.supabase
      .from('admins')
      .select('id, email')
      .eq('email', 'admin@example.com')
      .maybeSingle();
    if (superAdmin) {
      contacts.push({
        type: 'admin',
        id: superAdmin.id,
        name: 'Office Admin (admin@example.com)',
      });
    }

    const { data: classRows } = await this.supabase
      .from('classes')
      .select('id')
      .eq('school_id', schoolId);
    const classIds = (classRows || []).map((c: any) => c.id);
    if (classIds.length === 0) return contacts;

    const { data: assignments } = await this.supabase
      .from('tutor_class_assignments')
      .select('tutor_id, class:classes(name)')
      .in('class_id', classIds)
      .eq('status', 'active');
    const tutorIds = [...new Set((assignments || []).map((a: any) => a.tutor_id).filter(Boolean))];
    if (tutorIds.length === 0) return contacts;

    const classesByTutor = new Map<string, string[]>();
    for (const a of assignments || []) {
      const tutorId = (a as any).tutor_id;
      const className = (a as any).class?.name;
      if (tutorId && className) {
        const list = classesByTutor.get(tutorId) || [];
        if (!list.includes(className)) list.push(className);
        classesByTutor.set(tutorId, list);
      }
    }

    const { data: tutors } = await this.supabase
      .from('tutors')
      .select('id, first_name, last_name, profile_image_url')
      .in('id', tutorIds);
    for (const t of tutors || []) {
      const tutorName = `${(t as any).first_name || ''} ${(t as any).last_name || ''}`.trim() || 'Tutor';
      const classNames = classesByTutor.get((t as any).id) || [];
      contacts.push({
        type: 'tutor',
        id: t.id,
        name: tutorName,
        class_name: classNames.length > 0 ? classNames.join(', ') : undefined,
        first_name: (t as any).first_name,
        profile_image_url: (t as any).profile_image_url ?? null,
      });
    }
    return contacts;
  }
}
