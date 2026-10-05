import {
  alreadyFollowing,
  findPersonalCopyOf,
  followedSourceBelongsToGroup,
  isAutoEnrolledMemberRole,
  isPurePersonalProgram,
  pickActiveGroupProgramByDate,
  shouldKeepPersonalizedFollow,
} from './enrollment';
import type { ProgramDesignRecord } from './types';

export type GroupEnrollmentWrite = {
  teamId: string | null;
  programId: string | null;
  status: 'active' | 'paused';
  isPrimary: boolean;
};

export type PersonalEnrollmentWrite = {
  programId: string;
  isPrimary: boolean;
};

/**
 * What one group's enrollment sync may do.
 * writeFollowId is omitted when followed_program_id must stay as it is.
 */
export type GroupEnrollmentDecision = {
  reason: string;
  skipped: boolean;
  changed: boolean;
  programId: string | null;
  writeFollowId?: string;
  groupEnrollment: GroupEnrollmentWrite | null;
  personalEnrollment: PersonalEnrollmentWrite | null;
};

/**
 * Decide how this group participates without taking over another source.
 * A personal follow, a just-me copy, and another group's live plan are left in place.
 * An empty follow can still be claimed by this group (the caller orders the default group first).
 */
export function decideGroupEnrollmentSync(input: {
  role: string | null | undefined;
  groupPrograms: ProgramDesignRecord[];
  personalPrograms: ProgramDesignRecord[];
  followedProgramId?: string | null;
  dateYmd?: string;
  teamId?: string | null;
}): GroupEnrollmentDecision {
  const followedId = input.followedProgramId || null;
  const teamId = input.teamId || input.groupPrograms.find((p) => p.team_id)?.team_id || null;

  const hold = (reason: string, programId: string | null = followedId): GroupEnrollmentDecision => ({
    reason,
    skipped: true,
    changed: false,
    programId,
    groupEnrollment: null,
    personalEnrollment: null,
  });

  if (!isAutoEnrolledMemberRole(input.role)) return hold('role_opt_in');

  const followed =
    input.personalPrograms.find((p) => p.id === followedId) ||
    input.groupPrograms.find((p) => p.id === followedId) ||
    null;
  const active = pickActiveGroupProgramByDate(input.groupPrograms, input.dateYmd);

  if (isPurePersonalProgram(followed)) {
    return {
      reason: 'following_personal',
      skipped: true,
      changed: false,
      programId: followed.id,
      groupEnrollment: active
        ? {
            teamId: active.team_id || teamId,
            programId: active.id,
            status: 'active',
            isPrimary: false,
          }
        : null,
      personalEnrollment: { programId: followed.id, isPrimary: true },
    };
  }

  if (!active) return hold('no_active_group_plan');

  const groupRow = (status: 'active' | 'paused', isPrimary: boolean): GroupEnrollmentWrite => ({
    teamId: active.team_id || teamId,
    programId: active.id,
    status,
    isPrimary,
  });

  if (followedId === active.id) {
    return {
      reason: 'already_enrolled',
      skipped: false,
      changed: false,
      programId: active.id,
      groupEnrollment: groupRow('active', true),
      personalEnrollment: null,
    };
  }

  if (shouldKeepPersonalizedFollow(followed, active.id)) {
    return {
      reason: 'personalized_copy',
      skipped: true,
      changed: false,
      programId: followed!.id,
      groupEnrollment: groupRow('active', false),
      personalEnrollment: { programId: followed!.id, isPrimary: true },
    };
  }

  const already = alreadyFollowing(active, input.personalPrograms, followedId);
  if (already && already.id === followedId && already.source_program_id === active.id) {
    if (shouldKeepPersonalizedFollow(already, active.id)) {
      return {
        reason: 'personalized_copy',
        skipped: true,
        changed: false,
        programId: already.id,
        groupEnrollment: groupRow('active', false),
        personalEnrollment: { programId: already.id, isPrimary: true },
      };
    }
    return {
      reason: 'switched_to_live_template',
      skipped: false,
      changed: true,
      programId: active.id,
      writeFollowId: active.id,
      groupEnrollment: groupRow('active', true),
      personalEnrollment: null,
    };
  }

  if (!followedId && findPersonalCopyOf(active, input.personalPrograms)) {
    return {
      reason: 'explicit_unfollow',
      skipped: true,
      changed: false,
      programId: null,
      groupEnrollment: groupRow('paused', false),
      personalEnrollment: null,
    };
  }

  if (followedId && !followedSourceBelongsToGroup(followedId, input.groupPrograms, input.personalPrograms)) {
    return {
      reason: 'preserved_other_follow',
      skipped: true,
      changed: false,
      programId: followedId,
      groupEnrollment: groupRow('active', false),
      personalEnrollment: null,
    };
  }

  return {
    reason: 'auto_enrolled',
    skipped: false,
    changed: active.id !== followedId,
    programId: active.id,
    writeFollowId: active.id,
    groupEnrollment: groupRow('active', true),
    personalEnrollment: null,
  };
}
