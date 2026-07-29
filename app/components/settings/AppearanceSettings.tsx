'use client';

import { THEMES, type ThemeId } from '../../../lib/theme/themes';
import { useTheme } from '../theme/ThemeProvider';
import Card from '../ui/Card';

export default function AppearanceSettings() {
  const { themeId, setThemeId } = useTheme();

  return (
    <Card className="appearance-settings">
      <h2 className="ui-card-title">Appearance</h2>
      <p className="muted appearance-settings-intro">
        Choose a visual theme. Layout and navigation stay the same — only colors and styling change.
      </p>
      <div className="theme-picker-grid" role="radiogroup" aria-label="Theme">
        {THEMES.map((theme) => {
          const selected = themeId === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`theme-picker-card${selected ? ' theme-picker-card--selected' : ''}`}
              onClick={() => setThemeId(theme.id as ThemeId)}
            >
              <span
                className="theme-picker-preview"
                style={{
                  background: `linear-gradient(145deg, ${theme.previewBackground}, ${theme.previewAccent}22)`,
                  borderColor: theme.previewAccent,
                }}
              >
                <span
                  className="theme-picker-accent-dot"
                  style={{ background: theme.previewAccent }}
                />
              </span>
              <span className="theme-picker-label">{theme.label}</span>
              <span className="theme-picker-desc">{theme.description}</span>
              {theme.id === 'calm' && (
                <span className="ui-badge theme-picker-default">Default</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="muted appearance-settings-note">
        Theme preference is saved on this device and synced to your profile.
      </p>
    </Card>
  );
}
