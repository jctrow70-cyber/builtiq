import { todayYmd } from '../training/programCalendar';
import { cycleLengthOf, formatCycleLength, formatProgramRange, programDateRange } from './cycle';
import type { ProgramDesignRecord, ProgramLifecycleStatus, StoredProgramStatus } from './types';

const LIFECYCLE: ProgramLifecycleStatus[] = ['draft', 'scheduled', 'active', 'completed', 'archived'];

export function isLifecycleStatus(value: string | null | undefined): value is ProgramLifecycleStatus {
  return !!value && LIFECYCLE.includes(value as ProgramLifecycleStatus);
}

export function storedStatusOf(program: { status?: string | null } | null | undefined): StoredProgramStatus {
  const status = program?.status;
  if (isLifecycleStatus(status) || status === 'published') return status;
  return 'published';
}

/**
 * User-facing lifecycle. Legacy `published` maps from dates so existing
 * Training programs land in the right Program Design section.
 */
export function lifecycleStatusOf(
  program: ProgramDesignRecord | null | undefined,
  today = todayYmd()
): ProgramLifecycleStatus {
  const stored = storedStatusOf(program);
  if (isLifecycleStatus(stored)) return stored;
  if (stored === 'published' && program) {
    const { start, end } = programDateRange(program);
    if (today < start) return 'scheduled';
    if (today > end) return 'completed';
    return 'active';
  }
  return 'draft';
}

export function lifecycleLabel(status: ProgramLifecycleStatus): string {
  if (status === 'draft') return 'Draft';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'active') return 'Active';
  if (status === 'completed') return 'Completed';
  return 'Archived';
}

export function groupProgramsByLifecycle(
  programs: ProgramDesignRecord[],
  today = todayYmd()
): Record<ProgramLifecycleStatus, ProgramDesignRecord[]> {
  const groups: Record<ProgramLifecycleStatus, ProgramDesignRecord[]> = {
    active: [],
    scheduled: [],
    draft: [],
    completed: [],
    archived: [],
  };
  for (const program of programs) {
    groups[lifecycleStatusOf(program, today)].push(program);
  }
  return groups;
}

/** Training should keep using published programs until Phase 3. */
export function drivesTrainingExperience(program: { status?: string | null } | null | undefined): boolean {
  return storedStatusOf(program) === 'published';
}

export function otherActivePersonalConflict(
  programs: ProgramDesignRecord[],
  candidateId: string | null,
  ownerUserId: string,
  today = todayYmd()
): ProgramDesignRecord | null {
  return (
    programs.find(
      (p) =>
        p.id !== candidateId &&
        p.visibility === 'personal' &&
        p.owner_user_id === ownerUserId &&
        lifecycleStatusOf(p, today) === 'active'
    ) || null
  );
}

export function programSummaryLine(program: ProgramDesignRecord): string {
  const { start, end } = programDateRange(program);
  return `${formatProgramRange(start, end)} · ${formatCycleLength(cycleLengthOf(program))}`;
}
