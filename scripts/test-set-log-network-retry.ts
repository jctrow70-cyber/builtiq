/**
 * BIQ-0273 — transient Safari "Load failed" retries for set logging.
 * Run: npx tsx scripts/test-set-log-network-retry.ts
 */
import assert from 'node:assert/strict';
import {
  friendlyWriteError,
  isTransientNetworkError,
  retryTransientSupabaseWrite,
} from '../lib/networkErrors';

assert.equal(isTransientNetworkError({ message: 'Load failed' }), true);
assert.equal(isTransientNetworkError({ message: 'TypeError: Load failed' }), true);
assert.equal(isTransientNetworkError(new TypeError('Load failed')), true);
assert.equal(isTransientNetworkError({ message: 'Failed to fetch' }), true);
assert.equal(isTransientNetworkError({ message: 'duplicate key value' }), false);
assert.equal(isTransientNetworkError({ message: '' }), false);
assert.equal(isTransientNetworkError(null), false);

assert.match(friendlyWriteError({ message: 'TypeError: Load failed' }), /try again/i);
assert.match(friendlyWriteError({ message: 'Load failed' }), /Load failed \/ network/i);
assert.equal(friendlyWriteError({ message: 'column actual_rir does not exist' }), 'column actual_rir does not exist');

async function main() {
  let attempts = 0;
  const recovered = await retryTransientSupabaseWrite(
    async () => {
      attempts += 1;
      if (attempts < 3) return { data: null, error: { message: 'Load failed' } };
      return { data: { id: 'ok' }, error: null };
    },
    { attempts: 3, delayMs: 1 }
  );
  assert.equal(attempts, 3);
  assert.equal(recovered.error, null);
  assert.equal(recovered.data?.id, 'ok');

  let schemaAttempts = 0;
  const schema = await retryTransientSupabaseWrite(
    async () => {
      schemaAttempts += 1;
      return { data: null, error: { message: 'column foo does not exist' } };
    },
    { attempts: 3, delayMs: 1 }
  );
  assert.equal(schemaAttempts, 1);
  assert.match(String(schema.error?.message || ''), /column foo/);

  let throwAttempts = 0;
  const thrown = await retryTransientSupabaseWrite(
    async () => {
      throwAttempts += 1;
      if (throwAttempts < 2) throw new TypeError('Load failed');
      return { data: { id: 'after-throw' }, error: null };
    },
    { attempts: 3, delayMs: 1 }
  );
  assert.equal(throwAttempts, 2);
  assert.equal(thrown.data?.id, 'after-throw');

  console.log('test-set-log-network-retry: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
