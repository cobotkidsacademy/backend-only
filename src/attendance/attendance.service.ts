import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AttendanceRecord,
  AttendanceRegister,
  AttendanceRegisterEntry,
  GetAttendanceDto,
  MarkAttendanceDto,
  AutoMarkAttendanceDto,
} from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  /**
   * Automatically mark attendance based on student login time
   * Marks attendance whenever a student logs in, using schedules to determine timing if available
   */
  async autoMarkAttendance(dto: AutoMarkAttendanceDto): Promise<AttendanceRecord | null> {
    const { student_id, login_timestamp } = dto;
    const loginTime = new Date(login_timestamp);
    const attendanceDate = this.formatDate(loginTime);

    this.logger.debug(`Attempting to auto-mark attendance for student ${student_id} on ${attendanceDate}`);

    // Get student's class
    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', student_id)
      .single();

    if (studentError || !student) {
      this.logger.warn(`Student not found: ${student_id}`, studentError);
      return null;
    }

    if (!student.class_id) {
      this.logger.warn(`Student ${student_id} has no class_id assigned`);
      return null;
    }

    // Check if attendance already marked for this exact date
    const { data: existingToday } = await this.supabase
      .from('attendance_records')
      .select('id, attendance_date, class_schedule_id, created_at, status')
      .eq('student_id', student_id)
      .eq('class_id', student.class_id)
      .eq('attendance_date', attendanceDate)
      .maybeSingle();

    if (existingToday) {
      // Already marked for today, update login timestamp if needed
      this.logger.debug(`Attendance already marked for student ${student_id} on ${attendanceDate}, updating login timestamp`);
      await this.supabase
        .from('attendance_records')
        .update({ login_timestamp: login_timestamp })
        .eq('id', existingToday.id);
      return existingToday as AttendanceRecord;
    }

    // Check if attendance was marked within the last 7 days for this class
    const sevenDaysAgo = new Date(loginTime);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = this.formatDate(sevenDaysAgo);

    const { data: recentAttendance } = await this.supabase
      .from('attendance_records')
      .select('id, attendance_date, class_schedule_id, created_at')
      .eq('student_id', student_id)
      .eq('class_id', student.class_id)
      .gte('attendance_date', sevenDaysAgoStr)
      .lt('attendance_date', attendanceDate)
      .order('attendance_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentAttendance) {
      const lastAttendanceDate = new Date(recentAttendance.attendance_date);
      const daysSinceLastAttendance = Math.floor(
        (loginTime.getTime() - lastAttendanceDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastAttendance < 7) {
        // Less than 7 days since last attendance - don't mark again
        this.logger.debug(
          `Attendance not marked: Only ${daysSinceLastAttendance} days since last attendance (requires 7 days)`
        );
        return null;
      }
    }

    // Get class schedules to determine timing and status
    const { data: schedules, error: scheduleError } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('class_id', student.class_id)
      .eq('status', 'active');

    let matchingSchedule = null;
    let attendanceStatus: 'present' | 'late' = 'present';
    let isWithinScheduleWindow = false;

    if (!scheduleError && schedules && schedules.length > 0) {
      const dayOfWeek = this.getDayOfWeek(loginTime);
      
      // Find matching schedule for today
      for (const schedule of schedules) {
        if (schedule.day_of_week.toLowerCase() === dayOfWeek.toLowerCase()) {
          matchingSchedule = schedule;
          
          // Parse class start and end times
          const [startHours, startMinutes] = schedule.start_time.split(':').map(Number);
          const [endHours, endMinutes] = schedule.end_time.split(':').map(Number);
          
          // Calculate schedule time window: 40 minutes before start to 1 hour after end
          const scheduleStartWindow = new Date(loginTime);
          scheduleStartWindow.setHours(startHours, startMinutes - 40, 0, 0); // 40 min before

          const scheduleEndWindow = new Date(loginTime);
          scheduleEndWindow.setHours(endHours, endMinutes + 60, 0, 0); // 1 hour after

          // Check if login time is within the schedule window
          isWithinScheduleWindow = loginTime >= scheduleStartWindow && loginTime <= scheduleEndWindow;

          if (isWithinScheduleWindow) {
            // Parse class start time for late check
            const classStartTime = new Date(loginTime);
            classStartTime.setHours(startHours, startMinutes, 0, 0);

            // Check if login is after class start time (mark as late)
            if (loginTime > classStartTime) {
              const minutesLate = Math.floor((loginTime.getTime() - classStartTime.getTime()) / (1000 * 60));
              if (minutesLate > 15) { // More than 15 minutes late
                attendanceStatus = 'late';
                this.logger.debug(`Student ${student_id} logged in ${minutesLate} minutes after class start time`);
              }
            }
          } else {
            this.logger.debug(
              `Student ${student_id} login time ${loginTime.toISOString()} is outside schedule window ` +
              `(${scheduleStartWindow.toISOString()} to ${scheduleEndWindow.toISOString()})`
            );
          }
          break;
        }
      }

      if (!matchingSchedule) {
        this.logger.debug(`No schedule found for ${dayOfWeek} for class ${student.class_id}, marking as present anyway`);
        isWithinScheduleWindow = true; // Allow marking if no schedule found
      } else if (!isWithinScheduleWindow) {
        // Schedule exists but login time is outside window - don't mark attendance
        this.logger.debug(
          `Attendance not marked: Student ${student_id} login time is outside schedule window for ${dayOfWeek}`
        );
        return null;
      }
    } else {
      this.logger.debug(`No active schedules found for class ${student.class_id}, marking attendance anyway`);
      isWithinScheduleWindow = true; // Allow marking if no schedule found
    }

    // Get course level for this class (enrolled status)
    const { data: courseLevel } = await this.supabase
      .from('class_course_level_assignments')
      .select('course_level_id')
      .eq('class_id', student.class_id)
      .eq('enrollment_status', 'enrolled')
      .limit(1)
      .maybeSingle();

    // Mark attendance (7 days have passed or this is first attendance)
    const { data: attendance, error } = await this.supabase
      .from('attendance_records')
      .insert({
        student_id: student_id,
        class_id: student.class_id,
        course_level_id: courseLevel?.course_level_id || null,
        attendance_date: attendanceDate,
        status: attendanceStatus,
        login_timestamp: login_timestamp,
        class_schedule_id: matchingSchedule?.id || null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Error marking attendance: ${error.message}`, error);
      return null;
    }

    this.logger.debug(`Auto-marked attendance for student ${student_id} on ${attendanceDate} with status: ${attendanceStatus}`);
    return attendance as AttendanceRecord;
  }

  /**
   * Mark a student as present for a session (e.g. team-up or logged-in host).
   * Always creates or updates today's attendance record; no 7-day or schedule checks.
   */
  async markPresentForSession(student_id: string, login_timestamp: string): Promise<AttendanceRecord | null> {
    const loginTime = new Date(login_timestamp);
    const attendanceDate = this.formatDate(loginTime);

    const { data: student, error: studentError } = await this.supabase
      .from('students')
      .select('id, class_id')
      .eq('id', student_id)
      .single();

    if (studentError || !student?.class_id) {
      this.logger.warn(`Student not found or no class: ${student_id}`, studentError);
      return null;
    }

    const { data: courseLevel } = await this.supabase
      .from('class_course_level_assignments')
      .select('course_level_id')
      .eq('class_id', student.class_id)
      .eq('enrollment_status', 'enrolled')
      .limit(1)
      .maybeSingle();

    const courseLevelId = courseLevel?.course_level_id || null;

    let existingQuery = this.supabase
      .from('attendance_records')
      .select('id')
      .eq('student_id', student_id)
      .eq('class_id', student.class_id)
      .eq('attendance_date', attendanceDate);
    if (courseLevelId == null) {
      existingQuery = existingQuery.is('course_level_id', null);
    } else {
      existingQuery = existingQuery.eq('course_level_id', courseLevelId);
    }
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      await this.supabase
        .from('attendance_records')
        .update({ login_timestamp, status: 'present', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      this.logger.log(`Updated session attendance for student ${student_id} on ${attendanceDate}`);
      const { data: updated } = await this.supabase
        .from('attendance_records')
        .select()
        .eq('id', existing.id)
        .single();
      return updated as AttendanceRecord;
    }

    const { data: inserted, error } = await this.supabase
      .from('attendance_records')
      .insert({
        student_id: student_id,
        class_id: student.class_id,
        course_level_id: courseLevelId,
        attendance_date: attendanceDate,
        status: 'present',
        login_timestamp: login_timestamp,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Error marking session attendance: ${error.message}`, error);
      return null;
    }
    this.logger.log(`✅ Marked session attendance for student ${student_id} on ${attendanceDate}`);
    return inserted as AttendanceRecord;
  }

  /**
   * Manually mark attendance
   */
  async markAttendance(dto: MarkAttendanceDto, markedBy?: string): Promise<AttendanceRecord> {
    const { data: existing } = await this.supabase
      .from('attendance_records')
      .select('id')
      .eq('student_id', dto.student_id)
      .eq('class_id', dto.class_id)
      .eq('attendance_date', dto.attendance_date)
      .eq('course_level_id', dto.course_level_id || null)
      .maybeSingle();

    const attendanceData: any = {
      student_id: dto.student_id,
      class_id: dto.class_id,
      course_level_id: dto.course_level_id || null,
      attendance_date: dto.attendance_date,
      status: dto.status,
      notes: dto.notes || null,
      marked_by: markedBy || null,
    };

    if (existing) {
      // Update existing record
      const { data, error } = await this.supabase
        .from('attendance_records')
        .update(attendanceData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new NotFoundException(`Failed to update attendance: ${error.message}`);
      }
      return data as AttendanceRecord;
    } else {
      // Create new record
      const { data, error } = await this.supabase
        .from('attendance_records')
        .insert(attendanceData)
        .select()
        .single();

      if (error) {
        throw new NotFoundException(`Failed to create attendance: ${error.message}`);
      }
      return data as AttendanceRecord;
    }
  }

  /**
   * Get attendance register (Kenyan government format)
   * Shows only dates where students logged in during the scheduled class time
   * Works even if schedule was rescheduled - checks login time against schedule
   */
  async getAttendanceRegister(dto: GetAttendanceDto): Promise<AttendanceRegister> {
    // Get class information
    const { data: classData, error: classError } = await this.supabase
      .from('classes')
      .select(`
        id,
        name,
        school_id,
        school:schools(id, name)
      `)
      .eq('id', dto.class_id)
      .single();

    if (classError || !classData) {
      throw new NotFoundException('Class not found');
    }

    // Get current active class schedule
    const { data: schedules, error: scheduleError } = await this.supabase
      .from('class_schedules')
      .select('*')
      .eq('class_id', dto.class_id)
      .eq('status', 'active')
      .limit(1);

    if (scheduleError || !schedules || schedules.length === 0) {
      throw new NotFoundException('No active schedule found for this class');
    }

    const classSchedule = schedules[0];
    const dayOfWeek = classSchedule.day_of_week.toLowerCase();

    this.logger.log(
      `Generating attendance register for class ${dto.class_id} - showing only dates where students logged in during schedule time`
    );

    // Fetch ALL attendance records from database for this class and date range
    // Show all attendance that exists in the database, regardless of schedule time window
    // The schedule is only used to determine which dates to show as columns
    let attendanceQuery = this.supabase
      .from('attendance_records')
      .select('attendance_date, login_timestamp, status')
      .eq('class_id', dto.class_id)
      .gte('attendance_date', dto.start_date);

    if (dto.end_date) {
      attendanceQuery = attendanceQuery.lte('attendance_date', dto.end_date);
    }

    if (dto.course_level_id) {
      attendanceQuery = attendanceQuery.eq('course_level_id', dto.course_level_id);
    }

    if (dto.student_id) {
      attendanceQuery = attendanceQuery.eq('student_id', dto.student_id);
    }

    const { data: allAttendanceRecords } = await attendanceQuery;

    // Get unique dates from ALL attendance records in the database
    // Don't filter by schedule time window - show all dates where attendance exists
    // Sort dates chronologically
    const classDates = Array.from(
      new Set((allAttendanceRecords || []).map((r) => r.attendance_date))
    ).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime();
    });

    this.logger.log(
      `Found ${classDates.length} dates with attendance records in database: ${classDates.join(', ')}`
    );

    // Auto-mark absent for class dates where time window has elapsed and students didn't log in
    await this.autoMarkAbsentForElapsedClassTimes(
      dto.class_id,
      classSchedule,
      dto.start_date,
      dto.end_date,
      dto.course_level_id
    );

    // Re-fetch attendance records after auto-marking absent (to include newly marked absent records)
    let updatedAttendanceQuery = this.supabase
      .from('attendance_records')
      .select('attendance_date, login_timestamp, status')
      .eq('class_id', dto.class_id)
      .gte('attendance_date', dto.start_date);

    if (dto.end_date) {
      updatedAttendanceQuery = updatedAttendanceQuery.lte('attendance_date', dto.end_date);
    }

    if (dto.course_level_id) {
      updatedAttendanceQuery = updatedAttendanceQuery.eq('course_level_id', dto.course_level_id);
    }

    if (dto.student_id) {
      updatedAttendanceQuery = updatedAttendanceQuery.eq('student_id', dto.student_id);
    }

    const { data: updatedAttendanceRecords } = await updatedAttendanceQuery;

    // Update classDates to include any new dates from auto-marked absent records
    const updatedClassDates = Array.from(
      new Set((updatedAttendanceRecords || []).map((r) => r.attendance_date))
    ).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime();
    });

    // Use updated dates if we have new ones, otherwise use original
    const finalClassDates = updatedClassDates.length > classDates.length 
      ? updatedClassDates 
      : classDates;

    // Calculate end date (last attendance date, or use start_date if no dates)
    const endDate = finalClassDates.length > 0 ? finalClassDates[finalClassDates.length - 1] : dto.start_date;

    if (finalClassDates.length === 0) {
      this.logger.log(`No attendance records found with matching login times for class ${dto.class_id} - showing all students with empty dates`);
    } else {
      this.logger.log(`Found ${finalClassDates.length} dates with attendance records: ${finalClassDates.join(', ')}`);
    }

    // Get tutors
    const { data: tutors } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        role,
        tutor:tutors(id, first_name, middle_name, last_name)
      `)
      .eq('class_id', dto.class_id)
      .eq('status', 'active');

    // Handle tutor data - Supabase relations can return arrays
    const leadTutorAssignment = tutors?.find((t: any) => t.role === 'lead');
    const assistantTutorAssignment = tutors?.find((t: any) => t.role === 'assistant');
    
    const leadTutor = leadTutorAssignment?.tutor 
      ? (Array.isArray(leadTutorAssignment.tutor) ? leadTutorAssignment.tutor[0] : leadTutorAssignment.tutor)
      : null;
    const assistantTutor = assistantTutorAssignment?.tutor
      ? (Array.isArray(assistantTutorAssignment.tutor) ? assistantTutorAssignment.tutor[0] : assistantTutorAssignment.tutor)
      : null;

    // Get course level info if provided
    let courseLevelInfo = null;
    if (dto.course_level_id) {
      const { data: courseLevel } = await this.supabase
        .from('course_levels')
        .select(`
          id,
          name,
          level_number,
          course:courses(id, name)
        `)
        .eq('id', dto.course_level_id)
        .single();

      if (courseLevel) {
        const course = Array.isArray(courseLevel.course) ? courseLevel.course[0] : courseLevel.course;
        courseLevelInfo = {
          id: courseLevel.id,
          name: courseLevel.name,
          course_name: course?.name,
        };
      }
    }

    // Get all students in class (with enrolled course level if specified)
    let studentsQuery = this.supabase
      .from('students')
      .select('id, first_name, last_name, username')
      .eq('class_id', dto.class_id)
      .eq('status', 'active')
      .order('first_name');

    if (dto.student_id) {
      studentsQuery = studentsQuery.eq('id', dto.student_id);
    }

    const { data: students, error: studentsError } = await studentsQuery;

    if (studentsError || !students || students.length === 0) {
      // Return empty register if no students
      return {
        class_id: dto.class_id,
        class_name: classData.name,
        course_level_id: dto.course_level_id,
        course_level_name: courseLevelInfo?.name,
        course_name: courseLevelInfo?.course_name,
        school_id: classData.school_id,
        school_name: (classData.school as any)?.name || '',
        lead_tutor: leadTutor && !Array.isArray(leadTutor)
          ? {
              id: leadTutor.id,
              name: `${leadTutor.first_name} ${leadTutor.middle_name || ''} ${leadTutor.last_name}`.trim(),
            }
          : undefined,
        assistant_tutor: assistantTutor && !Array.isArray(assistantTutor)
          ? {
              id: assistantTutor.id,
              name: `${assistantTutor.first_name} ${assistantTutor.middle_name || ''} ${assistantTutor.last_name}`.trim(),
            }
          : undefined,
        date_range: {
          start_date: dto.start_date,
          end_date: endDate,
        },
        dates: finalClassDates,
        entries: [],
        summary: {
          total_students: 0,
          total_days: finalClassDates.length,
          attendance_rate: 0,
        },
      };
    }

    // Get ALL attendance records for the class dates (not just filtered ones)
    // This includes manually marked attendance and all statuses
    let attendanceForDatesQuery = this.supabase
      .from('attendance_records')
      .select('*')
      .eq('class_id', dto.class_id);

    // Only filter by dates if we have dates
    if (finalClassDates.length > 0) {
      attendanceForDatesQuery = attendanceForDatesQuery.in('attendance_date', finalClassDates);
    } else {
      // If no dates, return empty array
      attendanceForDatesQuery = attendanceForDatesQuery.eq('attendance_date', '1900-01-01'); // Will return nothing
    }

    if (dto.course_level_id) {
      attendanceForDatesQuery = attendanceForDatesQuery.eq('course_level_id', dto.course_level_id);
    }

    if (dto.student_id) {
      attendanceForDatesQuery = attendanceForDatesQuery.eq('student_id', dto.student_id);
    }

    const { data: attendanceForDates } = await attendanceForDatesQuery;

    // Build register entries
    const entries: AttendanceRegisterEntry[] = students.map((student) => {
      const attendance: { [date: string]: 'present' | 'absent' | 'late' | 'excused' | null } = {};

      // Initialize all class dates as null (not marked)
      finalClassDates.forEach((date) => {
        attendance[date] = null;
      });

      // Fill in attendance records for this student
      // Use all attendance records (not just filtered ones) so we show all statuses
      (attendanceForDates || [])
        .filter((record) => record.student_id === student.id)
        .forEach((record) => {
          // Only show attendance for dates that are in our finalClassDates
          if (finalClassDates.includes(record.attendance_date)) {
            attendance[record.attendance_date] = record.status as any;
          }
        });

      return {
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`.trim(),
        student_number: student.username,
        attendance,
      };
    });

    // Calculate summary
    const totalDays = finalClassDates.length;
    let totalPresent = 0;
    let totalPossible = students.length * totalDays;

    entries.forEach((entry) => {
      Object.values(entry.attendance).forEach((status) => {
        if (status === 'present' || status === 'late') {
          totalPresent++;
        }
      });
    });

    const attendanceRate = totalPossible > 0 ? (totalPresent / totalPossible) * 100 : 0;

    return {
      class_id: dto.class_id,
      class_name: classData.name,
      course_level_id: dto.course_level_id,
      course_level_name: courseLevelInfo?.name,
      course_name: courseLevelInfo?.course_name,
      school_id: classData.school_id,
      school_name: (classData.school as any)?.name || '',
      lead_tutor: leadTutor && !Array.isArray(leadTutor)
        ? {
            id: leadTutor.id,
            name: `${leadTutor.first_name} ${leadTutor.middle_name || ''} ${leadTutor.last_name}`.trim(),
          }
        : undefined,
      assistant_tutor: assistantTutor && !Array.isArray(assistantTutor)
        ? {
            id: assistantTutor.id,
            name: `${assistantTutor.first_name} ${assistantTutor.middle_name || ''} ${assistantTutor.last_name}`.trim(),
          }
        : undefined,
      date_range: {
        start_date: dto.start_date,
        end_date: endDate,
      },
        dates: finalClassDates,
      entries,
      summary: {
        total_students: students.length,
        total_days: totalDays,
        attendance_rate: Math.round(attendanceRate * 100) / 100,
      },
    };
  }

  /**
   * Get empty register structure when no attendance records found
   */
  private async getEmptyRegister(
    dto: GetAttendanceDto,
    classData: any,
    classSchedule: any,
  ): Promise<AttendanceRegister> {
    // Get tutors
    const { data: tutors } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        role,
        tutor:tutors(id, first_name, middle_name, last_name)
      `)
      .eq('class_id', dto.class_id)
      .eq('status', 'active');

    const leadTutorAssignment = tutors?.find((t: any) => t.role === 'lead');
    const assistantTutorAssignment = tutors?.find((t: any) => t.role === 'assistant');
    
    const leadTutor = leadTutorAssignment?.tutor 
      ? (Array.isArray(leadTutorAssignment.tutor) ? leadTutorAssignment.tutor[0] : leadTutorAssignment.tutor)
      : null;
    const assistantTutor = assistantTutorAssignment?.tutor
      ? (Array.isArray(assistantTutorAssignment.tutor) ? assistantTutorAssignment.tutor[0] : assistantTutorAssignment.tutor)
      : null;

    // Get course level info if provided
    let courseLevelInfo = null;
    if (dto.course_level_id) {
      const { data: courseLevel } = await this.supabase
        .from('course_levels')
        .select(`
          id,
          name,
          level_number,
          course:courses(id, name)
        `)
        .eq('id', dto.course_level_id)
        .single();

      if (courseLevel) {
        const course = Array.isArray(courseLevel.course) ? courseLevel.course[0] : courseLevel.course;
        courseLevelInfo = {
          id: courseLevel.id,
          name: courseLevel.name,
          course_name: course?.name,
        };
      }
    }

    return {
      class_id: dto.class_id,
      class_name: classData.name,
      course_level_id: dto.course_level_id,
      course_level_name: courseLevelInfo?.name,
      course_name: courseLevelInfo?.course_name,
      school_id: classData.school_id,
      school_name: (classData.school as any)?.name || '',
      lead_tutor: leadTutor && !Array.isArray(leadTutor)
        ? {
            id: leadTutor.id,
            name: `${leadTutor.first_name} ${leadTutor.middle_name || ''} ${leadTutor.last_name}`.trim(),
          }
        : undefined,
      assistant_tutor: assistantTutor && !Array.isArray(assistantTutor)
        ? {
            id: assistantTutor.id,
            name: `${assistantTutor.first_name} ${assistantTutor.middle_name || ''} ${assistantTutor.last_name}`.trim(),
          }
        : undefined,
      date_range: {
        start_date: dto.start_date,
        end_date: dto.end_date || dto.start_date,
      },
      dates: [],
      entries: [],
      summary: {
        total_students: 0,
        total_days: 0,
        attendance_rate: 0,
      },
    };
  }

  /**
   * Generate class dates based on day of week for 12 weeks (one term)
   * Uses the day assigned to the class from class_schedules table
   * @param startDate - Starting date (will find the first occurrence of the class day on or after this date)
   * @param dayOfWeek - Day of week from class_schedules.day_of_week (e.g., 'monday', 'tuesday')
   * @param weeks - Number of weeks to generate (default: 12)
   * @returns Array of dates (YYYY-MM-DD) for the class days only
   */
  private generateClassDates(startDate: string, dayOfWeek: string, weeks: number = 12): string[] {
    const dates: string[] = [];
    const dayMap: { [key: string]: number } = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6,
    };

    const targetDay = dayMap[dayOfWeek.toLowerCase()];
    if (targetDay === undefined) {
      this.logger.warn(`Invalid day of week from class schedule: ${dayOfWeek}`);
      return [];
    }

    // Start from the start date
    let currentDate = new Date(startDate);
    
    // Find the first occurrence of the target day (assigned to this class) on or after start date
    while (currentDate.getDay() !== targetDay) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Generate 12 weeks of class dates (only the day assigned to this class)
    // Example: If class is on Monday, generates: Monday week 1, Monday week 2, ..., Monday week 12
    for (let week = 0; week < weeks; week++) {
      const classDate = new Date(currentDate);
      classDate.setDate(currentDate.getDate() + (week * 7));
      dates.push(this.formatDate(classDate));
    }

    this.logger.log(
      `Generated ${dates.length} class dates for ${dayOfWeek}s: ${dates[0]} to ${dates[dates.length - 1]}`
    );

    return dates;
  }

  /**
   * Automatically mark absent for class dates where the time window has elapsed
   * Checks if students logged in during the schedule time window
   * If not, marks them as absent
   */
  private async autoMarkAbsentForElapsedClassTimes(
    classId: string,
    classSchedule: any,
    startDate: string,
    endDate?: string,
    courseLevelId?: string,
  ): Promise<void> {
    const now = new Date();
    const dayOfWeek = classSchedule.day_of_week.toLowerCase();
    
    // Generate class dates from start_date to end_date (or today if no end_date)
    const classDates = this.generateClassDatesForRange(startDate, endDate || this.formatDate(now), dayOfWeek);
    
    if (classDates.length === 0) {
      return;
    }

    // Parse schedule times
    const [scheduleStartHours, scheduleStartMinutes] = classSchedule.start_time.split(':').map(Number);
    const [scheduleEndHours, scheduleEndMinutes] = classSchedule.end_time.split(':').map(Number);

    // Get all students in the class
    let studentsQuery = this.supabase
      .from('students')
      .select('id, class_id')
      .eq('class_id', classId)
      .eq('status', 'active');

    const { data: students, error: studentsError } = await studentsQuery;

    if (studentsError || !students || students.length === 0) {
      return;
    }

    // Get course level for enrolled students if provided
    let enrolledCourseLevelId = courseLevelId;
    if (!enrolledCourseLevelId) {
      const { data: courseLevel } = await this.supabase
        .from('class_course_level_assignments')
        .select('course_level_id')
        .eq('class_id', classId)
        .eq('enrollment_status', 'enrolled')
        .limit(1)
        .maybeSingle();
      
      enrolledCourseLevelId = courseLevel?.course_level_id || null;
    }

    // For each class date, check if the time window has elapsed
    for (const classDateStr of classDates) {
      const classDate = new Date(classDateStr);
      
      // Calculate the end of the attendance window (1 hour after class end time)
      const attendanceWindowEnd = new Date(classDate);
      attendanceWindowEnd.setHours(scheduleEndHours, scheduleEndMinutes + 60, 0, 0);

      // Only process if the attendance window has passed
      if (now < attendanceWindowEnd) {
        continue; // Time window hasn't elapsed yet, skip
      }

      // Time window has elapsed - check which students logged in
      const attendanceWindowStart = new Date(classDate);
      attendanceWindowStart.setHours(scheduleStartHours, scheduleStartMinutes - 40, 0, 0); // 40 min before

      // Get all attendance records for this date
      let attendanceQuery = this.supabase
        .from('attendance_records')
        .select('student_id, login_timestamp')
        .eq('class_id', classId)
        .eq('attendance_date', classDateStr);

      if (enrolledCourseLevelId) {
        attendanceQuery = attendanceQuery.eq('course_level_id', enrolledCourseLevelId);
      }

      const { data: existingRecords } = await attendanceQuery;
      
      // Find students who logged in during the schedule time window
      const studentsWhoLoggedIn = new Set<string>();
      (existingRecords || []).forEach((record: any) => {
        if (record.login_timestamp) {
          const loginTime = new Date(record.login_timestamp);
          // Check if login was within the schedule time window
          if (loginTime >= attendanceWindowStart && loginTime <= attendanceWindowEnd) {
            studentsWhoLoggedIn.add(record.student_id);
          }
        } else {
          // If manually marked (no login_timestamp), consider them as having attendance
          studentsWhoLoggedIn.add(record.student_id);
        }
      });

      // Find students who didn't log in during the time window
      const studentsWithoutLogin = students.filter(
        (student) => !studentsWhoLoggedIn.has(student.id)
      );

      // Mark absent for students who didn't log in
      if (studentsWithoutLogin.length > 0) {
        let markedCount = 0;
        for (const student of studentsWithoutLogin) {
          // Check if record already exists
          const { data: existing } = await this.supabase
            .from('attendance_records')
            .select('id')
            .eq('student_id', student.id)
            .eq('class_id', classId)
            .eq('attendance_date', classDateStr)
            .eq('course_level_id', enrolledCourseLevelId || null)
            .maybeSingle();

          if (!existing) {
            const { error: insertError } = await this.supabase
              .from('attendance_records')
              .insert({
                student_id: student.id,
                class_id: classId,
                course_level_id: enrolledCourseLevelId,
                attendance_date: classDateStr,
                status: 'absent',
                marked_at: now.toISOString(),
              });

            if (insertError) {
              this.logger.error(
                `Error auto-marking absent for student ${student.id} on ${classDateStr}: ${insertError.message}`,
                insertError
              );
            } else {
              markedCount++;
            }
          }
        }

        if (markedCount > 0) {
          this.logger.log(
            `Auto-marked ${markedCount} students as absent for ${classDateStr} (time window elapsed)`
          );
        }
      }
    }
  }

  /**
   * Generate class dates for a date range based on schedule day of week
   */
  private generateClassDatesForRange(startDate: string, endDate: string, dayOfWeek: string): string[] {
    const dates: string[] = [];
    const dayMap: { [key: string]: number } = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6,
    };

    const targetDay = dayMap[dayOfWeek.toLowerCase()];
    if (targetDay === undefined) {
      return [];
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Find first occurrence of target day on or after start date
    let currentDate = new Date(start);
    while (currentDate.getDay() !== targetDay && currentDate <= end) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Generate all class dates in the range
    while (currentDate <= end) {
      dates.push(this.formatDate(currentDate));
      currentDate.setDate(currentDate.getDate() + 7); // Next week same day
    }

    return dates;
  }

  /**
   * Automatically mark absent for past class dates that don't have attendance records
   * This runs when fetching the attendance register
   */
  private async autoMarkAbsentForPastDates(
    classId: string,
    classDates: string[],
    courseLevelId?: string,
  ): Promise<void> {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    // Filter to only past dates (before end of today)
    const pastDates = classDates.filter((dateStr) => {
      const date = new Date(dateStr);
      date.setHours(23, 59, 59, 999);
      return date < today;
    });

    if (pastDates.length === 0) {
      return; // No past dates to process
    }

    this.logger.log(`Auto-marking absent for ${pastDates.length} past class dates for class ${classId}`);

    // Get all students in the class
    let studentsQuery = this.supabase
      .from('students')
      .select('id, class_id')
      .eq('class_id', classId)
      .eq('status', 'active');

    const { data: students, error: studentsError } = await studentsQuery;

    if (studentsError || !students || students.length === 0) {
      return; // No students to mark
    }

    // Get course level for enrolled students if provided
    let enrolledCourseLevelId = courseLevelId;
    if (!enrolledCourseLevelId) {
      const { data: courseLevel } = await this.supabase
        .from('class_course_level_assignments')
        .select('course_level_id')
        .eq('class_id', classId)
        .eq('enrollment_status', 'enrolled')
        .limit(1)
        .maybeSingle();
      
      enrolledCourseLevelId = courseLevel?.course_level_id || null;
    }

    // For each past date, check if students have attendance records
    for (const date of pastDates) {
      // Get existing attendance records for this date
      let attendanceQuery = this.supabase
        .from('attendance_records')
        .select('student_id')
        .eq('class_id', classId)
        .eq('attendance_date', date);

      if (enrolledCourseLevelId) {
        attendanceQuery = attendanceQuery.eq('course_level_id', enrolledCourseLevelId);
      }

      const { data: existingRecords } = await attendanceQuery;
      const studentsWithAttendance = new Set(
        (existingRecords || []).map((r: any) => r.student_id)
      );

      // Find students without attendance for this date
      const studentsWithoutAttendance = students.filter(
        (student) => !studentsWithAttendance.has(student.id)
      );

      // Mark absent for students without attendance
      if (studentsWithoutAttendance.length > 0) {
        // Insert absent records one by one to handle unique constraint
        let markedCount = 0;
        for (const student of studentsWithoutAttendance) {
          // Check if record already exists (double-check)
          const { data: existing } = await this.supabase
            .from('attendance_records')
            .select('id')
            .eq('student_id', student.id)
            .eq('class_id', classId)
            .eq('attendance_date', date)
            .eq('course_level_id', enrolledCourseLevelId || null)
            .maybeSingle();

          if (!existing) {
            const { error: insertError } = await this.supabase
              .from('attendance_records')
              .insert({
                student_id: student.id,
                class_id: classId,
                course_level_id: enrolledCourseLevelId,
                attendance_date: date,
                status: 'absent',
                marked_at: new Date().toISOString(),
              });

            if (insertError) {
              this.logger.error(
                `Error auto-marking absent for student ${student.id} on ${date}: ${insertError.message}`,
                insertError
              );
            } else {
              markedCount++;
            }
          }
        }

        if (markedCount > 0) {
          this.logger.log(
            `Auto-marked ${markedCount} students as absent for ${date}`
          );
        }
      }
    }
  }

  /**
   * Get day of week string from date
   */
  private getDayOfWeek(date: Date): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Generate array of dates between start and end
   */
  private generateDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(this.formatDate(d));
    }

    return dates;
  }

  /**
   * Check if a tutor is assigned to a class
   */
  async isTutorAssignedToClass(tutorId: string, classId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('tutor_class_assignments')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('class_id', classId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      this.logger.error(`Error checking tutor assignment: ${error.message}`);
      return false;
    }

    return !!data;
  }

  /**
   * Get all classes assigned to a tutor (for attendance purposes)
   */
  async getTutorAssignedClasses(tutorId: string): Promise<any[]> {
    const { data: assignments, error } = await this.supabase
      .from('tutor_class_assignments')
      .select(`
        id,
        role,
        class_id,
        class:classes(
          id,
          name,
          level,
          status,
          school:schools(id, name, code)
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('status', 'active');

    if (error) {
      this.logger.error(`Error fetching tutor classes: ${error.message}`);
      throw new NotFoundException('Failed to fetch tutor classes');
    }

    if (!assignments || assignments.length === 0) {
      return [];
    }

    // Transform the data to ensure proper structure
    return assignments.map((assignment: any) => {
      const classData = Array.isArray(assignment.class) ? assignment.class[0] : assignment.class;
      const schoolData = classData?.school ? (Array.isArray(classData.school) ? classData.school[0] : classData.school) : null;

      return {
        id: classData?.id,
        name: classData?.name,
        level: classData?.level,
        status: classData?.status,
        role: assignment.role,
        school: schoolData ? {
          id: schoolData.id,
          name: schoolData.name,
          code: schoolData.code,
        } : null,
      };
    });
  }

  /**
   * Report: attendance (time present, status) + topic learned per day.
   * Topic comes from the class code the student used that day.
   */
  async getAttendanceAndTopicsReport(
    studentId: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    entries: Array<{
      date: string;
      login_timestamp: string | null;
      status: 'present' | 'late' | 'absent' | null;
      topic_learned: { id: string; name: string } | null;
    }>;
  }> {
    const [attendanceRows, usageRows] = await Promise.all([
      this.supabase
        .from('attendance_records')
        .select('attendance_date, login_timestamp, status')
        .eq('student_id', studentId)
        .in('status', ['present', 'late'])
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate)
        .order('attendance_date', { ascending: false }),
      this.supabase
        .from('student_class_code_usage')
        .select('used_at, topic:topics(id, name)')
        .eq('student_id', studentId)
        .gte('used_at', `${startDate}T00:00:00.000Z`)
        .lte('used_at', `${endDate}T23:59:59.999Z`)
        .order('used_at', { ascending: false }),
    ]);

    const attendanceByDate = new Map<string, { login_timestamp: string | null; status: string }>();
    (attendanceRows.data || []).forEach((r: any) => {
      attendanceByDate.set(r.attendance_date, {
        login_timestamp: r.login_timestamp || null,
        status: r.status,
      });
    });

    const topicByDate = new Map<string, { id: string; name: string }>();
    (usageRows.data || []).forEach((r: any) => {
      const date = r.used_at?.split('T')[0];
      if (!date || topicByDate.has(date)) return;
      const topic = Array.isArray(r.topic) ? r.topic[0] : r.topic;
      if (topic?.id && topic?.name) {
        topicByDate.set(date, { id: topic.id, name: topic.name });
      }
    });

    const dates = new Set([
      ...attendanceByDate.keys(),
      ...topicByDate.keys(),
    ]);
    const sortedDates = Array.from(dates).sort().reverse();

    const entries = sortedDates.map((date) => {
      const att = attendanceByDate.get(date);
      const topic = topicByDate.get(date) || null;
      const status = att?.status ?? null;
      return {
        date,
        login_timestamp: att?.login_timestamp ?? null,
        status: status as 'present' | 'late' | 'absent' | null,
        topic_learned: topic,
      };
    });

    return { entries };
  }

  /**
   * Same report for a class (admin/tutor). Optional student_id to filter one student.
   */
  async getAttendanceAndTopicsReportForClass(
    classId: string,
    startDate: string,
    endDate: string,
    studentId?: string,
  ): Promise<{
    entries: Array<{
      student_id: string;
      student_name: string;
      username: string;
      date: string;
      login_timestamp: string | null;
      status: string | null;
      topic_learned: { id: string; name: string } | null;
    }>;
  }> {
    let studentQuery = this.supabase
      .from('students')
      .select('id, first_name, last_name, username')
      .eq('class_id', classId)
      .eq('status', 'active');
    if (studentId) {
      studentQuery = studentQuery.eq('id', studentId);
    }
    const { data: students, error: studentsError } = await studentQuery;
    if (studentsError || !students?.length) {
      return { entries: [] };
    }

    const entries: Array<{
      student_id: string;
      student_name: string;
      username: string;
      date: string;
      login_timestamp: string | null;
      status: string | null;
      topic_learned: { id: string; name: string } | null;
    }> = [];

    for (const s of students) {
      const { entries: studentEntries } = await this.getAttendanceAndTopicsReport(
        s.id,
        startDate,
        endDate,
      );
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username;
      studentEntries.forEach((e) => {
        entries.push({
          student_id: s.id,
          student_name: name,
          username: s.username,
          date: e.date,
          login_timestamp: e.login_timestamp,
          status: e.status,
          topic_learned: e.topic_learned,
        });
      });
    }

    entries.sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return a.student_name.localeCompare(b.student_name);
    });

    return { entries };
  }
}

