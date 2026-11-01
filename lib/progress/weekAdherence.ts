import { addDaysYmd } from '../training/programCalendar';
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
  'Day counts follow assigned dates and are not a complete list of calendar workouts. Upcoming days are not misses.';

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

/**
 * Labels come from expectationDisplayState. The percentage is adherenceCounts().completion_rate.
 * This does not define another rate.
 */
export function weekAdherenceSummary(
  facts: ExpectationFact[],
  today: string,
  bounds: { monday: string; sunday: string }
): WeekAdherenceSummary {
  const inWeek = facts.filter((fact) => fact.scheduledDate >= bounds.monday && fact.scheduledDate <= bounds.sunday);
  const counts = adherenceCounts(inWeek, today);
  const excused = inWeek.filter((fact) => fact.excused).length;
  const active = inWeek.filter((fact) => !fact.excused);
  const states = active.map((fact) =>
    expectationDisplayState({
      scheduledDate: fact.scheduledDate,
      localToday: today,
      excused: fact.excused,
      sessionStatus: fact.sessionStatus,
    })
  );
  const tally = (state: ExpectationDisplayState) => states.filter((item) => item === state).length;
  const days = DAY_LETTERS.map((letter, index) => {
    const date = addDaysYmd(bounds.monday, index);
    const dayStates = active
      .filter((fact) => fact.scheduledDate === date)
      .map((fact) =>
        expectationDisplayState({
          scheduledDate: fact.scheduledDate,
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
