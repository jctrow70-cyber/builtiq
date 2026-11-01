export type ScreenTimingSpan = {
  screen: string;
  startedAt: number;
  phases: Record<string, number | null>;
  readyAt: number | null;
  durationMs: number | null;
  programLoads: number;
};

const spans: ScreenTimingSpan[] = [];

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

export function screenTimingPhases(screen: string): string[] {
  if (screen === 'Training') return ['program', 'schedule'];
  if (screen === 'Dashboard') return ['program'];
  if (screen === 'Nutrition' || screen === 'Progress') return ['data'];
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
    if (Object.values(span.phases).every((value) => value != null)) {
      span.readyAt = now();
      span.durationMs = Math.round((span.readyAt - span.startedAt) * 10) / 10;
    }
    publish();
    return;
  }
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
  publish();
}

function publish() {
  if (typeof window === 'undefined') return;
  (window as unknown as { __biqScreenTiming?: ScreenTimingSpan[] }).__biqScreenTiming = spans;
}
