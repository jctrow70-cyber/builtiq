import type { SupabaseClient } from '@supabase/supabase-js';
import { isPublishedProgram, missingProgramColumnFromError } from './programStatus';

const PROGRAM_INDEX_FIELD_LIST = [
  'id',
  'name',
  'status',
  'visibility',
  'weeks',
  'start_date',
  'created_at',
  'team_id',
  'owner_user_id',
  'generation_method',
  'program_summary',
  'coaching_notes',
  'focus_muscles',
  'source_program_id',
];

function programIndexQuery(
  supabase: SupabaseClient,
  fields: string[],
  opts: { personal: boolean; teamId?: string | null; ownerUserId?: string | null }
) {
  let q = supabase.from('st_programs').select(fields.join(', ')).order('created_at', { ascending: false });
  if (opts.personal) {
    q = q.eq('visibility', 'personal').eq('owner_user_id', opts.ownerUserId || '00000000-0000-0000-0000-000000000000');
  } else {
    q = q.eq('visibility', 'team').eq('team_id', opts.teamId || '00000000-0000-0000-0000-000000000000');
  }
  return q;
}

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

/** Lightweight program list for pickers — no nested workouts. Retries without optional columns when migrations lag. */
export async function fetchProgramIndex(
  supabase: SupabaseClient,
  opts: { personal: boolean; teamId?: string | null; ownerUserId?: string | null; publishedOnly?: boolean }
) {
  let fields = [...PROGRAM_INDEX_FIELD_LIST];

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await programIndexQuery(supabase, fields, opts);
    if (!error) {
      let list = ((data || []) as any[]);
      if (opts.publishedOnly) list = list.filter((p) => isPublishedProgram(p));
      return { data: list, error: null };
    }

    const missingCol = missingProgramColumnFromError(error);
    if (missingCol && fields.includes(missingCol)) {
      fields = fields.filter((f) => f !== missingCol);
      continue;
    }

    return { data: [] as any[], error: error.message };
  }

  return { data: [] as any[], error: 'Failed to load programs after column fallbacks' };
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
