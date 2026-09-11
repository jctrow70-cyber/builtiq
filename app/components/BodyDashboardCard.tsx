'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchBodyMeasurements, saveBodyMeasurement } from '../../lib/body/api';
import {
  formatWaist,
  formatWeight,
  type BodyMeasurementRow,
  type UnitsPreference,
  waistUnitLabel,
  weightUnitLabel,
} from '../../lib/body/measurements';
import { formatDisplayDate, todayYmd } from '../../lib/training/programCalendar';

type BodyDashboardCardProps = {
  userId: string;
  unitsPreference?: string | null;
  onOpenProgress?: () => void;
  refreshKey?: number;
};

export default function BodyDashboardCard({
  userId,
  unitsPreference,
  onOpenProgress,
  refreshKey = 0,
}: BodyDashboardCardProps) {
  const units: UnitsPreference = unitsPreference === 'metric' ? 'metric' : 'imperial';
  const [latest, setLatest] = useState<BodyMeasurementRow | null>(null);
  const [latestWeight, setLatestWeight] = useState<BodyMeasurementRow | null>(null);
  const [latestWaist, setLatestWaist] = useState<BodyMeasurementRow | null>(null);
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBodyMeasurements(userId, 30);
      setLatest(rows[0] || null);
      setLatestWeight(rows.find((r) => r.weight_lbs != null) || null);
      setLatestWaist(rows.find((r) => r.waist_inches != null) || null);
    } catch (e: any) {
      setError(e?.message || 'Could not load body stats.');
      setLatest(null);
      setLatestWeight(null);
      setLatestWaist(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleQuickAdd() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveBodyMeasurement(userId, { measured_on: todayYmd(), weight, waist }, units);
      setWeight('');
      setWaist('');
      setMessage('Saved for today');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const hasAny = latestWeight || latestWaist;

  return (
    <div className="dash-card body-dash-card">
      <div className="dash-card-head">
        <h2>Body</h2>
        <span className="badge">{hasAny && latest ? formatDisplayDate(latest.measured_on) : 'Check-in'}</span>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : hasAny ? (
        <>
          <p className="dash-title">{formatWeight(latestWeight?.weight_lbs, units)}</p>
          <div className="dash-metrics">
            <div>
              <b>{formatWeight(latestWeight?.weight_lbs, units)}</b>
              <span className="muted">Weight</span>
            </div>
            <div>
              <b>{formatWaist(latestWaist?.waist_inches, units)}</b>
              <span className="muted">Waist</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Log weight and waist to track body progress.</p>
          <div className="dash-placeholder">
            <span>Weight —</span>
            <span>Waist —</span>
          </div>
        </>
      )}

      <div className="body-quick-add">
        <label className="body-quick-field">
          <span className="muted">Weight ({weightUnitLabel(units)})</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder={units === 'metric' ? 'kg' : 'lb'}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            aria-label={`Quick add weight in ${weightUnitLabel(units)}`}
          />
        </label>
        <label className="body-quick-field">
          <span className="muted">Waist ({waistUnitLabel(units)})</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder={units === 'metric' ? 'cm' : 'in'}
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            aria-label={`Quick add waist in ${waistUnitLabel(units)}`}
          />
        </label>
      </div>

      <div className="actions body-dash-actions">
        <button type="button" className="btn green" onClick={() => void handleQuickAdd()} disabled={saving}>
          {saving ? 'Saving…' : 'Quick add'}
        </button>
        {onOpenProgress && (
          <button type="button" className="btn secondary" onClick={onOpenProgress}>
            View history
          </button>
        )}
      </div>
      {message && <p className="muted body-dash-msg">{message}</p>}
      {error && <p className="body-error">{error}</p>}
    </div>
  );
}
