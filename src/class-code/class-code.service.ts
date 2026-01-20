import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  GenerateCodeDto,
  ValidateCodeDto,
  ClassCode,
  ClassWithAllocation,
  ClassStatus,
} from './dto/class-code.dto';
import {
  getNairobiTime,
  getNairobiDayOfWeek,
  createNairobiDateTime,
  formatNairobiTime,
  getNairobiDateComponents,
} from '../utils/timezone.util';

@Injectable()
export class ClassCodeService {
  private supabase: SupabaseClient;

  // Time allowances in minutes
  private readonly CODE_VALID_BEFORE_START = 5; // Code valid 5 min before class starts
  private readonly CODE_VALID_AFTER_END = 20; // Code valid 20 min after class ends

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ==================== NETWORK TIME ====================

  /**
   * Get current time in Nairobi timezone
   * This ensures consistent time across all operations using Africa/Nairobi timezone
   */
  private async getNetworkTime(): Promise<Date> {
    // Use Nairobi timezone for all time operations
    return getNairobiTime();
  }

  /**
   * Public method to get server time in Nairobi timezone
   */
  async getServerTimePublic(): Promise<Date> {
    return getNairobiTime();
  }

  /**
   * Debug method to get full class info for troubleshooting
   */
  async debugClassInfo(classId: string): Promise<any> {
    const networkTime = await this.getNetworkTime();
    
    // Get schedule
    const { data: schedule } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('class_id', classId)
      .eq('status', 'active')
      .single();
    
    // Get tutors
    const { data: assignments } = await this.supabase
      .from('tutor_class_assignments')
      .select('id, role')
      .eq('class_id', classId)
      .eq('status', 'active');

    const today = getNairobiDayOfWeek(networkTime).toLowerCase();
    const scheduleDay = schedule ? (schedule.day_of_week || '').trim().toLowerCase() : null;
    
    let startTime = null;
    let endTime = null;
    let withinWindow = false;
    let startTimeStr = null;
    let endTimeStr = null;
    
    if (schedule) {
      startTimeStr = schedule.start_time.substring(0, 5);
      endTimeStr = schedule.end_time.substring(0, 5);
      startTime = this.getClassDateTimeFromBase(networkTime, startTimeStr);
      endTime = this.getClassDateTimeFromBase(networkTime, endTimeStr);
      withinWindow = this.isWithinGenerationWindowSync(schedule, networkTime);
    }
    
    const nairobiComponents = getNairobiDateComponents(networkTime);
    
    return {
      server_time: {
        iso: networkTime.toISOString(),
        nairobi: formatNairobiTime(networkTime, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        day: today,
        hours: nairobiComponents.hours,
        minutes: nairobiComponents.minutes,
        seconds: nairobiComponents.seconds,
        timezone: 'Africa/Nairobi (UTC+3)',
      },
      schedule: schedule ? {
        id: schedule.id,
        day_of_week_raw: schedule.day_of_week,
        day_of_week_trimmed: scheduleDay,
        start_time_raw: schedule.start_time,
        end_time_raw: schedule.end_time,
        start_time_parsed: startTimeStr,
        end_time_parsed: endTimeStr,
        status: schedule.status,
      } : null,
      calculated: {
        class_start_datetime: startTime?.toISOString(),
        class_start_nairobi: startTime ? formatNairobiTime(startTime) : null,
        class_end_datetime: endTime?.toISOString(),
        class_end_nairobi: endTime ? formatNairobiTime(endTime) : null,
        days_match: scheduleDay === today,
        current_time_ms: networkTime.getTime(),
        start_time_ms: startTime?.getTime(),
        end_time_ms: endTime?.getTime(),
        is_after_start: startTime ? networkTime.getTime() >= startTime.getTime() : null,
        is_before_end: endTime ? networkTime.getTime() <= endTime.getTime() : null,
        within_generation_window: withinWindow,
      },
      tutors: {
        count: assignments?.length || 0,
        has_tutor: assignments && assignments.length > 0,
        assignments: assignments,
      },
      can_generate: withinWindow && (assignments && assignments.length > 0),
    };
  }

  /**
   * Get current day of week from network time in Nairobi timezone
   */
  private async getNetworkDayOfWeek(): Promise<string> {
    const networkTime = await this.getNetworkTime();
    return getNairobiDayOfWeek(networkTime);
  }

  // ==================== HELPER METHODS ====================

  private getDayOfWeekFromDate(date: Date): string {
    return getNairobiDayOfWeek(date);
  }

  private getTomorrowDayOfWeekFromDate(date: Date): string {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getNairobiDayOfWeek(tomorrow);
  }

  private parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
  }

