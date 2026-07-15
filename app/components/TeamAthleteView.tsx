'use client';

import { formatDisplayDate } from '../../lib/training/programCalendar';

type TeamAthleteViewProps = {
  teamName: string;
  trainingSource: 'team' | 'personal';
  programName?: string;
  todayWorkoutLabel?: string;
  onSetTrainingSource: (source: 'team' | 'personal') => void;
  onStartWorkout: () => void;
};

export default function TeamAthleteView({
  teamName,
  trainingSource,
  programName,
  todayWorkoutLabel,
  onSetTrainingSource,
  onStartWorkout,
}: TeamAthleteViewProps) {
  return (
    <div className="team-athlete-view">
      <div className="card team-athlete-hero">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{teamName}</h2>
            <p className="muted">Your team training — log workouts in your personal athlete view.</p>
          </div>
          <span className="badge">
            {trainingSource === 'team' ? 'Team program' : 'Personal program'}
          </span>
        </div>

        <div className="tabs team-athlete-tabs">
          <button
            type="button"
            className={trainingSource !== 'personal' ? 'active' : ''}
            onClick={() => onSetTrainingSource('team')}
          >
            Team workout
          </button>
          <button
            type="button"
            className={trainingSource === 'personal' ? 'active' : ''}
            onClick={() => onSetTrainingSource('personal')}
          >
            Personal plan
          </button>
        </div>
      </div>

      <div className="card team-athlete-today">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h3>Today&apos;s workout</h3>
          <span className="badge">{formatDisplayDate(new Date().toISOString().slice(0, 10))}</span>
        </div>
        <p className="dash-title">{programName || 'No program assigned'}</p>
        <p className="muted">
          {todayWorkoutLabel || 'Open Training to view and log today\'s session.'}
        </p>
        <button type="button" className="btn green" style={{ marginTop: 10 }} onClick={onStartWorkout}>
          Start my workout
        </button>
      </div>

      <div className="card team-athlete-hint">
        <p className="muted">
          Team Training for athletes is your personal experience. Coaches manage the roster and
          assignments from the coach dashboard — you only see your own plan and progress here.
        </p>
      </div>
    </div>
  );
}
