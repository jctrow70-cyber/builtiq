import { getBugReportNotifyEmails } from '../appAdmin';
import { hasEmailConfig, sendEmail } from './sendEmail';

export type BugReportEmailPayload = {
  reportId: string;
  title: string | null;
  description: string;
  pageContext: string | null;
  appNav: string | null;
  userAgent: string | null;
  reporterEmail: string | null;
  createdAt: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Notify configured admins about a new bug report. Failures are non-fatal for the reporter. */
export async function notifyBugReport(payload: BugReportEmailPayload): Promise<{ ok: boolean; error?: string }> {
  if (!hasEmailConfig()) {
    return { ok: false, error: 'Email is not configured' };
  }

  const recipients = getBugReportNotifyEmails();
  if (!recipients.length) {
    return { ok: false, error: 'No bug report notification recipients configured' };
  }

  const shortId = payload.reportId.slice(0, 8);
  const subjectTitle = payload.title?.trim() || 'New bug report';
  const subject = `[BuildIQ] Bug report ${shortId}: ${subjectTitle}`;

  const lines = [
    'A new bug report was submitted in BuildIQ Health.',
    '',
    `Report ID: ${payload.reportId}`,
    `Submitted: ${payload.createdAt}`,
    `Reporter: ${payload.reporterEmail || 'unknown'}`,
    `Screen: ${payload.appNav || 'n/a'}`,
    `Title: ${payload.title || '(none)'}`,
    '',
    'Description:',
    payload.description,
    '',
    'Page context:',
    payload.pageContext || '(none)',
    '',
    'User agent:',
    payload.userAgent || '(none)',
    '',
    'View all reports in BuildIQ Health → Settings → Bug reports (admin).',
  ];

  const text = lines.join('\n');
  const html = [
    '<p>A new bug report was submitted in <b>BuildIQ Health</b>.</p>',
    '<ul>',
    `<li><b>Report ID:</b> ${escapeHtml(payload.reportId)}</li>`,
    `<li><b>Submitted:</b> ${escapeHtml(payload.createdAt)}</li>`,
    `<li><b>Reporter:</b> ${escapeHtml(payload.reporterEmail || 'unknown')}</li>`,
    `<li><b>Screen:</b> ${escapeHtml(payload.appNav || 'n/a')}</li>`,
    `<li><b>Title:</b> ${escapeHtml(payload.title || '(none)')}</li>`,
    '</ul>',
    `<p><b>Description</b></p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(payload.description)}</pre>`,
    `<p><b>Page context</b></p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(payload.pageContext || '(none)')}</pre>`,
    `<p><b>User agent</b></p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(payload.userAgent || '(none)')}</pre>`,
    '<p>View all reports in BuildIQ Health → Settings → Bug reports (admin).</p>',
  ].join('');

  return sendEmail({ to: recipients, subject, text, html });
}