  private getClassDateTimeFromBase(baseDate: Date, timeStr: string, addDays: number = 0): Date {
    const { hours, minutes } = this.parseTime(timeStr);
    
    // Use Nairobi timezone utility to create the datetime
    return createNairobiDateTime(baseDate, hours, minutes, addDays);
  }

  private isWithinGenerationWindowSync(schedule: any, networkTime: Date): boolean {
    if (!schedule) return false;
    
    const today = this.getDayOfWeekFromDate(networkTime).trim().toLowerCase();
    const scheduleDay = (schedule.day_of_week || '').trim().toLowerCase();
    
    // Check if today matches the scheduled day
    if (scheduleDay !== today) return false;
    
    // Parse start and end times - handle both HH:MM:SS and HH:MM formats
    const startTimeStr = schedule.start_time.substring(0, 5); // Get HH:MM
    const endTimeStr = schedule.end_time.substring(0, 5); // Get HH:MM
    
    const startTime = this.getClassDateTimeFromBase(networkTime, startTimeStr);
    const endTime = this.getClassDateTimeFromBase(networkTime, endTimeStr);
    
    // Compare using timestamps for precision
    const nowMs = networkTime.getTime();
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();
    
    // Window: from class start time to class end time
    return nowMs >= startMs && nowMs <= endMs;
  }

  private getValidityPeriodFromBase(schedule: any, baseDate: Date): { validFrom: Date; validUntil: Date } {
    const startTime = this.getClassDateTimeFromBase(baseDate, schedule.start_time);
    const endTime = this.getClassDateTimeFromBase(baseDate, schedule.end_time);
    
    // Valid from: 5 min before class starts
    const validFrom = new Date(startTime.getTime() - this.CODE_VALID_BEFORE_START * 60 * 1000);
    // Valid until: 20 min after class ends
    const validUntil = new Date(endTime.getTime() + this.CODE_VALID_AFTER_END * 60 * 1000);
    
    return { validFrom, validUntil };
  }

  private determineClassStatusSync(schedule: any, hasTutor: boolean, networkTime: Date): ClassStatus {
    if (!schedule || !hasTutor) return 'unassigned';
    
    const today = this.getDayOfWeekFromDate(networkTime).trim().toLowerCase();
    const tomorrow = this.getTomorrowDayOfWeekFromDate(networkTime).trim().toLowerCase();
    const scheduleDay = (schedule.day_of_week || '').trim().toLowerCase();
    
    if (scheduleDay === today) {
      const startTimeStr = schedule.start_time.substring(0, 5);
      const endTimeStr = schedule.end_time.substring(0, 5);
      const startTime = this.getClassDateTimeFromBase(networkTime, startTimeStr);
      const endTime = this.getClassDateTimeFromBase(networkTime, endTimeStr);
      
      if (networkTime < startTime) return 'upcoming';
      if (networkTime >= startTime && networkTime <= endTime) return 'today';
      return 'past';
    }
    
    if (scheduleDay === tomorrow) return 'tomorrow';
    
    return 'assigned';
  }

  private getNextClassDatetimeSync(schedule: any, networkTime: Date): string | null {
    if (!schedule) return null;
    
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayIndex = networkTime.getDay();
    const scheduleDay = (schedule.day_of_week || '').trim().toLowerCase();
    const scheduleIndex = days.indexOf(scheduleDay);
    
    if (scheduleIndex === -1) {
      console.log(`Invalid schedule day: "${scheduleDay}"`);
      return null;
    }
    
    // Always show next week's class (7 days from the scheduled day)
    let daysUntil = scheduleIndex - todayIndex;
    if (daysUntil <= 0) daysUntil += 7; // Always add 7 days if same day or past
    
    // If today is the class day but class hasn't ended yet, still show next week
    if (scheduleIndex === todayIndex) {
      // Next class is always in 7 days
      daysUntil = 7;
    }
    
    const nextDate = new Date(networkTime);
    nextDate.setDate(nextDate.getDate() + daysUntil);
    const startTimeStr = schedule.start_time.substring(0, 5);
    const { hours, minutes } = this.parseTime(startTimeStr);
    nextDate.setHours(hours, minutes, 0, 0);
    
    return nextDate.toISOString();
  }

