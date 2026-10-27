import { isRampEffortSetType } from '../training/setTypes';

export const WORKOUT_SECTION_IDS = ['warmup', 'strength', 'conditioning', 'cooldown'] as const;
export type WorkoutSectionId = (typeof WORKOUT_SECTION_IDS)[number];

export const WORKOUT_SECTIONS = [
  { id: 'warmup', label: 'Warm-up' },
  { id: 'strength', label: 'Strength' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'cooldown', label: 'Cooldown' },
];

export const SECTION_SORT_BASE: Record<string, number> = {
  warmup: 0,
  strength: 100,
  conditioning: 200,
  cooldown: 300,
};

const WARMUP_ALIASES = new Set(['warmup', 'warm_up', 'warm-up', 'prep', 'preparation']);
const STRENGTH_ALIASES = new Set(['strength', 'lift', 'lifting', 'resistance']);
const CONDITIONING_ALIASES = new Set([
  'conditioning',
  'cardio',
  'metcon',
  'energy',
  'finisher',
  'conditioning_work',
]);
const COOLDOWN_ALIASES = new Set(['cooldown', 'cool_down', 'cool-down', 'stretch', 'stretching']);

export type ExerciseSummaryParts = {
  primary: string;
  extras: string[];
};

function normalizeSectionToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function isConditioningRole(role: unknown): boolean {
  return normalizeSectionToken(role) === 'conditioning';
}

/** Map stored section / role aliases onto the shared four-section model without rewriting records. */
export function normalizeWorkoutSection(
  section: unknown,
  extras?: { program_role?: unknown }
): string {
  const raw = normalizeSectionToken(section);
  if (WARMUP_ALIASES.has(raw)) return 'warmup';
  if (COOLDOWN_ALIASES.has(raw)) return 'cooldown';
  if (CONDITIONING_ALIASES.has(raw) || (isConditioningRole(extras?.program_role) && raw !== 'warmup' && raw !== 'cooldown')) {
    return 'conditioning';
  }
  if (STRENGTH_ALIASES.has(raw) || !raw) return 'strength';
  return raw;
}

export function isKnownWorkoutSection(section: string): boolean {
  return (WORKOUT_SECTION_IDS as readonly string[]).includes(section);
}

export function exerciseSection(ex: any): string {
  return normalizeWorkoutSection(ex?.section, { program_role: ex?.program_role });
}

export function sectionExercises(workout: any, section: string) {
  return (workout?.st_exercises || [])
    .filter((e: any) => exerciseSection(e) === section)
    .sort(
      (a: any, b: any) =>
        (a.sort_order || 0) - (b.sort_order || 0) || (a.superset_order || 0) - (b.superset_order || 0)
    );
}

export function plannedSets(ex: any) {
  return (ex?.st_planned_sets || [])
    .filter((s: any) => !s.is_deleted)
    .sort((a: any, b: any) => (a.set_number || 0) - (b.set_number || 0) || (a.sort_order || 0) - (b.sort_order || 0));
}

export function setKind(set: any): 'working' | 'ramp' | 'backoff' | 'dropset' | 'amrap' | 'other' {
  const raw = String(set?.set_type || 'working').toLowerCase();
  if (isRampEffortSetType(raw)) return 'ramp';
  if (raw === 'working' || raw === '') return 'working';
  if (raw === 'backoff') return 'backoff';
  if (raw === 'dropset' || raw === 'drop') return 'dropset';
  if (raw === 'amrap') return 'amrap';
  return 'other';
}

function formatReps(set: any): string {
  const raw = String(
    set?.target_reps ||
      (set?.rep_min && set?.rep_max ? `${set.rep_min}-${set.rep_max}` : set?.rep_min || set?.rep_max || '')
  ).trim();
  if (!raw) return '';
  if (/rep|sec|min|km|cal|m\b/i.test(raw)) return raw.replace(/(\d+)\s*-\s*(\d+)/, '$1–$2');
  if (/^\d+(?:\s*-\s*\d+)?$/.test(raw)) return `${raw.replace(/\s*-\s*/, '–')} reps`;
  return raw.replace(/(\d+)\s*-\s*(\d+)/, '$1–$2');
}

function prescriptionBits(set: any): { reps: string; weight: string; effort: string } {
  const reps = formatReps(set);
  const weight = set?.target_weight ? ` @ ${set.target_weight}` : '';
  const rir = set?.target_rir != null && set.target_rir !== '' ? `${set.target_rir} RIR` : '';
  const rpe = !rir && set?.target_rpe ? `RPE ${set.target_rpe}` : '';
  return { reps, weight, effort: rir || rpe };
}

function samePrescription(a: any, b: any): boolean {
  return (
    String(a?.target_reps || '') === String(b?.target_reps || '') &&
    String(a?.rep_min || '') === String(b?.rep_min || '') &&
    String(a?.rep_max || '') === String(b?.rep_max || '') &&
    String(a?.target_weight || '') === String(b?.target_weight || '') &&
    String(a?.target_rir ?? '') === String(b?.target_rir ?? '') &&
    String(a?.target_rpe || '') === String(b?.target_rpe || '')
  );
}

