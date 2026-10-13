import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysYmd, mondayOfWeek, sundayOfWeek, todayYmd } from '../training/programCalendar';
import { scheduleSetupMissing } from '../training/scheduleActions';
import { fetchGroupScopedSetLogs } from './memberPerformance';
import { groupSourceKey } from './trainingSources';
import { attachExpectationCompletion, type GroupTrainingExpectationInput } from './trainingWorkspace';
import { CALENDAR_DEPENDENCY_NOTICE } from './groupCalendar';

export type GroupTrainingEnrollmentFact = {
  id: string | null;
  userId: string;
  programId: string | null;
  status: string;
  startsOn: string | null;
  scheduleMode: 'program_days' | 'custom_weekdays';
  scheduleWeekdays: string[];
  expectationEnabled: boolean;
};

export type GroupTrainingFacts = {
  enrollments: GroupTrainingEnrollmentFact[];
  expectations: GroupTrainingExpectationInput[];
  expectationsAvailable: boolean;
  completionKnown: boolean;
  missedByUser: Record<string, number> | null;
  notice: string | null;
};

function mapSessionStatus(value: string | null | undefined): string | null {
  const status = String(value || '').toLowerCase();
  if (status === 'completed' || status === 'partial' || status === 'skipped' || status === 'in_progress' || status === 'not_started') {
    return status;
  }
  return null;
}

/**
 * Reads this group's enrollments and expectations only.
 * Personal enrollments are not queried.
 */
