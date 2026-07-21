/** BIQ-0043: Owner / Manager / Member permissions — never use "coach" in product logic. */

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

/** Owner or Manager — manage group, assign programs, view member performance. */
export function canManageGroup(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === 'owner' || n === 'manager';
}

/** Owner only — promote managers, change roles, transfer ownership (future). */
export function isGroupOwner(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'owner';
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

/** Edit program templates — personal always (caller checks mode); group templates need Owner/Manager. */
export function canEditGroupProgram(role: string | null | undefined): boolean {
  return canManageGroup(role);
}

/** Role value to persist — BIQ-0043-P2 stores `manager` in DB (editor backfilled). */
export function roleForDatabase(uiRole: string): StoredMemberRole {
  return normalizeRole(uiRole);
}

/** UI select value from stored DB role. */
export function roleForUi(stored: string | null | undefined): GroupRole {
  return normalizeRole(stored);
}
