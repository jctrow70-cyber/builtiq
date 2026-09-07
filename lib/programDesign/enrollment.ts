import { addDaysYmd, todayYmd } from '../training/programCalendar';
import { normalizeRole } from '../groups/permissions';
import { nextMondayFrom, programDateRange } from './cycle';
import { lifecycleStatusOf } from './lifecycle';
import type { ProgramDesignRecord } from './types';

/** True only for group Members — not Owner or Editor/Manager. */
export function isAutoEnrolledMemberRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'member';
}

/** Editors (managers) and owners opt in — they are not auto-enrolled. */
export function canOptInToGroupProgram(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === 'owner' || n === 'manager';
}

/** Personal copy that came from a group/shared program. */
export function isGroupSourcedProgram(program: ProgramDesignRecord | null | undefined): boolean {
  if (!program) return false;
  if (program.source_program_id) return true;
  return program.visibility === 'team';
}

export function isPurePersonalProgram(program: ProgramDesignRecord | null | undefined): boolean {
  if (!program) return false;
  return program.visibility === 'personal' && !program.source_program_id;
}

/** Group programs that are live or scheduled for Training handoff (not drafts/archived). */
export function isGroupEnrollmentCandidate(program: ProgramDesignRecord, today = todayYmd()): boolean {
  if (program.visibility !== 'team') return false;
  const life = lifecycleStatusOf(program, today);
  return life === 'active' || life === 'scheduled' || life === 'completed' || program.status === 'published';
}

/**
 * Pick the group program that should drive Training for a date.
 * Prefers the program whose [start, end] contains the date.
 * If none contain it, prefers the next upcoming scheduled plan.
 */
export function pickActiveGroupProgramByDate(
  programs: ProgramDesignRecord[],
  dateYmd = todayYmd()
): ProgramDesignRecord | null {
  const candidates = programs.filter((p) => isGroupEnrollmentCandidate(p, dateYmd));
  if (!candidates.length) return null;

  const covering = candidates
    .filter((p) => {
      const { start, end } = programDateRange(p);
      return dateYmd >= start && dateYmd <= end;
    })
    .sort((a, b) => {
      const aStart = programDateRange(a).start;
      const bStart = programDateRange(b).start;
      return bStart.localeCompare(aStart);
    });
  if (covering.length) return covering[0];

  const upcoming = candidates
    .filter((p) => programDateRange(p).start > dateYmd)
    .sort((a, b) => programDateRange(a).start.localeCompare(programDateRange(b).start));
  return upcoming[0] || null;
}

/**
 * Default start for the next group plan: Monday on/after the day after the
 * latest existing group plan end. Owners can sequence plans across months.
 */
export function suggestedNextGroupStart(programs: ProgramDesignRecord[], today = todayYmd()): string {
  let latestEnd = '';
  for (const program of programs) {
    if (program.visibility !== 'team') continue;
    const life = lifecycleStatusOf(program, today);
    if (life === 'archived' || life === 'draft') continue;
    const { end } = programDateRange(program);
    if (!latestEnd || end > latestEnd) latestEnd = end;
  }
  if (!latestEnd) return nextMondayFrom(today);
  return nextMondayFrom(addDaysYmd(latestEnd, 1));
}

export function programCoversDate(program: ProgramDesignRecord, dateYmd = todayYmd()): boolean {
  const { start, end } = programDateRange(program);
  return dateYmd >= start && dateYmd <= end;
}

export function describeEnrollmentRole(role: string | null | undefined): string {
  const n = normalizeRole(role);
  if (n === 'member') return 'Members are enrolled automatically when a group plan is active.';
  if (n === 'manager') return 'Editors can pull a group plan into Training — you are not enrolled automatically.';
  return 'Owners schedule group plans by date. Members pick up the active plan automatically.';
}

export function shouldPromptUnfollowForPersonalCreate(
  followed: ProgramDesignRecord | null | undefined
): boolean {
  return isGroupSourcedProgram(followed);
}
