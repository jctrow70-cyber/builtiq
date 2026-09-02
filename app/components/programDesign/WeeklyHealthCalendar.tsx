'use client';

import { activityTypeShortLabel, formatDuration } from '../../../lib/programDesign/activityTypes';
import { dateForProgramDay, formatMediumDate, weekdayLabel } from '../../../lib/programDesign/cycle';
import { activitiesForDay } from '../../../lib/programDesign/programDesignApi';
import { WEEKDAY_LABELS, type ProgramActivity } from '../../../lib/programDesign/types';

type WeeklyHealthCalendarProps = {
  startMonday: string;
  weekNumber: number;
  activities: ProgramActivity[];
  onAddActivity: (dayOfWeek: number) => void;
  onOpenActivity: (activity: ProgramActivity) => void;
};

export default function WeeklyHealthCalendar({
  startMonday,
  weekNumber,
  activities,
  onAddActivity,
  onOpenActivity,
}: WeeklyHealthCalendarProps) {
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
