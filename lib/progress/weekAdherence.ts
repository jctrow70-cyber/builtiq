import { addDaysYmd } from '../training/programCalendar';
import {
  currentDateForMove,
  type WorkoutDayMoves,
} from '../programDesign/workoutDayMoves';
import { sessionStatusForDisplayDate } from '../programDesign/trainingSchedule';
import {
  adherenceCounts,
  expectationDisplayState,
  type AdherenceCounts,
  type ExpectationDisplayState,
  type ExpectationFact,
  type ExpectationSessionStatus,
} from '../training/unifiedSchedule';

export const WEEK_ADHERENCE_SCOPE_NOTE =
  'Counts are assigned obligations, including hidden sources and separate personal and group assignments.';

export const WEEK_ADHERENCE_DAY_NOTE =
  'Day counts follow the Training calendar, including personal day moves. Upcoming days are not misses.';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export type WeekDayTone = 'empty' | 'missed' | 'partial' | 'skipped' | 'today' | 'upcoming' | 'completed';

export type WeekAdherenceDay = {
  date: string;
  letter: (typeof DAY_LETTERS)[number];
  name: (typeof DAY_NAMES)[number];
  when: 'past' | 'today' | 'future';
  obligations: number;
  tone: WeekDayTone;
};

export type WeekAdherenceSummary = {
  monday: string;
  sunday: string;
  scheduled: number;
  completed: number;
  partial: number;
  skipped: number;
  missed: number;
  dueToday: number;
  upcoming: number;
  excused: number;
  pastDayAdherence: number | null;
  counts: AdherenceCounts;
  days: WeekAdherenceDay[];
};

/** Calendar display date after personal workout_day_moves. Progress adherence still uses scheduledDate. */
export function weekAdherenceDisplayDate(fact: Pick<ExpectationFact, 'workoutId' | 'scheduledDate'>, moves: WorkoutDayMoves = {}): string {
  const workoutId = String(fact.workoutId || '').trim();
  if (!workoutId) return fact.scheduledDate;
  return currentDateForMove(moves, `w:${workoutId}`, fact.scheduledDate);
}

export function weekAdherenceCompletionKey(workoutId: string | null | undefined, displayDate: string): string {
  return `${String(workoutId || '').trim()}|${String(displayDate || '').slice(0, 10)}`;
}

/**
 * Session status on the calendar display date (Decision 172), with Training's set-log upgrade for stuck Partial.
 * On the native expectation day, keep Progress matching (ambiguous shared workout+date stays unmatched).
 * Progress adherence still uses fact.sessionStatus on the stored expectation date.
 */
export function weekAdherenceDisplaySessionStatus(
  fact: ExpectationFact,
  displayDate: string,
  setLogCompletedKeys?: Iterable<string> | null
): ExpectationSessionStatus {
  const day = String(displayDate || '').slice(0, 10);
  // Native day: do not let an unlinked shared workout session paint every same-day expectation complete.
  const onDay =
    day === fact.scheduledDate
      ? fact.sessionStatus ?? null
      : sessionStatusForDisplayDate(
          {
            scheduledDate: fact.scheduledDate,
            sessionStatus: fact.sessionStatus ?? null,
            linkedSessions: fact.linkedSessions,
          },
          day
        );
  const keys = setLogCompletedKeys ? new Set(setLogCompletedKeys) : null;
  const setLogsDone = !!keys?.has(weekAdherenceCompletionKey(fact.workoutId, day));
  // Same upgrade as the Training calendar: set-log completion wins over stuck Partial.
  if (setLogsDone && (onDay === 'partial' || onDay === 'in_progress' || onDay == null)) return 'completed';
  return onDay;
}

/**
 * Labels and day chips follow the Training calendar display date after personal moves.
 * Past-day adherence stays adherenceCounts() on the stored expectation date (Decision 161).
 */
export function weekAdherenceSummary(
  facts: ExpectationFact[],
  today: string,
  bounds: { monday: string; sunday: string },
  moves: WorkoutDayMoves = {},
  setLogCompletedKeys?: Iterable<string> | null
): WeekAdherenceSummary {
  const inWeek = facts.filter((fact) => fact.scheduledDate >= bounds.monday && fact.scheduledDate <= bounds.sunday);
  const counts = adherenceCounts(inWeek, today);
  const excused = inWeek.filter((fact) => fact.excused).length;
  const active = inWeek.filter((fact) => !fact.excused);
  const stateFor = (fact: ExpectationFact) => {
    const displayDate = weekAdherenceDisplayDate(fact, moves);
    return expectationDisplayState({
      scheduledDate: displayDate,
      localToday: today,
      excused: fact.excused,
      sessionStatus: weekAdherenceDisplaySessionStatus(fact, displayDate, setLogCompletedKeys),
    });
  };
  const states = active.map(stateFor);
  const tally = (state: ExpectationDisplayState) => states.filter((item) => item === state).length;
  const days = DAY_LETTERS.map((letter, index) => {
    const date = addDaysYmd(bounds.monday, index);
    const dayStates = active.filter((fact) => weekAdherenceDisplayDate(fact, moves) === date).map(stateFor);
    return {
      date,
      letter,
      name: DAY_NAMES[index],
      when: date < today ? 'past' : date > today ? 'future' : 'today',
      obligations: dayStates.length,
      tone: weekDayTone(dayStates),
    } satisfies WeekAdherenceDay;
  });
  return {
    monday: bounds.monday,
    sunday: bounds.sunday,
    scheduled: active.length,
    completed: tally('Completed'),
    partial: tally('Partial'),
    skipped: tally('Skipped'),
    missed: tally('Missed'),
    dueToday: tally('Today'),
    upcoming: tally('Upcoming'),
    excused,
    pastDayAdherence: counts.completion_rate,
    counts,
    days,
  };
}

/** Chip color only. The number on the day is the obligation count. */
export function weekDayTone(states: ExpectationDisplayState[]): WeekDayTone {
  if (!states.length) return 'empty';
  if (states.includes('Missed')) return 'missed';
  if (states.includes('Partial')) return 'partial';
  if (states.includes('Skipped')) return 'skipped';
  if (states.includes('Today')) return 'today';
  if (states.includes('Upcoming')) return 'upcoming';
  if (states.every((state) => state === 'Completed')) return 'completed';
  return 'empty';
}

/** A null rate stays null. Zero is shown only when adherenceCounts defined a rate of 0. */
export function formatPastDayAdherence(rate: number | null): string | null {
  if (rate == null) return null;
  const rounded = Math.round(rate * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}
