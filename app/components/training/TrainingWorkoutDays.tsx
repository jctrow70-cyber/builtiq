'use client';

import {
  dateForWeekAndDay,
  formatDisplayDate,
  resolveProgramStartDate,
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
};

export default function TrainingWorkoutDays({
  program,
  week,
  workouts,
  activeWorkoutId,
  logDate,
  onSelectWorkout,
}: TrainingWorkoutDaysProps) {
  if (!workouts.length) return null;

  const start = resolveProgramStartDate(program);
  const sorted = [...workouts].sort((a, b) => (a.day_order || 0) - (b.day_order || 0));

  return (
    <div className="training-workout-days" role="tablist" aria-label="Workout days this week">
      {sorted.map((w) => {
        const dayDate = formatDisplayDate(dateForWeekAndDay(start, week, w.day_label));
        const isActive = w.id === activeWorkoutId;
        const isToday = dayDate === formatDisplayDate(logDate);
        return (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`training-workout-day${isActive ? ' training-workout-day--active' : ''}${isToday ? ' training-workout-day--today' : ''}`}
            onClick={() => onSelectWorkout(w)}
          >
            <span className="training-workout-day-label">
              {w.day_label} · {w.workout_type}
            </span>
            <span className="training-workout-day-date">{dayDate}</span>
          </button>
        );
      })}
    </div>
  );
}
