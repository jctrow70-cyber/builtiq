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
    description: 'Soft purple accents — welcoming and reassuring for beginners.',
    previewAccent: '#9b87f5',
    previewBackground: '#0a0c14',
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Electric blue — athletic, high contrast, data-driven.',
    previewAccent: '#38bdf8',
    previewBackground: '#05080f',
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
