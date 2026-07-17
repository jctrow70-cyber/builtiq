/** BIQ-0043: Group Training platform — shared types (DB table remains st_teams for now). */

export const GROUP_ROLES = ['owner', 'manager', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** Legacy rows may still read `editor` until backfill; new writes use `manager`. */
export type StoredMemberRole = GroupRole | 'editor';

export type GroupMembership = {
  id: string;
  name: string;
  invite_code: string;
  my_role: StoredMemberRole;
  training_source?: 'team' | 'personal';
  default_program_id?: string | null;
  membership_id?: string;
  is_active_participant?: boolean;
};
