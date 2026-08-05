import type { SupabaseClient } from '@supabase/supabase-js';

export type ProgramStatus = 'draft' | 'published' | 'archived';

export function programStatusOf(program: { status?: string | null } | null | undefined): ProgramStatus {
  const status = program?.status;
  if (status === 'draft' || status === 'archived') return status;
  return 'published';
}

export function isDraftProgram(program: { status?: string | null } | null | undefined): boolean {
  return programStatusOf(program) === 'draft';
}

export function isPublishedProgram(program: { status?: string | null } | null | undefined): boolean {
  return programStatusOf(program) === 'published';
}

export function programStatusLabel(status: ProgramStatus): string {
  if (status === 'draft') return 'Draft';
  if (status === 'archived') return 'Archived';
  return 'Published';
}

export function programOptionLabel(program: { name?: string; status?: string | null }): string {
  const name = program.name || 'Program';
  return isDraftProgram(program) ? `${name} (Draft)` : name;
}

export function isMissingProgramStatusColumn(error: { message?: string } | null | undefined): boolean {
  return missingProgramColumnFromError(error) === 'status';
}

/** Parse Supabase/PostgREST errors like "Could not find the 'start_date' column ..." */
export function missingProgramColumnFromError(error: { message?: string } | null | undefined): string | null {
  const msg = error?.message || '';
  const quoted = msg.match(/could not find the ['"](\w+)['"] column/i);
  if (quoted) return quoted[1].toLowerCase();
  const relation = msg.match(/column ["'](\w+)["'] of relation/i);
  if (relation) return relation[1].toLowerCase();
  const pgMissing = msg.match(/column (?:[\w.]+\.)?(\w+) does not exist/i);
  if (pgMissing) return pgMissing[1].toLowerCase();
  return null;
}

/** Insert program as draft; strips optional columns when migrations are not applied yet. */
export async function insertProgramRecord(
  supabase: { from: (table: string) => any },
  payload: Record<string, unknown>
): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
  draftSupported: boolean;
  startDateSupported: boolean;
}> {
  const working: Record<string, unknown> = { ...payload, status: payload.status ?? 'draft' };
  const stripped = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await supabase.from('st_programs').insert(working).select().single();
    if (!result.error && result.data) {
      return {
        data: result.data,
        error: null,
        draftSupported: !stripped.has('status'),
        startDateSupported: !stripped.has('start_date'),
      };
    }

    const missingCol = missingProgramColumnFromError(result.error);
    if (missingCol && Object.prototype.hasOwnProperty.call(working, missingCol)) {
      delete working[missingCol];
      stripped.add(missingCol);
      continue;
    }
    if (result.error && isMissingProgramStatusColumn(result.error) && 'status' in working) {
      delete working.status;
      stripped.add('status');
      continue;
    }

    return {
      data: null,
      error: result.error?.message || 'Failed to create program',
      draftSupported: false,
      startDateSupported: false,
    };
  }

  return {
    data: null,
    error: 'Failed to create program after column fallbacks',
    draftSupported: false,
    startDateSupported: false,
  };
}

export async function publishProgramRecord(
  supabase: { from: (table: string) => any },
  programId: string
): Promise<{ error: string | null; draftSupported: boolean }> {
  const { error } = await supabase.from('st_programs').update({ status: 'published' }).eq('id', programId);
  if (!error) return { error: null, draftSupported: true };
  if (isMissingProgramStatusColumn(error)) {
    return { error: null, draftSupported: false };
  }
  return { error: error.message || 'Could not publish program', draftSupported: true };
}

export async function deleteProgramRecord(
  supabase: SupabaseClient,
  programId: string
): Promise<{ error: string | null }> {
  if (supabase.rpc) {
    const { error: rpcError } = await supabase.rpc('st_delete_program', { p_program_id: programId });
    if (!rpcError) return { error: null };
    const rpcMsg = rpcError.message || '';
    if (!/function.*does not exist|could not find the function/i.test(rpcMsg)) {
      return { error: rpcMsg || 'Could not delete program' };
    }
  }

  const { data, error } = await supabase.from('st_programs').delete().eq('id', programId).select('id');
  if (error) return { error: error.message || 'Could not delete program' };
  if (!data?.length) {
    return {
      error:
        'Could not delete program. Apply Supabase migrations 20250803_031 and 20250803_032, or confirm you have permission.',
    };
  }
  return { error: null };
}
