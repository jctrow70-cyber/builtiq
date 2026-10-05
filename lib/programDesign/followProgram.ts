import type { SupabaseClient } from '@supabase/supabase-js';
import { duplicateTeamProgram } from '../groups/teamProgramTools';
import { fetchFullProgram } from '../training/programFetch';
import { insertProgramRecord, missingProgramColumnFromError } from '../training/programStatus';
import {
  alreadyFollowing,
  findPersonalCopyOf,
  findPersonalizedCopyOf,
  isGroupSourcedProgram,
  isLeftoverGroupSnapshot,
  isLiveGroupProgram,
  isPersonalizedGroupFollow,
  liveTemplateId,
  personalizedFollowName,
} from './enrollment';
import { decideGroupEnrollmentSync } from './enrollmentSync';
import { fetchDesignPrograms, updateDesignProgram } from './programDesignApi';
import type { ProgramDesignRecord } from './types';
import { groupSourceKey, upsertTrainingEnrollment } from '../groups/trainingSources';

export { alreadyFollowing, findPersonalCopyOf };

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
 * updates. Intentional “(just me)” copies stay personal. Leftover snapshots
 * are not used for Training (Decision 031 / BIQ-0168 / BIQ-0181).
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

  if (ownsPersonal && isPersonalizedGroupFollow(input.source)) {
    programId = input.source.id;
  } else if (groupSourced) {
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

async function currentGroupProgramId(
  supabase: SupabaseClient,
  userId: string,
  teamId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('st_training_enrollments')
      .select('program_id')
      .eq('user_id', userId)
      .eq('source_key', groupSourceKey(teamId))
      .maybeSingle();
    if (error) return null;
    return data?.program_id || null;
  } catch {
    return null;
  }
}

/**
 * Records this group's participation slot.
 * That write does not replace the personal slot or another group's slot.
 * followed_program_id changes only when this group is allowed to claim the legacy Training screen.
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
    teamId?: string | null;
    defaultProgramId?: string | null;
    assignment?: { programId?: string | null; assignmentType?: string | null } | null;
    personalParticipationProgramId?: string | null;
  }
): Promise<MemberEnrollmentSyncResult> {
  const existingGroupProgramId = input.teamId
    ? await currentGroupProgramId(supabase, input.userId, input.teamId)
    : null;
  const decision = decideGroupEnrollmentSync({
    ...input,
    currentGroupProgramId: existingGroupProgramId,
  });

  if (decision.personalEnrollment) {
    await upsertTrainingEnrollment(supabase, {
      userId: input.userId,
      sourceKind: 'personal',
      programId: decision.personalEnrollment.programId,
      status: 'active',
    });
  }
  if (decision.groupEnrollment?.teamId) {
    await upsertTrainingEnrollment(supabase, {
      userId: input.userId,
      sourceKind: 'group',
      teamId: decision.groupEnrollment.teamId,
      programId: decision.groupEnrollment.programId,
      status: decision.groupEnrollment.status,
    });
  }

  if (decision.writeFollowId) {
    const { error } = await setFollowedProgramId(supabase, input.userId, decision.writeFollowId);
    if (error) {
      return {
        programId: input.followedProgramId || null,
        changed: false,
        skipped: false,
        reason: 'follow_failed',
        error,
      };
    }
  }

  return {
    programId: decision.programId,
    changed: decision.changed,
    skipped: decision.skipped,
    reason: decision.reason,
    error: null,
  };
}

async function followAndLoadProgram(
  supabase: SupabaseClient,
  userId: string,
  programId: string
): Promise<{ program: ProgramDesignRecord | null; error: string | null }> {
  const { error } = await setFollowedProgramId(supabase, userId, programId);
  if (error) return { program: null, error };
  const loaded = await fetchFullProgram(supabase, programId);
  if (loaded.error || !loaded.data) {
    return { program: null, error: loaded.error || 'Could not load your private copy' };
  }
  return { program: loaded.data as ProgramDesignRecord, error: null };
}

export function matchCopiedWorkout(
  source: { week?: number | null; day_label?: string | null; day_order?: number | null } | null | undefined,
  copy: ProgramDesignRecord | { st_workouts?: Array<{ week?: number | null; day_label?: string | null; day_order?: number | null }> | null } | null | undefined
): any | null {
  const list = copy?.st_workouts || [];
  if (!list.length) return null;
  if (source) {
    const byWeekDay = list.find(
      (w) => Number(w.week) === Number(source.week) && String(w.day_label || '') === String(source.day_label || '')
    );
    if (byWeekDay) return byWeekDay;
    const byOrder = list.find(
      (w) => Number(w.week) === Number(source.week) && Number(w.day_order) === Number(source.day_order)
    );
    if (byOrder) return byOrder;
    const sourceDay = String(source.day_label || '');
    if (sourceDay) {
      const byDay = list.find((w) => String(w.day_label || '') === sourceDay);
      if (byDay) return byDay;
    }
    if (source.day_order != null) {
      const byDayOrder = list.find((w) => Number(w.day_order) === Number(source.day_order));
      if (byDayOrder) return byDayOrder;
    }
    return null;
  }
  return list[0] || null;
}

async function adoptSnapshotAsJustMe(
  supabase: SupabaseClient,
  userId: string,
  snapshot: ProgramDesignRecord
): Promise<{ program: ProgramDesignRecord | null; error: string | null }> {
  if (!snapshot?.id) return { program: null, error: 'Could not keep this copy just for you' };
  const justMeName = personalizedFollowName(snapshot.name);
  const patch: Record<string, unknown> = {
    visibility: 'personal',
    owner_user_id: userId,
    team_id: null,
    record_kind: 'instance',
    status: 'published',
    name: justMeName,
    source_program_id: snapshot.source_program_id,
  };
  const { error: patchError } = await updateDesignProgram(supabase, snapshot.id, patch);
  const loaded = await followAndLoadProgram(supabase, userId, snapshot.id);
  if (loaded.error) return loaded;
  if (!loaded.program || loaded.program.visibility !== 'personal' || !isPersonalizedGroupFollow(loaded.program)) {
    return {
      program: null,
      error: patchError || 'Could not keep this copy just for you',
    };
  }
  return loaded;
}

/**
 * Duplicate a live group program into a personal “(just me)” copy and follow it.
 * Older leftover snapshots (no suffix) you are already following are adopted in place
 * so a plan from before just-me still stays private. Idempotent if a published just-me copy exists.
 */
