/**
 * BIQ-0291 — Finish flushes debounced weight, reps, and notes before the session write.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-finish-debounced-edits.ts
 */
import assert from 'node:assert/strict';
import { createDebouncedFieldQueue } from '../lib/training/debouncedFieldEdits';
import {
  automaticSessionCompletionAllowed,
  createFinishSingleFlight,
  finishAfterPendingEdits,
} from '../lib/training/finishWorkoutPersistence';
import { drainSetLogIntent, SetLogIntentLedger, unsavedSetLogGate } from '../lib/training/setLogIntent';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testLatestDebouncedValueFlushesOnce() {
  const queue = createDebouncedFieldQueue(40);
  const saved: string[] = [];
  queue.schedule('set-1:actual_weight', () => { saved.push('100'); });
  queue.schedule('set-1:actual_weight', () => { saved.push('135'); });
  queue.schedule('set-1:actual_reps', () => { saved.push('8'); });
  assert.equal(queue.pendingCount(), 2);
  await queue.flush();
  await delay(50);
  assert.deepEqual(saved, ['135', '8']);
  assert.equal(queue.pendingCount(), 0);
}

async function testTimerStillSavesOnceWithoutFinish() {
  const queue = createDebouncedFieldQueue(20);
  const saved: string[] = [];
  queue.schedule('set-1:actual_reps', () => { saved.push('5'); });
  await delay(40);
  assert.deepEqual(saved, ['5']);
  await queue.flush();
  assert.deepEqual(saved, ['5']);
}

async function testFinishWaitsForDelayedWeightThenSavesSession() {
  const queue = createDebouncedFieldQueue(700);
  const ledger = new SetLogIntentLedger();
  const writes: string[] = [];
  const feedback = { notes: '' };
  let sessionWrites = 0;
  queue.schedule('set-1:actual_weight', () => {
    const pending = ledger.push({ actual_weight: '155' });
    const drain = drainSetLogIntent(ledger, async (updates) => {
      writes.push(String(updates.actual_weight));
      await delay(25);
      feedback.notes = 'easy bar speed';
      return { ok: true, data: updates };
    });
    return Promise.all([pending, drain]);
  });
  const started = Date.now();
  const result = await finishAfterPendingEdits({
    flushDebouncedEdits: () => queue.flush(),
    awaitSetWrites: async () => {},
    unconfirmedRequiredSets: () => {
      const gate = unsavedSetLogGate(new Map([['set-1', ledger]]), new Set(['set-1']));
      return { failed: gate.failed, pending: gate.pending };
    },
    persistSession: async () => {
      assert.equal(feedback.notes, 'easy bar speed');
      sessionWrites += 1;
    },
  });
  assert.ok(Date.now() - started >= 20);
  assert.equal(result.proceeded, true);
  assert.deepEqual(writes, ['155']);
  assert.equal(sessionWrites, 1);
  assert.equal(ledger.overlay.actual_weight, undefined);
}

async function testFinishBlocksWhenDebouncedRepsFail() {
  const queue = createDebouncedFieldQueue(700);
  const ledger = new SetLogIntentLedger();
  let sessionWrites = 0;
  queue.schedule('set-1:actual_reps', () => {
    const pending = ledger.push({ actual_reps: '8' });
    const drain = drainSetLogIntent(ledger, async () => {
      await delay(15);
      return { ok: false, error: 'network' };
    });
    return Promise.all([pending, drain]);
  });
  const result = await finishAfterPendingEdits({
    flushDebouncedEdits: () => queue.flush(),
    awaitSetWrites: async () => {},
    unconfirmedRequiredSets: () => {
      const gate = unsavedSetLogGate(new Map([['set-1', ledger]]), new Set(['set-1']));
      return { failed: gate.failed, pending: gate.pending };
    },
    persistSession: async () => { sessionWrites += 1; },
  });
  assert.equal(result.proceeded, false);
  assert.deepEqual(result.failedSetIds, ['set-1']);
  assert.equal(sessionWrites, 0);
  assert.equal(ledger.overlay.actual_reps, '8');
  const retry = ledger.retry();
  await drainSetLogIntent(ledger, async (updates) => {
    assert.equal(updates.actual_reps, '8');
    return { ok: true, data: updates };
  });
  assert.equal((await retry).ok, true);
  assert.equal(ledger.overlay.actual_reps, undefined);
}

async function testRapidFinishPersistsOnce() {
  const flight = createFinishSingleFlight();
  let flushes = 0;
  let persists = 0;
  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const steps = {
    flushDebouncedEdits: async () => {
      flushes += 1;
      await hold;
    },
    awaitSetWrites: async () => {},
    unconfirmedRequiredSets: () => ({ failed: [], pending: [] }),
    persistSession: async () => { persists += 1; },
  };
  const first = flight.start(steps);
  assert.equal(flight.inFlight(), true);
  const second = flight.start(steps);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.proceeded, true);
  assert.equal(b.proceeded, true);
  assert.equal(flushes, 1);
  assert.equal(persists, 1);
  await flight.start(steps);
  assert.equal(persists, 2);
}

async function testFinishOwnsSessionCompletion() {
  let owns = false;
  let automatic = 0;
  let manual = 0;
  await finishAfterPendingEdits({
    begin() { owns = true; },
    flushDebouncedEdits: async () => {
      if (automaticSessionCompletionAllowed(owns)) automatic += 1;
    },
    awaitSetWrites: async () => {},
    unconfirmedRequiredSets: () => ({ failed: [], pending: [] }),
    persistSession: async () => { manual += 1; },
    end() { owns = false; },
  });
  assert.equal(automatic, 0);
  assert.equal(manual, 1);
  assert.equal(owns, false);
  assert.equal(automaticSessionCompletionAllowed(false), true);
}

async function main() {
  await testLatestDebouncedValueFlushesOnce();
  await testTimerStillSavesOnceWithoutFinish();
  await testFinishWaitsForDelayedWeightThenSavesSession();
  await testFinishBlocksWhenDebouncedRepsFail();
  await testRapidFinishPersistsOnce();
  await testFinishOwnsSessionCompletion();
  console.log('test-finish-debounced-edits: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
