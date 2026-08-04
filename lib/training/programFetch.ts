import type { SupabaseClient } from '@supabase/supabase-js';
import { isPublishedProgram } from './programStatus';

const PROGRAM_INDEX_FIELDS =
  'id, name, status, visibility, weeks, start_date, created_at, team_id, owner_user_id, generation_method, program_summary, coaching_notes, focus_muscles, source_program_id';

/** Load one program with full workout / exercise / set tree (avoids bulk nested row limits). */
export async function fetchFullProgram(supabase: SupabaseClient, programId: string) {
  const { data, error } = await supabase
    .from('st_programs')
    .select('*, st_workouts(*, st_exercises(*, st_planned_sets(*)))')
    .eq('id', programId)
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/** Lightweight program list for pickers — no nested workouts. */
export async function fetchProgramIndex(
  supabase: SupabaseClient,
  opts: { personal: boolean; teamId?: string | null; ownerUserId?: string | null; publishedOnly?: boolean }
) {
  let q = supabase.from('st_programs').select(PROGRAM_INDEX_FIELDS).order('created_at', { ascending: false });
  if (opts.personal) {
    q = q.eq('visibility', 'personal').eq('owner_user_id', opts.ownerUserId || '00000000-0000-0000-0000-000000000000');
  } else {
    q = q.eq('visibility', 'team').eq('team_id', opts.teamId || '00000000-0000-0000-0000-000000000000');
  }
  const { data, error } = await q;
  if (error) return { data: [] as any[], error: error.message };
  let list = data || [];
  if (opts.publishedOnly) list = list.filter((p) => isPublishedProgram(p));
  return { data: list, error: null };
}

export function mergeFullProgramIntoList(list: any[], full: any | null) {
  if (!full) return list;
  const idx = list.findIndex((p) => p.id === full.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = full;
    return next;
  }
  return [full, ...list];
}
