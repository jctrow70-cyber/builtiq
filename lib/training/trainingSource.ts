import { sourceLabel } from './unifiedSchedule';

export type TrainingSourceItem = {
  id?: string;
  sourceKey?: string | null;
  sourceName?: string | null;
  source?: string | null;
  teamName?: string | null;
  title?: string | null;
  completed?: boolean;
};

export type AssignmentEnrollment = {
  status?: string | null;
  programId?: string | null;
  sourceKey?: string | null;
  teamId?: string | null;
  teamName?: string | null;
};

function namedSource(value?: string | null): string {
  return String(value || '').trim();
}

/** Display label from the current enrollment or expectation. Never inferred from the workout title. */
export function trainingSourceLabel(item?: TrainingSourceItem | null): string | null {
  if (!item) return null;
  const key = String(item.sourceKey || '').trim();
  const named = namedSource(item.teamName) || namedSource(item.sourceName);
  if (key) return sourceLabel(key, named);
  if (item.source === 'calendar') return 'Personal';
  if (named === 'Personal') return 'Personal';
  if (named === 'Group' || named === 'Group training') return 'Group training';
  return named || null;
}

/**
 * Current assignment for the followed program.
 * Uses the enrollment that points at that program, not the program's origin.
 */
export function resolveFollowedAssignmentSource(input: {
  followedProgramId?: string | null;
  enrollments?: AssignmentEnrollment[] | null;
}): { sourceKey: string; sourceName: string } | null {
  const programId = String(input.followedProgramId || '').trim();
  if (!programId) return null;
  const row = (input.enrollments || []).find((enrollment) => {
    if (String(enrollment.status || '').toLowerCase() === 'ended') return false;
    return String(enrollment.programId || '') === programId;
  });
  const key = String(row?.sourceKey || '').trim();
  if (!key) return null;
  return {
    sourceKey: key,
    sourceName: sourceLabel(key, row?.teamName),
  };
}

export function previewSourceMatchesCalendar(
  calendarItem?: TrainingSourceItem | null,
  previewSourceName?: string | null
): boolean {
  const calendar = trainingSourceLabel(calendarItem);
  const preview = trainingSourceLabel({
    sourceKey: calendarItem?.sourceKey,
    sourceName: previewSourceName ?? calendarItem?.sourceName,
    source: calendarItem?.source,
  });
  return calendar === preview;
}
