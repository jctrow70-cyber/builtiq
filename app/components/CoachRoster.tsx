'use client';

import type { AthleteRosterCard } from '../../lib/training/teamCoach/types';
import { statusBadgeClass, statusLabel } from '../../lib/training/teamCoach/workoutStatus';
import { formatDisplayDate } from '../../lib/training/programCalendar';

type CoachRosterProps = {
  roster: AthleteRosterCard[];
  activeUserId?: string | null;
  canManagePlans?: boolean;
  onSelectAthlete: (userId: string) => void;
  onSetTrainingSource?: (userId: string, source: 'team' | 'personal') => void;
  trainingSourceByUser?: Record<string, string>;
};

export default function CoachRoster({
  roster,
  activeUserId,
  canManagePlans,
  onSelectAthlete,
  onSetTrainingSource,
  trainingSourceByUser = {},
}: CoachRosterProps) {
  if (!roster.length) {
    return (
      <div className="card coach-roster-card">
        <h2>Team roster</h2>
        <p className="muted">No athletes on this team yet.</p>
      </div>
    );
  }

  return (
    <div className="card coach-roster-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Team roster</h2>
        <span className="badge">{roster.length} athletes</span>
      </div>
      <p className="muted">Select an athlete to open their performance dashboard.</p>

      <div className="coach-roster-grid">
        {roster.map((card) => (
          <div
            key={card.memberId}
            className={`coach-athlete-card${activeUserId === card.userId ? ' active' : ''}`}
          >
            <button
              type="button"
              className="coach-athlete-card-main"
              onClick={() => onSelectAthlete(card.userId)}
            >
              <div className="coach-athlete-card-head">
                <b>
                  {card.displayName}
                  {card.isSelf ? ' (you)' : ''}
                </b>
                <span className={`badge coach-status-badge ${statusBadgeClass(card.status)}`}>
                  {statusLabel(card.status)}
                </span>
              </div>
              <span className="muted coach-athlete-program">{card.programName}</span>
              <div className="coach-athlete-meta">
                <span className="muted">
                  Last: {card.lastWorkoutDate ? formatDisplayDate(card.lastWorkoutDate) : '—'}
                </span>
                <span className="muted">{card.compliancePct}% compliance</span>
              </div>
              <div className="coach-athlete-indicators">
                {card.hasRecentPr && <span className="badge coach-indicator-pr">PR</span>}
                {card.hasCoachNotes && <span className="badge coach-indicator-notes">Notes</span>}
                <span className="muted">{card.setsThisWeek} sets · {card.daysActiveThisWeek}d</span>
              </div>
            </button>

            {canManagePlans && !card.isSelf && onSetTrainingSource && (
              <select
                className="coach-athlete-plan-select"
                value={trainingSourceByUser[card.userId] || 'team'}
                onChange={(e) =>
                  onSetTrainingSource(card.userId, e.target.value as 'team' | 'personal')
                }
                onClick={(e) => e.stopPropagation()}
                aria-label={`Plan source for ${card.displayName}`}
              >
                <option value="team">Team plan</option>
                <option value="personal">Personal plan</option>
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
