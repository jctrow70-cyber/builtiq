import type { WarmupCategory, WarmupItem } from './types';

export type WarmupTemplateId = 'chest_back' | 'chest_legs' | 'lower_body' | 'upper_body' | 'default';

export type LibraryMove = {
  name: string;
  category: WarmupCategory;
  reps: string;
  muscleGroup?: string;
};

export const WARMUP_TEMPLATES: Record<WarmupTemplateId, LibraryMove[]> = {
  chest_back: [
    { name: 'Goblet Squat', category: 'raise', reps: '8', muscleGroup: 'quads' },
    { name: 'Push-Up to Toe Touch', category: 'mobility', reps: '6/side', muscleGroup: 'chest' },
    { name: 'Light DB RDL', category: 'mobility', reps: '8', muscleGroup: 'hamstrings' },
    { name: 'Band Row', category: 'activation', reps: '12', muscleGroup: 'upper_back' },
    { name: 'Reverse Lunge + Rotation', category: 'integration', reps: '5/side', muscleGroup: 'quads' },
    { name: 'Scapular Push-Up', category: 'activation', reps: '8-10', muscleGroup: 'upper_back' },
  ],
  chest_legs: [
    { name: 'Goblet Squat', category: 'raise', reps: '8', muscleGroup: 'quads' },
    { name: 'Push-Up to Downward Dog', category: 'mobility', reps: '6-8', muscleGroup: 'chest' },
    { name: 'Light DB RDL', category: 'mobility', reps: '8', muscleGroup: 'hamstrings' },
    { name: 'Reverse Lunge + Rotation', category: 'integration', reps: '5/side', muscleGroup: 'quads' },
    { name: 'Bear Plank Shoulder Tap', category: 'activation', reps: '6/side', muscleGroup: 'abs' },
    { name: 'Lateral Lunge', category: 'mobility', reps: '5/side', muscleGroup: 'adductors' },
  ],
  lower_body: [
    { name: 'Goblet Squat', category: 'raise', reps: '8', muscleGroup: 'quads' },
    { name: 'Light DB RDL', category: 'mobility', reps: '8', muscleGroup: 'hamstrings' },
    { name: 'Reverse Lunge + Reach', category: 'mobility', reps: '5/side', muscleGroup: 'quads' },
    { name: 'Lateral Lunge', category: 'mobility', reps: '5/side', muscleGroup: 'adductors' },
    { name: 'Glute Bridge', category: 'activation', reps: '10', muscleGroup: 'glutes' },
    { name: 'Ankle Rocker', category: 'mobility', reps: '8/side', muscleGroup: 'calves' },
  ],
  upper_body: [
    { name: 'Inchworm', category: 'raise', reps: '5', muscleGroup: 'abs' },
    { name: 'Band Row', category: 'activation', reps: '12', muscleGroup: 'upper_back' },
    { name: 'Thoracic Rotation', category: 'mobility', reps: '5/side', muscleGroup: 'upper_back' },
    { name: 'Scapular Push-Up', category: 'activation', reps: '10', muscleGroup: 'upper_back' },
    { name: 'Light Dumbbell Press', category: 'activation', reps: '8', muscleGroup: 'chest' },
    { name: 'Face Pull', category: 'activation', reps: '10-12', muscleGroup: 'rear_delts' },
  ],
  default: [
    { name: 'Goblet Squat', category: 'raise', reps: '8', muscleGroup: 'quads' },
    { name: 'Inchworm', category: 'mobility', reps: '5', muscleGroup: 'abs' },
    { name: 'Band Row', category: 'activation', reps: '12', muscleGroup: 'upper_back' },
    { name: 'Reverse Lunge + Rotation', category: 'integration', reps: '5/side', muscleGroup: 'quads' },
  ],
};

export function toWarmupItems(moves: LibraryMove[], rounds = 2): WarmupItem[] {
  return moves.map((move) => ({
    name: move.name,
    category: move.category,
    reps: move.reps,
    sets: rounds,
    muscleGroup: move.muscleGroup,
    why: 'Dynamic preparation for today\'s muscles and movement patterns.',
  }));
}
