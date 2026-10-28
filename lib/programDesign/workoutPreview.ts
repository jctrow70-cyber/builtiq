import { resolveExerciseEquipment } from '../training/exerciseEquipment';
import { isRampEffortSetType } from '../training/setTypes';
import { formatDuration } from './activityTypes';

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

function storedSetNumber(set: any, index: number): number {
  const n = Number(set?.set_number);
  return Number.isFinite(n) && n > 0 ? n : index + 1;
}

function prescriptionsMatch(sets: any[]): boolean {
  if (!sets.length) return true;
  return sets.every((set) => samePrescription(set, sets[0]));
}

export function setLine(set: any): string {
  const kind = set?.set_type && set.set_type !== 'working' ? `${set.set_type} ` : '';
  const bits = prescriptionBits(set);
  const reps = bits.reps || 'Reps not specified';
  const effort = bits.effort ? ` · ${bits.effort}` : '';
  return `${kind}${reps}${bits.weight}${effort}`.trim();
}

function setBreakdown(sets: any[]): string {
  return sets
    .map((set, index) => `Set ${storedSetNumber(set, index)}: ${setLine({ ...set, set_type: 'working' })}`)
    .join(' · ');
}

function workingLine(sets: any[], noun: 'working' | 'set' = 'working'): string {
  if (!sets.length) return '';
  const first = sets[0];
  const bits = prescriptionBits(first);
  if (prescriptionsMatch(sets)) {
    if (!bits.reps && !bits.weight && !bits.effort) {
      return noun === 'working'
        ? `${sets.length} working set${sets.length === 1 ? '' : 's'}`
        : `${sets.length} set${sets.length === 1 ? '' : 's'}`;
    }
    const reps = bits.reps || 'Reps not specified';
    const effort = bits.effort ? ` · ${bits.effort}` : '';
    return `${sets.length} × ${reps}${bits.weight}${effort}`.trim();
  }
  return noun === 'working'
    ? `${sets.length} working set${sets.length === 1 ? '' : 's'} · mixed targets`
    : `${sets.length} sets · mixed targets`;
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
    const mixed = !prescriptionsMatch(working);
    return {
      primary: workingLine(working, 'working'),
      extras: [mixed ? setBreakdown(working) : '', ...extras].filter(Boolean),
    };
  }

  if (ramp.length && !backoff.length && !dropset.length && !amrap.length) {
    const mixed = !prescriptionsMatch(ramp);
    return {
      primary: workingLine(ramp, 'set'),
      extras: mixed ? [setBreakdown(ramp)] : [],
    };
  }

  const fallback = [...ramp, ...backoff, ...dropset, ...amrap];
  if (!fallback.length) return { primary: 'No sets prescribed', extras };
  const mixed = !prescriptionsMatch(fallback);
  return {
    primary: workingLine(fallback, 'set'),
    extras: [mixed ? setBreakdown(fallback) : '', ...extras].filter(Boolean),
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

export function workingExerciseCountLabel(count: number): string {
  if (count <= 0) return '';
  return `${count} working exercise${count === 1 ? '' : 's'}`;
}

export type TrainingWorkoutSummary = {
  name: string;
  focus: string;
  duration: string;
  workingCount: number;
  workingLabel: string;
  source: string;
  meta: string;
};

/** Shared Training / Program Design summary line from structured workout data only. */
export function trainingWorkoutSummary(input: {
  title?: string | null;
  workout?: any | null;
  duration?: string | null;
  durationMinutes?: number | null;
  sourceName?: string | null;
}): TrainingWorkoutSummary {
  const workout = input.workout || null;
  const name =
    (workout ? workoutFocusLabel(workout) : '') || String(input.title || '').trim() || 'Workout';
  const focus = workout ? workoutPrimaryFocus(workout) : '';
  const showFocus = Boolean(focus && focus !== name);
  const duration =
    String(input.duration || '').trim() ||
    formatDuration(input.durationMinutes) ||
    formatDuration(dayDurationMinutes([], workout));
  const workingCount = workout ? workingExerciseCount(workout) : 0;
  const workingLabel = workingExerciseCountLabel(workingCount);
  const source = String(input.sourceName || '').trim();
  const meta = [showFocus ? focus : null, duration, workingLabel, source].filter(Boolean).join(' · ');
  return {
    name,
    focus: showFocus ? focus : '',
    duration,
    workingCount,
    workingLabel,
    source,
    meta,
  };
}

/** Same four section IDs as Program Design. hideEmpty is for Training Start / Review. */
export function workoutSectionsForDisplay(workout: any, opts?: { hideEmpty?: boolean }) {
  if (opts?.hideEmpty) {
    return WORKOUT_SECTIONS.filter((sec) => sectionExercises(workout, sec.id).length > 0);
  }
  return WORKOUT_SECTIONS.map((sec) => ({ ...sec }));
}

export type TrainingExercisePrescription = {
  name: string;
  equipment: string;
  planned: string;
  secondary: string;
  workingCount: number;
  rampCount: number;
  mark: string;
};

/**
 * Compact Training logger prescription from planned sets and catalog data only.
 * Never reads logged actuals or infers equipment from the name.
 */
export function trainingExercisePrescription(input: {
  exercise?: any | null;
  catalogItem?: any | null;
  mark?: string | null;
  omitRest?: boolean;
}): TrainingExercisePrescription | null {
  const ex = input.exercise;
  if (!ex) return null;
  const sets = plannedSets(ex);
  if (!sets.length) return null;

  const workingCount = workingSetCount(ex);
  const rampCount = sets.filter((set) => setKind(set) === 'ramp').length;
  const parts = summarizeExerciseParts(ex);
  const rest = input.omitRest ? null : exerciseRestLabel(ex);
  const planned = workingCount ? [parts.primary, rest].filter(Boolean).join(' · ') : '';
  const secondary = workingCount
    ? parts.extras.join(' · ')
    : rampCount
      ? rampCount === 1
        ? '1 ramp-up set'
        : `${rampCount} ramp-up sets`
      : '';
  if (!planned && !secondary) return null;

  return {
    name: String(ex.name || '').trim() || 'Exercise',
    equipment: exerciseEquipmentLabel(ex, input.catalogItem),
    planned,
    secondary,
    workingCount,
    rampCount,
    mark: String(input.mark || '').trim(),
  };
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

export function formatRestSeconds(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return `${seconds} sec rest`;
}

export function exerciseRestSeconds(ex: any): number | null {
  const fromExercise = Number(ex?.rest_seconds);
  if (Number.isFinite(fromExercise) && fromExercise > 0) return fromExercise;
  const fromSets = plannedSets(ex)
    .map((set) => Number(set?.rest_seconds))
    .find((value) => Number.isFinite(value) && value > 0);
  return fromSets || null;
}

export function exerciseRestLabel(ex: any): string | null {
  const rest = exerciseRestSeconds(ex);
  return rest == null ? null : formatRestSeconds(rest);
}

/** Equipment from stored exercise or catalog data only — never inferred from the name. */
export function exerciseEquipmentLabel(ex: any, catalogItem?: any): string {
  const stored = String(ex?.equipment || '').trim();
  const meta = catalogItem?.coaching_metadata;
  const hasCatalog =
    Boolean(String(catalogItem?.equipment || '').trim()) ||
    Boolean(String(meta?.default_equipment || '').trim()) ||
    Boolean(meta?.compatible_equipment && (Array.isArray(meta.compatible_equipment) ? meta.compatible_equipment.length : String(meta.compatible_equipment).trim()));
  if (!stored && !hasCatalog) return '';
  return resolveExerciseEquipment(ex, catalogItem);
}

export function exerciseTempoLabel(ex: any): string {
  const fromExercise = String(ex?.tempo || ex?.target_tempo || '').trim();
  if (fromExercise) return fromExercise;
  const fromSet = plannedSets(ex)
    .map((set) => String(set?.tempo || set?.target_tempo || '').trim())
    .find(Boolean);
  return fromSet || '';
}

export function exerciseNoteText(ex: any): string {
  return String(ex?.notes || ex?.why || ex?.coaching_notes || '').trim();
}

export function workingSetCount(ex: any): number {
  return plannedSets(ex).filter((set) => setKind(set) === 'working').length;
}

export function rampSetDetails(ex: any): string[] {
  return plannedSets(ex)
    .filter((set) => setKind(set) === 'ramp')
    .map((set, index) => {
      const bits = prescriptionBits(set);
      const detail = [bits.reps, bits.weight.trim(), bits.effort].filter(Boolean).join(' · ').replace(' · @', ' @');
      return detail ? `Ramp ${index + 1}: ${detail}` : `Ramp ${index + 1}`;
    });
}

export function blockRestLabel(exercises: any[]): string | null {
  const rests = (exercises || []).map((ex) => exerciseRestSeconds(ex)).filter((value): value is number => value != null);
  if (!rests.length) return null;
  return formatRestSeconds(rests[rests.length - 1]);
}

export function supersetMarks(label: string, count: number): string[] {
  const match = String(label || '').match(/superset\s+([A-Z])/i) || String(label || '').match(/\b([A-Z])\b/);
  const letter = match?.[1]?.toUpperCase() || '';
  return Array.from({ length: Math.max(0, count) }, (_, index) => (letter ? `${letter}${index + 1}` : String(index + 1)));
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
