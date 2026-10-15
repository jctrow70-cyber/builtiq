import { isExplicitIndividualAssignment } from './trainingSources';
import { addDaysYmd, mondayOfWeek, programEndDate, sundayOfWeek, weekForDate } from '../training/programCalendar';
import {
  buildProgramExpectationDates,
  expectationDisplayState,
  scheduleCycleWeeks,
  type ExpectationSessionStatus,
} from '../training/unifiedSchedule';

/** Monday-first order used when showing a member's program days. */
export const PROGRAM_WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const WEEKDAY_ALIASES: Record<string, (typeof PROGRAM_WEEKDAY_ORDER)[number]> = {
  mon: 'Mon',
  monday: 'Mon',
  tue: 'Tue',
  tues: 'Tue',
  tuesday: 'Tue',
  wed: 'Wed',
  wednesday: 'Wed',
  thu: 'Thu',
  thur: 'Thu',
  thurs: 'Thu',
  thursday: 'Thu',
  fri: 'Fri',
  friday: 'Fri',
  sat: 'Sat',
  saturday: 'Sat',
  sun: 'Sun',
  sunday: 'Sun',
};

const FULL_WEEKDAY: Record<(typeof PROGRAM_WEEKDAY_ORDER)[number], string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export type GroupTrainingStatus =
  | 'needs_plan'
  | 'schedule_review'
  | 'paused'
  | 'schedule_paused'
  | 'needs_attention'
  | 'on_track'
  | 'personal';

export type GroupTrainingPlanKind = 'group_program' | 'custom_fork' | 'personal' | 'none';

export type GroupTrainingExerciseRef = {
  id?: string | null;
  name?: string | null;
  sortOrder?: number | null;
  sets?: Array<{ setNumber?: number | null; reps?: string | null; weight?: string | null; restSeconds?: number | null }>;
};

export type GroupTrainingWorkoutRef = {
  id?: string | null;
  week?: number | null;
  dayLabel?: string | null;
  dayOrder?: number | null;
  title?: string | null;
  exercises?: GroupTrainingExerciseRef[];
};

export type GroupTrainingProgramRef = {
  id: string;
  name: string;
  startDate?: string | null;
  weeks?: number | null;
  cycleLengthWeeks?: number | null;
  visibility?: string | null;
  sourceProgramId?: string | null;
  workouts?: GroupTrainingWorkoutRef[];
};

export type GroupTrainingMemberInput = {
  userId: string;
  name: string;
  trainingSource?: string | null;
  isActiveParticipant?: boolean;
  assignment?: {
    assignmentType?: string | null;
    programId?: string | null;
    programName?: string | null;
  } | null;
  enrollment?: {
    programId?: string | null;
    status?: string | null;
    startsOn?: string | null;
    expectationEnabled?: boolean | null;
  } | null;
  schedule?: {
    mode?: 'program_days' | 'custom_weekdays' | null;
    weekdays?: string[] | null;
  } | null;
};

export type GroupTrainingExpectationInput = {
  id?: string | null;
  userId: string;
  sourceKey: string;
  teamId?: string | null;
  origin?: 'program' | 'assignment' | null;
  scheduledDate: string;
  title: string;
  dayLabel?: string | null;
  workoutId?: string | null;
  excused?: boolean;
  sessionStatus?: ExpectationSessionStatus;
};

export type GroupTrainingWeekState =
  | 'Completed'
  | 'Partial'
  | 'Skipped'
  | 'Missed'
  | 'Due today'
  | 'Scheduled'
  | 'Upcoming'
  | 'Excused'
  | 'Not confirmed';

export type GroupTrainingWeekItem = {
  date: string;
  title: string;
  dayLabel: string;
  state: GroupTrainingWeekState;
  workoutId: string | null;
  origin: 'program' | 'assignment';
  excused: boolean;
  hasSession: boolean;
};

export type GroupTrainingNextWorkout = {
  date: string;
  title: string;
  dayLabel: string;
  label: string;
};

