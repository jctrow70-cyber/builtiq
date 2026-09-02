import type { ActivityType } from './types';

export const ACTIVITY_TYPE_META: Record<
  ActivityType,
  { label: string; shortLabel: string; defaultTitle: string; description: string }
> = {
  strength: {
    label: 'Strength Training',
    shortLabel: 'Strength',
    defaultTitle: 'Strength',
    description: 'Lifting, sets, and reps',
  },
  cardio: {
    label: 'Cardio',
    shortLabel: 'Cardio',
    defaultTitle: 'Cardio',
    description: 'Bike, run, walk, or zone work',
  },
  mobility: {
    label: 'Mobility',
    shortLabel: 'Mobility',
    defaultTitle: 'Mobility',
    description: 'Joint prep and movement quality',
  },
  stretching: {
    label: 'Stretching',
    shortLabel: 'Stretch',
    defaultTitle: 'Stretching',
    description: 'Cool-down and flexibility',
  },
  recovery: {
    label: 'Recovery',
    shortLabel: 'Recovery',
    defaultTitle: 'Recovery',
    description: 'Restorative work and easy days',
  },
  sport: {
    label: 'Sport / Activity',
    shortLabel: 'Sport',
    defaultTitle: 'Sport',
    description: 'Practice, games, or recreation',
  },
  rest: {
    label: 'Rest',
    shortLabel: 'Rest',
    defaultTitle: 'Rest',
    description: 'A planned day off',
  },
};

export function activityTypeLabel(type: string | null | undefined): string {
  if (type && type in ACTIVITY_TYPE_META) {
    return ACTIVITY_TYPE_META[type as ActivityType].label;
  }
  return 'Activity';
}

export function activityTypeShortLabel(type: string | null | undefined): string {
  if (type && type in ACTIVITY_TYPE_META) {
    return ACTIVITY_TYPE_META[type as ActivityType].shortLabel;
  }
  return 'Activity';
}

export function defaultActivityTitle(type: ActivityType): string {
  return ACTIVITY_TYPE_META[type].defaultTitle;
}

export function inferActivityTypeFromWorkout(workoutType: string | null | undefined): ActivityType {
  const t = String(workoutType || '').toLowerCase();
  if (t.includes('cardio') || t.includes('zone') || t.includes('run') || t.includes('bike')) return 'cardio';
  if (t.includes('mobility')) return 'mobility';
  if (t.includes('stretch') || t.includes('cooldown') || t.includes('cool-down')) return 'stretching';
  if (t.includes('recover') || t.includes('rest')) return t.includes('rest') ? 'rest' : 'recovery';
  if (t.includes('sport') || t.includes('practice')) return 'sport';
  return 'strength';
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours} hr ${rem} min` : `${hours} hr`;
}
