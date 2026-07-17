/** BIQ-0043: Group Training platform — shared types (DB table remains st_teams for now). */

export const GROUP_ROLES = ['owner', 'manager', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** Stored DB roles until migration renames editor → manager. */
export type StoredMemberRole = GroupRole | 'editor';

export type GroupMembership = {
  id: string;
  name: string;
  invite_code: string;
  my_role: StoredMemberRole;
  training_source?: 'team' | 'personal';
  default_program_id?: string | null;
  membership_id?: string;
};
