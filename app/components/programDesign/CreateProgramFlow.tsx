'use client';

import { useEffect, useMemo, useState } from 'react';
import DateInput from '../DateInput';
import {
  cycleEndDate,
  formatCycleLength,
  formatLongWeekday,
  isMonday,
  snapStartToMonday,
} from '../../../lib/programDesign/cycle';
import { CYCLE_LENGTH_PRESETS, type ProgramScope } from '../../../lib/programDesign/types';

type CreateProgramFlowProps = {
  scope: ProgramScope;
  groupName?: string | null;
  defaultStart: string;
  saving: boolean;
  error?: string;
  /** Shown for group owners sequencing multiple dated plans. */
  sequencingHint?: string | null;
  onCancel: () => void;
  onCreate: (input: { name: string; startDate: string; cycleWeeks: number }) => Promise<void>;
};

export default function CreateProgramFlow({
  scope,
  groupName,
  defaultStart,
  saving,
  error,
  sequencingHint = null,
  onCancel,
  onCreate,
}: CreateProgramFlowProps) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [preset, setPreset] = useState<number | 'custom'>(6);
  const [customWeeks, setCustomWeeks] = useState(10);

  useEffect(() => {
    setStartDate(defaultStart);
  }, [defaultStart]);

  const snapped = useMemo(() => snapStartToMonday(startDate), [startDate]);
  const cycleWeeks = preset === 'custom' ? Math.max(1, Math.min(52, customWeeks || 1)) : preset;
  const endDate = cycleEndDate(snapped.startDate, cycleWeeks);
  const startAdjusted = snapped.adjusted || !isMonday(startDate);

  async function handleSubmit() {
    if (!name.trim()) return;
    await onCreate({ name: name.trim(), startDate: snapped.startDate, cycleWeeks });
  }

  return (
    <div className="pd-create">
      <button type="button" className="pd-back" onClick={onCancel}>
        ← Back to programs
      </button>
      <p className="pd-eyebrow">{scope === 'group' ? 'Group program' : 'Personal program'}</p>
      <h1>Create program</h1>
      <p className="muted pd-lead">
        Start with the basics. You can build the weekly health calendar next.
        {scope === 'group' && groupName ? ` This will belong to ${groupName}.` : ''}
      </p>
      {sequencingHint && <p className="pd-note">{sequencingHint}</p>}

      <label htmlFor="pd-program-name">Program name</label>
      <input
        id="pd-program-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Strength & Longevity"
        autoFocus
      />

      <label htmlFor="pd-start-date">Start date</label>
      <DateInput id="pd-start-date" value={startDate} onChange={setStartDate} />
      {startAdjusted && (
        <p className="pd-note">
          Program cycles begin on Monday. Start date set to <b>{formatLongWeekday(snapped.startDate)}</b>.
        </p>
      )}

      <label>Cycle length</label>
      <div className="pd-cycle-grid">
        {CYCLE_LENGTH_PRESETS.map((weeks) => (
          <button
            key={weeks}
            type="button"
            className={`pd-cycle-chip${preset === weeks ? ' active' : ''}`}
            onClick={() => setPreset(weeks)}
          >
            {formatCycleLength(weeks)}
          </button>
        ))}
        <button
          type="button"
          className={`pd-cycle-chip${preset === 'custom' ? ' active' : ''}`}
          onClick={() => setPreset('custom')}
        >
          Custom
        </button>
      </div>
      {preset === 'custom' && (
        <>
          <label htmlFor="pd-custom-weeks">Weeks</label>
          <input
            id="pd-custom-weeks"
            type="number"
            min={1}
            max={52}
            value={customWeeks}
            onChange={(e) => setCustomWeeks(Number(e.target.value))}
          />
        </>
      )}

      <div className="pd-end-card">
        <div>
          <span className="muted">Start</span>
          <b>{formatLongWeekday(snapped.startDate)}</b>
        </div>
        <div>
          <span className="muted">End</span>
          <b>{formatLongWeekday(endDate)}</b>
        </div>
        <div>
          <span className="muted">Cycle</span>
          <b>{formatCycleLength(cycleWeeks)}</b>
        </div>
      </div>
      <p className="muted">Programs use complete Monday–Sunday weeks. Only this cycle is scheduled — not an open-ended calendar.</p>

      {error && <p className="pd-error">{error}</p>}

      <div className="actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn green" disabled={saving || !name.trim()} onClick={() => void handleSubmit()}>
          {saving ? 'Creating…' : 'Continue to calendar'}
        </button>
        <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
