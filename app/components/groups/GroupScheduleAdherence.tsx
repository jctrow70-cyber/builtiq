'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { addDaysYmd, todayYmd } from '../../../lib/training/programCalendar';
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
    void supabase
      .rpc('st_group_schedule_adherence', {
        p_team_id: teamId,
        p_from_date: addDaysYmd(today, -365),
        p_to_date: addDaysYmd(today, 365),
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
      <h2>Schedule adherence</h2>
      <p className="muted">Completed past workouts for this group only. A workout due today is not counted against anyone until the day ends.</p>
      {pending && <p className="muted">Apply the unified training schedule migration to grade this group.</p>}
      {error && <p className="muted">{error}</p>}
      {!pending && rows.length === 0 && !error && <p className="muted">No active members to show.</p>}
      {rows.map((row) => (
        <div key={row.user_id} className="schedule-item">
          <div>
            <b>{nameFor(row.user_id)}</b>
            <div className="muted">
              {row.completed_past}/{row.expected_past} past
              {row.missed ? ` · ${row.missed} missed` : ''}
              {row.due_today ? ` · ${row.due_today} due today` : ''}
              {row.completed_today ? ` · ${row.completed_today} completed today` : ''}
            </div>
          </div>
          <b>{row.completion_rate == null ? '—' : `${row.completion_rate}%`}</b>
        </div>
      ))}
    </div>
  );
}
