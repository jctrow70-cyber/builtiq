'use client';

import { useEffect, useState } from 'react';
import { fetchNutritionDaySummary } from '../../../lib/nutrition/nutritionDaySummary';
import {
  dashboardNutritionModel,
  dashboardTargetsFromGoalRow,
  type DashboardNutritionModel,
} from '../../../lib/nutrition/dashboardNutrition';
import { macroRingArc, macroRingStatus } from '../../../lib/nutrition/macroRing';
import { beginScreenPaint, finishScreenPaint, readScreenCache, subscribeScreenSession, writeScreenCache } from '../../../lib/performance/screenSession';
import { todayYmd } from '../../../lib/training/programCalendar';

type NutritionDashboardCardProps = {
  userId: string;
  onViewLog: () => void;
  onSetGoals: () => void;
};

type CardState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; model: DashboardNutritionModel };

const RING_SIZE = 72;
const RING_STROKE = 8;

export default function NutritionDashboardCard({ userId, onViewLog, onSetGoals }: NutritionDashboardCardProps) {
  const today = todayYmd();
  const [reloadKey, setReloadKey] = useState(0);
  const [sessionTick, setSessionTick] = useState(0);
  const [state, setState] = useState<CardState>(() => {
    const cached = readScreenCache<DashboardNutritionModel>(userId, 'dashboard', `nutrition|${today}`, today, {
      dateScoped: true,
      staleAreas: ['dashboard', 'nutrition'],
    });
    return cached ? { status: 'ready', model: cached.value } : { status: 'loading' };
  });
  useEffect(() => subscribeScreenSession(() => setSessionTick((value) => value + 1)), []);

  useEffect(() => {
    let cancelled = false;
    const paint = beginScreenPaint<DashboardNutritionModel>('Dashboard', userId, 'dashboard', `nutrition|${today}`, today, {
      dateScoped: true,
      staleAreas: ['dashboard', 'nutrition'],
    });
    if (paint.cached) setState({ status: 'ready', model: paint.cached });
    else setState({ status: 'loading' });
    if (paint.cached && !paint.background) return;
    fetchNutritionDaySummary(userId, today)
      .then((summary) => {
        if (cancelled) return;
        const model = dashboardNutritionModel(summary.totals, summary.entryCount, dashboardTargetsFromGoalRow(summary.goalRow));
        writeScreenCache(userId, 'dashboard', `nutrition|${today}`, model, today);
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
  }, [userId, today, reloadKey, sessionTick]);

  return (
    <section className="dash-card nutrition-dash" data-nutrition-state={state.status} aria-labelledby="nutrition-dash-title">
      <div className="dash-card-head">
        <h2 id="nutrition-dash-title">Nutrition</h2>
      </div>
      {state.status === 'loading' && <p className="muted">Loading today’s nutrition.</p>}
      {state.status === 'error' && (
        <div className="nutrition-dash-empty">
          <p className="muted">Today’s nutrition could not be loaded.</p>
          <button type="button" className="btn secondary" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <NutritionDashboardBody model={state.model} onViewLog={onViewLog} onSetGoals={onSetGoals} />
      )}
    </section>
  );
}

function NutritionDashboardBody({
  model,
  onViewLog,
  onSetGoals,
}: {
  model: DashboardNutritionModel;
  onViewLog: () => void;
  onSetGoals: () => void;
}) {
  return (
    <>
      {model.noMeals && <p className="nutrition-dash-status">No meals logged today.</p>}
      {model.zeroCalorieLog && <p className="nutrition-dash-status">Logged today.</p>}
      <div className="nutrition-dash-calorie">
        {model.calorieTarget != null && model.calorieRatio != null && model.calorieStatus && (
          <CalorieRing actual={model.calorieActual} target={model.calorieTarget} />
        )}
        <div>
          <b className="nutrition-dash-calories">{model.caloriesText}</b>
          <span className="muted">Calories</span>
          {model.calorieTargetText && <p className="nutrition-dash-target">of {model.calorieTargetText}</p>}
          {model.calorieRemainingText && (
            <p className={`nutrition-dash-remaining nutrition-dash-remaining--${model.calorieStatus}`}>{model.calorieRemainingText}</p>
          )}
        </div>
      </div>
      <div className="nutrition-dash-macros">
        {model.macros.map((macro) => (
          <div key={macro.key} className="nutrition-dash-macro">
            <div className="nutrition-dash-macro-head">
              <span>{macro.label}</span>
              <span>{macro.detailText}</span>
            </div>
            {macro.ratio != null && macro.status && (
              <div className="nutrition-progress-track" aria-hidden="true">
                <div
                  className={`nutrition-progress-fill nutrition-dash-fill nutrition-dash-fill--${macro.status}`}
                  style={{ width: `${macro.ratio * 100}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="nutrition-dash-actions">
        <button type="button" className="btn secondary" onClick={onViewLog}>
          View log
        </button>
        {model.needsGoals && (
          <button type="button" className="btn secondary nutrition-dash-goals" onClick={onSetGoals}>
            Set goals
          </button>
        )}
      </div>
    </>
  );
}

function CalorieRing({ actual, target }: { actual: number; target: number }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - macroRingArc(actual, target));
  const status = macroRingStatus(actual, target);
  return (
    <svg
      className={`nutrition-dash-ring nutrition-ring--${status}`}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      aria-hidden="true"
    >
      <circle className="nutrition-ring-track" cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} fill="none" strokeWidth={RING_STROKE} />
      <circle
        className="nutrition-ring-progress"
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radius}
        fill="none"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </svg>
  );
}
