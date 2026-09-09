'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EQUIPMENT_OPTIONS } from '../../../lib/training/equipmentFilter';
import { SCHEDULE_DAY_LABELS } from '../../../lib/programDesign/inferSchedule';
import {
  DEFAULT_DAYS_BY_FREQUENCY,
  INTAKE_DURATION_OPTIONS,
  INTAKE_FEEL_OPTIONS,
  INTAKE_GOALS,
  INTAKE_LIMITATIONS,
  INTAKE_PRIORITY_AREAS,
  INTAKE_SPLITS,
  defaultProgramIntake,
  experienceLabel,
  generateBodyFromIntake,
  goalLabel,
  intakeFromProfileRow,
  intakeLooksSaved,
  splitLabel,
  supersetLabel,
  trainingProfilePayload,
  varietyLabel,
  type IntakeExperience,
  type IntakeFeel,
  type IntakeLimitation,
  type IntakeSplit,
  type IntakeSupersets,
  type IntakeVariety,
  type ProgramIntake,
} from '../../../lib/programDesign/intakePreferences';
import type { ScheduleDayLabel } from '../../../lib/programDesign/inferSchedule';
import type { ActivityDraft } from '../../../lib/programDesign/types';

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type DayPlan = { dayIndex: DayOfWeek; activities: ActivityDraft[] };
type WizardStep = 'goal' | 'schedule' | 'session' | 'athlete' | 'style' | 'notes' | 'review';

