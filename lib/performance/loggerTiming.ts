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

/** Each kind keeps its own samples so logger renders cannot drop click-to-visual or save rows. */
export const LOGGER_TIMING_CAP = 80;
const buckets: Record<LoggerTimingKind, LoggerTimingSample[]> = {
  rir: [],
  done: [],
  field: [],
  save: [],
  render: [],
};

function allSamples(): LoggerTimingSample[] {
  return buckets.rir.concat(buckets.done, buckets.field, buckets.save, buckets.render);
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function publish() {
  if (typeof window === 'undefined') return;
  (window as unknown as {
    __biqLoggerTiming?: {
      samples: LoggerTimingSample[];
      summary: () => ReturnType<typeof loggerTimingSummary>;
      cap: number;
    };
  }).__biqLoggerTiming = {
    samples: recentLoggerTimings(),
    summary: loggerTimingSummary,
    cap: LOGGER_TIMING_CAP,
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
  return allSamples();
}

export function resetLoggerTiming() {
  (Object.keys(buckets) as LoggerTimingKind[]).forEach((kind) => {
    buckets[kind].length = 0;
  });
  publish();
}

export function loggerTimingSummary(source?: LoggerTimingSample[]) {
  const rows = source ?? allSamples();
  const kinds: LoggerTimingKind[] = ['rir', 'done', 'field', 'save', 'render'];
  const byKind = Object.fromEntries(kinds.map((kind) => [kind, summarize(rows.filter((sample) => sample.kind === kind))])) as Record<
    LoggerTimingKind,
    { samples: number; medianMs: number | null; p95Ms: number | null }
  >;
  return {
    measurement: 'browser' as const,
    samples: rows.length,
    byKind,
  };
}

export function summarizeLoggerSamples(source: LoggerTimingSample[]) {
  return loggerTimingSummary(source);
}

function pushSample(sample: LoggerTimingSample) {
  const bucket = buckets[sample.kind];
  bucket.push(sample);
  if (bucket.length > LOGGER_TIMING_CAP) bucket.shift();
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