export type GroupTrainingMemberRow = {
  userId: string;
  name: string;
  planKind: GroupTrainingPlanKind;
  planName: string;
  programId: string | null;
  scheduleDays: string;
  scheduleNeedsReview: boolean;
  scheduleReviewDetail: string | null;
  expectationsEnabled: boolean;
  nextWorkout: GroupTrainingNextWorkout | null;
  status: GroupTrainingStatus;
  statusLabel: string;
  missedCount: number;
  missedDates: string[];
  programWeeks: number | null;
  programStart: string | null;
  currentProgramWeek: number | null;
  programEndsOn: string | null;
  weekItems: GroupTrainingWeekItem[];
};

export type GroupTrainingBoard = {
  members: GroupTrainingMemberRow[];
  summary: {
    members: number;
    assigned: number;
    needsPlan: number;
    workoutsThisWeek: number;
  };
};

const STATUS_LABEL: Record<GroupTrainingStatus, string> = {
  needs_plan: 'No program assigned',
  schedule_review: 'Schedule needs review',
  paused: 'Paused',
  schedule_paused: 'Schedule paused',
  needs_attention: 'Missed workout',
  on_track: 'On track',
  personal: 'Personal training',
};

function missedStatusLabel(missed: number): string {
  return missed === 1 ? 'Missed 1 workout' : `Missed ${missed} workouts`;
}

export function normalizeProgramDayLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const alias = WEEKDAY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  const exact = PROGRAM_WEEKDAY_ORDER.find((day) => day.toLowerCase() === raw.toLowerCase());
  return exact || raw;
}

export function programWeekdayIndex(dayLabel: string | null | undefined): number {
  const label = normalizeProgramDayLabel(dayLabel);
  const index = PROGRAM_WEEKDAY_ORDER.indexOf(label as (typeof PROGRAM_WEEKDAY_ORDER)[number]);
  return index < 0 ? 99 : index;
}

/**
 * Stable session order for one program week.
 * day_order wins. Equal day_order breaks by Monday-first weekday, then workout id.
 */
