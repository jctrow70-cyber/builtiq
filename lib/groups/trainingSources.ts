import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * BIQ-0238 participation sources.
 *
 * st_training_enrollments records programs a user participates in.
 * It is not the Training calendar. The calendar is a later derived view of
 * active enrollments, st_workouts, one-off assignments, and schedule exceptions.
 * Phase 1 does not render every enrollment on Training.
 * followed_program_id stays the legacy display pointer.
 *
 * These concepts do not overwrite each other:
 *
 * GROUP DEFAULT PROGRAM
 *   st_teams.default_program_id
 *
 * MEMBER PROGRAM ASSIGNMENT
 *   st_program_assignments
 *   What this group assigned this member. An explicit individual or manual
 *   assignment wins over the group default for that member's group enrollment.
 *
 * PERSONAL PROGRAM
 *   The personal enrollment slot. Other personal st_programs rows stay in the
 *   library. Joining, leaving, or a group assignment does not overwrite this slot.
 *
 * ONE-OFF WORKOUT
 *   st_workout_assignments + st_assignment_recipients. Never an enrollment row.
 *
 * GROUP ENROLLMENT PROVENANCE is derived, not stored:
 *   customized fork — enrollment program is a non-archived personal program
 *     whose source_program_id belongs to this group
 *   individual assignment — active individual_team or manual assignment
 *     points at that same program
 *   group default — enrollment program is st_teams.default_program_id
 *
 * st_team_members.training_source is a legacy roster switch. It is not participation.
 */

export type TrainingSourceKind = 'personal' | 'group';

export type TrainingEnrollmentStatus = 'active' | 'paused' | 'ended';

export type GroupEnrollmentProvenance = 'group_default' | 'individual_assignment' | 'customized_fork';

export type MemberProgramAssignment = {
  programId?: string | null;
  assignmentType?: string | null;
};

/** individual_team and manual are an explicit program for one member. team and personal are not. */
export function isExplicitIndividualAssignment(assignmentType: string | null | undefined): boolean {
  const type = String(assignmentType || '').toLowerCase();
  return type === 'individual_team' || type === 'manual';
}

/**
 * Why a group enrollment points at its program.
 * Fork wins over assignment, because a personal copy is the more specific fact.
 * No provenance column: source_program_id and st_program_assignments already say this.
 */
export function groupEnrollmentProvenance(input: {
  program?: {
    id?: string | null;
    visibility?: string | null;
    source_program_id?: string | null;
    status?: string | null;
  } | null;
  defaultProgramId?: string | null;
  assignment?: MemberProgramAssignment | null;
  groupProgramIds?: string[];
}): GroupEnrollmentProvenance | null {
  const program = input.program;
  if (!program?.id) return null;
  const groupIds = new Set(input.groupProgramIds || []);
  const sourceId = program.source_program_id || null;
  const archived = String(program.status || '').toLowerCase() === 'archived';
  const forkOfGroup =
    program.visibility === 'personal' &&
    !!sourceId &&
    !archived &&
    (groupIds.has(sourceId) || sourceId === input.defaultProgramId || sourceId === input.assignment?.programId);
  if (forkOfGroup) return 'customized_fork';
  if (
    input.assignment &&
    isExplicitIndividualAssignment(input.assignment.assignmentType) &&
    input.assignment.programId &&
    input.assignment.programId === program.id
  ) {
    return 'individual_assignment';
  }
  if (input.defaultProgramId && program.id === input.defaultProgramId) return 'group_default';
  if (groupIds.has(program.id)) return 'group_default';
  return null;
}

/**
 * Program a group enrollment should point at.
 * An existing customized fork is kept.
 * Otherwise an explicit member assignment wins, then the group default.
 */
export function resolveGroupParticipationProgram(input: {
  defaultProgramId?: string | null;
  assignment?: MemberProgramAssignment | null;
  forkProgramId?: string | null;
  fallbackProgramId?: string | null;
}): string | null {
  if (input.forkProgramId) return input.forkProgramId;
  if (
    input.assignment &&
    isExplicitIndividualAssignment(input.assignment.assignmentType) &&
    input.assignment.programId
  ) {
    return input.assignment.programId;
  }
  if (input.defaultProgramId) return input.defaultProgramId;
  return input.fallbackProgramId || null;
}

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
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,source_key' }
  );
  if (!error) return { error: null, pending: false };
  if (missingEnrollmentTable(error.message)) return { error: null, pending: true };
  return { error: error.message, pending: false };
}
