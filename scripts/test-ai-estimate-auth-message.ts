/**
 * BIQ-0269 — Auth session missing message mapping for AI nutrition estimate.
 * Run: npx tsx scripts/test-ai-estimate-auth-message.ts
 */
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

async function main() {
  const { friendlyAuthError, friendlySessionExpiredMessage } = await import('../lib/supabaseClient');

  assert.equal(
    friendlySessionExpiredMessage('Auth session missing!'),
    'Your sign-in expired. Please sign out and sign back in, then try again.'
  );
  assert.equal(
    friendlySessionExpiredMessage('session_not_found'),
    'Your sign-in expired. Please sign out and sign back in, then try again.'
  );
  assert.equal(friendlySessionExpiredMessage('Describe your food'), null);
  assert.equal(
    friendlyAuthError('Auth session missing!'),
    'Your sign-in expired. Please sign out and sign back in, then try again.'
  );
  console.log('test-ai-estimate-auth-message: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
