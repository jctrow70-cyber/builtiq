'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import IconButton from '../ui/IconButton';

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

type AppHeaderProps = {
  displayName: string;
  contextLabel: string;
  onOpenSettings: () => void;
  onOpenProgress: () => void;
  onOpenAiCoach: () => void;
  onSignOut: () => void;
  onReportIssue: () => void;
  children?: ReactNode;
};

export default function AppHeader({
  displayName,
  contextLabel,
  onOpenSettings,
  onOpenProgress,
  onOpenAiCoach,
  onSignOut,
  onReportIssue,
  children,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const initial = (displayName || 'U').trim().charAt(0).toUpperCase();

  return (
    <header className="app-header-v2">
      <div className="app-header-v2-top">
        <div className="app-header-v2-brand-block">
          <div className="brand app-header-v2-brand">
            Build<span>IQ</span> Health
          </div>
          <p className="app-header-v2-sub">{contextLabel}</p>
        </div>
        <div className="app-header-v2-actions">
          <IconButton label="Notifications (coming soon)" variant="soft" size="sm" disabled>
            <BellIcon />
          </IconButton>
          <div className="app-header-v2-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="app-header-v2-avatar"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {initial}
            </button>
            {menuOpen && (
              <div className="app-header-v2-menu" role="menu">
                <p className="app-header-v2-menu-name">{displayName || 'Account'}</p>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
                  Settings
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenProgress(); }}>
                  Progress
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenAiCoach(); }}>
                  AI Coach
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onReportIssue(); }}>
                  Report an issue
                </button>
                <hr className="app-header-v2-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="app-header-v2-menu-danger"
                  onClick={() => { setMenuOpen(false); onSignOut(); }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {children}
    </header>
  );
}
