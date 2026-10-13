'use client';

import { useState } from 'react';
import DateInput from '../DateInput';
import { formatDisplayDate, todayYmd } from '../../../lib/training/programCalendar';

export type ScheduleActionWorkout = {
  date: string;
  title: string;
  workoutId: string | null;
  excused: boolean;
  hasSession: boolean;
};

type WorkoutScheduleActionsProps = {
  memberName: string;
  workout: ScheduleActionWorkout;
  canEdit: boolean;
  sameSchedule: ScheduleActionWorkout[];
  onClose: () => void;
  onMoveWorkout?: (input: { workoutId: string; originalDate: string; newDate: string }) => Promise<void>;
  onExcuseWorkout?: (input: { workoutId: string; originalDate: string }) => Promise<void>;
  onRestoreWorkout?: (input: { workoutId: string; originalDate: string }) => Promise<void>;
};

/** Phase 4 actions for one scheduled group workout. The shared program is not edited here. */
export default function WorkoutScheduleActions({
  memberName,
  workout,
  canEdit,
  sameSchedule,
  onClose,
  onMoveWorkout,
  onExcuseWorkout,
  onRestoreWorkout,
}: WorkoutScheduleActionsProps) {
  const [moveDate, setMoveDate] = useState(workout.date);
  const [confirmMove, setConfirmMove] = useState(false);
  const [confirmExcuse, setConfirmExcuse] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const today = todayYmd();
  const future = workout.date >= today && !workout.hasSession && !!workout.workoutId;

  return (
    <div className="member-schedule-editor">
      <p>
        <b>{workout.title}</b> · {formatDisplayDate(workout.date)}
      </p>
      <p className="muted">This workout only. Training days and the shared program stay the same.</p>
      {actionError && <p className="team-sheet-error">{actionError}</p>}
      <div className="actions member-training-actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          View Workout
        </button>
        {canEdit && onMoveWorkout && future && (
          <button type="button" className="btn secondary" onClick={() => setConfirmMove(true)}>
            Move Workout
          </button>
        )}
        {canEdit && onExcuseWorkout && future && !workout.excused && (
          <button type="button" className="btn secondary" onClick={() => setConfirmExcuse(true)}>
            Excuse Workout
          </button>
        )}
        {canEdit && onRestoreWorkout && workout.excused && workout.date >= today && workout.workoutId && (
          <button type="button" className="btn secondary" onClick={() => setConfirmRestore(true)}>
            Restore Workout
          </button>
        )}
      </div>
      {confirmMove && onMoveWorkout && workout.workoutId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setActionBusy(true);
            setActionError('');
            void onMoveWorkout({ workoutId: workout.workoutId as string, originalDate: workout.date, newDate: moveDate })
              .then(onClose)
              .catch((error: Error) => setActionError(error.message || 'Could not move that workout.'))
              .finally(() => setActionBusy(false));
          }}
        >
          <label>
            Move to
            <DateInput value={moveDate} onChange={setMoveDate} />
          </label>
          <p>
            {memberName} — {workout.title}
            <br />
            Originally: {formatDisplayDate(workout.date)}
            <br />
            Move to: {formatDisplayDate(moveDate)}
          </p>
          {sameSchedule
            .filter((item) => item.date === moveDate && item.title !== workout.title)
            .map((item) => (
              <p key={`${item.date}-${item.title}`} className="muted">
                Also on that day: {item.title}
              </p>
            ))}
          <button type="submit" className="btn green" disabled={actionBusy || moveDate < today}>
            {actionBusy ? 'Saving…' : 'Confirm move'}
          </button>
        </form>
      )}
      {confirmExcuse && onExcuseWorkout && workout.workoutId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setActionBusy(true);
            setActionError('');
            void onExcuseWorkout({ workoutId: workout.workoutId as string, originalDate: workout.date })
              .then(onClose)
              .catch((error: Error) => setActionError(error.message || 'Could not excuse that workout.'))
              .finally(() => setActionBusy(false));
          }}
        >
          <p>
            Excuse {workout.title} on {formatDisplayDate(workout.date)}. It leaves the adherence count and stays in history.
          </p>
          <button type="submit" className="btn green" disabled={actionBusy}>
            {actionBusy ? 'Saving…' : 'Confirm excuse'}
          </button>
        </form>
      )}
      {confirmRestore && onRestoreWorkout && workout.workoutId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setActionBusy(true);
            setActionError('');
            void onRestoreWorkout({ workoutId: workout.workoutId as string, originalDate: workout.date })
              .then(onClose)
              .catch((error: Error) => setActionError(error.message || 'Could not restore that workout.'))
              .finally(() => setActionBusy(false));
          }}
        >
          <p>
            Restore {workout.title} on {formatDisplayDate(workout.date)} to the expected schedule.
          </p>
          <button type="submit" className="btn green" disabled={actionBusy}>
            {actionBusy ? 'Saving…' : 'Confirm restore'}
          </button>
        </form>
      )}
    </div>
  );
}
