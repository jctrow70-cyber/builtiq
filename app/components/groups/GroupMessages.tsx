'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canStartDirectConversation,
  canUseGroupChat,
  groupCommunicationFlags,
  validateMessageBody,
  type GroupCommunicationFlags,
} from '../../../lib/groups/communication';
import { supabase } from '../../../lib/supabaseClient';

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};

type ConversationRow = {
  id: string;
  conversation_type: 'group' | 'direct';
  other_user_id?: string | null;
  other_name?: string | null;
  preview?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  can_send?: boolean;
};

type GroupMember = {
  user_id: string;
  display_name?: string | null;
  role?: string | null;
};

type GroupMessagesProps = {
  teamId: string;
  teamName: string;
  currentUserId: string;
  role: string | null;
  team: Partial<GroupCommunicationFlags> | null;
  members: GroupMember[];
  initialConversationId?: string | null;
  initialUserId?: string | null;
  onClose: () => void;
  onUnreadChange?: () => void;
};

function migrationHint(message: string) {
  return /could not find the function|schema cache|does not exist/i.test(message)
    ? 'Run migration 20261005_058_group_communication.sql in Supabase first.'
    : message;
}

function formatWhen(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H9l-4 3.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MessageIconMark() {
  return <MessageIcon />;
}

export default function GroupMessages({
  teamId,
  teamName,
  currentUserId,
  role,
  team,
  members,
  initialConversationId = null,
  initialUserId = null,
  onClose,
  onUnreadChange,
}: GroupMessagesProps) {
  const flags = groupCommunicationFlags(team);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [active, setActive] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => map.set(member.user_id, member.display_name || 'Member'));
    return map;
  }, [members]);

  const showGroupChat = canUseGroupChat({ role, active: true, flags });

  async function loadConversations() {
    const { data, error: loadError } = await supabase.rpc('st_list_group_conversations', { p_team_id: teamId });
    if (loadError) {
      setError(migrationHint(loadError.message));
      setLoading(false);
      return [];
    }
    const rows = (Array.isArray(data) ? data : []) as ConversationRow[];
    setConversations(rows);
    setLoading(false);
    return rows;
  }

  async function markRead(conversationId: string) {
    const { error: readError } = await supabase.rpc('st_mark_conversation_read', { p_conversation_id: conversationId });
    if (readError) return;
    setConversations((prev) => prev.map((row) => (row.id === conversationId ? { ...row, unread_count: 0 } : row)));
    onUnreadChange?.();
  }

  async function loadLatest(conversationId: string) {
    const { data, error: loadError } = await supabase.rpc('st_list_messages', {
      p_conversation_id: conversationId,
      p_limit: 50,
    });
    if (loadError) {
      setError(migrationHint(loadError.message));
      return;
    }
    const rows = ((Array.isArray(data) ? data : []) as ChatMessage[]).slice().reverse();
    setMessages(rows);
    setHasOlder(Array.isArray(data) && data.length >= 50);
    stickToBottom.current = true;
  }

  async function openConversation(row: ConversationRow) {
    setError('');
    setEditingId(null);
    setDraft('');
    setActive(row);
    setMessages([]);
    await loadLatest(row.id);
    await markRead(row.id);
  }

  async function openDirect(userId: string) {
    setError('');
    setLoading(true);
    const { data, error: openError } = await supabase.rpc('st_open_direct_conversation', {
      p_team_id: teamId,
      p_other_user_id: userId,
    });
    if (openError || !data) {
      setError(migrationHint(openError?.message || 'Could not open that conversation.'));
      setLoading(false);
      return;
    }
    const rows = await loadConversations();
    const row = rows.find((item) => item.id === data) || {
      id: String(data),
      conversation_type: 'direct' as const,
      other_user_id: userId,
      other_name: names.get(userId) || 'Member',
      can_send: true,
      unread_count: 0,
    };
    await openConversation(row);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await loadConversations();
      if (cancelled) return;
      if (initialConversationId) {
        const row = rows.find((item) => item.id === initialConversationId);
        if (row) await openConversation(row);
      } else if (initialUserId) {
        await openDirect(initialUserId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Open once for this group entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, initialConversationId, initialUserId]);

  useEffect(() => {
    if (!active?.id) return;
    const conversationId = active.id;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'st_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ChatMessage | undefined;
          if (!row?.id) {
            void loadLatest(conversationId);
            return;
          }
          setMessages((prev) => {
            const index = prev.findIndex((item) => item.id === row.id);
            if (index === -1) return [...prev, row];
            const next = prev.slice();
            next[index] = row;
            return next;
          });
          void markRead(conversationId);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void loadLatest(conversationId);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, active?.id]);

  async function loadOlder() {
    if (!active || messages.length === 0) return;
    const oldest = messages[0];
    stickToBottom.current = false;
    const { data, error: loadError } = await supabase.rpc('st_list_messages', {
      p_conversation_id: active.id,
      p_before_created_at: oldest.created_at,
      p_before_id: oldest.id,
      p_limit: 50,
    });
    if (loadError) {
      setError(migrationHint(loadError.message));
      return;
    }
    const older = ((Array.isArray(data) ? data : []) as ChatMessage[]).slice().reverse();
    setHasOlder(Array.isArray(data) && data.length >= 50);
    setMessages((prev) => {
      const seen = new Set(prev.map((item) => item.id));
      return [...older.filter((item) => !seen.has(item.id)), ...prev];
    });
  }

  async function send() {
    if (!active) return;
    const check = validateMessageBody(draft);
    if (check === 'empty') {
      setError('Write a message before sending.');
      return;
    }
    if (check === 'too_long') {
      setError('Messages can be up to 2,000 characters.');
      return;
    }
    setSending(true);
    setError('');
    const body = draft.trim();
    if (editingId) {
      const { data, error: editError } = await supabase.rpc('st_edit_message', { p_message_id: editingId, p_body: body });
      setSending(false);
      if (editError) {
        setError(migrationHint(editError.message));
        return;
      }
      const updated = data as ChatMessage;
      setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setDraft('');
      return;
    }
    const { data, error: sendError } = await supabase.rpc('st_send_message', {
      p_conversation_id: active.id,
      p_body: body,
    });
    setSending(false);
    if (sendError) {
      setError(migrationHint(sendError.message));
      return;
    }
    const created = data as ChatMessage;
    setMessages((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]));
    setDraft('');
    stickToBottom.current = true;
    void loadConversations();
  }

  async function removeMessage(messageId: string) {
    if (!window.confirm('Delete this message?')) return;
    const { data, error: deleteError } = await supabase.rpc('st_delete_message', { p_message_id: messageId });
    if (deleteError) {
      setError(migrationHint(deleteError.message));
      return;
    }
    const updated = data as ChatMessage;
    setMessages((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated, body: '' } : item)));
  }

  const starters = members.filter((member) => {
    if (member.user_id === currentUserId) return false;
    if (conversations.some((row) => row.other_user_id === member.user_id)) return false;
    return canStartDirectConversation({
      callerRole: role,
      callerActive: true,
      targetRole: member.role,
      targetActive: true,
      samePerson: false,
      flags,
    });
  });

  const groupRow = conversations.find((row) => row.conversation_type === 'group');
  const directs = conversations.filter((row) => row.conversation_type === 'direct');
  const canSend = !!active?.can_send;

  return (
    <div className="team-sheet-backdrop" onClick={onClose}>
      <div
        className="team-sheet-panel card team-messages-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Messages"
      >
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>{active ? (active.conversation_type === 'group' ? 'Group Chat' : active.other_name || 'Message') : 'Messages'}</h2>
          <div className="actions">
            {active && (
              <button type="button" className="btn small secondary" onClick={() => { setActive(null); setEditingId(null); void loadConversations(); }}>
                Back
              </button>
            )}
            <button type="button" className="btn small secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {error && <p className="team-sheet-error">{error}</p>}

        {!active && (
          <div className="team-message-index">
            {loading && <p className="muted">Loading…</p>}
            {!loading && showGroupChat && (
              <>
                <p className="team-message-kicker">{teamName}</p>
                <button
                  type="button"
                  className="team-conversation-row"
                  onClick={() => groupRow && void openConversation(groupRow)}
                  disabled={!groupRow}
                >
                  <span>
                    <b>Group Chat</b>
                    <span className="muted">{groupRow?.preview || 'Say something to the group'}</span>
                  </span>
                  {(groupRow?.unread_count || 0) > 0 && <span className="team-message-badge">{groupRow?.unread_count}</span>}
                </button>
              </>
            )}
            {!loading && !showGroupChat && <p className="muted">Group Chat is off for members.</p>}

            <p className="team-message-kicker">Direct</p>
            {directs.length === 0 && <p className="muted">No direct messages yet.</p>}
            {directs.map((row) => (
              <button key={row.id} type="button" className="team-conversation-row" onClick={() => void openConversation(row)}>
                <span>
                  <b>{row.other_name || 'Member'}</b>
                  <span className="muted">{row.preview || 'No messages yet'}</span>
                </span>
                <span className="team-conversation-side">
                  <span className="muted">{formatWhen(row.last_message_at)}</span>
                  {(row.unread_count || 0) > 0 && <span className="team-message-badge">{row.unread_count}</span>}
                </span>
              </button>
            ))}

            {starters.length > 0 && (
              <>
                <p className="team-message-kicker">New message</p>
                {starters.map((member) => (
                  <button key={member.user_id} type="button" className="team-conversation-row" onClick={() => void openDirect(member.user_id)}>
                    <span>
                      <b>{member.display_name || 'Member'}</b>
                      <span className="muted">Start a private conversation</span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {active && (
          <>
            <p className="muted team-message-thread-label">
              {active.conversation_type === 'group' ? teamName : `${teamName} · private`}
            </p>
            <div className="team-message-list">
              {hasOlder && (
                <button type="button" className="btn small secondary" onClick={() => void loadOlder()}>
                  Load older messages
                </button>
              )}
              {messages.map((message) => {
                const mine = message.sender_user_id === currentUserId;
                const deleted = !!message.deleted_at;
                return (
                  <article key={message.id} className={mine ? 'team-message mine' : 'team-message'}>
                    <div className="team-message-meta">
                      <b>{mine ? 'You' : names.get(message.sender_user_id) || (active.conversation_type === 'direct' ? active.other_name : 'Member')}</b>
                      <span>{formatWhen(message.created_at)}</span>
                      {!deleted && message.edited_at && <span>edited</span>}
                    </div>
                    <p className={deleted ? 'team-message-body muted' : 'team-message-body'}>
                      {deleted ? 'Message deleted' : message.body}
                    </p>
                    {mine && !deleted && (
                      <div className="team-message-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(message.id);
                            setDraft(message.body);
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" onClick={() => void removeMessage(message.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {canSend ? (
              <form
                className="team-message-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={editingId ? 'Edit message' : 'Message'}
                  maxLength={2000}
                  rows={1}
                  aria-label={editingId ? 'Edit message' : 'Message'}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <button type="submit" className="btn green" disabled={sending}>
                  {editingId ? 'Save' : 'Send'}
                </button>
              </form>
            ) : (
              <p className="muted team-message-readonly">You can read this conversation. New messages are turned off.</p>
            )}
            {editingId && canSend && (
              <button type="button" className="btn small secondary" onClick={() => { setEditingId(null); setDraft(''); }}>
                Cancel edit
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
