import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildGroupTrainingBoard } from '../lib/groups/trainingWorkspace';
import {
  buildMemberDirectory,
  canOpenMemberTraining,
  filterMemberDirectory,
  MEMBER_DIRECTORY_PAGE_SIZE,
  nextThisWeekText,
  visibleDirectoryRows,
  type DirectoryRosterMember,
  type DirectoryTrainingSnapshot,
} from '../lib/groups/memberDirectory';

const today = '2026-10-23';
const weekStart = '2026-10-19';
const weekEnd = '2026-10-25';

assert.equal(canOpenMemberTraining({ viewerUserId: 'amy', subjectUserId: 'amy', canManage: false, canAssign: false }), true);
assert.equal(canOpenMemberTraining({ viewerUserId: 'amy', subjectUserId: 'mike', canManage: false, canAssign: false }), false);
assert.equal(canOpenMemberTraining({ viewerUserId: 'amy', subjectUserId: 'mike', canManage: true, canAssign: false }), true);
assert.equal(canOpenMemberTraining({ viewerUserId: 'amy', subjectUserId: 'mike', canManage: false, canAssign: true }), true);

assert.deepEqual(nextThisWeekText({ date: '2026-10-23', label: 'Full Body A' }, today, weekStart, weekEnd), {
  date: '2026-10-23',
  text: 'Next this week · Full Body A',
});
assert.deepEqual(nextThisWeekText({ date: '2026-11-02', label: 'Later' }, today, weekStart, weekEnd), {
  date: null,
  text: 'None remaining this week',
});
assert.equal(nextThisWeekText(null, today, weekStart, weekEnd).text, 'None remaining this week');

const roster: DirectoryRosterMember[] = [
  { id: '1', userId: 'amy', name: 'Amy', role: 'member' },
  { id: '2', userId: 'mike', name: 'Mike', role: 'manager' },
];
const training: DirectoryTrainingSnapshot[] = [
  { userId: 'amy', planName: 'Amy Plan', status: 'on_track', statusLabel: 'On track', nextDate: '2026-10-24', nextLabel: 'Lower' },
  { userId: 'mike', planName: 'Mike Plan', status: 'needs_plan', statusLabel: 'No program assigned', nextDate: '2026-11-01', nextLabel: 'Later' },
];
const memberView = buildMemberDirectory({
  roster,
  training,
  viewerUserId: 'amy',
  canManage: false,
  canAssign: false,
  today,
  weekStart,
  weekEnd,
  trainingReady: true,
});
assert.equal(memberView.find((row) => row.userId === 'amy')?.programLabel, 'Amy Plan');
assert.equal(memberView.find((row) => row.userId === 'amy')?.nextText, 'Next this week · Lower');
assert.equal(memberView.find((row) => row.userId === 'mike')?.programLabel, null);
assert.equal(memberView.find((row) => row.userId === 'mike')?.nextText, null);
assert.equal(memberView.find((row) => row.userId === 'mike')?.canOpen, false);

const assignerView = buildMemberDirectory({
  roster,
  training,
  viewerUserId: 'amy',
  canManage: false,
  canAssign: true,
  today,
  weekStart,
  weekEnd,
  trainingReady: true,
});
assert.equal(assignerView.find((row) => row.userId === 'mike')?.programLabel, 'Mike Plan');
assert.equal(assignerView.find((row) => row.userId === 'mike')?.nextText, 'None remaining this week');
assert.equal(assignerView.find((row) => row.userId === 'mike')?.canOpen, true);

const byProgram = filterMemberDirectory(assignerView, { program: 'Amy Plan' });
assert.deepEqual(byProgram.map((row) => row.userId), ['amy']);
const byStatus = filterMemberDirectory(assignerView, { status: 'needs_plan', sort: 'status' });
assert.deepEqual(byStatus.map((row) => row.userId), ['mike']);

