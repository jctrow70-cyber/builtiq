'use client';

import { assignmentTypeLabel, exerciseTypeOf } from '../../../lib/training/exerciseTypes';
import { formatLogSummary } from '../../../lib/training/logFields';
import { formatDisplayDate } from '../../../lib/training/programCalendar';
import type { AssignmentComplianceSummary, MemberWorkoutHistoryDay } from '../../../lib/groups/memberPerformance';
import MemberPerformancePanel from './MemberPerformancePanel';

const SECTIONS = [
  { id: 'warmup', label: 'Warm Up / Prep' },
  { id: 'strength', label: 'Strength' },
  { id: 'cooldown', label: 'Cooldown / Stretch' },
];

type GroupMemberDashboardProps = {
  member: any;
  memberAssignment: any;
  memberDashProgram: any;
  memberTodayWorkout: any;
  memberWorkoutStatus: string;
  memberDashLastDate: string;
  memberDashLogs: Record<string, any>;
  memberStats: Record<string, { sets: number; days: number }>;
  logDate: string;
  week: number;
  canManage: boolean;
  assignDraft: { type: string; programId: string; notes: string };
  programs: any[];
  onAssignDraftChange: (draft: { type: string; programId: string; notes: string }) => void;
  onBack: () => void;
  onOpenWorkout: () => void;
  onApplyAssignment: () => void;
  sectionExercises: (workout: any, section: string) => any[];
  statusLabel: (s: string) => string;
  assignmentCompliance?: AssignmentComplianceSummary;
  performanceLogs?: any[];
  workoutHistory?: MemberWorkoutHistoryDay[];
  weightUnit?: string;
};

export default function GroupMemberDashboard({
  member,
  memberAssignment,
  memberDashProgram,
  memberTodayWorkout,
  memberWorkoutStatus,
  memberDashLastDate,
  memberDashLogs,
  memberStats,
  logDate,
  week,
  canManage,
  assignDraft,
  programs,
  onAssignDraftChange,
  onBack,
  onOpenWorkout,
  onApplyAssignment,
  sectionExercises,
  statusLabel,
  assignmentCompliance,
  performanceLogs = [],
  workoutHistory = [],
  weightUnit = 'lb',
}: GroupMemberDashboardProps) {
  const stats = memberStats[member.user_id] || { sets: 0, days: 0 };
  const assignmentType =
    memberAssignment?.assignment_type || (member.training_source || 'team') === 'personal' ? 'personal' : 'team';

  return (
    <div className="card member-dashboard">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>{member.display_name || 'Member'}</h2>
          <p className="muted">
            {assignmentTypeLabel(assignmentType)} · {memberDashProgram?.name || 'No program'}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn small secondary" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn small green" onClick={onOpenWorkout}>
            Open workout
          </button>
        </div>
      </div>
      <div className="dash-metrics member-dash-metrics">
        <div>
          <b>{statusLabel(memberWorkoutStatus)}</b>
          <span className="muted">Today ({formatDisplayDate(logDate)})</span>
        </div>
        <div>
          <b>
            {memberTodayWorkout
              ? `${memberTodayWorkout.day_label} · ${memberTodayWorkout.workout_type}`
              : 'Rest / none'}
          </b>
          <span className="muted">Assigned workout</span>
        </div>
        <div>
          <b>{memberDashLastDate ? formatDisplayDate(memberDashLastDate) : '—'}</b>
          <span className="muted">Last completed</span>
        </div>
        <div>
          <b>{stats.sets}</b>
          <span className="muted">Sets this week</span>
        </div>
      </div>
      {canManage && (
        <div className="member-assignment-panel">
          <label>Program assignment</label>
          <select
            value={assignDraft.type}
            onChange={(e) => onAssignDraftChange({ ...assignDraft, type: e.target.value })}
          >
            <option value="team">Follow Group Plan</option>
            <option value="personal">Use Personal Plan</option>
            <option value="individual_team">Individual Group Plan</option>
            <option value="manual">Manual Assignment</option>
          </select>
          {(assignDraft.type === 'individual_team' || assignDraft.type === 'manual') && (
            <>
              <label>Program</label>
              <select
                value={assignDraft.programId}
                onChange={(e) => onAssignDraftChange({ ...assignDraft, programId: e.target.value })}
              >
                <option value="">Select program</option>
                {programs.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <label>Manager notes</label>
          <input
            value={assignDraft.notes}
            onChange={(e) => onAssignDraftChange({ ...assignDraft, notes: e.target.value })}
            placeholder="Assignment notes"
          />
          <button type="button" className="btn small green" style={{ marginTop: 8 }} onClick={onApplyAssignment}>
            Apply assignment
          </button>
        </div>
      )}
      {!memberTodayWorkout && <p className="muted">No workout scheduled for today in week {week}.</p>}
      {memberTodayWorkout && (
        <>
          <h3 style={{ marginTop: 12 }}>Today&apos;s exercises</h3>
          {SECTIONS.flatMap((sec) => sectionExercises(memberTodayWorkout, sec.id)).map((ex: any) => {
            const sets = (ex.st_planned_sets || []).filter((s: any) => !s.is_deleted);
            const done = sets.filter((s: any) => memberDashLogs[s.id]?.completed).length;
            const exType = exerciseTypeOf(ex);
            const summaries = sets
              .map((s: any) => memberDashLogs[s.id])
              .filter(Boolean)
              .map((l: any) => formatLogSummary(l, exType))
              .filter((x: string) => x && x !== '—');
            return (
              <div key={ex.id} className="member-exercise-row">
                <b>{ex.name}</b>
                <span className="muted">
                  {ex.muscle_group || 'Muscle'} · {exType} · {done}/{sets.length} logged
                  {summaries.length ? ` · ${summaries.join(' · ')}` : ''}
                </span>
              </div>
            );
          })}
        </>
      )}
      {memberAssignment?.notes && (
        <p className="muted dash-insight" style={{ marginTop: 10 }}>
          Manager notes: {memberAssignment.notes}
        </p>
      )}
      {stats.days > 0 && (
        <p className="muted dash-insight" style={{ marginTop: 10 }}>
          Active {stats.days} days this week — {stats.sets} sets logged.
        </p>
      )}

      <MemberPerformancePanel
        assignmentCompliance={
          assignmentCompliance || {
            total: 0,
            completed: 0,
            pending: 0,
            started: 0,
            skipped: 0,
            overdue: 0,
            completionPct: 0,
          }
        }
        history={workoutHistory}
        performanceLogs={performanceLogs}
        weightUnit={weightUnit}
      />
    </div>
  );
}
