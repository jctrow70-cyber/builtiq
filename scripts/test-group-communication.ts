/**
 * BIQ-0244 group communication.
 * Run: node ./node_modules/tsx/dist/cli.mjs scripts/test-group-communication.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_GROUP_PERMISSIONS } from '../lib/groups/groupPermissions';
import {
  DEFAULT_GROUP_COMMUNICATION,
  MESSAGE_MAX_LENGTH,
  canReadDirectConversation,
  canSendDirectMessage,
  canSendGroupChat,
  canStartDirectConversation,
  canUseGroupChat,
  conversationUnreadCount,
  directParticipantKey,
  groupCommunicationFlags,
  messageNotificationDedupe,
  notificationReadMarksChatRead,
  shouldNotifyMessageRecipient,
  unreadConversationBadge,
  validateMessageBody,
} from '../lib/groups/communication';

const sql = readFileSync('supabase/migrations/20261005_058_group_communication.sql', 'utf8');
const notificationsSql = readFileSync('supabase/migrations/20261005_057_notification_foundation.sql', 'utf8');
const hub = readFileSync('app/components/groups/GroupsHub.tsx', 'utf8');
const messagesUi = readFileSync('app/components/groups/GroupMessages.tsx', 'utf8');
const settings = readFileSync('app/components/groups/TeamSettingsTab.tsx', 'utf8');
const memberDetail = readFileSync('app/components/groups/TeamMemberDetail.tsx', 'utf8');
const bell = readFileSync('app/components/notifications/NotificationCenter.tsx', 'utf8');

const flags = { ...DEFAULT_GROUP_COMMUNICATION };
const chatOff = { ...flags, members_can_use_group_chat: false };
const managersOff = { ...flags, members_can_message_managers: false };
const membersOn = { ...flags, members_can_message_members: true };

function functionBody(source: string, name: string) {
  const marker = `function public.${name}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, name);
  const next = source.indexOf('create or replace function', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

assert.deepEqual(DEFAULT_GROUP_PERMISSIONS, {
  members_can_create_shared_workouts: false,
  members_can_edit_shared_workouts: false,
  members_can_assign_workouts: false,
  members_can_view_member_progress: false,
});

assert.deepEqual(DEFAULT_GROUP_COMMUNICATION, {
  members_can_use_group_chat: true,
  members_can_message_managers: true,
  members_can_message_members: false,
});
assert.equal(groupCommunicationFlags(null).members_can_message_members, false);
assert.equal(groupCommunicationFlags({ members_can_use_group_chat: false }).members_can_use_group_chat, false);

assert.match(sql, /st_conversations_one_primary_group_chat/);
assert.match(sql, /where conversation_type = 'group'/);
assert.match(functionBody(sql, 'st_ensure_group_conversation'), /'group'/);
assert.match(sql, /constraint st_conversations_type_check check \(conversation_type in \('group', 'direct'\)\)/);
assert.match(sql, /classification can be added later/);

assert.equal(canUseGroupChat({ role: 'owner', active: true, flags: chatOff }), true);
assert.equal(canUseGroupChat({ role: 'manager', active: true, flags: chatOff }), true);
assert.equal(canUseGroupChat({ role: 'editor', active: true, flags: chatOff }), true);
assert.equal(canUseGroupChat({ role: 'member', active: true, flags }), true);
assert.equal(canSendGroupChat({ role: 'member', active: true, flags: chatOff }), false);
assert.equal(canUseGroupChat({ role: 'member', active: false, flags }), false);
assert.match(functionBody(sql, 'st_chat_user_can_read'), /members_can_use_group_chat/);
assert.match(functionBody(sql, 'st_chat_user_can_read'), /v_role in \('owner', 'manager'\)/);

assert.equal(
  canSendDirectMessage({
    callerRole: 'member',
    callerActive: true,
    otherRole: 'manager',
    otherActive: true,
    isParticipant: true,
    flags,
  }),
  true
);
assert.equal(
  canSendDirectMessage({
    callerRole: 'member',
    callerActive: true,
    otherRole: 'owner',
    otherActive: true,
    isParticipant: true,
    flags: managersOff,
  }),
  false
);
assert.equal(canReadDirectConversation({ active: true, isParticipant: true }), true);
assert.match(functionBody(sql, 'st_chat_user_can_send'), /members_can_message_managers/);

assert.equal(
  canStartDirectConversation({
    callerRole: 'member',
    callerActive: true,
    targetRole: 'member',
    targetActive: true,
    samePerson: false,
    flags,
  }),
  false
);
assert.equal(
  canStartDirectConversation({
    callerRole: 'member',
    callerActive: true,
    targetRole: 'member',
    targetActive: true,
    samePerson: false,
    flags: membersOn,
  }),
  true
);
assert.match(sql, /members_can_message_members boolean not null default false/);

const pairKey = directParticipantKey('user-b', 'user-a');
assert.equal(pairKey, directParticipantKey('user-a', 'user-b'));
assert.equal(pairKey, 'user-a:user-b');
assert.match(sql, /constraint st_conversations_team_participant_key unique \(team_id, participant_key\)/);
assert.match(functionBody(sql, 'st_open_direct_conversation'), /on conflict on constraint st_conversations_team_participant_key do nothing/);

const sendBody = functionBody(sql, 'st_send_message');
assert.match(sendBody, /st_send_message\(p_conversation_id uuid, p_body text\)/);
assert.doesNotMatch(sendBody, /p_sender/);
assert.match(sendBody, /'sender_user_id', auth\.uid\(\)/);
assert.match(sendBody, /values \(p_conversation_id, auth\.uid\(\), v_body\)/);

const readBody = functionBody(sql, 'st_chat_user_can_read');
assert.match(readBody, /v_role := public\.st_chat_member_role/);
assert.match(readBody, /if v_role is null then/);
assert.match(functionBody(sql, 'st_chat_member_role'), /m\.status = 'active'/);
assert.equal(canReadDirectConversation({ active: false, isParticipant: true }), false);
assert.match(sql, /using \(public\.st_user_can_read_conversation\(conversation_id\)\)/);

const editBody = functionBody(sql, 'st_edit_message');
assert.match(editBody, /sender_user_id = auth\.uid\(\)/);
assert.match(editBody, /v_sender is distinct from auth\.uid\(\)/);
assert.match(editBody, /edited_at = clock_timestamp\(\)/);

const deleteBody = functionBody(sql, 'st_delete_message');
assert.match(deleteBody, /sender_user_id = auth\.uid\(\)/);
assert.match(deleteBody, /set body = ''/);
assert.match(deleteBody, /deleted_at = coalesce\(deleted_at, clock_timestamp\(\)\)/);
assert.doesNotMatch(sql, /delete\s+from\s+public\.st_messages/i);
assert.match(sql, /deleted_at is not null and body = ''/);

assert.equal(validateMessageBody('   '), 'empty');
assert.equal(validateMessageBody(''), 'empty');
assert.match(sendBody, /raise exception 'Message is empty'/);
assert.equal(validateMessageBody('x'.repeat(MESSAGE_MAX_LENGTH)), 'ok');
assert.equal(validateMessageBody('x'.repeat(MESSAGE_MAX_LENGTH + 1)), 'too_long');
assert.equal(MESSAGE_MAX_LENGTH, 2000);
assert.match(sendBody, /char_length\(v_body\) > 2000/);
assert.match(sql, /char_length\(body\) <= 2000/);

const amy = 'amy';
const jesse = 'jesse';
const unread = conversationUnreadCount({
  viewerUserId: amy,
  lastReadAt: '2026-10-06T12:00:00.000Z',
  messages: [
    { senderUserId: jesse, createdAt: '2026-10-06T12:01:00.000Z' },
    { senderUserId: jesse, createdAt: '2026-10-06T12:02:00.000Z' },
    { senderUserId: jesse, createdAt: '2026-10-06T12:03:00.000Z' },
    { senderUserId: amy, createdAt: '2026-10-06T12:04:00.000Z' },
    { senderUserId: jesse, createdAt: '2026-10-06T11:00:00.000Z' },
    { senderUserId: jesse, createdAt: '2026-10-06T12:05:00.000Z', deletedAt: '2026-10-06T12:06:00.000Z' },
  ],
});
assert.equal(unread, 3);
assert.equal(conversationUnreadCount({ viewerUserId: jesse, lastReadAt: null, messages: [{ senderUserId: jesse, createdAt: '2026-10-06T12:01:00.000Z' }] }), 0);

assert.equal(unreadConversationBadge([3, 0, 2, 0]), 2);
assert.equal(unreadConversationBadge([0, 0]), 0);
const badgeFn = functionBody(sql, 'st_group_unread_conversation_count');
assert.match(badgeFn, /st_conversation_unread_count\(c\.id, auth\.uid\(\)\) > 0/);
assert.doesNotMatch(badgeFn, /st_notifications/);
assert.doesNotMatch(functionBody(sql, 'st_conversation_unread_count'), /st_notifications/);
assert.match(hub, /st_group_unread_conversation_count/);
assert.doesNotMatch(hub, /st_notifications/);
assert.match(hub, /conversations with unread messages/);

const markChat = functionBody(sql, 'st_mark_conversation_read');
assert.match(markChat, /last_read_at = clock_timestamp\(\)/);
assert.match(markChat, /n\.user_id = auth\.uid\(\)/);
assert.match(messagesUi, /st_mark_conversation_read/);
const markBell = functionBody(notificationsSql, 'st_mark_notification_read');
assert.doesNotMatch(markBell, /st_conversation_members/);
assert.doesNotMatch(markBell, /last_read_at/);
assert.equal(notificationReadMarksChatRead(), false);
assert.match(bell, /st_mark_notification_read/);
assert.doesNotMatch(bell, /st_mark_conversation_read/);
assert.doesNotMatch(sql, /function public\.st_mark_notification_read/);
assert.doesNotMatch(sql, /function public\.st_publish_notification/);

const listBody = functionBody(sql, 'st_list_messages');
assert.match(listBody, /\(m\.created_at, m\.id\) < \(p_before_created_at, p_before_id\)/);
assert.match(listBody, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 50\)/);
assert.doesNotMatch(listBody, /offset/i);
assert.match(messagesUi, /Load older messages/);
assert.match(messagesUi, /p_before_created_at/);

assert.match(sendBody, /insert into public\.st_messages/);
assert.match(sql, /alter publication supabase_realtime add table public\.st_messages/);
assert.match(sql, /replica identity full/);
assert.match(messagesUi, /postgres_changes/);
assert.match(messagesUi, /loadLatest/);

const notify = functionBody(sql, 'st_notify_conversation_message');
assert.match(notify, /direct_message/);
assert.match(notify, /group_message/);
assert.match(notify, /m\.user_id <> v_sender/);
assert.match(notify, /sent you /);
assert.equal(shouldNotifyMessageRecipient('jesse', 'jesse'), false);
assert.equal(shouldNotifyMessageRecipient('jesse', 'amy'), true);

const upsert = functionBody(sql, 'st_upsert_conversation_notification');
assert.match(upsert, /on conflict \(user_id, dedupe_key\) do update/);
assert.match(upsert, /read_at = null/);
assert.match(upsert, /p_event_type \|\| ':' \|\| p_conversation_id::text \|\| ':' \|\| p_user_id::text/);
assert.doesNotMatch(upsert, /p_message_id/);
assert.match(upsert, /st_notification_in_app_enabled/);
assert.match(upsert, /p_user_id = p_actor_user_id/);
assert.match(notificationsSql, /on conflict \(user_id, dedupe_key\) do nothing/);
assert.equal(messageNotificationDedupe('direct_message', 'conv-1', 'amy'), messageNotificationDedupe('direct_message', 'conv-1', 'amy'));
assert.notEqual(messageNotificationDedupe('direct_message', 'conv-1', 'amy'), messageNotificationDedupe('group_message', 'conv-1', 'amy'));

assert.match(sql, /A leftover st_conversation_members row is not enough/);
assert.match(readBody, /return false/);

assert.match(settings, /Members can use Group Chat/);
assert.match(settings, /Members can message managers/);
assert.match(settings, /Members can message members/);
assert.match(settings, /Only the Owner can change these/);
assert.match(memberDetail, /Message member/);
assert.match(messagesUi, /Message deleted/);
assert.match(messagesUi, /edited/);
assert.match(messagesUi, /maxLength=\{2000\}/);
assert.doesNotMatch(messagesUi, /email/i);
assert.match(sql, /Do not copy that data into the message body/);
assert.doesNotMatch(sql, /reference jsonb|attachment|reaction/i);

console.log('group communication tests passed');
