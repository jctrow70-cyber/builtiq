'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExerciseType } from '../../lib/training/exerciseTypes';
import {
  INTENSITY_CHIPS,
  RPE_CHIPS,
  SIDE_CHIPS,
  allLogFieldsFlat,
  logLayoutForType,
  mergeAssistIntoNotes,
  mergeSideIntoNotes,
  parseAssistFromNotes,
  parseSideFromNotes,
  type LogFieldUI,
} from '../../lib/training/logFieldUI';
import { SET_TYPES, setTypeAcronym, setTypeLabel, type SetTypeValue } from '../../lib/training/setTypes';

type SetRow = {
  id: string;
  set_type: string;
  set_number: number;
  target_reps?: string;
  target_weight?: string;
};

type LogRow = Record<string, any>;

type Props = {
  section?: string;
  exType: ExerciseType;
  sets: SetRow[];
  logs: Record<string, LogRow>;
  prevBySetId: Record<string, LogRow | null>;
  showPreviousSets?: boolean;
  weightUnit: 'lb' | 'kg';
  distanceUnit: 'mi' | 'km';
  onDistanceUnitChange: (u: 'mi' | 'km') => void;
  canEdit: boolean;
  canLog: boolean;
  onEditSet: (set: SetRow, field: string, value: any) => void;
  onRemoveSet: (set: SetRow) => void;
  onSaveField: (setId: string, field: string, value: string, opts?: { completed?: boolean }) => void;
  onDuplicateSet: (setId: string, source: LogRow) => void;
  registerInputRef?: (el: HTMLInputElement | null) => void;
  onInputKeyDown?: (e: React.KeyboardEvent) => void;
};

function fieldSizeClass(field: LogFieldUI) {
  if (field.wide || field.size === 'wide') return 'log-field-card-wide';
  if (field.size === 'compact') return 'log-field-card-compact';
  return 'log-field-card-normal';
}

function stripEmbeddedNotes(notes: string) {
  return notes.replace(/(?:^|\s)(assist|side):\s*[^\s·]+/gi, '').replace(/\s*·\s*/g, ' ').trim();
}

