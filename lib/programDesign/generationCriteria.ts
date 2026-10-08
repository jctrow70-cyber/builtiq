import type { HardRequirements } from '../scienceEngine/generation/hardRequirements';
import type { ScienceProgram, ScienceWorkout } from '../scienceEngine/types';

/** Frozen intake and outcome stored on the program. Diagnostics stay on st_generation_runs. */
export type GenerationCriteriaSnapshot = {
  version: 1;
  saved_at: string;
  status: 'ai' | 'ai_repaired' | 'science_template';
  goal: string | null;
  split: string | null;
  experience: string | null;
  days: string[];
  session_minutes: number | null;
  notes: string | null;
  focus_muscles: string[];
  identical_days: boolean;
  upper_push: boolean;
  lower_pull: boolean;
  required_muscles: string[];
  waived_muscles: string[];
  warmup_min: number;
  warmup_max: number;
  extended_warmup: boolean;
  kept: string[];
  unmet: string[];
};

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Build Muscle',
  strength: 'Get Stronger',
  fat_loss_support: 'Lose Fat',
  general_fitness: 'General Fitness',
  athletic_performance: 'Athletic Performance',
  muscular_endurance: 'Improve Endurance',
  strength_hypertrophy: 'Strength and muscle',
};

const SPLIT_LABELS: Record<string, string> = {
  full_body: 'Full Body',
  upper_lower: 'Upper / Lower',
  ppl: 'Push / Pull / Legs',
  body_part: 'Body Part Split',
  athletic: 'Athletic / Performance',
  hybrid: 'Hybrid',
  ai_recommend: 'Let BuildIQ Decide',
};

function labelOf(value: string | null | undefined, labels: Record<string, string>): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return labels[raw] || raw.replace(/_/g, ' ');
}

function muscleLabel(muscle: string): string {
  return muscle.replace(/_/g, ' ');
}

function trainingDays(program: Pick<ScienceProgram, 'workouts'>): ScienceWorkout[] {
  return (program.workouts || []).filter(
    (workout) => workout.week === 1 && workout.workoutType !== 'Cardio' && workout.workoutType !== 'Mobility'
  );
}

function sessionSignature(workout: ScienceWorkout): string {
  return (workout.exercises || []).map((exercise) => `${exercise.name}|${exercise.sets}|${exercise.repMin}|${exercise.repMax}`).join('||');
}

function hasPattern(workout: ScienceWorkout, patterns: string[]): boolean {
  return (workout.exercises || []).some((exercise) => patterns.includes(exercise.movementPattern));
}

function uniqueWarmupCount(workout: ScienceWorkout): { count: number; duplicate: boolean } {
  const names = (workout.warmup || []).map((item) => item.name.toLowerCase());
  const unique = new Set(names);
  return { count: unique.size, duplicate: unique.size !== names.length };
}

export function generationStatusFromMethod(method: string): GenerationCriteriaSnapshot['status'] {
  if (method === 'ai_repaired') return 'ai_repaired';
  if (method === 'science_fallback' || method === 'template' || method === 'science') return 'science_template';
  return 'ai';
}

export function generationStatusLabel(status: GenerationCriteriaSnapshot['status']): string {
  if (status === 'ai') return 'Built with AI';
  if (status === 'ai_repaired') return 'Built with AI, then adjusted to fit the rules';
  return 'Built from the science template';
}

export function buildGenerationCriteria(input: {
  method: string;
  program: Pick<ScienceProgram, 'workouts'>;
  requirements: HardRequirements;
  savedAt?: string;
  request?: {
    goal?: string | null;
    split?: string | null;
    experience?: string | null;
    days?: string[];
    sessionMinutes?: number | null;
    notes?: string | null;
    focusMuscles?: string[];
  };
}): GenerationCriteriaSnapshot {
  const requirements = input.requirements;
  const request = input.request || {};
  const days = trainingDays(input.program);
  const kept: string[] = [];
  const unmet: string[] = [];
  const notes = String(request.notes || '').trim().slice(0, 2000);

  if (requirements.identicalDays) {
    const signatures = days.map(sessionSignature);
    const same = signatures.length >= 2 && signatures.every((signature) => signature === signatures[0] && signature.length > 0);
    if (same) kept.push('Both training days use the same workout.');
    else unmet.push('The training days are not the same workout.');
  }

  const sample = days[0];
  if (requirements.upperPush) {
    if (sample && hasPattern(sample, ['horizontal_push', 'vertical_push'])) kept.push('Upper-body push emphasis is in the workout.');
    else unmet.push('Upper-body push emphasis was not placed.');
  }
  if (requirements.lowerPull) {
    if (sample && hasPattern(sample, ['hinge'])) kept.push('Lower-body pull emphasis is in the workout.');
    else unmet.push('Lower-body pull emphasis was not placed.');
  }

  if (days.length) {
    const warmupProblems = days.filter((workout) => {
      const warm = uniqueWarmupCount(workout);
      return warm.duplicate || warm.count < requirements.warmupMin || warm.count > requirements.warmupMax;
    });
    if (warmupProblems.length) unmet.push(`Dynamic warm-ups are outside the ${requirements.warmupMin}–${requirements.warmupMax} range or repeat a movement.`);
    else kept.push(`Dynamic warm-ups stay within ${requirements.warmupMin}–${requirements.warmupMax}.`);
  }

  return {
    version: 1,
    saved_at: input.savedAt || new Date().toISOString(),
    status: generationStatusFromMethod(input.method),
    goal: labelOf(request.goal, GOAL_LABELS),
    split: labelOf(request.split, SPLIT_LABELS),
    experience: labelOf(request.experience, {
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced',
      not_sure: 'Not Sure',
    }),
    days: Array.isArray(request.days) ? request.days.map(String) : [],
    session_minutes: request.sessionMinutes == null ? null : Number(request.sessionMinutes) || null,
    notes: notes || null,
    focus_muscles: Array.isArray(request.focusMuscles) ? request.focusMuscles.map(String).filter(Boolean) : [],
    identical_days: requirements.identicalDays,
    upper_push: requirements.upperPush,
    lower_pull: requirements.lowerPull,
    required_muscles: requirements.requiredMuscles.map(muscleLabel),
    waived_muscles: requirements.waivedMajorMuscles.map(muscleLabel),
    warmup_min: requirements.warmupMin,
    warmup_max: requirements.warmupMax,
    extended_warmup: requirements.extendedWarmup,
    kept,
    unmet,
  };
}

