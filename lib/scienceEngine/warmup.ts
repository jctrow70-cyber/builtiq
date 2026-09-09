import { getScienceRules } from './rules';
import type { CatalogExercise, SplitDayType, TrainingProfile, WarmupItem } from './types';
import type { MuscleId } from './taxonomy';
import { toWarmupItems, WARMUP_TEMPLATES, type LibraryMove, type WarmupTemplateId } from './warmupLibrary';
import { findByName } from './exerciseSelection';

export function warmupTemplateFor(workoutType: SplitDayType, muscles: MuscleId[]): WarmupTemplateId {
  const hasChest = muscles.includes('chest');
  const hasBack = muscles.includes('lats') || muscles.includes('upper_back');
  const hasLegs = muscles.includes('quads') || muscles.includes('hamstrings') || muscles.includes('glutes');
  if ((workoutType === 'Full Body' || workoutType === 'Push') && hasChest && hasLegs) return 'chest_legs';
  if (hasChest && hasBack && !hasLegs) return 'chest_back';
  if (workoutType === 'Upper Body' && hasChest && hasBack) return 'chest_back';
  if (workoutType === 'Lower Body' || workoutType === 'Legs') return 'lower_body';
  if (
    workoutType === 'Upper Body' ||
    workoutType === 'Push' ||
    workoutType === 'Pull' ||
    workoutType === 'Chest' ||
    workoutType === 'Back' ||
    workoutType === 'Shoulders' ||
    workoutType === 'Arms'
  ) {
    return 'upper_body';
  }
  if (hasChest && hasBack) return 'chest_back';
  return 'default';
}

const PREP_BY_PATTERN: Record<string, LibraryMove[]> = {
  squat: [
    { name: 'Goblet Squat', category: 'raise', reps: '8', muscleGroup: 'quads' },
    { name: 'Lateral Lunge', category: 'mobility', reps: '5/side', muscleGroup: 'adductors' },
  ],
  hinge: [
    { name: 'Light DB RDL', category: 'mobility', reps: '8', muscleGroup: 'hamstrings' },
    { name: 'Glute Bridge', category: 'activation', reps: '10', muscleGroup: 'glutes' },
  ],
  lunge: [
    { name: 'Reverse Lunge + Rotation', category: 'integration', reps: '5/side', muscleGroup: 'quads' },
    { name: 'Lateral Lunge', category: 'mobility', reps: '5/side', muscleGroup: 'adductors' },
  ],
  horizontal_push: [
    { name: 'Push-Up to Toe Touch', category: 'mobility', reps: '6/side', muscleGroup: 'chest' },
    { name: 'Scapular Push-Up', category: 'activation', reps: '8-10', muscleGroup: 'upper_back' },
  ],
  vertical_push: [
    { name: 'Scapular Push-Up', category: 'activation', reps: '8-10', muscleGroup: 'upper_back' },
    { name: 'Thoracic Rotation', category: 'mobility', reps: '5/side', muscleGroup: 'upper_back' },
  ],
  horizontal_pull: [{ name: 'Band Row', category: 'activation', reps: '12', muscleGroup: 'upper_back' }],
  vertical_pull: [{ name: 'Band Row', category: 'activation', reps: '12', muscleGroup: 'upper_back' }],
  knee_flexion: [{ name: 'Light DB RDL', category: 'mobility', reps: '8', muscleGroup: 'hamstrings' }],
  shoulder_abduction: [{ name: 'Band Row', category: 'activation', reps: '10', muscleGroup: 'upper_back' }],
};

export function generateWarmup(opts: {
  workoutType: SplitDayType;
  muscles: MuscleId[];
  profile: TrainingProfile;
  catalog: CatalogExercise[];
  sessionPatterns?: string[];
}): { items: WarmupItem[]; fatigueScore: number; durationMinutes: number } {
  const rules = getScienceRules();
  const style = opts.profile.warmupStyle || 'dynamic';
  const durationPref = opts.profile.warmupDuration || 'standard';
  const rounds = style === 'minimal' ? 1 : durationPref === 'extended' ? 3 : rules.warmupRounds;
  const templateId = warmupTemplateFor(opts.workoutType, opts.muscles);
  const fromSession = sessionPrepMoves(opts.sessionPatterns || []);
  let moves = fromSession.length >= 3 ? fromSession : WARMUP_TEMPLATES[templateId];
  if (style === 'minimal') moves = moves.slice(0, 3);
  if (durationPref === 'quick') moves = moves.slice(0, 4);

  const items = toWarmupItems(moves, rounds).map((item) => {
    const hit = findByName(opts.catalog, item.name);
    return { ...item, exerciseId: hit?.id, name: hit?.name || item.name, why: 'Prepares the joints and patterns used in this session.' };
  });

  const fatigueScore = style === 'athletic' ? 3 : style === 'minimal' ? 1 : 2;
  const durationMinutes = rules.warmupMinutes[durationPref][0];
  return { items, fatigueScore, durationMinutes };
}

function sessionPrepMoves(patterns: string[]): LibraryMove[] {
  const seen = new Set<string>();
  const moves: LibraryMove[] = [];
  for (const pattern of patterns) {
    for (const move of PREP_BY_PATTERN[pattern] || []) {
      if (seen.has(move.name) || moves.length >= 5) continue;
      seen.add(move.name);
      moves.push(move);
    }
  }
  return moves;
}

export function warmupFatigueLabel(score: number): 'very_low' | 'low' | 'moderate' {
  if (score <= 1) return 'very_low';
  if (score <= 2) return 'low';
  return 'moderate';
}
