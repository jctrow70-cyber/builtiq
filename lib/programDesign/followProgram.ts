import type { SupabaseClient } from '@supabase/supabase-js';
import { duplicateTeamProgram } from '../groups/teamProgramTools';
import { insertProgramRecord, missingProgramColumnFromError } from '../training/programStatus';
import {
  isAutoEnrolledMemberRole,
  isGroupSourcedProgram,
  isPurePersonalProgram,
  liveTemplateId,
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

async function ensureUnfollowMarker(
  supabase: SupabaseClient,
  userId: string,
  source: ProgramDesignRecord,
  personalPrograms: ProgramDesignRecord[]
): Promise<void> {
  const liveId = liveTemplateId(source);
  if (!liveId) return;
  const liveSource =
    source.visibility === 'team' ? source : { ...source, id: liveId, visibility: 'team' as const };
  if (findPersonalCopyOf(liveSource, personalPrograms)) return;
  await insertProgramRecord(supabase, {
    owner_user_id: userId,
    visibility: 'personal',
    team_id: null,
    name: source.name || 'Group plan',
    source_program_id: liveId,
    status: 'archived',
    weeks: source.weeks || 1,
    cycle_length_weeks: source.cycle_length_weeks || source.weeks || 1,
    start_date: source.start_date || null,
    end_date: source.end_date || null,
    record_kind: 'instance',
  });
}

/** Clear the followed program so Training no longer uses it. */
export async function unfollowProgram(
  supabase: SupabaseClient,
  userId: string,
  opts?: { source?: ProgramDesignRecord | null; personalPrograms?: ProgramDesignRecord[] }
): Promise<UnfollowResult> {
  if (opts?.source && isGroupSourcedProgram(opts.source)) {
    await ensureUnfollowMarker(supabase, userId, opts.source, opts.personalPrograms || []);
  }
  return setFollowedProgramId(supabase, userId, null);
}

/**
 * Follow a program for Training.
 * Group / shared programs follow the live template so members see owner/editor
 * updates. Personal snapshots are not used for Training (Decision 031 / BIQ-0168).
 */
export async function followProgram(
  supabase: SupabaseClient,
  input: {
    userId: string;
    source: ProgramDesignRecord;
    personalPrograms: ProgramDesignRecord[];
    followedProgramId?: string | null;
    /** Kept for callers; group plans always follow the live template. */
    editSource?: boolean;
  }
): Promise<FollowResult> {
  const ownsPersonal = input.source.visibility === 'personal' && input.source.owner_user_id === input.userId;
  const groupSourced = isGroupSourcedProgram(input.source);
  let programId: string | null = null;
  let copied = false;

  if (groupSourced) {
    programId = liveTemplateId(input.source);
  } else if (ownsPersonal) {
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

  if (!programId) {
    return { programId: null, copied: false, error: 'Could not follow this program' };
  }

  if (!groupSourced) {
    await updateDesignProgram(supabase, programId, { status: 'published' });
  }
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
 * Members are auto-enrolled in the group's date-active plan (live template).
 * Skipped when the user follows a pure personal program, or when the role is Owner/Editor.
 * Explicit unfollow (`followed_program_id` null) is respected when a prior copy or
 * unfollow marker of the active plan already exists — Training must not silently re-follow.
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

  if (input.followedProgramId === active.id) {
    return { programId: active.id, changed: false, skipped: false, reason: 'already_enrolled', error: null };
  }

  // Snapshot copy of this live plan — switch Training onto the shared template.
  const already = alreadyFollowing(active, input.personalPrograms, input.followedProgramId);
  if (already && already.id === input.followedProgramId && already.source_program_id === active.id) {
    const { error } = await setFollowedProgramId(supabase, input.userId, active.id);
    if (error) {
      return {
        programId: input.followedProgramId || null,
        changed: false,
        skipped: false,
        reason: 'follow_failed',
        error,
      };
    }
    return {
      programId: active.id,
      changed: true,
      skipped: false,
      reason: 'switched_to_live_template',
      error: null,
    };
  }

  // Explicit unfollow: keep Training empty if they already have a copy/marker of this active plan.
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
