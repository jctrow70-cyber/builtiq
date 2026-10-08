import { SCIENCE_RULES_V1 } from '../scienceEngine/rules';
import { normalizeMuscleId, type MuscleId } from '../scienceEngine/taxonomy';
import { addDaysYmd, mondayOfWeek } from '../training/programCalendar';
import { inSpan, type DateSpan } from './ranges';
import { isCountedWorkingSet, type ProgressSetFact } from './setFacts';

export type ProgressMuscleGroup = {
  id: string;
  label: string;
  muscles: MuscleId[];
};

/** Display groups. Finer catalog muscles still roll up through this list. */
export const PROGRESS_MUSCLE_GROUPS: ProgressMuscleGroup[] = [
  { id: 'chest', label: 'Chest', muscles: ['chest'] },
  { id: 'back', label: 'Back', muscles: ['upper_back', 'lats'] },
  { id: 'quads', label: 'Quads', muscles: ['quads'] },
  { id: 'hamstrings', label: 'Hamstrings', muscles: ['hamstrings'] },
  { id: 'glutes', label: 'Glutes', muscles: ['glutes'] },
  { id: 'shoulders', label: 'Shoulders', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
  { id: 'biceps', label: 'Biceps', muscles: ['biceps'] },
  { id: 'triceps', label: 'Triceps', muscles: ['triceps'] },
  { id: 'calves', label: 'Calves', muscles: ['calves'] },
  { id: 'core', label: 'Core', muscles: ['abs', 'obliques', 'spinal_erectors'] },
];

export type MuscleWeek = {
  weekStart: string;
  directSets: number;
  effectiveSets: number;
  hardSets: number | null;
  reps: number;
  volumeLoad: number | null;
};

export type MuscleExposure = {
  id: string;
  label: string;
  directSets: number;
  effectiveSets: number;
  /** Null when none of the counted sets recorded RPE or RIR. */
  hardSets: number | null;
  reps: number;
  volumeLoad: number | null;
  frequency: number;
  averageRpe: number | null;
  averageRir: number | null;
  weekOverWeekEffective: number | null;
  rolling4WeekEffective: number | null;
  weeks: MuscleWeek[];
  estimated: boolean;
  estimateNote: string;
};

export type MuscleVolumeReport = {
  groups: MuscleExposure[];
  unattributedSets: number;
  estimateNote: string;
};

const HARD_RIR_MAX = 3;
const HARD_RPE_MIN = 7;

export function muscleVolumeReport(facts: ProgressSetFact[], span: DateSpan): MuscleVolumeReport {
  const working = facts.filter((fact) => isCountedWorkingSet(fact) && inSpan(fact.logDate, span));
  const weeks = weekStarts(span);
  const groups = PROGRESS_MUSCLE_GROUPS.map((group) => emptyGroup(group, weeks));
  let unattributedSets = 0;
  let anyEstimated = false;

  working.forEach((fact) => {
    const credits = attributedCredits(fact);
    if (!credits.length || fact.provenance.muscleCredits === 'unknown') {
      unattributedSets += 1;
      return;
    }
    if (fact.provenance.muscleCredits === 'estimated') anyEstimated = true;
    const week = mondayOfWeek(fact.logDate);
    const hard = hardSet(fact);
    groups.forEach((group) => {
      const definition = PROGRESS_MUSCLE_GROUPS.find((item) => item.id === group.id);
      if (!definition) return;
      const relevant = credits.filter((credit) => definition.muscles.includes(credit.muscle));
      if (!relevant.length) return;
      const direct = relevant.some((credit) => credit.contribution + 1e-9 >= SCIENCE_RULES_V1.primaryContribution);
      const effective = relevant.reduce((sum, credit) => sum + credit.contribution, 0);
      const bucket = group.weeks.find((item) => item.weekStart === week);
      group.directSets += direct ? 1 : 0;
      group.effectiveSets += effective;
      group.reps += fact.reps || 0;
      if (fact.weight != null && fact.reps != null) group.volumeLoad = (group.volumeLoad || 0) + fact.weight * fact.reps;
      if (fact.rpe != null) group._rpe.push(fact.rpe);
      if (fact.rir != null) group._rir.push(fact.rir);
      group._days.add(fact.logDate);
      if (hard != null) {
        group._hardKnown += 1;
        if (hard) group._hard += 1;
      }
      if (bucket) {
        bucket.directSets += direct ? 1 : 0;
        bucket.effectiveSets += effective;
        bucket.reps += fact.reps || 0;
        if (fact.weight != null && fact.reps != null) bucket.volumeLoad = (bucket.volumeLoad || 0) + fact.weight * fact.reps;
        if (hard != null) {
          bucket.hardSets = (bucket.hardSets || 0) + (hard ? 1 : 0);
        }
      }
    });
  });

  const publicGroups = groups.map((group) => finalizeGroup(group));
  return {
    groups: publicGroups,
    unattributedSets,
    estimateNote: anyEstimated
      ? 'Effective sets are BuildIQ training-volume estimates. Some older workouts use the current exercise library rather than a snapshot from the day they were logged.'
      : 'Effective sets are BuildIQ training-volume estimates, not exact physiological measurements.',
  };
}

type GroupDraft = MuscleExposure & {
  _rpe: number[];
  _rir: number[];
  _days: Set<string>;
  _hard: number;
  _hardKnown: number;
};

function emptyGroup(group: ProgressMuscleGroup, weeks: string[]): GroupDraft {
  return {
    id: group.id,
    label: group.label,
    directSets: 0,
    effectiveSets: 0,
    hardSets: null,
    reps: 0,
    volumeLoad: null,
    frequency: 0,
    averageRpe: null,
    averageRir: null,
    weekOverWeekEffective: null,
    rolling4WeekEffective: null,
    weeks: weeks.map((weekStart) => ({ weekStart, directSets: 0, effectiveSets: 0, hardSets: null, reps: 0, volumeLoad: null })),
    estimated: false,
    estimateNote: '',
    _rpe: [],
    _rir: [],
    _days: new Set<string>(),
    _hard: 0,
    _hardKnown: 0,
  };
}

function finalizeGroup(group: GroupDraft): MuscleExposure {
  const weeks = group.weeks;
  const last = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const recent = weeks.slice(-4);
  group.frequency = group._days.size;
  group.averageRpe = group._rpe.length ? round2(mean(group._rpe)) : null;
  group.averageRir = group._rir.length ? round2(mean(group._rir)) : null;
  group.hardSets = group._hardKnown > 0 ? group._hard : null;
  group.effectiveSets = round2(group.effectiveSets);
  group.weekOverWeekEffective = last && prev ? round2(last.effectiveSets - prev.effectiveSets) : null;
  group.rolling4WeekEffective = recent.length ? round2(recent.reduce((sum, week) => sum + week.effectiveSets, 0) / recent.length) : null;
  group.weeks = weeks.map((week) => ({ ...week, effectiveSets: round2(week.effectiveSets) }));
  const { _rpe, _rir, _days, _hard, _hardKnown, ...publicGroup } = group;
  void _rpe;
  void _rir;
  void _days;
  void _hard;
  void _hardKnown;
  return publicGroup;
}

function attributedCredits(fact: ProgressSetFact): { muscle: MuscleId; contribution: number }[] {
  if (!fact.muscleCredits?.length) return [];
  return fact.muscleCredits
    .map((credit) => {
      const muscle = normalizeMuscleId(credit.muscle);
      if (!muscle || !(credit.contribution > 0)) return null;
      return { muscle, contribution: credit.contribution };
    })
    .filter((credit): credit is { muscle: MuscleId; contribution: number } => !!credit);
}

function hardSet(fact: ProgressSetFact): boolean | null {
  if (fact.rir == null && fact.rpe == null) return null;
  if (fact.rir != null && fact.rir <= HARD_RIR_MAX) return true;
  if (fact.rpe != null && fact.rpe >= HARD_RPE_MIN) return true;
  return false;
}

function weekStarts(span: DateSpan): string[] {
  const starts: string[] = [];
  let cursor = mondayOfWeek(span.from);
  const last = mondayOfWeek(span.to);
  while (cursor <= last) {
    starts.push(cursor);
    cursor = addDaysYmd(cursor, 7);
  }
  return starts;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