const largeRoster: DirectoryRosterMember[] = Array.from({ length: 220 }, (_, index) => ({
  id: `id-${index}`,
  userId: `user-${index}`,
  name: `Member ${String(index).padStart(3, '0')}`,
  role: index % 20 === 0 ? 'manager' : 'member',
}));
const largeTraining: DirectoryTrainingSnapshot[] = largeRoster.map((member, index) => ({
  userId: member.userId,
  planName: index % 3 === 0 ? 'Strength' : 'Conditioning',
  status: index % 5 === 0 ? 'needs_attention' : 'on_track',
  statusLabel: index % 5 === 0 ? 'Missed 1 workout' : 'On track',
  nextDate: index % 4 === 0 ? null : `2026-10-${String(19 + (index % 7)).padStart(2, '0')}`,
  nextLabel: index % 4 === 0 ? null : 'Lift',
}));
const started = performance.now();
const largeRows = buildMemberDirectory({
  roster: largeRoster,
  training: largeTraining,
  viewerUserId: 'user-0',
  canManage: true,
  canAssign: false,
  today,
  weekStart,
  weekEnd,
  trainingReady: true,
});
const matched = filterMemberDirectory(largeRows, { name: 'member 1', role: 'member', sort: 'next' });
const page = visibleDirectoryRows(matched, MEMBER_DIRECTORY_PAGE_SIZE);
const elapsed = performance.now() - started;
assert.equal(page.length, MEMBER_DIRECTORY_PAGE_SIZE);
assert.ok(matched.length > MEMBER_DIRECTORY_PAGE_SIZE);
assert.ok(elapsed < 200, `directory filter took ${elapsed.toFixed(1)}ms`);
for (let index = 1; index < page.length; index += 1) {
  const previous = page[index - 1].nextDate;
  const current = page[index].nextDate;
  if (!previous && current) assert.fail('a member with no activity this week sorted ahead of a dated activity');
  if (previous && current) assert.ok(previous <= current);
}

const boardStarted = performance.now();
const board = buildGroupTrainingBoard({
  teamId: 'team',
  today,
  canManage: true,
  viewerUserId: 'user-0',
  members: largeRoster.map((member) => ({
    userId: member.userId,
    name: member.name,
    trainingSource: 'team',
    isActiveParticipant: true,
  })),
  programs: [],
  expectations: largeRoster.slice(0, 200).map((member, index) => ({
    userId: member.userId,
    sourceKey: 'group:team',
    teamId: 'team',
    origin: 'program' as const,
    scheduledDate: index % 2 === 0 ? today : '2026-11-02',
    title: 'Lift',
    dayLabel: 'Fri',
    workoutId: `wo-${index}`,
  })),
  expectationsAvailable: true,
  completionKnown: true,
});
const boardElapsed = performance.now() - boardStarted;
assert.equal(board.members.length, 220);
assert.ok(boardElapsed < 250, `training board took ${boardElapsed.toFixed(1)}ms`);

const directorySource = readFileSync(new URL('../app/components/groups/GroupMembersDirectory.tsx', import.meta.url), 'utf8');
const factsSource = readFileSync(new URL('../lib/groups/loadGroupTrainingFacts.ts', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../app/components/groups/GroupTrainingHome.tsx', import.meta.url), 'utf8');
const hubSource = readFileSync(new URL('../app/components/groups/GroupsHub.tsx', import.meta.url), 'utf8');
assert.match(directorySource, /visibleDirectoryRows/);
assert.match(directorySource, /Next this week/);
assert.doesNotMatch(directorySource, /loadMemberRosterMeta|fetchGroupScopedSetLogs|st_set_logs/);
assert.match(factsSource, /subjectUserId/);
assert.match(factsSource, /userId: subjectUserId/);
assert.doesNotMatch(homeSource, /GroupTrainingMemberList/);
assert.doesNotMatch(homeSource, /Training view/);
assert.match(hubSource, /data-testid="member-profile-sheet"|GroupMemberProfileSheet/);
assert.doesNotMatch(hubSource, /setTrainingFocusUserId/);

console.log(`member directory checks passed (${elapsed.toFixed(1)}ms filter, ${boardElapsed.toFixed(1)}ms board)`);
