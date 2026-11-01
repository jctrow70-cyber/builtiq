'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { loadWeekAdherence, type WeekAdherenceLoad } from '../../../lib/progress/queries';
import {
  formatPastDayAdherence,
  WEEK_ADHERENCE_DAY_NOTE,
  WEEK_ADHERENCE_SCOPE_NOTE,
  weekAdherenceSummary,
  type WeekAdherenceSummary,
} from '../../../lib/progress/weekAdherence';
import { currentCalendarWeekBounds, formatDisplayDate, todayYmd } from '../../../lib/training/programCalendar';

type WeeklyAdherenceCardProps = {
  userId: string;
  onSelectDate: (date: string) => void;
};

type CardState = { status: 'loading' } | WeekAdherenceLoad;

const SECONDARY = [
  ['Partial', 'partial'],
  ['Skipped', 'skipped'],
  ['Missed', 'missed'],
  ['Due today', 'dueToday'],
  ['Upcoming', 'upcoming'],
] as const;

export default function WeeklyAdherenceCard({ userId, onSelectDate }: WeeklyAdherenceCardProps) {
  const today = todayYmd();
  const bounds = currentCalendarWeekBounds();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<CardState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadWeekAdherence(supabase, userId, bounds.monday, bounds.sunday).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, bounds.monday, bounds.sunday, reloadKey]);

  const summary = state.status === 'ready' ? weekAdherenceSummary(state.facts, today, bounds) : null;

  return (
    <section className="dash-card week-adherence" data-week-state={state.status} aria-labelledby="week-adherence-title">
      <div className="dash-card-head">
        <h2 id="week-adherence-title">This week</h2>
        <span className="badge">
          {formatDisplayDate(bounds.monday)}–{formatDisplayDate(bounds.sunday)}
        </span>
      </div>
      {state.status === 'loading' && <p className="muted">Loading this week…</p>}
      {state.status === 'pending' && (
        <p className="muted">Apply the unified training schedule migration to show assigned training for this week.</p>
      )}
      {state.status === 'error' && (
        <div className="week-adherence-empty">
          <p className="muted">This week could not be loaded.</p>
          <button type="button" className="btn secondary" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      )}
      {summary && <WeekAdherenceBody summary={summary} onSelectDate={onSelectDate} />}
    </section>
  );
}

function WeekAdherenceBody({
  summary,
  onSelectDate,
}: {
  summary: WeekAdherenceSummary;
  onSelectDate: (date: string) => void;
}) {
  const rate = formatPastDayAdherence(summary.pastDayAdherence);
  const emptyCopy =
    summary.scheduled === 0 && summary.excused > 0
      ? 'Excused sessions are left out of this week.'
      : summary.scheduled === 0
        ? 'No sessions scheduled this week.'
        : null;
  return (
    <>
      <p className="muted week-adherence-note">{WEEK_ADHERENCE_SCOPE_NOTE}</p>
      {emptyCopy && <p className="week-adherence-empty-copy">{emptyCopy}</p>}
      <div className="week-adherence-layout">
        <div>
          <div className="week-adherence-primary">
            <div>
              <b>{summary.scheduled}</b>
              <span className="muted">Scheduled</span>
            </div>
            <div>
              <b>{summary.completed}</b>
              <span className="muted">Completed</span>
            </div>
          </div>
          <div className="week-adherence-secondary">
            {SECONDARY.map(([label, key]) => (
              <span key={key}>
                <b>{summary[key]}</b> {label}
              </span>
            ))}
          </div>
          {rate && (
            <p className="week-adherence-rate">
              <span className="muted">Past-day adherence</span> {rate}
            </p>
          )}
        </div>
        <div className="week-adherence-days" role="group" aria-label="Assigned obligations by day">
          {summary.days.map((day) => (
            <button
              key={day.date}
              type="button"
              className="week-adherence-day"
              data-when={day.when}
              data-tone={day.tone}
              aria-current={day.when === 'today' ? 'date' : undefined}
              aria-label={`${day.name} ${formatDisplayDate(day.date)}, ${day.obligations} assigned. Opens Training for this date.`}
              title={WEEK_ADHERENCE_DAY_NOTE}
              onClick={() => onSelectDate(day.date)}
            >
              <span className="week-adherence-day-letter">{day.letter}</span>
              <span className="week-adherence-day-count">{day.obligations}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="muted week-adherence-note">{WEEK_ADHERENCE_DAY_NOTE}</p>
    </>
  );
}
