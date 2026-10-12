import type { SupabaseClient } from '@supabase/supabase-js';

export async function duplicateTeamProgram(
  supabase: SupabaseClient,
  sourceProgramId: string,
  options: {
    name?: string;
    visibility?: 'personal' | 'team';
    teamId?: string | null;
    ownerUserId?: string | null;
  } = {}
): Promise<{ programId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('st_duplicate_program', {
    p_source_program_id: sourceProgramId,
    p_name: options.name || null,
    p_visibility: options.visibility || null,
    p_team_id: options.teamId || null,
    p_owner_user_id: options.ownerUserId || null,
  });
  if (error) return { programId: null, error: error.message };
  return { programId: typeof data === 'string' ? data : null, error: null };
}

export async function customizeProgramForMember(
  supabase: SupabaseClient,
  teamId: string,
  memberUserId: string,
  sourceProgramId: string,
  name?: string,
  notes?: string
): Promise<{ programId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('st_customize_program_for_member', {
    p_team_id: teamId,
    p_member_user_id: memberUserId,
    p_source_program_id: sourceProgramId,
    p_name: name || null,
    p_notes: notes || null,
  });
  if (error) return { programId: null, error: error.message };
  return { programId: typeof data === 'string' ? data : null, error: null };
}

export async function leaveTeam(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_leave_team', { p_team_id: teamId });
  return { error: error?.message || null };
}

/** Sets the group default program and updates members who currently follow it. */
export async function setGroupDefaultProgram(
  supabase: SupabaseClient,
  teamId: string,
  programId: string | null,
  startsOn?: string | null
): Promise<{ error: string | null }> {
  const args: { p_team_id: string; p_program_id: string | null; p_starts_on?: string } = {
    p_team_id: teamId,
    p_program_id: programId,
  };
  if (startsOn) args.p_starts_on = startsOn;
  const { error } = await supabase.rpc('st_set_group_default_program', args);
  return { error: error?.message || null };
}

export async function deleteTeam(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_delete_team', { p_team_id: teamId });
  return { error: error?.message || null };
}
