'use client';

import { useEffect } from 'react';
import { useTheme } from './theme/ThemeProvider';
import { resolveThemeId, type ThemeId } from '../../lib/theme/themes';

/** Syncs profile ui_theme into ThemeProvider when available */
export default function ProfileThemeSync({
  profileTheme,
}: {
  profileTheme?: string | null;
}) {
  const { themeId, setThemeId } = useTheme();

  useEffect(() => {
    if (!profileTheme) return;
    const resolved = resolveThemeId(profileTheme);
    if (resolved !== themeId) setThemeId(resolved);
  }, [profileTheme, themeId, setThemeId]);

  return null;
}

export async function persistThemeToProfile(
  supabase: any,
  userId: string,
  themeId: ThemeId,
): Promise<void> {
  const { error } = await supabase
    .from('st_profiles')
    .update({ ui_theme: themeId })
    .eq('user_id', userId);
  if (error && !String(error.message || '').includes('ui_theme')) {
    console.warn('Could not persist theme preference:', error.message);
  }
}
