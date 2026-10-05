/**
 * BIQ-0238 Phase 1 group architecture checks.
 * Run: npx tsx scripts/test-group-architecture.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSIGNABLE_MEMBER_ROLES,
  canAdministerGroup,
  canAssignInGroup,
  canCustomizeGroupProgramForMe,
  canEditProgramRecord,
  canEditSharedGroupProgram,
  canSetGroupDefaultProgram,
  editTargetVisibility,
  isAssignableMemberRole,
  resolveGroupEditIntent,
  roleLabel,
} from '../lib/groups/permissions';
import { DEFAULT_GROUP_PERMISSIONS, groupPermissionFlags } from '../lib/groups/groupPermissions';
import { classifySetLogScope } from '../lib/groups/progressScope';
import { groupSourceKey, orderGroupsForEnrollment, personalSourceKey } from '../lib/groups/trainingSources';
import { decideGroupEnrollmentSync } from '../lib/programDesign/enrollmentSync';
import type { ProgramDesignRecord } from '../lib/programDesign/types';

function prog(partial: Partial<ProgramDesignRecord> & { id: string; name: string }): ProgramDesignRecord {
  return {
    owner_user_id: 'user-1',
    visibility: 'personal',
    status: 'active',
    weeks: 4,
    start_date: '2026-09-01',
    end_date: '2026-09-28',
    source_program_id: null,
    team_id: null,
    ...partial,
  } as ProgramDesignRecord;
}

const date = '2026-09-06';
const groupA = prog({
  id: 'plan-a',
  name: 'Basketball',
  visibility: 'team',
  team_id: 'group-a',
});
const groupB = prog({
  id: 'plan-b',
  name: 'Family',
  visibility: 'team',
  team_id: 'group-b',
});
const personal = prog({
  id: 'plan-me',
  name: 'Full Body',
  visibility: 'personal',
});
const justMe = prog({
  id: 'plan-just-me',
  name: 'Basketball (just me)',
  visibility: 'personal',
  source_program_id: 'plan-a',
  team_id: 'group-a',
});

const migration = readFileSync(
  new URL('../supabase/migrations/20261005_054_group_architecture_phase1.sql', import.meta.url),
  'utf8'
);

assert.deepEqual(DEFAULT_GROUP_PERMISSIONS, {
  members_can_create_shared_workouts: false,
  members_can_edit_shared_workouts: false,
  members_can_assign_workouts: false,
  members_can_view_member_progress: false,
});
assert.equal(roleLabel('manager'), 'Manager');
assert.equal(roleLabel('editor'), 'Manager');
assert.deepEqual([...ASSIGNABLE_MEMBER_ROLES], ['manager', 'member']);

// 1–2. One authoritative owner. A normal role edit cannot create another.
assert.equal(isAssignableMemberRole('owner'), false);
assert.equal(isAssignableMemberRole('manager'), true);
assert.equal(canAdministerGroup('manager'), false);
assert.equal(canAdministerGroup('owner'), true);
assert.match(migration, /Authoritative group owner/);
assert.match(migration, /Role must be manager or member/);
assert.match(migration, /Use st_transfer_group_ownership to change the group owner/);
assert.match(migration, /create or replace function public\.st_transfer_group_ownership/);
assert.doesNotMatch(migration, /drop column[\s\S]{0,80}followed_program_id/);

// 3. Manager can assign the entire group. Member cannot unless the flag is on.
assert.equal(canSetGroupDefaultProgram('manager'), true);
assert.equal(canAssignInGroup('manager'), true);
assert.equal(canSetGroupDefaultProgram('member'), false);
assert.equal(canSetGroupDefaultProgram('member', { ...DEFAULT_GROUP_PERMISSIONS, members_can_assign_workouts: true }), true);
assert.match(migration, /create or replace function public\.st_set_group_default_program/);
assert.match(migration, /Only the group owner can delete or archive the group|canAdministerGroup|st_user_is_team_owner/);

// 4–5. Member cannot edit the shared template by default, and can still customize for themselves.
assert.equal(canEditSharedGroupProgram('member'), false);
assert.equal(resolveGroupEditIntent('member', 'shared_template'), 'none');
assert.equal(editTargetVisibility('none'), null);
assert.equal(canEditProgramRecord({ visibility: 'team' }, 'member'), false);
assert.equal(resolveGroupEditIntent('member', 'training'), 'customize_for_me');
assert.equal(editTargetVisibility('customize_for_me'), 'personal');
assert.equal(canCustomizeGroupProgramForMe('user-1'), true);
assert.equal(resolveGroupEditIntent('manager', 'shared_template'), 'edit_shared');
assert.equal(editTargetVisibility('edit_shared'), 'team');
assert.equal(
  resolveGroupEditIntent('member', 'shared_template', {
    ...DEFAULT_GROUP_PERMISSIONS,
    members_can_edit_shared_workouts: true,
  }),
  'edit_shared'
);
assert.equal(groupPermissionFlags(null).members_can_edit_shared_workouts, false);

// 6. Existing first-time member enrollment still claims an empty follow.
const first = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [groupA],
  personalPrograms: [],
  followedProgramId: null,
  dateYmd: date,
  teamId: 'group-a',
});
assert.equal(first.reason, 'auto_enrolled');
assert.equal(first.writeFollowId, 'plan-a');
assert.equal(first.groupEnrollment?.isPrimary, true);

// 7. Group B does not replace Group A because it is processed later.
const ordered = orderGroupsForEnrollment(
  [
    { id: 'group-b' },
    { id: 'group-a' },
  ],
  'group-a'
);
assert.equal(ordered[0].id, 'group-a');
let followed: string | null = null;
for (const group of ordered) {
  const plan = group.id === 'group-a' ? groupA : groupB;
  const decision = decideGroupEnrollmentSync({
    role: 'member',
    groupPrograms: [plan],
    personalPrograms: [],
    followedProgramId: followed,
    dateYmd: date,
    teamId: group.id,
  });
  if (decision.writeFollowId) followed = decision.writeFollowId;
  if (group.id === 'group-b') {
    assert.equal(decision.reason, 'preserved_other_follow');
    assert.equal(decision.writeFollowId, undefined);
    assert.equal(decision.programId, 'plan-a');
    assert.equal(decision.groupEnrollment?.isPrimary, false);
    assert.equal(decision.groupEnrollment?.programId, 'plan-b');
  }
}
assert.equal(followed, 'plan-a');
assert.equal(groupSourceKey('group-b'), 'group:group-b');
assert.equal(personalSourceKey(), 'personal');

// 8. Joining or syncing a group does not replace a personal program.
const joined = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [groupA],
  personalPrograms: [personal],
  followedProgramId: personal.id,
  dateYmd: date,
  teamId: 'group-a',
});
assert.equal(joined.reason, 'following_personal');
assert.equal(joined.writeFollowId, undefined);
assert.equal(joined.programId, personal.id);
assert.equal(joined.personalEnrollment?.programId, personal.id);
assert.equal(joined.personalEnrollment?.isPrimary, true);
assert.equal(joined.groupEnrollment?.isPrimary, false);

// 9. A personal fork stays off the shared template. History is a separate log row.
const custom = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [groupA],
  personalPrograms: [justMe],
  followedProgramId: justMe.id,
  dateYmd: date,
  teamId: 'group-a',
});
assert.equal(custom.reason, 'personalized_copy');
assert.equal(custom.writeFollowId, undefined);
assert.equal(custom.programId, justMe.id);
assert.equal(editTargetVisibility(resolveGroupEditIntent('member', 'training')), 'personal');

// 10. Group progress scope matches the logs a roster and a member detail should share.
assert.equal(
  classifySetLogScope({ logTeamId: 'group-a', groupTeamId: 'group-a' }),
  'group'
);
assert.equal(
  classifySetLogScope({
    logTeamId: null,
    programTeamId: 'group-a',
    programVisibility: 'team',
    groupTeamId: 'group-a',
  }),
  'group'
);
assert.equal(
  classifySetLogScope({ logTeamId: null, programTeamId: null, groupTeamId: 'group-a' }),
  'personal'
);
assert.equal(
  classifySetLogScope({ logTeamId: 'group-b', groupTeamId: 'group-a' }),
  'personal'
);
assert.match(migration, /create or replace function public\.st_group_progress_logs/);
assert.match(migration, /members_can_view_member_progress/);

console.log('group architecture checks passed');
