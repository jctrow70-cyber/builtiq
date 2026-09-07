import type { SupabaseClient } from '@supabase/supabase-js';
import { customizeProgramForMember } from '../groups/teamProgramTools';
import { fetchProgramActivities, updateDesignProgram } from './programDesignApi';
import type { ProgramActivity } from './types';

export type GroupMemberOption = {
  user_id: string;
  display_name: string;
  role?: string | null;
};

export type PushMode = 'shared' | 'copy';

export type PushResult = {
  pushed: number;
  errors: string[];
};

export async function fetchGroupMembers(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ data: GroupMemberOption[]; error: string | null }> {
  const { data, error } = await supabase
    .from('st_team_members')
    .select('user_id, display_name, role, status')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('created_at');

  if (error) return { data: [], error: error.message };
  const rows = ((data || []) as any[]).map((m) => ({
    user_id: String(m.user_id),
    display_name: String(m.display_name || 'Member'),
    role: m.role || null,
  }));
  return { data: rows, error: null };
}

async function ensureProgramAssignable(
  supabase: SupabaseClient,
  programId: string,
  currentStatus?: string | null
): Promise<{ error: string | null }> {
  const status = String(currentStatus || '').toLowerCase();
  if (status === 'published' || status === 'active' || status === 'scheduled') {
    return { error: null };
  }
  // Training assignment RPCs expect a published/usable program
  return updateDesignProgram(supabase, programId, { status: 'published' });
}

async function assignSharedProgram(
  supabase: SupabaseClient,
  teamId: string,
  memberUserId: string,
  programId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('st_assign_member_program', {
    p_team_id: teamId,
    p_member_user_id: memberUserId,
    p_assignment_type: 'individual_team',
    p_program_id: programId,
    p_notes: 'Pushed from Program Design',
    p_coaching_metadata: {},
  });
  if (error) return { error: error.message };
  return { error: null };
}

async function setTeamDefaultProgram(
  supabase: SupabaseClient,
  teamId: string,
  programId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('st_teams').update({ default_program_id: programId }).eq('id', teamId);
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Copy calendar activities from source → target program, remapping workout_id
 * by week + day_label so strength links stay intact after duplicate.
 */
export async function copyActivitiesToProgram(
  supabase: SupabaseClient,
  sourceProgramId: string,
  targetProgramId: string
): Promise<{ error: string | null }> {
  const { data: sourceActs, error: loadError, tableReady } = await fetchProgramActivities(supabase, sourceProgramId);
  if (!tableReady) return { error: null }; // activities table missing — skip quietly
  if (loadError) return { error: loadError };
  const planned = (sourceActs || []).filter((a) => !a.id.startsWith('legacy-'));
  if (!planned.length) return { error: null };

  const [{ data: sourceWorkouts }, { data: targetWorkouts }] = await Promise.all([
    supabase.from('st_workouts').select('id, week, day_label').eq('program_id', sourceProgramId),
    supabase.from('st_workouts').select('id, week, day_label').eq('program_id', targetProgramId),
  ]);

  const sourceById = new Map<string, { week: number; day_label: string }>();
  for (const w of (sourceWorkouts || []) as any[]) {
    sourceById.set(String(w.id), { week: Number(w.week || 1), day_label: String(w.day_label || '') });
  }
  const targetByKey = new Map<string, string>();
  for (const w of (targetWorkouts || []) as any[]) {
    targetByKey.set(`${Number(w.week || 1)}|${String(w.day_label || '')}`, String(w.id));
  }

  // Replace target activities for the copied weeks
  await supabase.from('st_program_activities').delete().eq('program_id', targetProgramId);

  const inserts = planned.map((a: ProgramActivity) => {
    let workoutId: string | null = null;
    if (a.workout_id && sourceById.has(a.workout_id)) {
      const src = sourceById.get(a.workout_id)!;
      workoutId = targetByKey.get(`${src.week}|${src.day_label}`) || null;
    }
    return {
      program_id: targetProgramId,
      week_number: a.week_number,
      day_of_week: a.day_of_week,
      sort_order: a.sort_order,
      activity_type: a.activity_type,
      title: a.title,
      duration_minutes: a.duration_minutes,
      notes: a.notes,
      details: a.details || {},
      workout_id: workoutId,
    };
  });

  if (!inserts.length) return { error: null };
  const { error } = await supabase.from('st_program_activities').insert(inserts);
  if (error) {
    if (/could not find the table|relation .* does not exist/i.test(error.message)) return { error: null };
    return { error: error.message };
  }
  return { error: null };
}

export async function pushProgramToMembers(
  supabase: SupabaseClient,
  input: {
    teamId: string;
    programId: string;
    programName: string;
    programStatus?: string | null;
    memberUserIds: string[];
    mode: PushMode;
    setAsTeamDefault?: boolean;
  }
): Promise<PushResult> {
  const errors: string[] = [];
  let pushed = 0;

  const { error: publishError } = await ensureProgramAssignable(
    supabase,
    input.programId,
    input.programStatus
  );
  if (publishError) {
    return { pushed: 0, errors: [publishError] };
  }

  if (input.setAsTeamDefault) {
    const { error } = await setTeamDefaultProgram(supabase, input.teamId, input.programId);
    if (error) errors.push(`Group default: ${error}`);
  }

  for (const memberUserId of input.memberUserIds) {
    if (input.mode === 'shared') {
      const { error } = await assignSharedProgram(supabase, input.teamId, memberUserId, input.programId);
      if (error) {
        errors.push(error);
        continue;
      }
      pushed++;
      continue;
    }

    // Personal copy for this member
    const { programId: copyId, error: copyError } = await customizeProgramForMember(
      supabase,
      input.teamId,
      memberUserId,
      input.programId,
      input.programName,
      'Pushed from Program Design'
    );
    if (copyError || !copyId) {
      errors.push(copyError || 'Could not create member copy');
      continue;
    }
    const { error: actError } = await copyActivitiesToProgram(supabase, input.programId, copyId);
    if (actError) {
      // Assignment succeeded; calendar copy failed — still count as pushed with a note
      errors.push(`Assigned, but calendar copy failed: ${actError}`);
    }
    pushed++;
  }

  return { pushed, errors };
}
