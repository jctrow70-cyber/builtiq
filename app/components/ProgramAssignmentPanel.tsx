'use client';

import { ASSIGNMENT_OPTIONS } from '../../lib/training/teamCoach/types';

type ProgramAssignmentPanelProps = {
  assignDraft: { type: string; programId: string; notes: string };
  teamPrograms: any[];
  onChange: (draft: { type: string; programId: string; notes: string }) => void;
  onApply: () => void;
  disabled?: boolean;
};

export default function ProgramAssignmentPanel({
  assignDraft,
  teamPrograms,
  onChange,
  onApply,
  disabled,
}: ProgramAssignmentPanelProps) {
  const selected = ASSIGNMENT_OPTIONS.find((o) => o.type === assignDraft.type) || ASSIGNMENT_OPTIONS[0];

  return (
    <div className="member-assignment-panel coach-assignment-panel">
      <h3>Program assignment</h3>
      <p className="muted">Four ways to assign programming — team-wide, personal, individual, or manual.</p>

      <div className="coach-assignment-options">
        {ASSIGNMENT_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            type="button"
            className={`coach-assignment-option${assignDraft.type === opt.type ? ' active' : ''}`}
            onClick={() => onChange({ ...assignDraft, type: opt.type })}
          >
            <b>{opt.title}</b>
            <span className="muted">{opt.description}</span>
            {opt.futureAiGenerate && <span className="badge">AI soon</span>}
          </button>
        ))}
      </div>

      {selected.needsProgramPicker && (
        <>
          <label>Program</label>
          <select
            value={assignDraft.programId}
            onChange={(e) => onChange({ ...assignDraft, programId: e.target.value })}
          >
            <option value="">Select program</option>
            {teamPrograms.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      )}

      {assignDraft.type === 'individual_team' && (
        <p className="muted coach-assignment-hint">
          Individual team programs will support AI-generated plans in a future release.
        </p>
      )}

      <label>Coach notes</label>
      <input
        value={assignDraft.notes}
        onChange={(e) => onChange({ ...assignDraft, notes: e.target.value })}
        placeholder="Assignment notes visible to coach"
      />

      <button
        type="button"
        className="btn small green"
        style={{ marginTop: 8 }}
        onClick={onApply}
        disabled={disabled}
      >
        Apply assignment
      </button>
    </div>
  );
}
