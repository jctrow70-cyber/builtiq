'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { currentCalendarWeekBounds, todayYmd } from '../../../lib/training/programCalendar';
import { scheduleSetupMissing } from '../../../lib/training/scheduleActions';

type AdherenceRow = {
  user_id: string;
  expected_past: number;
  completed_past: number;
  partial_past: number;
  skipped_past: number;
  missed: number;
  due_today: number;
  completed_today: number;
  future: number;
  completion_rate: number | null;
};

type Props = {
  teamId: string;
  members: Array<{ user_id?: string; display_name?: string | null }>;
};

export default function GroupScheduleAdherence({ teamId, members }: Props) {
  const [rows, setRows] = useState<AdherenceRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = todayYmd();
    const week = currentCalendarWeekBounds();
    void supabase
      .rpc('st_group_schedule_adherence', {
        p_team_id: teamId,
        p_from_date: week.monday,
        p_to_date: week.sunday,
        p_local_today: today,
      })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          if (scheduleSetupMissing(rpcError.message)) setPending(true);
          else setError(rpcError.message);
          setRows([]);
          return;
        }
        setPending(false);
        setError(null);
        setRows((data || []) as AdherenceRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const nameFor = (userId: string) => members.find((member) => member.user_id === userId)?.display_name || 'Member';

  return (
    <div className="card">
      <h2>Scheduled training</h2>
      <p className="muted">
        This week uses the same group schedule as the calendar. Excused workouts are left out. A paused schedule is not marked missed. Today stays due until the day ends.
      </p>
      {pending && (
        <p className="muted">
          Scheduled training needs migration 20261007_059_unified_training_schedule.sql in the Supabase SQL Editor.
        </p>
      )}
      {error && <p className="muted">{error}</p>}
      {!pending && rows.length === 0 && !error && <p className="muted">No active members to show.</p>}
      {rows.map((row) => (
        <div key={row.user_id} className="schedule-item">
          <div>
            <b>{nameFor(row.user_id)}</b>
            <div className="muted">
              {row.completed_past + row.completed_today} completed · {row.partial_past} partial · {row.skipped_past} skipped · {row.missed} missed
              {row.due_today ? ` · ${row.due_today} due today` : ''}
            </div>
          </div>
          <b>{row.completion_rate == null ? '—' : `${row.completion_rate}%`}</b>
        </div>
      ))}
    </div>
  );
}
