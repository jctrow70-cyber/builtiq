'use client';

import Card from '../ui/Card';

export default function AppearanceSettings() {
  return (
    <Card className="appearance-settings">
      <h2 className="ui-card-title">Appearance</h2>
      <p className="muted appearance-settings-intro">
        BuildIQ Health uses a single dark performance theme — deep navy surfaces with electric
        blue accents and glow on active elements.
      </p>
      <p className="muted appearance-settings-note">
        Theme customization is not available yet. More appearance options may come in a future
        update.
      </p>
    </Card>
  );
}
