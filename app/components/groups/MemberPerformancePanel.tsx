'use client';

import ProgressInsights from '../ProgressInsights';
import type { AssignmentComplianceSummary, MemberWorkoutHistoryDay } from '../../../lib/groups/memberPerformance';

type MemberPerformancePanelProps = {
  assignmentCompliance: AssignmentComplianceSummary;
  history: MemberWorkoutHistoryDay[];
  performanceLogs: any[];
  weightUnit?: string;
};

export default function MemberPerformancePanel({
  assignmentCompliance,
  history,
  performanceLogs,
  weightUnit = 'lb',
}: MemberPerformancePanelProps) {
  const hasAssignments = assignmentCompliance.total > 0;

  return (
    <div className="member-performance-panel">
      <div className="card member-assignment-compliance">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h3>Assignment compliance</h3>
          {hasAssignments && <span className="badge">{assignmentCompliance.completionPct}%</span>}
        </div>
        {hasAssignments ? (
          <>
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
          </>
        ) : (
          <p className="muted">No active workout assignments for this member yet.</p>
        )}
      </div>

      <ProgressInsights logs={performanceLogs} weightUnit={weightUnit} />

      <div className="card member-workout-history">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h3>Recent workout history</h3>
          <span className="muted">Last {history.length || 0} days</span>
        </div>
        {history.length === 0 ? (
          <p className="muted">No completed sets logged yet.</p>
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
