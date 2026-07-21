'use client';

import { assignmentDisplayTitle, RECIPIENT_STATUS_LABELS, type AssignedWorkoutRow } from '../../../lib/groups';
import { formatDisplayDate } from '../../../lib/training/programCalendar';

type AssignedWorkoutsPanelProps = {
  assignments: AssignedWorkoutRow[];
  activeRecipientId?: string | null;
  onOpen: (row: AssignedWorkoutRow) => void;
  onCloseActive?: () => void;
  getWorkoutStatus?: (row: AssignedWorkoutRow) => string;
  statusLabel: (s: string) => string;
};

export default function AssignedWorkoutsPanel({
  assignments,
  activeRecipientId,
  onOpen,
  onCloseActive,
  getWorkoutStatus,
  statusLabel,
}: AssignedWorkoutsPanelProps) {
  const open = assignments.filter((a) => a.status === 'pending' || a.status === 'started');
  const recentDone = assignments.filter((a) => a.status === 'completed').slice(0, 3);

  if (!open.length && !recentDone.length) return null;

  return (
    <div className="card assigned-workouts-panel">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Assigned Workouts</h2>
        {activeRecipientId && onCloseActive && (
          <button type="button" className="btn small secondary" onClick={onCloseActive}>
            Back to personal program
          </button>
        )}
      </div>
      <p className="muted">Group workouts assigned by your owner or manager. Log them here — your personal program stays below.</p>

      {open.length === 0 && (
        <p className="muted" style={{ marginTop: 8 }}>
          No open assignments right now.
        </p>
      )}

      {open.map((row) => {
        const wa = row.st_workout_assignments;
        const groupName = wa?.st_teams?.name || 'Group';
        const logStatus = getWorkoutStatus?.(row) || row.status;
        const isActive = row.id === activeRecipientId;
        const btnLabel =
          logStatus === 'completed'
            ? 'View'
            : logStatus === 'in_progress' || row.status === 'started'
              ? 'Continue'
              : 'Start';

        return (
          <div key={row.id} className={`assigned-workout-row${isActive ? ' active' : ''}`}>
            <div className="assigned-workout-main">
              <b>{assignmentDisplayTitle(row)}</b>
              <span className="muted">
                {groupName} · {formatDisplayDate(wa.scheduled_date)}
                {wa.due_date ? ` · due ${formatDisplayDate(wa.due_date)}` : ''}
              </span>
              {wa.notes && <span className="muted assigned-workout-notes">{wa.notes}</span>}
            </div>
            <div className="assigned-workout-actions">
              <span className="badge">{statusLabel(logStatus)}</span>
              <span className="badge assigned-status-badge">{RECIPIENT_STATUS_LABELS[row.status]}</span>
              <button
                type="button"
                className={`btn small ${logStatus === 'completed' ? 'secondary' : 'green'}`}
                onClick={() => onOpen(row)}
              >
                {btnLabel}
              </button>
            </div>
          </div>
        );
      })}

      {recentDone.length > 0 && (
        <>
          <h3 style={{ marginTop: 14, fontSize: 13 }}>Recently completed</h3>
          {recentDone.map((row) => {
            const wa = row.st_workout_assignments;
            return (
              <div key={row.id} className="assigned-workout-row completed">
                <div className="assigned-workout-main">
                  <b>{assignmentDisplayTitle(row)}</b>
                  <span className="muted">
                    {wa?.st_teams?.name || 'Group'} · {formatDisplayDate(wa.scheduled_date)}
                  </span>
                </div>
                <span className="badge">Completed</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
