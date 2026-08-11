'use client';

import {
  formatExerciseSessionTitle,
  type ExerciseSessionEntry,
} from '../../../lib/training/exerciseSessionHistory';

type ExerciseSessionHistoryModalProps = {
  exerciseName: string;
  dayLabel?: string;
  sessions: ExerciseSessionEntry[];
  onClose: () => void;
};

export default function ExerciseSessionHistoryModal({
  exerciseName,
  dayLabel,
  sessions,
  onClose,
}: ExerciseSessionHistoryModalProps) {
  const subtitle = dayLabel
    ? `${dayLabel} · prior weeks in this plan`
    : 'Prior weeks in this plan';

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div
        className="exercise-history-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 id="exercise-history-title">Logged by week</h2>
            <p className="muted exercise-history-subtitle">
              {exerciseName} · {subtitle}
            </p>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="muted exercise-history-empty">
            No weekly logs for this exercise on this day yet.
          </p>
        ) : (
          <div className="exercise-history-list">
            {sessions.map((session) => (
              <article key={session.sessionKey} className="exercise-history-session">
                <div className="exercise-history-session-head">
                  <h3>{formatExerciseSessionTitle(session)}</h3>
                  {session.workoutType && (
                    <span className="exercise-history-workout-type">{session.workoutType}</span>
                  )}
                </div>
                <p className="exercise-history-session-summary">{session.sessionSummary}</p>
                <ul className="exercise-history-set-list">
                  {session.sets.map((set, idx) => (
                    <li key={`${session.sessionKey}-${set.setNumber}-${set.setType}-${idx}`}>
                      <span className="exercise-history-set-label">
                        {set.setType === 'working' ? `Set ${set.setNumber}` : set.setType}
                      </span>
                      <span className="exercise-history-set-value">{set.summary}</span>
                      {set.completed && (
                        <span className="exercise-history-set-done" aria-label="Completed">
                          ✓
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
