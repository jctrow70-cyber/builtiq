export type SendEmailInput = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

export function hasEmailConfig(): boolean {
  return !!(process.env.RESEND_API_KEY && getEmailFrom());
}

function getEmailFrom(): string {
  return (
    process.env.BUILDIQ_EMAIL_FROM ||
    process.env.RESEND_FROM ||
    'BuildIQ Health <onboarding@resend.dev>'
  );
}

/** Send email via Resend HTTP API (server only). */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY || '';
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured' };

  const to = input.to.map((e) => e.trim()).filter(Boolean);
  if (!to.length) return { ok: false, error: 'No recipients configured' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getEmailFrom(),
        to,
        subject: input.subject,
        text: input.text,
        html: input.html || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: body || `Resend request failed (${res.status})` };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Email send failed' };
  }
}
