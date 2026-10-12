/**
 * BIQ-0262 Phase 2 assignment wizard checks.
 * Run: npx tsx scripts/test-assignment-wizard.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSIGNMENT_TYPE_LABELS,
  buildAssignmentReview,
  commitBulkAssignment,
  commitGroupDefault,
  commitOneOff,
  historicalExpectationsRemain,
  isEligibleForGroupAssign,
  keepWizardDraftOnError,
  memberPlanName,
  memberUserIdsForClassification,
  nextWizardStep,
  personalEnrollmentsUntouched,
  previewProgramSchedule,
  previousWizardStep,
  resolveWizardMembers,
  resumeAfterProgramPublish,
  scheduleChangeForMember,
  searchMembers,
  searchPrograms,
  wizardAdvanceError,
  type AssignmentWizardResume,
  type SimDb,
  type WizardMember,
  type WizardProgram,
} from '../lib/groups/assignmentWizard';

const today = '2026-10-14';
const teamId = 'group-1';
const key = 'group:group-1';

function member(partial: Partial<WizardMember> & Pick<WizardMember, 'userId' | 'name'>): WizardMember {
  return { status: 'active', isActiveParticipant: true, trainingSource: 'team', ...partial };
}

const amy = member({
  userId: 'amy',
  memberId: 'm-amy',
  name: 'Amy',
  assignmentType: 'team',
  enrollmentProgramId: 'old',
  enrollmentProgramName: 'Old Plan',
});
const ben = member({ userId: 'ben', memberId: 'm-ben', name: 'Ben' });
const cara = member({
  userId: 'cara',
  memberId: 'm-cara',
  name: 'Cara',
  trainingSource: 'personal',
  assignmentType: 'personal',
});
const dee = member({
  userId: 'dee',
  memberId: 'm-dee',
  name: 'Dee',
  trainingSource: 'personal',
  assignmentType: 'individual_team',
  assignmentProgramId: 'fork',
  assignmentProgramName: 'Full Body (just me)',
  enrollmentProgramId: 'fork',
  enrollmentProgramName: 'Full Body (just me)',
});
const eli = member({
  userId: 'eli',
  memberId: 'm-eli',
  name: 'Eli',
  assignmentType: 'individual_team',
  assignmentProgramId: 'other',
  assignmentProgramName: 'Strength',
  enrollmentProgramId: 'other',
});
const paused = member({ userId: 'pat', memberId: 'm-pat', name: 'Pat', isActiveParticipant: false });
const roster = [amy, ben, cara, dee, eli, paused];

const program: WizardProgram = {
  id: 'new',
  name: 'Basketball',
  teamId,
  visibility: 'team',
  status: 'published',
  startDate: '2026-10-12',
  weeks: 4,
  workouts: [
    { id: 'w1', week: 1, dayLabel: 'Mon', dayOrder: 1, title: 'Full Body A' },
    { id: 'w2', week: 1, dayLabel: 'Wed', dayOrder: 2, title: 'Full Body B' },
    { id: 'w3', week: 1, dayLabel: 'Fri', dayOrder: 3, title: 'Full Body C' },
  ],
};

function baseDb(): SimDb {
  return {
    actorCanAssign: true,
    defaultProgramId: 'old',
    members: [
      { userId: 'amy', active: true, participant: true, trainingSource: 'team' },
      { userId: 'ben', active: true, participant: true, trainingSource: 'team' },
      { userId: 'cara', active: true, participant: true, trainingSource: 'personal' },
      { userId: 'dee', active: true, participant: true, trainingSource: 'personal' },
      { userId: 'eli', active: true, participant: true, trainingSource: 'team' },
      { userId: 'gone', active: false, participant: true, trainingSource: 'team' },
    ],
    assignments: [
      { userId: 'amy', assignmentType: 'team', programId: 'old', active: true },
      { userId: 'cara', assignmentType: 'personal', programId: null, active: true },
      { userId: 'dee', assignmentType: 'individual_team', programId: 'fork', active: true },
      { userId: 'eli', assignmentType: 'individual_team', programId: 'other', active: true },
    ],
    enrollments: [
      { userId: 'amy', sourceKey: key, programId: 'old', startsOn: '2026-09-01' },
      { userId: 'dee', sourceKey: key, programId: 'fork', startsOn: '2026-09-01' },
      { userId: 'eli', sourceKey: key, programId: 'other', startsOn: '2026-09-01' },
      { userId: 'cara', sourceKey: key, programId: null, startsOn: null },
    ],
    segments: [],
    expectations: [
      { userId: 'amy', sourceKey: key, programId: 'old', scheduledDate: '2026-10-01', origin: 'program' },
      { userId: 'amy', sourceKey: key, programId: 'old', scheduledDate: '2026-10-16', origin: 'program' },
    ],
    personalEnrollments: [{ userId: 'amy', sourceKey: 'personal', programId: 'secret', startsOn: '2026-08-01' }],
    workouts: [],
    requests: {},
  };
}

assert.equal(ASSIGNMENT_TYPE_LABELS.team, 'Use Group Plan');
assert.equal(ASSIGNMENT_TYPE_LABELS.personal, 'Use Personal Training');
assert.equal(ASSIGNMENT_TYPE_LABELS.individual_team, 'Assign Different Plan');
assert.equal(ASSIGNMENT_TYPE_LABELS.manual, 'Assign Different Plan');
assert.equal(memberPlanName(amy, 'Old Plan'), 'Old Plan');
assert.equal(memberPlanName(ben, 'Old Plan'), null);
assert.equal(memberPlanName(cara, 'Old Plan'), 'Personal training');
assert.equal(isEligibleForGroupAssign(cara), false);
assert.equal(isEligibleForGroupAssign(paused), false);
assert.equal(isEligibleForGroupAssign(ben), true);

const found = searchMembers(roster, 'am');
assert.deepEqual(found.map((row) => row.userId), ['amy']);
assert.deepEqual(
  resolveWizardMembers({ mode: 'members', members: roster, selectedUserIds: ['amy'] }).map((row) => row.userId),
  ['amy']
);
assert.deepEqual(
  resolveWizardMembers({ mode: 'all', members: roster, selectedUserIds: [] }).map((row) => row.userId),
  ['amy', 'ben', 'dee', 'eli']
);
assert.deepEqual(
  memberUserIdsForClassification('class-1', roster, { 'm-amy': ['class-1'], 'm-ben': ['class-1'], 'm-cara': ['class-1'] }),
  ['amy', 'ben', 'cara']
);
assert.deepEqual(
  resolveWizardMembers({
    mode: 'classification',
    members: roster,
    selectedUserIds: [],
    classificationId: 'class-1',
    classificationLinks: { 'm-amy': ['class-1'], 'm-dee': ['class-1'] },
  }).map((row) => row.userId),
  ['amy', 'dee']
);

assert.equal(searchPrograms([program, { ...program, id: 'draft', name: 'Draft', status: 'draft' }], 'ball', teamId).length, 1);
const preview = previewProgramSchedule(program, '2026-10-14');
assert.equal(preview.weekdayLabel, 'Mon, Wed, Fri');
assert.equal(preview.durationLabel, '4 weeks');
assert.ok(preview.firstWorkout);
assert.ok(preview.finalWorkout);
assert.ok(preview.firstWorkout >= '2026-10-14');
assert.equal(preview.dates.some((row) => row.scheduledDate < '2026-10-14'), false);

assert.equal(scheduleChangeForMember({ currentProgramId: 'old', nextProgramId: 'new', startsOn: '2026-10-20', today }).kind, 'future_segment');
assert.equal(scheduleChangeForMember({ currentProgramId: 'old', nextProgramId: 'new', startsOn: today, today }).kind, 'immediate');
assert.equal(scheduleChangeForMember({ currentProgramId: 'new', nextProgramId: 'new', startsOn: '2026-10-20', today }).kind, 'already_on_program');

const one = commitBulkAssignment(baseDb(), {
  teamId,
  memberUserIds: ['amy'],
  programId: 'new',
  programAllowed: true,
  startsOn: today,
  today,
  requestKey: 'one',
});
assert.equal(one.ok, true);
if (one.ok) {
  assert.equal(one.db.assignments.filter((row) => row.userId === 'amy' && row.active && row.programId === 'new').length, 1);
  assert.equal(one.db.enrollments.find((row) => row.userId === 'amy' && row.sourceKey === key)?.programId, 'new');
  assert.equal(one.db.enrollments.find((row) => row.userId === 'amy' && row.sourceKey === key)?.startsOn, today);
  assert.equal(personalEnrollmentsUntouched(baseDb(), one.db), true);
  assert.equal(historicalExpectationsRemain(baseDb(), one.db, today), true);
  assert.equal(one.db.expectations.some((row) => row.programId === 'new' && row.scheduledDate < today), false);
}

const many = commitBulkAssignment(baseDb(), {
  teamId,
  memberUserIds: ['amy', 'ben'],
  programId: 'new',
  programAllowed: true,
  startsOn: today,
  today,
  requestKey: 'many',
});
assert.equal(many.ok, true);
if (many.ok) {
  assert.equal(many.db.assignments.filter((row) => row.active && row.programId === 'new').length, 2);
}

const everyone = commitBulkAssignment(baseDb(), {
  teamId,
  memberUserIds: ['amy', 'ben', 'dee', 'eli'],
  programId: 'new',
  programAllowed: true,
  startsOn: today,
  today,
});
assert.equal(everyone.ok, true);
if (everyone.ok) {
  assert.equal(everyone.db.enrollments.find((row) => row.userId === 'dee')?.programId, 'new');
  assert.equal(personalEnrollmentsUntouched(baseDb(), everyone.db), true);
}

const classification = commitBulkAssignment(baseDb(), {
  teamId,
  memberUserIds: memberUserIdsForClassification('class-1', roster, { 'm-amy': ['class-1'], 'm-ben': ['class-1'] }),
  programId: 'new',
  programAllowed: true,
  startsOn: today,
  today,
});
assert.equal(classification.ok, true);
if (classification.ok) {
  assert.deepEqual(
    classification.db.assignments.filter((row) => row.active && row.programId === 'new').map((row) => row.userId).sort(),
    ['amy', 'ben']
  );
}

const invalid = commitBulkAssignment(baseDb(), {
  teamId,
  memberUserIds: ['amy', 'missing'],
  programId: 'new',
  programAllowed: true,
  startsOn: today,
  today,
});
const original = baseDb();
assert.equal(invalid.ok, false);
if (!invalid.ok) {
  assert.equal(invalid.error, 'Member not found');
  assert.equal(invalid.db.assignments.filter((row) => row.programId === 'new').length, 0);
  assert.equal(invalid.db.enrollments.find((row) => row.userId === 'amy')?.programId, 'old');
}
assert.equal(original.enrollments.find((row) => row.userId === 'amy')?.programId, 'old');

const denied = commitBulkAssignment(baseDb(), {
  actorCanAssign: false,
  teamId,
  memberUserIds: ['amy'],
  programId: 'new',
  programAllowed: true,
  startsOn: today,
  today,
});
assert.equal(denied.ok, false);
if (!denied.ok) assert.equal(denied.error, 'Not authorized');
assert.equal(denied.db, denied.ok ? denied.db : denied.db);
assert.equal(denied.db.assignments.some((row) => row.programId === 'new'), false);

const first = commitBulkAssignment(baseDb(), {
  teamId,
  memberUserIds: ['ben'],
  programId: 'new',
  programAllowed: true,
  startsOn: today,
  today,
  requestKey: 'retry-1',
});
assert.equal(first.ok, true);
if (first.ok) {
  const second = commitBulkAssignment(first.db, {
    teamId,
    memberUserIds: ['ben'],
    programId: 'new',
    programAllowed: true,
    startsOn: today,
    today,
    requestKey: 'retry-1',
  });
  assert.equal(second.ok, true);
  if (second.ok) {
    assert.equal(second.duplicate, true);
    assert.equal(second.db, first.db);
    assert.equal(second.db.assignments.filter((row) => row.userId === 'ben' && row.programId === 'new').length, 1);
  }
}

const future = commitBulkAssignment(baseDb(), {
  teamId,
  memberUserIds: ['amy'],
  programId: 'new',
  programAllowed: true,
  startsOn: '2026-10-20',
  today,
  requestKey: 'future',
});
assert.equal(future.ok, true);
if (future.ok) {
  assert.equal(future.db.enrollments.find((row) => row.userId === 'amy')?.programId, 'old');
  const segment = future.db.segments.find((row) => row.userId === 'amy' && row.endsOn == null);
  assert.equal(segment?.programId, 'new');
  assert.equal(segment?.startsOn, '2026-10-20');
  assert.equal(future.db.expectations.some((row) => row.scheduledDate === '2026-10-01'), true);
  assert.equal(future.db.expectations.some((row) => row.scheduledDate === '2026-10-16' && row.programId === 'old'), true);
  assert.equal(future.db.expectations.some((row) => row.programId === 'new' && row.scheduledDate < '2026-10-20'), false);
  assert.equal(personalEnrollmentsUntouched(baseDb(), future.db), true);
}

const replaced = buildAssignmentReview({
  mode: 'individual',
  members: [amy],
  program,
  startsOn: today,
  today,
  defaultProgramName: 'Old Plan',
});
assert.equal(replaced.replaced[0]?.planName, 'Old Plan');
assert.equal(replaced.confirmationRequired, true);

const fanout = commitGroupDefault(baseDb(), { teamId, programId: 'new', programAllowed: true, today });
assert.equal(fanout.ok, true);
if (fanout.ok) {
  assert.equal(fanout.db.defaultProgramId, 'new');
  assert.equal(fanout.db.enrollments.find((row) => row.userId === 'amy')?.programId, 'new');
  assert.equal(fanout.db.enrollments.find((row) => row.userId === 'ben')?.programId, 'new');
  assert.equal(fanout.db.enrollments.find((row) => row.userId === 'dee')?.programId, 'fork');
  assert.equal(fanout.db.enrollments.find((row) => row.userId === 'eli')?.programId, 'other');
  assert.equal(fanout.db.assignments.find((row) => row.userId === 'cara')?.assignmentType, 'personal');
  assert.equal(fanout.db.enrollments.find((row) => row.userId === 'cara')?.programId, null);
  assert.equal(historicalExpectationsRemain(baseDb(), fanout.db, today), true);
  assert.equal(personalEnrollmentsUntouched(baseDb(), fanout.db), true);
}

const preservedReview = buildAssignmentReview({
  mode: 'group_default',
  members: roster.filter((row) => row.userId !== 'pat'),
  program,
  startsOn: today,
  today,
  defaultProgramName: 'Old Plan',
});
assert.ok(preservedReview.preserved.some((row) => row.userId === 'cara' && row.reason.includes('personal')));
assert.ok(preservedReview.preserved.some((row) => row.userId === 'dee'));
assert.ok(preservedReview.replaced.some((row) => row.userId === 'amy'));

const oneOff = commitOneOff(baseDb(), {
  teamId,
  memberUserIds: ['ben'],
  workoutId: 'w1',
  scheduledDate: '2026-10-18',
  requestKey: 'once',
});
assert.equal(oneOff.ok, true);
if (oneOff.ok) {
  assert.equal(oneOff.db.workouts.length, 1);
  assert.equal(oneOff.db.expectations.some((row) => row.origin === 'assignment' && row.scheduledDate === '2026-10-18'), true);
  const again = commitOneOff(oneOff.db, {
    teamId,
    memberUserIds: ['ben'],
    workoutId: 'w1',
    scheduledDate: '2026-10-18',
    requestKey: 'once',
  });
  assert.equal(again.ok && again.duplicate, true);
  if (again.ok) assert.equal(again.db.workouts.length, 1);
}

const conflict = buildAssignmentReview({
  mode: 'workout',
  members: [ben],
  program,
  today,
  workoutDate: '2026-10-18',
  oneOffs: [{ userId: 'ben', scheduledDate: '2026-10-18', title: 'Conditioning' }],
});
assert.equal(conflict.conflicts[0]?.title, 'Conditioning');

const draft: AssignmentWizardResume = {
  teamId,
  step: 'what',
  whoMode: 'members',
  memberUserIds: ['amy', 'ben'],
  classificationId: null,
  programId: null,
  programName: null,
  creation: 'ai',
  whatKind: 'program',
  setAsGroupPlan: false,
};
const aiReturn = resumeAfterProgramPublish(draft, { id: 'new', name: 'Basketball' });
const manualReturn = resumeAfterProgramPublish({ ...draft, creation: 'manual' }, { id: 'new', name: 'Basketball' });
assert.equal(aiReturn.step, 'when');
assert.equal(manualReturn.step, 'when');
assert.deepEqual(aiReturn.memberUserIds, ['amy', 'ben']);
assert.deepEqual(manualReturn.memberUserIds, ['amy', 'ben']);
assert.equal(aiReturn.programId, 'new');
assert.equal(keepWizardDraftOnError(draft), draft);

assert.equal(nextWizardStep('who'), 'what');
assert.equal(previousWizardStep('review'), 'when');
assert.equal(wizardAdvanceError({
  step: 'who',
  memberCount: 0,
  whatKind: 'program',
  programId: null,
  workoutId: null,
  startsOn: today,
  classificationId: null,
  whoMode: 'members',
}), 'Select at least one member.');
assert.equal(wizardAdvanceError({
  step: 'what',
  memberCount: 1,
  whatKind: 'program',
  programId: 'new',
  workoutId: null,
  startsOn: today,
  classificationId: null,
  whoMode: 'members',
}), null);

const migration = readFileSync(new URL('../supabase/migrations/20261012_062_group_assignment_wizard.sql', import.meta.url), 'utf8');
const assignFn = migration.slice(migration.indexOf('function public.st_assign_group_programs'));
const validateAt = assignFn.indexOf('Member not found');
const writeAt = assignFn.indexOf('insert into public.st_program_assignments');
assert.ok(validateAt > 0 && writeAt > validateAt);
assert.match(migration, /unique \(team_id, request_key\)/);
assert.match(migration, /Not authorized/);
assert.match(migration, /source_key <> 'personal'/);
assert.match(migration, /starts_on = p_starts_on/);
assert.match(migration, /st_notify_program_assignment/);
assert.match(migration, /st_assign_workout_to_targets/);
assert.match(migration, /st_place_group_program/);
assert.match(migration, /assignment_type in \('personal', 'individual_team', 'manual'\)/);
assert.match(migration, /scheduled_date > p_effective_on/);
assert.doesNotMatch(migration, /st_training_schedule_profiles|custom_weekdays/);

const wizard = readFileSync(new URL('../app/components/groups/AssignTrainingWizard.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/components/programDesign/ProgramDesignHome.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
assert.match(wizard, /Who/);
assert.match(wizard, /What/);
assert.match(wizard, /When/);
assert.match(wizard, /Review/);
assert.match(wizard, /Create with AI/);
assert.match(wizard, /Create manually/);
assert.match(wizard, /One-off workout/);
assert.match(wizard, /Assigning…/);
assert.match(wizard, /Your selections are still here/);
assert.match(wizard, /assign-wizard-actions/);
assert.match(home, /assignmentReturn\?\.creation === 'manual'/);
assert.match(home, /onAssignmentProgramReady/);
assert.match(page, /assignGroupPrograms/);
assert.doesNotMatch(page, /for\(const uid of payload\.memberUserIds\)/);
assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.assign-wizard\{overflow-x:hidden\}/);
assert.match(css, /\.assign-wizard-actions \.btn\{width:100%;min-height:44px\}/);

console.log('assignment wizard checks passed');
