'use client';

import SegmentedControl from '../ui/SegmentedControl';
import SectionHeader from '../ui/SectionHeader';
import { formatLongWeekday, formatMediumDate } from '../../../lib/programDesign/cycle';
import type { TrainingDayPlan, TrainingMonthCell } from '../../../lib/programDesign/trainingSchedule';

type CalendarView = 'day' | 'week' | 'month';

type TrainingExecutionProps = {
  programName: string | null;
  followedFromGroup?: string | null;
  today: TrainingDayPlan | null;
  tomorrow: TrainingDayPlan | null;
  weekDays: TrainingDayPlan[];
  monthCells: TrainingMonthCell[];
  monthLabel: string;
  selectedDate: string;
  weekNumber: number;
  totalWeeks: number;
  calendarView: CalendarView;
  onCalendarViewChange: (view: CalendarView) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onThisMonth: () => void;
  onSelectDay: (date: string) => void;
  onStartWorkout: (workoutId: string | null, date: string) => void;
  onViewWorkout?: (workoutId: string, date: string) => void;
  onOpenPrograms: () => void;
  onAddActivity?: (date: string) => void;
  onDeleteActivity?: (activityId: string) => void;
  completedDates?: string[];
};

const MONTH_DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DayItems({
  plan,
  completed,
  onStart,
  onView,
  onDelete,
}: {
  plan: TrainingDayPlan;
  completed: boolean;
  onStart: (workoutId: string | null) => void;
  onView?: (workoutId: string) => void;
  onDelete?: (activityId: string) => void;
}) {
  if (!plan.items.length) {
    return <p className="muted">No activities on this day. Add one anytime.</p>;
  }
  return (
    <div className="te-day-items">
      {plan.items.map((item, idx) => (
        <div key={item.id} className="te-item">
          <div>
            <span className="te-item-type">{item.typeLabel}</span>
            <button
              type="button"
              className="te-item-title"
              disabled={!item.workoutId || !onView}
              onClick={() => item.workoutId && onView?.(item.workoutId)}
            >
              <b>{item.title}</b>
            </button>
            {item.duration && <span className="muted">{item.duration}</span>}
            {completed && idx === 0 && <span className="ui-badge">Done</span>}
          </div>
          <div className="actions">
            {!item.isRest && item.workoutId && onView && (
              <button type="button" className="btn small secondary" onClick={() => onView(item.workoutId!)}>
                View
              </button>
            )}
            {!item.isRest && item.workoutId && (
              <button type="button" className={`btn ${idx === 0 ? 'green' : 'secondary'} small`} onClick={() => onStart(item.workoutId)}>
                Start
              </button>
            )}
            {item.source === 'calendar' && item.activityId && onDelete && (
              <button type="button" className="btn small secondary" onClick={() => onDelete(item.activityId!)}>
                Remove
              </button>
            )}
          </div>
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
  monthCells,
  monthLabel,
  selectedDate,
  weekNumber,
  totalWeeks,
  calendarView,
  onCalendarViewChange,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onPrevMonth,
  onNextMonth,
  onThisMonth,
  onSelectDay,
  onStartWorkout,
  onViewWorkout,
  onOpenPrograms,
  onAddActivity,
  onDeleteActivity,
  completedDates = [],
}: TrainingExecutionProps) {
  const viewingToday = !!today?.isToday;
  return (
    <div className="te-screen">
      <SectionHeader
        title={viewingToday ? 'Today' : today ? 'This day' : 'Training'}
        subtitle={today ? formatLongWeekday(today.date) : 'Your calendar'}
        actions={
          <div className="actions">
            {onAddActivity && today && (
              <button type="button" className="btn small green" onClick={() => onAddActivity(today.date)}>
                Add activity
              </button>
            )}
            <button type="button" className="btn small secondary" onClick={onOpenPrograms}>
              My programs
            </button>
          </div>
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
        onChange={(v) => onCalendarViewChange(v as CalendarView)}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Calendar' },
        ]}
        size="sm"
      />

      {!programName && (
        <p className="muted te-following">
          No program on this calendar yet. Add activities here, or create a program with start and end dates.
        </p>
      )}

      {calendarView === 'day' && today && (
        <>
          <section className="te-block">
            <h2>{viewingToday ? "Today's plan" : "This day's plan"}</h2>
            <DayItems
              plan={today}
              completed={completedDates.includes(today.date)}
              onStart={(workoutId) => onStartWorkout(workoutId, today.date)}
              onView={onViewWorkout ? (workoutId) => onViewWorkout(workoutId, today.date) : undefined}
              onDelete={onDeleteActivity}
            />
          </section>
          {today.later.length > 0 && (
            <section className="te-block">
              <h2>Later today</h2>
              {today.later.map((item) => (
                <div key={item.id} className="te-later">
                  <p>
                    <b>{item.title}</b>
                    {item.duration ? ` · ${item.duration}` : ''}
                  </p>
                  {item.workoutId && onViewWorkout && (
                    <button type="button" className="btn small secondary" onClick={() => onViewWorkout(item.workoutId!, today.date)}>
                      View
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          {tomorrow && (
            <section className="te-block te-tomorrow">
              <h2>{viewingToday ? 'Tomorrow' : 'Next day'}</h2>
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

      {calendarView === 'week' && (
        <>
          <div className="te-week-nav">
            <button type="button" className="btn small secondary" onClick={onPrevWeek}>
              Previous
            </button>
            <button type="button" className="btn small secondary" onClick={onThisWeek}>
              This week
            </button>
            <button type="button" className="btn small secondary" onClick={onNextWeek}>
              Next
            </button>
          </div>
          <p className="te-week-label">
            {weekDays[0] ? formatMediumDate(weekDays[0].date) : ''}
            {weekDays[6] ? ` – ${formatMediumDate(weekDays[6].date)}` : ''}
            {programName ? ` · Program week ${weekNumber} of ${totalWeeks}` : ''}
          </p>
          <div className="te-week-grid">
            {weekDays.map((day) => {
              const done = completedDates.includes(day.date);
              return (
                <button
                  key={day.date}
                  type="button"
                  className={`te-week-day${day.isToday ? ' te-week-day--today' : ''}${done ? ' te-week-day--done' : ''}${day.date === selectedDate ? ' te-week-day--selected' : ''}`}
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
          {today && (
            <section className="te-block">
              <h2>{today.isToday ? "Today's plan" : formatLongWeekday(today.date)}</h2>
              <DayItems
                plan={today}
                completed={completedDates.includes(today.date)}
                onStart={(workoutId) => onStartWorkout(workoutId, today.date)}
                onView={onViewWorkout ? (workoutId) => onViewWorkout(workoutId, today.date) : undefined}
                onDelete={onDeleteActivity}
              />
            </section>
          )}
        </>
      )}

      {calendarView === 'month' && (
        <>
          <div className="te-week-nav">
            <button type="button" className="btn small secondary" onClick={onPrevMonth}>
              Previous
            </button>
            <button type="button" className="btn small secondary" onClick={onThisMonth}>
              This month
            </button>
            <button type="button" className="btn small secondary" onClick={onNextMonth}>
              Next
            </button>
          </div>
          <p className="te-week-label">{monthLabel}</p>
          <div className="te-month" role="grid" aria-label={`${monthLabel} training calendar`}>
            <div className="te-month-dows">
              {MONTH_DOWS.map((dow) => (
                <span key={dow}>{dow}</span>
              ))}
            </div>
            <div className="te-month-grid">
              {monthCells.map((cell) => {
                const done = completedDates.includes(cell.date);
                const items = cell.plan?.items || [];
                return (
                  <button
                    key={cell.date}
                    type="button"
                    className={[
                      'te-month-cell',
                      !cell.inMonth ? 'te-month-cell--out' : '',
                      !cell.inProgram ? 'te-month-cell--off' : '',
                      cell.plan?.isToday ? 'te-month-cell--today' : '',
                      cell.date === selectedDate ? 'te-month-cell--selected' : '',
                      done ? 'te-month-cell--done' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onSelectDay(cell.date)}
                    aria-label={cell.plan?.primary ? `${cell.date} ${cell.plan.primary.title}` : cell.date}
                  >
                    <span className="te-month-num">{Number(cell.date.slice(8, 10))}</span>
                    <span className="te-month-dots" aria-hidden="true">
                      {items.slice(0, 3).map((item) => (
                        <i key={item.id} className={`te-dot te-dot--${item.activityType || 'strength'}`} />
                      ))}
                    </span>
                    {cell.plan?.primary && <span className="te-month-title">{cell.plan.primary.title}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {today && (
            <section className="te-block">
              <h2>{today.isToday ? "Today's plan" : formatLongWeekday(today.date)}</h2>
              <DayItems
                plan={today}
                completed={completedDates.includes(today.date)}
                onStart={(workoutId) => onStartWorkout(workoutId, today.date)}
                onView={onViewWorkout ? (workoutId) => onViewWorkout(workoutId, today.date) : undefined}
                onDelete={onDeleteActivity}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
