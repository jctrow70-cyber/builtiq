export type SetLogSaveResult = {
  ok: boolean;
  stale: boolean;
  error?: string;
  data?: unknown;
};

/** Short pause so two taps in the same moment become one write. The control does not wait on this. */
export const SET_LOG_WRITE_COALESCE_MS = 40;

export type SetLogWriteOutcome = {
  ok: boolean;
  error?: string;
  data?: unknown;
};

/**
 * Remembers the latest unsaved fields for one planned set.
 * An older write must not replace a newer selection.
 */
export class SetLogIntentLedger {
  version = 0;
  confirmedVersion = 0;
  overlay: Record<string, any> = {};
  draining = false;
  paused = false;
  private waiters = new Map<number, (result: SetLogSaveResult) => void>();

  push(updates: Record<string, any>, completed?: boolean): Promise<SetLogSaveResult> {
    this.version += 1;
    const version = this.version;
    this.paused = false;
    this.merge(updates, completed);
    this.resolveOlder(version);
    return new Promise((resolve) => this.waiters.set(version, resolve));
  }

  /** Try the unconfirmed overlay again after a failed save. */
  retry(): Promise<SetLogSaveResult> {
    if (!Object.keys(this.overlay).length) {
      return Promise.resolve({ ok: true, stale: true });
    }
    this.paused = false;
    this.version += 1;
    const version = this.version;
    this.resolveOlder(version);
    return new Promise((resolve) => this.waiters.set(version, resolve));
  }

  snapshot(): { version: number; updates: Record<string, any> } | null {
    if (this.paused) return null;
    if (this.confirmedVersion === this.version) return null;
    if (!Object.keys(this.overlay).length) return null;
    return { version: this.version, updates: { ...this.overlay } };
  }

  isCurrent(version: number) {
    return version === this.version;
  }

  confirm(version: number) {
    if (version !== this.version) return false;
    this.overlay = {};
    this.confirmedVersion = version;
    this.paused = false;
    return true;
  }

  pause() {
    this.paused = true;
  }

  resolve(version: number, result: SetLogSaveResult) {
    const waiter = this.waiters.get(version);
    if (!waiter) return;
    this.waiters.delete(version);
    waiter(result);
  }

  private merge(updates: Record<string, any>, completed?: boolean) {
    for (const [key, value] of Object.entries(updates || {})) {
      if (key === 'completed') {
        this.overlay.completed = value === true || value === 'true';
        continue;
      }
      this.overlay[key] = value;
    }
    if (completed !== undefined) this.overlay.completed = !!completed;
  }

  private resolveOlder(version: number) {
    Array.from(this.waiters.entries()).forEach(([pendingVersion, resolve]) => {
      if (pendingVersion < version) {
        resolve({ ok: true, stale: true });
        this.waiters.delete(pendingVersion);
      }
    });
  }
}

function delay(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes the latest overlay for one set. A newer edit replaces an in-flight
 * payload on the next pass. The visual update is not this function's job.
 */
export async function drainSetLogIntent(
  ledger: SetLogIntentLedger,
  write: (updates: Record<string, any>, version: number) => Promise<SetLogWriteOutcome>,
  opts?: {
    coalesceMs?: number;
    onApplied?: (version: number, data: unknown, updates: Record<string, any>) => void | Promise<void>;
    onFollowUp?: (version: number, data: unknown, updates: Record<string, any>) => void | Promise<void>;
  }
) {
  if (ledger.draining) return;
  ledger.draining = true;
  const coalesceMs = opts?.coalesceMs ?? 0;
  try {
    while (true) {
      if (coalesceMs > 0) await delay(coalesceMs);
      const snap = ledger.snapshot();
      if (!snap) break;
      let outcome: SetLogWriteOutcome;
      try {
        outcome = await write(snap.updates, snap.version);
      } catch (error) {
        outcome = {
          ok: false,
          error: error instanceof Error && error.message ? error.message : 'Could not save that set.',
        };
      }
      if (!ledger.isCurrent(snap.version)) {
        ledger.resolve(snap.version, {
          ok: !!outcome.ok,
          stale: true,
          error: outcome.error,
          data: outcome.data,
        });
        continue;
      }
      if (!outcome.ok) {
        ledger.pause();
        ledger.resolve(snap.version, {
          ok: false,
          stale: false,
          error: outcome.error || 'Could not save that set.',
        });
        break;
      }
      const applied = ledger.confirm(snap.version);
      if (applied && opts?.onApplied) await opts.onApplied(snap.version, outcome.data, snap.updates);
      ledger.resolve(snap.version, { ok: true, stale: false, data: outcome.data });
      if (applied && opts?.onFollowUp) {
        await delay(0);
        try {
          await opts.onFollowUp(snap.version, outcome.data, snap.updates);
        } catch (error) {
          console.warn(error);
        }
      }
    }
  } finally {
    ledger.draining = false;
  }
}
