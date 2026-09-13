'use client';

import { useState } from 'react';

type StrengthWorkoutSetupSheetProps = {
  dayLabel: string;
  title: string;
  generating?: boolean;
  error?: string;
  onClose: () => void;
  onGenerate: (prompt: string) => Promise<void>;
  onManual: () => void;
};

export default function StrengthWorkoutSetupSheet({
  dayLabel,
  title,
  generating = false,
  error = '',
  onClose,
  onGenerate,
  onManual,
}: StrengthWorkoutSetupSheetProps) {
  const [mode, setMode] = useState<'choose' | 'ai'>('choose');
  const [prompt, setPrompt] = useState('');

  return (
    <div className="panel-overlay" onClick={generating ? undefined : onClose}>
      <div className="pd-sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">Strength workout</p>
            <h2>{title || 'Strength'}</h2>
            <p className="muted">{dayLabel}</p>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose} disabled={generating}>
            Close
          </button>
        </div>

        {mode === 'choose' && (
          <>
            <p className="muted" style={{ margin: '8px 0 4px' }}>
              This day is ready to log. Build the exercises with AI, or add them yourself.
            </p>
            <div className="pd-choice-grid">
              <button type="button" className="pd-choice-btn" onClick={() => setMode('ai')} disabled={generating}>
                <b>Generate with AI</b>
                <span>Build this one workout from your profile and a short note. Does not rewrite your program.</span>
              </button>
              <button type="button" className="pd-choice-btn" onClick={onManual} disabled={generating}>
                <b>Create manually</b>
                <span>Open the workout editor and add exercises and sets yourself.</span>
              </button>
            </div>
          </>
        )}

        {mode === 'ai' && (
          <>
            <label htmlFor="pd-strength-ai-prompt">What should this workout focus on?</label>
            <textarea
              id="pd-strength-ai-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Optional — e.g. upper body, 45 minutes, dumbbells only"
              disabled={generating}
            />
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Leave blank to use your saved training profile. Only this workout is generated.
            </p>
            {error && <p className="pd-error">{error}</p>}
            <div className="actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn green"
                onClick={() => void onGenerate(prompt)}
                disabled={generating}
              >
                {generating ? 'Generating…' : 'Generate workout'}
              </button>
              <button type="button" className="btn secondary" onClick={() => setMode('choose')} disabled={generating}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
