'use client';

type GroupPlanAssignmentFormProps = {
  assignDraft: { type: string; programId: string; notes: string };
  programs: Array<{ id: string; name?: string | null }>;
  onAssignDraftChange: (draft: { type: string; programId: string; notes: string }) => void;
  onApply: () => void;
};

/** Existing per-member assignment controls, kept until the Assign Training wizard replaces them. */
export default function GroupPlanAssignmentForm({
  assignDraft,
  programs,
  onAssignDraftChange,
  onApply,
}: GroupPlanAssignmentFormProps) {
  return (
    <div className="member-assignment-panel member-training-plan-form">
      <label>Program assignment</label>
      <select value={assignDraft.type} onChange={(e) => onAssignDraftChange({ ...assignDraft, type: e.target.value })}>
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
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name || 'Program'}
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
      <button type="button" className="btn small green" style={{ marginTop: 8 }} onClick={onApply}>
        Apply assignment
      </button>
    </div>
  );
}
