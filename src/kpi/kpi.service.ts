import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

const MIN_STUDENTS_RANKED = 3;
const MIN_STUDENTS_FLAG_LOW_SAMPLE = 5;
const WORKLOAD_SCALING_CONSTANT = 5;
const WORKLOAD_CAP = 1.5;
const TREND_MONTHS = 3;
const AGI_WEIGHT = 0.3;
const STABILITY_WEIGHT = 0.1;
const ENGAGEMENT_WEIGHT = 0.15;
const TAKEAWAY_IMPACT_WEIGHT = 0.15;
const COVERAGE_WEIGHT = 0.1;
const RETENTION_WEIGHT = 0.1;

export interface TutorKpiResult {
  tutor_id: string;
  tutor_name: string;
  school_id?: string;
  school_name?: string;
  student_count: number;
  low_sample_size: boolean;
  not_ranked: boolean;

  academic_growth_index: number;       // 0–100, 30%
  performance_stability: number;        // 0–100, 10% (higher = more consistent)
  engagement_rate: number;             // 0–100, 15%
  takeaway_impact: number;             // 0–100, 15%
  curriculum_coverage: number;         // 0–100, 10%
  retention_rate: number;              // 0–100, 10%
  workload_factor: number;             // multiplier, 10%

  fair_kpi_raw: number;                // 0–100 before workload
  adjusted_kpi: number;                 // after workload, capped
  relative_performance_index?: number; // vs school average (admin only)

  trend: 'improving' | 'stable' | 'declining' | null;
  trend_percent?: number;

  components: {
    agi_per_student_growth_avg: number;
    stability_std_dev: number;
    attendance_rate_pct: number;
    takeaway_impact_avg: number;
    coverage_ratio: number;
    retention_ratio: number;
    workload_sqrt_n: number;
  };
}

@Injectable()
export class KpiService {
  constructor(@Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient) {}

  async getTutorKpi(tutorId: string, schoolId?: string): Promise<TutorKpiResult | null> {
    const result = await this.computeTutorKpi(tutorId, schoolId);
    if (!result) return null;
    return result;
  }

  async getMyKpi(tutorId: string, schoolId?: string): Promise<TutorKpiResult | null> {
    return this.getTutorKpi(tutorId, schoolId);
  }

  async getAllTutorsKpi(schoolId?: string): Promise<TutorKpiResult[]> {
    const { data: assignments } = await this.supabase
      .from('tutor_class_assignments')
      .select('tutor_id')
      .eq('status', 'active');
    if (!assignments?.length) return [];

    const tutorIds = [...new Set(assignments.map((a: any) => a.tutor_id))];
    const results: TutorKpiResult[] = [];
    for (const tid of tutorIds) {
      const r = await this.computeTutorKpi(tid, schoolId);
      if (r) results.push(r);
    }

    const schoolAvgGrowth = results.length
      ? results.reduce((s, r) => s + r.components.agi_per_student_growth_avg, 0) / results.length
      : 0;
    results.forEach((r) => {
      r.relative_performance_index = r.components.agi_per_student_growth_avg - schoolAvgGrowth;
    });

    results.sort((a, b) => (b.adjusted_kpi ?? 0) - (a.adjusted_kpi ?? 0));
    return results;
  }

