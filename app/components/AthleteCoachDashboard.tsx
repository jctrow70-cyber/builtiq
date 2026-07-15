'use client';

import ProgressInsights from './ProgressInsights';
import ProgramAssignmentPanel from './ProgramAssignmentPanel';
import { assignmentTypeLabel } from '../../lib/training/exerciseTypes';
import { formatDisplayDate } from '../../lib/training/programCalendar';
import { statusLabel } from '../../lib/training/teamCoach/workoutStatus';
import type { WorkoutDayStatus } from '../../lib/training/teamCoach/types';
import { upcomingWorkoutLabel } from '../../lib/training/teamCoach/coachMetrics';

type AthleteCoachDashboardProps = {
  member: any;
  program: any | null;
  assignment: any | null;
  todayWorkout: any | null;
  todayStatus: WorkoutDayStatus | string;
  lastWorkoutDate: string;
  setsThisWeek: number;
  daysActiveThisWeek: number;
  progressLogs: any[];
  weightUnit?: string;
  assignDraft: { type: string; programId: string; notes: string };
  teamPrograms: any[];
  logDate: string;
  week: number;
  canAssign?: boolean;
  onBack: () => void;
  onOpenWorkout: () => void;
  onAssignDraftChange: (draft: { type: string; programId: string; notes: string }) => void;
  onApplyAssignment: () => void;
};

export default function AthleteCoachDashboard({
  member,
  program,
  assignment,
  todayWorkout,
  todayStatus,
  lastWorkoutDate,
  setsThisWeek,
  daysActiveThisWeek,
  progressLogs,
  weightUnit = 'lb',
  assignDraft,
  teamPrograms,
  logDate,
  week,
  canAssign,
  onBack,
  onOpenWorkout,
  onAssignDraftChange,
  onApplyAssignment,
}: AthleteCoachDashboardProps) {
  const assignmentType =
    assignment?.assignment_type ||
    ((member.training_source || 'team') === 'personal' ? 'personal' : 'team');

  return (
    <div className="coach-athlete-dashboard">
      <div className="card member-dashboard coach-athlete-dashboard-head">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{member.display_name || 'Athlete'}</h2>
            <p className="muted">
              {assignmentTypeLabel(assignmentType)} · {program?.name || 'No program'}
            </p>
          </div>
          <div className="actions">
            <button type="button" className="btn small secondary" onClick={onBack}>
              Back to roster
            </button>
            <button type="button" className="btn small green" onClick={onOpenWorkout}>
              Open workout
            </button>
          </div>
        </div>

        <div className="dash-metrics member-dash-metrics coach-athlete-summary">
          <div>
            <b>{statusLabel(todayStatus)}</b>
            <span className="muted">Today ({formatDisplayDate(logDate)})</span>
          </div>
          <div>
            <b>
              {todayWorkout
                ? `${todayWorkout.day_label} · ${todayWorkout.workout_type}`
                : 'Rest / none'}
            </b>
            <span className="muted">Today&apos;s workout</span>
          </div>
          <div>
            <b>{lastWorkoutDate ? formatDisplayDate(lastWorkoutDate) : '—'}</b>
            <span className="muted">Last completed</span>
          </div>
          <div>
            <b>{setsThisWeek}</b>
            <span className="muted">Sets this week ({daysActiveThisWeek}d)</span>
          </div>
        </div>
      </div>

      {canAssign && (
        <ProgramAssignmentPanel
          assignDraft={assignDraft}
          teamPrograms={teamPrograms}
          onChange={onAssignDraftChange}
          onApply={onApplyAssignment}
        />
      )}

      <div className="card coach-athlete-section">
        <h3>Current program</h3>
        <p className="muted">
          {program?.name || 'No program assigned'}
          {program?.weeks ? ` · ${program.weeks} weeks` : ''}
        </p>
        <p className="muted">
          Upcoming: {upcomingWorkoutLabel(program, week)}
        </p>
      </div>

      {assignment?.notes && (
        <div className="card coach-athlete-section">
          <h3>Coach notes</h3>
          <p className="dash-insight">{assignment.notes}</p>
        </div>
      )}

      <div className="card coach-athlete-section">
        <h3>Strength trends</h3>
        <ProgressInsights logs={progressLogs} weightUnit={weightUnit} />
      </div>

      <div className="card coach-athlete-section coach-future-module">
        <h3>Cardio trends</h3>
        <p className="muted">Team cardio analytics — coming in a future release.</p>
      </div>

      <div className="card coach-athlete-section coach-future-module">
        <h3>Bodyweight trends</h3>
        <p className="muted">Optional bodyweight tracking — coming soon.</p>
      </div>

      <div className="card coach-athlete-section coach-future-module">
        <h3>Nutrition summary</h3>
        <p className="muted">Shown when nutrition module is enabled for this athlete.</p>
      </div>
    </div>
  );
}
