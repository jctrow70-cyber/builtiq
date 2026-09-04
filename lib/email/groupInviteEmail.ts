import { hasEmailConfig, sendEmail } from './sendEmail';

export type GroupInviteEmailInput = {
  to: string;
  groupName: string;
  inviteCode: string;
  inviterName?: string | null;
  inviteeName?: string | null;
  roleLabel?: string | null;
  appUrl?: string | null;
};

export function buildGroupInviteEmail(input: GroupInviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const app = (input.appUrl || '').replace(/\/$/, '') || 'https://builtiq-duf7.vercel.app';
  const inviter = input.inviterName?.trim() || 'A BuildIQ Health coach';
  const hello = input.inviteeName?.trim() ? `Hi ${input.inviteeName.trim()},` : 'Hi,';
  const role = input.roleLabel?.trim() || 'Member';
  const subject = `Join ${input.groupName} on BuildIQ Health`;
  const text = [
    hello,
    '',
    `${inviter} invited you to join "${input.groupName}" on BuildIQ Health as a ${role}.`,
    '',
    'How to join:',
    `1. Open ${app}`,
    '2. Sign in or create an account',
    '3. Go to Groups → Join Team',
    `4. Enter invite code: ${input.inviteCode}`,
    '',
    'If you already have BuildIQ Health installed, open the app and use the same code.',
    '',
    '— BuildIQ Health',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#0f172a">
      <p>${hello}</p>
      <p><b>${escapeHtml(inviter)}</b> invited you to join <b>${escapeHtml(input.groupName)}</b> on BuildIQ Health as a <b>${escapeHtml(role)}</b>.</p>
      <ol>
        <li>Open <a href="${escapeHtml(app)}">${escapeHtml(app)}</a></li>
        <li>Sign in or create an account</li>
        <li>Go to <b>Groups → Join Team</b></li>
        <li>Enter invite code: <code style="font-size:16px;font-weight:700">${escapeHtml(input.inviteCode)}</code></li>
      </ol>
      <p style="color:#64748b;font-size:13px">If you already have BuildIQ Health installed, open the app and use the same code.</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendGroupInviteEmail(input: GroupInviteEmailInput): Promise<{ ok: boolean; error?: string; emailed: boolean }> {
  if (!hasEmailConfig()) {
    return { ok: true, emailed: false, error: 'Email is not configured on this deploy. Share the invite code manually.' };
  }
  const built = buildGroupInviteEmail(input);
  const result = await sendEmail({
    to: [input.to],
    subject: built.subject,
    text: built.text,
    html: built.html,
  });
  if (!result.ok) return { ok: false, emailed: false, error: result.error };
  return { ok: true, emailed: true };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