export async function customizeFollowedProgramForMe(
  supabase: SupabaseClient,
  userId: string,
  liveProgram: ProgramDesignRecord
): Promise<{ program: ProgramDesignRecord | null; error: string | null }> {
  if (!userId || !liveProgram?.id) {
    return { program: null, error: 'Sign in and follow a group plan first' };
  }
  if (isPersonalizedGroupFollow(liveProgram)) {
    return followAndLoadProgram(supabase, userId, liveProgram.id);
  }
  if (isLeftoverGroupSnapshot(liveProgram)) {
    return adoptSnapshotAsJustMe(supabase, userId, liveProgram);
  }
  if (!isLiveGroupProgram(liveProgram)) {
    return { program: null, error: 'Edit just for me is only for a group plan' };
  }

  const { data: personalPrograms, error: listError } = await fetchDesignPrograms(supabase, {
    scope: 'personal',
    ownerUserId: userId,
  });
  if (listError) return { program: null, error: listError };

  const existing = findPersonalizedCopyOf(liveProgram.id, personalPrograms || []);
  if (existing?.id) {
    return followAndLoadProgram(supabase, userId, existing.id);
  }

  const justMeName = personalizedFollowName(liveProgram.name);
  const { programId: copyId, error: copyError } = await duplicateTeamProgram(supabase, liveProgram.id, {
    name: justMeName,
    visibility: 'personal',
    teamId: null,
    ownerUserId: userId,
  });
  if (copyError || !copyId) {
    return { program: null, error: copyError || 'Could not make a private copy of this group plan' };
  }

  // Keep team_id null (RPC already does for personal). A team_id on this row
  // can make a private copy look group-owned in list/RLS queries.
  const patch: Record<string, unknown> = {
    visibility: 'personal',
    owner_user_id: userId,
    team_id: null,
    record_kind: 'instance',
    status: 'published',
    name: justMeName,
    source_program_id: liveProgram.id,
  };
  if (liveProgram.end_date) patch.end_date = liveProgram.end_date;
  if (liveProgram.cycle_length_weeks) patch.cycle_length_weeks = liveProgram.cycle_length_weeks;
  if (liveProgram.inclusive_plan != null) patch.inclusive_plan = liveProgram.inclusive_plan;

  const { error: patchError } = await updateDesignProgram(supabase, copyId, patch);
  const loaded = await followAndLoadProgram(supabase, userId, copyId);
  if (loaded.error) return loaded;
  if (!loaded.program || loaded.program.visibility !== 'personal' || !isPersonalizedGroupFollow(loaded.program)) {
    await setFollowedProgramId(supabase, userId, liveProgram.id);
    return {
      program: null,
      error: patchError || 'Could not save the copy as a personal program',
    };
  }
  return loaded;
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
