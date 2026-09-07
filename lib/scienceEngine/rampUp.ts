import type { RampSet, TrainingProfile } from './types';

export function generateRampSets(opts: {
  workingWeight?: number;
  workingRepMax: number;
  profile: TrainingProfile;
}): RampSet[] {
  const stages =
    opts.workingRepMax <= 6
      ? [
          { percent: 0.45, reps: 10 },
          { percent: 0.65, reps: 8 },
          { percent: 0.8, reps: 5 },
          { percent: 0.9, reps: 3 },
        ]
      : [
          { percent: 0.45, reps: 8 },
          { percent: 0.65, reps: 5 },
          { percent: 0.85, reps: 3 },
        ];

  if (opts.profile.experienceLevel === 'beginner') {
    return stages.slice(0, Math.min(3, stages.length)).map((stage) => withWeight(stage, opts.workingWeight));
  }
  return stages.map((stage) => withWeight(stage, opts.workingWeight));
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
