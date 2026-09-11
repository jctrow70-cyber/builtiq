/**
 * BIQ-0174: member-readable program statuses (matches RLS migration).
 * Run: npx tsx scripts/test-member-program-visibility.ts
 */
import assert from 'node:assert/strict';
import {
  isMemberReadableProgramStatus,
  MEMBER_READABLE_PROGRAM_STATUSES,
} from '../lib/programDesign/lifecycle';

assert.deepEqual(MEMBER_READABLE_PROGRAM_STATUSES, [
  'published',
  'scheduled',
  'active',
  'completed',
]);

assert.equal(isMemberReadableProgramStatus('published'), true);
assert.equal(isMemberReadableProgramStatus('scheduled'), true);
assert.equal(isMemberReadableProgramStatus('active'), true);
assert.equal(isMemberReadableProgramStatus('completed'), true);
assert.equal(isMemberReadableProgramStatus('draft'), false);
assert.equal(isMemberReadableProgramStatus('archived'), false);
assert.equal(isMemberReadableProgramStatus(null), true); // defaults to published
assert.equal(isMemberReadableProgramStatus(''), true);

console.log('test-member-program-visibility: ok');