const STEPS: WizardStep[] = ['goal', 'schedule', 'session', 'athlete', 'style', 'notes', 'review'];

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

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`pd-cycle-chip${active ? ' active' : ''}`} onClick={onClick}>
      {children}
    </button>
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
  onCancel,
}: AIProgramSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('goal');
  const [intake, setIntake] = useState<ProgramIntake>(() => defaultProgramIntake());
  const [loaded, setLoaded] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setLoaded(true);
        return;
      }
      const [{ data: training }, { data: profile }] = await Promise.all([
        supabase.from('st_training_profiles').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('st_profiles').select('primary_goal, experience_level, available_equipment').eq('user_id', uid).maybeSingle(),
      ]);
      if (cancelled) return;
      const next = intakeFromProfileRow(training, profile);
      setIntake(next);
      const saved = intakeLooksSaved(next) && Boolean(training);
      setHasSaved(saved);
      if (saved) setStep('review');
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const stepIndex = STEPS.indexOf(step);
  const daysCount = intake.trainingDaysPerWeek === 'ai_recommend' ? intake.preferredDays.length || 3 : Number(intake.trainingDaysPerWeek);

  function patch(partial: Partial<ProgramIntake>) {
    setIntake((prev) => ({ ...prev, ...partial }));
  }

  function setFrequency(n: number | 'ai_recommend') {
    if (n === 'ai_recommend') {
      patch({ trainingDaysPerWeek: 'ai_recommend', preferredDays: DEFAULT_DAYS_BY_FREQUENCY[3] });
      return;
    }
    const current = intake.preferredDays;
    const nextDays = current.length === n ? current : DEFAULT_DAYS_BY_FREQUENCY[n] || current.slice(0, n);
    patch({ trainingDaysPerWeek: n, preferredDays: nextDays });
  }

  function toggleDay(day: ScheduleDayLabel) {
    const has = intake.preferredDays.includes(day);
    const preferredDays = has ? intake.preferredDays.filter((d) => d !== day) : [...intake.preferredDays, day];
    preferredDays.sort((a, b) => SCHEDULE_DAY_LABELS.indexOf(a) - SCHEDULE_DAY_LABELS.indexOf(b));
    patch({
      preferredDays,
      trainingDaysPerWeek: preferredDays.length || intake.trainingDaysPerWeek,
    });
  }

  function toggleList<T extends string>(key: 'priorityAreas' | 'trainingFeel' | 'limitations' | 'equipment', value: T) {
    setIntake((prev) => {
      const list = prev[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      if (key === 'equipment' && value === 'full_gym') return { ...prev, equipment: list.includes('full_gym') ? [] : ['full_gym'] };
      if (key === 'equipment' && next.includes('full_gym') && value !== 'full_gym') return { ...prev, equipment: next.filter((v) => v !== 'full_gym') };
      return { ...prev, [key]: next };
    });
  }

  async function persistIntake(userId: string) {
    const payload = { user_id: userId, ...trainingProfilePayload(intake), updated_at: new Date().toISOString() };
    const { error: upsertError } = await supabase.from('st_training_profiles').upsert(payload, { onConflict: 'user_id' });
    if (upsertError) {
      await supabase.from('st_training_profiles').upsert(
        {
          user_id: userId,
          primary_goal: payload.primary_goal,
          experience_level: payload.experience_level,
          training_days_per_week: payload.training_days_per_week,
          preferred_session_minutes: payload.preferred_session_minutes,
          available_equipment: payload.available_equipment,
        },
        { onConflict: 'user_id' }
      );
    }
    await supabase
      .from('st_profiles')
      .update({
        primary_goal: payload.primary_goal === 'hypertrophy' ? 'muscle' : payload.primary_goal,
        experience_level: payload.experience_level,
        available_equipment: payload.available_equipment,
      })
      .eq('user_id', userId);
  }

  async function handleGenerate() {
    if (!intake.preferredDays.length && intake.trainingDaysPerWeek !== 'ai_recommend') {
      setError('Pick at least one training day.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !session.user?.id) {
        setError('Sign in to use AI program setup.');
        setLoading(false);
        return;
      }
      await persistIntake(session.user.id);
      const body = generateBodyFromIntake(intake, { weeks, programName, programId, startDate });
      const res = await fetch('/api/programs/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Could not generate your training program.');
        setLoading(false);
        return;
      }
      setLoading(false);
      await onComplete([], {
        coachMessage: data.program_summary || data.coaching_notes || '',
        workoutCount: Number(data.workout_count) || 0,
      });
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
      setLoading(false);
    }
  }

  const summary = useMemo(
    () => [
      { label: 'Goal', value: goalLabel(intake.primaryGoal) },
      { label: 'Schedule', value: `${intake.preferredDays.length || daysCount} days/week${intake.preferredDays.length ? ` · ${intake.preferredDays.join(', ')}` : ''}` },
      { label: 'Workout length', value: `${intake.sessionMinutes} minutes` },
      { label: 'Style', value: splitLabel(intake.trainingSplit) },
      { label: 'Experience', value: experienceLabel(intake.experienceLevel) },
      { label: 'Supersets', value: supersetLabel(intake.supersetPreference) },
      { label: 'Exercise variety', value: varietyLabel(intake.varietyPreference) },
      { label: 'Equipment', value: intake.equipment.includes('full_gym') || !intake.equipment.length ? 'Full gym' : intake.equipment.join(', ') },
      { label: 'Priorities', value: intake.priorityAreas.length ? intake.priorityAreas.join(', ') : 'No special priority' },
    ],
    [intake, daysCount]
  );

  if (!loaded) {
    return (
      <div className="ai-wiz">
        <p className="muted">Loading your training profile…</p>
      </div>
    );
  }

  return (
    <div className="ai-wiz">
      <button type="button" className="pd-back" onClick={step === 'goal' || (hasSaved && step === 'review') ? onCancel : () => setStep(STEPS[Math.max(0, stepIndex - 1)])}>
        ← Back
      </button>
      <p className="ai-wiz-progress muted">
        {step === 'review' ? 'Ready to generate' : `Step ${stepIndex + 1} of ${STEPS.length - 1}`}
      </p>

      {step === 'goal' && (
        <>
          <h1>What is your main goal?</h1>
          <p className="muted ai-wiz-lead">Pick one. You can add nuance later.</p>
          <div className="pd-cycle-grid">
            {INTAKE_GOALS.map((g) => (
              <Chip key={g.id} active={intake.primaryGoal === g.id} onClick={() => patch({ primaryGoal: g.id })}>
                {g.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {step === 'schedule' && (
        <>
          <h1>How many days per week?</h1>
          <p className="muted ai-wiz-lead">Then tap the days you want to lift.</p>
          <div className="pd-cycle-grid">
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <Chip key={n} active={intake.trainingDaysPerWeek === n} onClick={() => setFrequency(n)}>
                {n}
              </Chip>
            ))}
            <Chip active={intake.trainingDaysPerWeek === 'ai_recommend'} onClick={() => setFrequency('ai_recommend')}>
              Let BuildIQ Recommend
            </Chip>
          </div>
          <label>Preferred training days</label>
          <div className="pd-cycle-grid">
            {SCHEDULE_DAY_LABELS.map((day) => (
              <Chip key={day} active={intake.preferredDays.includes(day)} onClick={() => toggleDay(day)}>
                {day}
              </Chip>
            ))}
          </div>
        </>
      )}

      {step === 'session' && (
        <>
          <h1>How long should most workouts take?</h1>
          <p className="muted ai-wiz-lead">This controls volume. A 30-minute day is not a 60-minute day with less rest.</p>
          <div className="pd-cycle-grid">
            {INTAKE_DURATION_OPTIONS.map((n) => (
              <Chip
                key={n}
                active={intake.sessionMinutes === n && !customMinutes}
                onClick={() => {
                  setCustomMinutes('');
                  patch({ sessionMinutes: n });
                }}
              >
                {n} min
              </Chip>
            ))}
            <Chip active={!!customMinutes} onClick={() => setCustomMinutes(String(intake.sessionMinutes))}>
              Custom
            </Chip>
          </div>
          {customMinutes !== '' && (
            <>
              <label htmlFor="ai-custom-min">Minutes</label>
              <input
                id="ai-custom-min"
                type="number"
                min={20}
                max={120}
                value={customMinutes}
                onChange={(e) => {
                  setCustomMinutes(e.target.value);
                  patch({ sessionMinutes: Math.max(20, Math.min(120, Number(e.target.value) || 60)) });
                }}
              />
            </>
          )}
          <h2 className="ai-wiz-sub">How should we organize training?</h2>
          <div className="pd-cycle-grid">
            {INTAKE_SPLITS.map((s) => (
              <Chip key={s.id} active={intake.trainingSplit === s.id} onClick={() => patch({ trainingSplit: s.id as IntakeSplit })}>
                {s.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {step === 'athlete' && (
        <>
          <h1>Experience and equipment</h1>
          <p className="muted ai-wiz-lead">This shapes exercise complexity and what we can prescribe.</p>
          <label>Training experience</label>
          <div className="pd-cycle-grid">
            {(['beginner', 'intermediate', 'advanced', 'not_sure'] as IntakeExperience[]).map((id) => (
              <Chip key={id} active={intake.experienceLevel === id} onClick={() => patch({ experienceLevel: id })}>
                {experienceLabel(id)}
              </Chip>
            ))}
          </div>
          <label>Available equipment</label>
          <div className="pd-cycle-grid">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <Chip key={opt.id} active={intake.equipment.includes(opt.id)} onClick={() => toggleList('equipment', opt.id)}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {step === 'style' && (
        <>
          <h1>How should the work feel?</h1>
          <p className="muted ai-wiz-lead">Priorities are preferences, not a license to overtrain one area.</p>
          <label>Priority areas</label>
          <div className="pd-cycle-grid">
            {INTAKE_PRIORITY_AREAS.map((area) => (
              <Chip key={area} active={intake.priorityAreas.includes(area)} onClick={() => toggleList('priorityAreas', area)}>
                {area}
              </Chip>
            ))}
            <Chip active={intake.priorityAreas.length === 0} onClick={() => patch({ priorityAreas: [] })}>
              No Special Priority
            </Chip>
          </div>
          <label>Supersets</label>
          <div className="pd-cycle-grid">
            {(['minimal', 'sometimes', 'frequently', 'ai_decide'] as IntakeSupersets[]).map((id) => (
              <Chip key={id} active={intake.supersetPreference === id} onClick={() => patch({ supersetPreference: id })}>
                {supersetLabel(id)}
              </Chip>
            ))}
          </div>
          <label>Exercise variety</label>
          <div className="pd-cycle-grid">
            {(['consistent', 'balanced', 'high', 'ai_decide'] as IntakeVariety[]).map((id) => (
              <Chip key={id} active={intake.varietyPreference === id} onClick={() => patch({ varietyPreference: id })}>
                {varietyLabel(id)}
              </Chip>
            ))}
          </div>
          <label>Training feel</label>
          <div className="pd-cycle-grid">
            {INTAKE_FEEL_OPTIONS.map((opt) => (
              <Chip key={opt.id} active={intake.trainingFeel.includes(opt.id)} onClick={() => toggleList('trainingFeel', opt.id as IntakeFeel)}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {step === 'notes' && (
        <>
          <h1>Anything else BuildIQ should know?</h1>
          <p className="muted ai-wiz-lead">Optional. Structured choices already cover days, duration, and split.</p>
          <label>Limitations / exercises to avoid</label>
          <div className="pd-cycle-grid">
            {INTAKE_LIMITATIONS.map((opt) => (
              <Chip key={opt.id} active={intake.limitations.includes(opt.id)} onClick={() => toggleList('limitations', opt.id as IntakeLimitation)}>
                {opt.label}
              </Chip>
            ))}
          </div>
          <label htmlFor="ai-wiz-notes">Free-text notes</label>
          <textarea
            id="ai-wiz-notes"
            rows={4}
            value={intake.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="I don’t like barbell back squats. I want the workouts to feel athletic."
          />
        </>
      )}

      {step === 'review' && (
        <>
          <h1>{hasSaved ? 'Your training profile' : 'Review and generate'}</h1>
          <p className="muted ai-wiz-lead">
            {hasSaved
              ? 'We reused your last intake. Generate, or adjust anything first.'
              : 'Structured choices plus your notes will be sent to the program designer.'}
          </p>
          <div className="ai-wiz-summary">
            {summary.map((row) => (
              <div key={row.label} className="ai-wiz-summary-row">
                <span className="muted">{row.label}</span>
                <b>{row.value}</b>
              </div>
            ))}
            {intake.notes.trim() ? (
              <div className="ai-wiz-summary-row">
                <span className="muted">Notes</span>
                <b>{intake.notes.trim()}</b>
              </div>
            ) : null}
          </div>
        </>
      )}

      {error && <p className="pd-error">{error}</p>}

      <div className="actions" style={{ marginTop: 16 }}>
        {step !== 'review' ? (
          <button
            type="button"
            className="btn green"
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)])}
          >
            Continue
          </button>
        ) : (
          <>
            <button type="button" className="btn green" disabled={loading} onClick={() => void handleGenerate()}>
              {loading ? 'Building your workouts…' : 'Generate program'}
            </button>
            <button type="button" className="btn secondary" disabled={loading} onClick={() => { setHasSaved(false); setStep('goal'); }}>
              Adjust preferences
            </button>
          </>
        )}
        <button type="button" className="btn secondary" onClick={onCancel} disabled={loading}>
          Skip — I&apos;ll add workouts later
        </button>
      </div>
    </div>
  );
}
