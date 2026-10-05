/**
 * BIQ-0238: Configurable group collaboration flags.
 *
 * Defaults are all false so existing groups keep today's behavior:
 * members follow and log, and they do not edit, assign, or view others.
 * Owners and managers keep operational control regardless of these flags.
 */

export type GroupPermissionFlags = {
  members_can_create_shared_workouts: boolean;
  members_can_edit_shared_workouts: boolean;
  members_can_assign_workouts: boolean;
  members_can_view_member_progress: boolean;
};

export const DEFAULT_GROUP_PERMISSIONS: GroupPermissionFlags = {
  members_can_create_shared_workouts: false,
  members_can_edit_shared_workouts: false,
  members_can_assign_workouts: false,
  members_can_view_member_progress: false,
};

type PermissionSource = Partial<GroupPermissionFlags> | null | undefined;

export function groupPermissionFlags(source: PermissionSource): GroupPermissionFlags {
  return {
    members_can_create_shared_workouts: !!source?.members_can_create_shared_workouts,
    members_can_edit_shared_workouts: !!source?.members_can_edit_shared_workouts,
    members_can_assign_workouts: !!source?.members_can_assign_workouts,
    members_can_view_member_progress: !!source?.members_can_view_member_progress,
  };
}

/** Edit Shared changes the live group template. Customize for Me is a personal fork. */
export type GroupEditIntent = 'edit_shared' | 'customize_for_me' | 'none';

export type GroupEditContext = 'shared_template' | 'training';
