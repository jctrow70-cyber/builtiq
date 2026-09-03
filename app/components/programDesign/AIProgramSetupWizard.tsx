'use client';

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVITY_TYPE_META } from '../../../lib/programDesign/activityTypes';
import type { ActivityDraft, ActivityType } from '../../../lib/programDesign/types';

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type SuggestedActivity = {
  day: string;
  activity_type: string;
  title: string;
  duration_minutes: number | null;
  notes: string;
  details: Record<string, unknown>;
};

type DayPlan = {
  dayIndex: DayOfWeek;
  activities: ActivityDraft[];
};

type WizardStep = 'describe' | 'review';

type AIProgramSetupWizardProps = {
  supabase: SupabaseClient;
  programName: string;
  onComplete: (weekPlan: DayPlan[]) => void;
  onCancel: () => void;
};

function dayLabelToIndex(label: string): DayOfWeek {
  const idx = DAY_LABELS.indexOf(label);
  return (idx >= 0 ? idx : 0) as DayOfWeek;
}

function suggestedToActivityDraft(s: SuggestedActivity): ActivityDraft {
  const validTypes = new Set(['strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest']);
  const actType = validTypes.has(s.activity_type) ? (s.activity_type as ActivityType) : 'strength';
  return {
    activity_type: actType,
    title: s.title || ACTIVITY_TYPE_META[actType]?.defaultTitle || 'Activity',
    duration_minutes: s.duration_minutes,
    notes: s.notes || '',
    details: s.details || {},
  };
}

function buildWeekPlan(activities: SuggestedActivity[]): DayPlan[] {
  const byDay: Record<number, ActivityDraft[]> = {};
  for (let i = 0; i < 7; i++) byDay[i] = [];

  for (const act of activities) {
    const idx = dayLabelToIndex(act.day);
    if (act.activity_type === 'rest') continue;
    byDay[idx].push(suggestedToActivityDraft(act));
  }

  // Fill empty days with rest
  for (let i = 0; i < 7; i++) {
    if (byDay[i].length === 0) {
      byDay[i].push({
        activity_type: 'rest',
        title: 'Rest',
        duration_minutes: null,
        notes: '',
        details: {},
      });
    }
  }

  return Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i as DayOfWeek,
    activities: byDay[i],
  }));
}

function ActivityChip({ draft, onRemove }: { draft: ActivityDraft; onRemove?: () => void }) {
  const meta = ACTIVITY_TYPE_META[draft.activity_type];
  const isRest = draft.activity_type === 'rest';
  return (
    <div className={`ai-wiz-chip${isRest ? ' rest' : ''}`}>
      <div className="ai-wiz-chip-info">
        <b>{draft.title}</b>
        {draft.duration_minutes && <span className="muted">{draft.duration_minutes} min</span>}
        {!isRest && <span className="muted">{meta?.shortLabel}</span>}
      </div>
      {onRemove && !isRest && (
        <button type="button" className="ai-wiz-chip-remove" onClick={onRemove} aria-label="Remove">
          ×
        </button>
      )}
    </div>
  );
}

