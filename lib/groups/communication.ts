import { normalizeRole } from './permissions';

/** Text-only messages in BIQ-0244. */
export const MESSAGE_MAX_LENGTH = 2000;

export type GroupCommunicationFlags = {
  members_can_use_group_chat: boolean;
  members_can_message_managers: boolean;
  members_can_message_members: boolean;
};

/**
 * Chat is new, so these are the starting switches rather than a change to
 * workout permissions. Member-to-member stays off. The owner can turn the others off.
 */
export const DEFAULT_GROUP_COMMUNICATION: GroupCommunicationFlags = {
  members_can_use_group_chat: true,
  members_can_message_managers: true,
  members_can_message_members: false,
};

type CommunicationSource = Partial<GroupCommunicationFlags> | null | undefined;

export function groupCommunicationFlags(source: CommunicationSource): GroupCommunicationFlags {
  return {
    members_can_use_group_chat: source?.members_can_use_group_chat !== false,
    members_can_message_managers: source?.members_can_message_managers !== false,
    members_can_message_members: !!source?.members_can_message_members,
  };
}

export function validateMessageBody(body: string): 'ok' | 'empty' | 'too_long' {
  const trimmed = String(body || '').trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > MESSAGE_MAX_LENGTH) return 'too_long';
  return 'ok';
}

export function canUseGroupChat(input: {
  role: string | null | undefined;
  active: boolean;
  flags: GroupCommunicationFlags;
}): boolean {
  if (!input.active) return false;
  const role = normalizeRole(input.role);
  if (role === 'owner' || role === 'manager') return true;
  return role === 'member' && input.flags.members_can_use_group_chat;
}

export function canSendGroupChat(input: {
  role: string | null | undefined;
  active: boolean;
  flags: GroupCommunicationFlags;
}): boolean {
  return canUseGroupChat(input);
}

/**
 * A member can read an existing direct conversation while they remain in the group,
 * even after the owner turns off new messages. Removal ends access.
 */
export function canReadDirectConversation(input: { active: boolean; isParticipant: boolean }): boolean {
  return input.active && input.isParticipant;
}

export function canSendDirectMessage(input: {
  callerRole: string | null | undefined;
  callerActive: boolean;
  otherRole: string | null | undefined;
  otherActive: boolean;
  isParticipant: boolean;
  flags: GroupCommunicationFlags;
}): boolean {
  if (!canReadDirectConversation({ active: input.callerActive && input.otherActive, isParticipant: input.isParticipant })) {
    return false;
  }
  const caller = normalizeRole(input.callerRole);
  const other = normalizeRole(input.otherRole);
  if (caller === 'owner' || caller === 'manager') return true;
  if (caller !== 'member') return false;
  if (other === 'owner' || other === 'manager') return input.flags.members_can_message_managers;
  if (other === 'member') return input.flags.members_can_message_members;
  return false;
}

export function canStartDirectConversation(input: {
  callerRole: string | null | undefined;
  callerActive: boolean;
  targetRole: string | null | undefined;
  targetActive: boolean;
  samePerson: boolean;
  flags: GroupCommunicationFlags;
}): boolean {
  if (input.samePerson || !input.callerActive || !input.targetActive) return false;
  return canSendDirectMessage({
    callerRole: input.callerRole,
    callerActive: input.callerActive,
    otherRole: input.targetRole,
    otherActive: input.targetActive,
    isParticipant: true,
    flags: input.flags,
  });
}

export function directParticipantKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

export function unreadConversationBadge(unreadCounts: number[]): number {
  return unreadCounts.filter((count) => count > 0).length;
}

export function conversationUnreadCount(input: {
  messages: { senderUserId: string; createdAt: string; deletedAt?: string | null }[];
  viewerUserId: string;
  lastReadAt?: string | null;
}): number {
  const last = input.lastReadAt ? new Date(input.lastReadAt).getTime() : 0;
  return input.messages.filter((message) => {
    if (message.deletedAt) return false;
    if (message.senderUserId === input.viewerUserId) return false;
    return new Date(message.createdAt).getTime() > last;
  }).length;
}

export function messageNotificationDedupe(eventType: 'group_message' | 'direct_message', conversationId: string, recipientUserId: string): string {
  return `${eventType}:${conversationId}:${recipientUserId}`;
}

export function shouldNotifyMessageRecipient(senderUserId: string, recipientUserId: string): boolean {
  return !!senderUserId && !!recipientUserId && senderUserId !== recipientUserId;
}

/** Opening a notification does not mark the conversation read. */
export function notificationReadMarksChatRead(): false {
  return false;
}
