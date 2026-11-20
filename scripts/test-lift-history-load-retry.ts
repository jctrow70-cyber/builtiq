/**
 * BIQ-0326 — lift history load retries transient Safari Load failed.
 * Run: npx tsx scripts/test-lift-history-load-retry.ts
 */
import assert from 'node:assert/strict';
import {
  friendlyWriteError,
  isTransientNetworkError,
  retryTransientSupabaseWrite,
} from '../lib/networkErrors';

assert.equal(isTransientNetworkError({ message: 'Load failed' }), true);

async function main() {
  let attempts = 0;
  const recovered = await retryTransientSupabaseWrite(
    async () => {
      attempts += 1;
      if (attempts < 3) return { data: null, error: { message: 'TypeError: Load failed' } };
      return {
        data: [{ id: 'log-1', actual_weight: '182', actual_reps: '8' }],
        error: null,
      };
    },
    { attempts: 3, delayMs: 1 }
  );
  assert.equal(attempts, 3);
  assert.equal(recovered.error, null);
  assert.equal(recovered.data?.[0]?.id, 'log-1');

  const failed = await retryTransientSupabaseWrite(
    async () => ({ data: null, error: { message: 'Load failed' } }),
    { attempts: 2, delayMs: 1 }
  );
  assert.match(friendlyWriteError(failed.error), /Load failed \/ network/i);

  console.log('test-lift-history-load-retry: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
