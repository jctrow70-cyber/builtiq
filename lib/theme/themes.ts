/** Single app theme (Option D — dark navy + electric blue). Legacy profile/storage ids map here. */
export type ThemeId = 'performance';

export const THEME_STORAGE_KEY = 'buildiq_theme';

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  description: string;
  previewAccent: string;
  previewBackground: string;
};

export const THEME: ThemeDefinition = {
  id: 'performance',
  label: 'Performance',
  description:
    'Deep navy with electric blue glow — bold contrast for focused, high-intensity training.',
  previewAccent: '#0066FF',
  previewBackground: '#0a0f18',
};

/** @deprecated Use THEME — kept for imports that expect an array */
export const THEMES: ThemeDefinition[] = [THEME];

export const DEFAULT_THEME_ID: ThemeId = 'performance';

const LEGACY_THEME_IDS = new Set([
  'calm',
  'performance',
  'energy',
  'nature',
  'minimal',
  'default',
]);

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value === 'performance';
}

/** Always returns the single app theme; legacy stored/profile ids are ignored. */
export function resolveThemeId(_value: string | null | undefined): ThemeId {
  if (_value && LEGACY_THEME_IDS.has(_value)) return DEFAULT_THEME_ID;
  return DEFAULT_THEME_ID;
}
