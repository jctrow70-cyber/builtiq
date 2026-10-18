'use client';

import { useEffect, useState } from 'react';
import ProgressInsights from '../ProgressInsights';
import { fetchGroupExtras } from '../../../lib/groups/groupActivities';
import { summarizeGroupExtras } from '../../../lib/groups/trainingWorkspace';
import type { AssignmentComplianceSummary, MemberWorkoutHistoryDay } from '../../../lib/groups/memberPerformance';
import { addDaysYmd, todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';

type MemberPerformancePanelProps = {
  assignmentCompliance: AssignmentComplianceSummary;
  history: MemberWorkoutHistoryDay[];
  performanceLogs: any[];
  weightUnit?: string;
  emptyHint?: string;
  teamId?: string | null;
  userId?: string | null;
};

export default function MemberPerformancePanel({
  assignmentCompliance,
  history,
  performanceLogs,
  weightUnit = 'lb',
  emptyHint,
  teamId = null,
  userId = null,
}: MemberPerformancePanelProps) {
  const hasAssignments = assignmentCompliance.total > 0;
  const [extraSummary, setExtraSummary] = useState<ReturnType<typeof summarizeGroupExtras> | null>(null);

  useEffect(() => {
    if (!teamId || !userId) {
      setExtraSummary(null);
      return;
    }
    let cancelled = false;
    const today = todayYmd();
    void fetchGroupExtras(supabase, { teamId, userId, from: addDaysYmd(today, -27), to: today }).then((extras) => {
      if (!cancelled) setExtraSummary(summarizeGroupExtras(extras, today));
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, userId]);

  return (
    <div className="member-performance-panel">
      {hasAssignments && <div className="card member-assignment-compliance">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h3>One-off assigned workouts</h3>
        </div>
        <p className="muted">These are separate from the group schedule. They do not change group adherence.</p>
        <div className="dash-metrics member-dash-metrics">
          <div>
            <b>{assignmentCompliance.completed}</b>
            <span className="muted">Completed</span>
          </div>
          <div>
            <b>{assignmentCompliance.started + assignmentCompliance.pending}</b>
            <span className="muted">Open</span>
          </div>
          <div>
            <b>{assignmentCompliance.overdue}</b>
            <span className="muted">Overdue</span>
          </div>
          <div>
            <b>{assignmentCompliance.total}</b>
            <span className="muted">Total assigned</span>
          </div>
        </div>
        {assignmentCompliance.overdue > 0 && (
          <p className="muted assigned-copy-hint">This member has overdue assigned workouts.</p>
        )}
      </div>}

      {extraSummary && extraSummary.total > 0 && (
        <div className="card">
          <h3>Group extras</h3>
          <p className="muted">Optional extras stay out of program missed totals.</p>
          <div className="dash-metrics">
            <div>
              <b>{extraSummary.requiredCompleted}</b>
              <span className="muted">Required completed</span>
            </div>
            <div>
              <b>{extraSummary.requiredOpen}</b>
              <span className="muted">Required still open</span>
            </div>
            <div>
              <b>{extraSummary.optional}</b>
              <span className="muted">Optional</span>
            </div>
          </div>
        </div>
      )}

      <ProgressInsights
        logs={performanceLogs}
        weightUnit={weightUnit}
        emptyMessage={emptyHint}
        hideEmpty
      />

      <div className="card member-workout-history">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h3>Group-attributed workout history</h3>
          <span className="muted">Last {history.length || 0} days</span>
        </div>
        {history.length === 0 ? (
          <p className="muted">{emptyHint || 'No group-attributed completed sets in this window.'}</p>
        ) : (
          history.map((day) => (
            <div key={day.date} className="member-history-row">
              <div>
                <b>{day.label}</b>
                <span className="muted">
                  {day.sets} set{day.sets === 1 ? '' : 's'}
                  {day.exercises.length ? ` · ${day.exercises.join(', ')}` : ''}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
