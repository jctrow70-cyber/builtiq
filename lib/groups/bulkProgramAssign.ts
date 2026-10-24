import { programIsAssignable, type WizardProgram } from './assignmentWizard';
import type { GroupProgramAssignInput } from './assignGroupTraining';
import type { GroupTrainingPlanKind } from './trainingWorkspace';

export const BULK_VISIBLE_NAME_CAP = 12;

export const BULK_HISTORY_MESSAGE =
  'Past workouts stay in history. A logged workout on the effective date stays. Extra activities stay. This action does not create missed workouts for past dates.';

export const BULK_EXPECTATION_MESSAGE =
  'Unlogged future program expectations for the current program cycle are rebuilt from the effective date. Resume does not fill a paused gap with missed workouts.';

export type BulkPlanKind = GroupTrainingPlanKind | null;

export type BulkProgramCandidate = {
  userId: string;
  name: string;
  membershipStatus: string;
  isActiveParticipant: boolean;
  programId: string | null;
  programLabel: string | null;
  enrollmentStatus: string | null;
  expectationEnabled: boolean | null;
  planKind: BulkPlanKind;
};

export type BulkExclusionCode = 'inactive_membership' | 'enrollment_paused_future';

export type BulkExclusion = {
  userId: string;
  name: string;
  code: BulkExclusionCode;
  reason: string;
};

export type BulkWarningCode =
  | 'already_on_program'
  | 'schedule_reactivates'
  | 'enrollment_reactivates'
  | 'participation_disabled'
  | 'personal_training';

export type BulkWarning = {
  code: BulkWarningCode;
  userIds: string[];
  names: string[];
  message: string;
};

export type BulkProgramReview = {
  teamId: string;
  originalSelectedCount: number;
  confirmedIds: string[];
  confirmed: Array<{ userId: string; name: string }>;
  confirmedCount: number;
  excluded: BulkExclusion[];
  warnings: BulkWarning[];
  distinctCurrentProgramCount: number;
  currentProgramNames: string[];
  targetProgramId: string;
  targetProgramName: string;
  effectiveDate: string;
  preservesHistoricalWorkouts: true;
  rebuildsFutureExpectations: true;
  createsMissedWorkouts: false;
  historyMessage: string;
  expectationMessage: string;
  setAsGroupPlan: false;
  usesPersonalSourceKey: false;
  canSubmit: boolean;
};

const PLAN_KINDS = new Set<GroupTrainingPlanKind>(['group_program', 'custom_fork', 'personal', 'none']);

export function canShowBulkProgramToolbar(canAssign: boolean): boolean {
  return canAssign === true;
}

export function joinBulkProgramCandidate(input: {
  userId: string;
  name: string;
  membershipStatus?: string | null;
  isActiveParticipant?: boolean | null;
  programId?: string | null;
  programLabel?: string | null;
  enrollmentStatus?: string | null;
  expectationEnabled?: boolean | null;
  planKind?: string | null;
}): BulkProgramCandidate {
  const planKind = PLAN_KINDS.has(input.planKind as GroupTrainingPlanKind) ? (input.planKind as GroupTrainingPlanKind) : null;
  return {
    userId: input.userId,
    name: input.name || 'Member',
    membershipStatus: String(input.membershipStatus || 'active').toLowerCase(),
    isActiveParticipant: input.isActiveParticipant !== false,
    programId: input.programId || null,
    programLabel: input.programLabel || null,
    enrollmentStatus: input.enrollmentStatus ? String(input.enrollmentStatus).toLowerCase() : null,
    expectationEnabled: input.expectationEnabled == null ? null : input.expectationEnabled === true,
    planKind,
  };
}

