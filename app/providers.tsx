'use client';

import { useEffect } from 'react';
import { initMobilePlatform } from '../lib/mobile';
import ThemeProvider from './components/theme/ThemeProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void initMobilePlatform();
  }, []);

  return <ThemeProvider>{children}</ThemeProvider>;
}
