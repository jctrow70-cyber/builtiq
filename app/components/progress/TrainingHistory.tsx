'use client';

import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import { supabase } from '../../../lib/supabaseClient';
import { fetchTrainingHistoryPage, fetchWorkoutHistoryDay } from '../../../lib/progress/queries';
import { formatDisplayDate } from '../../../lib/training/programCalendar';
import {
  historyStatusLabel,
  workoutHistoryDetail,
  type WorkoutHistoryDetail,
  type WorkoutHistorySummary,
} from '../../../lib/training/workoutHistory';
import type { ExerciseProgressRequest } from '../../../lib/progress/exerciseProgress';

type TrainingHistoryProps = {
  userId: string;
  refreshKey?: number;
  onViewProgress: (request: ExerciseProgressRequest) => void;
};

export default function TrainingHistory({ userId, refreshKey = 0, onViewProgress }: TrainingHistoryProps) {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [items, setItems] = useState<WorkoutHistorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkoutHistoryDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setOpenId(null);
    setDetail(null);
    fetchTrainingHistoryPage(supabase, userId, page)
      .then((loaded) => {
        if (cancelled) return;
        setItems(loaded.items);
        setPageCount(loaded.pageCount);
        if (loaded.page !== page) setPage(loaded.page);
      })
      .catch(() => {
        if (!cancelled) setError('Training history could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey, userId]);

  async function toggle(summary: WorkoutHistorySummary) {
    if (openId === summary.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(summary.id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const dayRows = await fetchWorkoutHistoryDay(supabase, userId, summary.date);
      setDetail(workoutHistoryDetail(dayRows, summary.id, summary));
    } catch {
      setDetailError('This workout could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="progress-section-title">Training history</h2>
      <p className="muted">Open a workout to see the sets that were recorded.</p>
      {!items && !error && <p className="muted">Loading workouts…</p>}
      {error && <p className="progress-error">{error}</p>}
      {items && items.length === 0 && <p className="progress-lead">No workouts logged yet.</p>}
      {(items || []).map((summary) => (
        <article key={summary.id} className="training-history-block">
          <button type="button" className="training-history-row" aria-expanded={openId === summary.id} onClick={() => void toggle(summary)}>
            <span>
              <b>{formatDisplayDate(summary.date)} · {summary.workoutName}</b>
            </span>
            <span className="muted training-history-meta">{summary.exerciseCount} exercise{summary.exerciseCount === 1 ? '' : 's'} · {summary.workingSets} working set{summary.workingSets === 1 ? '' : 's'} · {historyStatusLabel(summary.status)}</span>
          </button>
          {openId === summary.id && (
            <div className="training-history-detail">
              {detailLoading && <p className="muted">Loading sets…</p>}
              {detailError && <p className="progress-error">{detailError}</p>}
              {detail && detail.exercises.length === 0 && <p className="muted">No sets were recorded for this workout.</p>}
              {detail && detail.exercises.map((exercise) => (
                <section key={exercise.key}>
                  <div className="progress-section-head">
                    <h3>{exercise.name}</h3>
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => onViewProgress({
                        catalogExerciseId: exercise.catalogExerciseId,
                        exerciseName: exercise.name,
                        equipment: exercise.equipment === 'Unspecified' ? '' : exercise.equipment,
                        variant: exercise.variant,
                        returnTo: 'progress',
                        returnSection: 'training',
                      })}
                    >
                      View Progress
                    </button>
                  </div>
                  <p className="muted">{exercise.variant ? `${exercise.equipment} · ${exercise.variant}` : exercise.equipment}</p>
                  <ul className="training-history-sets">
                    {exercise.sets.map((set) => (
                      <li key={set.id || `${exercise.key}-${set.setNumber}`}>
                        <span>{set.setType}{set.setNumber != null ? ` ${set.setNumber}` : ''}</span>
                        <span>{set.weight || '—'}{set.reps ? ` × ${set.reps}` : ''}</span>
                        {set.notes ? <span className="muted">{set.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </article>
      ))}
      {pageCount > 1 && (
        <div className="training-history-pager">
          <button type="button" className="btn small secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page} of {pageCount}</span>
          <button type="button" className="btn small secondary" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </Card>
  );
}
