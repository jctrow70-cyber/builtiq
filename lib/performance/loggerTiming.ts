export type LoggerTimingKind = 'rir' | 'done' | 'field' | 'save' | 'render';

export type LoggerTimingSample = {
  kind: LoggerTimingKind;
  ms: number;
  at: number;
};

export type LoggerTimingMark = {
  kind: LoggerTimingKind;
  startedAt: number;
};

const samples: LoggerTimingSample[] = [];
const MAX_SAMPLES = 240;

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function publish() {
  if (typeof window === 'undefined') return;
  (window as unknown as { __biqLoggerTiming?: { samples: LoggerTimingSample[]; summary: () => ReturnType<typeof loggerTimingSummary> } }).__biqLoggerTiming = {
    samples,
    summary: loggerTimingSummary,
  };
}

export function beginLoggerInteraction(kind: LoggerTimingKind): LoggerTimingMark {
  return { kind, startedAt: now() };
}

export function noteLoggerVisual(mark: LoggerTimingMark | null | undefined) {
  if (!mark) return;
  pushSample({ kind: mark.kind, ms: roundMs(now() - mark.startedAt), at: Date.now() });
}

export function noteLoggerSave(durationMs: number) {
  pushSample({ kind: 'save', ms: roundMs(durationMs), at: Date.now() });
}

export function noteLoggerRender(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  pushSample({ kind: 'render', ms: roundMs(durationMs), at: Date.now() });
}

export function recentLoggerTimings() {
  return samples.slice();
}

export function resetLoggerTiming() {
  samples.length = 0;
  publish();
}

export function loggerTimingSummary(source: LoggerTimingSample[] = samples) {
  const kinds: LoggerTimingKind[] = ['rir', 'done', 'field', 'save', 'render'];
  const byKind = Object.fromEntries(kinds.map((kind) => [kind, summarize(source.filter((sample) => sample.kind === kind))])) as Record<
    LoggerTimingKind,
    { samples: number; medianMs: number | null; p95Ms: number | null }
  >;
  return {
    measurement: 'browser' as const,
    samples: source.length,
    byKind,
  };
}

export function summarizeLoggerSamples(source: LoggerTimingSample[]) {
  return loggerTimingSummary(source);
}

function pushSample(sample: LoggerTimingSample) {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
  publish();
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

function summarize(rows: LoggerTimingSample[]) {
  const sorted = rows.map((row) => row.ms).sort((a, b) => a - b);
  return {
    samples: sorted.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}
