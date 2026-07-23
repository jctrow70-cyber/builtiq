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
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('status') && (msg.includes('column') || msg.includes('schema') || msg.includes('could not find'));
}

/** Insert program as draft; retries without status if migration 027 is not applied yet. */
export async function insertProgramRecord(
  supabase: { from: (table: string) => any },
  payload: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: string | null; draftSupported: boolean }> {
  const withDraft = { ...payload, status: 'draft' };
  let result = await supabase.from('st_programs').insert(withDraft).select().single();
  if (!result.error && result.data) {
    return { data: result.data, error: null, draftSupported: true };
  }
  if (result.error && isMissingProgramStatusColumn(result.error)) {
    const { status: _status, ...withoutDraft } = withDraft;
    result = await supabase.from('st_programs').insert(withoutDraft).select().single();
    if (!result.error && result.data) {
      return { data: result.data, error: null, draftSupported: false };
    }
  }
  return {
    data: null,
    error: result.error?.message || 'Failed to create program',
    draftSupported: false,
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
