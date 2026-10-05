/** BIQ-0043: Owner / Manager / Member permissions — never use "coach" in product logic. */

import type { GroupEditContext, GroupEditIntent, GroupPermissionFlags } from './groupPermissions';
import type { GroupRole, StoredMemberRole } from './types';

/** Map legacy DB role `editor` to Manager. */
export function normalizeRole(role: string | null | undefined): GroupRole {
  const r = String(role || 'member').toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'editor' || r === 'manager') return 'manager';
  return 'member';
}

export function roleLabel(role: string | null | undefined): string {
  const n = normalizeRole(role);
  if (n === 'owner') return 'Owner';
  if (n === 'manager') return 'Manager';
  return 'Member';
}

/** Roles an owner may assign from the roster. Owner is not one of them. */
export const ASSIGNABLE_MEMBER_ROLES = ['manager', 'member'] as const;

export function isAssignableMemberRole(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === 'manager' || n === 'member';
}

/** Owner or Manager — manage group, assign programs, view member performance. */
export function canManageGroup(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === 'owner' || n === 'manager';
}

/** Authoritative group owner. Transfer uses st_transfer_group_ownership, not role edit. */
export function isGroupOwner(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'owner';
}

/** Archive/delete the group and transfer ownership. */
export function canAdministerGroup(role: string | null | undefined): boolean {
  return isGroupOwner(role);
}

/** Set st_teams.default_program_id. Managers included. Members only when the group allows assign. */
export function canSetGroupDefaultProgram(
  role: string | null | undefined,
  flags?: GroupPermissionFlags | null
): boolean {
  if (canManageGroup(role)) return true;
  return normalizeRole(role) === 'member' && !!flags?.members_can_assign_workouts;
}

/** Managers can invite and remove members (per product decision). */
export function canManageMembers(role: string | null | undefined): boolean {
  return canManageGroup(role);
}

/** Log own workout always; managers may log for another member when acting on their behalf. */
export function canLogWorkout(
  sessionUserId: string | undefined,
  subjectUserId: string | undefined,
  managerRole: string | null | undefined
): boolean {
  if (!sessionUserId || !subjectUserId) return false;
  if (sessionUserId === subjectUserId) return true;
  return canManageGroup(managerRole);
}

/** Edit Shared: change the live group template. Members need the group flag. */
export function canEditSharedGroupProgram(
  role: string | null | undefined,
  flags?: GroupPermissionFlags | null
): boolean {
  if (canManageGroup(role)) return true;
  return normalizeRole(role) === 'member' && !!flags?.members_can_edit_shared_workouts;
}

/** Create a new shared group program. Separate from editing an existing one. */
export function canCreateSharedGroupProgram(
  role: string | null | undefined,
  flags?: GroupPermissionFlags | null
): boolean {
  if (canManageGroup(role)) return true;
  return normalizeRole(role) === 'member' && !!flags?.members_can_create_shared_workouts;
}

/** Assign programs or workouts, including to the entire group when allowed. */
export function canAssignInGroup(
  role: string | null | undefined,
  flags?: GroupPermissionFlags | null
): boolean {
  if (canManageGroup(role)) return true;
  return normalizeRole(role) === 'member' && !!flags?.members_can_assign_workouts;
}

/** View other members' group-scoped training progress. */
export function canViewGroupMemberProgress(
  role: string | null | undefined,
  flags?: GroupPermissionFlags | null
): boolean {
  if (canManageGroup(role)) return true;
  return normalizeRole(role) === 'member' && !!flags?.members_can_view_member_progress;
}

/**
 * Customize for Me: a personal fork. Any signed-in participant may do this.
 * It never writes the shared template.
 */
export function canCustomizeGroupProgramForMe(userId: string | null | undefined): boolean {
  return !!userId;
}

/** @deprecated Use canEditSharedGroupProgram. Owner/manager shorthand with default flags. */
export function canEditGroupProgram(role: string | null | undefined): boolean {
  return canEditSharedGroupProgram(role);
}

/**
 * Training always forks a live group plan into a personal copy.
 * Shared-template screens edit the live plan only when the role or group flag allows it.
 */
export function resolveGroupEditIntent(
  role: string | null | undefined,
  context: GroupEditContext,
  flags?: GroupPermissionFlags | null
): GroupEditIntent {
  if (context === 'training') return 'customize_for_me';
  if (canEditSharedGroupProgram(role, flags)) return 'edit_shared';
  return 'none';
}

/** Where an edit intent is allowed to write. Personal forks do not touch the group template. */
export function editTargetVisibility(
  intent: GroupEditIntent
): 'team' | 'personal' | null {
  if (intent === 'edit_shared') return 'team';
  if (intent === 'customize_for_me') return 'personal';
  return null;
}

/** Members may log a group plan. Shared template edits follow Edit Shared rules. */
export function canEditProgramRecord(
  program: { visibility?: string | null } | null | undefined,
  role: string | null | undefined,
  flags?: GroupPermissionFlags | null
): boolean {
  if (!program) return false;
  if (program.visibility === 'team') return canEditSharedGroupProgram(role, flags);
  return true;
}

/** Role value to persist — BIQ-0043-P2 stores `manager` in DB (editor backfilled). */
export function roleForDatabase(uiRole: string): StoredMemberRole {
  return normalizeRole(uiRole);
}

/** UI select value from stored DB role. */
export function roleForUi(stored: string | null | undefined): GroupRole {
  return normalizeRole(stored);
}