  private async computeTutorKpi(tutorId: string, schoolId?: string): Promise<TutorKpiResult | null> {
    const classIds = await this.getTutorClassIds(tutorId, schoolId);
    if (!classIds.length) return null;

    const { data: students } = await this.supabase
      .from('students')
      .select('id, class_id')
      .in('class_id', classIds)
      .eq('status', 'active');
    const studentIds = (students || []).map((s: any) => s.id);
    const studentCount = studentIds.length;
    if (studentCount === 0) return null;

    const tutorRow = await this.getTutorName(tutorId);
    const schoolInfo = await this.getSchoolForTutor(tutorId, schoolId);

    const notRanked = studentCount < MIN_STUDENTS_RANKED;
    const lowSampleSize = studentCount < MIN_STUDENTS_FLAG_LOW_SAMPLE;

    const agi = await this.computeAGI(studentIds, classIds);
    const stability = await this.computeStability(studentIds, classIds);
    const engagement = await this.computeEngagement(studentIds, classIds);
    const takeawayImpact = await this.computeTakeawayImpact(tutorId, studentIds, classIds);
    const coverage = await this.computeCoverage(classIds, studentIds);
    const retention = await this.computeRetention(classIds, studentIds);
    const workloadFactor = this.computeWorkloadFactor(studentCount);

    const fairKpiRaw =
      agi.value * AGI_WEIGHT +
      stability.value * STABILITY_WEIGHT +
      engagement.value * ENGAGEMENT_WEIGHT +
      takeawayImpact.value * TAKEAWAY_IMPACT_WEIGHT +
      coverage.value * COVERAGE_WEIGHT +
      retention.value * RETENTION_WEIGHT;
    const adjustedKpi = notRanked ? 0 : Math.min(100, Math.max(0, fairKpiRaw * workloadFactor.multiplier));

    const trend = await this.computeTrend(tutorId, classIds, studentIds);

    return {
      tutor_id: tutorId,
      tutor_name: tutorRow?.name ?? 'Tutor',
      school_id: schoolInfo?.id,
      school_name: schoolInfo?.name,
      student_count: studentCount,
      low_sample_size: lowSampleSize,
      not_ranked: notRanked,
      academic_growth_index: Math.round(agi.value * 100) / 100,
      performance_stability: Math.round(stability.value * 100) / 100,
      engagement_rate: Math.round(engagement.value * 100) / 100,
      takeaway_impact: Math.round(takeawayImpact.value * 100) / 100,
      curriculum_coverage: Math.round(coverage.value * 100) / 100,
      retention_rate: Math.round(retention.value * 100) / 100,
      workload_factor: Math.round(workloadFactor.multiplier * 100) / 100,
      fair_kpi_raw: Math.round(fairKpiRaw * 100) / 100,
      adjusted_kpi: Math.round(adjustedKpi * 100) / 100,
      trend: trend.direction,
      trend_percent: trend.percent,
      components: {
        agi_per_student_growth_avg: agi.rawAvg,
        stability_std_dev: stability.rawStd,
        attendance_rate_pct: engagement.rawPct,
        takeaway_impact_avg: takeawayImpact.rawAvg,
        coverage_ratio: coverage.rawRatio,
        retention_ratio: retention.rawRatio,
        workload_sqrt_n: workloadFactor.sqrtN,
      },
    };
  }

  private async getTutorClassIds(tutorId: string, schoolId?: string): Promise<string[]> {
    let q = this.supabase
      .from('tutor_class_assignments')
      .select('class_id, class:classes(id, school_id)')
      .eq('tutor_id', tutorId)
      .eq('status', 'active');
    const { data } = await q;
    if (!data?.length) return [];
    let list = data as any[];
    if (schoolId) {
      list = list.filter((a) => {
        const c = Array.isArray(a.class) ? a.class[0] : a.class;
        return c?.school_id === schoolId;
      });
    }
    return list.map((a) => {
      const c = Array.isArray(a.class) ? a.class[0] : a.class;
      return c?.id;
    }).filter(Boolean);
  }

  private async getTutorName(tutorId: string): Promise<{ name: string } | null> {
    const { data } = await this.supabase
      .from('tutors')
      .select('first_name, last_name')
      .eq('id', tutorId)
      .single();
    if (!data) return null;
    const first = (data as any).first_name ?? '';
    const last = (data as any).last_name ?? '';
    return { name: `${first} ${last}`.trim() || 'Tutor' };
  }

  private async getSchoolForTutor(tutorId: string, schoolId?: string): Promise<{ id: string; name: string } | null> {
    const { data } = await this.supabase
      .from('tutor_class_assignments')
      .select('class:classes(school_id, school:schools(id, name))')
      .eq('tutor_id', tutorId)
      .eq('status', 'active')
      .limit(1)
      .single();
    if (!data) return null;
    const c = (data as any).class;
    const classData = Array.isArray(c) ? c[0] : c;
    const school = classData?.school;
    const s = Array.isArray(school) ? school[0] : school;
    if (schoolId && s?.id !== schoolId) return null;
    return s ? { id: s.id, name: s.name } : null;
  }