  private getTimeWindowSync(schedule: any, networkTime: Date): { starts_at: string | null; ends_at: string | null; is_within_window: boolean } {
    if (!schedule) return { starts_at: null, ends_at: null, is_within_window: false };
    
    const today = this.getDayOfWeekFromDate(networkTime).trim().toLowerCase();
    const scheduleDay = (schedule.day_of_week || '').trim().toLowerCase();
    
    if (scheduleDay !== today) {
      return { starts_at: null, ends_at: null, is_within_window: false };
    }
    
    // Window is from class start to class end
    const startTimeStr = schedule.start_time.substring(0, 5);
    const endTimeStr = schedule.end_time.substring(0, 5);
    const startTime = this.getClassDateTimeFromBase(networkTime, startTimeStr);
    const endTime = this.getClassDateTimeFromBase(networkTime, endTimeStr);
    
    return {
      starts_at: startTime.toISOString(),
      ends_at: endTime.toISOString(),
      is_within_window: this.isWithinGenerationWindowSync(schedule, networkTime),
    };
  }

  // ==================== MAIN METHODS ====================

  async generateCode(dto: GenerateCodeDto): Promise<ClassCode> {
    // Get server time
    const serverTime = new Date();
    
    // Get class with schedule and tutors
    const { data: classData, error: classError } = await this.supabase
      .from('classes')
      .select(`
        id, name, level,
        school:schools(id, name, code)
      `)
      .eq('id', dto.class_id)
      .single();

    if (classError || !classData) {
      throw new NotFoundException('Class not found');
    }

    // Get schedule
    const { data: schedule } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('class_id', dto.class_id)
      .eq('status', 'active')
      .single();

    if (!schedule) {
      throw new BadRequestException('Class does not have a schedule. Please assign a schedule first.');
    }

    // Get tutors
    const { data: assignments } = await this.supabase
      .from('tutor_class_assignments')
      .select('id, role')
      .eq('class_id', dto.class_id)
      .eq('status', 'active');

    const hasTutor = assignments && assignments.length > 0;
    if (!hasTutor) {
      throw new BadRequestException('Class does not have any tutors assigned. Please assign a tutor first.');
    }

    // Validate topic belongs to an enrolled course level for this class
    const { data: topic, error: topicError } = await this.supabase
      .from('topics')
      .select('id, name, level_id')
      .eq('id', dto.topic_id)
      .single();

    if (topicError || !topic) {
      throw new NotFoundException('Topic not found');
    }

    if (!topic.level_id) {
      throw new NotFoundException('Topic does not have an associated course level');
    }

    // Check if the topic's course level is enrolled for this class
    const { data: assignment, error: assignmentError } = await this.supabase
      .from('class_course_level_assignments')
      .select('id, enrollment_status')
      .eq('class_id', dto.class_id)
      .eq('course_level_id', topic.level_id)
      .eq('enrollment_status', 'enrolled')
      .single();

    if (assignmentError || !assignment) {
      throw new BadRequestException('Topic must belong to a course level that is enrolled for this class');
    }

    // Check if within generation window (during class time)
    const withinWindow = this.isWithinGenerationWindowSync(schedule, serverTime);
    
    if (!withinWindow) {
      const nextClass = this.getNextClassDatetimeSync(schedule, serverTime);
      const today = this.getDayOfWeekFromDate(serverTime).trim().toLowerCase();
      const scheduleDay = (schedule.day_of_week || '').trim().toLowerCase();
      
      // Calculate times for error message
      const startTimeStr = schedule.start_time.substring(0, 5);
      const endTimeStr = schedule.end_time.substring(0, 5);
      const serverTimeStr = `${String(serverTime.getHours()).padStart(2, '0')}:${String(serverTime.getMinutes()).padStart(2, '0')}`;
      
      let message = `Cannot generate code outside class time. `;
      if (scheduleDay === today) {
        message += `Class runs from ${startTimeStr} to ${endTimeStr}. `;
        message += `Current server time: ${serverTimeStr}. `;
      } else {
        message += `Class is scheduled for ${schedule.day_of_week} (today is ${today}). `;
      }
      message += `Next class: ${nextClass ? new Date(nextClass).toLocaleString() : 'Unknown'}`;
      
      throw new BadRequestException(message);
    }

    // Expire any existing active codes for this class
    await this.supabase
      .from('class_codes')
      .update({ status: 'expired' })
      .eq('class_id', dto.class_id)
      .eq('status', 'active');

    // Generate unique 3-digit code
    const { data: codeResult, error: codeError } = await this.supabase
      .rpc('generate_unique_class_code', { p_class_id: dto.class_id });

    let code: string;
    if (codeError || !codeResult) {
      // Fallback: generate code manually
      code = String(Math.floor(100 + Math.random() * 900));
    } else {
      code = codeResult;
    }

    // Calculate validity period using server time
    const { validFrom, validUntil } = this.getValidityPeriodFromBase(schedule, serverTime);

    // Create new code
    const { data: newCode, error: insertError } = await this.supabase
      .from('class_codes')
      .insert({
        class_id: dto.class_id,
        schedule_id: schedule.id,
        topic_id: dto.topic_id,
        code,
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        generated_by_tutor_id: dto.generated_by_tutor_id || null,
        status: 'active',
      })
      .select(`
        *,
        generated_by:tutors(id, first_name, middle_name, last_name)
      `)
      .single();

    if (insertError) {
      throw new BadRequestException(insertError.message);
    }

    return newCode;
  }

