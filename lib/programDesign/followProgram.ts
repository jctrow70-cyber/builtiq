import type { SupabaseClient } from '@supabase/supabase-js';
import { duplicateTeamProgram } from '../groups/teamProgramTools';
import { missingProgramColumnFromError } from '../training/programStatus';
import {
  isAutoEnrolledMemberRole,
  isGroupSourcedProgram,
  isPurePersonalProgram,
  pickActiveGroupProgramByDate,
} from './enrollment';
import { updateDesignProgram } from './programDesignApi';
import type { ProgramDesignRecord } from './types';

export type FollowResult = {
  programId: string | null;
  copied: boolean;
  error: string | null;
};

export type UnfollowResult = {
  error: string | null;
  columnReady: boolean;
};

function isMissingFollowedColumn(error: { message?: string } | null | undefined): boolean {
  const col = missingProgramColumnFromError(error);
  if (col === 'followed_program_id') return true;
  return /followed_program_id/i.test(error?.message || '');
}

/**
 * Find a personal program that is the same as / copied from `source`.
 * Used when (re)following so we reuse an existing copy instead of duplicating again.
 */
export function findPersonalCopyOf(
  source: ProgramDesignRecord,
  personalPrograms: ProgramDesignRecord[]
): ProgramDesignRecord | null {
  if (source.visibility === 'personal') {
    return personalPrograms.find((p) => p.id === source.id) || null;
  }
  return personalPrograms.find((p) => p.source_program_id === source.id) || null;
}

/**
 * True only when the user is currently following this source
 * (`followed_program_id` matches the source or a personal copy of it).
 * Having a leftover copy after unfollow does NOT count.
 */
export function alreadyFollowing(
  source: ProgramDesignRecord,
  personalPrograms: ProgramDesignRecord[],
  followedProgramId?: string | null
): ProgramDesignRecord | null {
  if (!followedProgramId) return null;
  if (followedProgramId === source.id) return source;
  const hit = personalPrograms.find((p) => p.id === followedProgramId);
  if (hit && (hit.id === source.id || hit.source_program_id === source.id)) return hit;
  return null;
}

export async function setFollowedProgramId(
  supabase: SupabaseClient,
  userId: string,
  programId: string | null
): Promise<{ error: string | null; columnReady: boolean }> {
  const { error } = await supabase
    .from('st_profiles')
    .update({ followed_program_id: programId })
    .eq('user_id', userId);
  if (!error) return { error: null, columnReady: true };
  if (isMissingFollowedColumn(error)) return { error: null, columnReady: false };
  return {
    error: error.message || (programId ? 'Could not save the program you want to follow' : 'Could not unfollow this program'),
    columnReady: true,
  };
}

/** Clear the followed program so Training no longer uses it. */
export async function unfollowProgram(
  supabase: SupabaseClient,
  userId: string
): Promise<UnfollowResult> {
  return setFollowedProgramId(supabase, userId, null);
}

/**
 * Follow a program for Training.
 * Group / shared programs are copied to a personal program first so the
 * original group plan is not edited — unless `editSource` is true for Editors
 * who pull in the group template itself.
 */
export async function followProgram(
  supabase: SupabaseClient,
  input: {
    userId: string;
    source: ProgramDesignRecord;
    personalPrograms: ProgramDesignRecord[];
    followedProgramId?: string | null;
    /** Editors may follow the live group template so edits apply to the group plan. */
    editSource?: boolean;
  }
): Promise<FollowResult> {
  const existing =
    alreadyFollowing(input.source, input.personalPrograms, input.followedProgramId) ||
    findPersonalCopyOf(input.source, input.personalPrograms);
  let programId = existing?.id || null;
  let copied = false;

  if (!programId) {
    const ownsPersonal = input.source.visibility === 'personal' && input.source.owner_user_id === input.userId;
    const followGroupTemplate = !!input.editSource && input.source.visibility === 'team';
    if (ownsPersonal || followGroupTemplate) {
      programId = input.source.id;
    } else {
      const { programId: copyId, error } = await duplicateTeamProgram(supabase, input.source.id, {
        name: input.source.name,
        visibility: 'personal',
        teamId: null,
        ownerUserId: input.userId,
      });
      if (error || !copyId) {
        return { programId: null, copied: false, error: error || 'Could not save a copy of this program' };
      }
      programId = copyId;
      copied = true;
    }
  }

  await updateDesignProgram(supabase, programId, { status: 'published' });
  const { error } = await setFollowedProgramId(supabase, input.userId, programId);
  if (error) return { programId: null, copied, error };
  return { programId, copied, error: null };
}

