import { isExplicitIndividualAssignment } from './trainingSources';
import { addDaysYmd, mondayOfWeek, programEndDate, sundayOfWeek, weekForDate } from '../training/programCalendar';
import {
  buildProgramExpectationDates,
  expectationDisplayState,
  pickFulfillingSession,
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

export type GroupTrainingSetRef = {
  id?: string | null;
  setNumber?: number | null;
  reps?: string | null;
  weight?: string | null;
  restSeconds?: number | null;
  setType?: string | null;
  rir?: string | null;
};

export type GroupTrainingExerciseRef = {
  id?: string | null;
  name?: string | null;
  sortOrder?: number | null;
  supersetGroupId?: string | null;
  supersetLabel?: string | null;
  supersetOrder?: number | null;
  sets?: GroupTrainingSetRef[];
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

/** Map one complete program row. Empty workout arrays stay empty so a later stub cannot fill them. */
export function programRefFromRecord(program: {
  id?: string | null;
  name?: string | null;
  start_date?: string | null;
  startDate?: string | null;
  weeks?: number | null;
  cycle_length_weeks?: number | null;
  cycleLengthWeeks?: number | null;
  visibility?: string | null;
  source_program_id?: string | null;
  sourceProgramId?: string | null;
  st_workouts?: unknown[] | null;
  workouts?: unknown[] | null;
} | null | undefined): GroupTrainingProgramRef | null {
  if (!program?.id) return null;
  const workouts = (program.st_workouts || program.workouts || []) as Array<Record<string, unknown>>;
  return {
    id: program.id,
    name: program.name || 'Program',
    startDate: program.start_date || program.startDate || null,
    weeks: program.weeks ?? null,
    cycleLengthWeeks: program.cycle_length_weeks ?? program.cycleLengthWeeks ?? null,
    visibility: program.visibility || null,
    sourceProgramId: program.source_program_id || program.sourceProgramId || null,
    workouts: workouts.map((workout) => {
      const exercises = (workout.st_exercises || workout.exercises || []) as Array<Record<string, unknown>>;
      return {
        id: (workout.id as string) || null,
        week: (workout.week as number) ?? null,
        dayLabel: (workout.day_label || workout.dayLabel) as string | null,
        dayOrder: (workout.day_order ?? workout.dayOrder) as number | null,
        title: (workout.workout_type || workout.title) as string | null,
        exercises: exercises.map((exercise) => {
          const sets = ((exercise.st_planned_sets || exercise.sets || []) as Array<Record<string, unknown>>).filter(
            (set) => !set.is_deleted
          );
          return {
            id: (exercise.id as string) || null,
            name: (exercise.name || exercise.exercise_name || 'Exercise') as string,
            sortOrder: (exercise.sort_order ?? exercise.sortOrder ?? 0) as number,
            supersetGroupId: (exercise.superset_group_id || exercise.supersetGroupId || null) as string | null,
            supersetLabel: (exercise.superset_label || exercise.supersetLabel || null) as string | null,
            supersetOrder: (exercise.superset_order ?? exercise.supersetOrder ?? null) as number | null,
            sets: sets.map((set) => ({
              id: (set.id as string) || null,
              setNumber: (set.set_number ?? set.setNumber) as number | null,
              reps: (set.target_reps || set.reps || '') as string,
              weight: (set.target_weight || set.weight || '') as string,
              restSeconds: (set.rest_seconds ?? set.restSeconds ?? null) as number | null,
              setType: (set.set_type || set.setType || null) as string | null,
              rir: set.target_rir == null && set.rir == null ? null : String(set.target_rir ?? set.rir),
            })),
          };
        }),
      };
    }),
  };
}

/** Accept a direct program read or the assigned-program function only when the id is the enrollment program. */
export function assignedProgramFromPayload(payload: unknown, enrollmentProgramId: string): GroupTrainingProgramRef | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { id?: string | null };
  if (!record.id || record.id !== enrollmentProgramId) return null;
  return programRefFromRecord(record);
}

export type PlanExerciseGroup = {
  key: string;
  label: string | null;
  exercises: GroupTrainingExerciseRef[];
};

/** Group exercises that share a superset id. Exercises without that field stay in order on their own. */
export function planExerciseGroups(exercises: GroupTrainingExerciseRef[] | null | undefined): PlanExerciseGroup[] {
  const sorted = [...(exercises || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name || '').localeCompare(String(b.name || '')));
  const groups: PlanExerciseGroup[] = [];
  const placed = new Set<string>();
  sorted.forEach((exercise) => {
    const groupId = exercise.supersetGroupId || '';
    if (!groupId) {
      groups.push({ key: exercise.id || exercise.name || `exercise-${groups.length}`, label: null, exercises: [exercise] });
      return;
    }
    if (placed.has(groupId)) return;
    placed.add(groupId);
    const members = sorted
      .filter((row) => row.supersetGroupId === groupId)
      .sort((a, b) => (a.supersetOrder ?? a.sortOrder ?? 0) - (b.supersetOrder ?? b.sortOrder ?? 0));
    groups.push({
      key: groupId,
      label: members.find((row) => row.supersetLabel)?.supersetLabel || 'Superset',
      exercises: members,
    });
  });
  return groups;
}

export type GroupExtraActivity = {
  id: string;
  userId: string;
  date: string;
  title: string;
  activityType: string;
  workoutId: string | null;
  required: boolean;
  completed: boolean;
};

export function extraActivityLabel(required: boolean): string {
  return required ? 'Extra · required' : 'Extra';
}

/** Required extras stay out of program missed totals. */
export function requiredExtraStanding(
  extra: Pick<GroupExtraActivity, 'date' | 'required' | 'completed'>,
  today: string
): 'completed' | 'open' | 'not_completed' {
  if (extra.completed) return 'completed';
  if (!extra.required) return 'open';
  return extra.date < today ? 'not_completed' : 'open';
}

export function groupExtraWeekItems(
  extras: GroupExtraActivity[],
  userId: string,
  weekStart: string,
  weekEnd: string
): GroupTrainingWeekItem[] {
  return extras
    .filter((extra) => extra.userId === userId && extra.date >= weekStart && extra.date <= weekEnd)
    .map((extra) => ({
      date: extra.date,
      title: extra.title || 'Activity',
      dayLabel: '',
      state: extra.completed ? 'Completed' as const : 'Extra' as const,
      workoutId: extra.workoutId,
      origin: 'extra' as const,
      excused: false,
      hasSession: extra.completed,
      required: extra.required,
      activityType: extra.activityType,
    }));
}

export type AddActivityChoice = { workoutId: string; title: string };

/** Workouts the current assignment rule can accept. A personal enrollment copy is listed as blocked, not as a silent empty menu. */
export function addActivityChoices(
  program: GroupTrainingProgramRef | null | undefined,
  load: 'loading' | 'ready' | 'denied' | 'empty'
): { reason: 'loading' | 'personal' | 'unread' | 'empty' | 'ready'; choices: AddActivityChoice[] } {
  if (load === 'loading') return { reason: 'loading', choices: [] };
  if (load === 'denied' || !program) return { reason: 'unread', choices: [] };
  if (program.visibility === 'personal') return { reason: 'personal', choices: [] };
  const seen = new Set<string>();
  const choices: AddActivityChoice[] = [];
  (program.workouts || []).forEach((workout) => {
    const workoutId = workout.id || '';
    if (!workoutId || seen.has(workoutId)) return;
    seen.add(workoutId);
    const place = [workout.week ? `Week ${workout.week}` : '', workout.dayLabel || ''].filter(Boolean).join(' ');
    choices.push({ workoutId, title: [workout.title || 'Workout', place].filter(Boolean).join(' · ') });
  });
  if (!choices.length) return { reason: 'empty', choices: [] };
  return { reason: 'ready', choices };
}

export type GroupActivityLog = {
  planned_set_id?: string | null;
  log_date?: string | null;
  completed?: boolean | null;
  actual_reps?: string | number | null;
  actual_weight?: string | number | null;
  snapshot_exercise_name?: string | null;
  snapshot_set_type?: string | null;
};

export type PrescriptionComparisonRow = {
  key: string;
  exerciseKey: string;
  exercise: string;
  planned: string;
  logged: string;
  kind: 'matched' | 'unlogged' | 'extra';
};

function exerciseKeyFor(exercises: GroupTrainingExerciseRef[] | null | undefined, exercise: GroupTrainingExerciseRef) {
  const index = (exercises || []).indexOf(exercise);
  return exercise.id || `exercise-${index}`;
}

function plannedSetText(set: GroupTrainingSetRef): string {
  return [
    set.setType || null,
    set.reps ? `${set.reps} reps` : null,
    set.weight || null,
    set.rir != null && String(set.rir).trim() ? `RIR ${set.rir}` : null,
    set.restSeconds != null ? `${set.restSeconds}s rest` : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Planned set';
}

function loggedSetText(log: GroupActivityLog): string {
  const parts = [
    log.actual_reps != null && String(log.actual_reps).trim() ? `${log.actual_reps} reps` : null,
    log.actual_weight != null && String(log.actual_weight).trim() ? String(log.actual_weight) : null,
    log.completed ? 'completed' : null,
  ].filter(Boolean);
  return parts.join(' · ') || (log.completed ? 'Completed' : 'Logged without reps or weight');
}

/**
 * Pair a workout prescription with group-attributed logs for one date.
 * Logs without a planned-set id stay separate. This does not identify who changed the program.
 */
export function comparePrescriptionToGroupLogs(
  exercises: GroupTrainingExerciseRef[] | null | undefined,
  logs: GroupActivityLog[] | null | undefined,
  date: string
): { canMatch: boolean; rows: PrescriptionComparisonRow[] } {
  const dayLogs = (logs || []).filter((log) => String(log.log_date || '').slice(0, 10) === date);
  const planned = (exercises || []).flatMap((exercise) =>
    (exercise.sets || []).map((set, index) => ({ exercise, set, index }))
  );
  const canMatch = planned.some((row) => !!row.set.id);
  const used = new Set<GroupActivityLog>();
  const rows: PrescriptionComparisonRow[] = planned.map((row) => {
    const match = canMatch && row.set.id ? dayLogs.find((log) => log.planned_set_id === row.set.id && !used.has(log)) : undefined;
    if (match) used.add(match);
    return {
      key: row.set.id || `${exerciseKeyFor(exercises, row.exercise)}-${row.index}`,
      exerciseKey: exerciseKeyFor(exercises, row.exercise),
      exercise: row.exercise.name || 'Exercise',
      planned: plannedSetText(row.set),
      logged: match ? loggedSetText(match) : canMatch ? 'Not logged' : 'Set id is not on this program read',
      kind: match ? 'matched' : 'unlogged',
    };
  });
  dayLogs.forEach((log, index) => {
    if (log.planned_set_id && planned.some((row) => row.set.id === log.planned_set_id)) return;
    if (used.has(log)) return;
    rows.push({
      key: `extra-${index}`,
      exerciseKey: `extra-${index}`,
      exercise: log.snapshot_exercise_name || 'Logged set',
      planned: log.planned_set_id ? 'Not on this workout prescription' : 'No planned set',
      logged: loggedSetText(log),
      kind: 'extra',
    });
  });
  return { canMatch, rows };
}

export type PrescriptionExerciseBlock = {
  key: string;
  label: string | null;
  exercises: Array<{ key: string; name: string; sets: PrescriptionComparisonRow[] }>;
};

/** One block per exercise occurrence, with each planned set underneath. Supersets stay grouped. */
export function prescriptionExerciseBlocks(
  exercises: GroupTrainingExerciseRef[] | null | undefined,
  logs: GroupActivityLog[] | null | undefined,
  date: string
): PrescriptionExerciseBlock[] {
  const comparison = comparePrescriptionToGroupLogs(exercises, logs, date);
  const rowsFor = (exercise: GroupTrainingExerciseRef) => {
    const key = exerciseKeyFor(exercises, exercise);
    return comparison.rows.filter((row) => row.exerciseKey === key);
  };
  const blocks: PrescriptionExerciseBlock[] = planExerciseGroups(exercises).map((group, groupIndex) => ({
    key: `${group.key}-${groupIndex}`,
    label: group.label,
    exercises: group.exercises.map((exercise) => ({
      key: exerciseKeyFor(exercises, exercise),
      name: exercise.name || 'Exercise',
      sets: rowsFor(exercise),
    })),
  }));
  const extras = comparison.rows.filter((row) => row.kind === 'extra');
  if (extras.length) {
    blocks.push({
      key: 'extra-sets',
      label: null,
      exercises: extras.map((row) => ({ key: row.exerciseKey, name: row.exercise, sets: [row] })),
    });
  }
  return blocks;
}

export function summarizeGroupExtras(
  extras: Array<Pick<GroupExtraActivity, 'date' | 'required' | 'completed'>>,
  today: string
) {
  let requiredCompleted = 0;
  let requiredOpen = 0;
  let optional = 0;
  extras.forEach((extra) => {
    if (!extra.required) {
      optional += 1;
      return;
    }
    if (requiredExtraStanding(extra, today) === 'completed') requiredCompleted += 1;
    else requiredOpen += 1;
  });
  return { requiredCompleted, requiredOpen, optional, total: extras.length };
}

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
  authoritativeStatus?: GroupExpectationAuthoritativeStatus | null;
  assignmentRecipientId?: string | null;
  recipientStatus?: string | null;
  programWeek?: number | null;
};

export type GroupExpectationAuthoritativeStatus =
  | 'excused'
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'paused'
  | 'missed'
  | 'due_today'
  | 'upcoming';

export type GroupTrainingWeekState =
  | 'Completed'
  | 'Partial'
  | 'Skipped'
  | 'Missed'
  | 'Due today'
  | 'Scheduled'
  | 'Upcoming'
  | 'Excused'
  | 'Paused'
  | 'Not confirmed'
  | 'Extra';

export type GroupTrainingWeekItem = {
  date: string;
  title: string;
  dayLabel: string;
  state: GroupTrainingWeekState;
  workoutId: string | null;
  expectationId?: string | null;
  origin: 'program' | 'assignment' | 'extra';
  excused: boolean;
  hasSession: boolean;
  programWeek?: number | null;
  required?: boolean;
  activityType?: string | null;
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

const WEEKDAY_ONLY_TITLES = new Set([
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

/** A stored title that is only a weekday, such as Mon, is not the workout name. */
export function isWeekdayOnlyTitle(value: string | null | undefined): boolean {
  return WEEKDAY_ONLY_TITLES.has(String(value || '').trim().toLowerCase());
}

/**
 * Prefer the program workout name when the saved title is blank or only a weekday.
 * A custom title is left as saved. The calendar date is not part of this name.
 */
export function displayWorkoutName(
  savedTitle: string | null | undefined,
  workout?: { title?: string | null; dayLabel?: string | null } | null
): string {
  const saved = String(savedTitle || '').trim();
  const real = String(workout?.title || '').trim();
  if (real && (!saved || isWeekdayOnlyTitle(saved))) return real;
  return saved || real || 'Workout';
}

/** Program week and program day. This is not the date chosen on the calendar. */
export function programWorkoutPlace(workout?: { week?: number | null; dayLabel?: string | null } | null): string {
  if (!workout) return '';
  const day = normalizeProgramDayLabel(workout.dayLabel);
  const week = workout.week ? `Week ${workout.week}` : '';
  return [week, day].filter(Boolean).join(' · ');
}

export function resolveExpectationTitle(
  row: Pick<GroupTrainingExpectationInput, 'title' | 'dayLabel' | 'workoutId' | 'programWeek'>,
  workouts: GroupTrainingWorkoutRef[] | null | undefined
): { title: string; dayLabel: string; programWeek: number | null } {
  const workout = row.workoutId ? (workouts || []).find((item) => item.id === row.workoutId) : null;
  return {
    title: displayWorkoutName(row.title, workout),
    dayLabel: normalizeProgramDayLabel(row.dayLabel || workout?.dayLabel),
    programWeek: workout?.week ?? row.programWeek ?? null,
  };
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

const AUTHORITATIVE_WEEK_STATE: Record<GroupExpectationAuthoritativeStatus, GroupTrainingWeekState | 'date'> = {
  completed: 'Completed',
  partial: 'Partial',
  skipped: 'Skipped',
  excused: 'Excused',
  paused: 'Paused',
  missed: 'Missed',
  due_today: 'Due today',
  upcoming: 'date',
};

/** Prefer a saved expectation-status row. Otherwise use the same completion rules as the unified schedule. */
export function groupExpectationState(
  row: Pick<GroupTrainingExpectationInput, 'scheduledDate' | 'excused' | 'sessionStatus' | 'authoritativeStatus'>,
  today: string,
  completionKnown: boolean,
  userMissed: number | null = null,
  upcoming: 'Scheduled' | 'Upcoming' = 'Scheduled'
): GroupTrainingWeekState {
  if (row.authoritativeStatus) {
    const mapped = AUTHORITATIVE_WEEK_STATE[row.authoritativeStatus];
    if (mapped && mapped !== 'date') return mapped;
    if (mapped === 'date') return upcoming;
  }
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
  extras?: GroupExtraActivity[];
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
    const usesAuthoritative = ownExpectations.some((row) => !!row.authoritativeStatus);
    const missed = usesAuthoritative
      ? ownExpectations.filter((row) => row.authoritativeStatus === 'missed').length
      : userMissed != null
        ? userMissed
        : input.completionKnown
          ? missedInWindow(ownExpectations, input.today)
          : 0;
    const missedWindowStart = userMissed != null ? mondayOfWeek(input.today) : addDaysYmd(input.today, -7);
    const missedDates = (
      usesAuthoritative
        ? ownExpectations.filter((row) => row.authoritativeStatus === 'missed')
        : ownExpectations
            .filter((row) => row.scheduledDate < input.today && row.scheduledDate >= missedWindowStart)
            .filter(
              (row) =>
                groupExpectationState(row, input.today, input.completionKnown || userMissed != null, userMissed, 'Upcoming') === 'Missed'
            )
    ).map((row) => row.scheduledDate);
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
        .map((row) => {
          const named = resolveExpectationTitle(row, plan.program?.workouts);
          return {
            date: row.scheduledDate,
            title: named.title,
            dayLabel: named.dayLabel,
            programWeek: named.programWeek,
            state: weekState(row, input.today, input.completionKnown, userMissed),
            workoutId: row.workoutId || null,
            expectationId: row.id || null,
            origin: row.origin === 'assignment' ? 'assignment' as const : 'program' as const,
            excused: !!row.excused,
            hasSession: !!row.sessionStatus && row.sessionStatus !== 'not_started',
          };
        });
      const next = ownExpectations.find((row) => {
        if (row.excused || row.scheduledDate < input.today) return false;
        if (row.sessionStatus === 'completed') return false;
        return true;
      });
      if (next) {
        const named = resolveExpectationTitle(next, plan.program?.workouts);
        nextWorkout = {
          date: next.scheduledDate,
          title: named.title,
          dayLabel: named.dayLabel,
          label: workoutLabel(named.dayLabel, named.title),
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

    weekItems = [
      ...weekItems,
      ...groupExtraWeekItems(input.extras || [], member.userId, weekStart, weekEnd),
    ];

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
  return !!pickFulfillingSession([session], expectation);
}

/** Matches st_group_schedule_adherence. A set log on the same date does not complete the workout. */
export function attachExpectationCompletion(
  expectations: GroupTrainingExpectationInput[],
  sessions: Array<{
    userId: string;
    workoutId?: string | null;
    logDate?: string | null;
    expectationId?: string | null;
    status?: string | null;
    completedAt?: string | null;
  }>
): GroupTrainingExpectationInput[] {
  return expectations.map((row) => {
    const context = expectations.map((item) => ({
      id: item.id,
      userId: item.userId,
      workoutId: item.workoutId,
      scheduledDate: item.scheduledDate,
    }));
    const session = pickFulfillingSession(
      sessions.filter((item) => item.userId === row.userId),
      row,
      context
    );
    if (session?.status) {
      return { ...row, sessionStatus: session.status as ExpectationSessionStatus };
    }
    if (row.recipientStatus === 'skipped') {
      return { ...row, sessionStatus: 'skipped' };
    }
    return row;
  });
}

const AUTHORITATIVE_STATUSES = new Set<GroupExpectationAuthoritativeStatus>([
  'excused',
  'completed',
  'partial',
  'skipped',
  'paused',
  'missed',
  'due_today',
  'upcoming',
]);

export type GroupExpectationStatusRow = {
  expectation_id?: string | null;
  user_id?: string | null;
  workout_id?: string | null;
  scheduled_date?: string | null;
  status?: string | null;
};

/** Match status rows by expectation id. A same-day set log is not a status. */
export function applyAuthoritativeExpectationStatus(
  expectations: GroupTrainingExpectationInput[],
  rows: GroupExpectationStatusRow[]
): GroupTrainingExpectationInput[] {
  const byId = new Map<string, GroupExpectationAuthoritativeStatus>();
  rows.forEach((row) => {
    const status = String(row.status || '') as GroupExpectationAuthoritativeStatus;
    if (row.expectation_id && AUTHORITATIVE_STATUSES.has(status)) byId.set(row.expectation_id, status);
  });
  return expectations.map((row) => {
    if (!row.id || !byId.has(row.id)) return row;
    const status = byId.get(row.id) as GroupExpectationAuthoritativeStatus;
    const sessionStatus = status === 'completed' || status === 'partial' || status === 'skipped' ? status : undefined;
    return {
      ...row,
      authoritativeStatus: status,
      sessionStatus,
      excused: status === 'excused',
    };
  });
}

export type GroupExpectationStatusSummary = {
  userId: string;
  completed: number;
  partial: number;
  skipped: number;
  missed: number;
  dueToday: number;
  upcoming: number;
  excused: number;
  paused: number;
  completionRate: number | null;
};

/** Week totals from expectation-status rows. Paused today and future rows are not missed. */
export function summarizeExpectationStatuses(
  rows: GroupExpectationStatusRow[],
  memberIds: string[],
  today: string
): GroupExpectationStatusSummary[] {
  return memberIds.filter(Boolean).map((userId) => {
    const mine = rows.filter((row) => row.user_id === userId);
    const count = (status: GroupExpectationAuthoritativeStatus) => mine.filter((row) => row.status === status).length;
    const past = mine.filter((row) => String(row.scheduled_date || '').slice(0, 10) < today && row.status !== 'excused');
    const expectedPast = past.filter((row) => row.status === 'completed' || row.status === 'partial' || row.status === 'skipped' || row.status === 'missed').length;
    const completedPast = past.filter((row) => row.status === 'completed').length;
    return {
      userId,
      completed: count('completed'),
      partial: count('partial'),
      skipped: count('skipped'),
      missed: count('missed'),
      dueToday: count('due_today'),
      upcoming: count('upcoming'),
      excused: count('excused'),
      paused: count('paused'),
      completionRate: expectedPast === 0 ? null : Math.round((completedPast / expectedPast) * 1000) / 10,
    };
  });
}
