export type GroupLogReturn = {
  teamId: string;
  memberUserId: string;
  scheduledDate: string;
  workoutId: string;
  expectationId: string;
};

/** A member can return to their own group day. A trainer does not receive that return path. */
export function groupLogReturnFromRequest(input: {
  sessionUserId: string;
  memberUserId: string;
  expectationId: string;
  workoutId: string;
  scheduledDate: string;
  teamId?: string | null;
  sourceKey?: string | null;
}): GroupLogReturn | null {
  if (!input.sessionUserId || input.memberUserId !== input.sessionUserId) return null;
  const fromSource = String(input.sourceKey || '').startsWith('group:') ? String(input.sourceKey).slice('group:'.length) : '';
  const teamId = String(input.teamId || fromSource || '').trim();
  if (!teamId || !input.scheduledDate || !input.workoutId || !input.expectationId) return null;
  return {
    teamId,
    memberUserId: input.memberUserId,
    scheduledDate: input.scheduledDate,
    workoutId: input.workoutId,
    expectationId: input.expectationId,
  };
}

export function trainingLoggerBack(groupReturn: GroupLogReturn | null): 'group' | 'personal' {
  if (groupReturn?.teamId && groupReturn.memberUserId && groupReturn.scheduledDate) return 'group';
  return 'personal';
}
