import type { SplitDay, SplitDayType, TrainingProfile, VolumeTarget } from './types';
import type { MuscleId } from './taxonomy';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const UPPER_MUSCLES: MuscleId[] = [
  'chest',
  'upper_back',
  'lats',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
];
const LOWER_MUSCLES: MuscleId[] = [
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'hip_flexors',
  'spinal_erectors',
];
const PUSH_MUSCLES: MuscleId[] = ['chest', 'front_delts', 'side_delts', 'triceps'];
const PULL_MUSCLES: MuscleId[] = ['upper_back', 'lats', 'rear_delts', 'biceps', 'forearms'];
const CORE_MUSCLES: MuscleId[] = ['abs', 'obliques'];

const ALL_LIFT_MUSCLES: MuscleId[] = [...UPPER_MUSCLES, ...LOWER_MUSCLES, ...CORE_MUSCLES];

function pickDays(profile: TrainingProfile, count: number): string[] {
  if (profile.preferredDays?.length) return profile.preferredDays.slice(0, count);
  const defaults: Record<number, string[]> = {
    2: ['Mon', 'Thu'],
    3: ['Mon', 'Wed', 'Fri'],
    4: ['Mon', 'Tue', 'Thu', 'Fri'],
    5: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  };
  return defaults[count] || DAY_LABELS.slice(0, count);
}

function musclesForType(type: SplitDayType): MuscleId[] {
  if (type === 'Upper Body') return [...UPPER_MUSCLES, ...CORE_MUSCLES];
  if (type === 'Lower Body' || type === 'Legs') return [...LOWER_MUSCLES, ...CORE_MUSCLES];
  if (type === 'Push') return [...PUSH_MUSCLES, ...CORE_MUSCLES];
  if (type === 'Pull') return [...PULL_MUSCLES, ...CORE_MUSCLES];
  if (type === 'Chest') return ['chest', 'front_delts'];
  if (type === 'Back') return ['lats', 'upper_back', 'rear_delts', 'spinal_erectors'];
  if (type === 'Shoulders') return ['front_delts', 'side_delts', 'rear_delts'];
  if (type === 'Arms') return ['biceps', 'triceps', 'forearms'];
  return ALL_LIFT_MUSCLES;
}

function mapExplicitType(raw: string): SplitDayType | null {
  const v = String(raw || '').toLowerCase();
  if (v === 'upper body' || v === 'upper') return 'Upper Body';
  if (v === 'lower body' || v === 'lower') return 'Lower Body';
  if (v === 'full body' || v === 'full') return 'Full Body';
  if (v === 'push') return 'Push';
  if (v === 'pull') return 'Pull';
  if (v === 'legs') return 'Legs';
  if (v === 'chest') return 'Chest';
  if (v === 'back') return 'Back';
  if (v === 'shoulders' || v === 'shoulder') return 'Shoulders';
  if (v === 'arms' || v === 'arm') return 'Arms';
  return null;
}

export function generateTrainingSplit(profile: TrainingProfile, _volumeTargets?: VolumeTarget[]): SplitDay[] {
  const daysCount = Math.max(1, Math.min(6, profile.trainingDaysPerWeek || 4));
  const days = pickDays(profile, daysCount);

  if (profile.explicitDayTypes && Object.keys(profile.explicitDayTypes).length) {
    const mapped = days
      .map((dayLabel) => {
        const type = mapExplicitType(profile.explicitDayTypes?.[dayLabel] || '');
        if (!type) return null;
        return { dayLabel, workoutType: type, targetMuscles: musclesForType(type) };
      })
      .filter((row): row is SplitDay => !!row);
    if (mapped.length === days.length) return mapped;
  }

  const types = defaultSplitTypes(daysCount);
  return days.map((dayLabel, i) => ({
    dayLabel,
    workoutType: types[i],
    targetMuscles: musclesForType(types[i]),
  }));
}

export function defaultSplitTypes(days: number): SplitDayType[] {
  if (days <= 2) return ['Full Body', 'Full Body'];
  if (days === 3) return ['Full Body', 'Full Body', 'Full Body'];
  if (days === 4) return ['Upper Body', 'Lower Body', 'Upper Body', 'Lower Body'];
  if (days === 5) return ['Upper Body', 'Lower Body', 'Push', 'Pull', 'Legs'];
  return ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'];
}

export function splitDayName(type: SplitDayType, index: number, types: SplitDayType[]): string {
  const same = types.filter((t) => t === type).length;
  if (same <= 1) return type;
  const nth = types.slice(0, index + 1).filter((t) => t === type).length;
  const letter = String.fromCharCode(64 + nth);
  if (type === 'Full Body') return `Full Body ${letter}`;
  if (type === 'Upper Body') return `Upper ${letter}`;
  if (type === 'Lower Body') return `Lower ${letter}`;
  return `${type} ${letter}`;
}
