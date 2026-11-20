/**
 * BIQ-0326 — Profile onboarding gate must not bounce completed users.
 * Run: npx tsx scripts/test-profile-onboarding-gate.ts
 */
import assert from 'node:assert/strict';
import { profileHasDisplayName, profileNeedsSetup } from '../lib/profile/onboarding';

assert.equal(profileNeedsSetup(null), true);
assert.equal(profileNeedsSetup(undefined), true);
assert.equal(profileNeedsSetup({ profile_completed: false, display_name: '' }), true);
assert.equal(profileNeedsSetup({ profile_completed: false, display_name: '   ' }), true);
assert.equal(profileNeedsSetup({ profile_completed: true, display_name: '' }), false);
assert.equal(profileNeedsSetup({ profile_completed: false, display_name: 'Jesse' }), false);
assert.equal(profileNeedsSetup({ profile_completed: null, display_name: 'Jesse' }), false);
assert.equal(profileNeedsSetup({ display_name: 'Jesse' }), false);
assert.equal(profileHasDisplayName({ display_name: 'Jesse' }), true);
assert.equal(profileHasDisplayName({ display_name: '  ' }), false);

console.log('test-profile-onboarding-gate: ok');
