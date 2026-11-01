export type FinishPersistenceResult = {
  proceeded: boolean;
  failedSetIds: string[];
  pendingSetIds: string[];
};

export type FinishPersistenceSteps = {
  begin?: () => void;
  flushDebouncedEdits: () => Promise<void>;
  awaitSetWrites: () => Promise<void>;
  unconfirmedRequiredSets: () => { failed: string[]; pending: string[] };
  persistSession: () => Promise<void>;
  end?: () => void;
};

/** Automatic session completion stays off while Finish owns the session write. */
export function automaticSessionCompletionAllowed(finishOwnsSession: boolean) {
  return !finishOwnsSession;
}

/**
 * Flush debounced weight, reps, and notes, wait for those writes, then
 * persist the session only when every required set edit is confirmed.
 */
export async function finishAfterPendingEdits(input: FinishPersistenceSteps): Promise<FinishPersistenceResult> {
  try {
    input.begin?.();
    await input.flushDebouncedEdits();
    await input.awaitSetWrites();
    const gate = input.unconfirmedRequiredSets();
    if (gate.failed.length || gate.pending.length) {
      return { proceeded: false, failedSetIds: gate.failed.slice(), pendingSetIds: gate.pending.slice() };
    }
    await input.persistSession();
    return { proceeded: true, failedSetIds: [], pendingSetIds: [] };
  } finally {
    input.end?.();
  }
}

/** A second Finish tap joins the in-flight attempt instead of writing the session again. */
export function createFinishSingleFlight() {
  let current: Promise<FinishPersistenceResult> | null = null;
  return {
    inFlight() {
      return current != null;
    },
    start(input: FinishPersistenceSteps) {
      if (current) return current;
      let run: Promise<FinishPersistenceResult>;
      run = finishAfterPendingEdits(input).finally(() => {
        if (current === run) current = null;
      });
      current = run;
      return run;
    },
  };
}
