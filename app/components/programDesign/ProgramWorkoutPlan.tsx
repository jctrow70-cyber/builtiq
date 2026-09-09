'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import WorkoutTemplateEditor from '../training/WorkoutTemplateEditor';
import { fetchProgramWorkoutTree } from '../../../lib/programDesign/programDesignApi';
import {
  WORKOUT_SECTIONS,
  exerciseSection,
  sectionExercises,
  summarizeExercise,
} from '../../../lib/programDesign/workoutPreview';

type ProgramWorkoutPlanProps = {
  supabase: SupabaseClient;
  programId: string;
  week: number;
  canEdit: boolean;
  openWorkoutId?: string | null;
  onOpenHandled?: () => void;
  onLoaded?: (info: { hasExercises: boolean; workoutCount: number }) => void;
};

export default function ProgramWorkoutPlan({
  supabase,
  programId,
  week,
  canEdit,
  openWorkoutId = null,
  onOpenHandled,
  onLoaded,
}: ProgramWorkoutPlanProps) {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setError('');
    const { data, error: loadError } = await fetchProgramWorkoutTree(supabase, programId);
    if (loadError) setError(loadError);
    setWorkouts(data);
    const exerciseCount = data.reduce((n, w) => n + ((w.st_exercises || []).length), 0);
    onLoaded?.({ hasExercises: exerciseCount > 0, workoutCount: data.length });
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [programId]);

  useEffect(() => {
    setEditingId(null);
  }, [week]);

  useEffect(() => {
    if (!openWorkoutId) return;
    const match = workouts.find((w) => w.id === openWorkoutId);
    if (match) {
      setEditingId(openWorkoutId);
      onOpenHandled?.();
    }
  }, [openWorkoutId, workouts]);

  const weekWorkouts = useMemo(
    () => workouts.filter((w) => Number(w.week) === week).sort((a, b) => (a.day_order || 0) - (b.day_order || 0)),
    [workouts, week]
  );
  const editing = weekWorkouts.find((w) => w.id === editingId) || workouts.find((w) => w.id === editingId) || null;

  if (loading && !editing) return <p className="muted">Loading workouts…</p>;
  if (error && !workouts.length) return <p className="pd-error">{error}</p>;
  if (!weekWorkouts.length && !editing) {
    return <p className="muted">No workouts in week {week} yet.</p>;
  }

  if (editing) {
    return (
      <WorkoutTemplateEditor
        supabase={supabase}
        workout={editing}
        allWorkouts={workouts}
        canEdit={canEdit}
        onBack={() => setEditingId(null)}
        onReload={() => reload({ silent: true })}
      />
    );
  }

  return (
    <div className="pd-workout-plan">
      {error && <p className="pd-error">{error}</p>}
      {weekWorkouts.map((workout) => {
        const count = (workout.st_exercises || []).length;
        return (
          <article key={workout.id} className="pd-workout-card">
            <div className="pd-workout-card-head">
              <div>
                <p className="pd-eyebrow">{workout.day_label}</p>
                <h3>{workout.workout_type || 'Workout'}</h3>
                <p className="muted">
                  {count} exercise{count === 1 ? '' : 's'}
                </p>
              </div>
              <button type="button" className="btn small secondary" onClick={() => setEditingId(workout.id)}>
                {canEdit ? 'View / edit' : 'View'}
              </button>
            </div>
            <WorkoutPreview workout={workout} />
          </article>
        );
      })}
    </div>
  );
}

function WorkoutPreview({ workout }: { workout: any }) {
  const sections = WORKOUT_SECTIONS.map((sec) => ({
    ...sec,
    list: sectionExercises(workout, sec.id),
  })).filter((sec) => sec.list.length);
  const known = new Set(WORKOUT_SECTIONS.map((s) => s.id));
  const other = (workout?.st_exercises || []).filter((e: any) => !known.has(exerciseSection(e)));
  if (other.length) sections.push({ id: 'other', label: 'Other', list: other });
  if (!sections.length) return <p className="muted">No exercises on this day yet.</p>;
  return (
    <div className="pd-workout-body">
      {sections.map((sec) => (
        <section key={sec.id} className="te-plan-section">
          <h3>{sec.label}</h3>
          {sec.list.map((ex: any) => (
            <div key={ex.id} className="te-plan-ex">
              <b>{ex.name}</b>
              <span className="muted">
                {ex.muscle_group ? `${ex.muscle_group} · ` : ''}
                {summarizeExercise(ex)}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
