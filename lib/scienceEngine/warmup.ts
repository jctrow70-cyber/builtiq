import { warmupExerciseBounds } from './generation/hardRequirements';
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
  const rounds = style === 'minimal' || durationPref !== 'extended' ? 1 : Math.min(2, rules.warmupRounds);
  const bounds = opts.profile.hardRequirements
    ? { min: opts.profile.hardRequirements.warmupMin, max: opts.profile.hardRequirements.warmupMax }
    : warmupExerciseBounds({
        sessionMinutes: opts.profile.preferredSessionMinutes,
        warmupStyle: style,
        warmupDuration: durationPref,
      });
  const preferred = preferredWarmupCount({
    max: bounds.max,
    minutes: opts.profile.preferredSessionMinutes,
    style,
    durationPref,
  });
  const patterns = opts.sessionPatterns || [];
  const templateId = warmupTemplateFor(opts.workoutType, opts.muscles);
  const moves = selectTargetedWarmupMoves({
    patterns,
    templateId,
    workoutType: opts.workoutType,
    max: bounds.max,
    preferred,
    fillToPreferred: durationPref === 'extended' || style === 'athletic' || style === 'mobility_focused',
  });

  const items = toWarmupItems(moves, rounds).map((item) => {
    const hit = findByName(opts.catalog, item.name);
    return { ...item, exerciseId: hit?.id, name: hit?.name || item.name, why: 'Prepares the joints and patterns used in this session.' };
  });

  const fatigueScore = style === 'athletic' ? 3 : style === 'minimal' ? 1 : 2;
  const durationMinutes = rules.warmupMinutes[durationPref][0];
  return { items, fatigueScore, durationMinutes };
}

function preferredWarmupCount(opts: {
  max: number;
  minutes?: number;
  style: string;
  durationPref: string;
}): number {
  if (opts.style === 'athletic' || opts.style === 'mobility_focused' || opts.durationPref === 'extended') {
    return Math.min(opts.max, 4);
  }
  const minutes = Math.max(1, Number(opts.minutes) || 60);
  if (minutes <= 45) return Math.min(opts.max, 2);
  return Math.min(opts.max, 2);
}

function hasLowerPattern(patterns: string[]): boolean {
  return patterns.some((pattern) => ['squat', 'hinge', 'lunge'].includes(pattern));
}

function hasUpperPattern(patterns: string[]): boolean {
  return patterns.some((pattern) =>
    ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'shoulder_abduction'].includes(pattern)
  );
}

function selectTargetedWarmupMoves(opts: {
  patterns: string[];
  templateId: WarmupTemplateId;
  workoutType: SplitDayType;
  max: number;
  preferred: number;
  fillToPreferred?: boolean;
}): LibraryMove[] {
  const seen = new Set<string>();
  const moves: LibraryMove[] = [];
  const add = (move: LibraryMove | undefined) => {
    if (!move || moves.length >= opts.max) return;
    const key = move.name.toLowerCase();
    if (seen.has(key)) return;
    if (isAnkleOnlyMove(move) && !hasLowerPattern(opts.patterns)) return;
    seen.add(key);
    moves.push(move);
  };

  const raise = pickGeneralRaise(opts.patterns, opts.templateId, opts.workoutType);
  add(raise);

  const uniquePatterns = Array.from(new Set(opts.patterns.filter(Boolean)));
  for (const pattern of uniquePatterns) {
    if (moves.length >= opts.preferred) break;
    add(PREP_BY_PATTERN[pattern]?.[0]);
  }

  if (opts.fillToPreferred) {
    for (const extra of WARMUP_TEMPLATES[opts.templateId] || []) {
      if (moves.length >= opts.preferred) break;
      add(extra);
    }
  }
  if (!moves.length) {
    add(WARMUP_TEMPLATES[opts.templateId][0] || WARMUP_TEMPLATES.default[0]);
  }
  return moves;
}

function pickGeneralRaise(patterns: string[], templateId: WarmupTemplateId, workoutType: SplitDayType): LibraryMove {
  if (hasLowerPattern(patterns) && hasUpperPattern(patterns)) {
    return { name: 'Inchworm', category: 'raise', reps: '5', muscleGroup: 'abs' };
  }
  if (hasLowerPattern(patterns) || workoutType === 'Lower Body' || workoutType === 'Legs') {
    return { name: 'Goblet Squat', category: 'raise', reps: '8', muscleGroup: 'quads' };
  }
  if (templateId === 'upper_body' || hasUpperPattern(patterns)) {
    return { name: 'Inchworm', category: 'raise', reps: '5', muscleGroup: 'abs' };
  }
  return WARMUP_TEMPLATES[templateId][0] || { name: 'Inchworm', category: 'raise', reps: '5', muscleGroup: 'abs' };
}

function isAnkleOnlyMove(move: LibraryMove): boolean {
  return /ankle|knee-to-wall|world'?s greatest/i.test(move.name);
}

export function warmupFatigueLabel(score: number): 'very_low' | 'low' | 'moderate' {
  if (score <= 1) return 'very_low';
  if (score <= 2) return 'low';
  return 'moderate';
}