function sessionOrder(value: number | null | undefined): number {
  if (value == null) return Number.MAX_SAFE_INTEGER;
  const order = Number(value);
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

export function compareProgramSessions(
  a: Pick<GroupTrainingWorkoutRef, 'id' | 'dayLabel' | 'dayOrder'>,
  b: Pick<GroupTrainingWorkoutRef, 'id' | 'dayLabel' | 'dayOrder'>
): number {
  const orderA = sessionOrder(a.dayOrder);
  const orderB = sessionOrder(b.dayOrder);
  if (orderA !== orderB) return orderA - orderB;
  const dayA = programWeekdayIndex(a.dayLabel);
  const dayB = programWeekdayIndex(b.dayLabel);
  if (dayA !== dayB) return dayA - dayB;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function orderedProgramSessions(workouts: GroupTrainingWorkoutRef[], week: number): GroupTrainingWorkoutRef[] {
  return workouts
    .filter((workout) => Number(workout.week) === week && normalizeProgramDayLabel(workout.dayLabel))
    .slice()
    .sort(compareProgramSessions);
}

/** Every session in a week, including rows without a day label. Order is day_order, weekday, then workout id. */
export function orderedWeekSessions(workouts: GroupTrainingWorkoutRef[], week: number): GroupTrainingWorkoutRef[] {
  return workouts
    .filter((workout) => Number(workout.week) === week)
    .slice()
    .sort(compareProgramSessions);
}

function applicableWeeks(workouts: GroupTrainingWorkoutRef[]): number[] {
  return weeksInProgram(workouts).filter((week) => orderedWeekSessions(workouts, week).length > 0);
}

/** Why custom weekdays cannot be applied. Null means the program structure is usable. */
export function customScheduleStructureError(workouts: GroupTrainingWorkoutRef[] | null | undefined): string | null {
  const rows = workouts || [];
  const weeks = applicableWeeks(rows);
  if (!weeks.length) return 'This program has no workouts to schedule.';
  const counts = weeks.map((week) => orderedWeekSessions(rows, week).length);
  if (new Set(counts).size > 1) {
    return 'This program’s weeks do not have the same number of workouts, so custom days cannot be applied.';
  }
  for (const week of weeks) {
    const sessions = orderedWeekSessions(rows, week);
    const keys = new Set(sessions.map((session) => `${sessionOrder(session.dayOrder)}:${programWeekdayIndex(session.dayLabel)}`));
    if (keys.size < sessions.length) {
      return 'Two workouts in the same week do not have a clear order. Set their order in Program Design before choosing custom days.';
    }
  }
  return null;
}

function weeksInProgram(workouts: GroupTrainingWorkoutRef[]): number[] {
  return Array.from(new Set(workouts.map((workout) => Number(workout.week)).filter((week) => Number.isFinite(week) && week > 0))).sort(
    (a, b) => a - b
  );
}

function weekSignature(workouts: GroupTrainingWorkoutRef[], week: number): string {
  return orderedProgramSessions(workouts, week)
    .map((workout) => normalizeProgramDayLabel(workout.dayLabel))
    .join('|');
}

/** True when program weeks do not share the same ordered training days. */
export function programScheduleNeedsReview(workouts: GroupTrainingWorkoutRef[] | null | undefined): boolean {
  const rows = workouts || [];
  const signatures = weeksInProgram(rows)
    .map((week) => weekSignature(rows, week))
    .filter((signature) => signature.length > 0);
  return new Set(signatures).size > 1;
}

/** Training days from the first week that has day labels, shown Monday through Sunday. */
export function programScheduledDayLabels(workouts: GroupTrainingWorkoutRef[] | null | undefined): string[] {
  const rows = workouts || [];
  for (const week of weeksInProgram(rows)) {
    const labels = Array.from(new Set(orderedProgramSessions(rows, week).map((workout) => normalizeProgramDayLabel(workout.dayLabel))));
    if (!labels.length) continue;
    return labels.sort((a, b) => programWeekdayIndex(a) - programWeekdayIndex(b));
  }
  return [];
}

export function formatScheduledDays(labels: string[]): string {
  return labels.length ? labels.join(', ') : '—';
}

export function fullWeekdayName(dayLabel: string | null | undefined): string {
  const short = normalizeProgramDayLabel(dayLabel);
  return FULL_WEEKDAY[short as (typeof PROGRAM_WEEKDAY_ORDER)[number]] || short || 'Workout';
}

export function isExplicitPersonalTraining(
  member: Pick<GroupTrainingMemberInput, 'trainingSource'>,
  assignment: GroupTrainingMemberInput['assignment']
): boolean {
  const type = String(assignment?.assignmentType || '').toLowerCase();
  if (type === 'personal') return true;
  if (isExplicitIndividualAssignment(type)) return false;
  return String(member.trainingSource || 'team').toLowerCase() === 'personal';
}

function programById(programs: GroupTrainingProgramRef[]): Map<string, GroupTrainingProgramRef> {
  return new Map(programs.map((program) => [program.id, program]));
}

export function resolveMemberGroupPlan(input: {
  member: GroupTrainingMemberInput;
  programs: GroupTrainingProgramRef[];
  defaultProgramId?: string | null;
}): { kind: GroupTrainingPlanKind; programId: string | null; programName: string; program: GroupTrainingProgramRef | null } {
  if (isExplicitPersonalTraining(input.member, input.member.assignment)) {
    return { kind: 'personal', programId: null, programName: 'Personal training', program: null };
  }

  const programs = programById(input.programs);
  const enrollment = input.member.enrollment;
  const enrollmentOpen = !!enrollment?.programId && String(enrollment.status || 'active') !== 'ended';
  const individual = isExplicitIndividualAssignment(input.member.assignment?.assignmentType)
    ? input.member.assignment?.programId || null
    : null;
  const programId = enrollmentOpen ? enrollment?.programId || null : individual;

  if (programId) {
    const program = programs.get(programId) || null;
    if (program) {
      const fork = program.visibility === 'personal' && !!program.sourceProgramId;
      return {
        kind: fork ? 'custom_fork' : 'group_program',
        programId,
        programName: program.name || 'Group plan',
        program,
      };
    }
    const assignmentName =
      input.member.assignment?.programId === programId ? String(input.member.assignment?.programName || '').trim() : '';
    return {
      kind: 'custom_fork',
      programId,
      programName: assignmentName || 'Custom group plan',
      program: null,
    };
  }

  const followGroup = String(input.member.trainingSource || 'team').toLowerCase() !== 'personal';
  const defaultProgram = input.defaultProgramId ? programs.get(input.defaultProgramId) || null : null;
  if (followGroup && defaultProgram) {
    return {
      kind: 'group_program',
      programId: defaultProgram.id,
      programName: defaultProgram.name || 'Group plan',
      program: defaultProgram,
    };
  }

  return { kind: 'none', programId: null, programName: 'Not assigned', program: null };
}

function isPaused(member: GroupTrainingMemberInput): boolean {
  if (member.isActiveParticipant === false) return true;
  return String(member.enrollment?.status || '') === 'paused';
}

function groupExpectationsFor(
  expectations: GroupTrainingExpectationInput[],
  teamId: string,
  userId: string
): GroupTrainingExpectationInput[] {
  const sourceKey = `group:${teamId}`;
  return expectations.filter((row) => row.userId === userId && row.sourceKey === sourceKey);
}

/** Same completion rules as the unified schedule. Today's incomplete workout stays Due today. */
export function groupExpectationState(
  row: Pick<GroupTrainingExpectationInput, 'scheduledDate' | 'excused' | 'sessionStatus'>,
  today: string,
  completionKnown: boolean,
  userMissed: number | null = null,
  upcoming: 'Scheduled' | 'Upcoming' = 'Scheduled'
): GroupTrainingWeekState {
  const display = expectationDisplayState({
    scheduledDate: row.scheduledDate,
    localToday: today,
    excused: row.excused,
    sessionStatus: row.sessionStatus,
  });
  if (display === 'Today') return 'Due today';
  if (display === 'Upcoming') return upcoming;
  if (display === 'Missed') {
    if (!completionKnown && !row.sessionStatus) return 'Not confirmed';
    if (userMissed === 0) return 'Not confirmed';
    return 'Missed';
  }
  return display;
}

function weekState(
  row: GroupTrainingExpectationInput,
  today: string,
  completionKnown: boolean,
  userMissed: number | null
): GroupTrainingWeekState {
  return groupExpectationState(row, today, completionKnown, userMissed, 'Scheduled');
}

function missedInWindow(rows: GroupTrainingExpectationInput[], today: string): number {
  const start = addDaysYmd(today, -7);
  return rows.filter((row) => {
    if (row.scheduledDate < start || row.scheduledDate >= today) return false;
    return (
      expectationDisplayState({
        scheduledDate: row.scheduledDate,
        localToday: today,
        excused: row.excused,
        sessionStatus: row.sessionStatus,
      }) === 'Missed'
    );
  }).length;
}

function workoutLabel(dayLabel: string, title: string): string {
  const day = fullWeekdayName(dayLabel);
  const name = title.trim() || 'Workout';
  if (!dayLabel || name.toLowerCase() === day.toLowerCase()) return name;
  return `${day} · ${name}`;
}

function derivedProgramDates(input: {
  program: GroupTrainingProgramRef;
  startsOn?: string | null;
  today: string;
}): Array<{ date: string; title: string; dayLabel: string; workoutId: string }> {
  const workouts = (input.program.workouts || [])
    .map((workout) => ({
      id: String(workout.id || ''),
      week: Number(workout.week || 1),
      dayLabel: normalizeProgramDayLabel(workout.dayLabel),
      title: workout.title || normalizeProgramDayLabel(workout.dayLabel) || 'Workout',
    }))
    .filter((workout) => workout.id && workout.dayLabel);
  if (!workouts.length) return [];
  return buildProgramExpectationDates({
    sourceKind: 'group',
    startsOn: input.startsOn,
    programStart: input.program.startDate,
    cycleWeeks: scheduleCycleWeeks({
      weeks: input.program.weeks,
      cycle_length_weeks: input.program.cycleLengthWeeks,
    }),
    workouts,
    effectiveOn: input.today,
  }).map((row) => ({
    date: row.scheduledDate,
    title: row.title,
    dayLabel: row.dayLabel,
    workoutId: row.workoutId,
  }));
}

function chooseStatus(input: {
  paused: boolean;
  expectationsEnabled: boolean;
  planKind: GroupTrainingPlanKind;
  scheduleNeedsReview: boolean;
  missed: number;
}): GroupTrainingStatus {
  if (input.paused) return 'paused';
  if (input.planKind === 'personal') return 'personal';
  if (input.planKind === 'none') return 'needs_plan';
  if (!input.expectationsEnabled && (input.planKind === 'group_program' || input.planKind === 'custom_fork')) return 'schedule_paused';
  if (input.missed > 0) return 'needs_attention';
  if (input.scheduleNeedsReview) return 'schedule_review';
  return 'on_track';
}

export function buildGroupTrainingBoard(input: {
  teamId: string;
  today: string;
  canManage: boolean;
  viewerUserId: string;
  members: GroupTrainingMemberInput[];
  programs: GroupTrainingProgramRef[];
  defaultProgramId?: string | null;
  expectations: GroupTrainingExpectationInput[];
  expectationsAvailable: boolean;
  completionKnown: boolean;
  missedByUser?: Record<string, number> | null;
}): GroupTrainingBoard {
  const visible = input.canManage
    ? input.members
    : input.members.filter((member) => member.userId === input.viewerUserId);
  const weekStart = mondayOfWeek(input.today);
  const weekEnd = sundayOfWeek(input.today);
  const rows: GroupTrainingMemberRow[] = visible.map((member) => {
    const plan = resolveMemberGroupPlan({
      member,
      programs: input.programs,
      defaultProgramId: input.defaultProgramId,
    });
    const paused = isPaused(member);
    const ownExpectations = groupExpectationsFor(input.expectations, input.teamId, member.userId).slice().sort((a, b) => {
      if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate < b.scheduledDate ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
    const programReview = plan.program ? programScheduleNeedsReview(plan.program.workouts) : false;
    const customDays =
      member.schedule?.mode === 'custom_weekdays'
        ? (member.schedule.weekdays || []).map((day) => normalizeProgramDayLabel(day)).filter(Boolean)
        : [];
    const customCount = customDays.length;
    const structureError = customCount && plan.program ? customScheduleStructureError(plan.program.workouts) : null;
    const sessionCount = plan.program ? orderedWeekSessions(plan.program.workouts || [], applicableWeeks(plan.program.workouts || [])[0] || 0).length : 0;
    const countMismatch = customCount > 0 && sessionCount > 0 && customCount !== sessionCount;
    const scheduleNeedsReview = programReview || !!structureError || countMismatch;
    const scheduleReviewDetail = countMismatch
      ? `This schedule has ${customCount} days and the program now has ${sessionCount} workouts each week. Future workouts stay as they are until the schedule is updated.`
      : structureError
        ? `${structureError} Future workouts stay as they are until the schedule is updated.`
        : programReview
          ? 'This program’s weeks do not share the same training days.'
          : null;
    const scheduleDays = formatScheduledDays(customDays.length ? customDays : plan.program ? programScheduledDayLabels(plan.program.workouts) : []);
    const userMissed = input.missedByUser ? Number(input.missedByUser[member.userId] || 0) : null;
    const missed =
      userMissed != null
        ? userMissed
        : input.completionKnown
          ? missedInWindow(ownExpectations, input.today)
          : 0;
    const missedWindowStart = userMissed != null ? mondayOfWeek(input.today) : addDaysYmd(input.today, -7);
    const missedDates = ownExpectations
      .filter((row) => row.scheduledDate < input.today && row.scheduledDate >= missedWindowStart)
      .filter(
        (row) =>
          groupExpectationState(row, input.today, input.completionKnown || userMissed != null, userMissed, 'Upcoming') === 'Missed'
      )
      .map((row) => row.scheduledDate);
    const expectationsEnabled = member.enrollment?.expectationEnabled !== false;
    const status = chooseStatus({
      paused,
      expectationsEnabled,
      planKind: plan.kind,
      scheduleNeedsReview,
      missed,
    });
    const programStart = member.enrollment?.startsOn || plan.program?.startDate || null;
    const programWeeks = plan.program?.weeks ? Number(plan.program.weeks) : null;
    const currentProgramWeek = programStart && programWeeks ? weekForDate(programStart, input.today, programWeeks) : null;
    const programEndsOn = programStart && programWeeks ? programEndDate(programStart, programWeeks) : null;
    const endingSoon =
      status === 'on_track' &&
      !!programEndsOn &&
      programEndsOn >= input.today &&
      programEndsOn <= addDaysYmd(input.today, 7);

    let weekItems: GroupTrainingWeekItem[] = [];
    let nextWorkout: GroupTrainingNextWorkout | null = null;

    if (input.expectationsAvailable) {
      weekItems = ownExpectations
        .filter((row) => row.scheduledDate >= weekStart && row.scheduledDate <= weekEnd)
        .map((row) => ({
          date: row.scheduledDate,
          title: row.title || 'Workout',
          dayLabel: normalizeProgramDayLabel(row.dayLabel),
          state: weekState(row, input.today, input.completionKnown, userMissed),
          workoutId: row.workoutId || null,
          origin: row.origin === 'assignment' ? 'assignment' as const : 'program' as const,
          excused: !!row.excused,
          hasSession: !!row.sessionStatus && row.sessionStatus !== 'not_started',
        }));
      const next = ownExpectations.find((row) => {
        if (row.excused || row.scheduledDate < input.today) return false;
        if (row.sessionStatus === 'completed') return false;
        return true;
      });
      if (next) {
        const dayLabel = normalizeProgramDayLabel(next.dayLabel);
        nextWorkout = {
          date: next.scheduledDate,
          title: next.title || 'Workout',
          dayLabel,
          label: workoutLabel(dayLabel, next.title || 'Workout'),
        };
      }
    } else if (plan.program && plan.kind !== 'personal' && plan.kind !== 'none' && !paused) {
      const derived = derivedProgramDates({
        program: plan.program,
        startsOn: member.enrollment?.startsOn,
        today: input.today,
      });
      weekItems = derived
        .filter((row) => row.date >= weekStart && row.date <= weekEnd)
        .map((row) => ({
          date: row.date,
          title: row.title,
          dayLabel: normalizeProgramDayLabel(row.dayLabel),
          state: 'Scheduled' as const,
          workoutId: row.workoutId || null,
          origin: 'program' as const,
          excused: false,
          hasSession: false,
        }));
      const next = derived.find((row) => row.date >= input.today);
      if (next) {
        nextWorkout = {
          date: next.date,
          title: next.title,
          dayLabel: normalizeProgramDayLabel(next.dayLabel),
          label: workoutLabel(next.dayLabel, next.title),
        };
      }
    }

    return {
      userId: member.userId,
      name: member.name || 'Member',
      planKind: plan.kind,
      planName: plan.programName,
      programId: plan.programId,
      scheduleDays,
      scheduleNeedsReview,
      scheduleReviewDetail,
      expectationsEnabled,
      nextWorkout,
      status,
      statusLabel: status === 'needs_attention' ? missedStatusLabel(missed) : endingSoon ? 'Program ending soon' : STATUS_LABEL[status],
      missedCount: missed,
      missedDates,
      programWeeks,
      programStart,
      currentProgramWeek,
      programEndsOn,
      weekItems,
    };
  });

  const workoutsThisWeek = input.expectationsAvailable
    ? rows.reduce((sum, row) => sum + row.weekItems.length, 0)
    : rows.reduce((sum, row) => sum + row.weekItems.length, 0);

  return {
    members: rows,
    summary: {
      members: rows.length,
      assigned: rows.filter((row) => row.planKind === 'group_program' || row.planKind === 'custom_fork').length,
      needsPlan: rows.filter((row) => row.status === 'needs_plan').length,
      workoutsThisWeek,
    },
  };
}

export function sessionMatchesExpectation(
  session: { expectationId?: string | null; workoutId?: string | null; logDate?: string | null; userId: string },
  expectation: GroupTrainingExpectationInput
): boolean {
  if (session.userId !== expectation.userId) return false;
  if (session.expectationId && expectation.id && session.expectationId === expectation.id) return true;
  return !!session.workoutId && session.workoutId === expectation.workoutId && session.logDate === expectation.scheduledDate;
}

export function attachExpectationCompletion(
  expectations: GroupTrainingExpectationInput[],
  sessions: Array<{
    userId: string;
    workoutId?: string | null;
    logDate?: string | null;
    expectationId?: string | null;
    status?: string | null;
  }>,
  completedLogKeys: Array<{ userId: string; date: string }>
): GroupTrainingExpectationInput[] {
  const logs = new Set(completedLogKeys.map((row) => `${row.userId}|${row.date}`));
  return expectations.map((row) => {
    const session = sessions.find((item) =>
      sessionMatchesExpectation(item, row)
    );
    if (session?.status) {
      return { ...row, sessionStatus: session.status as ExpectationSessionStatus };
    }
    if (logs.has(`${row.userId}|${row.scheduledDate}`)) {
      return { ...row, sessionStatus: 'completed' };
    }
    return row;
  });
}