export async function loadGroupTrainingFacts(
  supabase: SupabaseClient,
  input: { teamId: string; today?: string; viewerUserId?: string | null; memberUserIds?: string[] }
): Promise<GroupTrainingFacts> {
  const today = input.today || todayYmd();
  const sourceKey = groupSourceKey(input.teamId);
  await supabase.rpc('st_apply_group_due_segments', { p_team_id: input.teamId, p_today: today });
  const from = addDaysYmd(today, -7);
  const to = addDaysYmd(sundayOfWeek(today), 84);
  const weekFrom = mondayOfWeek(from);

  const [enrollmentResult, expectationResult, adherenceResult] = await Promise.all([
    supabase
      .from('st_training_enrollments')
      .select('id, user_id, program_id, status, starts_on, source_kind, source_key, team_id, expectation_enabled')
      .eq('team_id', input.teamId)
      .eq('source_kind', 'group')
      .eq('source_key', sourceKey),
    supabase
      .from('st_training_expectations')
      .select('id, user_id, source_key, team_id, origin, scheduled_date, title, day_label, workout_id, excused')
      .eq('source_key', sourceKey)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to),
    supabase.rpc('st_group_schedule_adherence', {
      p_team_id: input.teamId,
      p_from_date: from,
      p_to_date: today,
      p_local_today: today,
    }),
  ]);

  const enrollmentMissing = scheduleSetupMissing(enrollmentResult.error?.message);
  const expectationMissing = scheduleSetupMissing(expectationResult.error?.message);
  const enrollments: GroupTrainingEnrollmentFact[] = (enrollmentResult.data || [])
    .filter((row: { source_kind?: string; source_key?: string }) => row.source_kind === 'group' && row.source_key === sourceKey)
    .map((row: { id?: string; user_id: string; program_id?: string | null; status?: string | null; starts_on?: string | null; expectation_enabled?: boolean | null }) => ({
      id: row.id || null,
      userId: row.user_id,
      programId: row.program_id || null,
      status: row.status || 'active',
      startsOn: row.starts_on || null,
      scheduleMode: 'program_days' as const,
      scheduleWeekdays: [] as string[],
      expectationEnabled: row.expectation_enabled !== false,
    }));

  const enrollmentIds = enrollments.map((row) => row.id).filter((id): id is string => !!id);
  if (enrollmentIds.length) {
    const profileResult = await supabase
      .from('st_training_schedule_profiles')
      .select('enrollment_id, mode, weekdays')
      .in('enrollment_id', enrollmentIds);
    if (!profileResult.error) {
      const byEnrollment = new Map(
        (profileResult.data || []).map((row: { enrollment_id: string; mode?: string; weekdays?: string[] | null }) => [row.enrollment_id, row])
      );
      enrollments.forEach((row) => {
        const profile = row.id ? byEnrollment.get(row.id) : null;
        if (profile?.mode === 'custom_weekdays') {
          row.scheduleMode = 'custom_weekdays';
          row.scheduleWeekdays = profile.weekdays || [];
        }
      });
    }
  }

  let expectations: GroupTrainingExpectationInput[] = (expectationResult.data || [])
    .filter((row: { source_key?: string }) => row.source_key === sourceKey)
    .map(
      (row: {
        id: string;
        user_id: string;
        source_key: string;
        team_id?: string | null;
        origin?: string | null;
        scheduled_date: string;
        title?: string | null;
        day_label?: string | null;
        workout_id?: string | null;
        excused?: boolean | null;
      }) => ({
        id: row.id,
        userId: row.user_id,
        sourceKey: row.source_key,
        teamId: row.team_id,
        origin: row.origin === 'assignment' ? 'assignment' : 'program',
        scheduledDate: String(row.scheduled_date).slice(0, 10),
        title: row.title || 'Workout',
        dayLabel: row.day_label,
        workoutId: row.workout_id,
        excused: !!row.excused,
      })
    );

  let missedByUser: Record<string, number> | null = null;
  if (!adherenceResult.error) {
    missedByUser = {};
    (adherenceResult.data || []).forEach((row: { user_id: string; missed?: number | null }) => {
      missedByUser![row.user_id] = Number(row.missed || 0);
    });
  }

  let completionKnown = false;
  const memberIds = input.memberUserIds || [];
  if (input.viewerUserId || memberIds.length) {
    const [sessions, logs] = await Promise.all([
      input.viewerUserId
        ? supabase
            .from('st_workout_sessions')
            .select('user_id, workout_id, log_date, status, expectation_id')
            .eq('user_id', input.viewerUserId)
            .gte('log_date', weekFrom)
            .lte('log_date', sundayOfWeek(today))
        : Promise.resolve({ data: [], error: null }),
      memberIds.length
        ? fetchGroupScopedSetLogs(supabase, input.teamId, memberIds, { from: weekFrom, to: sundayOfWeek(today), limit: 400 })
        : Promise.resolve({ data: [], pending: false, error: null }),
    ]);
    const sessionOk = !sessions.error;
    const logOk = !logs.error;
    completionKnown = sessionOk || logOk;
    if (completionKnown) {
      expectations = attachExpectationCompletion(
        expectations,
        (sessions.data || []).map(
          (row: { user_id: string; workout_id?: string | null; log_date?: string | null; expectation_id?: string | null; status?: string | null }) => ({
            userId: row.user_id,
            workoutId: row.workout_id,
            logDate: row.log_date ? String(row.log_date).slice(0, 10) : null,
            expectationId: row.expectation_id,
            status: mapSessionStatus(row.status),
          })
        ),
        (logs.data || [])
          .filter((row: { completed?: boolean; user_id?: string; log_date?: string }) => row.completed !== false && row.user_id && row.log_date)
          .map((row: { user_id: string; log_date: string }) => ({
            userId: row.user_id,
            date: String(row.log_date).slice(0, 10),
          }))
      );
    }
  }

  let notice: string | null = null;
  if (enrollmentMissing || expectationMissing) {
    notice = 'Scheduled days come from each program. Expectation dates appear after the unified training schedule is applied.';
  } else if (enrollmentResult.error) {
    notice = enrollmentResult.error.message;
  } else if (expectationResult.error) {
    notice = expectationResult.error.message;
  }

  return {
    enrollments,
    expectations,
    expectationsAvailable: !expectationResult.error,
    completionKnown: completionKnown || missedByUser != null,
    missedByUser,
    notice,
  };
}

