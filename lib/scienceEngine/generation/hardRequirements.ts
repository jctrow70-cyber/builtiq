import { MAJOR_MUSCLES, type MuscleId } from '../taxonomy';
import type { TrainingProfile } from '../types';

/** Structured constraints parsed from the request. Preferences stay in free text. */
export type HardRequirements = {
  identicalDays: boolean;
  upperPush: boolean;
  lowerPull: boolean;
  requiredMuscles: MuscleId[];
  waivedMajorMuscles: MuscleId[];
  /** Longer warm-up list is allowed. Athletic primers stay separate either way. */
  extendedWarmup: boolean;
  warmupMin: number;
  warmupMax: number;
};

const MUSCLE_WORDS: Array<{ muscle: MuscleId; pattern: RegExp }> = [
  { muscle: 'chest', pattern: /\b(chest|pecs?)\b/i },
  { muscle: 'upper_back', pattern: /\b(upper back|traps?)\b/i },
  { muscle: 'lats', pattern: /\blats?\b/i },
  { muscle: 'quads', pattern: /\b(quads?|quadriceps)\b/i },
  { muscle: 'hamstrings', pattern: /\bhamstrings?\b/i },
  { muscle: 'glutes', pattern: /\bglutes?\b/i },
];

export function requestsIdenticalDays(text: string): boolean {
  const raw = String(text || '');
  if (/\b(not|never|n't)(\s+\w+){0,3}\s+identical\b/i.test(raw)) return false;
  if (/\bnot exactly the same\b/i.test(raw)) return false;
  return (
    /\bidentical\b/i.test(raw) ||
    /\bexactly the same\b/i.test(raw) ||
    /\bsame exact\b/i.test(raw) ||
    /\bboth (workouts|sessions|days)\b[\s\S]{0,80}\b(same|match|equal)\b/i.test(raw) ||
    /\b(same|matching) workout\b/i.test(raw) ||
    /\breuse (the )?(same|one) workout\b/i.test(raw) ||
    /\bcopy (the )?(same|one) workout\b/i.test(raw) ||
    /\bone workout\b[\s\S]{0,48}\b(both|each|every) days?\b/i.test(raw)
  );
}

export function warmupExerciseBounds(input: {
  sessionMinutes?: number;
  warmupStyle?: string;
  warmupDuration?: string;
  extendedWarmup?: boolean;
}): { min: number; max: number } {
  const minutes = Math.max(1, Number(input.sessionMinutes) || 60);
  const style = input.warmupStyle || 'dynamic';
  const duration = input.warmupDuration || 'standard';
  if (style === 'minimal' || duration === 'quick') return { min: 2, max: 3 };
  if (input.extendedWarmup || duration === 'extended' || style === 'athletic' || style === 'mobility_focused') {
    return { min: 3, max: 6 };
  }
  if (minutes <= 45) return { min: 2, max: 3 };
  if (minutes >= 90) return { min: 3, max: 5 };
  return { min: 2, max: 4 };
}

export function resolveHardRequirements(
  text: string,
  hints?: {
    sessionMinutes?: number;
    warmupStyle?: string;
    warmupDuration?: string;
    primaryGoal?: string;
    trainingFeel?: string[];
    potentiation?: string;
  }
): HardRequirements {
  const raw = String(text || '');
  const upperPush = /upper[- ]body push|\bpush emphasis\b|emphas\w*\s+upper[- ]body push/i.test(raw);
  const lowerPull = /lower[- ]body pull|\bpull emphasis\b|posterior chain|emphas\w*\s+(?:the )?(?:hinge|hamstrings|glutes)/i.test(raw);
  const requiredMuscles: MuscleId[] = [];
  if (upperPush) requiredMuscles.push('chest');
  if (lowerPull) requiredMuscles.push('hamstrings', 'glutes');

  const waived = new Set<MuscleId>(explicitMuscleWaivers(raw));
  if (upperPush) {
    waived.add('upper_back');
    waived.add('lats');
  }
  if (lowerPull) waived.add('quads');
  requiredMuscles.forEach((muscle) => waived.delete(muscle));

  const extendedWarmup =
    hints?.warmupDuration === 'extended' ||
    hints?.warmupStyle === 'athletic' ||
    hints?.warmupStyle === 'mobility_focused' ||
    /extended warm|long warm-?up|athletic warm-?up|extra warm-?up/i.test(raw);
  const bounds = warmupExerciseBounds({
    sessionMinutes: hints?.sessionMinutes,
    warmupStyle: hints?.warmupStyle,
    warmupDuration: hints?.warmupDuration,
    extendedWarmup,
  });

  return {
    identicalDays: requestsIdenticalDays(raw),
    upperPush,
    lowerPull,
    requiredMuscles,
    waivedMajorMuscles: MAJOR_MUSCLES.filter((muscle) => waived.has(muscle)),
    extendedWarmup,
    warmupMin: bounds.min,
    warmupMax: bounds.max,
  };
}

export function applyRequestToProfile(profile: TrainingProfile, userPrompt = ''): TrainingProfile {
  const text = [profile.intakeNotes, userPrompt].filter((part) => String(part || '').trim()).join('\n');
  return {
    ...profile,
    hardRequirements: resolveHardRequirements(text, {
      sessionMinutes: profile.preferredSessionMinutes,
      warmupStyle: profile.warmupStyle,
      warmupDuration: profile.warmupDuration,
      primaryGoal: profile.primaryGoal,
      trainingFeel: profile.trainingFeel,
      potentiation: profile.potentiationPreference,
    }),
  };
}

function explicitMuscleWaivers(text: string): MuscleId[] {
  const found: MuscleId[] = [];
  MUSCLE_WORDS.forEach(({ muscle, pattern }) => {
    const mention = text.match(pattern);
    if (!mention || mention.index == null) return;
    const before = text.slice(Math.max(0, mention.index - 48), mention.index);
    if (/\b(no|skip|avoid|without|de-?emphasize|deemphasize|don't train|do not train|not)\b/i.test(before)) {
      found.push(muscle);
    }
  });
  return found;
}
