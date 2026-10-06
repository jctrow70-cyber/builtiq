/**
 * BIQ-0243 notification foundation.
 * Run: node ./node_modules/tsx/dist/cli.mjs scripts/test-notifications.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliverNotificationEmail } from '../lib/notifications/deliver';
import {
  canManagePreferences,
  canMarkNotificationRead,
  canReadNotification,
  categoryForEvent,
  defaultChannelEnabled,
  formatNotificationTime,
  idsToMarkAllRead,
  invitationAcceptedDedupeKey,
  invitationDedupeKey,
  isDuplicateNotification,
  notificationExposesEmail,
  programAssignedDedupeKey,
  shouldCreateInvitationNotification,
  unreadCount,
  workoutAssignedDedupeKey,
  type NotificationRecord,
} from '../lib/notifications/policy';

const sql = readFileSync('supabase/migrations/20261005_057_notification_foundation.sql', 'utf8');
const inviteRoute = readFileSync('app/api/groups/invite/route.ts', 'utf8');
const inviteEmail = readFileSync('lib/email/groupInviteEmail.ts', 'utf8');
const now = new Date('2026-10-05T18:00:00.000Z');

const mine: NotificationRecord = {
  id: 'n1',
  userId: 'user-a',
  eventType: 'workout_assigned',
  title: 'Upper Body Strength',
  body: 'Jesse assigned you Upper Body Strength.',
  createdAt: '2026-10-05T17:00:00.000Z',
  readAt: null,
};
const theirs: NotificationRecord = { ...mine, id: 'n2', userId: 'user-b', title: 'Other' };
const readMine: NotificationRecord = { ...mine, id: 'n3', readAt: '2026-10-05T17:30:00.000Z' };

// 1–4. Ownership of read and mark-read.
assert.equal(canReadNotification('user-a', mine.userId), true);
assert.equal(canReadNotification('user-a', theirs.userId), false);
assert.equal(canReadNotification(null, mine.userId), false);
assert.equal(canMarkNotificationRead('user-a', mine.userId), true);
assert.equal(canMarkNotificationRead('user-b', mine.userId), false);
assert.match(sql, /notifications_select_own/);
assert.match(sql, /using \(user_id = auth\.uid\(\)\)/);
assert.match(sql, /revoke insert, update, delete on public\.st_notifications/);
assert.match(sql, /where id = p_id\s+and user_id = auth\.uid\(\)/);

// 5–6. Unread count and mark-all stay on the current user.
assert.equal(unreadCount([mine, theirs, readMine], 'user-a'), 1);
assert.equal(unreadCount([mine, theirs, readMine], 'user-b'), 1);
assert.deepEqual(idsToMarkAllRead([mine, theirs, readMine], 'user-a'), ['n1']);
assert.match(sql, /st_mark_all_notifications_read/);
assert.match(sql, /where user_id = auth\.uid\(\)\s+and read_at is null/);

// 7. Preferences belong to the current user.
assert.equal(canManagePreferences('user-a', 'user-a'), true);
assert.equal(canManagePreferences('user-a', 'user-b'), false);
assert.match(sql, /notification_preferences_select_own/);
assert.match(sql, /notification_preferences_update_own/);
assert.equal(defaultChannelEnabled('in_app'), true);
assert.equal(defaultChannelEnabled('email'), false);
assert.equal(defaultChannelEnabled('push'), false);

// 8–10. Invitation notifications.
assert.equal(shouldCreateInvitationNotification('existing-user'), true);
assert.equal(shouldCreateInvitationNotification(null), false);
assert.match(sql, /from auth\.users u/);
assert.match(sql, /if v_user is null or v_user = new\.invited_by then/);
assert.match(sql, /group_invitation_accepted/);
assert.match(sql, /new\.invited_by is null or new\.invited_by = new\.accepted_by_user_id/);
assert.equal(invitationDedupeKey('inv-1', 'hash-a'), 'group_invitation:inv-1:hash-a');
assert.notEqual(invitationDedupeKey('inv-1', 'hash-a'), invitationDedupeKey('inv-1', 'hash-b'));
assert.equal(invitationAcceptedDedupeKey('inv-1'), 'group_invitation_accepted:inv-1');

// 11–12. Assignment notifications are one per domain action.
assert.equal(categoryForEvent('program_assigned'), 'training_assignments');
assert.equal(categoryForEvent('workout_assigned'), 'training_assignments');
assert.equal(categoryForEvent('program_updated'), 'program_updates');
assert.equal(categoryForEvent('direct_message'), 'messages');
assert.equal(categoryForEvent('group_message'), 'messages');
assert.match(sql, /st_notify_program_assignment/);
assert.match(sql, /p_assignment_type not in \('team', 'individual_team', 'manual'\)/);
assert.match(sql, /st_notify_workout_recipient/);
assert.equal(programAssignedDedupeKey('asg-1'), 'program_assigned:asg-1');
assert.equal(workoutAssignedDedupeKey('asg-1', 'user-b'), 'workout_assigned:asg-1:user-b');
assert.notEqual(workoutAssignedDedupeKey('asg-1', 'user-b'), workoutAssignedDedupeKey('asg-1', 'user-c'));

// 13. The same dedupe key does not create a second row. A new id can.
assert.equal(isDuplicateNotification(['program_assigned:asg-1'], programAssignedDedupeKey('asg-1')), true);
assert.equal(isDuplicateNotification(['program_assigned:asg-1'], programAssignedDedupeKey('asg-2')), false);
assert.match(sql, /on conflict \(user_id, dedupe_key\) do nothing/);
assert.match(sql, /st_notifications_dedupe_uidx/);

// 14. Payloads do not carry email addresses or copied workouts.
assert.equal(notificationExposesEmail('Upper Body Strength', 'Jesse assigned you Upper Body Strength.'), false);
assert.equal(notificationExposesEmail('Invite', 'Sent to member@example.com'), true);
assert.match(sql, /coalesce\(v_name, 'Someone'\)/);
assert.doesNotMatch(sql, /u\.email \|\|/);
assert.doesNotMatch(sql, /new\.email \|\|/);
assert.match(sql, /destination_id/);
assert.doesNotMatch(sql, /st_planned_sets|st_exercises/);

// 15. Invitation email remains its own Resend path.
assert.match(inviteRoute, /sendGroupInviteEmail/);
assert.doesNotMatch(inviteRoute, /deliverNotificationEmail/);
assert.match(inviteEmail, /Join Group/);
assert.doesNotMatch(inviteEmail, /deliverNotificationEmail/);
deliverNotificationEmail({ to: 'member@example.com', subject: 'Hi', text: 'Hi' }).then((deferred) => {
  assert.equal(deferred.delivered, false);
  assert.equal(deferred.reason, 'category_email_not_enabled');
  console.log('notification tests passed');
});

// Unread badge can use the partial index instead of loading every row.
assert.match(sql, /st_notifications_unread_user_idx/);
assert.match(sql, /where read_at is null/);

// Chat and push are modeled, not built.
assert.match(sql, /'group_message'/);
assert.match(sql, /'direct_message'/);
assert.match(sql, /Not the group activity feed and not chat unread state/);
assert.doesNotMatch(sql, /create table if not exists public\.st_messages/);
assert.equal(formatNotificationTime('2026-10-05T17:30:00.000Z', now), '30m ago');
