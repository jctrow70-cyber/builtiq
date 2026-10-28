'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import WorkoutTemplateEditor from '../training/WorkoutTemplateEditor';
import WorkoutPreview from './WorkoutPreview';
import { fetchAllExerciseCatalog } from '../../../lib/training/catalogFetch';
import { formatDuration } from '../../../lib/programDesign/activityTypes';
import { fetchProgramWorkoutTree } from '../../../lib/programDesign/programDesignApi';
import { workingExerciseCount, workoutFocusLabel, workoutPrimaryFocus } from '../../../lib/programDesign/workoutPreview';

export type WorkoutFocusMode = 'details' | 'edit';

type ProgramWorkoutPlanProps = {
  supabase: SupabaseClient;
  programId: string;
  week: number;
  canEdit: boolean;
  openWorkoutId?: string | null;
  openMode?: WorkoutFocusMode | null;
  hideList?: boolean;
  backLabel?: string;
  onModeChange?: (mode: WorkoutFocusMode) => void;
  onCloseFocus?: () => void;
  onLoaded?: (info: { hasExercises: boolean; workoutCount: number; workouts: any[] }) => void;
  detailContext?: {
    week: number;
    totalWeeks?: number;
    dayLabel?: string;
    durationMinutes?: number | null;
  };
};

export default function ProgramWorkoutPlan({
  supabase,
  programId,
  week,
  canEdit,
  openWorkoutId = null,
  openMode = null,
  hideList = false,
  backLabel,
  onModeChange,
  onCloseFocus,
  onLoaded,
  detailContext,
}: ProgramWorkoutPlanProps) {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [listFocusId, setListFocusId] = useState<string | null>(null);
  const [listFocusMode, setListFocusMode] = useState<WorkoutFocusMode | null>(null);

  async function reload(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setError('');
    const { data, error: loadError } = await fetchProgramWorkoutTree(supabase, programId);
    if (loadError) setError(loadError);
    setWorkouts(data);
    const exerciseCount = data.reduce((n, w) => n + (w.st_exercises || []).length, 0);
    onLoaded?.({ hasExercises: exerciseCount > 0, workoutCount: data.length, workouts: data });
    setLoading(false);
    return { error: loadError || null };
  }

  useEffect(() => {
    void reload();
  }, [programId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAllExerciseCatalog(supabase).then(({ data }) => {
      if (!cancelled) setCatalog(data || []);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (openWorkoutId) return;
    setListFocusId(null);
    setListFocusMode(null);
  }, [week, openWorkoutId]);

  const weekWorkouts = useMemo(
    () => workouts.filter((w) => Number(w.week) === week).sort((a, b) => (a.day_order || 0) - (b.day_order || 0)),
    [workouts, week]
  );
  const focusId = openWorkoutId || listFocusId;
  const focusMode = openWorkoutId ? openMode : listFocusMode;
  const focused = weekWorkouts.find((w) => w.id === focusId) || workouts.find((w) => w.id === focusId) || null;

  function closeFocus() {
    setListFocusId(null);
    setListFocusMode(null);
    onCloseFocus?.();
  }

  if (loading && !focused) return hideList ? null : <p className="muted">Loading workouts…</p>;
  if (error && !workouts.length) return <p className="pd-error">{error}</p>;

  if (focused && focusMode === 'edit') {
    return (
      <WorkoutTemplateEditor
        supabase={supabase}
        workout={focused}
        allWorkouts={workouts}
        canEdit={canEdit}
        onBack={closeFocus}
        backLabel={backLabel || '← Done'}
        onReload={() => reload({ silent: true })}
      />
    );
  }

  if (focused && focusMode === 'details') {
    const name = workoutFocusLabel(focused);
    const focus = workoutPrimaryFocus(focused);
    const working = workingExerciseCount(focused);
    const duration = formatDuration(detailContext?.durationMinutes);
    const day = detailContext?.dayLabel || focused.day_label;
    const weekLabel = detailContext?.week
      ? `Week ${detailContext.week}${detailContext.totalWeeks ? ` of ${detailContext.totalWeeks}` : ''}`
      : focused.day_label;
    const meta = [focus && focus !== name ? focus : null, duration, working ? `${working} working exercise${working === 1 ? '' : 's'}` : null, weekLabel, day]
      .filter(Boolean)
      .join(' · ');
    return (
      <article className="pd-detail">
        <header className="pd-detail-head">
          <div className="pd-detail-nav">
            <button type="button" className="pd-back" onClick={closeFocus}>
              Back
            </button>
            {canEdit && (
              <button
                type="button"
                className="btn small green"
                onClick={() => {
                  if (openWorkoutId) onModeChange?.('edit');
                  else setListFocusMode('edit');
                }}
              >
                Edit workout
              </button>
            )}
          </div>
          <h1>{name}</h1>
          <p className="muted">{meta}</p>
        </header>
        <WorkoutPreview workout={focused} catalog={catalog} />
      </article>
    );
  }

  if (hideList) return error ? <p className="pd-error">{error}</p> : null;
  if (!weekWorkouts.length) return <p className="muted">No workouts in week {week} yet.</p>;

  return (
    <div className="pd-workout-plan">
      {error && <p className="pd-error">{error}</p>}
      {weekWorkouts.map((workout) => {
        const count = workingExerciseCount(workout);
        return (
          <article key={workout.id} className="pd-workout-card">
            <div className="pd-workout-card-head">
              <div>
                <p className="pd-eyebrow">{workout.day_label}</p>
                <h3>{workoutFocusLabel(workout)}</h3>
                <p className="muted">
                  {count} working exercise{count === 1 ? '' : 's'}
                </p>
              </div>
              <div className="pd-day-summary-actions">
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => {
                    setListFocusId(workout.id);
                    setListFocusMode('details');
                  }}
                >
                  View details
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="btn small green"
                    onClick={() => {
                      setListFocusId(workout.id);
                      setListFocusMode('edit');
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
