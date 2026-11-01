/** Weight, reps, and notes wait this long before a set write. Finish flushes sooner. */
export const SET_FIELD_DEBOUNCE_MS = 700;

export type DebouncedFieldSave = () => void | Promise<unknown>;

export function createDebouncedFieldQueue(delayMs = SET_FIELD_DEBOUNCE_MS) {
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  const pending: Record<string, DebouncedFieldSave> = {};

  function settle(save: DebouncedFieldSave) {
    try {
      const result = save();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return Promise.resolve(result).then(() => undefined, () => undefined);
      }
    } catch {
      /* the caller keeps the entered value */
    }
    return Promise.resolve();
  }

  return {
    schedule(key: string, save: DebouncedFieldSave) {
      pending[key] = save;
      if (timers[key]) clearTimeout(timers[key]);
      timers[key] = setTimeout(() => {
        delete timers[key];
        const run = pending[key];
        delete pending[key];
        if (run) void settle(run);
      }, delayMs);
    },
    async flush() {
      Object.keys(timers).forEach((key) => {
        clearTimeout(timers[key]);
        delete timers[key];
      });
      const queued = { ...pending };
      Object.keys(pending).forEach((key) => {
        delete pending[key];
      });
      await Promise.all(Object.keys(queued).map((key) => settle(queued[key])));
    },
    pendingCount() {
      return Object.keys(pending).length;
    },
    pendingKeys() {
      return Object.keys(pending);
    },
  };
}
