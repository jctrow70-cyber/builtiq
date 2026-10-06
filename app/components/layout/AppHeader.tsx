'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import NotificationCenter from '../notifications/NotificationCenter';

type AppHeaderProps = {
  displayName: string;
  contextLabel: string;
  userId?: string | null;
  onOpenNotification?: (row: { destination_kind?: string | null }) => void;
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
  userId,
  onOpenNotification,
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
          {userId && <NotificationCenter userId={userId} onOpen={onOpenNotification} />}
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
