/** BIQ-0027: Resolve which program an athlete follows */

import type { AssignmentType } from './types';

export function resolveProgramPoolQuery(
  member: { user_id: string; training_source?: string },
  teamId: string,
  usePersonalOverride?: boolean
) {
  const usePersonal = usePersonalOverride ?? (member.training_source || 'team') === 'personal';
  return {
    usePersonal,
    filters: usePersonal
      ? { visibility: 'personal' as const, owner_user_id: member.user_id }
      : { visibility: 'team' as const, team_id: teamId },
  };
}

export function pickProgramForMember(
  list: any[],
  member: { user_id: string },
  assignments: Record<string, any>,
  defaultProgramId?: string | null
) {
  const assignment = assignments[member.user_id];
  if (assignment?.program_id) {
    const hit = list.find((p: any) => p.id === assignment.program_id);
    if (hit) return hit;
  }
  if (defaultProgramId) return list.find((p: any) => p.id === defaultProgramId) || list[0] || null;
  return list[0] || null;
}

export function assignmentTypeForMember(
  member: { training_source?: string },
  assignment?: { assignment_type?: string } | null
): AssignmentType | 'personal_legacy' {
  if (assignment?.assignment_type) return assignment.assignment_type as AssignmentType;
  return (member.training_source || 'team') === 'personal' ? 'personal' : 'team';
}

export function programNameForMember(
  member: { training_source?: string },
  assignment: any | null | undefined,
  program: any | null,
  teamDefaultName?: string
): string {
  if (program?.name) return program.name;
  if (assignment?.st_programs?.name) return assignment.st_programs.name;
  if ((member.training_source || 'team') === 'team' && teamDefaultName) return teamDefaultName;
  return 'No program assigned';
}
