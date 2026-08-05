'use client';

import { type ThemeId } from '../../../lib/theme/themes';

/** @deprecated Theme is fixed — profile sync is no longer needed */
export default function ProfileThemeSync(_props: { profileTheme?: string | null }) {
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
