'use client';

import {
  WORKOUT_SECTIONS,
  exerciseSection,
  sectionExercises,
  summarizeExercise,
} from '../../../lib/programDesign/workoutPreview';

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
  const known = new Set(WORKOUT_SECTIONS.map((s) => s.id));
  const other = (workout?.st_exercises || []).filter((e: any) => !known.has(exerciseSection(e)));

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

        {WORKOUT_SECTIONS.map((sec) => {
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
        {other.length > 0 && (
          <section className="te-plan-section">
            <h3>Other</h3>
            {other.map((ex: any) => (
              <div key={ex.id} className="te-plan-ex">
                <b>{ex.name}</b>
                <span className="muted">{summarizeExercise(ex)}</span>
              </div>
            ))}
          </section>
        )}

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