export function readGenerationCriteria(raw: unknown): GenerationCriteriaSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Partial<GenerationCriteriaSnapshot>;
  if (row.version !== 1) return null;
  if (row.status !== 'ai' && row.status !== 'ai_repaired' && row.status !== 'science_template') return null;
  return {
    version: 1,
    saved_at: String(row.saved_at || ''),
    status: row.status,
    goal: row.goal ? String(row.goal) : null,
    split: row.split ? String(row.split) : null,
    experience: row.experience ? String(row.experience) : null,
    days: Array.isArray(row.days) ? row.days.map(String) : [],
    session_minutes: row.session_minutes == null ? null : Number(row.session_minutes) || null,
    notes: row.notes ? String(row.notes) : null,
    focus_muscles: Array.isArray(row.focus_muscles) ? row.focus_muscles.map(String) : [],
    identical_days: Boolean(row.identical_days),
    upper_push: Boolean(row.upper_push),
    lower_pull: Boolean(row.lower_pull),
    required_muscles: Array.isArray(row.required_muscles) ? row.required_muscles.map(String) : [],
    waived_muscles: Array.isArray(row.waived_muscles) ? row.waived_muscles.map(String) : [],
    warmup_min: Number(row.warmup_min) || 0,
    warmup_max: Number(row.warmup_max) || 0,
    extended_warmup: Boolean(row.extended_warmup),
    kept: Array.isArray(row.kept) ? row.kept.map(String) : [],
    unmet: Array.isArray(row.unmet) ? row.unmet.map(String) : [],
  };
}

export function describeGenerationCriteria(snapshot: GenerationCriteriaSnapshot): {
  statusLabel: string;
  requestLines: string[];
  requirementLines: string[];
  kept: string[];
  unmet: string[];
} {
  const requestLines: string[] = [];
  if (snapshot.days.length) requestLines.push(`${snapshot.days.length} days · ${snapshot.days.join(', ')}`);
  if (snapshot.session_minutes) requestLines.push(`${snapshot.session_minutes}-minute sessions`);
  if (snapshot.goal) requestLines.push(`Goal: ${snapshot.goal}`);
  if (snapshot.split) requestLines.push(`Split: ${snapshot.split}`);
  if (snapshot.experience) requestLines.push(`Experience: ${snapshot.experience}`);
  if (snapshot.focus_muscles.length) requestLines.push(`Priority: ${snapshot.focus_muscles.join(', ')}`);
  if (snapshot.notes) requestLines.push(`Notes: ${snapshot.notes}`);

  const requirementLines: string[] = [];
  if (!snapshot.identical_days && !snapshot.upper_push && !snapshot.lower_pull) {
    requirementLines.push('No identical-day or muscle-emphasis requirement was set.');
  }
  if (snapshot.identical_days) requirementLines.push('Both training days should use the same workout.');
  if (snapshot.upper_push) requirementLines.push('Upper-body push emphasis.');
  if (snapshot.lower_pull) requirementLines.push('Lower-body pull emphasis.');
  if (snapshot.required_muscles.length) requirementLines.push(`Required: ${snapshot.required_muscles.join(', ')}.`);
  if (snapshot.waived_muscles.length) requirementLines.push(`De-emphasized: ${snapshot.waived_muscles.join(', ')}.`);
  if (snapshot.warmup_min && snapshot.warmup_max) {
    requirementLines.push(
      snapshot.extended_warmup
        ? `Dynamic warm-ups: ${snapshot.warmup_min}–${snapshot.warmup_max}, with a longer warm-up allowed.`
        : `Dynamic warm-ups: ${snapshot.warmup_min}–${snapshot.warmup_max}.`
    );
  }
  if (!requirementLines.length) requirementLines.push('No identical-day or muscle-emphasis requirement was set.');

  return {
    statusLabel: generationStatusLabel(snapshot.status),
    requestLines,
    requirementLines,
    kept: snapshot.kept,
    unmet: snapshot.unmet,
  };
}
