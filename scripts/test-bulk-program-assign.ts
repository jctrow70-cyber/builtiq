import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { programIsAssignable, type WizardProgram } from '../lib/groups/assignmentWizard';
import {
  assignableBulkPrograms,
  buildBulkProgramReview,
  bulkAssignRpcPayload,
  bulkOperationKey,
  BULK_EXPECTATION_MESSAGE,
  BULK_HISTORY_MESSAGE,
  canShowBulkProgramToolbar,
  clearFilteredMembers,
  filteredSelectionState,
  freezeRecipientIds,
  hiddenSelectedCount,
  nextBulkRequestKey,
  recordBulkAssignSuccess,
  selectFilteredMembers,
  selectionAfterGroupChange,
  toggleFilteredSelection,
  toggleMemberSelection,
  type BulkProgramCandidate,
} from '../lib/groups/bulkProgramAssign';
import { DEFAULT_GROUP_PERMISSIONS } from '../lib/groups/groupPermissions';
import { canAssignInGroup } from '../lib/groups/permissions';

const today = '2026-10-23';
const future = '2026-11-02';

function member(partial: Partial<BulkProgramCandidate> & Pick<BulkProgramCandidate, 'userId'>): BulkProgramCandidate {
  return {
    userId: partial.userId,
    name: partial.name || partial.userId,
    membershipStatus: partial.membershipStatus || 'active',
    isActiveParticipant: partial.isActiveParticipant !== false,
    programId: partial.programId === undefined ? 'current' : partial.programId,
    programLabel: partial.programLabel === undefined ? 'Current' : partial.programLabel,
    enrollmentStatus: partial.enrollmentStatus === undefined ? 'active' : partial.enrollmentStatus,
    expectationEnabled: partial.expectationEnabled === undefined ? true : partial.expectationEnabled,
    planKind: partial.planKind === undefined ? 'group_program' : partial.planKind,
  };
}

function review(partial: Partial<Parameters<typeof buildBulkProgramReview>[0]> & Pick<Parameters<typeof buildBulkProgramReview>[0], 'frozenIds' | 'candidates'>) {
  return buildBulkProgramReview({
    removedIds: [],
    targetProgramId: 'target',
    targetProgramName: 'Target',
    effectiveDate: today,
    today,
    teamId: 'team-a',
    ...partial,
  });
}

const ids = ['a', 'b', 'c', 'd'];
let selected = selectFilteredMembers(new Set<string>(), ids);
assert.equal(selected.size, 4);
assert.equal(filteredSelectionState(selected, ids), 'all');
const page = ids.slice(0, 2);
assert.equal(hiddenSelectedCount(selected, page), 2);
assert.equal(selected.size, 4);
const afterPage = new Set(selected);
assert.deepEqual([...afterPage].sort(), [...ids].sort());

const narrowed = ['a'];
const afterFilter = new Set(selected);
assert.equal(afterFilter.size, selected.size);
assert.equal(hiddenSelectedCount(afterFilter, narrowed), 3);
const headerClearsFilteredOnly = toggleFilteredSelection(afterFilter, narrowed);
assert.equal(headerClearsFilteredOnly.has('a'), false);
assert.equal(headerClearsFilteredOnly.has('b'), true);
assert.equal(headerClearsFilteredOnly.has('c'), true);
assert.equal(headerClearsFilteredOnly.has('d'), true);

const hiddenKept = selectFilteredMembers(new Set(['hidden']), ['a', 'b']);
assert.deepEqual([...hiddenKept].sort(), ['a', 'b', 'hidden']);
assert.deepEqual([...clearFilteredMembers(hiddenKept, ['a', 'b'])], ['hidden']);
assert.equal(toggleMemberSelection(hiddenKept, 'a').has('a'), false);
assert.equal(filteredSelectionState(new Set(['a']), ['a', 'b']), 'some');
assert.deepEqual(selectionAfterGroupChange(), []);
assert.deepEqual(freezeRecipientIds(['a', 'a', '', 'b']), ['a', 'b']);

const largeIds = Array.from({ length: 220 }, (_, index) => `user-${index}`);
const rendered = largeIds.slice(0, 40);
selected = selectFilteredMembers(new Set<string>(), largeIds);
assert.equal(selected.size, 220);
assert.equal([...selected].filter((id) => !rendered.includes(id)).length, 180);
assert.equal(selected.has('user-new'), false);
const withJoined = [...largeIds, 'user-new'];
assert.equal(hiddenSelectedCount(selected, withJoined), 0);
assert.equal(selected.has(withJoined[withJoined.length - 1]), false);

