/**
 * BIQ-0242 secure invitations and Quick Join.
 * Run: node ./node_modules/tsx/dist/cli.mjs scripts/test-group-invitations.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGroupInviteEmail } from '../lib/email/groupInviteEmail';
import {
  GROUP_INVITE_TTL_DAYS,
  canInviteGroupRole,
  deriveInviteStatus,
  evaluateInvitationAcceptance,
  quickJoinAllowed,
  quickJoinRole,
  recordGroupInvitationEvent,
} from '../lib/groups/invitationSecurity';
import { hashInviteToken, newInviteToken } from '../lib/groups/invitationToken';
import { normalizeInviteDrafts } from '../lib/groups/invites';

const sql = readFileSync('supabase/migrations/20261005_056_secure_group_invitations.sql', 'utf8');
const acceptFn = sql.slice(sql.indexOf('function public.st_accept_group_invite'), sql.indexOf('function public.st_mark_group_invite_accepted'));
const joinFn = sql.slice(sql.indexOf('function public.st_join_team_by_invite'), sql.indexOf('alter function public.st_join_team_by_invite'));
const createFn = sql.slice(sql.indexOf('function public.st_create_group_invite'), sql.indexOf('function public.st_resend_group_invite'));
const resendFn = sql.slice(sql.indexOf('function public.st_resend_group_invite'), sql.indexOf('function public.st_revoke_group_invite'));
const now = new Date('2026-10-05T12:00:00.000Z');
const later = new Date('2026-10-20T12:00:00.000Z');

assert.equal(GROUP_INVITE_TTL_DAYS, 7);
assert.match(sql, /interval '7 days'/);

// 1–5. Who can invite which role.
assert.equal(canInviteGroupRole({ callerRole: 'owner', targetRole: 'member' }), true);
assert.equal(canInviteGroupRole({ callerRole: 'owner', targetRole: 'manager' }), true);
assert.equal(canInviteGroupRole({ callerRole: 'manager', targetRole: 'member' }), true);
assert.equal(canInviteGroupRole({ callerRole: 'manager', targetRole: 'manager' }), false);
assert.equal(canInviteGroupRole({ callerRole: 'manager', targetRole: 'manager', managersCanInviteManagers: true }), true);
assert.equal(canInviteGroupRole({ callerRole: 'owner', targetRole: 'owner' }), false);
assert.equal(canInviteGroupRole({ callerRole: 'manager', targetRole: 'owner' }), false);
assert.equal(canInviteGroupRole({ callerRole: 'member', targetRole: 'member' }), false);
assert.match(createFn, /cannot create an Owner/);
assert.match(createFn, /st_user_can_invite_role/);
assert.match(sql, /managers_can_invite_managers boolean not null default false/);

const drafts = normalizeInviteDrafts([
  { email: 'Coach@Example.com', displayName: 'Coach', role: 'manager' },
  { email: 'owner@example.com', displayName: 'Nope', role: 'owner' as 'member' },
]);
assert.equal(drafts[0].email, 'coach@example.com');
assert.equal(drafts[0].role, 'manager');
assert.notEqual(drafts.some((row) => row.role === ('owner' as string)), true);

// 6–12. Acceptance decisions. The browser email is not an input.
const ready = {
  authenticated: true,
  tokenMatchesHash: true,
  status: 'pending',
  expiresAt: '2026-10-12T12:00:00.000Z',
  authenticatedEmail: 'Member@Example.com',
  invitedEmail: 'member@example.com',
  groupArchived: false,
  now,
};
assert.equal(evaluateInvitationAcceptance(ready).ok, true);
assert.equal(evaluateInvitationAcceptance({ ...ready, authenticatedEmail: 'other@example.com' }).reason, 'email_mismatch');
assert.equal(evaluateInvitationAcceptance({ ...ready, now: later }).reason, 'expired');
assert.equal(evaluateInvitationAcceptance({ ...ready, status: 'revoked' }).reason, 'revoked');
assert.equal(evaluateInvitationAcceptance({ ...ready, tokenMatchesHash: false }).reason, 'invalid');
assert.equal(evaluateInvitationAcceptance({ ...ready, status: 'accepted' }).reason, 'used');
assert.equal(evaluateInvitationAcceptance({ ...ready, groupArchived: true }).reason, 'archived');
assert.match(acceptFn, /from auth.users/);
assert.match(acceptFn, /different email address/);
assert.match(acceptFn, /This invitation has expired/);
assert.match(acceptFn, /This invitation was canceled/);
assert.match(acceptFn, /already been used/);
assert.match(acceptFn, /not accepting members/);
assert.match(acceptFn, /already_accepted/);
const acceptedGuard = acceptFn.indexOf('already_accepted');
const memberInsert = acceptFn.indexOf('insert into public.st_team_members');
assert.ok(acceptedGuard >= 0 && memberInsert > acceptedGuard);

// 10–11. Resend replaces the only hash. The previous token no longer matches.
const original = newInviteToken();
const replacement = newInviteToken();
assert.notEqual(original, replacement);
const originalHash = hashInviteToken(original);
const replacementHash = hashInviteToken(replacement);
assert.notEqual(originalHash, original);
assert.equal(hashInviteToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.notEqual(originalHash, replacementHash);
assert.equal(evaluateInvitationAcceptance({ ...ready, tokenMatchesHash: originalHash === replacementHash }).ok, false);
assert.match(resendFn, /token_hash = v_hash/);
assert.match(resendFn, /interval '7 days'/);
assert.match(resendFn, /Only a pending invitation can be resent/);

// 13. Archived groups.
assert.match(joinFn, /is_archived/);
assert.match(acceptFn, /is_archived/);

// 14. One membership row per person.
assert.match(acceptFn, /on conflict \(team_id, user_id\)/);
assert.match(joinFn, /on conflict \(team_id, user_id\)/);

// 15. A removed member is reactivated with the invited role. Quick Join reactivates as Member.
assert.match(acceptFn, /role = excluded.role/);
assert.match(joinFn, /else 'member'/);

// 16. Classifications stored on the invitation are applied. They are not chosen again at acceptance.
assert.match(sql, /classification_ids uuid\[\]/);
assert.match(acceptFn, /st_group_member_classifications/);
assert.match(acceptFn, /v_row.classification_ids/);
assert.doesNotMatch(acceptFn, /p_classification_ids/);

// 17–19. Quick Join is Member-only, can be disabled, and regenerate replaces the only code.
assert.equal(quickJoinRole(), 'member');
assert.equal(quickJoinAllowed({ codeMatches: true, enabled: true, archived: false }), true);
assert.equal(quickJoinAllowed({ codeMatches: true, enabled: false, archived: false }), false);
assert.equal(quickJoinAllowed({ codeMatches: true, enabled: true, archived: true }), false);
assert.equal(quickJoinAllowed({ codeMatches: false, enabled: true, archived: false }), false);
assert.match(joinFn, /'member'/);
assert.doesNotMatch(joinFn, /'manager'/);
assert.match(joinFn, /Quick Join is turned off/);
assert.match(sql, /function public.st_regenerate_group_code/);
assert.match(sql, /set code = v_code/);
assert.doesNotMatch(joinFn, /where invite_code|t\.invite_code/);
assert.match(joinFn, /st_group_quick_join/);

// 20–21. Group join writes the group participation slot only.
assert.match(sql, /function public.st_ensure_group_participation/);
assert.match(sql, /'group:' \|\| p_team_id::text/);
assert.match(sql, /source_kind = 'group'/);
assert.match(sql, /source_key <> 'personal'/);
assert.match(sql, /Refusing to change personal training/);
assert.doesNotMatch(sql, /followed_program_id\s*=/);
assert.doesNotMatch(sql, /update\s+public\.st_profiles/i);

// 22. The raw token is not a database column.
assert.match(sql, /token_hash text/);
assert.doesNotMatch(sql, /add column if not exists token text/);
assert.match(createFn, /token_hash, expires_at/);
assert.match(createFn, /v_hash, v_expires/);
assert.match(sql, /revoke select \(token_hash\)/);

// Legacy pending code invites are revoked and are not secure Manager grants.
assert.match(sql, /Code-based pending invites have no token/);
assert.match(sql, /status = 'pending'\s+and token_hash is null/);
assert.match(sql, /Intentionally empty/);

// Status is derived. Expired stays pending in storage until a later cleanup.
assert.equal(deriveInviteStatus('pending', '2026-10-01T00:00:00.000Z', now), 'expired');
assert.equal(deriveInviteStatus('pending', '2026-10-12T00:00:00.000Z', now), 'pending');
assert.equal(deriveInviteStatus('revoked', '2026-10-12T00:00:00.000Z', now), 'revoked');
assert.equal(deriveInviteStatus('accepted', null, now), 'accepted');

const email = buildGroupInviteEmail({
  to: 'member@example.com',
  groupName: 'Family Fitness',
  inviterName: 'Jesse',
  roleLabel: 'Member',
  joinUrl: 'https://example.com/invite/abc123',
  expiresAt: '2026-10-12T00:00:00.000Z',
});
assert.match(email.subject, /Jesse invited you to join Family Fitness on BuildIQ Health/);
assert.match(email.html, /Join Group/);
assert.match(email.text, /https:\/\/example.com\/invite\/abc123/);
assert.doesNotMatch(email.text, /invite code/i);
assert.doesNotMatch(email.html, /invite code/i);
assert.doesNotMatch(email.html, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

const event = recordGroupInvitationEvent({ type: 'group_invitation', inviteId: 'inv', teamId: 'team' });
assert.equal(event.type, 'group_invitation');

console.log('group invitation tests passed');
