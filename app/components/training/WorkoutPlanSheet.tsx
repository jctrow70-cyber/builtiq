'use client';

const SECTIONS = [
  { id: 'warmup', label: 'Warm-up' },
  { id: 'strength', label: 'Strength' },
  { id: 'cooldown', label: 'Cooldown' },
];

function exerciseSection(ex: any): string {
  return String(ex?.section || 'strength');
}

function sectionExercises(workout: any, section: string) {
  return (workout?.st_exercises || [])
    .filter((e: any) => exerciseSection(e) === section)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0) || (a.superset_order || 0) - (b.superset_order || 0));
}

function plannedSets(ex: any) {
  return (ex?.st_planned_sets || [])
    .filter((s: any) => !s.is_deleted)
    .sort((a: any, b: any) => (a.set_number || 0) - (b.set_number || 0));
}

function setLine(set: any): string {
  const kind = set.set_type && set.set_type !== 'working' ? `${set.set_type} ` : '';
  const reps = set.target_reps || (set.rep_min && set.rep_max ? `${set.rep_min}-${set.rep_max}` : set.rep_min || set.rep_max || '');
  const weight = set.target_weight ? ` @ ${set.target_weight}` : '';
  const rir = set.target_rir != null && set.target_rir !== '' ? ` · ${set.target_rir} RIR` : '';
  const rpe = !rir && set.target_rpe ? ` · RPE ${set.target_rpe}` : '';
  return `${kind}${reps || 'reps'}${weight}${rir}${rpe}`.trim();
}

function summarizeExercise(ex: any): string {
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

type WorkoutPlanSheetProps = {
  workout: any;
  dateLabel: string;
  canEdit?: boolean;
  onClose: () => void;
  onStart: () => void;
  onEdit: () => void;
};

export default function WorkoutPlanSheet({
  workout,
  dateLabel,
  canEdit = true,
  onClose,
  onStart,
  onEdit,
}: WorkoutPlanSheetProps) {
  const title = workout?.workout_type || workout?.day_label || 'Workout';
  const hasExercises = (workout?.st_exercises || []).length > 0;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="pd-sheet card te-plan-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">{dateLabel}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">Review the planned exercises here. Start Workout is only for logging sets.</p>

        {!hasExercises && <p className="muted">This day does not have exercises yet.</p>}

        {SECTIONS.map((sec) => {
          const list = sectionExercises(workout, sec.id);
          if (!list.length) return null;
          return (
            <section key={sec.id} className="te-plan-section">
              <h3>{sec.label}</h3>
              {list.map((ex: any) => (
                <div key={ex.id} className="te-plan-ex">
                  <b>{ex.name}</b>
                  <span className="muted">
                    {ex.muscle_group ? `${ex.muscle_group} · ` : ''}
                    {summarizeExercise(ex)}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
        {(() => {
          const known = new Set(SECTIONS.map((s) => s.id));
          const other = (workout?.st_exercises || []).filter((e: any) => !known.has(exerciseSection(e)));
          if (!other.length) return null;
          return (
            <section className="te-plan-section">
              <h3>Other</h3>
              {other.map((ex: any) => (
                <div key={ex.id} className="te-plan-ex">
                  <b>{ex.name}</b>
                  <span className="muted">{summarizeExercise(ex)}</span>
                </div>
              ))}
            </section>
          );
        })()}

        <div className="actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn green" onClick={onStart} disabled={!hasExercises}>
            Start Workout
          </button>
          {canEdit && (
            <button type="button" className="btn secondary" onClick={onEdit}>
              Edit workout
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