export type GroupCalendarWeekFacts = {
  expectations: GroupTrainingExpectationInput[];
  expectationsAvailable: boolean;
  completionKnown: boolean;
  notice: string | null;
  from: string;
  to: string;
};

/**
 * Loads one Monday–Sunday group schedule.
 * Personal expectations are not queried.
 */
export async function loadGroupCalendarWeek(
  supabase: SupabaseClient,
  input: { teamId: string; weekStart: string; today?: string; viewerUserId?: string | null; memberUserIds?: string[] }
): Promise<GroupCalendarWeekFacts> {
  const today = input.today || todayYmd();
  const sourceKey = groupSourceKey(input.teamId);
  const from = mondayOfWeek(input.weekStart);
  const to = sundayOfWeek(from);
  const expectationResult = await supabase
    .from('st_training_expectations')
    .select('id, user_id, source_key, team_id, origin, scheduled_date, title, day_label, workout_id, excused')
    .eq('source_key', sourceKey)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date', { ascending: true });

  let expectations: GroupTrainingExpectationInput[] = (expectationResult.data || [])
    .filter((row: { source_key?: string }) => row.source_key === sourceKey && row.source_key !== 'personal')
    .map(
      (row: {
        id: string;
        user_id: string;
        source_key: string;
        team_id?: string | null;
        origin?: string | null;
        scheduled_date: string;
        title?: string | null;
        day_label?: string | null;
        workout_id?: string | null;
        excused?: boolean | null;
      }) => ({
        id: row.id,
        userId: row.user_id,
        sourceKey: row.source_key,
        teamId: row.team_id,
        origin: row.origin === 'assignment' ? 'assignment' as const : 'program' as const,
        scheduledDate: String(row.scheduled_date).slice(0, 10),
        title: row.title || 'Workout',
        dayLabel: row.day_label,
        workoutId: row.workout_id,
        excused: !!row.excused,
      })
    );

  let completionKnown = false;
  const memberIds = input.memberUserIds || [];
  if (!expectationResult.error && (input.viewerUserId || memberIds.length)) {
    const [sessions, logs] = await Promise.all([
      input.viewerUserId
        ? supabase
            .from('st_workout_sessions')
            .select('user_id, workout_id, log_date, status, expectation_id')
            .eq('user_id', input.viewerUserId)
            .gte('log_date', from)
            .lte('log_date', to)
        : Promise.resolve({ data: [], error: null }),
      memberIds.length
        ? fetchGroupScopedSetLogs(supabase, input.teamId, memberIds, { from, to, limit: 400 })
        : Promise.resolve({ data: [], pending: false, error: null }),
    ]);
    completionKnown = !sessions.error || !logs.error;
    if (completionKnown) {
      expectations = attachExpectationCompletion(
        expectations,
        (sessions.data || []).map(
          (row: { user_id: string; workout_id?: string | null; log_date?: string | null; expectation_id?: string | null; status?: string | null }) => ({
            userId: row.user_id,
            workoutId: row.workout_id,
            logDate: row.log_date ? String(row.log_date).slice(0, 10) : null,
            expectationId: row.expectation_id,
            status: mapSessionStatus(row.status),
          })
        ),
        (logs.data || [])
          .filter((row: { completed?: boolean; user_id?: string; log_date?: string }) => row.completed !== false && row.user_id && row.log_date)
          .map((row: { user_id: string; log_date: string }) => ({
            userId: row.user_id,
            date: String(row.log_date).slice(0, 10),
          }))
      );
    }
  }

  const missing = scheduleSetupMissing(expectationResult.error?.message);
  return {
    expectations,
    expectationsAvailable: !expectationResult.error,
    completionKnown,
    notice: missing || expectationResult.error ? CALENDAR_DEPENDENCY_NOTICE : null,
    from,
    to,
  };
}