  private async computeAGI(studentIds: string[], classIds: string[]): Promise<{ value: number; rawAvg: number }> {
    const courseLevelIds = await this.getCourseLevelIdsForClasses(classIds);
    const topicIds = courseLevelIds.length
      ? (await this.supabase.from('topics').select('id').in('level_id', courseLevelIds).eq('status', 'active')).data
      : [];
    const tIds = (topicIds || []).map((t: any) => t.id);

    const examIds: string[] = [];
    if (tIds.length) {
      const { data: exams } = await this.supabase.from('exams').select('id').in('topic_id', tIds).eq('status', 'active');
      examIds.push(...(exams || []).map((e: any) => e.id));
    }

    const growths: number[] = [];
    if (examIds.length) {
      const { data: attempts } = await this.supabase
        .from('student_exam_attempts')
        .select('student_id, percentage, completed_at, exam_id')
        .in('student_id', studentIds)
        .in('exam_id', examIds)
        .eq('status', 'completed')
        .not('completed_at', 'is', null);
      const byStudent = new Map<string, { pct: number; at: string }[]>();
      (attempts || []).forEach((a: any) => {
        if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, []);
        byStudent.get(a.student_id)!.push({ pct: Number(a.percentage) || 0, at: a.completed_at });
      });
      byStudent.forEach((arr) => {
        arr.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
        const n = arr.length;
        if (n < 2) return;
        const baselineSize = Math.max(1, Math.floor(n * 0.25));
        const latestSize = Math.max(1, Math.floor(n * 0.25));
        const baseline = arr.slice(0, baselineSize).reduce((s, x) => s + x.pct, 0) / baselineSize;
        const latest = arr.slice(-latestSize).reduce((s, x) => s + x.pct, 0) / latestSize;
        growths.push(latest - baseline);
      });
    }

    if (growths.length === 0) {
      const quizGrowth = await this.computeAGIFromQuizzes(studentIds, classIds);
      growths.push(...quizGrowth);
    }