export default function AIProgramSetupWizard({
  supabase,
  programName,
  onComplete,
  onCancel,
}: AIProgramSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('describe');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coachMessage, setCoachMessage] = useState('');
  const [weekPlan, setWeekPlan] = useState<DayPlan[]>([]);
  const [dragSource, setDragSource] = useState<{ dayIdx: number; actIdx: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  async function handleGenerate() {
    if (description.trim().length < 8) {
      setError('Tell us more about your weekly plan (at least a few words).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Sign in to use AI program setup.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/programs/suggest-activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ description: description.trim() }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Could not generate activity suggestions.');
        setLoading(false);
        return;
      }

      const plan = buildWeekPlan(data.activities || []);
      setWeekPlan(plan);
      setCoachMessage(data.coach_message || '');
      setStep('review');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    }
    setLoading(false);
  }

  function removeActivity(dayIdx: number, actIdx: number) {
    setWeekPlan((prev) => {
      const updated = prev.map((day, di) => {
        if (di !== dayIdx) return day;
        const acts = day.activities.filter((_, ai) => ai !== actIdx);
        if (acts.length === 0) {
          acts.push({ activity_type: 'rest', title: 'Rest', duration_minutes: null, notes: '', details: {} });
        }
        return { ...day, activities: acts };
      });
      return updated;
    });
  }

  function moveActivity(fromDay: number, fromAct: number, toDay: number) {
    if (fromDay === toDay) return;
    setWeekPlan((prev) => {
      const activity = prev[fromDay]?.activities[fromAct];
      if (!activity || activity.activity_type === 'rest') return prev;

      return prev.map((day, di) => {
        if (di === fromDay) {
          const acts = day.activities.filter((_, ai) => ai !== fromAct);
          if (acts.length === 0) {
            acts.push({ activity_type: 'rest', title: 'Rest', duration_minutes: null, notes: '', details: {} });
          }
          return { ...day, activities: acts };
        }
        if (di === toDay) {
          const acts = day.activities.filter((a) => a.activity_type !== 'rest');
          acts.push(activity);
          return { ...day, activities: acts };
        }
        return day;
      });
    });
  }

  function handleConfirm() {
    onComplete(weekPlan);
  }

  const activeDayCount = useMemo(
    () => weekPlan.filter((d) => d.activities.some((a) => a.activity_type !== 'rest')).length,
    [weekPlan]
  );

  if (step === 'describe') {
    return (
      <div className="ai-wiz">
        <button type="button" className="pd-back" onClick={onCancel}>
          ← Back
        </button>
        <h1>Set up your week with AI</h1>
        <p className="muted ai-wiz-lead">
          Describe what you want your training week to look like. Be as specific or general as you like — AI will build a weekly plan from your description.
        </p>

        <div className="ai-wiz-examples">
          <p className="ai-wiz-examples-label">Examples:</p>
          <button
            type="button"
            className="ai-wiz-example"
            onClick={() => setDescription('Strength training 3 days a week, cardio on Tuesday and Thursday')}
          >
            "Strength training 3 days a week, cardio on Tuesday and Thursday"
          </button>
          <button
            type="button"
            className="ai-wiz-example"
            onClick={() => setDescription('Upper body Monday and Thursday, lower body Tuesday and Friday, stretching Wednesday')}
          >
            "Upper/lower split with stretching on Wednesday"
          </button>
          <button
            type="button"
            className="ai-wiz-example"
            onClick={() => setDescription('Full body workouts Monday Wednesday Friday, yoga on Saturday')}
          >
            "Full body M/W/F, yoga on Saturday"
          </button>
        </div>

        <label htmlFor="ai-wiz-desc">Describe your weekly plan</label>
        <textarea
          id="ai-wiz-desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="I want to do strength training 3 days a week and cardio on Tuesday and Thursday…"
          autoFocus
        />

        {error && <p className="pd-error">{error}</p>}

        <div className="actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn green"
            disabled={loading || description.trim().length < 8}
            onClick={() => void handleGenerate()}
          >
            {loading ? 'Building your week…' : 'Build my week with AI'}
          </button>
          <button type="button" className="btn secondary" onClick={onCancel} disabled={loading}>
            Skip — I'll add activities manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-wiz">
      <button type="button" className="pd-back" onClick={() => setStep('describe')}>
        ← Change description
      </button>
      <h1>Review your week</h1>
      {coachMessage && <p className="ai-wiz-coach">{coachMessage}</p>}
      <p className="muted">
        {activeDayCount} active day{activeDayCount !== 1 ? 's' : ''} planned.
        Drag activities between days to rearrange, or remove what you don't need.
      </p>

      <div className="ai-wiz-week">
        {weekPlan.map((day, dayIdx) => (
          <div
            key={dayIdx}
            className={`ai-wiz-day${dropTarget === dayIdx ? ' drop-target' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(dayIdx);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              if (dragSource) {
                moveActivity(dragSource.dayIdx, dragSource.actIdx, dayIdx);
                setDragSource(null);
              }
            }}
          >
            <h3>{DAY_NAMES[dayIdx]}</h3>
            {day.activities.map((act, actIdx) => (
              <div
                key={actIdx}
                draggable={act.activity_type !== 'rest'}
                onDragStart={() => setDragSource({ dayIdx, actIdx })}
                onDragEnd={() => { setDragSource(null); setDropTarget(null); }}
                className={dragSource?.dayIdx === dayIdx && dragSource?.actIdx === actIdx ? 'dragging' : ''}
              >
                <ActivityChip
                  draft={act}
                  onRemove={act.activity_type !== 'rest' ? () => removeActivity(dayIdx, actIdx) : undefined}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {error && <p className="pd-error">{error}</p>}

      <div className="actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn green" onClick={handleConfirm}>
          Confirm and create calendar
        </button>
        <button type="button" className="btn secondary" onClick={() => setStep('describe')}>
          Start over
        </button>
      </div>
    </div>
  );
}
