/**
 * BIQ-0316 / BIQ-0309 Phase 2 — personal program week anchoring.
 *
 * Training UI already numbers weeks from program.start_date.
 * Expectations must use the same clock. An enrollment starts_on earlier than
 * program.start_date must not pull Week 1 earlier (the Nov 2–8 / Week 3 miss).
 *
 * Future starts_on after program.start_date stay valid (join mid-program):
 * week numbers still follow program.start_date; generation floors at starts_on.
 */

function ymd(value?: string | null): string | null {
  const next = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

/**
 * Calendar date that owns personal Week 1 (Mon–Sun block).
 * Prefer program.start_date. Never let an earlier starts_on win.
 */
export function personalWeekAnchorClock(input: {
  startsOn?: string | null;
  programStart?: string | null;
  effectiveOn: string;
}): string {
  const programStart = ymd(input.programStart);
  const startsOn = ymd(input.startsOn);
  const effectiveOn = ymd(input.effectiveOn) || programStart || startsOn;
  if (!effectiveOn) return '1970-01-01';
  if (programStart) return programStart;
  return startsOn || effectiveOn;
}

/**
 * First date personal expectations may be generated for.
 * Clamps starts_on up to program.start_date when starts_on is earlier.
 * Keeps a later starts_on so mid-program joins do not backfill earlier weeks.
 */
export function personalExpectationFloor(input: {
  startsOn?: string | null;
  programStart?: string | null;
  effectiveOn: string;
}): string {
  const programStart = ymd(input.programStart);
  const startsOn = ymd(input.startsOn);
  const effectiveOn = ymd(input.effectiveOn) || programStart || startsOn || '1970-01-01';
  let floor = startsOn || programStart || effectiveOn;
  if (programStart && floor < programStart) floor = programStart;
  if (floor < effectiveOn) floor = effectiveOn;
  return floor;
}

/**
 * Value to store on st_training_enrollments.starts_on for a personal slot.
 * Defaults to program.start_date. Rejects storing a date before program start.
 * Allows an intentional later start (after program start).
 */
export function normalizePersonalEnrollmentStartsOn(input: {
  startsOn?: string | null;
  programStart?: string | null;
  today?: string | null;
}): string {
  const programStart = ymd(input.programStart);
  const startsOn = ymd(input.startsOn);
  const today = ymd(input.today);
  if (programStart && startsOn) {
    return startsOn < programStart ? programStart : startsOn;
  }
  if (programStart) return programStart;
  if (startsOn) return startsOn;
  return today || '1970-01-01';
}

/** True when a personal enrollment's starts_on precedes its program.start_date. */
export function personalStartsOnPrecedesProgramStart(input: {
  startsOn?: string | null;
  programStart?: string | null;
}): boolean {
  const programStart = ymd(input.programStart);
  const startsOn = ymd(input.startsOn);
  return !!(programStart && startsOn && startsOn < programStart);
}
