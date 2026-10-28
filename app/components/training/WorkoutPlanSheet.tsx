'use client';

import { useEffect, useRef } from 'react';
import { trainingWorkoutSummary } from '../../../lib/programDesign/workoutPreview';
import { previewDialogKeyCloses, previewDialogTabWrap } from '../../../lib/training/trainingPreview';
import WorkoutPreview from '../programDesign/WorkoutPreview';

const PREVIEW_FOCUSABLE =
  'a[href], button:not([disabled]), summary, textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type WorkoutPlanSheetProps = {
  workout: any | null;
  dateLabel: string;
  sourceName?: string | null;
  duration?: string | null;
  catalog?: any[];
  error?: string | null;
  completed?: boolean;
  canEdit?: boolean;
  onClose: () => void;
  onStart: () => void;
  onEdit: () => void;
};

export default function WorkoutPlanSheet({
  workout,
  dateLabel,
  sourceName = null,
  duration = null,
  catalog = [],
  error = null,
  completed = false,
  canEdit = false,
  onClose,
  onStart,
  onEdit,
}: WorkoutPlanSheetProps) {
  const summary = trainingWorkoutSummary({
    title: workout?.workout_type || workout?.day_label || 'Workout',
    workout,
    duration: duration || null,
    durationMinutes: workout?.estimated_duration_minutes,
    sourceName,
  });
  const hasExercises = (workout?.st_exercises || []).length > 0;
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusables = () =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(PREVIEW_FOCUSABLE)).filter(
            (el) => !el.hasAttribute('disabled')
          )
        : [];
    const first = focusables()[0];
    if (first) first.focus();
    else dialog?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (previewDialogKeyCloses(event.key)) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const items = focusables();
      const activeIndex = items.findIndex((el) => el === document.activeElement);
      const wrapTo = previewDialogTabWrap(event.key, event.shiftKey, activeIndex, items.length);
      if (wrapTo == null) return;
      event.preventDefault();
      items[wrapTo]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="pd-sheet card te-plan-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="te-plan-title"
        aria-describedby="te-plan-hint"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">{dateLabel}</p>
            <h2 id="te-plan-title">{summary.name}</h2>
            {summary.meta ? <p className="muted">{summary.meta}</p> : null}
          </div>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p id="te-plan-hint" className="muted">
          This is a preview. Start or Review still opens the logger.
        </p>

        {error ? (
          <p className="muted">{error}</p>
        ) : !workout ? (
          <p className="muted">This workout is unavailable.</p>
        ) : (
          <WorkoutPreview workout={workout} catalog={catalog} />
        )}

        <div className="actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn green" onClick={onStart} disabled={!hasExercises}>
            {completed ? 'Review' : 'Start Workout'}
          </button>
          {canEdit && (
            <button type="button" className="btn secondary" onClick={onEdit} disabled={!workout}>
              Edit workout
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
