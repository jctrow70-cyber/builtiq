export const GROUP_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'training', label: 'Training' },
  { id: 'members', label: 'Members' },
  { id: 'progress', label: 'Progress' },
] as const;

export type TeamWorkspaceTab = (typeof GROUP_WORKSPACE_TABS)[number]['id'];

/** Who a group progress query may include. Members without the progress flag see only themselves. */
export function groupProgressSubjectIds(
  actorUserId: string | null | undefined,
  memberUserIds: string[],
  canViewGroupProgress: boolean
): string[] {
  if (canViewGroupProgress) return memberUserIds;
  if (!actorUserId) return [];
  return memberUserIds.includes(actorUserId) ? [actorUserId] : [];
}

export type GroupSettingsAccess = {
  showAdministration: boolean;
  showInviteCode: boolean;
  showLeave: boolean;
};

/** Settings visibility. Owner administration stays off the Manager and Member screens. */
export function groupSettingsAccess(role: string | null | undefined): GroupSettingsAccess {
  const normalized = String(role || 'member').toLowerCase();
  const owner = normalized === 'owner';
  return {
    showAdministration: owner,
    showInviteCode: owner,
    showLeave: !owner,
  };
}