export function setLine(set: any): string {
  const kind = set?.set_type && set.set_type !== 'working' ? `${set.set_type} ` : '';
  const bits = prescriptionBits(set);
  const effort = bits.effort ? ` · ${bits.effort}` : '';
  return `${kind}${bits.reps || 'reps'}${bits.weight}${effort}`.trim();
}

function workingLine(sets: any[]): string {
  if (!sets.length) return '';
  const first = sets[0];
  const bits = prescriptionBits(first);
  const uniform = sets.every((s) => samePrescription(s, first));
  if (uniform) {
    const effort = bits.effort ? ` · ${bits.effort}` : '';
    return `${sets.length} × ${bits.reps || 'reps'}${bits.weight}${effort}`.trim();
  }
  return sets.map((s, i) => `Set ${s.set_number || i + 1}: ${setLine({ ...s, set_type: 'working' })}`).join(' · ');
}

function extraLabel(kind: 'ramp' | 'backoff' | 'dropset' | 'amrap', count: number): string {
  if (kind === 'ramp') return count === 1 ? '1 ramp-up set' : `${count} ramp-up sets`;
  if (kind === 'backoff') return count === 1 ? '1 backoff set' : `${count} backoff sets`;
  if (kind === 'dropset') return count === 1 ? '1 drop set' : `${count} drop sets`;
  return count === 1 ? '1 AMRAP set' : `${count} AMRAP sets`;
}

export function summarizeExerciseParts(ex: any): ExerciseSummaryParts {
  const sets = plannedSets(ex);
  if (!sets.length) return { primary: 'No sets prescribed', extras: [] };

  const working = sets.filter((s) => setKind(s) === 'working');
  const ramp = sets.filter((s) => setKind(s) === 'ramp');
  const backoff = sets.filter((s) => setKind(s) === 'backoff');
  const dropset = sets.filter((s) => setKind(s) === 'dropset');
  const amrap = sets.filter((s) => setKind(s) === 'amrap');
  const extras = [
    ramp.length ? extraLabel('ramp', ramp.length) : '',
    backoff.length ? extraLabel('backoff', backoff.length) : '',
    dropset.length ? extraLabel('dropset', dropset.length) : '',
    amrap.length ? extraLabel('amrap', amrap.length) : '',
  ].filter(Boolean);

  if (working.length) {
    return { primary: workingLine(working), extras };
  }

  if (ramp.length && !backoff.length && !dropset.length && !amrap.length) {
    return { primary: workingLine(ramp), extras: [] };
  }

  const fallback = [...ramp, ...backoff, ...dropset, ...amrap];
  return {
    primary: fallback.length ? workingLine(fallback) : 'No sets prescribed',
    extras,
  };
}

export function summarizeExercise(ex: any): string {
  const { primary, extras } = summarizeExerciseParts(ex);
  return extras.length ? `${primary} · ${extras.join(' · ')}` : primary;
}

export function workoutHasExercises(workout: any): boolean {
  return (workout?.st_exercises || []).length > 0;
}

export function workingExercises(workout: any) {
  return [...sectionExercises(workout, 'strength'), ...sectionExercises(workout, 'conditioning')];
}

export function workingExerciseCount(workout: any): number {
  return workingExercises(workout).length;
}

export function workoutFocusLabel(workout: any): string {
  const type = String(workout?.workout_type || '').trim();
  if (type) return type;
  return workoutPrimaryFocus(workout) || String(workout?.day_label || 'Workout');
}

export function workoutPrimaryFocus(workout: any): string {
  const muscles = workingExercises(workout)
    .map((ex: any) => String(ex?.muscle_group || '').trim())
    .filter(Boolean);
  return Array.from(new Set(muscles)).slice(0, 2).join(' + ') || 'Strength';
}

export function previewExerciseNames(workout: any, limit = 3): string[] {
  return workingExercises(workout)
    .map((ex: any) => String(ex?.name || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
}

export function exerciseRestLabel(ex: any): string | null {
  const fromExercise = Number(ex?.rest_seconds);
  const fromSets = plannedSets(ex)
    .map((set) => Number(set?.rest_seconds))
    .find((value) => Number.isFinite(value) && value > 0);
  const rest = Number.isFinite(fromExercise) && fromExercise > 0 ? fromExercise : fromSets;
  if (!rest) return null;
  if (rest >= 60) {
    const minutes = rest / 60;
    return Number.isInteger(minutes) ? `${minutes} min rest` : `${minutes.toFixed(1)} min rest`;
  }
  return `${rest}s rest`;
}

export function groupedPreviewSections(workout: any) {
  const sections = WORKOUT_SECTIONS.map((sec) => ({
    ...sec,
    list: sectionExercises(workout, sec.id),
  })).filter((sec) => sec.list.length);
  const other = (workout?.st_exercises || []).filter((e: any) => !isKnownWorkoutSection(exerciseSection(e)));
  if (other.length) sections.push({ id: 'other', label: 'Other', list: other });
  return sections;
}

export function dayDurationMinutes(activities: Array<{ duration_minutes?: number | null }>, workout?: any): number | null {
  const fromActivities = (activities || []).reduce((sum, activity) => sum + (Number(activity?.duration_minutes) || 0), 0);
  if (fromActivities > 0) return fromActivities;
  const count = workingExerciseCount(workout);
  if (!count) return null;
  return Math.max(30, count * 8);
}
