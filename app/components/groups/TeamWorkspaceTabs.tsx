'use client';

export type TeamWorkspaceTab = 'members' | 'programs' | 'progress' | 'settings';

const TABS: { id: TeamWorkspaceTab; label: string }[] = [
  { id: 'members', label: 'Members' },
  { id: 'programs', label: 'Programs' },
  { id: 'progress', label: 'Team status' },
  { id: 'settings', label: 'Settings' },
];

type TeamWorkspaceTabsProps = {
  active: TeamWorkspaceTab;
  onChange: (tab: TeamWorkspaceTab) => void;
};

export default function TeamWorkspaceTabs({ active, onChange }: TeamWorkspaceTabsProps) {
  return (
    <div className="team-workspace-tabs" role="tablist" aria-label="Team workspace">
      {TABS.map((tab) => (
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