function SetTypePicker({
  value,
  canEdit,
  onChange,
}: {
  value: string;
  canEdit: boolean;
  onChange: (value: SetTypeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!canEdit) {
    return (
      <span className="badge set-type-badge" title={setTypeLabel(value)}>
        {setTypeAcronym(value)}
      </span>
    );
  }

  return (
    <div className="set-type-picker" ref={wrapRef}>
      <button
        type="button"
        className="badge set-type-badge set-type-picker-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={setTypeLabel(value)}
        onClick={() => setOpen((v) => !v)}
      >
        {setTypeAcronym(value)}
      </button>
      {open && (
        <div className="set-type-menu" role="listbox">
          {SET_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="option"
              aria-selected={value === t.value}
              className={`set-type-option${value === t.value ? ' active' : ''}`}
              onClick={() => {
                onChange(t.value);
                setOpen(false);
              }}
            >
              <span className="set-type-option-acronym">{t.acronym}</span>
              <span className="set-type-option-label">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DoneCheck({
  completed,
  disabled,
  onChange,
}: {
  completed: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="set-done-check">
      <input type="checkbox" checked={completed} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>Done</span>
    </label>
  );
}

function FieldCard({
  field,
  value,
  prevHint,
  unitLabel,
  disabled,
  onBlur,
  onChangeValue,
  onChipPick,
  registerRef,
  onKeyDown,
}: {
  field: LogFieldUI;
  value: string;
  prevHint?: string;
  unitLabel?: string;
  disabled: boolean;
  onBlur: (v: string) => void;
  onChangeValue?: (v: string) => void;
  onChipPick?: (v: string) => void;
  registerRef?: (el: HTMLInputElement | null) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const compact = field.size === 'compact';
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const placeholder = !draft && prevHint ? prevHint : (field.placeholder || '');

  return (
    <div className={`log-field-card ${fieldSizeClass(field)}`}>
      <label className="log-field-label">
        {field.label}
        {field.optional && <span className="log-field-optional">opt</span>}
      </label>
      {field.chipOptions ? (
        <div className="log-chip-row">
          {field.chipOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`log-chip${value === opt ? ' active' : ''}`}
              disabled={disabled}
              onClick={() => onChipPick?.(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="log-input-wrap">
          <input
            ref={registerRef}
            className={`log-input-card${compact ? ' log-input-compact' : ''}${prevHint && !draft ? ' log-input-has-prev' : ''}`}
            type="text"
            inputMode={(field.inputMode as 'decimal' | 'numeric' | 'text') || 'text'}
            disabled={disabled}
            value={draft}
            placeholder={placeholder}
            onFocus={() => { focusedRef.current = true; }}
            onChange={(e) => {
              setDraft(e.target.value);
              onChangeValue?.(e.target.value);
            }}
            onBlur={(e) => {
              focusedRef.current = false;
              onBlur(e.target.value);
            }}
            onKeyDown={onKeyDown}
          />
          {unitLabel && <span className="log-input-unit">{unitLabel}</span>}
        </div>
      )}
    </div>
  );
}

function formatWarmupTarget(set: SetRow) {
  const parts = [set.target_reps, set.target_weight].map((v) => String(v || '').trim()).filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return `Set ${set.set_number}`;
}

function WarmupExerciseLogger({
  sets,
  logs,
  canLog,
  onSaveField,
  registerInputRef,
  onInputKeyDown,
}: {
  sets: SetRow[];
  logs: Record<string, LogRow>;
  canLog: boolean;
  onSaveField: Props['onSaveField'];
  registerInputRef?: Props['registerInputRef'];
  onInputKeyDown?: Props['onInputKeyDown'];
}) {
  const firstSet = sets[0];
  const notes = firstSet ? stripEmbeddedNotes(String(logs[firstSet.id]?.log_notes || '')) : '';

  return (
    <div className="warmup-exercise-log">
      <ul className="warmup-target-list">
        {sets.map((s) => (
          <li key={s.id} className="warmup-target-item">
            <span className="warmup-target-text">{formatWarmupTarget(s)}</span>
          </li>
        ))}
      </ul>
      {canLog && firstSet && (
        <FieldCard
          field={{ key: 'log_notes', label: 'Notes', placeholder: 'Optional — how it felt, sides, etc.', size: 'wide' }}
          value={notes}
          disabled={!canLog}
          onBlur={(v) => onSaveField(firstSet.id, 'log_notes', v)}
          registerRef={registerInputRef}
          onKeyDown={onInputKeyDown}
        />
      )}
    </div>
  );
}

function SetLogCard({
  set,
  log,
  prev,
  layout,
  weightUnit,
  distanceUnit,
  canEdit,
  canLog,
  onEditSet,
  onRemoveSet,
  onSaveField,
  onDuplicateSet,
  registerInputRef,
  onInputKeyDown,
  scheduleSave,
  flushSaves,
  showPreviousSets = true,
}: {
  set: SetRow;
  log: LogRow;
  prev: LogRow | null;
  layout: ReturnType<typeof logLayoutForType>;
  weightUnit: 'lb' | 'kg';
  distanceUnit: 'mi' | 'km';
  canEdit: boolean;
  canLog: boolean;
  onEditSet: Props['onEditSet'];
  onRemoveSet: Props['onRemoveSet'];
  onSaveField: Props['onSaveField'];
  onDuplicateSet: Props['onDuplicateSet'];
  registerInputRef?: Props['registerInputRef'];
  onInputKeyDown?: Props['onInputKeyDown'];
  scheduleSave: (key: string, value: string, save: () => void) => void;
  flushSaves: () => void;
  showPreviousSets?: boolean;
}) {
  const notes = String(log.log_notes || '');
  const assist = parseAssistFromNotes(notes);
  const side = parseSideFromNotes(notes);
  const completed = !!log.completed;

  const unitFor = (f: { unitGroup?: string; unit?: string }) => {
    if (f.unitGroup === 'weight') return weightUnit;
    if (f.unitGroup === 'distance') return distanceUnit;
    return f.unit || '';
  };

  const resolveValue = (key: string) => {
    if (key === '_assist_weight') return assist;
    if (key === 'log_notes') return stripEmbeddedNotes(notes);
    return String(log[key] || '');
  };

  const saveVirtual = (key: string, value: string) => {
    if (key === '_assist_weight') {
      onSaveField(set.id, 'log_notes', mergeAssistIntoNotes(notes, value));
      return;
    }
    if (key.startsWith('_side_')) {
      onSaveField(set.id, 'log_notes', mergeSideIntoNotes(notes, value));
      return;
    }
    onSaveField(set.id, key, value);
  };

  const resolvePrevHint = (key: string) => {
    if (!showPreviousSets || !prev) return undefined;
    if (key === '_assist_weight') {
      const a = parseAssistFromNotes(String(prev.log_notes || ''));
      return a || undefined;
    }
    if (prev[key]) return String(prev[key]);
    return undefined;
  };

  const renderField = (f: LogFieldUI) => (
    <FieldCard
      key={f.key}
      field={f}
      value={resolveValue(f.key)}
      prevHint={resolvePrevHint(f.key)}
      unitLabel={unitFor(f)}
      disabled={!canLog && f.key !== 'log_notes'}
      onBlur={(v) => { flushSaves(); saveVirtual(f.key, v); }}
      onChangeValue={(v) => scheduleSave(`${set.id}:${f.key}`, v, () => saveVirtual(f.key, v))}
      registerRef={registerInputRef}
      onKeyDown={onInputKeyDown}
    />
  );

  const hasChipRow = !!(layout.showRpeChips || layout.showIntensityChips || layout.showSideChips);

  const chipField = layout.showRpeChips
    ? { key: 'actual_rpe', label: 'RPE', chipOptions: RPE_CHIPS, size: 'wide' as const }
    : layout.showIntensityChips
      ? { key: 'actual_rpe', label: 'Intensity', chipOptions: INTENSITY_CHIPS, size: 'wide' as const }
      : layout.showSideChips
        ? { key: '_side', label: 'Side', chipOptions: SIDE_CHIPS, size: 'wide' as const }
        : null;

  const onDoneChange = (checked: boolean) => {
    onSaveField(set.id, 'completed', checked ? 'true' : '', { completed: checked });
  };

  return (
    <div className={`set-log-card${completed ? ' set-log-done' : ''}`}>
      <div className={`set-log-grid${hasChipRow ? ' has-chip-row' : ''}`}>
        <div className="set-log-head">
          <span className="set-log-num">Set {set.set_number}</span>
          <SetTypePicker
            value={set.set_type}
            canEdit={canEdit}
            onChange={(v) => onEditSet(set, 'set_type', v)}
          />
          {showPreviousSets && prev && canLog && (
            <button
              type="button"
              className="btn small secondary log-dup-btn"
              title="Copy values from last workout"
              onClick={() => onDuplicateSet(set.id, prev)}
            >
              Copy last
            </button>
          )}
        </div>

        <div className="log-field-row log-field-row-compact log-field-row-metrics">
          {layout.primary.map(renderField)}
        </div>

        {chipField && (
          <div className="set-log-chips">
            <FieldCard
              field={chipField}
              value={chipField.key === '_side' ? side : String(log.actual_rpe || '')}
              disabled={!canLog}
              onChipPick={(v) => {
                if (chipField.key === '_side') onSaveField(set.id, 'log_notes', mergeSideIntoNotes(notes, v));
                else onSaveField(set.id, 'actual_rpe', v);
              }}
              onBlur={() => {}}
            />
          </div>
        )}

        <div className="set-log-rail">
          {canEdit ? (
            <button type="button" className="btn small red set-remove-btn" onClick={() => onRemoveSet(set)} aria-label="Remove set">
              ×
            </button>
          ) : (
            <span className="set-log-rail-spacer" aria-hidden="true" />
          )}
          <DoneCheck completed={completed} disabled={!canLog} onChange={onDoneChange} />
        </div>
      </div>

      {layout.optional && layout.optional.length > 0 && (
        <div className="log-field-row log-field-row-compact log-field-optional-row">{layout.optional.map(renderField)}</div>
      )}
    </div>
  );
}

export default function WorkoutSetLogger({
  section,
  exType,
  sets,
  logs,
  prevBySetId,
  weightUnit,
  distanceUnit,
  onDistanceUnitChange,
  canEdit,
  canLog,
  onEditSet,
  onRemoveSet,
  onSaveField,
  onDuplicateSet,
  registerInputRef,
  onInputKeyDown,
  showPreviousSets = true,
}: Props) {
  const isWarmup = section === 'warmup';
  const layout = useMemo(() => logLayoutForType(exType), [exType]);
  const showDistToggle = allLogFieldsFlat(exType).some((f) => f.unitGroup === 'distance');
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSavesRef = useRef<Record<string, () => void>>({});

  const firstSet = sets[0];
  const firstSetLog = firstSet ? logs[firstSet.id] || {} : {};
  const exerciseNotesRaw = String(firstSetLog.log_notes || '');
  const exerciseNotesDisplay = stripEmbeddedNotes(exerciseNotesRaw);
  const exerciseNotesPrev = firstSet && prevBySetId[firstSet.id]?.log_notes
    ? stripEmbeddedNotes(String(prevBySetId[firstSet.id]!.log_notes))
    : undefined;

  const scheduleSave = (key: string, _value: string, save: () => void) => {
    pendingSavesRef.current[key] = save;
    if (saveTimersRef.current[key]) clearTimeout(saveTimersRef.current[key]);
    saveTimersRef.current[key] = setTimeout(() => {
      delete saveTimersRef.current[key];
      const run = pendingSavesRef.current[key];
      delete pendingSavesRef.current[key];
      run?.();
    }, 700);
  };

  const flushSaves = () => {
    Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
    saveTimersRef.current = {};
    const pending = { ...pendingSavesRef.current };
    pendingSavesRef.current = {};
    Object.values(pending).forEach((run) => run());
  };

  useEffect(() => () => flushSaves(), []);

  const saveExerciseNotes = (value: string) => {
    if (!firstSet) return;
    let merged = value.trim();
    const side = parseSideFromNotes(exerciseNotesRaw);
    const assist = parseAssistFromNotes(exerciseNotesRaw);
    if (side) merged = mergeSideIntoNotes(merged, side);
    if (assist) merged = mergeAssistIntoNotes(merged, assist);
    onSaveField(firstSet.id, 'log_notes', merged);
  };

  if (isWarmup) {
    return (
      <div className="workout-set-logger workout-set-logger-warmup">
        <WarmupExerciseLogger
          sets={sets}
          logs={logs}
          canLog={canLog}
          onSaveField={onSaveField}
          registerInputRef={registerInputRef}
          onInputKeyDown={onInputKeyDown}
        />
      </div>
    );
  }

  return (
    <div className="workout-set-logger">
      {showDistToggle && (
        <div className="log-pref-bar">
          <span className="muted">Distance unit</span>
          <div className="log-chip-row">
            {(['mi', 'km'] as const).map((u) => (
              <button
                key={u}
                type="button"
                className={`log-chip${distanceUnit === u ? ' active' : ''}`}
                onClick={() => onDistanceUnitChange(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      {layout.exerciseNotes && firstSet && (
        <div className="exercise-notes-section">
          <FieldCard
            field={layout.exerciseNotes}
            value={exerciseNotesDisplay}
            prevHint={showPreviousSets ? exerciseNotesPrev || undefined : undefined}
            disabled={!canLog}
            onBlur={(v) => { flushSaves(); saveExerciseNotes(v); }}
            onChangeValue={(v) => scheduleSave(`notes:${firstSet.id}`, v, () => saveExerciseNotes(v))}
            registerRef={registerInputRef}
            onKeyDown={onInputKeyDown}
          />
        </div>
      )}

      <div className="set-log-list">
        {sets.map((s) => (
          <SetLogCard
            key={s.id}
            set={s}
            log={logs[s.id] || {}}
            prev={prevBySetId[s.id] || null}
            layout={layout}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
            canEdit={canEdit}
            canLog={canLog}
            onEditSet={onEditSet}
            onRemoveSet={onRemoveSet}
            onSaveField={onSaveField}
            onDuplicateSet={onDuplicateSet}
            registerInputRef={registerInputRef}
            onInputKeyDown={onInputKeyDown}
            scheduleSave={scheduleSave}
            flushSaves={flushSaves}
            showPreviousSets={showPreviousSets}
          />
        ))}
      </div>

      {canLog && sets.length > 0 && <p className="muted log-save-hint">Values save automatically as you type.</p>}
    </div>
  );
}
