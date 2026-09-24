'use client';

import { PAIN_FLAGS, WORKOUT_FEELS, type PainFlag, type SessionStatus, type SkipReason, type WorkoutFeel } from '../../../lib/scienceEngine/adaptation/types';

type Props = {
  status: SessionStatus;
  feel: WorkoutFeel | '';
  pain: PainFlag;
  notes: string;
  skipReason: SkipReason | '';
  durationMinutes?: number | null;
  canEdit: boolean;
  pendingMigration?: boolean;
  onStatus: (status: SessionStatus) => void;
  onFeel: (feel: WorkoutFeel) => void;
  onPain: (pain: PainFlag) => void;
  onNotes: (notes: string) => void;
  onSkipReason: (reason: SkipReason) => void;
};

const STATUS_OPTIONS: Array<{ id: SessionStatus; label: string }> = [
  { id: 'completed', label: 'Completed' },
  { id: 'partial', label: 'Partial' },
  { id: 'skipped', label: 'Skipped' },
];

const SKIP_REASONS: SkipReason[] = ['time', 'travel', 'motivation', 'illness', 'pain', 'equipment', 'other'];

export default function SessionOutcomeCard({
  status,
  feel,
  pain,
  notes,
  skipReason,
  durationMinutes,
  canEdit,
  pendingMigration,
  onStatus,
  onFeel,
  onPain,
  onNotes,
  onSkipReason,
}: Props) {
  return (
    <div className="card session-outcome-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h3>Session</h3>
        {durationMinutes ? <span className="muted">{durationMinutes} min</span> : null}
      </div>
      {pendingMigration && (
        <p className="muted">Phase 2A.1 migration is not applied yet. These choices will save after review.</p>
      )}
      <div className="log-chip-row">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`log-chip${status === opt.id ? ' active' : ''}`}
            disabled={!canEdit}
            onClick={() => onStatus(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {status === 'skipped' && (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            Skipped means you did not train — not a failed lift.
          </p>
          <div className="log-chip-row" style={{ marginTop: 8 }}>
            {SKIP_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className={`log-chip${skipReason === reason ? ' active' : ''}`}
                disabled={!canEdit}
                onClick={() => onSkipReason(reason)}
              >
                {reason.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="muted" style={{ marginTop: 10 }}>Workout feel</p>
      <div className="log-chip-row">
        {WORKOUT_FEELS.map((value) => (
          <button
            key={value}
            type="button"
            className={`log-chip${feel === value ? ' active' : ''}`}
            disabled={!canEdit}
            onClick={() => onFeel(value)}
          >
            {value.replace('_', ' ')}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 10 }}>Pain / discomfort</p>
      <div className="log-chip-row">
        {PAIN_FLAGS.map((value) => (
          <button
            key={value}
            type="button"
            className={`log-chip${pain === value ? ' active' : ''}`}
            disabled={!canEdit}
            onClick={() => onPain(value)}
          >
            {value.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <label className="muted" style={{ display: 'block', marginTop: 10 }}>
        Notes (optional)
        <textarea
          className="ai-prompt-input"
          rows={2}
          value={notes}
          disabled={!canEdit}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="How it felt…"
        />
      </label>
    </div>
  );
}