  async getTopicsForEnrolledLevels(classId: string) {
    // Get enrolled course levels for this class
    const { data: assignments, error: assignmentsError } = await this.supabase
      .from('class_course_level_assignments')
      .select('course_level_id')
      .eq('class_id', classId)
      .eq('enrollment_status', 'enrolled');

    if (assignmentsError || !assignments || assignments.length === 0) {
      return [];
    }

    const courseLevelIds = assignments.map((a: any) => a.course_level_id);

    // Get all topics for these course levels
    const { data: topics, error: topicsError } = await this.supabase
      .from('topics')
      .select(`
        id,
        name,
        description,
        order_index,
        level_id,
        course_level:course_levels(
          id,
          name,
          course_id,
          course:courses(id, name, code)
        )
      `)
      .in('level_id', courseLevelIds)
      .eq('status', 'active')
      .order('order_index', { ascending: true });

    if (topicsError) {
      return [];
    }

    return topics || [];
  }

  async validateCode(dto: ValidateCodeDto): Promise<{ valid: boolean; message: string; class_code?: ClassCode; server_time?: string; topic_id?: string }> {
    // Get network time
    const networkTime = await this.getNetworkTime();

    const { data: classCode, error } = await this.supabase
      .from('class_codes')
      .select(`
        *,
        generated_by:tutors(id, first_name, middle_name, last_name),
        topic:topics(
          id,
          name,
          level_id,
          course_level:course_levels(
            id,
            course_id,
            course:courses(id, name, code)
          )
        )
      `)
      .eq('class_id', dto.class_id)
      .eq('code', dto.code)
      .eq('status', 'active')
      .single();

    if (error || !classCode) {
      return { valid: false, message: 'Invalid code or code not found', server_time: networkTime.toISOString() };
    }

    const validFrom = new Date(classCode.valid_from);
    const validUntil = new Date(classCode.valid_until);

    if (networkTime < validFrom) {
      return { valid: false, message: 'Code is not yet valid', class_code: classCode, server_time: networkTime.toISOString() };
    }

    if (networkTime > validUntil) {
      // Mark as expired
      await this.supabase
        .from('class_codes')
        .update({ status: 'expired' })
        .eq('id', classCode.id);
      return { valid: false, message: 'Code has expired', class_code: classCode, server_time: networkTime.toISOString() };
    }

    return { 
      valid: true, 
      message: 'Code is valid', 
      class_code: classCode, 
      server_time: networkTime.toISOString(),
      topic_id: classCode.topic_id || null,
    };
  }

