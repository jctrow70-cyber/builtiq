'use client';

import { useEffect, useState } from 'react';
import { ACTIVITY_TYPE_META } from '../../../lib/programDesign/activityTypes';
import { draftWeekdays, normalizeWeekdays } from '../../../lib/programDesign/recurrence';
import {
  ACTIVITY_TYPES,
  WEEKDAY_LABELS,
  type ActivityDraft,
  type ActivityType,
  type ProgramActivity,
} from '../../../lib/programDesign/types';

type AddActivitySheetProps = {
  dayLabel: string;
  existing?: ProgramActivity | null;
  allowRecurrence?: boolean;
  allowMultiDay?: boolean;
  allowRemainingWeeks?: boolean;
  defaultWeekday?: number;
  onClose: () => void;
  onSave: (draft: ActivityDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

function emptyDraft(type: ActivityType = 'strength', weekday = 0): ActivityDraft {
  return {
    activity_type: type,
    title: ACTIVITY_TYPE_META[type].defaultTitle,
    duration_minutes: type === 'rest' ? null : 45,
    notes: '',
    details: {},
    recurrence: 'none',
    recurrence_until: null,
    recurrence_weekdays: [weekday],
    applyRemainingWeeks: true,
  };
}

function draftFromActivity(activity: ProgramActivity, weekday: number): ActivityDraft {
  return {
    activity_type: activity.activity_type,
    title: activity.title,
    duration_minutes: activity.duration_minutes,
    notes: activity.notes,
    details: { ...(activity.details || {}) },
    recurrence_weekdays: draftWeekdays(
      { recurrence_weekdays: (activity.details as { recurrence_weekdays?: number[] })?.recurrence_weekdays },
      weekday
    ),
  };
}

function toggleWeekday(days: number[], day: number): number[] {
  if (days.includes(day)) {
    const next = days.filter((d) => d !== day);
    return next.length ? next : days;
  }
  return normalizeWeekdays([...days, day]);
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="pd-weekday-row" role="group" aria-label="Days of the week">
      {WEEKDAY_LABELS.map((label, idx) => (
        <button
          key={label}
          type="button"
          className={`pd-weekday-chip${value.includes(idx) ? ' active' : ''}`}
          aria-pressed={value.includes(idx)}
          onClick={() => onChange(toggleWeekday(value, idx))}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function AddActivitySheet({
  dayLabel,
  existing,
  allowRecurrence = false,
  allowMultiDay = false,
  allowRemainingWeeks = false,
  defaultWeekday = 0,
  onClose,
  onSave,
  onDelete,
}: AddActivitySheetProps) {
  const [draft, setDraft] = useState<ActivityDraft>(
    existing ? draftFromActivity(existing, defaultWeekday) : emptyDraft('strength', defaultWeekday)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isLegacy = !!existing?.id.startsWith('legacy-');
  const weekdays = draftWeekdays(draft, defaultWeekday);

  useEffect(() => {
    setDraft(existing ? draftFromActivity(existing, defaultWeekday) : emptyDraft('strength', defaultWeekday));
    setError('');
  }, [existing, defaultWeekday]);

  const type = draft.activity_type;
  const showCardio = type === 'cardio';
  const showMobility = type === 'mobility' || type === 'stretching';
  const showDuration = type !== 'rest';
  const showWeekdays = allowMultiDay && !existing && (allowRecurrence ? draft.recurrence === 'weekly' : true);

  async function handleSave() {
    if (!draft.title.trim()) {
      setError('Give this activity a name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...draft,
        recurrence_weekdays: weekdays,
      });
    } catch (e: any) {
      setError(e?.message || 'Could not save activity');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="pd-sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="pd-eyebrow">{existing ? 'Edit activity' : 'Add activity'}</p>
            <h2>{dayLabel}</h2>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {isLegacy && (
          <p className="muted pd-note">
            This day comes from an existing Training workout. Full strength editing stays in Training for now.
          </p>
        )}

        <label>Activity type</label>
        <div className="pd-type-grid">
          {ACTIVITY_TYPES.map((id) => {
            const meta = ACTIVITY_TYPE_META[id];
            return (
              <button
                key={id}
                type="button"
                className={`pd-type-chip${type === id ? ' active' : ''}`}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    activity_type: id,
                    title: prev.title === ACTIVITY_TYPE_META[prev.activity_type].defaultTitle ? meta.defaultTitle : prev.title,
                    duration_minutes: id === 'rest' ? null : prev.duration_minutes ?? 30,
                  }))
                }
              >
                <b>{meta.shortLabel}</b>
                <span>{meta.description}</span>
              </button>
            );
          })}
        </div>

        <label>Activity name</label>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder={ACTIVITY_TYPE_META[type].defaultTitle}
        />

        {showDuration && (
          <>
            <label>Duration (minutes)</label>
            <input
              type="number"
              min={1}
              max={480}
              value={draft.duration_minutes ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  duration_minutes: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="45"
            />
          </>
        )}

        {showCardio && (
          <>
            <div className="row">
              <div>
                <label>Cardio type</label>
                <input
                  value={String(draft.details.cardio_type || '')}
                  onChange={(e) => setDraft({ ...draft, details: { ...draft.details, cardio_type: e.target.value } })}
                  placeholder="Bike, run, walk…"
                />
              </div>
              <div>
                <label>Intensity / zone</label>
                <input
                  value={String(draft.details.heart_rate_zone || draft.details.intensity || '')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      details: { ...draft.details, heart_rate_zone: e.target.value, intensity: e.target.value },
                    })
                  }
                  placeholder="Zone 2"
                />
              </div>
            </div>
            <label>Distance (optional)</label>
            <input
              value={String(draft.details.distance || '')}
              onChange={(e) => setDraft({ ...draft, details: { ...draft.details, distance: e.target.value } })}
              placeholder="3 miles"
            />
          </>
        )}

        {type === 'strength' && !existing && (
          <p className="muted ai-wiz-coach" style={{ margin: '4px 0 8px', padding: '10px 12px', fontSize: '13px' }}>
            After adding this strength day, you'll be able to import exercises from an existing program.
          </p>
        )}

        {showMobility && (
          <p className="muted">Individual movements can be added in a later update. Name and duration are enough for now.</p>
        )}

        {allowRecurrence && !existing && (
          <>
            <label className="remember-row" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={draft.recurrence === 'weekly'}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    recurrence: e.target.checked ? 'weekly' : 'none',
                    recurrence_weekdays: e.target.checked ? weekdays : [defaultWeekday],
                  })
                }
              />
              Repeat weekly
            </label>
            {draft.recurrence === 'weekly' && (
              <>
                <p className="muted" style={{ margin: '8px 0 0' }}>
                  Repeats on the days you pick, starting from this date. Days before today this week are skipped.
                </p>
                <label htmlFor="pd-recur-until">Repeat until (optional)</label>
                <input
                  id="pd-recur-until"
                  type="date"
                  value={draft.recurrence_until || ''}
                  onChange={(e) => setDraft({ ...draft, recurrence_until: e.target.value || null })}
                />
              </>
            )}
          </>
        )}

        {showWeekdays && (
          <>
            <label>{allowRecurrence ? 'Repeat on' : 'Add on these days'}</label>
            <WeekdayPicker
              value={weekdays}
              onChange={(days) => setDraft({ ...draft, recurrence_weekdays: days })}
            />
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => setDraft({ ...draft, recurrence_weekdays: [0, 1, 2, 3, 4, 5, 6] })}
              >
                Every day
              </button>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => setDraft({ ...draft, recurrence_weekdays: [0, 2, 4] })}
              >
                Mon / Wed / Fri
              </button>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => setDraft({ ...draft, recurrence_weekdays: [1, 3] })}
              >
                Tue / Thu
              </button>
            </div>
          </>
        )}

        {allowRemainingWeeks && !existing && (
          <label className="remember-row" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={!!draft.applyRemainingWeeks}
              onChange={(e) => setDraft({ ...draft, applyRemainingWeeks: e.target.checked })}
            />
            Add through remaining weeks of this program
          </label>
        )}

        <label>Notes</label>
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="Optional details"
        />

        {error && <p className="pd-error">{error}</p>}

        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn green" onClick={() => void handleSave()} disabled={saving || isLegacy}>
            {saving ? 'Saving…' : existing ? 'Save activity' : 'Add activity'}
          </button>
          {existing && onDelete && !isLegacy && (
            <button type="button" className="btn small red" onClick={() => void onDelete()}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
