/**
 * BIQ-0243 notification policy.
 * A notification is for one user. Group activity and chat unread are separate.
 * Chat conversation unread state must not be derived from st_notifications.
 */

export const NOTIFICATION_EVENT_TYPES = [
  'group_invitation',
  'group_invitation_accepted',
  'program_assigned',
  'program_updated',
  'workout_assigned',
  'group_message',
  'direct_message',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CATEGORIES = [
  'messages',
  'training_assignments',
  'program_updates',
  'group_activity',
  'reminders',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type DestinationKind = 'group' | 'member' | 'conversation' | 'program' | 'workout' | 'progress' | 'invitation';

export type NotificationRecord = {
  id: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
};

export function categoryForEvent(eventType: string): NotificationCategory | null {
  switch (eventType) {
    case 'group_message':
    case 'direct_message':
      return 'messages';
    case 'workout_assigned':
    case 'program_assigned':
      return 'training_assignments';
    case 'program_updated':
      return 'program_updates';
    case 'group_invitation':
    case 'group_invitation_accepted':
      return 'group_activity';
    default:
      return null;
  }
}

/** In-app defaults on. Email defaults off so existing users are not mailed for every event. */
export function defaultChannelEnabled(channel: 'in_app' | 'email' | 'push'): boolean {
  return channel === 'in_app';
}

export function canReadNotification(viewerUserId: string | null | undefined, notificationUserId: string | null | undefined): boolean {
  return !!viewerUserId && viewerUserId === notificationUserId;
}

export function canMarkNotificationRead(viewerUserId: string | null | undefined, notificationUserId: string | null | undefined): boolean {
  return canReadNotification(viewerUserId, notificationUserId);
}

export function unreadNotifications(rows: NotificationRecord[], viewerUserId: string): NotificationRecord[] {
  return rows.filter((row) => canReadNotification(viewerUserId, row.userId) && !row.readAt);
}

export function unreadCount(rows: NotificationRecord[], viewerUserId: string): number {
  return unreadNotifications(rows, viewerUserId).length;
}

/** Mark-all returns only the current user's unread ids. */
export function idsToMarkAllRead(rows: NotificationRecord[], viewerUserId: string): string[] {
  return unreadNotifications(rows, viewerUserId).map((row) => row.id);
}

export function canManagePreferences(viewerUserId: string | null | undefined, preferenceUserId: string | null | undefined): boolean {
  return !!viewerUserId && viewerUserId === preferenceUserId;
}

/** An in-app invitation exists only when the email already belongs to an account. */
export function shouldCreateInvitationNotification(existingUserId: string | null | undefined): boolean {
  return !!existingUserId;
}

export function invitationDedupeKey(inviteId: string, tokenHash: string): string {
  return `group_invitation:${inviteId}:${tokenHash}`;
}

export function invitationAcceptedDedupeKey(inviteId: string): string {
  return `group_invitation_accepted:${inviteId}`;
}

export function programAssignedDedupeKey(assignmentId: string): string {
  return `program_assigned:${assignmentId}`;
}

export function workoutAssignedDedupeKey(assignmentId: string, recipientUserId: string): string {
  return `workout_assigned:${assignmentId}:${recipientUserId}`;
}

/** Same dedupe key is one notification. A new assignment id is a new event. */
export function isDuplicateNotification(existingKeys: string[], dedupeKey: string): boolean {
  return existingKeys.includes(dedupeKey);
}

const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function notificationExposesEmail(title: string, body: string): boolean {
  return EMAIL_IN_TEXT.test(`${title}\n${body}`);
}

export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const deltaMs = now.getTime() - then.getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
