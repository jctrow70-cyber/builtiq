'use client';

import { useEffect, useRef, useState } from 'react';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ProgressBody from './ProgressBody';
import ProgressNutrition from './ProgressNutrition';
import ProgressOverview from './ProgressOverview';
import ProgressStrength from './ProgressStrength';
import { clearSeriesFactCache } from './ProgressSeriesDetail';
import ProgressTraining from './ProgressTraining';
import { supabase } from '../../../lib/supabaseClient';
import { loadProgressReport } from '../../../lib/progress/queries';
import { PROGRESS_RANGES, type ProgressRange } from '../../../lib/progress/ranges';
import type { ProgressReport } from '../../../lib/progress/report';
import type { ProgressSection } from '../../../lib/progress/progressView';
import type { UnitsPreference } from '../../../lib/body/measurements';
import { todayYmd } from '../../../lib/training/programCalendar';

type ProgressScreenProps = {
  userId: string | null;
  unitsPreference?: string | null;
  weightUnit: string;
  section: ProgressSection;
  onSectionChange: (section: ProgressSection) => void;
  onOpenNutrition?: () => void;
  onBodyDataChange?: () => void;
};

const SECTIONS: { value: ProgressSection; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'strength', label: 'Strength' },
  { value: 'training', label: 'Training' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'body', label: 'Body' },
];

export default function ProgressScreen({
  userId,
  unitsPreference,
  weightUnit,
  section,
  onSectionChange,
  onOpenNutrition,
  onBodyDataChange,
}: ProgressScreenProps) {
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';
  const [range, setRange] = useState<ProgressRange>('4W');
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const cache = useRef(new Map<string, ProgressReport>());
  const cacheUser = useRef(userId);

  if (cacheUser.current !== userId) {
    cache.current.clear();
    cacheUser.current = userId;
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const key = `${userId}|${range}`;
    const cached = cache.current.get(key);
    if (cached) {
      setReport(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    loadProgressReport(supabase, userId, range, todayYmd())
      .then((next) => {
        if (cancelled) return;
        cache.current.set(key, next);
        setReport(next);
      })
      .catch(() => {
        if (!cancelled) setError('Progress could not be loaded. Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, range, refreshKey]);

  function refresh() {
    clearSeriesFactCache();
    cache.current.delete(`${userId}|${range}`);
    setRefreshKey((value) => value + 1);
  }

  return (
    <section className="progress-screen" aria-busy={loading}>
      <div className="progress-toolbar">
        <div>
          <h1 className="progress-title">Progress</h1>
          <p className="muted">How your strength, training, nutrition, and body are moving.</p>
        </div>
        {userId && (
          <button type="button" className="btn small secondary" onClick={refresh} disabled={loading}>Refresh</button>
        )}
      </div>

      <div className="progress-scroll-tabs">
        <SegmentedControl<ProgressSection> ariaLabel="Progress section" size="sm" value={section} onChange={onSectionChange} options={SECTIONS} />
      </div>
      <div className="progress-scroll-tabs">
        <SegmentedControl<ProgressRange>
          ariaLabel="Progress date range"
          size="sm"
          value={range}
          onChange={(value) => setRange(value)}
          options={PROGRESS_RANGES.map((value) => ({ value, label: value }))}
        />
      </div>

      {!userId && (
        <Card><p className="progress-lead">Sign in to see your progress.</p></Card>
      )}
      {userId && loading && !report && section !== 'body' && <Card><p className="progress-lead">Loading your progress…</p></Card>}
      {userId && error && !report && section !== 'body' && (
        <Card>
          <p className="progress-error">{error}</p>
          <button type="button" className="btn secondary" onClick={refresh}>Try again</button>
        </Card>
      )}
      {userId && report && section === 'overview' && (
        <ProgressOverview report={report} units={units} onOpen={onSectionChange} />
      )}
      {userId && report && section === 'strength' && (
        <ProgressStrength report={report} userId={userId} weightUnit={weightUnit} />
      )}
      {userId && report && section === 'training' && (
        <ProgressTraining report={report} weightUnit={weightUnit} />
      )}
      {userId && report && section === 'nutrition' && (
        <ProgressNutrition report={report} units={units} onLogMeals={onOpenNutrition} />
      )}
      {userId && section === 'body' && (
        <ProgressBody
          report={report}
          userId={userId}
          units={units}
          unitsPreference={unitsPreference}
          onDataChange={() => {
            refresh();
            onBodyDataChange?.();
          }}
        />
      )}
    </section>
  );
}

export type { ProgressSection };
