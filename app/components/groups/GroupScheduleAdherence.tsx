'use client';

import { useEffect, useState } from 'react';
import { summarizeExpectationStatuses, type GroupExpectationStatusSummary } from '../../../lib/groups/trainingWorkspace';
import { supabase } from '../../../lib/supabaseClient';
import { currentCalendarWeekBounds, todayYmd } from '../../../lib/training/programCalendar';
import { scheduleSetupMissing } from '../../../lib/training/scheduleActions';

type Props = {
  teamId: string;
  members: Array<{ user_id?: string; display_name?: string | null }>;
};

export default function GroupScheduleAdherence({ teamId, members }: Props) {
  const [rows, setRows] = useState<GroupExpectationStatusSummary[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberKey = members.map((member) => member.user_id || '').join('|');

  useEffect(() => {
    let cancelled = false;
    const today = todayYmd();
    const week = currentCalendarWeekBounds();
    void supabase
      .rpc('st_group_expectation_status', {
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
        const memberIds = members.map((member) => member.user_id).filter((id): id is string => !!id);
        setRows(summarizeExpectationStatuses(data || [], memberIds, today));
      });
    return () => {
      cancelled = true;
    };
    // memberKey already changes when the visible roster changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, memberKey]);

  const nameFor = (userId: string) => members.find((member) => member.user_id === userId)?.display_name || 'Member';

  return (
    <div className="card">
      <h2>Scheduled training</h2>
      <p className="muted">
        This week uses each saved group workout. Completed, partial, and skipped come from the workout session. A paused enrollment does not mark today or a later workout as missed. A set log on the same day does not complete the workout.
      </p>
      {pending && (
        <p className="muted">
          Scheduled training needs migration 20261007_059_unified_training_schedule.sql in the Supabase SQL Editor.
        </p>
      )}
      {error && <p className="muted">{error}</p>}
      {!pending && rows.length === 0 && !error && <p className="muted">No active members to show.</p>}
      {rows.map((row) => (
        <div key={row.userId} className="schedule-item">
          <div>
            <b>{nameFor(row.userId)}</b>
            <div className="muted">
              {row.completed} completed · {row.partial} partial · {row.skipped} skipped · {row.missed} missed
              {row.dueToday ? ` · ${row.dueToday} due today` : ''}
              {row.paused ? ` · ${row.paused} paused` : ''}
              {row.excused ? ` · ${row.excused} excused` : ''}
            </div>
          </div>
          <b>{row.completionRate == null ? '—' : `${row.completionRate}%`}</b>
        </div>
      ))}
    </div>
  );
}
