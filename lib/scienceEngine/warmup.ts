import { getScienceRules } from './rules';
import type { CatalogExercise, SplitDayType, TrainingProfile, WarmupItem } from './types';
import type { MuscleId } from './taxonomy';
import { toWarmupItems, WARMUP_TEMPLATES, type WarmupTemplateId } from './warmupLibrary';
import { findByName } from './exerciseSelection';

export function warmupTemplateFor(workoutType: SplitDayType, muscles: MuscleId[]): WarmupTemplateId {
  const hasChest = muscles.includes('chest');
  const hasBack = muscles.includes('lats') || muscles.includes('upper_back');
  const hasLegs = muscles.includes('quads') || muscles.includes('hamstrings') || muscles.includes('glutes');
  if ((workoutType === 'Full Body' || workoutType === 'Push') && hasChest && hasLegs) return 'chest_legs';
  if (hasChest && hasBack && !hasLegs) return 'chest_back';
  if (workoutType === 'Upper Body' && hasChest && hasBack) return 'chest_back';
  if (workoutType === 'Lower Body' || workoutType === 'Legs') return 'lower_body';
  if (workoutType === 'Upper Body' || workoutType === 'Push' || workoutType === 'Pull') return 'upper_body';
  if (hasChest && hasBack) return 'chest_back';
  return 'default';
}

export function generateWarmup(opts: {
  workoutType: SplitDayType;
  muscles: MuscleId[];
  profile: TrainingProfile;
  catalog: CatalogExercise[];
}): { items: WarmupItem[]; fatigueScore: number; durationMinutes: number } {
  const rules = getScienceRules();
  const style = opts.profile.warmupStyle || 'dynamic';
  const durationPref = opts.profile.warmupDuration || 'standard';
  const rounds = style === 'minimal' ? 1 : durationPref === 'extended' ? 3 : rules.warmupRounds;
  const templateId = warmupTemplateFor(opts.workoutType, opts.muscles);
  let moves = WARMUP_TEMPLATES[templateId];
  if (style === 'minimal') moves = moves.slice(0, 3);
  if (durationPref === 'quick') moves = moves.slice(0, 4);

  const items = toWarmupItems(moves, rounds).map((item) => {
    const hit = findByName(opts.catalog, item.name);
    return { ...item, exerciseId: hit?.id, name: hit?.name || item.name };
  });

  const fatigueScore = style === 'athletic' ? 3 : style === 'minimal' ? 1 : 2;
  const durationMinutes = rules.warmupMinutes[durationPref][0];
  return { items, fatigueScore, durationMinutes };
}

export function warmupFatigueLabel(score: number): 'very_low' | 'low' | 'moderate' {
  if (score <= 1) return 'very_low';
  if (score <= 2) return 'low';
  return 'moderate';
}
