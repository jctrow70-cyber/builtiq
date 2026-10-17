import { addDaysYmd, dayLabelFromYmd, mondayOfWeek, sundayOfWeek } from '../training/programCalendar';
import { groupExpectationState, type GroupTrainingExpectationInput, type GroupTrainingWeekState } from './trainingWorkspace';

export const CALENDAR_CARD_LIMIT = 3;

export const CALENDAR_DEPENDENCY_NOTICE =
  'The Group calendar needs the training schedule in Supabase. In the SQL Editor, run 20261007_059_unified_training_schedule.sql, then 20261012_062_group_assignment_wizard.sql, 20261012_063_member_training_schedules.sql, and 20261012_064_workout_reschedule.sql. Reload after that. Workout dates are not guessed from the shared program.';

export type GroupCalendarCard = {
  key: string;
  userId: string;
  memberName: string;
  date: string;
  title: string;
  state: GroupTrainingWeekState;
  workoutId: string | null;
  origin: 'program' | 'assignment';
  excused: boolean;
  hasSession: boolean;
  sourceLabel: string;
};

export type GroupCalendarDay = {
  date: string;
  weekday: string;
  workouts: GroupCalendarCard[];
};

export type GroupCalendarWeek = {
  weekStart: string;
  weekEnd: string;
  days: GroupCalendarDay[];
  workoutCount: number;
  memberCount: number;
};

export function adjacentCalendarWeek(weekStart: string, direction: -1 | 1): string {
  return addDaysYmd(mondayOfWeek(weekStart), direction * 7);
}

export function calendarWeekDays(weekStart: string): string[] {
  const start = mondayOfWeek(weekStart);
  return Array.from({ length: 7 }, (_, index) => addDaysYmd(start, index));
}

/** Filtering only hides rows. It does not change membership or assignments. */
export function calendarMemberIds(input: {
  members: Array<{ userId: string; memberId?: string | null }>;
  links?: Record<string, string[]>;
  classificationId?: string | null;
  memberUserId?: string | null;
  canSeeAll: boolean;
  viewerUserId: string;
}): string[] {
  let rows = input.members.filter((member) => member.userId);
  if (!input.canSeeAll) rows = rows.filter((member) => member.userId === input.viewerUserId);
  if (input.classificationId) {
    const links = input.links || {};
    rows = rows.filter((member) => (links[member.memberId || ''] || []).includes(input.classificationId as string));
  }
  if (input.memberUserId) rows = rows.filter((member) => member.userId === input.memberUserId);
  return rows.map((member) => member.userId);
}

export function visibleCalendarCards<T>(cards: T[], expanded: boolean, limit = CALENDAR_CARD_LIMIT): { visible: T[]; hidden: number } {
  if (expanded || cards.length <= limit) return { visible: cards, hidden: 0 };
  return { visible: cards.slice(0, limit), hidden: cards.length - limit };
}

/**
 * Places group expectations onto the Monday–Sunday week of their saved dates.
 * Program weekday labels are not used to choose the column.
 */
export function buildGroupCalendar(input: {
  weekStart: string;
  today: string;
  teamId: string;
  expectations: GroupTrainingExpectationInput[];
  members: Array<{ userId: string; name: string }>;
  visibleUserIds: string[];
  completionKnown: boolean;
  missedByUser?: Record<string, number> | null;
}): GroupCalendarWeek {
  const weekStart = mondayOfWeek(input.weekStart);
  const weekEnd = sundayOfWeek(weekStart);
  const sourceKey = `group:${input.teamId}`;
  const names = new Map(input.members.map((member) => [member.userId, member.name || 'Member']));
  const visible = new Set(input.visibleUserIds);
  const cards: GroupCalendarCard[] = input.expectations
    .filter((row) => {
      if (row.sourceKey === 'personal' || row.sourceKey !== sourceKey) return false;
      if (!visible.has(row.userId)) return false;
      return row.scheduledDate >= weekStart && row.scheduledDate <= weekEnd;
    })
    .map((row) => {
      const origin = row.origin === 'assignment' ? 'assignment' as const : 'program' as const;
      const state = groupExpectationState(
        row,
        input.today,
        input.completionKnown,
        input.missedByUser ? Number(input.missedByUser[row.userId] || 0) : null,
        'Upcoming'
      );
      return {
        key: row.id || `${row.userId}|${row.scheduledDate}|${row.workoutId || row.title}`,
        userId: row.userId,
        memberName: names.get(row.userId) || 'Member',
        date: row.scheduledDate,
        title: row.title || 'Workout',
        state,
        workoutId: row.workoutId || null,
        origin,
        excused: !!row.excused,
        hasSession: !!row.sessionStatus && row.sessionStatus !== 'not_started',
        sourceLabel: origin === 'assignment' ? 'One-off' : 'Group plan',
      };
    })
    .sort((a, b) => a.memberName.localeCompare(b.memberName) || a.title.localeCompare(b.title));

  const days = calendarWeekDays(weekStart).map((date) => ({
    date,
    weekday: dayLabelFromYmd(date),
    workouts: cards.filter((card) => card.date === date),
  }));

  return {
    weekStart,
    weekEnd,
    days,
    workoutCount: cards.length,
    memberCount: new Set(cards.map((card) => card.userId)).size,
  };
}
