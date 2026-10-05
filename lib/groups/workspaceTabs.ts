export const GROUP_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'training', label: 'Training' },
  { id: 'members', label: 'Members' },
  { id: 'progress', label: 'Progress' },
  { id: 'settings', label: 'Settings' },
] as const;

export type TeamWorkspaceTab = (typeof GROUP_WORKSPACE_TABS)[number]['id'];
