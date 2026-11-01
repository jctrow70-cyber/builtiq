/**
 * BIQ-0289 — set-log intent queue, logger timing summary, and catalog alias reuse.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-logger-performance.ts
 */
import assert from 'node:assert/strict';
import { classifyPreviousPerformance } from '../lib/training/previousPerformance';
import {
  resetSharedCatalogAliasIndexCache,
  sharedCatalogAliasIndexBuilds,
} from '../lib/training/catalogDedupe';
import {
  drainSetLogIntent,
  SetLogIntentLedger,
} from '../lib/training/setLogIntent';
import { summarizeLoggerSamples, type LoggerTimingSample } from '../lib/performance/loggerTiming';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testLatestValueWins() {
  const ledger = new SetLogIntentLedger();
  const writes: string[] = [];
  const first = ledger.push({ actual_rir: '2' });
  const second = ledger.push({ actual_rir: '3' });
  const applied: string[] = [];
  await drainSetLogIntent(ledger, async (updates) => {
    writes.push(String(updates.actual_rir));
    await delay(5);
    return { ok: true, data: { actual_rir: updates.actual_rir } };
  }, {
    onApplied: (_version, data) => {
      applied.push(String((data as { actual_rir?: string }).actual_rir));
    },
  });
  const firstResult = await first;
  const secondResult = await second;
  assert.equal(firstResult.stale, true);
  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.stale, false);
  assert.deepEqual(applied, ['3']);
  assert.deepEqual(writes, ['3']);
}

async function testOlderFailureDoesNotReplaceNewerSelection() {
  const ledger = new SetLogIntentLedger();
  let attempts = 0;
  const applied: string[] = [];
  const first = ledger.push({ actual_rir: '1' });
  const drainPromise = drainSetLogIntent(ledger, async (updates) => {
    attempts += 1;
    await delay(15);
    if (attempts === 1) return { ok: false, error: 'network' };
    return { ok: true, data: { actual_rir: updates.actual_rir } };
  }, {
    onApplied: (_version, data) => {
      applied.push(String((data as { actual_rir?: string }).actual_rir));
    },
  });
  await delay(5);
  const second = ledger.push({ actual_rir: '4' });
  await drainPromise;
  const firstResult = await first;
  const secondResult = await second;
  assert.equal(firstResult.stale, true);
  assert.equal(secondResult.ok, true);
  assert.deepEqual(applied, ['4']);
  assert.equal(ledger.overlay.actual_rir, undefined);
}

async function testFailedLatestStaysUnconfirmed() {
  const ledger = new SetLogIntentLedger();
  const pending = ledger.push({ actual_weight: '100', completed: true });
  await drainSetLogIntent(ledger, async () => ({ ok: false, error: 'Could not save that set.' }));
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.stale, false);
  assert.equal(result.error, 'Could not save that set.');
  assert.equal(ledger.overlay.actual_weight, '100');
  assert.equal(ledger.overlay.completed, true);
  const retry = ledger.retry();
  const writes: Record<string, unknown>[] = [];
  await drainSetLogIntent(ledger, async (updates) => {
    writes.push(updates);
    return { ok: true, data: updates };
  });
  const retried = await retry;
  assert.equal(retried.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].actual_weight, '100');
  assert.equal(writes[0].completed, true);
}

async function testCoalesceRapidEdits() {
  const ledger = new SetLogIntentLedger();
  const writes: string[] = [];
  const done = Promise.all([
    ledger.push({ actual_rir: '1' }),
    ledger.push({ actual_rir: '2' }),
    ledger.push({ actual_weight: '95' }),
  ]);
  await drainSetLogIntent(ledger, async (updates) => {
    writes.push(`${updates.actual_rir}|${updates.actual_weight}`);
    return { ok: true, data: updates };
  }, { coalesceMs: 20 });
  const results = await done;
  assert.equal(results[0].stale, true);
  assert.equal(results[1].stale, true);
  assert.equal(results[2].ok, true);
  assert.deepEqual(writes, ['2|95']);
}

function testTimingSummary() {
  const samples: LoggerTimingSample[] = [10, 20, 30, 40, 100].map((ms, index) => ({
    kind: 'rir',
    ms,
    at: index,
  }));
  const summary = summarizeLoggerSamples(samples);
  assert.equal(summary.measurement, 'browser');
  assert.equal(summary.byKind.rir.samples, 5);
  assert.equal(summary.byKind.rir.medianMs, 30);
  assert.equal(summary.byKind.rir.p95Ms, 100);
  assert.equal(summary.byKind.done.samples, 0);
  assert.equal(summary.byKind.done.medianMs, null);
}

function testAliasIndexIsReused() {
  resetSharedCatalogAliasIndexCache();
  const catalog = Array.from({ length: 800 }, (_, index) => ({
    id: `cat-${index}`,
    name: index === 10 ? 'Back Squat' : `Exercise ${index}`,
  }));
  catalog.push({ id: 'cat-squat', name: 'Back Squat' });
  const rows = Array.from({ length: 300 }, (_, index) => ({
    id: `log-${index}`,
    user_id: 'user-1',
    log_date: '2026-10-01',
    actual_weight: '100',
    actual_reps: '5',
    actual_rir: '2',
    snapshot_catalog_exercise_id: index % 4 === 0 ? 'cat-10' : 'cat-squat',
    snapshot_exercise_name: 'Back Squat',
    snapshot_set_type: 'working',
    snapshot_set_number: 1,
    snapshot_equipment: 'barbell',
  }));
  const started = Date.now();
  for (let setNumber = 1; setNumber <= 12; setNumber++) {
    const result = classifyPreviousPerformance({
      catalog,
      catalogExerciseId: 'cat-10',
      exerciseName: 'Back Squat',
      equipment: 'barbell',
      setType: 'working',
      setNumber: 1,
      sessionDate: '2026-11-01',
      userId: 'user-1',
      rows,
    });
    assert.equal(result.kind === 'none' || result.kind === 'exact' || result.kind === 'unknown_equipment' || result.kind === 'different_equipment', true);
  }
  const elapsed = Date.now() - started;
  assert.equal(sharedCatalogAliasIndexBuilds(), 1);
  assert.ok(elapsed < 1500, `history matching took ${elapsed}ms`);
}

async function main() {
  await testLatestValueWins();
  await testOlderFailureDoesNotReplaceNewerSelection();
  await testFailedLatestStaysUnconfirmed();
  await testCoalesceRapidEdits();
  testTimingSummary();
  testAliasIndexIsReused();
  console.log('test-logger-performance: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
