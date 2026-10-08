'use client';

import { useState } from 'react';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ProgressTrendChart from './ProgressTrendChart';
import {
  completedWorkouts,
  formatCount,
  formatSets,
  muscleValue,
  muscleWeekAverage,
  muscleWeekChange,
  rangePeriodLabel,
  weeklyExposure,
  workingSetsInView,
  type MuscleMode,
} from '../../../lib/progress/progressView';
import { inclusiveDays } from '../../../lib/progress/ranges';
import type { ProgressReport } from '../../../lib/progress/report';

type ProgressTrainingProps = {
  report: ProgressReport;
  weightUnit: string;
};

export default function ProgressTraining({ report, weightUnit }: ProgressTrainingProps) {
  const [mode, setMode] = useState<MuscleMode>('effective');
  const groups = report.muscles.groups;
  const hasTraining = groups.some((group) => group.effectiveSets > 0 || group.directSets > 0) || workingSetsInView(report) > 0;
  const workouts = completedWorkouts(report);
  const adherence = report.adherence?.counts.completion_rate ?? null;
  const effective = groups.reduce((sum, group) => sum + group.effectiveSets, 0);
  const working = workingSetsInView(report);
  const max = Math.max(...groups.map((group) => muscleValue(group, mode)), 0);
  const weeks = weeklyExposure(groups, mode);
  const showWeekChart = weeks.filter((point) => point.value > 0).length >= 2;
  const balanceReady = groups.some((group) => group.weeks.length >= 2);

  if (!hasTraining && workouts == null) {
    return (
      <Card>
        <div className="progress-empty">
          <h3>See what you are actually training</h3>
          <p>Log workouts and BuildIQ will estimate how much work each muscle received.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="progress-stack">
      <Card elevated>
        <p className="progress-kicker">{rangePeriodLabel(report.range)}</p>
        <h2 className="progress-headline">Training</h2>
        <div className="progress-stat-grid">
          {workouts != null && <Stat label="Workouts completed" value={String(workouts)} />}
          {adherence != null && <Stat label="Training adherence" value={formatRate(adherence)} />}
          {effective > 0 && <Stat label="Effective sets" value={formatSets(effective)} />}
          {working > 0 && <Stat label="Working sets" value={String(working)} />}
          {workouts != null && report.view.from !== report.view.to && (
            <Stat label="Training frequency" value={perWeek(workouts, report.view.from, report.view.to)} />
          )}
        </div>
      </Card>

      <Card>
        <div className="progress-section-head">
          <h2 className="progress-section-title">Muscle exposure</h2>
          <SegmentedControl<MuscleMode>
            ariaLabel="Muscle set type"
            size="sm"
            value={mode}
            onChange={(value) => setMode(value)}
            options={[{ value: 'effective', label: 'Effective' }, { value: 'direct', label: 'Direct' }]}
          />
        </div>
        <details className="progress-note">
          <summary>About effective sets</summary>
          <p>Effective sets are BuildIQ training-volume estimates based on how strongly each exercise trains a muscle. They are not exact physiological measurements.</p>
          <p>Direct sets count a working set toward its primary muscle.</p>
        </details>
        {!hasTraining && <p className="progress-lead">No muscle exposure in this period.</p>}
        {hasTraining && groups.map((group) => {
          const value = muscleValue(group, mode);
          const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
          return (
            <div className="progress-muscle" key={group.id}>
              <div className="progress-muscle-head">
                <span>{group.label}</span>
                <b>{formatSets(value)}</b>
              </div>
              <div className="progress-bar" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
            </div>
          );
        })}
        {report.muscles.unattributedSets > 0 && (
          <p className="muted">{report.muscles.unattributedSets} working set{report.muscles.unattributedSets === 1 ? '' : 's'} could not be assigned to a muscle.</p>
        )}
      </Card>

      <Card>
        <h2 className="progress-section-title">Muscle balance</h2>
        <p className="muted">Weekly exposure from the sets you logged. No universal target is applied.</p>
        {!hasTraining && <p className="progress-lead">Log training in this period to see how muscles compare.</p>}
        {hasTraining && !balanceReady && <p className="progress-lead">Weekly balance appears after two weeks of training in this range.</p>}
        {hasTraining && balanceReady && groups.map((group) => {
          const average = muscleWeekAverage(group, mode);
          const change = muscleWeekChange(group, mode);
          if (average == null) return null;
          return (
            <div className="progress-balance-row" key={group.id}>
              <span>{group.label}</span>
              <span>{formatSets(average)} avg sets/week</span>
              <b>{change}</b>
            </div>
          );
        })}
      </Card>

      <Card>
        <h2 className="progress-section-title">Training volume</h2>
        <p className="muted">Volume load is supporting context. It is not the main sign of progress.</p>
        <div className="progress-stat-grid">
          {working > 0 && <Stat label="Working sets" value={String(working)} />}
          {effective > 0 && <Stat label="Effective sets" value={formatSets(effective)} />}
          {report.trainingVolume > 0 && <Stat label="Volume load" value={`${formatCount(report.trainingVolume)} ${weightUnit}`} />}
        </div>
        {showWeekChart && (
          <>
            <p className="progress-card-label">{mode === 'effective' ? 'Estimated exposure by week' : 'Direct sets by week'}</p>
            <ProgressTrendChart points={weeks} label={mode === 'effective' ? 'Estimated effective sets by week' : 'Direct sets by week'} />
            <p className="muted">A set that trains more than one muscle is counted in each muscle, so this weekly line is exposure rather than unique working sets.</p>
          </>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <b>{value}</b>
      <span className="muted">{label}</span>
    </div>
  );
}

function formatRate(rate: number): string {
  const rounded = Math.round(rate * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function perWeek(workouts: number, from: string, to: string): string | null {
  const days = inclusiveDays(from, to);
  if (days < 7) return null;
  const rate = Math.round((workouts / (days / 7)) * 10) / 10;
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)} / week`;
}
