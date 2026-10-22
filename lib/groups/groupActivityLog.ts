import type { GroupLogReturn } from './groupLogReturn';

export const GROUP_ACTIVITY_SOURCE_PREFIX = 'group-activity:';

export function groupActivitySourceKey(seriesId: string) {
  return `${GROUP_ACTIVITY_SOURCE_PREFIX}${seriesId}`;
}

export function isGroupActivitySourceKey(value: string | null | undefined) {
  return String(value || '').startsWith(GROUP_ACTIVITY_SOURCE_PREFIX);
}

export type GroupActivityReturnTo = 'group-calendar' | 'member-profile';

export type GroupActivityLogContext = {
  teamId: string;
  memberUserId: string;
  workoutId: string;
  seriesId: string;
  originalDate: string;
  scheduledDate: string;
  returnTo: GroupActivityReturnTo;
};

export type GroupActivityLogRequest = GroupActivityLogContext;

export type GroupActivityExpectationMatch = {
  userId: string;
  workoutId?: string | null;
  scheduledDate: string;
  excused?: boolean;
};

/** Opens the existing logger for the signed-in member's own strength extra. */
export function groupActivityLogReturn(input: GroupActivityLogRequest & { sessionUserId: string }): GroupLogReturn | null {
  if (!input.sessionUserId || input.memberUserId !== input.sessionUserId) return null;
  if (!input.teamId || !input.workoutId || !input.seriesId || !input.originalDate || !input.scheduledDate) return null;
  return {
    teamId: input.teamId,
    memberUserId: input.memberUserId,
    scheduledDate: input.scheduledDate,
    workoutId: input.workoutId,
    expectationId: '',
    seriesId: input.seriesId,
    originalDate: input.originalDate,
    returnTo: input.returnTo,
  };
}

export function groupStrengthCardCanLog(input: {
  viewerUserId?: string | null;
  memberUserId: string;
  activityType?: string | null;
  workoutId?: string | null;
  seriesId?: string | null;
  originalDate?: string | null;
  date: string;
  today: string;
  status?: string | null;
  expectations?: GroupActivityExpectationMatch[];
}): boolean {
  if (!input.viewerUserId || input.viewerUserId !== input.memberUserId) return false;
  if (input.activityType !== 'strength' || !input.workoutId || !input.seriesId || !input.originalDate) return false;
  if (!input.date || input.date > input.today || input.status === 'skipped') return false;
  const blocked = (input.expectations || []).some(
    (row) =>
      !row.excused &&
      row.userId === input.memberUserId &&
      !!row.workoutId &&
      row.workoutId === input.workoutId &&
      row.scheduledDate === input.date
  );
  return !blocked;
}
