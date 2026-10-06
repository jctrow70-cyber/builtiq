'use client';

import { useEffect, useRef, useState } from 'react';
import { formatNotificationTime } from '../../../lib/notifications/policy';
import { supabase } from '../../../lib/supabaseClient';
import IconButton from '../ui/IconButton';

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at?: string | null;
  destination_kind?: string | null;
  destination_id?: string | null;
  team_id?: string | null;
};

type NotificationCenterProps = {
  userId: string;
  onOpen?: (row: NotificationRow) => void;
};

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function NotificationCenter({ userId, onOpen }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function loadUnread() {
    const { count, error } = await supabase
      .from('st_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    if (error) return;
    setUnread(count || 0);
  }

  async function loadRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from('st_notifications')
      .select('id, title, body, created_at, read_at, destination_kind, destination_id, team_id')
      .order('created_at', { ascending: false })
      .limit(30);
    setLoading(false);
    if (error) return;
    setRows((data || []) as NotificationRow[]);
  }

  useEffect(() => {
    void loadUnread();
    const onFocus = () => void loadUnread();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    void loadRows();
    const onDoc = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function markRead(row: NotificationRow) {
    await supabase.rpc('st_mark_notification_read', { p_id: row.id });
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, read_at: item.read_at || new Date().toISOString() } : item)));
    void loadUnread();
    onOpen?.(row);
  }

  async function markAll() {
    await supabase.rpc('st_mark_all_notifications_read');
    const now = new Date().toISOString();
    setRows((prev) => prev.map((item) => ({ ...item, read_at: item.read_at || now })));
    setUnread(0);
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div className="notification-center" ref={wrapRef}>
      <IconButton label={label} variant="soft" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <BellIcon />
        {unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}
      </IconButton>
      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-head">
            <b>Notifications</b>
            <button type="button" className="btn small secondary" onClick={() => void markAll()} disabled={unread === 0}>
              Mark all as read
            </button>
          </div>
          {loading && rows.length === 0 && <p className="muted">Loading…</p>}
          {!loading && rows.length === 0 && <p className="muted">No notifications yet.</p>}
          <div className="notification-list">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={row.read_at ? 'notification-row' : 'notification-row unread'}
                onClick={() => void markRead(row)}
              >
                <span className="notification-row-title">{row.title}</span>
                <span className="notification-row-body">{row.body}</span>
                <span className="muted">{formatNotificationTime(row.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
