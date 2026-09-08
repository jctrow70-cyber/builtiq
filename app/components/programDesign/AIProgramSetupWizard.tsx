'use client';

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVITY_TYPE_META } from '../../../lib/programDesign/activityTypes';
import { inferScheduleFromPrompt } from '../../../lib/programDesign/inferSchedule';
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

type WizardStep = 'describe' | 'review' | 'done';

type AIProgramSetupWizardProps = {
  supabase: SupabaseClient;
  programName: string;
  programId?: string;
  weeks?: number;
  startDate?: string | null;
  isFollowing?: boolean;
  onComplete: (
    weekPlan: DayPlan[],
    result?: { coachMessage?: string; workoutCount?: number }
  ) => void | Promise<void>;
  onFollow?: () => void | Promise<void>;
  onCancel: () => void;
};

function inferSchedule(text: string): { days: string[]; dayTypes: Record<string, string> } {
  return inferScheduleFromPrompt(text);
}

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
  programId,
  weeks = 6,
  startDate = null,
  isFollowing = false,
  onComplete,
  onFollow,
  onCancel,
}: AIProgramSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('describe');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coachMessage, setCoachMessage] = useState('');
  const [workoutCount, setWorkoutCount] = useState(0);
  const [weekPlan, setWeekPlan] = useState<DayPlan[]>([]);
  const [dragSource, setDragSource] = useState<{ dayIdx: number; actIdx: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [choiceBusy, setChoiceBusy] = useState(false);

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

      const schedule = inferSchedule(description);
      const res = await fetch('/api/programs/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prompt: description.trim(),
          weeks,
          days: schedule.days,
          dayTypes: schedule.dayTypes,
          programName,
          existingProgramId: programId || undefined,
          startDate: startDate || undefined,
          primaryGoal: /muscle|hypertrophy|build muscle/.test(description.toLowerCase())
            ? 'hypertrophy'
            : 'strength',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Could not generate your training program.');
        setLoading(false);
        return;
      }

      setCoachMessage(data.program_summary || data.coaching_notes || '');
      setWorkoutCount(Number(data.workout_count) || 0);
      setLoading(false);
      await onComplete([], {
        coachMessage: data.program_summary || data.coaching_notes || '',
        workoutCount: Number(data.workout_count) || 0,
      });
      return;
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

  async function handleFollowChoice() {
    if (!onFollow) {
      await onComplete([]);
      return;
    }
    setChoiceBusy(true);
    setError('');
    try {
      await onFollow();
    } catch (e: any) {
      setError(e?.message || 'Could not follow this program.');
      setChoiceBusy(false);
    }
  }

  async function handleSaveChoice() {
    setChoiceBusy(true);
    setError('');
    try {
      await onComplete([]);
    } catch (e: any) {
      setError(e?.message || 'Could not open the saved program.');
      setChoiceBusy(false);
    }
  }

  const activeDayCount = useMemo(
    () => weekPlan.filter((d) => d.activities.some((a) => a.activity_type !== 'rest')).length,
    [weekPlan]
  );

  if (step === 'done') {
    return (
      <div className="ai-wiz">
        <h1>Workouts are ready</h1>
        <p className="muted ai-wiz-lead">
          {programName} is saved
          {workoutCount ? ` with ${workoutCount} workout${workoutCount === 1 ? '' : 's'}` : ''}.
          Follow it to use it in Training, or save it and follow later.
        </p>
        {coachMessage && <p className="ai-wiz-coach">{coachMessage}</p>}
        {error && <p className="pd-error">{error}</p>}
        <div className="actions" style={{ marginTop: 16 }}>
          {isFollowing ? (
            <button type="button" className="btn green" disabled={choiceBusy} onClick={() => void handleFollowChoice()}>
              {choiceBusy ? 'Opening…' : 'Use in Training'}
            </button>
          ) : (
            <button type="button" className="btn green" disabled={choiceBusy} onClick={() => void handleFollowChoice()}>
              {choiceBusy ? 'Following…' : 'Follow this program'}
            </button>
          )}
          <button type="button" className="btn secondary" disabled={choiceBusy} onClick={() => void handleSaveChoice()}>
            Save without following
          </button>
        </div>
      </div>
    );
  }

  if (step === 'describe') {
    return (
      <div className="ai-wiz">
        <button type="button" className="pd-back" onClick={onCancel}>
          ← Back
        </button>
        <h1>Build your workouts</h1>
        <p className="muted ai-wiz-lead">
          Describe the training you want. BuiltIQ will create the actual lifts, sets, and weekly calendar on this program — not just empty day labels.
        </p>

        <div className="ai-wiz-examples">
          <p className="ai-wiz-examples-label">Examples:</p>
          <button
            type="button"
            className="ai-wiz-example"
            onClick={() => setDescription('Upper/lower strength program 4 days a week, build muscle, barbell and dumbbells')}
          >
            "Upper/lower 4 days a week, build muscle"
          </button>
          <button
            type="button"
            className="ai-wiz-example"
            onClick={() => setDescription('Full body strength workouts Monday Wednesday Friday, focus on squat bench and deadlift')}
          >
            "Full body M/W/F, squat bench deadlift"
          </button>
          <button
            type="button"
            className="ai-wiz-example"
            onClick={() => setDescription('5-day push pull legs strength program for hypertrophy')}
          >
            "5-day push pull legs hypertrophy"
          </button>
          <button
            type="button"
            className="ai-wiz-example"
            onClick={() => setDescription('Bro split, one body part per day: chest, back, shoulders, arms, and legs')}
          >
            "Bro split: chest, back, shoulders, arms, legs"
          </button>
        </div>

        <label htmlFor="ai-wiz-desc">Describe your training</label>
        <textarea
          id="ai-wiz-desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Upper/lower 4 days a week, build muscle, I have a barbell and dumbbells…"
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
            {loading ? 'Building your workouts…' : 'Build my workouts'}
          </button>
          <button type="button" className="btn secondary" onClick={onCancel} disabled={loading}>
            Skip — I'll add workouts later
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
