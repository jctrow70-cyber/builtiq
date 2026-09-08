export const WORKOUT_SECTIONS = [
  { id: 'warmup', label: 'Warm-up' },
  { id: 'strength', label: 'Strength' },
  { id: 'cooldown', label: 'Cooldown' },
];

export function exerciseSection(ex: any): string {
  return String(ex?.section || 'strength');
}

export function sectionExercises(workout: any, section: string) {
  return (workout?.st_exercises || [])
    .filter((e: any) => exerciseSection(e) === section)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0) || (a.superset_order || 0) - (b.superset_order || 0));
}

export function plannedSets(ex: any) {
  return (ex?.st_planned_sets || [])
    .filter((s: any) => !s.is_deleted)
    .sort((a: any, b: any) => (a.set_number || 0) - (b.set_number || 0) || (a.sort_order || 0) - (b.sort_order || 0));
}

export function setLine(set: any): string {
  const kind = set.set_type && set.set_type !== 'working' ? `${set.set_type} ` : '';
  const reps = set.target_reps || (set.rep_min && set.rep_max ? `${set.rep_min}-${set.rep_max}` : set.rep_min || set.rep_max || '');
  const weight = set.target_weight ? ` @ ${set.target_weight}` : '';
  const rir = set.target_rir != null && set.target_rir !== '' ? ` · ${set.target_rir} RIR` : '';
  const rpe = !rir && set.target_rpe ? ` · RPE ${set.target_rpe}` : '';
  return `${kind}${reps || 'reps'}${weight}${rir}${rpe}`.trim();
}

export function summarizeExercise(ex: any): string {
  const sets = plannedSets(ex);
  if (!sets.length) return 'No sets prescribed';
  const first = sets[0];
  const same = sets.every(
    (s: any) =>
      String(s.target_reps || '') === String(first.target_reps || '') &&
      String(s.rep_min || '') === String(first.rep_min || '') &&
      String(s.rep_max || '') === String(first.rep_max || '')
  );
  if (same) {
    const working = sets.filter((s: any) => (s.set_type || 'working') === 'working');
    const count = working.length || sets.length;
    return `${count} × ${setLine(first)}`;
  }
  return sets.map((s: any, i: number) => `Set ${s.set_number || i + 1}: ${setLine(s)}`).join(' · ');
}

export function workoutHasExercises(workout: any): boolean {
  return (workout?.st_exercises || []).length > 0;
}
