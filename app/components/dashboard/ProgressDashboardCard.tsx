'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { loadDashboardProgress } from '../../../lib/progress/queries';
import type { DashboardProgressModel } from '../../../lib/progress/dashboardProgress';
import type { UnitsPreference } from '../../../lib/body/measurements';
import { todayYmd } from '../../../lib/training/programCalendar';

type ProgressDashboardCardProps = {
  userId: string;
  unitsPreference?: string | null;
  refreshKey?: number;
  onViewProgress: () => void;
  onOpenStrength: () => void;
  onOpenBody: () => void;
  onAddCheckIn: () => void;
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
  onAddCheckIn,
}: ProgressDashboardCardProps) {
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<CardState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadDashboardProgress(supabase, userId, todayYmd(), units)
      .then((model) => {
        if (!cancelled) setState({ status: 'ready', model });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, units, refreshKey, reloadKey]);

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
        <ProgressDashboardBody
          model={state.model}
          onViewProgress={onViewProgress}
          onOpenStrength={onOpenStrength}
          onOpenBody={onOpenBody}
          onAddCheckIn={onAddCheckIn}
        />
      )}
    </section>
  );
}

function ProgressDashboardBody({
  model,
  onViewProgress,
  onOpenStrength,
  onOpenBody,
  onAddCheckIn,
}: {
  model: DashboardProgressModel;
  onViewProgress: () => void;
  onOpenStrength: () => void;
  onOpenBody: () => void;
  onAddCheckIn: () => void;
}) {
  if (model.empty) {
    return (
      <div className="progress-dash-empty">
        <p className="muted">{model.emptyCopy}</p>
        <button type="button" className="btn secondary" onClick={onViewProgress}>View Progress</button>
        <button type="button" className="btn green" onClick={onAddCheckIn}>Add check-in</button>
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
      <div className="progress-dash-actions">
        <button type="button" className="btn secondary" onClick={onViewProgress}>View Progress</button>
        <button type="button" className="btn green" onClick={onAddCheckIn}>Add check-in</button>
      </div>
    </>
  );
}