export type MemberEnrollmentSyncResult = {
  programId: string | null;
  changed: boolean;
  skipped: boolean;
  reason: string;
  error: string | null;
};

/**
 * Members are auto-enrolled in the group's date-active plan.
 * Skipped when the user follows a pure personal program, or when the role is Owner/Editor.
 * Explicit unfollow (`followed_program_id` null) is respected when a prior copy of the
 * active plan already exists — Training must not silently re-follow.
 */
export async function syncMemberGroupEnrollment(
  supabase: SupabaseClient,
  input: {
    userId: string;
    role: string | null | undefined;
    groupPrograms: ProgramDesignRecord[];
    personalPrograms: ProgramDesignRecord[];
    followedProgramId?: string | null;
    dateYmd?: string;
  }
): Promise<MemberEnrollmentSyncResult> {
  if (!isAutoEnrolledMemberRole(input.role)) {
    return { programId: input.followedProgramId || null, changed: false, skipped: true, reason: 'role_opt_in', error: null };
  }

  const followed =
    input.personalPrograms.find((p) => p.id === input.followedProgramId) ||
    input.groupPrograms.find((p) => p.id === input.followedProgramId) ||
    null;

  if (isPurePersonalProgram(followed)) {
    return {
      programId: followed.id,
      changed: false,
      skipped: true,
      reason: 'following_personal',
      error: null,
    };
  }

  const active = pickActiveGroupProgramByDate(input.groupPrograms, input.dateYmd);
  if (!active) {
    return { programId: input.followedProgramId || null, changed: false, skipped: true, reason: 'no_active_group_plan', error: null };
  }

  const already = alreadyFollowing(active, input.personalPrograms, input.followedProgramId);
  if (already && already.id === input.followedProgramId) {
    return { programId: already.id, changed: false, skipped: false, reason: 'already_enrolled', error: null };
  }

  // Explicit unfollow: keep Training empty if they already have a copy of this active plan.
  // First-time members (no copy yet) still get auto-enrolled below.
  if (!input.followedProgramId) {
    const priorCopy = findPersonalCopyOf(active, input.personalPrograms);
    if (priorCopy) {
      return {
        programId: null,
        changed: false,
        skipped: true,
        reason: 'explicit_unfollow',
        error: null,
      };
    }
  }

  // If currently following a different group-sourced copy of the same active plan, keep it.
  if (followed && isGroupSourcedProgram(followed) && already && already.id === followed.id) {
    return { programId: followed.id, changed: false, skipped: false, reason: 'already_enrolled', error: null };
  }

  const result = await followProgram(supabase, {
    userId: input.userId,
    source: active,
    personalPrograms: input.personalPrograms,
    followedProgramId: input.followedProgramId,
  });
  if (result.error || !result.programId) {
    return {
      programId: input.followedProgramId || null,
      changed: false,
      skipped: false,
      reason: 'follow_failed',
      error: result.error,
    };
  }
  return {
    programId: result.programId,
    changed: result.programId !== input.followedProgramId,
    skipped: false,
    reason: 'auto_enrolled',
    error: null,
  };
}

export async function shareProgramWithGroup(
  supabase: SupabaseClient,
  sourceProgramId: string,
  teamId: string,
  name?: string
): Promise<{ programId: string | null; error: string | null }> {
  return duplicateTeamProgram(supabase, sourceProgramId, {
    name: name || undefined,
    visibility: 'team',
    teamId,
  });
}