  async getActiveCodeForClass(classId: string): Promise<ClassCode | null> {
    // Get network time
    const networkTime = await this.getNetworkTime();

    const { data, error } = await this.supabase
      .from('class_codes')
      .select(`
        *,
        generated_by:tutors(id, first_name, middle_name, last_name)
      `)
      .eq('class_id', classId)
      .eq('status', 'active')
      .gt('valid_until', networkTime.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data;
  }

  async getClassesWithAllocation(filters?: {
    school_id?: string;
    level?: string;
    status?: ClassStatus;
  }): Promise<ClassWithAllocation[] & { server_time?: string }> {
    // Get network time first
    const networkTime = await this.getNetworkTime();
    
    // Get all active classes with schools
    let query = this.supabase
      .from('classes')
      .select(`
        id, name, level, description, status,
        school:schools(id, name, code)
      `)
      .eq('status', 'active');

    if (filters?.school_id) {
      query = query.eq('school_id', filters.school_id);
    }
    if (filters?.level) {
      query = query.eq('level', filters.level);
    }

    const { data: classes, error: classError } = await query.order('name');

    if (classError) {
      throw new BadRequestException(classError.message);
    }

    // Get all schedules
    const { data: schedules } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('status', 'active');

    // Get all tutor assignments
    const { data: assignments } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        *,
        tutor:tutors(id, first_name, middle_name, last_name, email)
      `)
      .eq('status', 'active');

    // Get student counts
    const { data: studentCounts } = await this.supabase
      .from('students')
      .select('class_id')
      .eq('status', 'active');

    // Get active codes using network time
    const { data: activeCodes } = await this.supabase
      .from('class_codes')
      .select(`
        *,
        generated_by:tutors(id, first_name, middle_name, last_name)
      `)
      .eq('status', 'active')
      .gt('valid_until', networkTime.toISOString());

    // Build the result using network time for all calculations
    const result: ClassWithAllocation[] = (classes || []).map(cls => {
      const schedule = schedules?.find(s => s.class_id === cls.id) || null;
      const classAssignments = assignments?.filter(a => a.class_id === cls.id) || [];
      const leadTutor = classAssignments.find(a => a.role === 'lead')?.tutor || null;
      const assistantTutor = classAssignments.find(a => a.role === 'assistant')?.tutor || null;
      const studentCount = studentCounts?.filter(s => s.class_id === cls.id).length || 0;
      const currentCode = activeCodes?.find(c => c.class_id === cls.id) || null;
      
      const hasTutor = leadTutor !== null || assistantTutor !== null;
      const classStatus = this.determineClassStatusSync(schedule, hasTutor, networkTime);
      const canGenerateCode = hasTutor && schedule && this.isWithinGenerationWindowSync(schedule, networkTime);
      const nextClassDatetime = this.getNextClassDatetimeSync(schedule, networkTime);
      const timeWindow = this.getTimeWindowSync(schedule, networkTime);

      return {
        id: cls.id,
        name: cls.name,
        level: cls.level,
        description: cls.description,
        status: cls.status,
        school: cls.school as any,
        schedule,
        lead_tutor: leadTutor,
        assistant_tutor: assistantTutor,
        student_count: studentCount,
        current_code: currentCode,
        class_status: classStatus,
        can_generate_code: canGenerateCode,
        next_class_datetime: nextClassDatetime,
        time_window: timeWindow,
      };
    });

    // Filter by status if provided
    if (filters?.status) {
      return result.filter(c => c.class_status === filters.status);
    }

    return result;
  }

  async getTutorClassesWithAllocation(tutorId: string): Promise<ClassWithAllocation[]> {
    // Get network time first
    const networkTime = await this.getNetworkTime();
    
    // Get all classes assigned to this tutor
    const { data: assignments, error: assignmentError } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        class_id,
        role,
        class:classes(
          id, name, level, description, status,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (assignmentError) {
      throw new BadRequestException(assignmentError.message);
    }

    if (!assignments || assignments.length === 0) {
      return [];
    }

    // Extract class IDs
    const classIds = assignments.map((a: any) => {
      const classData = Array.isArray(a.class) ? a.class[0] : a.class;
      return classData.id;
    });

    // Get all schedules for these classes
    const { data: schedules } = await this.supabase
      .from('class_schedules')
      .select('*')
      .in('class_id', classIds)
      .eq('status', 'active');

    // Get student counts
    const { data: studentCounts } = await this.supabase
      .from('students')
      .select('class_id')
      .in('class_id', classIds)
      .eq('status', 'active');

    // Get active codes using network time
    const { data: activeCodes } = await this.supabase
      .from('class_codes')
      .select(`
        *,
        generated_by:tutors(id, first_name, middle_name, last_name),
        topic:topics(
          id,
          name,
          course_level:course_levels(
            id,
            name,
            course:courses(id, name, code)
          )
        )
      `)
      .in('class_id', classIds)
      .eq('status', 'active')
      .gt('valid_until', networkTime.toISOString());

    // Get tutor information
    const { data: tutorInfo } = await this.supabase
      .from('tutors')
      .select('id, first_name, middle_name, last_name, email')
      .eq('id', tutorId)
      .single();

    // Build the result
    const result: ClassWithAllocation[] = assignments.map((assignment: any) => {
      const classData = Array.isArray(assignment.class) ? assignment.class[0] : assignment.class;
      const schedule = schedules?.find((s: any) => s.class_id === classData.id) || null;
      const studentCount = studentCounts?.filter((s: any) => s.class_id === classData.id).length || 0;
      const currentCode = activeCodes?.find((c: any) => c.class_id === classData.id) || null;
      
      const hasTutor = true; // Tutor is assigned
      const classStatus = this.determineClassStatusSync(schedule, hasTutor, networkTime);
      const canGenerateCode = hasTutor && schedule && this.isWithinGenerationWindowSync(schedule, networkTime);
      const nextClassDatetime = this.getNextClassDatetimeSync(schedule, networkTime);
      const timeWindow = this.getTimeWindowSync(schedule, networkTime);

      return {
        id: classData.id,
        name: classData.name,
        level: classData.level,
        description: classData.description,
        status: classData.status,
        school: classData.school as any,
        schedule,
        lead_tutor: assignment.role === 'lead' && tutorInfo ? {
          id: tutorInfo.id,
          first_name: tutorInfo.first_name,
          middle_name: tutorInfo.middle_name,
          last_name: tutorInfo.last_name,
          email: tutorInfo.email,
        } : null,
        assistant_tutor: assignment.role === 'assistant' && tutorInfo ? {
          id: tutorInfo.id,
          first_name: tutorInfo.first_name,
          middle_name: tutorInfo.middle_name,
          last_name: tutorInfo.last_name,
          email: tutorInfo.email,
        } : null,
        student_count: studentCount,
        current_code: currentCode ? {
          code: currentCode.code,
          valid_from: currentCode.valid_from,
          valid_until: currentCode.valid_until,
          generated_at: currentCode.generated_at,
          topic_id: currentCode.topic_id || null,
          topic: currentCode.topic ? (() => {
            const topic = Array.isArray(currentCode.topic) ? currentCode.topic[0] : currentCode.topic;
            if (!topic) return null;
            
            const courseLevel = Array.isArray(topic.course_level) ? topic.course_level[0] : topic.course_level;
            const course = courseLevel?.course 
              ? (Array.isArray(courseLevel.course) ? courseLevel.course[0] : courseLevel.course)
              : null;
            
            return {
              id: topic.id,
              name: topic.name,
              course_level: courseLevel ? {
                name: courseLevel.name,
                course: course ? { name: course.name } : null,
              } : null,
            };
          })() : null,
        } : null,
        class_status: classStatus,
        can_generate_code: canGenerateCode,
        next_class_datetime: nextClassDatetime,
        time_window: timeWindow,
      };
    });

    return result;
  }

  async getCodeHistory(classId: string): Promise<ClassCode[]> {
    const { data, error } = await this.supabase
      .from('class_codes')
      .select(`
        *,
        generated_by:tutors(id, first_name, middle_name, last_name)
      `)
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }
}

