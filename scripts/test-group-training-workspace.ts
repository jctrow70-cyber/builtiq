/**
 * BIQ-0262 Phase 1 group training workspace checks.
 * Run: npx tsx scripts/test-group-training-workspace.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  attachExpectationCompletion,
  buildGroupTrainingBoard,
  compareProgramSessions,
  orderedProgramSessions,
  programScheduleNeedsReview,
  type GroupTrainingExpectationInput,
  type GroupTrainingMemberInput,
  type GroupTrainingProgramRef,
} from '../lib/groups/trainingWorkspace';

const today = '2026-10-14';
const teamId = 'team-1';

const strength: GroupTrainingProgramRef = {
  id: 'prog-strength',
  name: 'Full Body Strength',
  startDate: '2026-10-05',
  weeks: 4,
  visibility: 'team',
  workouts: [
    { id: 'w-mon', week: 1, dayLabel: 'Mon', dayOrder: 1, title: 'Full Body A' },
    { id: 'w-wed', week: 1, dayLabel: 'Wed', dayOrder: 2, title: 'Full Body B' },
    { id: 'w-fri', week: 1, dayLabel: 'Fri', dayOrder: 3, title: 'Full Body C' },
    { id: 'w-mon-2', week: 2, dayLabel: 'Mon', dayOrder: 1, title: 'Full Body A' },
    { id: 'w-wed-2', week: 2, dayLabel: 'Wed', dayOrder: 2, title: 'Full Body B' },
    { id: 'w-fri-2', week: 2, dayLabel: 'Fri', dayOrder: 3, title: 'Full Body C' },
  ],
};

function expectation(
  userId: string,
  date: string,
  title: string,
  extra: Partial<GroupTrainingExpectationInput> = {}
): GroupTrainingExpectationInput {
  return {
    userId,
    sourceKey: `group:${teamId}`,
    teamId,
    origin: 'program',
    scheduledDate: date,
    title,
    dayLabel: extra.dayLabel || 'Mon',
    ...extra,
  };
}

function boardFor(
  members: GroupTrainingMemberInput[],
  extra: Partial<Parameters<typeof buildGroupTrainingBoard>[0]> = {}
) {
  return buildGroupTrainingBoard({
    teamId,
    today,
    canManage: true,
    viewerUserId: 'owner',
    members,
    programs: [strength],
    defaultProgramId: strength.id,
    expectations: [],
    expectationsAvailable: true,
    completionKnown: true,
    ...extra,
  });
}

const amy: GroupTrainingMemberInput = {
  userId: 'amy',
  name: 'Amy',
  trainingSource: 'team',
  isActiveParticipant: true,
  enrollment: { programId: strength.id, status: 'active', startsOn: '2026-10-06' },
};

const openAmy = boardFor([amy], {
  expectations: [
    expectation('amy', '2026-10-14', 'Full Body B', { dayLabel: 'Wed', sessionStatus: null }),
    expectation('amy', '2026-10-16', 'Full Body C', { dayLabel: 'Fri' }),
  ],
});
const amyRow = openAmy.members[0];
assert.equal(amyRow.planName, 'Full Body Strength');
assert.equal(amyRow.planKind, 'group_program');
assert.equal(amyRow.scheduleDays, 'Mon, Wed, Fri');
assert.equal(amyRow.status, 'on_track');
assert.equal(amyRow.nextWorkout?.label, 'Wednesday · Full Body B');
assert.equal(amyRow.weekItems.find((item) => item.date === '2026-10-14')?.state, 'Due today');
assert.equal(openAmy.summary.assigned, 1);
assert.equal(openAmy.summary.needsPlan, 0);
assert.equal(openAmy.summary.workoutsThisWeek, 2);

const completedToday = boardFor([amy], {
  expectations: [
    expectation('amy', '2026-10-14', 'Full Body B', { dayLabel: 'Wed', sessionStatus: 'completed' }),
    expectation('amy', '2026-10-16', 'Full Body C', { dayLabel: 'Fri' }),
  ],
});
assert.equal(completedToday.members[0].nextWorkout?.date, '2026-10-16');
assert.equal(completedToday.members[0].status, 'on_track');
assert.equal(completedToday.members[0].weekItems[0].state, 'Completed');

const missedEarlier = boardFor([amy], {
  expectations: [expectation('amy', '2026-10-12', 'Full Body A', { dayLabel: 'Mon', sessionStatus: null })],
});
assert.equal(missedEarlier.members[0].status, 'needs_attention');
assert.equal(missedEarlier.members[0].statusLabel, 'Missed 1 workout');
assert.deepEqual(missedEarlier.members[0].missedDates, ['2026-10-12']);
assert.equal(missedEarlier.members[0].weekItems[0].state, 'Missed');

const oldMiss = boardFor([amy], {
  expectations: [expectation('amy', '2026-10-04', 'Full Body A', { sessionStatus: null })],
});
assert.equal(oldMiss.members[0].status, 'on_track');

const excusedPast = boardFor([amy], {
  expectations: [expectation('amy', '2026-10-12', 'Full Body A', { excused: true })],
});
assert.equal(excusedPast.members[0].status, 'on_track');
assert.equal(excusedPast.members[0].missedCount, 0);

const sarah: GroupTrainingMemberInput = {
  userId: 'sarah',
  name: 'Sarah',
  trainingSource: 'team',
  isActiveParticipant: true,
};
const needsPlan = boardFor([sarah], { defaultProgramId: null, programs: [] });
assert.equal(needsPlan.members[0].status, 'needs_plan');
assert.equal(needsPlan.members[0].statusLabel, 'No program assigned');
assert.equal(needsPlan.members[0].planName, 'Not assigned');
assert.equal(needsPlan.summary.needsPlan, 1);
assert.equal(needsPlan.summary.assigned, 0);

const mike: GroupTrainingMemberInput = {
  userId: 'mike',
  name: 'Mike',
  trainingSource: 'personal',
  isActiveParticipant: true,
  assignment: { assignmentType: 'personal', programId: 'secret', programName: 'Secret Hypertrophy' },
};
const personal = boardFor([mike, sarah], { defaultProgramId: strength.id });
assert.equal(personal.members.find((row) => row.userId === 'mike')?.status, 'personal');
assert.equal(personal.members.find((row) => row.userId === 'mike')?.planName, 'Personal training');
assert.equal(personal.summary.needsPlan, 0);
assert.equal(JSON.stringify(personal).includes('Secret Hypertrophy'), false);

const fork: GroupTrainingMemberInput = {
  userId: 'sarah',
  name: 'Sarah',
  trainingSource: 'personal',
  isActiveParticipant: true,
  assignment: { assignmentType: 'individual_team', programId: 'fork-1', programName: 'Full Body (just me)' },
  enrollment: { programId: 'fork-1', status: 'active' },
};
const custom = boardFor([fork]);
assert.equal(custom.members[0].planKind, 'custom_fork');
assert.equal(custom.members[0].planName, 'Full Body (just me)');
assert.equal(custom.summary.assigned, 1);
assert.equal(custom.summary.needsPlan, 0);
assert.equal(custom.members[0].status, 'on_track');

const paused: GroupTrainingMemberInput = {
  userId: 'amy',
  name: 'Amy',
  trainingSource: 'team',
  isActiveParticipant: false,
};
const pausedBoard = boardFor([paused], { defaultProgramId: null, programs: [] });
assert.equal(pausedBoard.members[0].status, 'paused');
assert.equal(pausedBoard.summary.needsPlan, 0);

const enrollmentPaused = boardFor([
  { ...amy, isActiveParticipant: true, enrollment: { programId: strength.id, status: 'paused' } },
]);
assert.equal(enrollmentPaused.members[0].status, 'paused');
assert.equal(enrollmentPaused.summary.assigned, 1);

const uneven: GroupTrainingProgramRef = {
  ...strength,
  id: 'prog-uneven',
  workouts: [
    { id: 'a', week: 1, dayLabel: 'Mon', dayOrder: 1, title: 'A' },
    { id: 'b', week: 1, dayLabel: 'Wed', dayOrder: 2, title: 'B' },
    { id: 'c', week: 2, dayLabel: 'Tue', dayOrder: 1, title: 'C' },
    { id: 'd', week: 2, dayLabel: 'Thu', dayOrder: 2, title: 'D' },
  ],
};
assert.equal(programScheduleNeedsReview(uneven.workouts), true);
const review = boardFor(
  [{ ...amy, enrollment: { programId: uneven.id, status: 'active' } }],
  { programs: [uneven], defaultProgramId: uneven.id }
);
assert.equal(review.members[0].status, 'schedule_review');
assert.equal(review.members[0].scheduleDays, 'Mon, Wed');
assert.equal(review.members[0].scheduleNeedsReview, true);

const reviewAndMiss = boardFor([{ ...amy, enrollment: { programId: uneven.id, status: 'active' } }], {
  programs: [uneven],
  defaultProgramId: uneven.id,
  expectations: [expectation('amy', '2026-10-11', 'A', { sessionStatus: null })],
});
assert.equal(reviewAndMiss.members[0].status, 'needs_attention');
assert.equal(reviewAndMiss.members[0].scheduleNeedsReview, true);

const tied = orderedProgramSessions(
  [
    { id: 'b', week: 1, dayLabel: 'Wed', dayOrder: 2, title: 'B' },
    { id: 'a', week: 1, dayLabel: 'Mon', dayOrder: 2, title: 'A' },
    { id: 'c', week: 1, dayLabel: 'Fri', dayOrder: 1, title: 'C' },
  ],
  1
);
assert.deepEqual(
  tied.map((workout) => workout.id),
  ['c', 'a', 'b']
);
assert.ok(
  compareProgramSessions(
    { id: 'z', dayLabel: 'Mon', dayOrder: 5 },
    { id: 'a', dayLabel: 'Fri', dayOrder: 1 }
  ) > 0
);

const privacy = boardFor([amy, sarah], { canManage: false, viewerUserId: 'amy', defaultProgramId: null, programs: [] });
assert.deepEqual(
  privacy.members.map((row) => row.userId),
  ['amy']
);
assert.equal(privacy.summary.members, 1);
assert.equal(JSON.stringify(privacy).includes('sarah'), false);

const manager = boardFor([amy, sarah]);
assert.equal(manager.summary.members, 2);
assert.equal(manager.canManage === undefined, true);

const withSession = attachExpectationCompletion(
  [expectation('amy', '2026-10-12', 'Full Body A', { id: 'exp-1', workoutId: 'w-mon', dayLabel: 'Mon' })],
  [{ userId: 'amy', expectationId: 'exp-1', status: 'completed' }],
  []
);
assert.equal(withSession[0].sessionStatus, 'completed');

const withLog = attachExpectationCompletion(
  [expectation('amy', '2026-10-14', 'Full Body B', { workoutId: 'w-wed', dayLabel: 'Wed' })],
  [],
  [{ userId: 'amy', date: '2026-10-14' }]
);
assert.equal(withLog[0].sessionStatus, 'completed');

const home = readFileSync(new URL('../app/components/groups/GroupTrainingHome.tsx', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../lib/groups/loadGroupTrainingFacts.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
assert.match(home, /Assign Training/);
assert.match(home, /Program library/);
assert.doesNotMatch(home, /GroupScheduleAdherence/);
assert.match(home, />\s*Calendar\s*</);
assert.match(loader, /source_kind', 'group'/);
assert.match(loader, /source_key', sourceKey/);
assert.doesNotMatch(loader, /source_key', 'personal'/);
assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.group-training-member\{grid-template-columns:1fr\}/);
assert.match(css, /\.group-training[\s\S]*overflow-x:hidden/);
const profile = readFileSync(new URL('../app/components/groups/MemberTrainingWorkspace.tsx', import.meta.url), 'utf8');
assert.match(profile, /Add Activity/);
assert.match(profile, /Change Program/);
assert.match(profile, /View Full Plan/);
assert.match(profile, />\s*Manage\s*</);
assert.match(profile, /Members/);
assert.match(profile, /Edit Training Days/);
assert.match(profile, /Calendar/);
assert.match(profile, /Progress/);
assert.match(profile, /Details/);
assert.match(profile, /hideViewButton/);
assert.match(profile, /member-week-strip/);
assert.match(profile, /aria-label="Previous week"/);
assert.match(profile, /Choose a member/);
assert.match(profile, /Find a member/);
assert.match(profile, /setOneOffDate\(selectedDate\)/);
assert.match(profile, /exercises/);
assert.doesNotMatch(profile, /selectedItems\.length === 1/);
assert.match(profile, /Nothing from this group is scheduled this day/);
assert.match(home, /memberUserIds: \[selected\.userId\]/);
assert.match(home, /st_assign_group_workout|assignGroupWorkout/);
assert.match(home, /board\?\.members/);
assert.doesNotMatch(profile, /onStartWorkout/);
assert.match(css, /\.member-week-strip,\.group-calendar-day-strip\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
assert.match(loader, /loadMemberTrainingWeek/);
assert.match(loader, /\.eq\('user_id', input\.userId\)/);
assert.doesNotMatch(loader, /84/);
assert.match(home, /setProfileWeekStart/);
assert.match(home, /statusFilter/);

console.log('group training workspace checks passed');
