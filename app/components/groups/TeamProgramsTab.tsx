'use client';

import { useState } from 'react';
import type { TeamProgramRow } from '../../../lib/groups/programRoster';

type TeamProgramsTabProps = {
  canManage: boolean;
  programRows: TeamProgramRow[];
  groupName?: string | null;
  onOpenPrograms: () => void;
  onDuplicate: (programId: string) => void;
  onEdit: (programId: string) => void;
  onPublish: (programId: string) => void;
  onAssign: (programId: string) => void;
  onDelete: (programId: string) => void;
  defaultProgramId?: string | null;
};

function ProgramRowList({
  rows,
  canManage,
  defaultProgramId,
  onPublish,
  onEdit,
  onDuplicate,
  onAssign,
  onDelete,
}: {
  rows: TeamProgramRow[];
  canManage: boolean;
  defaultProgramId?: string | null;
  onPublish: (programId: string) => void;
  onEdit: (programId: string) => void;
  onDuplicate: (programId: string) => void;
  onAssign: (programId: string) => void;
  onDelete: (programId: string) => void;
}) {
  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="team-program-row">
          <div>
            <b>{row.name}</b>
            <span className="muted">
              {row.statusLabel} · {row.weeks} wk · {row.assignmentSummary}
              {row.isDefault ? ' · Team default' : ''}
              {row.sourceProgramId ? ' · Custom copy' : ''}
            </span>
          </div>
          {canManage && (
            <div className="actions team-program-row-actions">
              {row.status === 'draft' && (
                <button type="button" className="btn small green" onClick={() => onPublish(row.id)}>
                  Publish
                </button>
              )}
              <button type="button" className="btn small secondary" onClick={() => onEdit(row.id)}>
                Edit in Programs
              </button>
              <button type="button" className="btn small secondary" onClick={() => onDuplicate(row.id)}>
                Duplicate
              </button>
              {row.status === 'published' && (
                <button type="button" className="btn small secondary" onClick={() => onAssign(row.id)}>
                  Assign
                </button>
              )}
              <button
                type="button"
                className="btn small red"
                disabled={row.isDefault || defaultProgramId === row.id}
                title={
                  row.isDefault || defaultProgramId === row.id
                    ? 'Change the team active program before deleting'
                    : undefined
                }
                onClick={() => onDelete(row.id)}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export default function TeamProgramsTab({
  canManage,
  programRows,
  groupName = null,
  onOpenPrograms,
  onDuplicate,
  onEdit,
  onPublish,
  onAssign,
  onDelete,
  defaultProgramId = null,
}: TeamProgramsTabProps) {
  const [programsView, setProgramsView] = useState<'published' | 'drafts'>('published');

  const publishedRows = programRows.filter((row) => row.status !== 'draft');
  const draftRows = programRows.filter((row) => row.status === 'draft');
  const visibleRows = programsView === 'drafts' ? draftRows : publishedRows;
  const forGroup = groupName ? `For ${groupName}` : 'For a group';

  return (
    <div className="card team-programs-tab">
      <div className="topline" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>{programsView === 'drafts' ? 'Draft programs' : 'Assigned programs'}</h2>
          <p className="muted">
            {programsView === 'drafts'
              ? 'Unpublished group plans. Open Programs to edit, then publish here when ready to assign.'
              : `Assign published plans to members. Create and edit plans in Programs → ${forGroup}.`}
          </p>
        </div>
        {canManage && (
          <div className="actions team-programs-actions">
            {programsView === 'published' ? (
              <>
                <button type="button" className="btn small green" onClick={onOpenPrograms}>
                  Create or edit in Programs
                </button>
                <button
                  type="button"
                  className="btn small secondary team-programs-drafts-btn"
                  onClick={() => setProgramsView('drafts')}
                >
                  Drafts{draftRows.length > 0 ? ` (${draftRows.length})` : ''}
                </button>
              </>
            ) : (
              <button type="button" className="btn small secondary" onClick={() => setProgramsView('published')}>
                Back to programs
              </button>
            )}
          </div>
        )}
      </div>

      {visibleRows.length === 0 && (
        <p className="muted" style={{ marginTop: 10 }}>
          {programsView === 'drafts'
            ? canManage
              ? 'No draft programs yet. Create a plan in Programs, then return here to publish and assign.'
              : 'No draft programs.'
            : canManage
              ? 'No published group programs yet. Create a plan in Programs, then assign it here.'
              : 'No published group programs yet.'}
        </p>
      )}

      <ProgramRowList
        rows={visibleRows}
        canManage={canManage}
        defaultProgramId={defaultProgramId}
        onPublish={onPublish}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onAssign={onAssign}
        onDelete={onDelete}
      />
    </div>
  );
}
