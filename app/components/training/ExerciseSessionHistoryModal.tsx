'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatExerciseSessionTitle,
  type ExerciseSessionEntry,
} from '../../../lib/training/exerciseSessionHistory';
import {
  filterExerciseHistorySessions,
  historyEmptyMessage,
  historySetEquipmentKind,
  historySetEquipmentText,
  historySetTypeLabel,
  type HistoryEquipmentFilter,
} from '../../../lib/training/exerciseHistoryDisplay';

type ExerciseSessionHistoryModalProps = {
  exerciseName: string;
  dayLabel?: string;
  currentEquipment?: string | null;
  sessions: ExerciseSessionEntry[];
  onClose: () => void;
};

export default function ExerciseSessionHistoryModal({
  exerciseName,
  dayLabel,
  currentEquipment,
  sessions,
  onClose,
}: ExerciseSessionHistoryModalProps) {
  const [filter, setFilter] = useState<HistoryEquipmentFilter>('current');
  const visible = useMemo(
    () => filterExerciseHistorySessions(sessions, { mode: filter, currentEquipment }),
    [sessions, filter, currentEquipment]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
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

        <div className="exercise-history-filters" role="group" aria-label="History equipment filter">
          <button
            type="button"
            className={`log-chip${filter === 'current' ? ' active' : ''}`}
            aria-pressed={filter === 'current'}
            onClick={() => setFilter('current')}
          >
            Current equipment
          </button>
          <button
            type="button"
            className={`log-chip${filter === 'all' ? ' active' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All equipment
          </button>
        </div>

        {visible.length === 0 ? (
          <p className="muted exercise-history-empty">
            {historyEmptyMessage({ mode: filter, currentEquipment, allCount: sessions.length })}
          </p>
        ) : (
          <div className="exercise-history-list">
            {visible.map((session) => (
              <article key={session.sessionKey} className="exercise-history-session">
                <div className="exercise-history-session-head">
                  <h3>{formatExerciseSessionTitle(session)}</h3>
                  {session.workoutType && (
                    <span className="exercise-history-workout-type">{session.workoutType}</span>
                  )}
                </div>
                <ul className="exercise-history-set-list">
                  {session.sets.map((set, idx) => {
                    const kind = historySetEquipmentKind(set, currentEquipment);
                    return (
                      <li key={`${session.sessionKey}-${set.setNumber}-${set.setType}-${idx}`}>
                        <span className="exercise-history-set-label">{historySetTypeLabel(set)}</span>
                        <span className="exercise-history-set-value">{set.summary}</span>
                        <span className={`exercise-history-set-eq exercise-history-set-eq-${kind}`}>
                          {historySetEquipmentText(set)}
                        </span>
                        {set.completed && (
                          <span className="exercise-history-set-done" aria-label="Completed">
                            ✓
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
