'use client';

import SegmentedControl from '../ui/SegmentedControl';
import SectionHeader from '../ui/SectionHeader';
import { formatLongWeekday, formatMediumDate } from '../../../lib/programDesign/cycle';
import type { TrainingDayPlan } from '../../../lib/programDesign/trainingSchedule';

type TrainingExecutionProps = {
  programName: string | null;
  followedFromGroup?: string | null;
  today: TrainingDayPlan | null;
  tomorrow: TrainingDayPlan | null;
  weekDays: TrainingDayPlan[];
  weekNumber: number;
  totalWeeks: number;
  calendarView: 'day' | 'week';
  onCalendarViewChange: (view: 'day' | 'week') => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onSelectDay: (date: string) => void;
  onStartWorkout: (workoutId: string | null, date: string) => void;
  onOpenPrograms: () => void;
  completedDates?: string[];
};

function DayItems({
  plan,
  completed,
  onStart,
}: {
  plan: TrainingDayPlan;
  completed: boolean;
  onStart: (workoutId: string | null) => void;
}) {
  if (!plan.items.length) {
    return <p className="muted">No activities planned.</p>;
  }
  return (
    <div className="te-day-items">
      {plan.items.map((item, idx) => (
        <div key={item.id} className="te-item">
          <div>
            <span className="te-item-type">{item.typeLabel}</span>
            <b>{item.title}</b>
            {item.duration && <span className="muted">{item.duration}</span>}
            {completed && idx === 0 && <span className="ui-badge">Done</span>}
          </div>
          {!item.isRest && (
            <button type="button" className={`btn ${idx === 0 ? 'green' : 'secondary'} small`} onClick={() => onStart(item.workoutId)}>
              {idx === 0 ? 'Start Workout' : 'Open'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TrainingExecution({
  programName,
  followedFromGroup,
  today,
  tomorrow,
  weekDays,
  weekNumber,
  totalWeeks,
  calendarView,
  onCalendarViewChange,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onSelectDay,
  onStartWorkout,
  onOpenPrograms,
  completedDates = [],
}: TrainingExecutionProps) {
  return (
    <div className="te-screen">
      <SectionHeader
        title="Today"
        subtitle={today ? formatLongWeekday(today.date) : 'Choose a program to follow'}
        actions={
          <button type="button" className="btn small secondary" onClick={onOpenPrograms}>
            My programs
          </button>
        }
      />

      {programName && (
        <p className="te-following muted">
          Following <b>{programName}</b>
          {followedFromGroup ? ` · from ${followedFromGroup}` : ''}
        </p>
      )}

      <SegmentedControl
        ariaLabel="Training calendar"
        value={calendarView}
        onChange={(v) => onCalendarViewChange(v as 'day' | 'week')}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
        size="sm"
      />

      {!programName && (
        <div className="te-empty">
          <p>No program selected yet.</p>
          <button type="button" className="btn green" onClick={onOpenPrograms}>
            Choose a program to follow
          </button>
        </div>
      )}

      {programName && calendarView === 'day' && today && (
        <>
          <section className="te-block">
            <h2>Today&apos;s plan</h2>
            <DayItems
              plan={today}
              completed={completedDates.includes(today.date)}
              onStart={(workoutId) => onStartWorkout(workoutId, today.date)}
            />
          </section>
          {today.later.length > 0 && (
            <section className="te-block">
              <h2>Later today</h2>
              {today.later.map((item) => (
                <p key={item.id} className="te-later">
                  <b>{item.title}</b>
                  {item.duration ? ` · ${item.duration}` : ''}
                </p>
              ))}
            </section>
          )}
          {tomorrow && (
            <section className="te-block te-tomorrow">
              <h2>Tomorrow</h2>
              <p>
                {tomorrow.primary ? (
                  <>
                    <b>{tomorrow.primary.title}</b>
                    {tomorrow.primary.duration ? ` · ${tomorrow.primary.duration}` : ''}
                  </>
                ) : (
                  <span className="muted">Rest or unscheduled</span>
                )}
              </p>
            </section>
          )}
        </>
      )}

      {programName && calendarView === 'week' && (
        <>
          <div className="te-week-nav">
            <button type="button" className="btn small secondary" onClick={onPrevWeek} disabled={weekNumber <= 1}>
              Previous
            </button>
            <button type="button" className="btn small secondary" onClick={onThisWeek}>
              This week
            </button>
            <button type="button" className="btn small secondary" onClick={onNextWeek} disabled={weekNumber >= totalWeeks}>
              Next
            </button>
          </div>
          <p className="te-week-label">Week {weekNumber} of {totalWeeks}</p>
          <div className="te-week-grid">
            {weekDays.map((day) => {
              const done = completedDates.includes(day.date);
              return (
                <button
                  key={day.date}
                  type="button"
                  className={`te-week-day${day.isToday ? ' te-week-day--today' : ''}${done ? ' te-week-day--done' : ''}`}
                  onClick={() => onSelectDay(day.date)}
                >
                  <span className="te-week-dow">{day.dayLabel}</span>
                  <span className="muted">{formatMediumDate(day.date)}</span>
                  <b>{day.primary ? day.primary.title : '—'}</b>
                  <span className="te-week-meta">
                    {day.isToday ? 'Today' : done ? '✓' : day.primary?.typeLabel || ''}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