const active = member({ userId: 'amy', name: 'Amy', programId: 'strength', programLabel: 'Strength' });
const other = member({ userId: 'ben', name: 'Ben', programId: 'conditioning', programLabel: 'Conditioning' });
const same = member({ userId: 'cara', name: 'Cara', programId: 'target', programLabel: 'Target' });
const none = member({
  userId: 'dee',
  name: 'Dee',
  programId: null,
  programLabel: null,
  enrollmentStatus: null,
  expectationEnabled: null,
  planKind: 'none',
});
const personal = member({
  userId: 'erin',
  name: 'Erin',
  programId: null,
  programLabel: null,
  enrollmentStatus: null,
  expectationEnabled: null,
  planKind: 'personal',
});
const schedulePaused = member({ userId: 'finn', name: 'Finn', expectationEnabled: false, programId: 'strength', programLabel: 'Strength' });
const enrollmentPaused = member({
  userId: 'gia',
  name: 'Gia',
  enrollmentStatus: 'paused',
  expectationEnabled: false,
  programId: 'strength',
  programLabel: 'Strength',
});
const inactive = member({ userId: 'hal', name: 'Hal', membershipStatus: 'removed' });
const participationOff = member({
  userId: 'ivy',
  name: 'Ivy',
  isActiveParticipant: false,
  programId: 'strength',
  programLabel: 'Strength',
});

const mixed = review({
  frozenIds: ['amy', 'ben', 'cara', 'dee', 'erin', 'finn', 'gia', 'hal', 'ivy', 'outsider'],
  candidates: [active, other, same, none, personal, schedulePaused, enrollmentPaused, inactive, participationOff],
});
assert.equal(mixed.originalSelectedCount, 10);
assert.deepEqual(mixed.confirmedIds, ['amy', 'ben', 'cara', 'dee', 'erin', 'finn', 'gia', 'ivy']);
assert.equal(mixed.excluded.map((row) => row.userId).sort().join(), 'hal,outsider');
assert.ok(mixed.excluded.every((row) => row.code === 'inactive_membership'));
assert.equal(mixed.distinctCurrentProgramCount, 4);
assert.ok(mixed.warnings.some((warning) => warning.code === 'already_on_program' && warning.userIds.includes('cara')));
assert.ok(mixed.warnings.some((warning) => warning.code === 'schedule_reactivates' && warning.userIds.includes('finn') && warning.userIds.includes('gia')));
assert.ok(mixed.warnings.find((warning) => warning.code === 'schedule_reactivates')?.message.includes('A start date of today'));
assert.ok(mixed.warnings.some((warning) => warning.code === 'enrollment_reactivates' && warning.userIds.includes('gia')));
assert.ok(mixed.warnings.some((warning) => warning.code === 'participation_disabled' && warning.userIds.includes('ivy')));
assert.ok(mixed.warnings.some((warning) => warning.code === 'personal_training' && warning.userIds.includes('erin')));
assert.equal(mixed.canSubmit, true);
assert.equal(mixed.preservesHistoricalWorkouts, true);
assert.equal(mixed.rebuildsFutureExpectations, true);
assert.equal(mixed.createsMissedWorkouts, false);
assert.equal(mixed.historyMessage, BULK_HISTORY_MESSAGE);
assert.equal(mixed.expectationMessage, BULK_EXPECTATION_MESSAGE);
assert.match(mixed.historyMessage, /Past workouts stay/);
assert.match(mixed.historyMessage, /does not create missed workouts/);
assert.match(mixed.expectationMessage, /rebuilt from the effective date/);
assert.match(mixed.expectationMessage, /does not fill a paused gap/);
assert.equal(mixed.setAsGroupPlan, false);
assert.equal(mixed.usesPersonalSourceKey, false);
assert.equal(JSON.stringify(mixed).includes('source_key'), false);

const removed = review({
  frozenIds: ['cara', 'amy'],
  candidates: [same, active],
  removedIds: ['cara'],
});
assert.deepEqual(removed.confirmedIds, ['amy']);
assert.equal(removed.warnings.some((warning) => warning.code === 'already_on_program'), false);

const emptied = review({
  frozenIds: ['hal'],
  candidates: [inactive],
});
assert.equal(emptied.confirmedIds.length, 0);
assert.equal(emptied.canSubmit, false);
const removedAll = review({ frozenIds: ['amy'], candidates: [active], removedIds: ['amy'] });
assert.equal(removedAll.canSubmit, false);

