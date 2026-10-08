import type { RampSet, TrainingProfile } from './types';

/** How many preparation sets a lift needs. Not a fixed four-stage rule. */
export function rampCountFor(opts: { workingRepMax: number; experienceLevel?: string; opener?: boolean }): number {
  const experience = String(opts.experienceLevel || 'intermediate').toLowerCase();
  const opener = opts.opener !== false;
  const heavy = opts.workingRepMax <= 6;
  const moderate = opts.workingRepMax <= 8;
  if (experience === 'beginner') return opener ? 2 : 1;
  if (!opener) return heavy ? 2 : 1;
  if (experience === 'advanced' && heavy) return 4;
  if (heavy || moderate) return 3;
  return 2;
}

export function generateRampSets(opts: {
  workingWeight?: number;
  workingRepMax: number;
  profile: TrainingProfile;
  opener?: boolean;
}): RampSet[] {
  const stages = [
    { percent: 0.5, reps: 8 },
    { percent: 0.65, reps: 5 },
    { percent: 0.8, reps: 3 },
    { percent: 0.9, reps: 2 },
  ];
  const count = rampCountFor({
    workingRepMax: opts.workingRepMax,
    experienceLevel: opts.profile.experienceLevel,
    opener: opts.opener !== false,
  });
  return stages.slice(0, Math.min(count, stages.length)).map((stage) => withWeight(stage, opts.workingWeight));
}

function withWeight(stage: { percent: number; reps: number }, workingWeight?: number): RampSet {
  if (!workingWeight || workingWeight <= 0) return stage;
  const rounded = roundToNearest5(workingWeight * stage.percent);
  return { ...stage, weight: rounded > 0 ? String(rounded) : undefined };
}

export function benchRampExample(workingWeight = 185): RampSet[] {
  return [
    { percent: 45 / 185, reps: 10, weight: '45' },
    { percent: 95 / 185, reps: 8, weight: '95' },
    { percent: 135 / 185, reps: 5, weight: '135' },
    { percent: 165 / 185, reps: 3, weight: '165' },
  ].map((row) => ({ ...row, percent: workingWeight ? row.percent : row.percent }));
}

function roundToNearest5(n: number): number {
  return Math.max(0, Math.round(n / 5) * 5);
}

export function isPrimaryLift(name: string): boolean {
  return /bench press|back squat|squat|deadlift|overhead press|barbell row/.test(name.toLowerCase());
}
