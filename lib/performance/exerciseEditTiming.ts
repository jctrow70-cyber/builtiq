export type ExerciseEditTimingKind =
  | 'add-visual'
  | 'remove-visual'
  | 'add-mutation'
  | 'remove-mutation'
  | 'add-failure'
  | 'remove-failure';

export type ExerciseEditTimingSample = {
  kind: ExerciseEditTimingKind;
  ms: number;
  at: number;
  error?: string;
};

export type ExerciseEditTimingMark = {
  kind: 'add' | 'remove';
  startedAt: number;
};

const EXERCISE_EDIT_TIMING_CAP = 80;
const buckets: Record<ExerciseEditTimingKind, ExerciseEditTimingSample[]> = {
  'add-visual': [],
  'remove-visual': [],
  'add-mutation': [],
  'remove-mutation': [],
  'add-failure': [],
  'remove-failure': [],
};

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

function allSamples() {
  return ([] as ExerciseEditTimingSample[]).concat(
    buckets['add-visual'],
    buckets['remove-visual'],
    buckets['add-mutation'],
    buckets['remove-mutation'],
    buckets['add-failure'],
    buckets['remove-failure']
  );
}

function publish() {
  if (typeof window === 'undefined') return;
  (window as unknown as { __biqExerciseEditTiming?: { samples: ExerciseEditTimingSample[]; summary: () => ReturnType<typeof exerciseEditTimingSummary> } }).__biqExerciseEditTiming = {
    samples: recentExerciseEditTimings(),
    summary: exerciseEditTimingSummary,
  };
}

function pushSample(sample: ExerciseEditTimingSample) {
  const bucket = buckets[sample.kind];
  bucket.push(sample);
  if (bucket.length > EXERCISE_EDIT_TIMING_CAP) bucket.shift();
  publish();
}

export function beginExerciseEdit(kind: 'add' | 'remove'): ExerciseEditTimingMark {
  return { kind, startedAt: now() };
}

export function noteExerciseEditVisual(mark: ExerciseEditTimingMark | null | undefined) {
  if (!mark) return;
  const kind: ExerciseEditTimingKind = mark.kind === 'add' ? 'add-visual' : 'remove-visual';
  pushSample({ kind, ms: roundMs(now() - mark.startedAt), at: Date.now() });
}

export function noteExerciseEditMutation(kind: 'add' | 'remove', durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const sampleKind: ExerciseEditTimingKind = kind === 'add' ? 'add-mutation' : 'remove-mutation';
  pushSample({ kind: sampleKind, ms: roundMs(durationMs), at: Date.now() });
}

export function noteExerciseEditFailure(kind: 'add' | 'remove', error?: string) {
  const sampleKind: ExerciseEditTimingKind = kind === 'add' ? 'add-failure' : 'remove-failure';
  pushSample({ kind: sampleKind, ms: 0, at: Date.now(), error: error || 'failed' });
}

export function recentExerciseEditTimings() {
  return allSamples();
}

export function resetExerciseEditTiming() {
  (Object.keys(buckets) as ExerciseEditTimingKind[]).forEach((kind) => {
    buckets[kind].length = 0;
  });
  publish();
}

export function exerciseEditTimingSummary(source?: ExerciseEditTimingSample[]) {
  const rows = source ?? allSamples();
  const kinds = Object.keys(buckets) as ExerciseEditTimingKind[];
  const byKind = Object.fromEntries(
    kinds.map((kind) => {
      const samples = rows.filter((row) => row.kind === kind);
      return [kind, { samples: samples.length, failures: samples.filter((row) => row.error).length }];
    })
  );
  return { measurement: 'browser' as const, samples: rows.length, byKind };
}
