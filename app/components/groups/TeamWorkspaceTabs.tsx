'use client';

import type { TeamWorkspaceTab } from '../../../lib/groups/workspaceTabs';

type TeamWorkspaceTabsProps = {
  tabs: ReadonlyArray<{ id: TeamWorkspaceTab; label: string }>;
  active: TeamWorkspaceTab;
  onChange: (tab: TeamWorkspaceTab) => void;
};

export default function TeamWorkspaceTabs({ tabs, active, onChange }: TeamWorkspaceTabsProps) {
  return (
    <div className="team-workspace-tabs" role="tablist" aria-label="Group workspace">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export type { TeamWorkspaceTab };
