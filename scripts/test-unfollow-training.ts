/**
 * BIQ-0150 regression checks for unfollow → Training behavior.
 * Run: npx tsx scripts/test-unfollow-training.ts
 */
import assert from 'node:assert/strict';
import {
  alreadyFollowing,
  findPersonalCopyOf,
  syncMemberGroupEnrollment,
} from '../lib/programDesign/followProgram';
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

const purePersonal = prog({
  id: 'personal-1',
  name: 'My Plan',
  visibility: 'personal',
  source_program_id: null,
});

// alreadyFollowing requires followed_program_id
assert.equal(alreadyFollowing(groupActive, [personalCopy], null), null);
assert.equal(alreadyFollowing(groupActive, [personalCopy], 'copy-1')?.id, 'copy-1');
assert.equal(alreadyFollowing(purePersonal, [purePersonal], null), null);
assert.equal(alreadyFollowing(purePersonal, [purePersonal], 'personal-1')?.id, 'personal-1');

// findPersonalCopyOf still finds leftover copies after unfollow
assert.equal(findPersonalCopyOf(groupActive, [personalCopy])?.id, 'copy-1');
assert.equal(findPersonalCopyOf(purePersonal, [purePersonal])?.id, 'personal-1');

async function testExplicitUnfollowNotReenrolled() {
  const calls: any[] = [];
  const supabase: any = {
    from(table: string) {
      calls.push({ op: 'from', table });
      return {
        update() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

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
  // Must not write followed_program_id again
  assert.equal(calls.length, 0);
}

async function testFirstTimeMemberStillEnrolls() {
  let updatedFollow: string | null = 'unset';
  const supabase: any = {
    from(table: string) {
      if (table === 'st_profiles') {
        return {
          update(payload: any) {
            return {
              eq() {
                updatedFollow = payload.followed_program_id;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      // duplicateTeamProgram / updateDesignProgram may touch other tables — stub loosely
      return {
        update() {
          return { eq() { return Promise.resolve({ error: null }); } };
        },
        insert() {
          return { select() { return { single() { return Promise.resolve({ data: { id: 'new-copy' }, error: null }); } }; } };
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle() { return Promise.resolve({ data: null, error: null }); },
                single() { return Promise.resolve({ data: null, error: null }); },
                order() { return Promise.resolve({ data: [], error: null }); },
              };
            },
          };
        },
      };
    },
    rpc() {
      return Promise.resolve({ data: 'new-copy', error: null });
    },
  };

  // Without a prior copy, sync should attempt enrollment (may fail on stubbed duplicate —
  // we only assert it does NOT short-circuit as explicit_unfollow).
  const result = await syncMemberGroupEnrollment(supabase, {
    userId: 'user-1',
    role: 'member',
    groupPrograms: [groupActive],
    personalPrograms: [],
    followedProgramId: null,
    dateYmd: '2026-09-06',
  });

  assert.notEqual(result.reason, 'explicit_unfollow');
  // Either enrolled or failed follow due to stub — both mean we tried past unfollow guard
  assert.ok(result.reason === 'auto_enrolled' || result.reason === 'follow_failed');
}

async function main() {
  await testExplicitUnfollowNotReenrolled();
  await testFirstTimeMemberStillEnrolls();
  console.log('OK: unfollow training regression checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
