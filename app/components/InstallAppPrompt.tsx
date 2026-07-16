'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'buildiq_install_prompt_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandaloneDisplay()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isIosDevice()) {
      setShowIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
    setInstallEvent(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') dismiss();
    else setInstallEvent(null);
  }

  if (!visible) return null;

  return (
    <div className="install-app-banner" role="region" aria-label="Install BuildIQ app">
      <div className="install-app-banner-inner">
        <div>
          <strong>Install BuildIQ</strong>
          <p className="muted">
            {showIosHint && !installEvent
              ? 'Tap Share, then Add to Home Screen for a full-screen app experience.'
              : 'Add BuildIQ to your home screen for quick access while you train.'}
          </p>
        </div>
        <div className="install-app-banner-actions">
          {installEvent && (
            <button type="button" className="btn green small" onClick={install}>
              Install
            </button>
          )}
          <button type="button" className="btn secondary small" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
