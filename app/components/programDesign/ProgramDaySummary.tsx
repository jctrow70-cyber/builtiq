'use client';

import { activityTypeShortLabel, formatDuration } from '../../../lib/programDesign/activityTypes';
import { formatLongWeekday } from '../../../lib/programDesign/cycle';
import {
  dayDurationMinutes,
  previewExerciseNames,
  workingExerciseCount,
  workoutPrimaryFocus,
} from '../../../lib/programDesign/workoutPreview';
import { WEEKDAY_LABELS, type ProgramActivity } from '../../../lib/programDesign/types';

type ProgramDaySummaryProps = {
  date: string;
  activities: ProgramActivity[];
  workout: any | null;
  canEdit: boolean;
  onAddActivity: () => void;
  onOpenActivity: (activity: ProgramActivity) => void;
  onViewDetails: () => void;
  onEditWorkout: () => void;
  onMoveActivity?: (activity: ProgramActivity, dayOfWeek: number) => void;
};

export default function ProgramDaySummary({
  date,
  activities,
  workout,
  canEdit,
  onAddActivity,
  onOpenActivity,
  onViewDetails,
  onEditWorkout,
  onMoveActivity,
}: ProgramDaySummaryProps) {
  const actionable = activities.filter((activity) => activity.activity_type !== 'rest');
  const restOnly = activities.length > 0 && actionable.length === 0;
  const name = workout?.workout_type || actionable[0]?.title || 'Rest';
  const focus = workout ? workoutPrimaryFocus(workout) : '';
  const minutes = dayDurationMinutes(activities, workout);
  const working = workout ? workingExerciseCount(workout) : 0;
  const durationLabel = formatDuration(minutes);
  const preview = workout ? previewExerciseNames(workout, 3) : [];
  const showFocus = focus && focus !== name;

  return (
    <section className="pd-day-summary">
      <header className="pd-day-summary-head">
        <div>
          <p className="pd-eyebrow">{formatLongWeekday(date)}</p>
          <h2>{name}</h2>
          <p className="muted">
            {restOnly || (!actionable.length && !workout)
              ? 'Rest day'
              : [
                  showFocus ? focus : null,
                  durationLabel,
                  working ? `${working} working exercise${working === 1 ? '' : 's'}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Scheduled'}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn small secondary pd-add-compact" onClick={onAddActivity} aria-label="Add activity">
            + Add
          </button>
        )}
      </header>

      {activities.length > 0 && (
        <ul className="pd-activity-list">
          {activities.map((activity) => (
            <li key={activity.id} className="pd-activity-row">
              <button type="button" className="pd-activity-chip" onClick={() => onOpenActivity(activity)}>
                <span className="pd-activity-type">{activityTypeShortLabel(activity.activity_type)}</span>
                <span className="pd-activity-title">{activity.title || activityTypeShortLabel(activity.activity_type)}</span>
                {formatDuration(activity.duration_minutes) && (
                  <span className="muted">{formatDuration(activity.duration_minutes)}</span>
                )}
              </button>
              {canEdit && onMoveActivity && !String(activity.id).startsWith('legacy-') && (
                <select
                  aria-label={`Move ${activity.title || 'activity'}`}
                  className="pd-move-select"
                  value=""
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) onMoveActivity(activity, next);
                    event.target.value = '';
                  }}
                >
                  <option value="">Move</option>
                  {WEEKDAY_LABELS.map((label, dayOfWeek) => (
                    <option key={label} value={dayOfWeek}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}

      {workout ? (
        <>
          {preview.length > 0 && (
            <ul className="pd-summary-preview">
              {preview.map((exerciseName) => (
                <li key={exerciseName}>{exerciseName}</li>
              ))}
            </ul>
          )}
          <div className="pd-day-summary-actions">
            <button type="button" className="btn small secondary" onClick={onViewDetails}>
              View details
            </button>
            {canEdit && (
              <button type="button" className="btn small green" onClick={onEditWorkout}>
                Edit workout
              </button>
            )}
          </div>
        </>
      ) : (
        !actionable.length && (
          <p className="muted pd-day-empty">No workout scheduled. Rest stays quiet unless you add something.</p>
        )
      )}
    </section>
  );
}
