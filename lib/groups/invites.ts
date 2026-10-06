export type GroupInviteRole = 'member' | 'manager';

export type GroupInviteDraft = {
  email: string;
  displayName: string;
  role: GroupInviteRole;
  classificationId?: string | null;
};

export type GroupInviteRecord = {
  id: string;
  team_id: string;
  email: string;
  display_name?: string | null;
  role: string;
  status: string;
  display_status?: string;
  classification_ids?: string[] | null;
  expires_at?: string | null;
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
    const classificationId = String(draft.classificationId || '').trim();
    out.push({
      email,
      displayName: String(draft.displayName || '').trim(),
      role: draft.role === 'manager' ? 'manager' : 'member',
      classificationId: classificationId || null,
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
  joinUrl: string;
  inviterName?: string | null;
}): string {
  const inviter = input.inviterName?.trim() || 'A BuildIQ Health member';
  const subject = encodeURIComponent(`${inviter} invited you to join ${input.groupName} on BuildIQ Health`);
  const body = encodeURIComponent(
    `${inviter} invited you to join ${input.groupName} on BuildIQ Health.\n\nJoin Group: ${input.joinUrl}\n`
  );
  return `mailto:${encodeURIComponent(input.email)}?subject=${subject}&body=${body}`;
}
