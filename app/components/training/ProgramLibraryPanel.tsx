'use client';

import {
  isDraftProgram,
  programOptionLabel,
  programStatusLabel,
  programStatusOf,
} from '../../../lib/training/programStatus';

type ProgramLibraryPanelProps = {
  programs: any[];
  defaultProgramId?: string | null;
  canDelete: boolean;
  onDelete: (programId: string) => void;
};

export default function ProgramLibraryPanel({
  programs,
  defaultProgramId = null,
  canDelete,
  onDelete,
}: ProgramLibraryPanelProps) {
  if (!programs.length) return null;

  const sorted = [...programs].sort((a, b) => {
    const ad = isDraftProgram(a) ? 0 : 1;
    const bd = isDraftProgram(b) ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  return (
    <div className="card program-library-panel" style={{ marginTop: 12 }}>
      <h3 style={{ marginBottom: 4 }}>Manage programs</h3>
      <p className="muted" style={{ marginBottom: 10 }}>
        Remove drafts or old programs you no longer need. Completed workout history is kept.
      </p>
      {sorted.map((p) => {
        const isDefault = defaultProgramId === p.id;
        return (
          <div key={p.id} className="program-library-row">
            <div>
              <b>{programOptionLabel(p)}</b>
              <span className="muted">
                {programStatusLabel(programStatusOf(p))} · {p.weeks || 6} wk
                {p.generation_method ? ` · ${p.generation_method}` : ''}
                {isDefault ? ' · Team active program' : ''}
              </span>
            </div>
            {canDelete && (
              <button
                type="button"
                className="btn small red"
                disabled={isDefault}
                title={isDefault ? 'Assign a different team active program before deleting' : undefined}
                onClick={() => onDelete(p.id)}
              >
                Delete
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
