import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * BIQ-0238 training sources.
 *
 * These concepts do not overwrite each other:
 *
 * GROUP DEFAULT PROGRAM
 *   st_teams.default_program_id
 *   What the group is generally training on. Set by assigning to the entire group.
 *
 * MEMBER PROGRAM ASSIGNMENT
 *   st_program_assignments
 *   What this group assigned to one member. Scoped to that membership.
 *
 * PERSONAL PROGRAM
 *   st_programs with visibility personal, owned by the user.
 *   Joining a group does not delete or reassign it.
 *
 * TRAINING SCHEDULE
 *   st_training_enrollments, one active row per source.
 *   Personal + each group can exist together.
 *   st_profiles.followed_program_id remains the single program the current
 *   Training screen shows. It is the primary enrollment, not the only source.
 *   One-off assigned workouts stay on st_assignment_recipients.
 *
 * st_team_members.training_source is a legacy per-group switch used by the
 * current Groups roster. It is not the Training calendar.
 */

export type TrainingSourceKind = 'personal' | 'group';

export type TrainingEnrollmentStatus = 'active' | 'paused' | 'ended';

export function personalSourceKey(): string {
  return 'personal';
}

export function groupSourceKey(teamId: string): string {
  return `group:${teamId}`;
}

/** Preferred group claims an empty Training follow. Later groups do not replace it. */
export function orderGroupsForEnrollment<T extends { id: string }>(
  groups: T[],
  defaultGroupId?: string | null
): T[] {
  if (!defaultGroupId) return [...groups];
  return [...groups].sort((a, b) => {
    if (a.id === defaultGroupId && b.id !== defaultGroupId) return -1;
    if (b.id === defaultGroupId && a.id !== defaultGroupId) return 1;
    return 0;
  });
}

function missingEnrollmentTable(message: string | undefined): boolean {
  return /st_training_enrollments|schema cache|does not exist|Could not find the table/i.test(message || '');
}

export async function upsertTrainingEnrollment(
  supabase: SupabaseClient,
  row: {
    userId: string;
    sourceKind: TrainingSourceKind;
    teamId?: string | null;
    programId?: string | null;
    status?: TrainingEnrollmentStatus;
    isPrimary?: boolean;
  }
): Promise<{ error: string | null; pending: boolean }> {
  if (row.sourceKind === 'group' && !row.teamId) {
    return { error: 'Group enrollment requires a group id', pending: false };
  }
  const sourceKey = row.sourceKind === 'personal' ? personalSourceKey() : groupSourceKey(row.teamId as string);
  const { error } = await supabase.from('st_training_enrollments').upsert(
    {
      user_id: row.userId,
      source_kind: row.sourceKind,
      source_key: sourceKey,
      team_id: row.sourceKind === 'group' ? row.teamId : null,
      program_id: row.programId || null,
      status: row.status || 'active',
      is_primary: !!row.isPrimary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,source_key' }
  );
  if (!error) return { error: null, pending: false };
  if (missingEnrollmentTable(error.message)) return { error: null, pending: true };
  return { error: error.message, pending: false };
}
