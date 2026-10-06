import { hasEmailConfig, sendEmail } from './sendEmail';

export type GroupInviteEmailInput = {
  to: string;
  groupName: string;
  inviterName?: string | null;
  inviteeName?: string | null;
  roleLabel?: string | null;
  joinUrl: string;
  expiresAt?: string | null;
};

export function buildGroupInviteEmail(input: GroupInviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const inviter = input.inviterName?.trim() || 'Someone';
  const hello = input.inviteeName?.trim() ? `Hi ${input.inviteeName.trim()},` : 'Hi,';
  const role = input.roleLabel?.trim() || 'Member';
  const expires = formatExpiry(input.expiresAt);
  const subject = `${inviter} invited you to join ${input.groupName} on BuildIQ Health`;
  const text = [
    hello,
    '',
    `${inviter} invited you to join ${input.groupName} on BuildIQ Health.`,
    `You would join as a ${role}.`,
    expires ? `This invitation expires on ${expires}.` : '',
    '',
    `Join Group: ${input.joinUrl}`,
    '',
    'If you do not have a BuildIQ Health account yet, create one from that page. You will come back to this invitation.',
    '',
    '— BuildIQ Health',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#0f172a;max-width:520px">
      <p style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin:0 0 12px">BuildIQ Health</p>
      <p>${escapeHtml(hello)}</p>
      <p><b>${escapeHtml(inviter)}</b> invited you to join <b>${escapeHtml(input.groupName)}</b> on BuildIQ Health.</p>
      <p>You would join as a <b>${escapeHtml(role)}</b>.</p>
      ${expires ? `<p>This invitation expires on ${escapeHtml(expires)}.</p>` : ''}
      <p style="margin:24px 0">
        <a href="${escapeHtml(input.joinUrl)}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Join Group</a>
      </p>
      <p style="color:#64748b;font-size:13px">If you do not have an account yet, create one from that page. You will come back to this invitation.</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendGroupInviteEmail(
  input: GroupInviteEmailInput
): Promise<{ ok: boolean; error?: string; emailed: boolean }> {
  if (!input.joinUrl) {
    return { ok: false, emailed: false, error: 'Invitation link is missing.' };
  }
  if (!hasEmailConfig()) {
    return { ok: true, emailed: false, error: 'Email is not configured on this deploy.' };
  }
  const built = buildGroupInviteEmail(input);
  const result = await sendEmail({
    to: [input.to],
    subject: built.subject,
    text: built.text,
    html: built.html,
  });
  if (!result.ok) {
    console.error('[group-invite] email delivery failed', {
      recipientDomain: recipientDomain(input.to),
      providerStatus: safeProviderNote(result.error),
    });
    return { ok: false, emailed: false, error: 'Email could not be sent.' };
  }
  return { ok: true, emailed: true };
}

function formatExpiry(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function recipientDomain(email: string): string {
  const at = String(email || '').lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : 'unknown';
}

function safeProviderNote(error: string | undefined): string {
  const text = String(error || '');
  const status = text.match(/\((\d{3})\)/);
  if (status) return status[1];
  if (/not configured/i.test(text)) return 'not_configured';
  return 'failed';
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
