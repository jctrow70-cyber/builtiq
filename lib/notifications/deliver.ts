import { sendEmail } from '../email/sendEmail';

export type NotificationEmailInput = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Future category email goes through this function, which is the only caller of Resend
 * for notification categories. BIQ-0243 does not send those emails.
 * Group invitation email stays in lib/email/groupInviteEmail.ts.
 * Push is not implemented.
 */
export async function deliverNotificationEmail(
  _input: NotificationEmailInput
): Promise<{ delivered: false; reason: 'category_email_not_enabled' }> {
  void sendEmail;
  return { delivered: false, reason: 'category_email_not_enabled' };
}