const futureReview = review({
  frozenIds: ['gia', 'finn', 'ivy', 'amy'],
  candidates: [enrollmentPaused, schedulePaused, participationOff, active],
  effectiveDate: future,
});
assert.deepEqual(futureReview.confirmedIds, ['finn', 'ivy', 'amy']);
assert.equal(futureReview.excluded.find((row) => row.userId === 'gia')?.code, 'enrollment_paused_future');
assert.equal(futureReview.warnings.some((warning) => warning.code === 'schedule_reactivates'), false);
assert.equal(futureReview.warnings.some((warning) => warning.code === 'enrollment_reactivates'), false);
assert.ok(futureReview.warnings.some((warning) => warning.code === 'participation_disabled'));
assert.equal(futureReview.effectiveDate, future);

const futureSameProgram = review({
  frozenIds: ['cara'],
  candidates: [same],
  effectiveDate: future,
});
assert.deepEqual(futureSameProgram.confirmedIds, ['cara']);
assert.doesNotMatch(futureSameProgram.warnings.find((warning) => warning.code === 'already_on_program')?.message || '', /turns expected training back on/);

const noProgram = review({ frozenIds: ['dee'], candidates: [none] });
assert.deepEqual(noProgram.confirmedIds, ['dee']);
assert.equal(noProgram.distinctCurrentProgramCount, 0);

const programsOnly = review({ frozenIds: ['amy', 'ben', 'amy'], candidates: [active, other] });
assert.equal(programsOnly.distinctCurrentProgramCount, 2);
assert.equal(programsOnly.originalSelectedCount, 2);

const frozenOnly = review({ frozenIds: ['amy'], candidates: [active, other] });
assert.deepEqual(frozenOnly.confirmedIds, ['amy']);

const operation = {
  teamId: 'team-a',
  memberUserIds: removed.confirmedIds,
  programId: 'target',
  effectiveDate: today,
};
const firstKey = nextBulkRequestKey({ operationKey: bulkOperationKey(operation), previous: null, mint: () => 'key-1' });
const retryKey = nextBulkRequestKey({ operationKey: bulkOperationKey(operation), previous: firstKey, mint: () => 'key-2' });
assert.equal(retryKey.reused, true);
assert.equal(retryKey.requestKey, 'key-1');
const removedKey = nextBulkRequestKey({
  operationKey: bulkOperationKey({ ...operation, memberUserIds: ['amy', 'cara'] }),
  previous: firstKey,
  mint: () => 'key-3',
});
assert.equal(removedKey.reused, false);
assert.equal(removedKey.requestKey, 'key-3');
const programKey = nextBulkRequestKey({
  operationKey: bulkOperationKey({ ...operation, programId: 'other' }),
  previous: firstKey,
  mint: () => 'key-4',
});
assert.equal(programKey.requestKey, 'key-4');
const dateKey = nextBulkRequestKey({
  operationKey: bulkOperationKey({ ...operation, effectiveDate: future }),
  previous: firstKey,
  mint: () => 'key-5',
});
assert.equal(dateKey.requestKey, 'key-5');

const firstSave = recordBulkAssignSuccess({ requestKey: 'key-1', memberCount: 4, acknowledged: {} });
assert.equal(firstSave.alreadySaved, false);
assert.match(firstSave.message, /Assigned the program to 4 members/);
const replay = recordBulkAssignSuccess({ requestKey: 'key-1', memberCount: 99, acknowledged: firstSave.acknowledged });
assert.equal(replay.alreadySaved, true);
assert.match(replay.message, /This assignment was already saved/);
assert.match(replay.message, /4 members/);
assert.doesNotMatch(replay.message, /99|again/);

const payload = bulkAssignRpcPayload({
  teamId: mixed.teamId,
  memberUserIds: mixed.confirmedIds,
  programId: 'target',
  startsOn: today,
  requestKey: 'key-1',
});
assert.equal(payload.teamId, 'team-a');
assert.deepEqual(payload.memberUserIds, mixed.confirmedIds);
assert.equal(payload.setAsGroupPlan, false);
assert.equal(Object.prototype.hasOwnProperty.call(payload, 'schedules'), false);
assert.equal(JSON.stringify(payload).includes('source_key'), false);
assert.equal(JSON.stringify(payload).includes('personal'), false);

const otherGroup = bulkAssignRpcPayload({
  teamId: 'team-b',
  memberUserIds: ['amy'],
  programId: 'target',
  startsOn: today,
  requestKey: 'key-b',
});
assert.equal(otherGroup.teamId, 'team-b');
assert.notEqual(otherGroup.teamId, 'team-a');

