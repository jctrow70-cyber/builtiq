'use client';

import { GROUP_WORKSPACE_TABS, type TeamWorkspaceTab } from '../../../lib/groups/workspaceTabs';

type TeamWorkspaceTabsProps = {
  active: TeamWorkspaceTab;
  onChange: (tab: TeamWorkspaceTab) => void;
};

export default function TeamWorkspaceTabs({ active, onChange }: TeamWorkspaceTabsProps) {
  return (
    <div className="team-workspace-tabs" role="tablist" aria-label="Group workspace">
      {GROUP_WORKSPACE_TABS.map((tab) => (
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
