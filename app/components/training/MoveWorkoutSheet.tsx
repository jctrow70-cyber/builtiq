'use client';

import { useState } from 'react';
import DateInput from '../DateInput';
import { addDaysYmd, mondayOfWeek } from '../../../lib/training/programCalendar';
import { formatLongWeekday, formatMediumDate } from '../../../lib/programDesign/cycle';
import { WEEKDAY_LABELS } from '../../../lib/programDesign/types';

type MoveWorkoutSheetProps = {
  title: string;
  fromDate: string;
  nativeDate?: string | null;
  busy?: boolean;
  onMove: (toDate: string) => Promise<void>;
  onReset?: () => Promise<void>;
  onClose: () => void;
};

export default function MoveWorkoutSheet({
  title,
  fromDate,
  nativeDate,
  busy,
  onMove,
  onReset,
  onClose,
}: MoveWorkoutSheetProps) {
  const [picked, setPicked] = useState(fromDate);
  const [error, setError] = useState('');
  const weekStart = mondayOfWeek(fromDate);
  const moved = !!(nativeDate && nativeDate !== fromDate);

  async function save(toDate: string) {
    if (!toDate || toDate === fromDate) {
      onClose();
      return;
    }
    setError('');
    try {
      await onMove(toDate);
    } catch (e: any) {
      setError(e?.message || 'Could not move this workout');
    }
  }

  async function reset() {
    if (!onReset) return;
    setError('');
    try {
      await onReset();
    } catch (e: any) {
      setError(e?.message || 'Could not restore the original day');
    }
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="pd-sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">Move this time</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <p className="muted">
          Currently on {formatLongWeekday(fromDate)} ({formatMediumDate(fromDate)}). This only changes your
          calendar — the group plan stays on its original days.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          This week
        </p>
        <div className="pd-weekday-row" role="group" aria-label="Move to a day this week">
          {WEEKDAY_LABELS.map((label, idx) => {
            const date = addDaysYmd(weekStart, idx);
            const current = date === fromDate;
            return (
              <button
                key={label}
                type="button"
                className={`pd-weekday-chip${current ? ' active' : ''}`}
                disabled={busy || current}
                onClick={() => void save(date)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <label className="muted" htmlFor="move-workout-date">
          Or pick another date
        </label>
        <DateInput id="move-workout-date" value={picked} onChange={setPicked} aria-label="Move to date" />
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn green" disabled={busy || picked === fromDate} onClick={() => void save(picked)}>
            {busy ? 'Moving…' : 'Move'}
          </button>
          {moved && onReset && (
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => void reset()}>
              Original day
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
