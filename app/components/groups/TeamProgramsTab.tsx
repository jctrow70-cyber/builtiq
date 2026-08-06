'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TeamProgramRow } from '../../../lib/groups/programRoster';

type TeamProgramsTabProps = {
  canManage: boolean;
  programRows: TeamProgramRow[];
  wizardOpen: boolean;
  wizardMemberName?: string | null;
  teamProgramSetupPanel: ReactNode | null;
  onOpenCreateWizard: () => void;
  onOpenGenerateWizard: () => void;
  onCloseWizard: () => void;
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
                {row.status === 'draft' ? 'Edit' : 'Edit workouts'}
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
  wizardOpen,
  wizardMemberName = null,
  teamProgramSetupPanel,
  onOpenCreateWizard,
  onOpenGenerateWizard,
  onCloseWizard,
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

  if (wizardOpen && teamProgramSetupPanel) {
    return (
      <div className="card team-programs-wizard">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>Team program</h2>
            {wizardMemberName && (
              <p className="muted" style={{ marginTop: 4 }}>
                Generating for <b>{wizardMemberName}</b> — publish when ready to assign.
              </p>
            )}
          </div>
          <button type="button" className="btn small secondary" onClick={onCloseWizard}>
            Back to programs
          </button>
        </div>
        {teamProgramSetupPanel}
      </div>
    );
  }

  return (
    <div className="card team-programs-tab">
      <div className="topline" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>{programsView === 'drafts' ? 'Draft programs' : 'Programs'}</h2>
          <p className="muted">
            {programsView === 'drafts'
              ? 'Unpublished team plans — edit workouts, then publish when ready.'
              : 'Create, generate, and assign team training plans.'}
          </p>
        </div>
        {canManage && (
          <div className="actions team-programs-actions">
            {programsView === 'published' ? (
              <>
                <button type="button" className="btn small green" onClick={onOpenGenerateWizard}>
                  Generate
                </button>
                <button
                  type="button"
                  className="btn small secondary team-programs-drafts-btn"
                  onClick={() => setProgramsView('drafts')}
                >
                  Drafts{draftRows.length > 0 ? ` (${draftRows.length})` : ''}
                </button>
                <button type="button" className="btn small secondary" onClick={onOpenCreateWizard}>
                  Create
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
              ? 'No draft programs yet. Use Generate or Create to start a draft, then return here to edit and publish.'
              : 'No draft programs.'
            : canManage
              ? 'No published team programs yet. Generate or create one to get started.'
              : 'No published team programs yet.'}
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
