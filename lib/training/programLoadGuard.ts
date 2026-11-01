/** A program response may not replace a logger that is already open or a newer exercise edit. */
export function programApplyBlocked(input: {
  loggerProtected: boolean;
  workoutOpen: boolean;
  epochAtStart: number;
  epochNow: number;
}) {
  return input.loggerProtected || input.workoutOpen || input.epochNow !== input.epochAtStart;
}
