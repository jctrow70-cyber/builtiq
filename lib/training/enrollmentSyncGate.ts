/**
 * Schedule repair waits until enrollment sync for the current training loads has finished.
 * Overlapping loads keep the gate closed until the last one settles.
 */
let armed = false;
let loads = 0;
const waiters: Array<() => void> = [];
const listeners = new Set<() => void>();

function idle() {
  return !armed && loads === 0;
}

function flush() {
  const pending = waiters.splice(0);
  pending.forEach((resolve) => resolve());
  listeners.forEach((listener) => listener());
}

export function armEnrollmentSync() {
  if (armed || loads > 0) return;
  armed = true;
}

export function enrollmentSyncIsIdle() {
  return idle();
}

export function enrollmentSyncSettled() {
  if (idle()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    waiters.push(resolve);
  });
}

export function subscribeEnrollmentSync(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function trackTrainingLoad<T>(run: () => Promise<T>): Promise<T> {
  loads += 1;
  armed = true;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      loads = Math.max(0, loads - 1);
      if (loads === 0) {
        armed = false;
        flush();
      }
    });
}

export function releaseEnrollmentSyncIfIdle() {
  if (loads === 0 && armed) {
    armed = false;
    flush();
  }
}

export function resetEnrollmentSyncGate() {
  armed = false;
  loads = 0;
  waiters.splice(0);
  listeners.clear();
}