    if (growths.length === 0) return { value: 50, rawAvg: 0 };
    const rawAvg = growths.reduce((a, b) => a + b, 0) / growths.length;
    const value = Math.max(0, Math.min(100, 50 + rawAvg));
    return { value, rawAvg };
  }

  private async computeAGIFromQuizzes(studentIds: string[], classIds: string[]): Promise<number[]> {
    const courseLevelIds = await this.getCourseLevelIdsForClasses(classIds);
    const topicIds = courseLevelIds.length
      ? (await this.supabase.from('topics').select('id').in('level_id', courseLevelIds).eq('status', 'active')).data
      : [];
    const tIds = (topicIds || []).map((t: any) => t.id);
    const { data: quizzes } = await this.supabase.from('quizzes').select('id, topic_id').in('topic_id', tIds).eq('status', 'active');
    const quizIds = (quizzes || []).map((q: any) => q.id);
    if (!quizIds.length) return [];

    const { data: attempts } = await this.supabase
      .from('student_quiz_attempts')
      .select('student_id, percentage, created_at')
      .in('student_id', studentIds)
      .in('quiz_id', quizIds)
      .eq('status', 'completed');
    const byStudent = new Map<string, { pct: number; at: string }[]>();
    (attempts || []).forEach((a: any) => {
      if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, []);
      byStudent.get(a.student_id)!.push({ pct: Number(a.percentage) || 0, at: a.created_at });
    });
    const growths: number[] = [];
    byStudent.forEach((arr) => {
      arr.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
      const n = arr.length;
      if (n < 2) return;
      const baselineSize = Math.max(1, Math.floor(n * 0.25));
      const latestSize = Math.max(1, Math.floor(n * 0.25));
      const baseline = arr.slice(0, baselineSize).reduce((s, x) => s + x.pct, 0) / baselineSize;
      const latest = arr.slice(-latestSize).reduce((s, x) => s + x.pct, 0) / latestSize;
      growths.push(latest - baseline);
    });
    return growths;
  }

  private async computeStability(studentIds: string[], classIds: string[]): Promise<{ value: number; rawStd: number }> {
    const courseLevelIds = await this.getCourseLevelIdsForClasses(classIds);
    const topicIds = courseLevelIds.length
      ? (await this.supabase.from('topics').select('id').in('level_id', courseLevelIds).eq('status', 'active')).data
      : [];
    const tIds = (topicIds || []).map((t: any) => t.id);
    const { data: quizzes } = await this.supabase.from('quizzes').select('id').in('topic_id', tIds).eq('status', 'active');
    const quizIds = (quizzes || []).map((q: any) => q.id);
    if (!quizIds.length || !studentIds.length) return { value: 50, rawStd: 50 };

    const { data: best } = await this.supabase
      .from('student_quiz_best_scores')
      .select('student_id, best_percentage')
      .in('student_id', studentIds)
      .in('quiz_id', quizIds);
    const byStudent = new Map<string, number[]>();
    (best || []).forEach((r: any) => {
      if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
      byStudent.get(r.student_id)!.push(Number(r.best_percentage) || 0);
    });
    const averages = studentIds.map((id) => {
      const arr = byStudent.get(id) || [];
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }).filter((v) => v > 0);
    if (averages.length < 2) return { value: 50, rawStd: 0 };
    const mean = averages.reduce((a, b) => a + b, 0) / averages.length;
    const variance = averages.reduce((s, x) => s + (x - mean) ** 2, 0) / averages.length;
    const std = Math.sqrt(variance);
    const rawStd = std;
    const value = Math.max(0, Math.min(100, 100 - std * 2));
    return { value, rawStd };
  }

  private async computeEngagement(studentIds: string[], classIds: string[]): Promise<{ value: number; rawPct: number }> {
    const { data: records } = await this.supabase
      .from('attendance_records')
      .select('student_id, attendance_date, status')
      .in('student_id', studentIds)
      .in('class_id', classIds);
    const present = (records || []).filter((r: any) => r.status === 'present').length;
    const totalSessions = (records || []).length;
    if (totalSessions === 0) return { value: 50, rawPct: 0 };
    const rawPct = (present / totalSessions) * 100;
    return { value: Math.min(100, rawPct), rawPct };
  }

  private async computeTakeawayImpact(tutorId: string, studentIds: string[], classIds: string[]): Promise<{ value: number; rawAvg: number }> {
    const { data: assignments } = await this.supabase
      .from('take_away_assignments')
      .select('id, take_away_quiz_id')
      .eq('tutor_id', tutorId)
      .in('class_id', classIds)
      .not('take_away_quiz_id', 'is', null);
    if (!assignments?.length) return { value: 50, rawAvg: 0 };

    const impactPerStudent: number[] = [];
    for (const a of assignments as any[]) {
      const { data: points } = await this.supabase
        .from('take_away_assignment_student_points')
        .select('student_id, best_percentage')
        .eq('assignment_id', a.id)
        .in('student_id', studentIds);
      (points || []).forEach((p: any) => {
        const post = Number(p.best_percentage) || 0;
        impactPerStudent.push(post);
      });
    }
    if (impactPerStudent.length === 0) return { value: 50, rawAvg: 0 };
    const rawAvg = impactPerStudent.reduce((s, x) => s + x, 0) / impactPerStudent.length;
    return { value: Math.min(100, rawAvg), rawAvg };
  }

  private async computeCoverage(classIds: string[], studentIds: string[]): Promise<{ value: number; rawRatio: number }> {
    const courseLevelIds = await this.getCourseLevelIdsForClasses(classIds);
    const { data: topics } = await this.supabase.from('topics').select('id').in('level_id', courseLevelIds).eq('status', 'active');
    const topicIds = (topics || []).map((t: any) => t.id);
    if (!topicIds.length) return { value: 0, rawRatio: 0 };

    const { data: quizzes } = await this.supabase.from('quizzes').select('id, topic_id').in('topic_id', topicIds).eq('status', 'active');
    const quizIds = (quizzes || []).map((q: any) => q.id);
    if (!quizIds.length) return { value: 0, rawRatio: 0 };

    const { data: attempted } = await this.supabase
      .from('student_quiz_attempts')
      .select('quiz_id')
      .in('student_id', studentIds)
      .in('quiz_id', quizIds)
      .eq('status', 'completed');
    const coveredTopics = new Set<string>();
    (attempted || []).forEach((r: any) => {
      const q = (quizzes as any[]).find((x) => x.id === r.quiz_id);
      if (q) coveredTopics.add(q.topic_id);
    });
    const rawRatio = coveredTopics.size / topicIds.length;
    return { value: Math.min(100, rawRatio * 100), rawRatio };
  }

  private async computeRetention(classIds: string[], studentIds: string[]): Promise<{ value: number; rawRatio: number }> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const { data: then } = await this.supabase
      .from('students')
      .select('id')
      .in('class_id', classIds)
      .eq('status', 'active')
      .lte('created_at', threeMonthsAgo.toISOString());
    const startCount = (then || []).length;
    const endCount = studentIds.length;
    if (startCount === 0) return { value: 100, rawRatio: 1 };
    const rawRatio = endCount / startCount;
    return { value: Math.min(100, rawRatio * 100), rawRatio };
  }

  private computeWorkloadFactor(n: number): { multiplier: number; sqrtN: number } {
    const sqrtN = Math.sqrt(n);
    const multiplier = Math.min(WORKLOAD_CAP, sqrtN / WORKLOAD_SCALING_CONSTANT);
    return { multiplier: Math.max(0.2, multiplier), sqrtN };
  }

  private async computeTrend(tutorId: string, classIds: string[], studentIds: string[]): Promise<{ direction: 'improving' | 'stable' | 'declining' | null; percent?: number }> {
    return { direction: null };
  }

  private async getCourseLevelIdsForClasses(classIds: string[]): Promise<string[]> {
    const { data } = await this.supabase
      .from('class_course_level_assignments')
      .select('course_level_id')
      .in('class_id', classIds)
      .eq('enrollment_status', 'enrolled');
    return (data || []).map((d: any) => d.course_level_id);
  }
}
