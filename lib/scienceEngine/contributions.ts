import { SCIENCE_RULES_V1 } from './rules';
import { normalizeMuscleId, type MuscleId } from './taxonomy';
import type { CatalogExercise, MuscleContribution } from './types';

const NAME_DEFAULTS: { match: RegExp; contributions: MuscleContribution[] }[] = [
  {
    match: /bench press|chest press|push-?up|push up/,
    contributions: [
      { muscle: 'chest', contribution: 1 },
      { muscle: 'triceps', contribution: 0.5 },
      { muscle: 'front_delts', contribution: 0.5 },
    ],
  },
  {
    match: /pulldown|pull-?up|chin-?up/,
    contributions: [
      { muscle: 'lats', contribution: 1 },
      { muscle: 'biceps', contribution: 0.5 },
      { muscle: 'upper_back', contribution: 0.5 },
    ],
  },
  {
    match: /row/,
    contributions: [
      { muscle: 'upper_back', contribution: 1 },
      { muscle: 'lats', contribution: 0.5 },
      { muscle: 'biceps', contribution: 0.5 },
    ],
  },
  {
    match: /back squat|squat(?! jump)/,
    contributions: [
      { muscle: 'quads', contribution: 1 },
      { muscle: 'glutes', contribution: 0.5 },
    ],
  },
  {
    match: /deadlift|rdl|romanian/,
    contributions: [
      { muscle: 'hamstrings', contribution: 1 },
      { muscle: 'glutes', contribution: 0.5 },
      { muscle: 'spinal_erectors', contribution: 0.5 },
    ],
  },
];

export function contributionsForExercise(
  exercise: Pick<CatalogExercise, 'name' | 'primaryMuscles' | 'secondaryMuscles'> & { raw?: any },
  stored?: { muscle_group?: string; contribution?: number }[]
): MuscleContribution[] {
  if (stored?.length) {
    return stored
      .map((row) => {
        const muscle = normalizeMuscleId(row.muscle_group);
        return muscle ? { muscle, contribution: Number(row.contribution) || 0 } : null;
      })
      .filter((row): row is MuscleContribution => !!row);
  }

  const targets = exercise.raw?.muscle_targets;
  if (Array.isArray(targets) && targets.length) {
    const fromTargets = targets
      .map((t: any) => {
        const muscle = normalizeMuscleId(t.muscle);
        if (!muscle) return null;
        const pct = Number(t.percentage);
        const contribution =
          t.role === 'secondary'
            ? SCIENCE_RULES_V1.secondaryContribution
            : pct >= 50 || t.role === 'primary'
              ? SCIENCE_RULES_V1.primaryContribution
              : SCIENCE_RULES_V1.secondaryContribution;
        return { muscle, contribution };
      })
      .filter((row): row is MuscleContribution => !!row);
    if (fromTargets.length) return dedupeContributions(fromTargets);
  }

  const named = NAME_DEFAULTS.find((row) => row.match.test(exercise.name));
  if (named) return named.contributions;

  const out: MuscleContribution[] = [];
  exercise.primaryMuscles.forEach((muscle) => out.push({ muscle, contribution: SCIENCE_RULES_V1.primaryContribution }));
  exercise.secondaryMuscles.forEach((muscle) => {
    if (!out.some((row) => row.muscle === muscle)) {
      out.push({ muscle, contribution: SCIENCE_RULES_V1.secondaryContribution });
    }
  });
  return out;
}

export function creditSets(contributions: MuscleContribution[], workingSets: number): Record<MuscleId, number> {
  const credits = {} as Record<MuscleId, number>;
  contributions.forEach((row) => {
    credits[row.muscle] = (credits[row.muscle] || 0) + workingSets * row.contribution;
  });
  return credits;
}

function dedupeContributions(rows: MuscleContribution[]): MuscleContribution[] {
  const map = new Map<MuscleId, number>();
  rows.forEach((row) => map.set(row.muscle, Math.max(map.get(row.muscle) || 0, row.contribution)));
  return Array.from(map.entries()).map(([muscle, contribution]) => ({ muscle, contribution }));
}
