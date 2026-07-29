'use client';

import { useState } from 'react';
import DateInput from '../DateInput';
import { resolveProgramStartDate, weekRangeLabel } from '../../../lib/training/programCalendar';

type TrainingWeekSelectorProps = {
  week: number;
  program: any;
  weeksFallback?: number;
  onWeekChange: (week: number) => void;
  logDate: string;
  onLogDateChange: (ymd: string) => void;
  disabled?: boolean;
};

export default function TrainingWeekSelector({
  week,
  program,
  weeksFallback = 6,
  onWeekChange,
  logDate,
  onLogDateChange,
  disabled,
}: TrainingWeekSelectorProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const total = program?.weeks || weeksFallback || 6;
  const start = program ? resolveProgramStartDate(program) : '';
  const rangeLabel = start ? weekRangeLabel(start, week) : '';

  return (
    <div className="training-week-block">
      <label className="training-week-select-wrap" htmlFor="training-week-select">
        <span className="training-week-label">Week {week}</span>
        {rangeLabel && <span className="training-week-range">{rangeLabel}</span>}
        <select
          id="training-week-select"
          className="training-week-select"
          value={week}
          onChange={(e) => onWeekChange(Number(e.target.value))}
          disabled={disabled}
          aria-label={`Training week ${week}`}
        >
          {Array.from({ length: total }, (_, i) => {
            const w = i + 1;
            const label = start ? `Week ${w} · ${weekRangeLabel(start, w)}` : `Week ${w}`;
            return (
              <option key={w} value={w}>
                {label}
              </option>
            );
          })}
        </select>
        <span className="training-week-chevron" aria-hidden="true">▾</span>
      </label>
      {!disabled && (
        <button
          type="button"
          className="training-log-date-toggle"
          aria-expanded={showDatePicker}
          onClick={() => setShowDatePicker((v) => !v)}
        >
          {showDatePicker ? 'Hide date' : 'Log a different day'}
        </button>
      )}
      {showDatePicker && !disabled && (
        <div className="training-log-date-picker">
          <label htmlFor="training-log-date-alt">Logging date</label>
          <DateInput id="training-log-date-alt" value={logDate} onChange={onLogDateChange} />
        </div>
      )}
    </div>
  );
}
