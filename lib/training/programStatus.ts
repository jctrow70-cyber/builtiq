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
