/**
 * BIQ-0262 Phase 1 group training workspace checks.
 * Run: npx tsx scripts/test-group-training-workspace.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectationFactsFromSchedule } from '../lib/progress/adherence';
import {
  applyAuthoritativeExpectationStatus,
  assignedProgramFromPayload,
  attachExpectationCompletion,
  buildGroupTrainingBoard,
  compareProgramSessions,
  groupExpectationState,
  orderedProgramSessions,
  programRefFromRecord,
  programScheduleNeedsReview,
  summarizeExpectationStatuses,
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

const labeled = applyAuthoritativeExpectationStatus(
  [
    expectation('amy', '2026-10-12', 'Full Body A', { id: 'exp-old', workoutId: 'w-mon', sessionStatus: 'completed' }),
    expectation('amy', '2026-10-13', 'Full Body B', { id: 'exp-ex', workoutId: 'w-wed', excused: false }),
    expectation('amy', '2026-10-14', 'Full Body A', { id: 'exp-a', workoutId: 'w-a' }),
    expectation('amy', '2026-10-14', 'Full Body B', { id: 'exp-b', workoutId: 'w-b' }),
    expectation('amy', '2026-10-16', 'Full Body C', { id: 'exp-later', workoutId: 'w-fri' }),
  ],
  [
    { expectation_id: 'exp-old', user_id: 'amy', scheduled_date: '2026-10-12', status: 'missed' },
    { expectation_id: 'exp-ex', user_id: 'amy', scheduled_date: '2026-10-13', status: 'excused' },
    { expectation_id: 'exp-a', user_id: 'amy', scheduled_date: '2026-10-14', status: 'completed' },
    { expectation_id: 'exp-b', user_id: 'amy', scheduled_date: '2026-10-14', status: 'partial' },
    { expectation_id: 'exp-later', user_id: 'amy', scheduled_date: '2026-10-16', status: 'paused' },
    { expectation_id: 'someone-else', user_id: 'amy', scheduled_date: '2026-10-12', status: 'completed' },
  ]
);
assert.equal(labeled.find((row) => row.id === 'exp-old')?.sessionStatus, undefined);
assert.equal(groupExpectationState(labeled.find((row) => row.id === 'exp-old')!, today, false, 0), 'Missed');
assert.equal(groupExpectationState(labeled.find((row) => row.id === 'exp-ex')!, today, true), 'Excused');
assert.equal(groupExpectationState(labeled.find((row) => row.id === 'exp-a')!, today, false), 'Completed');
assert.equal(groupExpectationState(labeled.find((row) => row.id === 'exp-b')!, today, false), 'Partial');
assert.equal(groupExpectationState(labeled.find((row) => row.id === 'exp-later')!, today, true, 4), 'Paused');
const authoritativeBoard = boardFor([amy], { expectations: labeled, missedByUser: { amy: 9 } });
assert.equal(authoritativeBoard.members[0].missedCount, 1);
assert.deepEqual(authoritativeBoard.members[0].missedDates, ['2026-10-12']);
assert.equal(authoritativeBoard.members[0].status, 'needs_attention');
assert.equal(authoritativeBoard.members[0].weekItems.find((item) => item.workoutId === 'w-a')?.state, 'Completed');
assert.equal(authoritativeBoard.members[0].weekItems.find((item) => item.workoutId === 'w-b')?.state, 'Partial');
assert.equal(authoritativeBoard.members[0].weekItems.find((item) => item.workoutId === 'w-fri')?.state, 'Paused');

const weekSummary = summarizeExpectationStatuses(
  [
    { user_id: 'amy', expectation_id: '1', scheduled_date: '2026-10-12', status: 'missed' },
    { user_id: 'amy', expectation_id: '2', scheduled_date: '2026-10-13', status: 'completed' },
    { user_id: 'amy', expectation_id: '3', scheduled_date: '2026-10-14', status: 'paused' },
    { user_id: 'amy', expectation_id: '4', scheduled_date: '2026-10-14', status: 'skipped' },
  ],
  ['amy', 'ethan'],
  today
);
assert.equal(weekSummary[0].missed, 1);
assert.equal(weekSummary[0].completed, 1);
assert.equal(weekSummary[0].paused, 1);
assert.equal(weekSummary[0].skipped, 1);
assert.equal(weekSummary[0].dueToday, 0);
assert.equal(weekSummary[0].completionRate, 50);
assert.equal(weekSummary[1].missed, 0);
assert.equal(weekSummary[1].completionRate, null);

const enrolledPlan = assignedProgramFromPayload(
  {
    id: 'enrolled',
    name: "Mary's butt stuff (just me)",
    weeks: 6,
    visibility: 'personal',
    st_workouts: [
      {
        id: 'w1',
        week: 1,
        day_label: 'Mon',
        day_order: 1,
        workout_type: 'Full Body A',
        st_exercises: [
          {
            id: 'e1',
            name: 'Hip thrust',
            sort_order: 1,
            st_planned_sets: [{ set_number: 1, set_type: 'working', target_reps: '8', target_weight: '100', target_rir: 2, rest_seconds: 90 }],
          },
        ],
      },
    ],
  },
  'enrolled'
);
assert.equal(enrolledPlan?.name, "Mary's butt stuff (just me)");
assert.equal(enrolledPlan?.weeks, 6);
assert.equal(enrolledPlan?.workouts?.[0].exercises?.[0].sets?.[0].rir, '2');
assert.equal(enrolledPlan?.workouts?.[0].exercises?.[0].sets?.[0].restSeconds, 90);
assert.equal(assignedProgramFromPayload({ id: 'assignment-row', name: 'testing24' }, 'enrolled'), null);
assert.equal(assignedProgramFromPayload(null, 'enrolled'), null);

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

const groupDay = expectation('amy', '2026-10-12', 'Full Body A', { id: 'exp-group', workoutId: 'group-wo', dayLabel: 'Mon' });
const personalSameDay = attachExpectationCompletion(
  [groupDay],
  [{ userId: 'amy', workoutId: 'personal-wo', logDate: '2026-10-12', status: 'completed', expectationId: 'personal-exp' }]
);
assert.equal(personalSameDay[0].sessionStatus, undefined);
assert.equal(groupExpectationState(personalSameDay[0], today, true), 'Missed');

const otherCopy = attachExpectationCompletion(
  [expectation('amy', '2026-10-11', 'Full Body B', { id: 'exp-copy', workoutId: 'enrolled-wo', dayLabel: 'Sun' })],
  [{ userId: 'amy', workoutId: 'fork-wo', logDate: '2026-10-11', status: 'completed' }]
);
assert.equal(otherCopy[0].sessionStatus, undefined);
assert.equal(groupExpectationState(otherCopy[0], today, true), 'Missed');

const completedGroup = attachExpectationCompletion(
  [groupDay],
  [{ userId: 'amy', workoutId: 'group-wo', logDate: '2026-10-12', status: 'completed', completedAt: '2026-10-12T12:00:00Z' }]
);
assert.equal(completedGroup[0].sessionStatus, 'completed');
assert.equal(groupExpectationState(completedGroup[0], today, true), 'Completed');
const progressMiss = expectationFactsFromSchedule(
  [{ id: 'exp-group', workout_id: 'group-wo', scheduled_date: '2026-10-12', source_key: `group:${teamId}`, team_id: teamId, origin: 'program' }],
  [{ workout_id: 'personal-wo', log_date: '2026-10-12', status: 'completed', expectation_id: 'personal-exp' }]
);
assert.equal(progressMiss[0].sessionStatus, null);
const progressFacts = expectationFactsFromSchedule(
  [{ id: 'exp-group', workout_id: 'group-wo', scheduled_date: '2026-10-12', source_key: `group:${teamId}`, team_id: teamId, origin: 'program' }],
  [{ workout_id: 'personal-wo', log_date: '2026-10-12', status: 'completed', expectation_id: 'personal-exp' }, { workout_id: 'group-wo', log_date: '2026-10-12', status: 'completed' }]
);
assert.equal(progressFacts[0].sessionStatus, 'completed');

const sameDay = attachExpectationCompletion(
  [
    expectation('amy', '2026-10-13', 'Full Body A', { id: 'exp-a', workoutId: 'wo-a', dayLabel: 'Tue' }),
    expectation('amy', '2026-10-13', 'Full Body B', { id: 'exp-b', workoutId: 'wo-b', dayLabel: 'Tue' }),
  ],
  [{ userId: 'amy', workoutId: 'wo-a', logDate: '2026-10-13', status: 'completed' }]
);
assert.equal(sameDay[0].sessionStatus, 'completed');
assert.equal(sameDay[1].sessionStatus, undefined);
assert.equal(groupExpectationState(sameDay[1], today, true), 'Missed');

const excused = expectation('amy', '2026-10-12', 'Full Body A', { id: 'exp-ex', workoutId: 'wo-a', excused: true });
assert.equal(groupExpectationState(excused, today, true), 'Excused');
const moved = attachExpectationCompletion(
  [expectation('amy', '2026-10-15', 'Full Body A', { id: 'exp-moved', workoutId: 'wo-a', dayLabel: 'Thu' })],
  [
    { userId: 'amy', workoutId: 'wo-a', logDate: '2026-10-12', status: 'completed' },
    { userId: 'amy', workoutId: 'wo-a', logDate: '2026-10-15', status: 'completed', expectationId: 'exp-moved' },
  ]
);
assert.equal(moved[0].sessionStatus, 'completed');

const partial = attachExpectationCompletion(
  [expectation('amy', '2026-10-12', 'Full Body A', { id: 'exp-part', workoutId: 'wo-a' })],
  [{ userId: 'amy', expectationId: 'exp-part', status: 'partial' }]
);
assert.equal(partial[0].sessionStatus, 'partial');
assert.equal(groupExpectationState(partial[0], today, true), 'Partial');
const skipped = attachExpectationCompletion(
  [expectation('amy', '2026-10-12', 'Full Body B', { id: 'exp-skip', workoutId: 'wo-b', recipientStatus: 'pending' })],
  [{ userId: 'amy', workoutId: 'wo-b', logDate: '2026-10-12', status: 'skipped' }]
);
assert.equal(skipped[0].sessionStatus, 'skipped');
assert.equal(groupExpectationState(skipped[0], today, true), 'Skipped');
const recipientSkipped = attachExpectationCompletion(
  [expectation('amy', '2026-10-12', 'Extra', { id: 'exp-rec', workoutId: 'wo-c', origin: 'assignment', recipientStatus: 'skipped' })],
  []
);
assert.equal(recipientSkipped[0].sessionStatus, 'skipped');

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
assert.doesNotMatch(loader, /fetchGroupScopedSetLogs/);
assert.match(loader, /st_group_expectation_status/);
assert.match(loader, /p_member_user_id = input.memberUserId/);
assert.match(loader, /memberUserId: input.userId/);
assert.doesNotMatch(loader, /st_group_schedule_adherence/);
const progressQueries = readFileSync(new URL('../lib/progress/queries.ts', import.meta.url), 'utf8');
assert.doesNotMatch(progressQueries, /st_group_expectation_status/);
assert.doesNotMatch(progressQueries, /st_read_group_assigned_program/);
const adherencePanel = readFileSync(new URL('../app/components/groups/GroupScheduleAdherence.tsx', import.meta.url), 'utf8');
assert.match(adherencePanel, /st_group_expectation_status/);
assert.doesNotMatch(adherencePanel, /st_group_schedule_adherence/);
const programRead = readFileSync(new URL('../supabase/migrations/20261016_066_group_assigned_program_read.sql', import.meta.url), 'utf8');
assert.match(programRead, /st_user_can_edit_team\(p_team_id\)/);
assert.match(programRead, /e\.status = 'active'/);
assert.match(programRead, /e\.program_id = p_program_id/);
assert.match(programRead, /set search_path = public/);
assert.match(programRead, /revoke all on function public\.st_read_group_assigned_program/);
assert.doesNotMatch(programRead, /st_set_logs/);
assert.match(programRead, /order by w\.week nulls last, w\.day_order nulls last, w\.id/);
assert.doesNotMatch(programRead, /source_program_id/);
assert.doesNotMatch(programRead, /\b(insert into|delete from|truncate)\b/i);
const expectationStatus = readFileSync(new URL('../supabase/migrations/20261016_067_group_expectation_status.sql', import.meta.url), 'utf8');
assert.match(expectationStatus, /st_group_expectation_status/);
assert.doesNotMatch(expectationStatus, /create or replace function public\.st_group_schedule_adherence\(/);
assert.doesNotMatch(expectationStatus, /st_set_logs/);
const adherenceSql = readFileSync(new URL('../supabase/migrations/20261016_067_adherence_session_match.sql', import.meta.url), 'utf8');
assert.match(adherenceSql, /s\.expectation_id is null/);
assert.doesNotMatch(adherenceSql, /enr\.status = 'paused'/);
assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.group-training-member\{grid-template-columns:1fr\}/);
assert.match(css, /\.group-training[\s\S]*overflow-x:hidden/);
const profile = readFileSync(new URL('../app/components/groups/MemberTrainingWorkspace.tsx', import.meta.url), 'utf8');
assert.match(profile, /Add Activity/);
assert.match(profile, /Change Program/);
assert.match(profile, /View Full Plan/);
assert.match(profile, /fetchFullProgram\(supabase, programId\)/);
assert.match(profile, /st_read_group_assigned_program/);
assert.match(profile, /p_member_user_id: member\.userId/);
assert.match(profile, /p_program_id: programId/);
assert.match(profile, /assignedProgramFromPayload/);
assert.match(profile, /member\.programId/);
assert.match(home, /teamId=\{teamId \|\| null\}/);
assert.match(profile, /You do not have permission to view this program/);
assert.match(profile, /program=\{fullProgram\}/);
assert.doesNotMatch(profile, /ProgramTemplate program=\{scheduleProgram\}/);
const loaded = programRefFromRecord({
  id: 'enrolled',
  name: 'Enrolled plan',
  weeks: 6,
  st_workouts: [
    {
      id: 'wo',
      week: 1,
      day_label: 'Mon',
      day_order: 1,
      workout_type: 'Full Body A',
      st_exercises: [
        {
          id: 'ex',
          name: 'Squat',
          sort_order: 1,
          st_planned_sets: [
            { set_number: 1, target_reps: '8', target_weight: '100', rest_seconds: 90, set_type: 'working', is_deleted: false },
            { set_number: 2, target_reps: '8', is_deleted: true },
          ],
        },
      ],
    },
  ],
});
assert.equal(loaded?.name, 'Enrolled plan');
assert.equal(loaded?.workouts?.length, 1);
assert.equal(loaded?.workouts?.[0].exercises?.length, 1);
assert.equal(loaded?.workouts?.[0].exercises?.[0].sets?.length, 1);
assert.equal(loaded?.workouts?.[0].exercises?.[0].sets?.[0].restSeconds, 90);
const enrollmentWins = boardFor(
  [
    {
      ...amy,
      assignment: { assignmentType: 'individual_team', programId: 'other-plan', programName: 'Other plan' },
      enrollment: { programId: strength.id, status: 'active', startsOn: '2026-10-05' },
    },
  ],
  { programs: [strength], defaultProgramId: 'other-plan' }
);
assert.equal(enrollmentWins.members[0].programId, strength.id);
assert.equal(enrollmentWins.members[0].planName, 'Full Body Strength');
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
