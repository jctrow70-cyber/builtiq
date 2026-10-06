'use client';

import { useEffect, useState } from 'react';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '../../../lib/notifications/policy';
import { supabase } from '../../../lib/supabaseClient';

const LABELS: Record<NotificationCategory, string> = {
  messages: 'Messages',
  training_assignments: 'Training assignments',
  program_updates: 'Program updates',
  group_activity: 'Group activity',
  reminders: 'Reminders',
};

type PreferenceRow = Record<`${NotificationCategory}_in_app`, boolean> & { user_id: string };

const DEFAULTS: PreferenceRow = {
  user_id: '',
  messages_in_app: true,
  training_assignments_in_app: true,
  program_updates_in_app: true,
  group_activity_in_app: true,
  reminders_in_app: true,
};

export default function NotificationPreferences({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<PreferenceRow>({ ...DEFAULTS, user_id: userId });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('st_notification_preferences')
      .select('user_id, messages_in_app, training_assignments_in_app, program_updates_in_app, group_activity_in_app, reminders_in_app')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPrefs({ ...DEFAULTS, ...data, user_id: userId });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function save() {
    setSaving(true);
    setNote('');
    const { error } = await supabase.from('st_notification_preferences').upsert({
      user_id: userId,
      messages_in_app: prefs.messages_in_app,
      training_assignments_in_app: prefs.training_assignments_in_app,
      program_updates_in_app: prefs.program_updates_in_app,
      group_activity_in_app: prefs.group_activity_in_app,
      reminders_in_app: prefs.reminders_in_app,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      setNote(/schema cache|does not exist/i.test(error.message || '')
        ? 'Run migration 20261005_057_notification_foundation.sql in Supabase first.'
        : error.message);
      return;
    }
    setNote('Notification settings saved.');
  }

  return (
    <div className="card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Notifications</h2>
        <button type="button" className="btn small green" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="muted">Choose which alerts appear in BuildIQ. Group invitation emails stay on their own and are not controlled here.</p>
      {NOTIFICATION_CATEGORIES.map((category) => {
        const key = `${category}_in_app` as const;
        return (
          <label key={category} className="remember-row" style={{ display: 'block', marginTop: 10 }}>
            <input
              type="checkbox"
              checked={!!prefs[key]}
              onChange={(event) => setPrefs((prev) => ({ ...prev, [key]: event.target.checked }))}
            />{' '}
            {LABELS[category]}
            <span className="muted" style={{ display: 'block', marginLeft: 22 }}>
              In the app
            </span>
          </label>
        );
      })}
      <p className="muted" style={{ marginTop: 12 }}>
        Email for these categories is not sent yet. Push notifications are not available yet.
      </p>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}
