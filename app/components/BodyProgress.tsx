'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DateInput from './DateInput';
import SegmentedControl from './ui/SegmentedControl';
import { deleteBodyMeasurement, fetchBodyMeasurements, saveBodyMeasurement } from '../../lib/body/api';
import {
  deltaLabel,
  formatWaist,
  formatWeight,
  fromCanonicalWaist,
  fromCanonicalWeight,
  type BodyMeasurementRow,
  type UnitsPreference,
  waistUnitLabel,
  weightUnitLabel,
} from '../../lib/body/measurements';
import { formatDisplayDate, todayYmd } from '../../lib/training/programCalendar';

type BodyProgressProps = {
  userId: string;
  unitsPreference?: string | null;
  onDataChange?: () => void;
};

export default function BodyProgress({ userId, unitsPreference, onDataChange }: BodyProgressProps) {
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';
  const [rows, setRows] = useState<BodyMeasurementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [measuredOn, setMeasuredOn] = useState(todayYmd());
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [notes, setNotes] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'weight' | 'waist'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBodyMeasurements(userId);
      setRows(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load body measurements.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestWeight = useMemo(() => rows.find((r) => r.weight_lbs != null) || null, [rows]);
  const latestWaist = useMemo(() => rows.find((r) => r.waist_inches != null) || null, [rows]);
  const priorWeight = useMemo(
    () => rows.filter((r) => r.weight_lbs != null).slice(1, 2)[0] || null,
    [rows]
  );
  const priorWaist = useMemo(
    () => rows.filter((r) => r.waist_inches != null).slice(1, 2)[0] || null,
    [rows]
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'weight') return rows.filter((r) => r.weight_lbs != null);
    if (historyFilter === 'waist') return rows.filter((r) => r.waist_inches != null);
    return rows;
  }, [rows, historyFilter]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveBodyMeasurement(userId, { measured_on: measuredOn, weight, waist, notes }, units);
      setWeight('');
      setWaist('');
      setNotes('');
      await load();
      onDataChange?.();
    } catch (e: any) {
      setError(e?.message || 'Could not save measurement.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this body check-in?')) return;
    setError(null);
    try {
      await deleteBodyMeasurement(userId, id);
      await load();
      onDataChange?.();
    } catch (e: any) {
      setError(e?.message || 'Could not delete measurement.');
    }
  }

  function fillFromLatest() {
    if (latestWeight?.weight_lbs != null) {
      const w = fromCanonicalWeight(latestWeight.weight_lbs, units);
      if (w != null) setWeight(String(w));
    }
    if (latestWaist?.waist_inches != null) {
      const c = fromCanonicalWaist(latestWaist.waist_inches, units);
      if (c != null) setWaist(String(c));
    }
    setMeasuredOn(todayYmd());
  }

  return (
    <div className="body-progress">
      <div className="card body-progress-summary">
        <div className="topline" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2>Body overview</h2>
          <button type="button" className="btn small secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
        <p className="muted">Track weight and waist circumference over time. History stays as logged.</p>
        <div className="dash-metrics body-progress-metrics">
          <div>
            <b>{formatWeight(latestWeight?.weight_lbs, units)}</b>
            <span className="muted">
              Latest weight
              {latestWeight ? ` · ${formatDisplayDate(latestWeight.measured_on)}` : ''}
            </span>
            {(() => {
              const d = deltaLabel(latestWeight?.weight_lbs, priorWeight?.weight_lbs, units, 'weight');
              return d ? <span className="body-delta muted">{d} vs prior</span> : null;
            })()}
          </div>
          <div>
            <b>{formatWaist(latestWaist?.waist_inches, units)}</b>
            <span className="muted">
              Latest waist
              {latestWaist ? ` · ${formatDisplayDate(latestWaist.measured_on)}` : ''}
            </span>
            {(() => {
              const d = deltaLabel(latestWaist?.waist_inches, priorWaist?.waist_inches, units, 'waist');
              return d ? <span className="body-delta muted">{d} vs prior</span> : null;
            })()}
          </div>
        </div>
      </div>

      <div className="card body-progress-form-card">
        <div className="topline" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2>Log measurement</h2>
          {(latestWeight || latestWaist) && (
            <button type="button" className="btn small secondary" onClick={fillFromLatest}>
              Prefill latest
            </button>
          )}
        </div>
        <div className="body-progress-form">
          <label className="body-field">
            <span>Date</span>
            <DateInput value={measuredOn} onChange={setMeasuredOn} aria-label="Measurement date" />
          </label>
          <label className="body-field">
            <span>Weight ({weightUnitLabel(units)})</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder={units === 'metric' ? 'e.g. 80' : 'e.g. 180'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="body-field">
            <span>Waist ({waistUnitLabel(units)})</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder={units === 'metric' ? 'e.g. 86' : 'e.g. 34'}
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
            />
          </label>
          <label className="body-field body-field--wide">
            <span>Notes (optional)</span>
            <input
              type="text"
              placeholder="Morning weigh-in, after workout…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Same-day entries update that day&apos;s check-in. Leave a field blank to keep the previous value for that day.
        </p>
        <div className="actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn green" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
        {error && <p className="body-error">{error}</p>}
      </div>

      <div className="card">
        <div className="topline" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2>Measurement history</h2>
          <SegmentedControl
            ariaLabel="Body history filter"
            size="sm"
            value={historyFilter}
            onChange={(v) => setHistoryFilter(v as 'all' | 'weight' | 'waist')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'weight', label: 'Weight' },
              { value: 'waist', label: 'Waist' },
            ]}
          />
        </div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && filteredHistory.length === 0 && (
          <p className="muted">No body measurements yet. Log your first weight or waist check-in above.</p>
        )}
        <div className="body-history-list">
          {filteredHistory.map((row) => (
            <div className="body-history-row" key={row.id}>
              <div className="body-history-main">
                <b>{formatDisplayDate(row.measured_on)}</b>
                <span className="muted">
                  {[
                    row.weight_lbs != null ? `Weight ${formatWeight(row.weight_lbs, units)}` : null,
                    row.waist_inches != null ? `Waist ${formatWaist(row.waist_inches, units)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {row.notes && <span className="body-history-notes muted">{row.notes}</span>}
              </div>
              <button type="button" className="btn small red" onClick={() => void handleDelete(row.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
