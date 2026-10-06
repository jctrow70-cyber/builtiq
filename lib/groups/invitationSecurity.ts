import { normalizeRole } from './permissions';

/** Default secure-invitation lifetime. Resend starts a new window. */
export const GROUP_INVITE_TTL_DAYS = 7;

export const GROUP_INVITE_TOKEN_STORAGE_KEY = 'biq_group_invite_token';

export type InviteListStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/**
 * Pending invitations expire by the clock. No cron is required.
 * A stored status of pending with expires_at in the past is expired.
 */
export function deriveInviteStatus(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date = new Date()
): InviteListStatus {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'accepted' || normalized === 'revoked' || normalized === 'expired') {
    return normalized;
  }
  if (normalized === 'pending') {
    if (!expiresAt) return 'expired';
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() < now.getTime()) return 'expired';
    return 'pending';
  }
  return 'expired';
}

/**
 * Owner may invite Members and Managers.
 * A Manager may invite Members.
 * A Manager may invite a Manager only when managers_can_invite_managers is on.
 * Nobody may invite an Owner.
 */
export function canInviteGroupRole(input: {
  callerRole: string | null | undefined;
  targetRole: string | null | undefined;
  managersCanInviteManagers?: boolean;
}): boolean {
  const caller = normalizeRole(input.callerRole);
  const target = String(input.targetRole || '').toLowerCase();
  if (target === 'owner') return false;
  if (target !== 'member' && target !== 'manager') return false;
  if (caller === 'owner') return true;
  if (caller === 'manager' && target === 'member') return true;
  if (caller === 'manager' && target === 'manager') return !!input.managersCanInviteManagers;
  return false;
}

export type AcceptanceDecision =
  | { ok: true; alreadyAccepted?: boolean }
  | { ok: false; reason: 'invalid' | 'email_mismatch' | 'expired' | 'revoked' | 'used' | 'archived' | 'unauthenticated' };

/**
 * Rules for accepting a secure invitation.
 * The authenticated account email is the only identity. A browser-supplied email is ignored.
 */
export function evaluateInvitationAcceptance(input: {
  authenticated: boolean;
  tokenMatchesHash: boolean;
  status: string | null | undefined;
  expiresAt: string | null | undefined;
  authenticatedEmail: string | null | undefined;
  invitedEmail: string | null | undefined;
  groupArchived: boolean;
  now?: Date;
}): AcceptanceDecision {
  if (!input.authenticated) return { ok: false, reason: 'unauthenticated' };
  if (!input.tokenMatchesHash) return { ok: false, reason: 'invalid' };
  const authEmail = String(input.authenticatedEmail || '').trim().toLowerCase();
  const invited = String(input.invitedEmail || '').trim().toLowerCase();
  if (!authEmail || authEmail !== invited) return { ok: false, reason: 'email_mismatch' };
  const status = String(input.status || '').toLowerCase();
  if (status === 'revoked') return { ok: false, reason: 'revoked' };
  if (status === 'accepted') return { ok: false, reason: 'used' };
  if (deriveInviteStatus(status, input.expiresAt, input.now) === 'expired') return { ok: false, reason: 'expired' };
  if (status !== 'pending') return { ok: false, reason: 'invalid' };
  if (input.groupArchived) return { ok: false, reason: 'archived' };
  return { ok: true };
}

/** Quick Join never assigns Manager or Owner. */
export function quickJoinRole(): 'member' {
  return 'member';
}

export function quickJoinAllowed(input: { codeMatches: boolean; enabled: boolean; archived: boolean }): boolean {
  return input.codeMatches && input.enabled && !input.archived;
}

export type GroupInvitationEvent =
  | { type: 'group_invitation'; inviteId: string; teamId: string }
  | { type: 'group_invitation_accepted'; inviteId: string; teamId: string; userId: string };

/**
 * App-level marker for a successful invitation action.
 * The in-app notification is published by the database trigger on st_group_invites.
 * The invitation email stays in the invitation route and is not sent from here.
 */
export function recordGroupInvitationEvent(event: GroupInvitationEvent): GroupInvitationEvent {
  return event;
}
