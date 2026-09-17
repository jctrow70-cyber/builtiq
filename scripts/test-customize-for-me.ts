/**
 * BIQ-0181: “Edit just for me” markers and enrollment skip.
 * Run: npx tsx scripts/test-customize-for-me.ts
 */
import assert from 'node:assert/strict';
import {
  isGroupEnrollmentMarker,
  isLeftoverGroupSnapshot,
  isPersonalizedGroupFollow,
  isPurePersonalProgram,
  needsJustMeCopy,
  personalizedFollowName,
  programEditAudience,
  shouldKeepPersonalizedFollow,
} from '../lib/programDesign/enrollment';
import { matchCopiedWorkout, syncMemberGroupEnrollment } from '../lib/programDesign/followProgram';
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
    record_kind: 'instance',
    ...partial,
  } as ProgramDesignRecord;
}

const liveTeam = prog({
  id: 'group-live',
  name: 'Group Plan',
  visibility: 'team',
  team_id: 'team-1',
  status: 'active',
});

const justMe = prog({
  id: 'just-me-1',
  name: 'Group Plan (just me)',
  visibility: 'personal',
  source_program_id: 'group-live',
  record_kind: 'instance',
});

const leftoverSnapshot = prog({
  id: 'copy-old',
  name: 'Group Plan (copy)',
  visibility: 'personal',
  source_program_id: 'group-live',
});

const unfollowMarker = prog({
  id: 'marker-1',
  name: 'Group Plan (just me)',
  visibility: 'personal',
  status: 'archived',
  source_program_id: 'group-live',
});

assert.equal(isPersonalizedGroupFollow(justMe), true);
assert.equal(shouldKeepPersonalizedFollow(justMe, 'group-live'), true);
assert.equal(isPurePersonalProgram(justMe), false);

assert.equal(isPersonalizedGroupFollow(leftoverSnapshot), false);
assert.equal(isLeftoverGroupSnapshot(leftoverSnapshot), true);
assert.equal(needsJustMeCopy(leftoverSnapshot), true);
assert.equal(shouldKeepPersonalizedFollow(leftoverSnapshot, 'group-live'), false);

assert.equal(isGroupEnrollmentMarker(unfollowMarker), true);
assert.equal(isPersonalizedGroupFollow(unfollowMarker), false);
assert.equal(shouldKeepPersonalizedFollow(unfollowMarker, 'group-live'), false);

assert.equal(isPersonalizedGroupFollow(liveTeam), false);
assert.equal(shouldKeepPersonalizedFollow(liveTeam, 'group-live'), false);

assert.equal(programEditAudience(liveTeam), 'group');
assert.equal(programEditAudience(justMe), 'me');
assert.equal(programEditAudience(leftoverSnapshot), null);
assert.equal(programEditAudience(unfollowMarker), null);
assert.equal(needsJustMeCopy(liveTeam), true);
assert.equal(needsJustMeCopy(justMe), false);
assert.equal(isLeftoverGroupSnapshot(justMe), false);
assert.equal(isLeftoverGroupSnapshot(liveTeam), false);

assert.equal(personalizedFollowName('Group Plan'), 'Group Plan (just me)');
assert.equal(personalizedFollowName('Group Plan (just me)'), 'Group Plan (just me)');
assert.equal(personalizedFollowName('Group Plan (copy)'), 'Group Plan (just me)');

function profileClient(onFollow?: (id: string | null) => void) {
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
  return { supabase };
}

async function testPersonalizedCopySkipsAutoSwitch() {
  let updatedFollow: string | null = 'unset';
  const { supabase } = profileClient((id) => {
    updatedFollow = id;
  });
  const result = await syncMemberGroupEnrollment(supabase, {
    userId: 'user-1',
    role: 'member',
    groupPrograms: [liveTeam],
    personalPrograms: [justMe],
    followedProgramId: 'just-me-1',
    dateYmd: '2026-09-06',
  });
  assert.equal(result.reason, 'personalized_copy');
  assert.equal(result.skipped, true);
  assert.equal(result.changed, false);
  assert.equal(result.programId, 'just-me-1');
  assert.equal(updatedFollow, 'unset');
}

async function testLeftoverSnapshotStillSwitchesToLive() {
  let updatedFollow: string | null = 'unset';
  const { supabase } = profileClient((id) => {
    updatedFollow = id;
  });
  const result = await syncMemberGroupEnrollment(supabase, {
    userId: 'user-1',
    role: 'member',
    groupPrograms: [liveTeam],
    personalPrograms: [leftoverSnapshot],
    followedProgramId: 'copy-old',
    dateYmd: '2026-09-06',
  });
  assert.equal(result.reason, 'switched_to_live_template');
  assert.equal(result.programId, 'group-live');
  assert.equal(updatedFollow, 'group-live');
}

async function main() {
  await testPersonalizedCopySkipsAutoSwitch();
  await testLeftoverSnapshotStillSwitchesToLive();
  const copy = {
    st_workouts: [
      { id: 'new-wed', week: 1, day_label: 'Wed', day_order: 2 },
      { id: 'new-fri', week: 1, day_label: 'Fri', day_order: 4 },
    ],
  };
  assert.equal(matchCopiedWorkout({ week: 1, day_label: 'Wed', day_order: 2 }, copy)?.id, 'new-wed');
  assert.equal(matchCopiedWorkout({ week: 1, day_label: 'Fri', day_order: 4 }, copy)?.id, 'new-fri');
  const weekCopy = {
    st_workouts: [
      { id: 'mon', week: 1, day_label: 'Mon', day_order: 0 },
      { id: 'thu', week: 1, day_label: 'Thu', day_order: 3 },
    ],
  };
  assert.equal(matchCopiedWorkout({ week: 2, day_label: 'Thu', day_order: 3 }, weekCopy)?.id, 'thu');
  assert.equal(matchCopiedWorkout({ week: 9, day_label: 'Thu', day_order: 3 }, { st_workouts: [{ id: 'mon', week: 1, day_label: 'Mon', day_order: 0 }] }), null);
  console.log('OK: customize-for-me checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
