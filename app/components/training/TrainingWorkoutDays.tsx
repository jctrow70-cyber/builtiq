'use client';

import { useEffect, useMemo, useState } from 'react';
import DateInput from '../DateInput';
import {
  dateForWeekAndDay,
  formatDisplayDate,
  resolveProgramStartDate,
  todayYmd,
} from '../../../lib/training/programCalendar';

type WorkoutDay = {
  id: string;
  day_label: string;
  workout_type: string;
  day_order?: number;
};

type TrainingWorkoutDaysProps = {
  program: any;
  week: number;
  workouts: WorkoutDay[];
  activeWorkoutId: string;
  logDate: string;
  onSelectWorkout: (workout: WorkoutDay) => void;
  onLogDateChange?: (ymd: string) => void;
  datesDisabled?: boolean;
};

export default function TrainingWorkoutDays({
  program,
  week,
  workouts,
  activeWorkoutId,
  logDate,
  onSelectWorkout,
  onLogDateChange,
  datesDisabled,
}: TrainingWorkoutDaysProps) {
  const start = resolveProgramStartDate(program);
  const sorted = useMemo(
    () => [...workouts].sort((a, b) => (a.day_order || 0) - (b.day_order || 0)),
    [workouts]
  );
  const workoutIdsKey = sorted.map((w) => w.id).join('|');

  const [dayDates, setDayDates] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const w of sorted) {
      next[w.id] = dateForWeekAndDay(start, week, w.day_label);
    }
    setDayDates(next);
  }, [program?.id, week, workoutIdsKey, start, sorted]);

  if (!sorted.length) return null;

  const today = todayYmd();

  return (
    <div className="training-workout-days" role="tablist" aria-label="Workout days this week">
      {sorted.map((w) => {
        const plannedYmd = dateForWeekAndDay(start, week, w.day_label);
        const dayYmd = dayDates[w.id] || plannedYmd;
        const isActive = w.id === activeWorkoutId;
        const isCalendarToday = plannedYmd === today;
        const isLoggingOnDay = dayYmd === logDate;
        const isCustom = dayYmd !== plannedYmd;

        return (
          <div
            key={w.id}
            className={`training-workout-day${isActive ? ' training-workout-day--active' : ''}${isCalendarToday ? ' training-workout-day--today' : ''}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              className="training-workout-day-main"
              onClick={() => onSelectWorkout(w)}
            >
              <span className="training-workout-day-label">
                {w.day_label} · {w.workout_type}
              </span>
              <span className="training-workout-day-meta">
                {isCalendarToday ? 'Planned for today' : `Planned ${formatDisplayDate(plannedYmd)}`}
                {isCustom ? ` · custom ${formatDisplayDate(dayYmd)}` : ''}
                {isLoggingOnDay ? ' · logging here' : ''}
              </span>
            </button>
            <div className="training-workout-day-date-controls">
              <label className="training-workout-day-date-label" htmlFor={`workout-day-date-${w.id}`}>
                Session date
              </label>
              <DateInput
                id={`workout-day-date-${w.id}`}
                className="training-workout-day-date-input"
                value={dayYmd}
                disabled={datesDisabled}
                aria-label={`Session date for ${w.day_label} ${w.workout_type}`}
                onChange={(ymd) => {
                  setDayDates((prev) => ({ ...prev, [w.id]: ymd }));
                }}
              />
              {onLogDateChange && (
                <button
                  type="button"
                  className="btn small secondary"
                  disabled={datesDisabled || dayYmd === logDate}
                  onClick={() => {
                    onLogDateChange(dayYmd);
                    if (!isActive) onSelectWorkout(w);
                  }}
                >
                  Use for logging
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