export function freezeRecipientIds(selectedIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  selectedIds.forEach((id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

export function toggleMemberSelection(selected: ReadonlySet<string>, userId: string): Set<string> {
  const next = new Set(selected);
  if (!userId) return next;
  if (next.has(userId)) next.delete(userId);
  else next.add(userId);
  return next;
}

export function selectFilteredMembers(selected: ReadonlySet<string>, filteredIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  for (const id of filteredIds) {
    if (id) next.add(id);
  }
  return next;
}

export function clearFilteredMembers(selected: ReadonlySet<string>, filteredIds: readonly string[]): Set<string> {
  const drop = new Set(filteredIds);
  return new Set(Array.from(selected).filter((id) => !drop.has(id)));
}

/** Header checkbox. Adds or clears only the current filtered ids. Hidden selected ids stay selected. */
export function toggleFilteredSelection(selected: ReadonlySet<string>, filteredIds: readonly string[]): Set<string> {
  if (!filteredIds.length) return new Set(selected);
  const allSelected = filteredIds.every((id) => selected.has(id));
  return allSelected ? clearFilteredMembers(selected, filteredIds) : selectFilteredMembers(selected, filteredIds);
}

export function filteredSelectionState(selected: ReadonlySet<string>, filteredIds: readonly string[]): 'none' | 'some' | 'all' {
  if (!filteredIds.length) return 'none';
  let count = 0;
  for (const id of filteredIds) {
    if (selected.has(id)) count += 1;
  }
  if (count === 0) return 'none';
  if (count === filteredIds.length) return 'all';
  return 'some';
}

export function hiddenSelectedCount(selected: ReadonlySet<string>, filteredIds: readonly string[]): number {
  const visible = new Set(filteredIds);
  let hidden = 0;
  Array.from(selected).forEach((id) => {
    if (!visible.has(id)) hidden += 1;
  });
  return hidden;
}

export function selectionAfterGroupChange(): string[] {
  return [];
}

export function cappedMemberNames(names: readonly string[], limit = BULK_VISIBLE_NAME_CAP): { names: string[]; hiddenCount: number } {
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : BULK_VISIBLE_NAME_CAP;
  return {
    names: names.slice(0, cap),
    hiddenCount: Math.max(0, names.length - cap),
  };
}

export function groupBulkExclusions(excluded: readonly BulkExclusion[]): Array<{ code: BulkExclusionCode; reason: string; names: string[] }> {
  const groups = new Map<BulkExclusionCode, { reason: string; names: string[] }>();
  for (const row of excluded) {
    const current = groups.get(row.code) || { reason: row.reason, names: [] };
    current.names.push(row.name);
    groups.set(row.code, current);
  }
  return Array.from(groups.entries()).map(([code, group]) => ({ code, reason: group.reason, names: group.names }));
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function warning(code: BulkWarningCode, members: BulkProgramCandidate[], message: string): BulkWarning | null {
  if (!members.length) return null;
  return {
    code,
    userIds: members.map((member) => member.userId),
    names: members.map((member) => member.name),
    message,
  };
}

export function buildBulkProgramReview(input: {
  frozenIds: readonly string[];
  candidates: readonly BulkProgramCandidate[];
  removedIds?: readonly string[];
  targetProgramId: string;
  targetProgramName: string;
  effectiveDate: string;
  today: string;
  teamId: string;
}): BulkProgramReview {
  const frozen = freezeRecipientIds(input.frozenIds);
  const removed = new Set(input.removedIds || []);
  const byId = new Map(input.candidates.map((candidate) => [candidate.userId, candidate]));
  const dateOk = isYmd(input.effectiveDate) && isYmd(input.today);
  const future = dateOk && input.effectiveDate > input.today;
  const reactivates = dateOk && input.effectiveDate <= input.today;
  const todayStart = dateOk && input.effectiveDate === input.today;
  const excluded: BulkExclusion[] = [];
  const confirmed: BulkProgramCandidate[] = [];

  for (const userId of frozen) {
    const candidate = byId.get(userId);
    if (!candidate || candidate.membershipStatus !== 'active') {
      excluded.push({
        userId,
        name: candidate?.name || 'Member',
        code: 'inactive_membership',
        reason: 'Inactive group membership',
      });
      continue;
    }
    if (future && candidate.enrollmentStatus === 'paused') {
      excluded.push({
        userId,
        name: candidate.name,
        code: 'enrollment_paused_future',
        reason: 'Paused enrollment. A future start leaves the enrollment paused and can drop upcoming workouts without rebuilding them.',
      });
      continue;
    }
    if (removed.has(userId)) continue;
    confirmed.push(candidate);
  }

  const programName = input.targetProgramName || 'this program';
  const already = confirmed.filter((member) => !!input.targetProgramId && member.programId === input.targetProgramId);
  const schedulePaused = confirmed.filter((member) => member.expectationEnabled === false);
  const enrollmentPaused = confirmed.filter((member) => member.enrollmentStatus === 'paused');
  const participationOff = confirmed.filter((member) => !member.isActiveParticipant);
  const personal = confirmed.filter((member) => member.planKind === 'personal');
  const warnings = [
    warning(
      'already_on_program',
      already,
      `Already assigned to ${programName}. They stay included unless you remove them.${
        reactivates ? ' A start on or before today also turns expected training back on.' : ''
      }`
    ),
    reactivates
      ? warning(
          'schedule_reactivates',
          schedulePaused,
          todayStart
            ? 'A start date of today turns expected training back on for members whose schedule is paused.'
            : 'This start date turns expected training back on for members whose schedule is paused.'
        )
      : null,
    reactivates
      ? warning(
          'enrollment_reactivates',
          enrollmentPaused,
          todayStart
            ? 'A start date of today sets paused enrollments back to active.'
            : 'This start date sets paused enrollments back to active.'
        )
      : null,
    warning(
      'participation_disabled',
      participationOff,
      'Not an active participant. This direct assignment still includes them. The group default program is not changed.'
    ),
    warning(
      'personal_training',
      personal,
      'On personal training. This group will show the selected program and their group training source becomes the group. Personal training is left unchanged.'
    ),
  ].filter((item): item is BulkWarning => !!item);

  const programs = new Map<string, string>();
  for (const member of confirmed) {
    if (member.planKind === 'personal') {
      programs.set('personal', 'Personal training');
      continue;
    }
    if (member.programId) programs.set(member.programId, member.programLabel || 'Program');
  }

  const confirmedIds = confirmed.map((member) => member.userId);
  return {
    teamId: input.teamId,
    originalSelectedCount: frozen.length,
    confirmedIds,
    confirmed: confirmed.map((member) => ({ userId: member.userId, name: member.name })),
    confirmedCount: confirmedIds.length,
    excluded,
    warnings,
    distinctCurrentProgramCount: programs.size,
    currentProgramNames: Array.from(programs.values()),
    targetProgramId: input.targetProgramId,
    targetProgramName: input.targetProgramName,
    effectiveDate: input.effectiveDate,
    preservesHistoricalWorkouts: true,
    rebuildsFutureExpectations: true,
    createsMissedWorkouts: false,
    historyMessage: BULK_HISTORY_MESSAGE,
    expectationMessage: BULK_EXPECTATION_MESSAGE,
    setAsGroupPlan: false,
    usesPersonalSourceKey: false,
    canSubmit: confirmedIds.length > 0 && !!input.targetProgramId && dateOk,
  };
}

export function bulkOperationKey(input: {
  teamId: string;
  memberUserIds: readonly string[];
  programId: string;
  effectiveDate: string;
}): string {
  return [input.teamId, input.programId, input.effectiveDate, [...input.memberUserIds].sort().join(',')].join('\n');
}

export function nextBulkRequestKey(input: {
  operationKey: string;
  previous: { operationKey: string; requestKey: string } | null;
  mint: () => string;
}): { operationKey: string; requestKey: string; reused: boolean } {
  if (input.previous && input.previous.operationKey === input.operationKey) {
    return { operationKey: input.operationKey, requestKey: input.previous.requestKey, reused: true };
  }
  return { operationKey: input.operationKey, requestKey: input.mint(), reused: false };
}

export function recordBulkAssignSuccess(input: {
  requestKey: string;
  memberCount: number;
  acknowledged: Readonly<Record<string, number>>;
}): { alreadySaved: boolean; message: string; memberCount: number; acknowledged: Record<string, number> } {
  const prior = input.acknowledged[input.requestKey];
  if (prior != null) {
    const noun = prior === 1 ? 'member' : 'members';
    return {
      alreadySaved: true,
      memberCount: prior,
      message: `This assignment was already saved. ${prior} ${noun}.`,
      acknowledged: { ...input.acknowledged },
    };
  }
  const count = input.memberCount;
  const noun = count === 1 ? 'member' : 'members';
  return {
    alreadySaved: false,
    memberCount: count,
    message: `Assigned the program to ${count} ${noun}.`,
    acknowledged: { ...input.acknowledged, [input.requestKey]: count },
  };
}

/** One RPC payload. The database transaction assigns every id or nobody. */
export function bulkAssignRpcPayload(input: {
  teamId: string;
  memberUserIds: readonly string[];
  programId: string;
  startsOn: string;
  requestKey: string;
}): GroupProgramAssignInput {
  return {
    teamId: input.teamId,
    memberUserIds: [...input.memberUserIds],
    programId: input.programId,
    startsOn: input.startsOn,
    requestKey: input.requestKey,
    setAsGroupPlan: false,
  };
}

export function assignableBulkPrograms(programs: readonly WizardProgram[], teamId: string): WizardProgram[] {
  const seen = new Set<string>();
  return programs
    .filter((program) => programIsAssignable(program, teamId))
    .filter((program) => {
      if (!program.id || seen.has(program.id)) return false;
      seen.add(program.id);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
