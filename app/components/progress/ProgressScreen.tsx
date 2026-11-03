'use client';

import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ProgressBody from './ProgressBody';
import ProgressNutrition from './ProgressNutrition';
import ProgressOverview from './ProgressOverview';
import ProgressStrength from './ProgressStrength';
import ExerciseProgressDetail, { clearExerciseProgressCache } from './ExerciseProgressDetail';
import ProgressTraining from './ProgressTraining';
import { supabase } from '../../../lib/supabaseClient';
import { clearTrainingHistoryCache, loadProgressReport } from '../../../lib/progress/queries';
import { PROGRESS_RANGES, type ProgressRange } from '../../../lib/progress/ranges';
import type { ProgressReport } from '../../../lib/progress/report';
import type { ProgressSection } from '../../../lib/progress/progressView';
import type { ExerciseProgressRequest } from '../../../lib/progress/exerciseProgress';
import type { UnitsPreference } from '../../../lib/body/measurements';
import { todayYmd } from '../../../lib/training/programCalendar';
import { completeScreenPhase } from '../../../lib/performance/screenTiming';
import { beginScreenPaint, finishScreenPaint, markScreenStale, readScreenCache, writeScreenCache } from '../../../lib/performance/screenSession';

type ProgressScreenProps = {
  userId: string | null;
  unitsPreference?: string | null;
  weightUnit: string;
  section: ProgressSection;
  onSectionChange: (section: ProgressSection) => void;
  onOpenNutrition?: () => void;
  onBodyDataChange?: () => void;
  exerciseRequest?: ExerciseProgressRequest | null;
  onOpenExercise?: (request: ExerciseProgressRequest) => void;
  onCloseExercise?: () => void;
  onDismissExercise?: () => void;
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
  exerciseRequest = null,
  onOpenExercise,
  onCloseExercise,
  onDismissExercise,
}: ProgressScreenProps) {
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';
  const [range, setRange] = useState<ProgressRange>('4W');
  const [report, setReport] = useState<ProgressReport | null>(() => {
    if (!userId) return null;
    return readScreenCache<ProgressReport>(userId, 'progress', `4W|${units}`, todayYmd(), {
      dateScoped: true,
      staleAreas: ['progress'],
    })?.value || null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const today = todayYmd();
    const key = `${range}|${units}`;
    const paint = beginScreenPaint<ProgressReport>('Progress', userId, 'progress', key, today, {
      dateScoped: true,
      staleAreas: ['progress'],
    });
    if (paint.cached) {
      setReport(paint.cached);
      setError(null);
      setLoading(false);
      completeScreenPhase('Progress', 'data');
    }
    if (!paint.cached || paint.background) {
      if (!paint.cached) {
        setLoading(true);
        setError(null);
        setReport(null);
      }
      loadProgressReport(supabase, userId, range, today)
        .then((next) => {
          if (cancelled) return;
          writeScreenCache(userId, 'progress', key, next, today);
          setReport(next);
        })
        .catch(() => {
          if (!cancelled) setError('Progress could not be loaded. Check your connection and try again.');
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
          finishScreenPaint('Progress', userId, ['progress'], !!paint.cached && paint.background);
          completeScreenPhase('Progress', 'data');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [userId, range, refreshKey, units]);

  function refresh() {
    clearExerciseProgressCache();
    clearTrainingHistoryCache();
    if (userId) markScreenStale(userId, ['progress']);
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
        <SegmentedControl<ProgressSection>
          ariaLabel="Progress section"
          size="sm"
          value={section}
          onChange={(next) => {
            if (exerciseRequest) onDismissExercise?.();
            onSectionChange(next);
          }}
          options={SECTIONS}
        />
      </div>
      {!exerciseRequest && (
        <div className="progress-scroll-tabs">
          <SegmentedControl<ProgressRange>
            ariaLabel="Progress date range"
            size="sm"
            value={range}
            onChange={(value) => setRange(value)}
            options={PROGRESS_RANGES.map((value) => ({ value, label: value }))}
          />
        </div>
      )}

      {userId && exerciseRequest && (
        <ExerciseProgressDetail
          userId={userId}
          target={exerciseRequest}
          weightUnit={weightUnit}
          backLabel={exerciseRequest.returnTo === 'training' ? 'Back to workout' : exerciseRequest.returnSection === 'training' ? 'Back to history' : 'Back'}
          onBack={() => onCloseExercise?.()}
        />
      )}

      {!userId && (
        <Card><p className="progress-lead">Sign in to see your progress.</p></Card>
      )}
      {userId && loading && !report && !exerciseRequest && section !== 'body' && <Card><p className="progress-lead">Loading your progress…</p></Card>}
      {userId && error && !report && !exerciseRequest && section !== 'body' && (
        <Card>
          <p className="progress-error">{error}</p>
          <button type="button" className="btn secondary" onClick={refresh}>Try again</button>
        </Card>
      )}
      {userId && report && !exerciseRequest && section === 'overview' && (
        <ProgressOverview report={report} units={units} onOpen={onSectionChange} />
      )}
      {userId && report && !exerciseRequest && section === 'strength' && (
        <ProgressStrength
          report={report}
          userId={userId}
          weightUnit={weightUnit}
          onOpenExercise={(request) => onOpenExercise?.(request)}
        />
      )}
      {userId && report && !exerciseRequest && section === 'training' && (
        <ProgressTraining
          report={report}
          userId={userId}
          weightUnit={weightUnit}
          refreshKey={refreshKey}
          onViewProgress={(request) => onOpenExercise?.(request)}
        />
      )}
      {userId && report && !exerciseRequest && section === 'nutrition' && (
        <ProgressNutrition report={report} units={units} onLogMeals={onOpenNutrition} />
      )}
      {userId && !exerciseRequest && section === 'body' && (
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
