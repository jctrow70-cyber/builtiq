import { isDraftProgram, isPublishedProgram, programStatusLabel, programStatusOf } from '../training/programStatus';

export type TeamProgramRow = {
  id: string;
  name: string;
  status: string;
  statusLabel: string;
  weeks: number;
  isDefault: boolean;
  sourceProgramId?: string | null;
  assignedMemberNames: string[];
  assignmentSummary: string;
};

export function buildTeamProgramRows(
  programs: any[],
  defaultProgramId: string | null | undefined,
  memberAssignments: Record<string, any>,
  members: any[]
): TeamProgramRow[] {
  const nameByUserId = members.reduce((acc: Record<string, string>, m: any) => {
    acc[m.user_id] = m.display_name || 'Member';
    return acc;
  }, {});

  const assigneesByProgram: Record<string, string[]> = {};
  Object.entries(memberAssignments).forEach(([userId, row]: [string, any]) => {
    const pid = row?.program_id;
    if (!pid) return;
    if (!assigneesByProgram[pid]) assigneesByProgram[pid] = [];
    assigneesByProgram[pid].push(nameByUserId[userId] || 'Member');
  });

  return (programs || []).map((p: any) => {
    const status = programStatusOf(p);
    const isDefault = defaultProgramId === p.id;
    const assigned = assigneesByProgram[p.id] || [];
    let assignmentSummary = 'Unassigned';
    if (isDefault && isPublishedProgram(p)) {
      assignmentSummary = assigned.length
        ? `Team default · also: ${assigned.join(', ')}`
        : 'Entire team (default)';
    } else if (assigned.length) {
      assignmentSummary =
        assigned.length <= 2
          ? `Only: ${assigned.join(', ')}`
          : `Only: ${assigned.length} members`;
    } else if (isDraftProgram(p)) {
      assignmentSummary = 'Draft — not assigned';
    }

    return {
      id: p.id,
      name: p.name || 'Program',
      status,
      statusLabel: programStatusLabel(status),
      weeks: p.weeks || 6,
      isDefault,
      sourceProgramId: p.source_program_id || null,
      assignedMemberNames: assigned,
      assignmentSummary,
    };
  });
}

export function memberAssignedProgramLabel(
  member: any,
  memberAssignments: Record<string, any>,
  defaultProgram: any | null
): string {
  const row = memberAssignments[member?.user_id];
  if (row?.st_programs?.name) return row.st_programs.name;
  if (row?.program_id) return 'Assigned program';
  if ((member?.training_source || 'team') === 'team' && defaultProgram?.name) {
    return defaultProgram.name;
  }
  if ((member?.training_source || 'team') === 'personal') return 'Personal plan';
  return 'No program';
}
