'use client';

import { useEffect, useRef, useState } from 'react';
import { roleLabel } from '../../../lib/groups';

type TeamSelectorProps = {
  teams: any[];
  activeTeam: any | null;
  memberCount: number;
  onSelectTeam: (teamId: string) => void;
  onCreateTeam: () => void;
  onJoinTeam: () => void;
};

export default function TeamSelector({
  teams,
  activeTeam,
  memberCount,
  onSelectTeam,
  onCreateTeam,
  onJoinTeam,
}: TeamSelectorProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="team-selector-wrap" ref={wrapRef}>
      <button
        type="button"
        className="team-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="team-selector-label">Teams</span>
        <span className="team-selector-value">{activeTeam?.name || 'Select team'}</span>
        <span className="team-selector-chevron" aria-hidden="true">
          ▼
        </span>
      </button>
      {activeTeam && (
        <p className="muted team-selector-meta">
          {roleLabel(activeTeam.my_role)} · {memberCount} member{memberCount === 1 ? '' : 's'}
        </p>
      )}
      {open && (
        <div className="team-selector-menu" role="listbox">
          {teams.map((t: any) => {
            const selected = t.id === activeTeam?.id;
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`team-selector-item${selected ? ' selected' : ''}`}
                onClick={() => {
                  onSelectTeam(t.id);
                  setOpen(false);
                }}
              >
                <span className="team-selector-item-name">
                  {selected ? '✓ ' : ''}
                  {t.name}
                </span>
                <span className="muted">{roleLabel(t.my_role)}</span>
              </button>
            );
          })}
          <div className="team-selector-divider" />
          <button type="button" className="team-selector-action" onClick={() => { setOpen(false); onCreateTeam(); }}>
            Create Team
          </button>
          <button type="button" className="team-selector-action" onClick={() => { setOpen(false); onJoinTeam(); }}>
            Join Team
          </button>
        </div>
      )}
    </div>
  );
}
