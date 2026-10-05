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
  canEditProgramByRelationship,
  canEditProgramRecord,
  canEditSharedGroupProgram,
  canSetGroupDefaultProgram,
  editTargetVisibility,
  isAssignableMemberRole,
  resolveGroupEditIntent,
  roleLabel,
} from '../lib/groups/permissions';
import { DEFAULT_GROUP_PERMISSIONS, groupPermissionFlags } from '../lib/groups/groupPermissions';
import { GROUP_WORKSPACE_TABS } from '../lib/groups/workspaceTabs';
import { classifySetLogScope } from '../lib/groups/progressScope';
import {
  groupEnrollmentProvenance,
  groupSourceKey,
  orderGroupsForEnrollment,
  personalSourceKey,
  resolveGroupParticipationProgram,
} from '../lib/groups/trainingSources';
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
assert.equal(first.groupEnrollment?.programId, 'plan-a');
assert.equal(first.personalEnrollment, null);

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
    assert.equal(decision.personalEnrollment, null);
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
assert.equal(joined.groupEnrollment?.programId, 'plan-a');

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
assert.equal(custom.personalEnrollment, null);
assert.equal(custom.groupEnrollment?.programId, justMe.id);
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
assert.doesNotMatch(migration, /is_primary boolean/);
assert.match(migration, /Not the Training calendar/);
assert.match(migration, /Phase 2 decides which backfilled group slots are shown/);

// Jesse: personal, family, and basketball participation coexist.
const buildMuscle = prog({ id: 'build-muscle', name: 'Build Muscle', visibility: 'personal' });
const familyStrength = prog({
  id: 'family-strength',
  name: 'Family Strength',
  visibility: 'team',
  team_id: 'family',
});
const verticalJump = prog({
  id: 'vertical-jump',
  name: 'Vertical Jump',
  visibility: 'team',
  team_id: 'basketball',
});
const familyFork = prog({
  id: 'family-jesse',
  name: 'Family Strength (just me)',
  visibility: 'personal',
  source_program_id: 'family-strength',
  owner_user_id: 'jesse',
});
const basketballAssigned = prog({
  id: 'basketball-assigned',
  name: 'Basketball Strength',
  visibility: 'team',
  team_id: 'basketball',
});

let followedProgramId: string | null = buildMuscle.id;
const personalSlot = buildMuscle.id;
const family = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [familyStrength],
  personalPrograms: [buildMuscle],
  followedProgramId,
  dateYmd: date,
  teamId: 'family',
  defaultProgramId: familyStrength.id,
  assignment: null,
  personalParticipationProgramId: personalSlot,
});
const basketball = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [verticalJump],
  personalPrograms: [buildMuscle],
  followedProgramId,
  dateYmd: date,
  teamId: 'basketball',
  defaultProgramId: verticalJump.id,
  assignment: null,
  personalParticipationProgramId: personalSlot,
});
assert.equal(family.reason, 'following_personal');
assert.equal(family.writeFollowId, undefined);
assert.equal(family.personalEnrollment, null);
assert.equal(family.groupEnrollment?.programId, familyStrength.id);
assert.equal(basketball.writeFollowId, undefined);
assert.equal(basketball.personalEnrollment, null);
assert.equal(basketball.groupEnrollment?.programId, verticalJump.id);
assert.equal(followedProgramId, buildMuscle.id);

const familyEdited = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [{ ...familyStrength, name: 'Family Strength revised' }],
  personalPrograms: [buildMuscle],
  followedProgramId,
  dateYmd: date,
  teamId: 'family',
  defaultProgramId: familyStrength.id,
  assignment: null,
  personalParticipationProgramId: personalSlot,
});
assert.equal(familyEdited.groupEnrollment?.programId, familyStrength.id);
assert.equal(familyEdited.personalEnrollment, null);
assert.equal(basketball.groupEnrollment?.programId, verticalJump.id);

const basketballAssignedDecision = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [verticalJump, basketballAssigned],
  personalPrograms: [buildMuscle],
  followedProgramId,
  dateYmd: date,
  teamId: 'basketball',
  defaultProgramId: verticalJump.id,
  assignment: { programId: basketballAssigned.id, assignmentType: 'individual_team' },
  personalParticipationProgramId: personalSlot,
});
assert.equal(basketballAssignedDecision.groupEnrollment?.programId, basketballAssigned.id);
assert.equal(basketballAssignedDecision.personalEnrollment, null);
assert.equal(basketballAssignedDecision.writeFollowId, undefined);
assert.equal(
  groupEnrollmentProvenance({
    program: basketballAssigned,
    defaultProgramId: verticalJump.id,
    assignment: { programId: basketballAssigned.id, assignmentType: 'individual_team' },
    groupProgramIds: [verticalJump.id, basketballAssigned.id],
  }),
  'individual_assignment'
);
assert.equal(
  groupEnrollmentProvenance({
    program: familyStrength,
    defaultProgramId: familyStrength.id,
    assignment: null,
    groupProgramIds: [familyStrength.id],
  }),
  'group_default'
);

const joinedSoccer = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [prog({ id: 'soccer-plan', name: 'Soccer', visibility: 'team', team_id: 'soccer' })],
  personalPrograms: [buildMuscle],
  followedProgramId,
  dateYmd: date,
  teamId: 'soccer',
  defaultProgramId: 'soccer-plan',
  assignment: null,
  personalParticipationProgramId: personalSlot,
});
assert.equal(joinedSoccer.personalEnrollment, null);
assert.equal(joinedSoccer.groupEnrollment?.teamId, 'soccer');
assert.equal(joinedSoccer.writeFollowId, undefined);
assert.equal(followedProgramId, buildMuscle.id);

