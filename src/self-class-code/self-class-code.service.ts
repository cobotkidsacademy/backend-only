import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MessagingService } from '../messaging/messaging.service';
import {
  getNairobiTime,
  getNairobiDayOfWeek,
  createNairobiDateTime,
  formatNairobiTime,
} from '../utils/timezone.util';

const SELF_CODE_VALID_HOURS = 6;
const COOLDOWN_HOURS_AFTER_EXPIRY = 4;

@Injectable()
export class SelfClassCodeService {
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    @Inject(MessagingService) private readonly messagingService: MessagingService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
    // Run expiry check every 5 minutes
    setInterval(() => this.expireOldCodes(), 5 * 60 * 1000);
  }

  private parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours: hours || 0, minutes: minutes || 0 };
  }

  private getClassDateTimeFromBase(baseDate: Date, timeStr: string, addDays = 0): Date {
    const s = (timeStr || '00:00').substring(0, 5);
    const { hours, minutes } = this.parseTime(s);
    return createNairobiDateTime(baseDate, hours, minutes, addDays);
  }

  /** Check if current time is DURING class (teacher gives code then - student cannot) */
  private isDuringClassTime(schedule: any, now: Date): boolean {
    const today = getNairobiDayOfWeek(now).trim().toLowerCase();
    const scheduleDay = (schedule?.day_of_week || '').trim().toLowerCase();
    if (scheduleDay !== today) return false;

    const startStr = (schedule.start_time || '').substring(0, 5);
    const endStr = (schedule.end_time || '').substring(0, 5);
    const startTime = this.getClassDateTimeFromBase(now, startStr);
    const endTime = this.getClassDateTimeFromBase(now, endStr);

    const nowMs = now.getTime();
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();
    return nowMs >= startMs && nowMs <= endMs;
  }

  /** Check if we're in cooldown (4hrs after last code expired) */
  private async isInCooldown(studentId: string, now: Date): Promise<{ inCooldown: boolean; lastExpiredAt?: Date }> {
    const cooldownMs = COOLDOWN_HOURS_AFTER_EXPIRY * 60 * 60 * 1000;

    const { data: lastExpired } = await this.supabase
      .from('self_class_codes')
      .select('valid_until, created_at')
      .eq('student_id', studentId)
      .eq('status', 'expired')
      .order('valid_until', { ascending: false })
      .limit(1)
      .single();

    if (!lastExpired) return { inCooldown: false };

    const expiredAt = new Date(lastExpired.valid_until);
    const elapsed = now.getTime() - expiredAt.getTime();
    return {
      inCooldown: elapsed < cooldownMs,
      lastExpiredAt: expiredAt,
    };
  }

  /** Get Class Code admin ID for student-classcode conversation */
  private async getClassCodeAdminId(): Promise<string> {
    const { data: admin } = await this.supabase
      .from('admins')
      .select('id')
      .eq('email', 'classcode@system')
      .maybeSingle();
    if (admin) return admin.id;
    throw new NotFoundException('Class Code system user not found. Run migration 042.');
  }

  /** Format message content for class code */
  private formatCodeMessage(
    code: string,
    validUntil: Date,
    topicName: string,
    isExpired: boolean,
  ): string {
    if (isExpired) {
      return `🔑 Your self-study class code: ${code} (Expired). You can request a new code in ${COOLDOWN_HOURS_AFTER_EXPIRY} hours.`;
    }
    const untilStr = formatNairobiTime(validUntil, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `🔑 Your self-study class code: ${code} (Valid until ${untilStr}). Topic: ${topicName}. Use for home practice.`;
  }

  async requestClassCode(studentId: string): Promise<{
    code: string;
    topic_id: string;
    topic_name: string;
    valid_from: string;
    valid_until: string;
    message_id: string;
    conversation_id: string;
  }> {
    const now = getNairobiTime();

    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', studentId)
      .single();

    if (studentError || !student?.class_id) {
      throw new NotFoundException('Student or class not found');
    }

    const classId = student.class_id;

    const { data: schedule } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('class_id', classId)
      .eq('status', 'active')
      .single();

    if (!schedule) {
      throw new BadRequestException('Class does not have a schedule.');
    }

    if (this.isDuringClassTime(schedule, now)) {
      throw new BadRequestException(
        'Cannot request self-study code during class time. The teacher will provide the code during class.',
      );
    }

    const { inCooldown, lastExpiredAt } = await this.isInCooldown(studentId, now);
    if (inCooldown && lastExpiredAt) {
      const waitUntil = new Date(lastExpiredAt.getTime() + COOLDOWN_HOURS_AFTER_EXPIRY * 60 * 60 * 1000);
      throw new BadRequestException(
        `Please wait until ${formatNairobiTime(waitUntil, { hour: '2-digit', minute: '2-digit', hour12: false })} to request a new code (4 hour cooldown after expiry).`,
      );
    }

    const topics = await this.getTopicsForClass(classId);
    if (!topics || topics.length === 0) {
      throw new BadRequestException('No topics available for your class.');
    }

    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    const topicId = randomTopic.id;
    const topicName = randomTopic.name || 'General';

    const code = String(Math.floor(100 + Math.random() * 900));
    const validFrom = new Date(now);
    const validUntil = new Date(now.getTime() + SELF_CODE_VALID_HOURS * 60 * 60 * 1000);

    const classCodeAdminId = await this.getClassCodeAdminId();
    const conversationId = await this.messagingService.findOrCreateConversation(
      'student',
      studentId,
      'admin',
      classCodeAdminId,
    );

    const content = this.formatCodeMessage(code, validUntil, topicName, false);
    const msg = await this.messagingService.sendMessage(
      conversationId,
      'admin',
      classCodeAdminId,
      content,
    );

    const { data: selfCode, error: insertError } = await this.supabase
      .from('self_class_codes')
      .insert({
        student_id: studentId,
        class_id: classId,
        schedule_id: schedule.id,
        topic_id: topicId,
        code,
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        message_id: msg.id,
        conversation_id: conversationId,
        status: 'active',
      })
      .select()
      .single();

    if (insertError) {
      throw new BadRequestException(insertError.message);
    }

    return {
      code,
      topic_id: topicId,
      topic_name: topicName,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      message_id: msg.id,
      conversation_id: conversationId,
    };
  }

  private async getTopicsForClass(classId: string): Promise<Array<{ id: string; name: string }>> {
    const { data: assignments } = await this.supabase
      .from('class_course_level_assignments')
      .select('course_level_id')
      .eq('class_id', classId)
      .eq('enrollment_status', 'enrolled');

    if (!assignments || assignments.length === 0) return [];

    const levelIds = assignments.map((a: any) => a.course_level_id);

    const { data: topics } = await this.supabase
      .from('topics')
      .select('id, name')
      .in('level_id', levelIds)
      .eq('status', 'active')
      .order('order_index', { ascending: true });

    return (topics || []).map((t: any) => ({ id: t.id, name: t.name }));
  }

  async validateSelfClassCode(
    studentId: string,
    code: string,
    classId: string,
  ): Promise<{
    valid: boolean;
    message: string;
    topic_id?: string;
    self_class_code_id?: string;
  }> {
    const now = getNairobiTime();

    const { data: selfCode, error } = await this.supabase
      .from('self_class_codes')
      .select('id, code, topic_id, valid_from, valid_until, status, student_id')
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('code', code)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !selfCode) {
      return { valid: false, message: 'Invalid code or code not found' };
    }

    if (selfCode.student_id !== studentId) {
      return { valid: false, message: 'This code does not belong to you' };
    }

    const validUntil = new Date(selfCode.valid_until);
    if (now > validUntil) {
      await this.supabase
        .from('self_class_codes')
        .update({ status: 'expired' })
        .eq('id', selfCode.id);

      await this.updateExpiredMessage(selfCode.id);
      return { valid: false, message: 'Code has expired' };
    }

    await this.supabase.from('self_class_code_usage').insert({
      student_id: studentId,
      self_class_code_id: selfCode.id,
      topic_id: selfCode.topic_id,
    });

    return {
      valid: true,
      message: 'Code is valid',
      topic_id: selfCode.topic_id,
      self_class_code_id: selfCode.id,
    };
  }

  /** Update the chat message when a self-class-code expires */
  async updateExpiredMessage(selfClassCodeId: string): Promise<void> {
    const { data: selfCode } = await this.supabase
      .from('self_class_codes')
      .select('message_id, conversation_id, code')
      .eq('id', selfClassCodeId)
      .single();

    if (!selfCode?.message_id || !selfCode?.conversation_id) return;

    const newContent = this.formatCodeMessage(selfCode.code, new Date(), 'N/A', true);
    await this.messagingService.updateMessageContent(
      selfCode.message_id,
      selfCode.conversation_id,
      newContent,
    );
  }

  /** Cron/scheduled: expire old codes and update messages */
  async expireOldCodes(): Promise<number> {
    const now = new Date().toISOString();

    const { data: expired } = await this.supabase
      .from('self_class_codes')
      .select('id')
      .eq('status', 'active')
      .lt('valid_until', now);

    if (!expired || expired.length === 0) return 0;

    await this.supabase
      .from('self_class_codes')
      .update({ status: 'expired' })
      .in('id', expired.map((e) => e.id));

    for (const e of expired) {
      await this.updateExpiredMessage(e.id);
    }
    return expired.length;
  }

  /** Get eligibility status for student (for UI) */
  async getEligibility(studentId: string): Promise<{
    can_request: boolean;
    reason?: string;
    cooldown_until?: string;
    during_class?: boolean;
    next_class_end?: string;
  }> {
    const now = getNairobiTime();

    const { data: student } = await this.supabase
      .from('students')
      .select('class_id')
      .eq('id', studentId)
      .single();

    if (!student?.class_id) {
      return { can_request: false, reason: 'Student or class not found' };
    }

    const { data: schedule } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('class_id', student.class_id)
      .eq('status', 'active')
      .single();

    if (!schedule) {
      return { can_request: false, reason: 'Class has no schedule' };
    }

    if (this.isDuringClassTime(schedule, now)) {
      const endStr = (schedule.end_time || '').substring(0, 5);
      const endTime = this.getClassDateTimeFromBase(now, endStr);
      return {
        can_request: false,
        reason: 'Cannot request during class time. Teacher will provide the code.',
        during_class: true,
        next_class_end: endTime.toISOString(),
      };
    }

    const { inCooldown, lastExpiredAt } = await this.isInCooldown(studentId, now);
    if (inCooldown && lastExpiredAt) {
      const cooldownUntil = new Date(
        lastExpiredAt.getTime() + COOLDOWN_HOURS_AFTER_EXPIRY * 60 * 60 * 1000,
      );
      return {
        can_request: false,
        reason: `Wait ${COOLDOWN_HOURS_AFTER_EXPIRY} hours after code expiry to request again.`,
        cooldown_until: cooldownUntil.toISOString(),
      };
    }

    return { can_request: true };
  }
}
