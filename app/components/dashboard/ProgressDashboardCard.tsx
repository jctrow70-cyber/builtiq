'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { loadDashboardProgress } from '../../../lib/progress/queries';
import type { DashboardProgressModel } from '../../../lib/progress/dashboardProgress';
import type { UnitsPreference } from '../../../lib/body/measurements';
import { beginScreenPaint, finishScreenPaint, readScreenCache, subscribeScreenSession, writeScreenCache } from '../../../lib/performance/screenSession';
import { todayYmd } from '../../../lib/training/programCalendar';

type ProgressDashboardCardProps = {
  userId: string;
  unitsPreference?: string | null;
  refreshKey?: number;
  onViewProgress: () => void;
  onOpenStrength: () => void;
  onOpenBody: () => void;
};

type CardState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; model: DashboardProgressModel };

export default function ProgressDashboardCard({
  userId,
  unitsPreference,
  refreshKey = 0,
  onViewProgress,
  onOpenStrength,
  onOpenBody,
}: ProgressDashboardCardProps) {
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';
  const today = todayYmd();
  const [reloadKey, setReloadKey] = useState(0);
  const [sessionTick, setSessionTick] = useState(0);
  const [state, setState] = useState<CardState>(() => {
    const cached = readScreenCache<DashboardProgressModel>(userId, 'dashboard', `progress|${units}`, today, {
      dateScoped: true,
      staleAreas: ['dashboard', 'progress'],
    });
    return cached ? { status: 'ready', model: cached.value } : { status: 'loading' };
  });
  useEffect(() => subscribeScreenSession(() => setSessionTick((value) => value + 1)), []);

  useEffect(() => {
    let cancelled = false;
    const paint = beginScreenPaint<DashboardProgressModel>('Dashboard', userId, 'dashboard', `progress|${units}`, today, {
      dateScoped: true,
      staleAreas: ['dashboard', 'progress'],
    });
    if (paint.cached) setState({ status: 'ready', model: paint.cached });
    else setState({ status: 'loading' });
    if (paint.cached && !paint.background) return;
    loadDashboardProgress(supabase, userId, today, units)
      .then((model) => {
        if (cancelled) return;
        writeScreenCache(userId, 'dashboard', `progress|${units}`, model, today);
        setState({ status: 'ready', model });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      })
      .finally(() => {
        if (!cancelled) finishScreenPaint('Dashboard', userId, ['dashboard'], !!paint.cached && paint.background);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, units, today, refreshKey, reloadKey, sessionTick]);

  return (
    <section className="dash-card progress-dash" data-progress-state={state.status} aria-labelledby="progress-dash-title">
      <div className="dash-card-head">
        <h2 id="progress-dash-title">
          <button type="button" className="progress-dash-title" onClick={onViewProgress}>Your Progress</button>
        </h2>
        <span className="badge">Last 4 weeks</span>
      </div>
      {state.status === 'loading' && <p className="muted">Loading your progress.</p>}
      {state.status === 'error' && (
        <div className="progress-dash-empty">
          <p className="muted">Your progress could not be loaded.</p>
          <button type="button" className="btn secondary" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
        </div>
      )}
      {state.status === 'ready' && (
        <ProgressDashboardBody model={state.model} onOpenStrength={onOpenStrength} onOpenBody={onOpenBody} />
      )}
    </section>
  );
}

function ProgressDashboardBody({
  model,
  onOpenStrength,
  onOpenBody,
}: {
  model: DashboardProgressModel;
  onOpenStrength: () => void;
  onOpenBody: () => void;
}) {
  if (model.empty) {
    return (
      <div className="progress-dash-empty">
        <p className="muted">{model.emptyCopy}</p>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="progress-dash-strength" onClick={onOpenStrength}>
        <span className="muted">{model.strengthLabel || 'Strength'}</span>
        {model.strengthValue ? <b>{model.strengthValue}</b> : <span>{model.strengthEmpty}</span>}
        {model.strengthContext && <span className="muted">{model.strengthContext}</span>}
      </button>
      {model.bodyLines.length > 0 ? (
        <div className="progress-dash-metrics">
          {model.bodyLines.map((line) => (
            <button type="button" className="progress-dash-metric" key={line.key} onClick={onOpenBody}>
              <span className="muted">{line.label}</span>
              <b>{line.valueText}</b>
              <span className="muted">{line.dateText}</span>
              {line.changeText && <span className="progress-dash-change">{line.changeText}</span>}
              {line.note && <span className="muted">{line.note}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted progress-dash-note">{model.bodyEmpty}</p>
      )}
      {model.achievements.length > 0 && (
        <div className="progress-dash-achievements">
          <p className="muted">Best this period</p>
          {model.achievements.map((item) => (
            <button type="button" className="progress-dash-achievement" key={item.key} onClick={onOpenStrength}>
              <b>{item.label}</b>
              <span className="muted">{item.detailText}</span>
              <span className="muted">{item.dateText}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
