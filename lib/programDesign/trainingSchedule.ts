import { addDaysYmd, dayLabelFromYmd, formatYmd, mondayOfWeek, sundayOfWeek, todayYmd, weekForDate } from '../training/programCalendar';
import { activityTypeShortLabel, formatDuration } from './activityTypes';
import { activitiesFromLegacyWorkouts } from './programDesignApi';
import { cycleLengthOf, dateForProgramDay, programDateRange, weekdayLabel } from './cycle';
import type { ProgramActivity, ProgramDesignRecord } from './types';
import { calendarItemsForDate, type UserCalendarActivity } from './userCalendar';

export type TrainingDayItem = {
  id: string;
  title: string;
  typeLabel: string;
  activityType: string;
  duration: string;
  workoutId: string | null;
  activityId: string | null;
  isRest: boolean;
  source?: 'program' | 'calendar';
};

export type TrainingDayPlan = {
  date: string;
  dayLabel: string;
  weekNumber: number;
  dayOfWeek: number;
  items: TrainingDayItem[];
  primary: TrainingDayItem | null;
  later: TrainingDayItem[];
  isToday: boolean;
};

export type TrainingMonthCell = {
  date: string;
  inMonth: boolean;
  inProgram: boolean;
  plan: TrainingDayPlan | null;
};

export function mergeProgramActivities(
  program: ProgramDesignRecord,
  planned: ProgramActivity[],
  workouts: Array<{ id?: string; week?: number; day_label?: string; workout_type?: string; day_order?: number }>
): ProgramActivity[] {
  const linked = new Set(planned.map((a) => a.workout_id).filter(Boolean));
  const bridged = activitiesFromLegacyWorkouts(
    program.id,
    (workouts || []).filter((w) => !linked.has(w.id))
  );
  return [...planned, ...bridged];
}

export function planForDate(
  program: ProgramDesignRecord,
  activities: ProgramActivity[],
  dateYmd: string,
  today = todayYmd()
): TrainingDayPlan {
  const { start } = programDateRange(program);
  const weekNumber = weekForDate(start, dateYmd, cycleLengthOf(program));
  const dayLabel = dayLabelFromYmd(dateYmd);
  const dayOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(dayLabel);
  const dayActs = activities
    .filter((a) => a.week_number === weekNumber && a.day_of_week === (dayOfWeek < 0 ? 0 : dayOfWeek))
    .sort((a, b) => a.sort_order - b.sort_order);

  const items: TrainingDayItem[] = dayActs.map((a) => ({
    id: a.id,
    title: a.title || activityTypeShortLabel(a.activity_type),
    typeLabel: activityTypeShortLabel(a.activity_type),
    activityType: a.activity_type,
    duration: formatDuration(a.duration_minutes),
    workoutId: a.workout_id || (a.id.startsWith('legacy-') ? a.id.replace('legacy-', '') : null),
    activityId: a.id.startsWith('legacy-') ? null : a.id,
    isRest: a.activity_type === 'rest',
    source: 'program',
  }));

  const actionable = items.filter((i) => !i.isRest);
  return attachCalendarItems(
    {
      date: dateYmd,
      dayLabel,
      weekNumber,
      dayOfWeek: dayOfWeek < 0 ? 0 : dayOfWeek,
      items,
      primary: actionable[0] || items[0] || null,
      later: actionable.slice(1),
      isToday: dateYmd === today,
    },
    []
  );
}

export function emptyDayPlan(dateYmd: string, today = todayYmd()): TrainingDayPlan {
  const dayLabel = dayLabelFromYmd(dateYmd);
  const dayOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(dayLabel);
  return {
    date: dateYmd,
    dayLabel,
    weekNumber: 1,
    dayOfWeek: dayOfWeek < 0 ? 0 : dayOfWeek,
    items: [],
    primary: null,
    later: [],
    isToday: dateYmd === today,
  };
}

export function attachCalendarItems(plan: TrainingDayPlan, calendarActivities: UserCalendarActivity[]): TrainingDayPlan {
  const extra = calendarItemsForDate(calendarActivities, plan.date);
  if (!extra.length) {
    const actionable = plan.items.filter((i) => !i.isRest);
    return { ...plan, primary: actionable[0] || plan.items[0] || null, later: actionable.slice(1) };
  }
  const items = [...plan.items, ...extra];
  const actionable = items.filter((i) => !i.isRest);
  return {
    ...plan,
    items,
    primary: actionable[0] || items[0] || null,
    later: actionable.slice(1),
  };
}

export function planForCalendarDate(
  program: ProgramDesignRecord | null,
  activities: ProgramActivity[],
  calendarActivities: UserCalendarActivity[],
  dateYmd: string,
  today = todayYmd()
): TrainingDayPlan {
  const base = program ? planForDate(program, activities, dateYmd, today) : emptyDayPlan(dateYmd, today);
  return attachCalendarItems(base, calendarActivities);
}

export function weekPlansForMonday(
  monday: string,
  program: ProgramDesignRecord | null,
  activities: ProgramActivity[],
  calendarActivities: UserCalendarActivity[],
  today = todayYmd()
): TrainingDayPlan[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
    const date = addDaysYmd(monday, dayOfWeek);
    return planForCalendarDate(program, activities, calendarActivities, date, today);
  });
}

export function weekPlans(
  program: ProgramDesignRecord,
  activities: ProgramActivity[],
  weekNumber: number,
  today = todayYmd()
): TrainingDayPlan[] {
  const { start } = programDateRange(program);
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
    const date = dateForProgramDay(start, weekNumber, dayOfWeek);
    const plan = planForDate(program, activities, date, today);
    return { ...plan, dayLabel: weekdayLabel(dayOfWeek), weekNumber, dayOfWeek };
  });
}

export function tomorrowDate(from = todayYmd()): string {
  return addDaysYmd(from, 1);
}

export function yearMonthOf(ymd: string): string {
  return String(ymd || todayYmd()).slice(0, 7);
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y || new Date().getFullYear(), (m || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function monthCalendarCells(
  program: ProgramDesignRecord | null,
  activities: ProgramActivity[],
  yearMonth: string,
  today = todayYmd(),
  calendarActivities: UserCalendarActivity[] = []
): TrainingMonthCell[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const first = formatYmd(new Date(y || new Date().getFullYear(), (m || 1) - 1, 1));
  const last = formatYmd(new Date(y || new Date().getFullYear(), m || 1, 0));
  const gridStart = mondayOfWeek(first);
  const gridEnd = sundayOfWeek(last);
  const range = program ? programDateRange(program) : { start: '', end: '' };
  const cells: TrainingMonthCell[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const inMonth = yearMonthOf(cursor) === yearMonth;
    const inProgram = !!(program && cursor >= range.start && cursor <= range.end);
    cells.push({
      date: cursor,
      inMonth,
      inProgram,
      plan: planForCalendarDate(program, activities, calendarActivities, cursor, today),
    });
    cursor = addDaysYmd(cursor, 1);
  }
  return cells;
}
