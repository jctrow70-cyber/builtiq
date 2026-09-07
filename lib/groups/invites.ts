export type GroupInviteRole = 'member' | 'manager';

export type GroupInviteDraft = {
  email: string;
  displayName: string;
  role: GroupInviteRole;
};

export type GroupInviteRecord = {
  id: string;
  team_id: string;
  email: string;
  display_name?: string | null;
  role: string;
  status: string;
  last_sent_at?: string | null;
  accepted_at?: string | null;
  created_at?: string | null;
};

export function normalizeInviteEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function isValidInviteEmail(email: string): boolean {
  const value = normalizeInviteEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeInviteDrafts(drafts: GroupInviteDraft[]): GroupInviteDraft[] {
  const seen = new Set<string>();
  const out: GroupInviteDraft[] = [];
  for (const draft of drafts) {
    const email = normalizeInviteEmail(draft.email);
    if (!isValidInviteEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      displayName: String(draft.displayName || '').trim(),
      role: draft.role === 'manager' ? 'manager' : 'member',
    });
  }
  return out;
}

export function emptyInviteDraft(): GroupInviteDraft {
  return { email: '', displayName: '', role: 'member' };
}

export function inviteMailtoHref(input: {
  email: string;
  groupName: string;
  inviteCode: string;
  inviterName?: string | null;
  appUrl?: string | null;
}): string {
  const app = (input.appUrl || '').replace(/\/$/, '') || 'BuildIQ Health';
  const inviter = input.inviterName?.trim() || 'A BuildIQ Health coach';
  const subject = encodeURIComponent(`Join ${input.groupName} on BuildIQ Health`);
  const body = encodeURIComponent(
    `${inviter} invited you to join "${input.groupName}" on BuildIQ Health.\n\n` +
      `1. Open ${app}\n` +
      `2. Sign in or create an account\n` +
      `3. Go to Groups → Join Team\n` +
      `4. Enter invite code: ${input.inviteCode}\n`
  );
  return `mailto:${encodeURIComponent(input.email)}?subject=${subject}&body=${body}`;
}
