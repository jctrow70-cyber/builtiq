'use client';

import { useId } from 'react';
import { GROUP_WEEKDAY_LABELS, groupWeekdayIndex, type GroupRepeatDraft } from '../../../lib/groups/groupActivityRepeat';

type GroupActivityRepeatFieldsProps = {
  date: string;
  value: GroupRepeatDraft;
  onChange: (value: GroupRepeatDraft) => void;
};

export default function GroupActivityRepeatFields({ date, value, onChange }: GroupActivityRepeatFieldsProps) {
  const start = groupWeekdayIndex(date);
  const weekly = value.mode !== 'none';
  const groupName = useId();

  function setMode(mode: GroupRepeatDraft['mode']) {
    onChange({
      ...value,
      mode,
      weekdays: mode === 'none' ? [start] : Array.from(new Set([start, ...value.weekdays])),
    });
  }

  function toggleDay(day: number) {
    if (day === start) return;
    const weekdays = value.weekdays.includes(day)
      ? value.weekdays.filter((item) => item !== day)
      : [...value.weekdays, day];
    onChange({ ...value, weekdays: Array.from(new Set([start, ...weekdays])).sort((left, right) => left - right) });
  }

  return (
    <fieldset className="group-activity-repeat">
      <legend>Repeat</legend>
      <label className="remember-row">
        <input type="radio" name={groupName} checked={value.mode === 'none'} onChange={() => setMode('none')} />
        Does not repeat
      </label>
      <label className="remember-row">
        <input type="radio" name={groupName} checked={value.mode === 'week'} onChange={() => setMode('week')} />
        Every week
      </label>
      <label className="remember-row">
        <input type="radio" name={groupName} checked={value.mode === 'custom'} onChange={() => setMode('custom')} />
        Custom weekdays
      </label>
      {value.mode === 'week' && <p className="muted">Repeats every {GROUP_WEEKDAY_LABELS[start]}.</p>}
      {value.mode === 'custom' && (
        <div className="group-activity-weekdays" role="group" aria-label="Weekdays">
          {GROUP_WEEKDAY_LABELS.map((label, day) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={value.weekdays.includes(day)}
                disabled={day === start}
                onChange={() => toggleDay(day)}
              />
              {label}
            </label>
          ))}
        </div>
      )}
      {weekly && (
        <label>
          End date (optional)
          <input
            type="date"
            min={date}
            value={value.until || ''}
            onChange={(event) => onChange({ ...value, until: event.target.value || null })}
          />
        </label>
      )}
    </fieldset>
  );
}
