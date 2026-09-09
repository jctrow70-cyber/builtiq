/**
 * BIQ-0150 / BIQ-0168 regression checks for unfollow and live group enrollment.
 * Run: npx tsx scripts/test-unfollow-training.ts
 */
import assert from 'node:assert/strict';
import {
  alreadyFollowing,
  findPersonalCopyOf,
  followProgram,
  syncMemberGroupEnrollment,
  unfollowProgram,
} from '../lib/programDesign/followProgram';
import { isGroupEnrollmentMarker, liveTemplateId } from '../lib/programDesign/enrollment';
import type { ProgramDesignRecord } from '../lib/programDesign/types';

function prog(partial: Partial<ProgramDesignRecord> & { id: string; name: string }): ProgramDesignRecord {
  return {
    owner_user_id: 'user-1',
    visibility: 'personal',
    status: 'published',
    weeks: 4,
    start_date: '2026-09-01',
    end_date: '2026-09-28',
    source_program_id: null,
    team_id: null,
    ...partial,
  } as ProgramDesignRecord;
}

const groupActive = prog({
  id: 'group-active',
  name: 'Group Plan',
  visibility: 'team',
  team_id: 'team-1',
  status: 'active',
  start_date: '2026-09-01',
  end_date: '2026-09-28',
});

const personalCopy = prog({
  id: 'copy-1',
  name: 'Group Plan (copy)',
  visibility: 'personal',
  source_program_id: 'group-active',
});

const unfollowMarker = prog({
  id: 'marker-1',
  name: 'Group Plan',
  visibility: 'personal',
  status: 'archived',
  source_program_id: 'group-active',
});

const purePersonal = prog({
  id: 'personal-1',
  name: 'My Plan',
  visibility: 'personal',
  source_program_id: null,
});

assert.equal(liveTemplateId(groupActive), 'group-active');
assert.equal(liveTemplateId(personalCopy), 'group-active');
assert.equal(isGroupEnrollmentMarker(unfollowMarker), true);
assert.equal(isGroupEnrollmentMarker(personalCopy), false);

// alreadyFollowing requires followed_program_id
assert.equal(alreadyFollowing(groupActive, [personalCopy], null), null);
assert.equal(alreadyFollowing(groupActive, [personalCopy], 'copy-1')?.id, 'copy-1');
assert.equal(alreadyFollowing(groupActive, [personalCopy], 'group-active')?.id, 'group-active');
assert.equal(alreadyFollowing(purePersonal, [purePersonal], null), null);
assert.equal(alreadyFollowing(purePersonal, [purePersonal], 'personal-1')?.id, 'personal-1');

// findPersonalCopyOf still finds leftover copies after unfollow
assert.equal(findPersonalCopyOf(groupActive, [personalCopy])?.id, 'copy-1');
assert.equal(findPersonalCopyOf(purePersonal, [purePersonal])?.id, 'personal-1');

function profileClient(onFollow?: (id: string | null) => void) {
  const inserts: any[] = [];
  const supabase: any = {
    from(table: string) {
      if (table === 'st_profiles') {
        return {
          update(payload: any) {
            return {
              eq() {
                onFollow?.(payload.followed_program_id ?? null);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === 'st_programs') {
        return {
          insert(payload: any) {
            inserts.push(payload);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: 'marker-new', ...payload }, error: null });
                  },
                };
              },
            };
          },
          update() {
            return { eq() { return Promise.resolve({ error: null }); } };
          },
        };
      }
      return {
        update() {
          return { eq() { return Promise.resolve({ error: null }); } };
        },
      };
    },
    rpc() {
      return Promise.resolve({ data: 'new-copy', error: null });
    },
  };
  return { supabase, inserts };
}

async function testExplicitUnfollowNotReenrolled() {
  const { supabase } = profileClient();
  const result = await syncMemberGroupEnrollment(supabase, {
    userId: 'user-1',
    role: 'member',
    groupPrograms: [groupActive],
    personalPrograms: [personalCopy],
    followedProgramId: null,
    dateYmd: '2026-09-06',
  });

  assert.equal(result.reason, 'explicit_unfollow');
  assert.equal(result.programId, null);
  assert.equal(result.skipped, true);
  assert.equal(result.changed, false);
}

async function testFirstTimeMemberFollowsLiveTemplate() {
  let updatedFollow: string | null = 'unset';
  const { supabase } = profileClient((id) => {
    updatedFollow = id;
  });

  const result = await syncMemberGroupEnrollment(supabase, {
    userId: 'user-1',
    role: 'member',
    groupPrograms: [groupActive],
    personalPrograms: [],
    followedProgramId: null,
    dateYmd: '2026-09-06',
  });

  assert.equal(result.reason, 'auto_enrolled');
  assert.equal(result.programId, 'group-active');
  assert.equal(updatedFollow, 'group-active');
}

async function testSwitchCopyToLiveTemplate() {
  let updatedFollow: string | null = 'unset';
  const { supabase } = profileClient((id) => {
    updatedFollow = id;
  });

  const result = await syncMemberGroupEnrollment(supabase, {
    userId: 'user-1',
    role: 'member',
    groupPrograms: [groupActive],
    personalPrograms: [personalCopy],
    followedProgramId: 'copy-1',
    dateYmd: '2026-09-06',
  });

  assert.equal(result.reason, 'switched_to_live_template');
  assert.equal(result.programId, 'group-active');
  assert.equal(result.changed, true);
  assert.equal(updatedFollow, 'group-active');
}

async function testFollowGroupDoesNotCopy() {
  let updatedFollow: string | null = 'unset';
  const { supabase } = profileClient((id) => {
    updatedFollow = id;
  });

  const result = await followProgram(supabase, {
    userId: 'user-1',
    source: groupActive,
    personalPrograms: [],
  });

  assert.equal(result.programId, 'group-active');
  assert.equal(result.copied, false);
  assert.equal(updatedFollow, 'group-active');
}

async function testUnfollowMarkerBlocksReenroll() {
  const { supabase, inserts } = profileClient();
  const unfollow = await unfollowProgram(supabase, 'user-1', {
    source: groupActive,
    personalPrograms: [],
  });
  assert.equal(unfollow.error, null);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].source_program_id, 'group-active');
  assert.equal(inserts[0].status, 'archived');

  const result = await syncMemberGroupEnrollment(supabase, {
    userId: 'user-1',
    role: 'member',
    groupPrograms: [groupActive],
    personalPrograms: [unfollowMarker],
    followedProgramId: null,
    dateYmd: '2026-09-06',
  });
  assert.equal(result.reason, 'explicit_unfollow');
  assert.equal(result.programId, null);
}

async function main() {
  await testExplicitUnfollowNotReenrolled();
  await testFirstTimeMemberFollowsLiveTemplate();
  await testSwitchCopyToLiveTemplate();
  await testFollowGroupDoesNotCopy();
  await testUnfollowMarkerBlocksReenroll();
  console.log('OK: unfollow training regression checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
