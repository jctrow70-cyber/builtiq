'use client';

type DashboardQuickActionsProps = {
  showGroup: boolean;
  onLogMeal: () => void;
  onAddCheckIn: () => void;
  onViewProgress: () => void;
  onViewGroup: () => void;
};

function ActionIcon({ kind }: { kind: 'meal' | 'check-in' | 'progress' | 'group' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  if (kind === 'meal') {
    return (
      <svg {...common}>
        <path d="M12 3c3 4 5 6.5 5 10a5 5 0 1 1-10 0c0-3.5 2-6 5-10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'check-in') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 19c.6-2.8 2.8-4.5 6-4.5S17.4 16.2 18 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M17 4.5v4M15 6.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'progress') {
    return (
      <svg {...common}>
        <path d="M4 16l5-5 3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 7h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 19c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5M14 19c0-1.8 1.6-3.2 3.5-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardQuickActions({
  showGroup,
  onLogMeal,
  onAddCheckIn,
  onViewProgress,
  onViewGroup,
}: DashboardQuickActionsProps) {
  return (
    <section className="dash-quick" aria-label="Quick actions">
      <button type="button" className="dash-quick-btn" onClick={onLogMeal}>
        <ActionIcon kind="meal" />
        Log meal
      </button>
      <button type="button" className="dash-quick-btn" onClick={onAddCheckIn}>
        <ActionIcon kind="check-in" />
        Add check-in
      </button>
      <button type="button" className="dash-quick-btn" onClick={onViewProgress}>
        <ActionIcon kind="progress" />
        View Progress
      </button>
      {showGroup && (
        <button type="button" className="dash-quick-btn" onClick={onViewGroup}>
          <ActionIcon kind="group" />
          View group
        </button>
      )}
    </section>
  );
}
