'use client';

import { activityTypeShortLabel, formatDuration } from '../../../lib/programDesign/activityTypes';
import { dateForProgramDay, formatMediumDate, weekdayLabel } from '../../../lib/programDesign/cycle';
import { activitiesForDay } from '../../../lib/programDesign/programDesignApi';
import { programDayState } from '../../../lib/programDesign/programCalendarView';
import { WEEKDAY_LABELS, type ProgramActivity } from '../../../lib/programDesign/types';

type WeeklyHealthCalendarProps = {
  startMonday: string;
  weekNumber: number;
  activities: ProgramActivity[];
  variant?: 'strip' | 'stack';
  selectedDay?: number;
  onSelectDay?: (dayOfWeek: number) => void;
  onAddActivity: (dayOfWeek: number) => void;
  onOpenActivity: (activity: ProgramActivity) => void;
};

export default function WeeklyHealthCalendar({
  startMonday,
  weekNumber,
  activities,
  variant = 'strip',
  selectedDay = 0,
  onSelectDay,
  onAddActivity,
  onOpenActivity,
}: WeeklyHealthCalendarProps) {
  if (variant === 'strip') {
    return (
      <div className="pd-week-strip" role="list" aria-label="Weekly program calendar">
        {WEEKDAY_LABELS.map((label, dayOfWeek) => {
          const date = dateForProgramDay(startMonday, weekNumber, dayOfWeek);
          const dayActivities = activitiesForDay(activities, weekNumber, dayOfWeek);
          const state = programDayState(dayActivities);
          const selected = selectedDay === dayOfWeek;
          return (
            <button
              key={label}
              type="button"
              role="listitem"
              className={`pd-strip-day pd-strip-day--${state}${selected ? ' pd-strip-day--selected' : ''}`}
              onClick={() => onSelectDay?.(dayOfWeek)}
              aria-pressed={selected}
              aria-label={`${weekdayLabel(dayOfWeek)} ${formatMediumDate(date)}${state === 'rest' ? ', rest' : `, ${dayActivities.length} scheduled`}`}
            >
              <span className="pd-strip-dow">{label}</span>
              <span className="pd-strip-num">{Number(date.slice(8, 10))}</span>
              <span className="pd-strip-marks" aria-hidden="true">
                {state === 'rest' ? <i className="pd-strip-quiet" /> : dayActivities.slice(0, 3).map((activity) => (
                  <i key={activity.id} className={`te-dot te-dot--${activity.activity_type || 'strength'}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="pd-calendar" role="list" aria-label="Weekly health calendar">
      {WEEKDAY_LABELS.map((label, dayOfWeek) => {
        const date = dateForProgramDay(startMonday, weekNumber, dayOfWeek);
        const dayActivities = activitiesForDay(activities, weekNumber, dayOfWeek);
        return (
          <section key={label} className="pd-day" role="listitem">
            <header className="pd-day-head">
              <div>
                <p className="pd-day-name">{weekdayLabel(dayOfWeek)}</p>
                <p className="muted pd-day-date">{formatMediumDate(date)}</p>
              </div>
              <button type="button" className="pd-add-link" onClick={() => onAddActivity(dayOfWeek)}>
                + Add activity
              </button>
            </header>
            {dayActivities.length === 0 ? (
              <p className="pd-day-empty">No activities planned</p>
            ) : (
              <ul className="pd-activity-list">
                {dayActivities.map((activity) => (
                  <li key={activity.id}>
                    <button type="button" className="pd-activity-chip" onClick={() => onOpenActivity(activity)}>
                      <span className="pd-activity-type">{activityTypeShortLabel(activity.activity_type)}</span>
                      <span className="pd-activity-title">{activity.title || activityTypeShortLabel(activity.activity_type)}</span>
                      {formatDuration(activity.duration_minutes) && (
                        <span className="muted">{formatDuration(activity.duration_minutes)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
