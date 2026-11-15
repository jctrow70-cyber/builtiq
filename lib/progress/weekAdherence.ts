import { addDaysYmd } from '../training/programCalendar';
import {
  currentDateForMove,
  type WorkoutDayMoves,
} from '../programDesign/workoutDayMoves';
import {
  adherenceCounts,
  expectationDisplayState,
  type AdherenceCounts,
  type ExpectationDisplayState,
  type ExpectationFact,
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

/**
 * Labels and day chips follow the Training calendar display date after personal moves.
 * Past-day adherence stays adherenceCounts() on the stored expectation date (Decision 161).
 */
export function weekAdherenceSummary(
  facts: ExpectationFact[],
  today: string,
  bounds: { monday: string; sunday: string },
  moves: WorkoutDayMoves = {}
): WeekAdherenceSummary {
  const inWeek = facts.filter((fact) => fact.scheduledDate >= bounds.monday && fact.scheduledDate <= bounds.sunday);
  const counts = adherenceCounts(inWeek, today);
  const excused = inWeek.filter((fact) => fact.excused).length;
  const active = inWeek.filter((fact) => !fact.excused);
  const states = active.map((fact) =>
    expectationDisplayState({
      scheduledDate: weekAdherenceDisplayDate(fact, moves),
      localToday: today,
      excused: fact.excused,
      sessionStatus: fact.sessionStatus,
    })
  );
  const tally = (state: ExpectationDisplayState) => states.filter((item) => item === state).length;
  const days = DAY_LETTERS.map((letter, index) => {
    const date = addDaysYmd(bounds.monday, index);
    const dayStates = active
      .filter((fact) => weekAdherenceDisplayDate(fact, moves) === date)
      .map((fact) =>
        expectationDisplayState({
          scheduledDate: weekAdherenceDisplayDate(fact, moves),
          localToday: today,
          excused: fact.excused,
          sessionStatus: fact.sessionStatus,
        })
      );
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