const leftFamily = { ...family.groupEnrollment, status: 'ended' as const };
assert.equal(leftFamily.teamId, 'family');
assert.equal(leftFamily.status, 'ended');
assert.equal(personalSlot, buildMuscle.id);
assert.equal(basketball.groupEnrollment?.status, 'active');
assert.match(migration, /source_key = 'group:' \|\| p_team_id::text/);

const customized = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [familyStrength],
  personalPrograms: [buildMuscle, familyFork],
  followedProgramId: familyFork.id,
  dateYmd: date,
  teamId: 'family',
  defaultProgramId: familyStrength.id,
  assignment: null,
  currentGroupProgramId: familyFork.id,
  personalParticipationProgramId: personalSlot,
});
assert.equal(customized.reason, 'personalized_copy');
assert.equal(customized.groupEnrollment?.programId, familyFork.id);
assert.equal(customized.personalEnrollment, null);
assert.equal(customized.writeFollowId, undefined);
assert.equal(
  groupEnrollmentProvenance({
    program: familyFork,
    defaultProgramId: familyStrength.id,
    groupProgramIds: [familyStrength.id],
  }),
  'customized_fork'
);

const stillPersonal = decideGroupEnrollmentSync({
  role: 'member',
  groupPrograms: [familyStrength],
  personalPrograms: [buildMuscle, familyFork],
  followedProgramId: buildMuscle.id,
  dateYmd: date,
  teamId: 'family',
  defaultProgramId: familyStrength.id,
  assignment: null,
  currentGroupProgramId: familyFork.id,
  personalParticipationProgramId: personalSlot,
});
assert.equal(stillPersonal.groupEnrollment?.programId, familyFork.id);
assert.equal(stillPersonal.personalEnrollment, null);
assert.equal(stillPersonal.writeFollowId, undefined);

assert.equal(
  resolveGroupParticipationProgram({
    defaultProgramId: verticalJump.id,
    assignment: null,
    fallbackProgramId: 'saturday-conditioning',
  }),
  verticalJump.id
);
assert.equal(groupSourceKey('basketball'), 'group:basketball');
assert.doesNotMatch(migration, /source_kind in \('personal', 'group', 'workout'\)/);

const authMigration = readFileSync(
  new URL('../supabase/migrations/20261005_055_group_program_edit_auth.sql', import.meta.url),
  'utf8'
);
assert.match(migration, /visibility = 'team' and public\.st_user_can_edit_shared_program\(team_id\)/);
assert.match(migration, /visibility = 'personal' and owner_user_id = auth\.uid\(\)/);
assert.doesNotMatch(migration, /is_primary boolean/);
assert.match(authMigration, /visibility = 'team' and public\.st_user_can_edit_shared_program\(team_id\)/);
assert.doesNotMatch(migration, /owner_user_id = auth\.uid\(\)\s+or public\.st_user_can_edit_shared_program/);
assert.doesNotMatch(authMigration, /owner_user_id = auth\.uid\(\)\s+or public\.st_user_can_edit_team/);

const flagsOn = { ...DEFAULT_GROUP_PERMISSIONS, members_can_edit_shared_workouts: true };
assert.equal(
  canEditProgramByRelationship({ visibility: 'team', ownerUserId: 'former', actorUserId: 'owner', membershipStatus: 'active', role: 'owner' }),
  true
);
assert.equal(
  canEditProgramByRelationship({ visibility: 'team', ownerUserId: 'former', actorUserId: 'manager', membershipStatus: 'active', role: 'manager' }),
  true
);
assert.equal(
  canEditProgramByRelationship({ visibility: 'team', ownerUserId: 'member', actorUserId: 'member', membershipStatus: 'active', role: 'member' }),
  false
);
assert.equal(
  canEditProgramByRelationship({ visibility: 'team', ownerUserId: 'demoted', actorUserId: 'demoted', membershipStatus: 'active', role: 'member' }),
  false
);
assert.equal(
  canEditProgramByRelationship({ visibility: 'team', ownerUserId: 'gone', actorUserId: 'gone', membershipStatus: 'removed', role: 'manager' }),
  false
);
assert.equal(canAdministerGroup('manager'), false);
assert.equal(
  canEditProgramByRelationship({ visibility: 'team', ownerUserId: 'old-owner', actorUserId: 'old-owner', membershipStatus: 'active', role: 'manager' }),
  true
);
assert.equal(
  canEditProgramByRelationship({ visibility: 'team', ownerUserId: 'old-owner', actorUserId: 'old-owner', membershipStatus: 'active', role: 'member' }),
  false
);
assert.equal(
  canEditProgramByRelationship({
    visibility: 'team',
    ownerUserId: 'someone-else',
    actorUserId: 'member',
    membershipStatus: 'active',
    role: 'member',
    flags: flagsOn,
  }),
  true
);
assert.equal(
  canEditProgramByRelationship({
    visibility: 'personal',
    ownerUserId: 'jesse',
    actorUserId: 'jesse',
    role: 'member',
  }),
  true
);
assert.equal(
  canEditProgramByRelationship({
    visibility: 'personal',
    ownerUserId: 'amy',
    actorUserId: 'jesse',
    membershipStatus: 'active',
    role: 'manager',
  }),
  false
);

assert.deepEqual(
  GROUP_WORKSPACE_TABS.map((tab) => tab.id),
  ['overview', 'training', 'members', 'progress', 'settings']
);

console.log('group architecture checks passed');
