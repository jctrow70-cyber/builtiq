import {
  alreadyFollowing,
  findPersonalCopyOf,
  followedSourceBelongsToGroup,
  isAutoEnrolledMemberRole,
  isPersonalizedGroupFollow,
  isPurePersonalProgram,
  pickActiveGroupProgramByDate,
  shouldKeepPersonalizedFollow,
} from './enrollment';
import {
  resolveGroupParticipationProgram,
  type MemberProgramAssignment,
} from '../groups/trainingSources';
import type { ProgramDesignRecord } from './types';

export type GroupEnrollmentWrite = {
  teamId: string | null;
  programId: string | null;
  status: 'active' | 'paused' | 'ended';
};

export type PersonalEnrollmentWrite = {
  programId: string;
};

/**
 * What one group's enrollment sync may do.
 * writeFollowId is omitted when followed_program_id must stay as it is.
 * personalEnrollment is omitted when this group must not touch the personal slot.
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

function forkOfGroup(
  program: ProgramDesignRecord | null | undefined,
  groupPrograms: ProgramDesignRecord[]
): ProgramDesignRecord | null {
  if (!program || !isPersonalizedGroupFollow(program) || !program.source_program_id) return null;
  return groupPrograms.some((row) => row.id === program.source_program_id) ? program : null;
}

/**
 * Decide how this group participates without taking over another source.
 * The group slot uses an existing just-me fork, then an explicit member
 * assignment, then the group default. The personal slot is written only when
 * the legacy follow is itself a pure personal program.
 * An empty follow can still be claimed by this group for the legacy screen.
 */
export function decideGroupEnrollmentSync(input: {
  role: string | null | undefined;
  groupPrograms: ProgramDesignRecord[];
  personalPrograms: ProgramDesignRecord[];
  followedProgramId?: string | null;
  dateYmd?: string;
  teamId?: string | null;
  defaultProgramId?: string | null;
  assignment?: MemberProgramAssignment | null;
  currentGroupProgramId?: string | null;
  personalParticipationProgramId?: string | null;
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
  const currentGroup = input.personalPrograms.find((p) => p.id === input.currentGroupProgramId) || null;
  const fork = forkOfGroup(currentGroup, input.groupPrograms) || forkOfGroup(followed, input.groupPrograms);
  const hasExplicitResolution = input.defaultProgramId !== undefined || input.assignment != null;
  const groupProgramId = resolveGroupParticipationProgram({
    defaultProgramId: input.defaultProgramId,
    assignment: input.assignment,
    forkProgramId: fork?.id || null,
    fallbackProgramId: hasExplicitResolution ? null : active?.id || null,
  });

  const groupEnrollment = (
    status: GroupEnrollmentWrite['status'],
    programId: string | null = groupProgramId
  ): GroupEnrollmentWrite | null => {
    if (!teamId || !programId) return null;
    return { teamId, programId, status };
  };

  const personalEnrollment =
    !input.personalParticipationProgramId && isPurePersonalProgram(followed)
      ? { programId: followed.id }
      : null;

  if (isPurePersonalProgram(followed)) {
    return {
      reason: 'following_personal',
      skipped: true,
      changed: false,
      programId: followed.id,
      groupEnrollment: groupEnrollment('active'),
      personalEnrollment,
    };
  }

  if (!active) return hold('no_active_group_plan');

  if (followedId === active.id) {
    return {
      reason: 'already_enrolled',
      skipped: false,
      changed: false,
      programId: active.id,
      groupEnrollment: groupEnrollment('active', fork?.id || groupProgramId || active.id),
      personalEnrollment: null,
    };
  }

  if (shouldKeepPersonalizedFollow(followed, active.id)) {
    return {
      reason: 'personalized_copy',
      skipped: true,
      changed: false,
      programId: followed!.id,
      groupEnrollment: groupEnrollment('active', followed!.id),
      personalEnrollment: null,
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
        groupEnrollment: groupEnrollment('active', already.id),
        personalEnrollment: null,
      };
    }
    return {
      reason: 'switched_to_live_template',
      skipped: false,
      changed: true,
      programId: active.id,
      writeFollowId: active.id,
      groupEnrollment: groupEnrollment('active', groupProgramId || active.id),
      personalEnrollment: null,
    };
  }

  if (!followedId && findPersonalCopyOf(active, input.personalPrograms)) {
    return {
      reason: 'explicit_unfollow',
      skipped: true,
      changed: false,
      programId: null,
      groupEnrollment: groupEnrollment('active', fork?.id || groupProgramId || active.id),
      personalEnrollment: null,
    };
  }

  if (followedId && !followedSourceBelongsToGroup(followedId, input.groupPrograms, input.personalPrograms)) {
    return {
      reason: 'preserved_other_follow',
      skipped: true,
      changed: false,
      programId: followedId,
      groupEnrollment: groupEnrollment('active'),
      personalEnrollment: null,
    };
  }

  return {
    reason: 'auto_enrolled',
    skipped: false,
    changed: active.id !== followedId,
    programId: active.id,
    writeFollowId: active.id,
    groupEnrollment: groupEnrollment('active', groupProgramId || active.id),
    personalEnrollment: null,
  };
}
