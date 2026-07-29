export type ThemeId = 'calm' | 'performance' | 'energy' | 'nature' | 'minimal';

export const THEME_STORAGE_KEY = 'buildiq_theme';

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  description: string;
  previewAccent: string;
  previewBackground: string;
};

export const THEMES: ThemeDefinition[] = [
  {
    id: 'calm',
    label: 'Calm',
    description: 'Light, clean surfaces with soft purple accents — welcoming and easy on the eyes.',
    previewAccent: '#7c5cff',
    previewBackground: '#f5f5f7',
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Deep black with electric blue glow — bold contrast for focused, high-intensity training.',
    previewAccent: '#22d3ee',
    previewBackground: '#000000',
  },
  {
    id: 'energy',
    label: 'Energy',
    description: 'Orange accents — motivating and active without feeling aggressive.',
    previewAccent: '#fb923c',
    previewBackground: '#0c0a08',
  },
  {
    id: 'nature',
    label: 'Nature',
    description: 'Green accents — wellness, recovery, and longevity focused.',
    previewAccent: '#4ade80',
    previewBackground: '#080c0a',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Neutral grays — clean and understated with limited accent color.',
    previewAccent: '#94a3b8',
    previewBackground: '#0a0a0a',
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'calm';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function resolveThemeId(value: string | null | undefined): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}