const programChoices: WizardProgram[] = [
  { id: 'published', name: 'Published', visibility: 'team', teamId: 'team-a', status: 'published', workouts: [] },
  { id: 'draft', name: 'Draft', visibility: 'team', teamId: 'team-a', status: 'draft', workouts: [] },
  { id: 'archived', name: 'Archived', visibility: 'team', teamId: 'team-a', status: 'archived', workouts: [] },
  { id: 'personal-program', name: 'Mine', visibility: 'personal', teamId: 'team-a', status: 'published', workouts: [] },
  { id: 'other-team', name: 'Elsewhere', visibility: 'team', teamId: 'team-b', status: 'published', workouts: [] },
];
assert.deepEqual(assignableBulkPrograms(programChoices, 'team-a').map((program) => program.id), ['published']);
assert.equal(programIsAssignable(programChoices[4], 'team-a'), false);

assert.equal(canShowBulkProgramToolbar(canAssignInGroup('owner', null)), true);
assert.equal(canShowBulkProgramToolbar(canAssignInGroup('manager', null)), true);
assert.equal(canShowBulkProgramToolbar(canAssignInGroup('editor', null)), true);
assert.equal(canShowBulkProgramToolbar(canAssignInGroup('member', { ...DEFAULT_GROUP_PERMISSIONS, members_can_assign_workouts: true })), true);
assert.equal(canShowBulkProgramToolbar(canAssignInGroup('member', DEFAULT_GROUP_PERMISSIONS)), false);
assert.equal(canShowBulkProgramToolbar(false), false);

const many = Array.from({ length: 220 }, (_, index) =>
  member({
    userId: `user-${index}`,
    name: `Member ${String(index).padStart(3, '0')}`,
    programId: index % 2 === 0 ? 'prog-a' : 'prog-b',
    programLabel: index % 2 === 0 ? 'Strength' : 'Conditioning',
  })
);
const started = performance.now();
const largeReview = buildBulkProgramReview({
  frozenIds: many.map((row) => row.userId),
  candidates: many,
  targetProgramId: 'prog-c',
  targetProgramName: 'New',
  effectiveDate: today,
  today,
  teamId: 'team-a',
});
const elapsed = performance.now() - started;
assert.equal(largeReview.confirmedIds.length, 220);
assert.equal(largeReview.confirmed.length, 220);
assert.equal(largeReview.distinctCurrentProgramCount, 2);
assert.ok(elapsed < 300, `review took ${elapsed.toFixed(1)}ms`);

const moduleSource = readFileSync(new URL('../lib/groups/bulkProgramAssign.ts', import.meta.url), 'utf8');
const sheetSource = readFileSync(new URL('../app/components/groups/BulkProgramAssignSheet.tsx', import.meta.url), 'utf8');
const directorySource = readFileSync(new URL('../app/components/groups/GroupMembersDirectory.tsx', import.meta.url), 'utf8');
const hubSource = readFileSync(new URL('../app/components/groups/GroupsHub.tsx', import.meta.url), 'utf8');
assert.match(moduleSource, /setAsGroupPlan:\s*false/);
assert.doesNotMatch(moduleSource, /setAsGroupPlan:\s*true/);
assert.doesNotMatch(moduleSource, /supabase|\.rpc\(|source_key/);
assert.equal((sheetSource.match(/assignGroupPrograms\(/g) || []).length, 1);
assert.match(sheetSource, /bulkAssignRpcPayload\(/);
assert.match(sheetSource, /onTrainingChanged\(\)/);
assert.doesNotMatch(sheetSource, /setAsGroupPlan:\s*true|source_key|setMemberTrainingSchedule|setMemberGroupExpectation/);
assert.doesNotMatch(directorySource, /assignGroupPrograms\(/);
assert.match(directorySource, /canShowBulkProgramToolbar\(canAssign\)/);
assert.match(directorySource, /onTrainingChanged=\{onTrainingChanged\}/);
assert.match(directorySource, /freezeRecipientIds\(selectedIds\)/);
assert.match(directorySource, /setSelectedIds\(selectionAfterGroupChange\(\)\)/);
assert.match(hubSource, /programs=\{assignmentPrograms\}\s+onTrainingChanged=\{training\.reload\}/);
assert.doesNotMatch(moduleSource, /create or replace function|st_set_member_training_schedule|st_set_member_group_expectation/);

console.log(`bulk program assign checks passed (${elapsed.toFixed(1)}ms review)`);
