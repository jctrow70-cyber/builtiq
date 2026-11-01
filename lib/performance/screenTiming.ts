export type ScreenTimingSpan = {
  screen: string;
  startedAt: number;
  phases: Record<string, number | null>;
  readyAt: number | null;
  durationMs: number | null;
  programLoads: number;
  /** Set when cached content is painted or the content phase finishes. Not moved by a later refresh. */
  usableMs: number | null;
  cacheHit: boolean | null;
  backgroundStartedAt: number | null;
  backgroundRefreshMs: number | null;
  backgroundOpen: number;
  /** First calendar or hero paint. A later repair does not move it. */
  calendarUsableMs: number | null;
  /** Click until the workout preview has a workout or a load error. */
  workoutDetailMs: number | null;
  /** These spans are recorded in the browser. The nav script's round-trip model is separate. */
  measurement: 'browser';
};

const USABLE_PHASE: Record<string, string> = {
  Nutrition: 'data',
  Progress: 'data',
  Training: 'schedule',
  Groups: 'data',
};

const spans: ScreenTimingSpan[] = [];

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

export function screenTimingPhases(screen: string): string[] {
  if (screen === 'Training') return ['program', 'schedule'];
  if (screen === 'Dashboard') return ['program'];
  if (screen === 'Nutrition' || screen === 'Progress' || screen === 'Groups') return ['data'];
  return [];
}

/** Start a navigation span. Empty phase lists are not tracked. */
export function beginScreenTiming(screen: string, phases: string[] = screenTimingPhases(screen)) {
  if (!phases.length) return null;
  const span: ScreenTimingSpan = {
    screen,
    startedAt: now(),
    phases: Object.fromEntries(phases.map((phase) => [phase, null])),
    readyAt: null,
    durationMs: null,
    programLoads: 0,
    usableMs: null,
    cacheHit: null,
    backgroundStartedAt: null,
    backgroundRefreshMs: null,
    backgroundOpen: 0,
    calendarUsableMs: null,
    workoutDetailMs: null,
    measurement: 'browser',
  };
  spans.push(span);
  if (spans.length > 40) spans.shift();
  publish();
  return span;
}

export function completeScreenPhase(screen: string, phase: string) {
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    if (span.screen !== screen || span.readyAt != null) continue;
    if (!(phase in span.phases) || span.phases[phase] != null) return;
    span.phases[phase] = now();
    if (USABLE_PHASE[screen] === phase) noteUsable(screen);
    if (Object.values(span.phases).every((value) => value != null)) {
      span.readyAt = now();
      span.durationMs = Math.round((span.readyAt - span.startedAt) * 10) / 10;
    }
    publish();
    return;
  }
}

/** Record the first usable calendar or hero paint. A background repair must not call this again. */
export function noteCalendarUsable(screen: string) {
  const span = latestScreenTiming(screen);
  if (span && span.calendarUsableMs == null) {
    span.calendarUsableMs = Math.round((now() - span.startedAt) * 10) / 10;
    publish();
  }
  noteUsable(screen);
}

/** Record the open from the click until the preview can show the workout or an error. */
export function noteWorkoutDetailOpen(screen: string, startedAt: number) {
  const span = latestScreenTiming(screen);
  if (!span || span.workoutDetailMs != null) return;
  span.workoutDetailMs = Math.round((Math.max(0, now() - startedAt)) * 10) / 10;
  publish();
}

export function noteCacheHit(screen: string) {
  const span = latestScreenTiming(screen);
  if (!span) return;
  span.cacheHit = true;
  publish();
}

export function noteCacheMiss(screen: string) {
  const span = latestScreenTiming(screen);
  if (!span || span.cacheHit != null) return;
  span.cacheHit = false;
  publish();
}

const usableWaiters = new Map<string, Set<() => void>>();
const usableNoted = new Set<string>();

function flushUsableWaiters(screen: string) {
  const waiting = usableWaiters.get(screen);
  if (!waiting) return;
  usableWaiters.delete(screen);
  waiting.forEach((fn) => fn());
}

/** First time primary content can be used. A later background refresh does not move this. */
export function noteUsable(screen: string) {
  const span = latestScreenTiming(screen);
  if (span && span.usableMs == null) {
    span.usableMs = Math.round((now() - span.startedAt) * 10) / 10;
    publish();
  }
  usableNoted.add(screen);
  flushUsableWaiters(screen);
}

/** Run once after a screen's primary content is usable. Already-usable screens run immediately. */
export function afterScreenUsable(screen: string, fn: () => void) {
  if (usableNoted.has(screen) || latestScreenTiming(screen)?.usableMs != null) {
    fn();
    return () => {};
  }
  let waiting = usableWaiters.get(screen);
  if (!waiting) {
    waiting = new Set();
    usableWaiters.set(screen, waiting);
  }
  waiting.add(fn);
  return () => {
    waiting?.delete(fn);
  };
}

export function beginBackgroundRefresh(screen: string) {
  const span = latestScreenTiming(screen);
  if (!span) return;
  if (span.backgroundOpen === 0) span.backgroundStartedAt = now();
  span.backgroundOpen += 1;
  publish();
}

export function endBackgroundRefresh(screen: string) {
  const span = latestScreenTiming(screen);
  if (!span || span.backgroundOpen <= 0) return;
  span.backgroundOpen -= 1;
  if (span.backgroundOpen === 0 && span.backgroundStartedAt != null) {
    span.backgroundRefreshMs = Math.round((now() - span.backgroundStartedAt) * 10) / 10;
  }
  publish();
}

export function screenTimingSummary() {
  const known = spans.filter((span) => span.cacheHit != null);
  const hits = known.filter((span) => span.cacheHit).length;
  return {
    measurement: 'browser' as const,
    samples: spans.filter((span) => span.usableMs != null).length,
    cacheHits: hits,
    cacheHitRate: known.length ? hits / known.length : null,
    backgroundRefreshMs: spans
      .map((span) => span.backgroundRefreshMs)
      .filter((value): value is number => value != null),
  };
}

export function noteProgramLoad() {
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].readyAt == null) {
      spans[i].programLoads += 1;
      publish();
      return;
    }
  }
}

export function latestScreenTiming(screen: string): ScreenTimingSpan | null {
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].screen === screen) return spans[i];
  }
  return null;
}

export function recentScreenTimings(): ScreenTimingSpan[] {
  return spans.slice();
}

export function resetScreenTiming() {
  spans.length = 0;
  usableWaiters.clear();
  usableNoted.clear();
  publish();
}

function publish() {
  if (typeof window === 'undefined') return;
  (window as unknown as { __biqScreenTiming?: ScreenTimingSpan[] }).__biqScreenTiming = spans;
}
