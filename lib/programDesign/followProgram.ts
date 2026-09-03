import type { SupabaseClient } from '@supabase/supabase-js';
import { duplicateTeamProgram } from '../groups/teamProgramTools';
import { missingProgramColumnFromError } from '../training/programStatus';
import { updateDesignProgram } from './programDesignApi';
import type { ProgramDesignRecord } from './types';

export type FollowResult = {
  programId: string | null;
  copied: boolean;
  error: string | null;
};

function isMissingFollowedColumn(error: { message?: string } | null | undefined): boolean {
  const col = missingProgramColumnFromError(error);
  if (col === 'followed_program_id') return true;
  return /followed_program_id/i.test(error?.message || '');
}

export function alreadyFollowing(
  source: ProgramDesignRecord,
  personalPrograms: ProgramDesignRecord[],
  followedProgramId?: string | null
): ProgramDesignRecord | null {
  if (followedProgramId) {
    const hit = personalPrograms.find((p) => p.id === followedProgramId);
    if (hit && (hit.id === source.id || hit.source_program_id === source.id)) return hit;
  }
  if (source.visibility === 'personal') {
    return personalPrograms.find((p) => p.id === source.id) || null;
  }
  return personalPrograms.find((p) => p.source_program_id === source.id) || null;
}

export async function setFollowedProgramId(
  supabase: SupabaseClient,
  userId: string,
  programId: string
): Promise<{ error: string | null; columnReady: boolean }> {
  const { error } = await supabase.from('st_profiles').update({ followed_program_id: programId }).eq('user_id', userId);
  if (!error) return { error: null, columnReady: true };
  if (isMissingFollowedColumn(error)) return { error: null, columnReady: false };
  return { error: error.message || 'Could not save the program you want to follow', columnReady: true };
}

/**
 * Follow a program for Training.
 * Group / shared programs are copied to a personal program first so the
 * original group plan is not edited.
 */
export async function followProgram(
  supabase: SupabaseClient,
  input: {
    userId: string;
    source: ProgramDesignRecord;
    personalPrograms: ProgramDesignRecord[];
    followedProgramId?: string | null;
  }
): Promise<FollowResult> {
  const existing = alreadyFollowing(input.source, input.personalPrograms, input.followedProgramId);
  let programId = existing?.id || null;
  let copied = false;

  if (!programId) {
    const ownsPersonal = input.source.visibility === 'personal' && input.source.owner_user_id === input.userId;
    if (ownsPersonal) {
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
