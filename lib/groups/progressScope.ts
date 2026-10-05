/**
 * BIQ-0238 progress scopes.
 *
 * GROUP PROGRESS
 *   Logs attributed to that group: st_set_logs.team_id matches, or the log's
 *   planned set still belongs to a team-visibility program for that group.
 *   Orphan logs with no team_id and no planned set stay out of group progress.
 *
 * PERSONAL PROGRESS
 *   Logs that are not attributed to the group being viewed. The user's own
 *   Progress screen still reads their logs directly. This module does not
 *   publish those rows to a group.
 *
 * SHARED PROGRESS
 *   Reserved. Body measurements, calendar activities, and workout sessions
 *   stay private to the user until a future explicit share. Do not query them
 *   from group screens.
 */

export type ProgressScope = 'group' | 'personal';

export function classifySetLogScope(input: {
  logTeamId?: string | null;
  programTeamId?: string | null;
  programVisibility?: string | null;
  groupTeamId: string;
}): ProgressScope {
  if (input.logTeamId && input.logTeamId === input.groupTeamId) return 'group';
  if (
    input.programVisibility === 'team' &&
    input.programTeamId &&
    input.programTeamId === input.groupTeamId
  ) {
    return 'group';
  }
  return 'personal';
}

export function isGroupProgressLog(
  input: Parameters<typeof classifySetLogScope>[0]
): boolean {
  return classifySetLogScope(input) === 'group';
}

export function isPersonalProgressLog(
  input: Parameters<typeof classifySetLogScope>[0]
): boolean {
  return classifySetLogScope(input) === 'personal';
}
