'use client';

import { useEffect, useMemo, useRef } from 'react';
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

type SetRow = {
  id: string;
  set_type: string;
  set_number: number;
};

type LogRow = Record<string, any>;

type Props = {
  exType: ExerciseType;
  sets: SetRow[];
  logs: Record<string, LogRow>;
  prevBySetId: Record<string, LogRow | null>;
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
  inputKey,
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
  inputKey?: string;
}) {
  const compact = field.size === 'compact';
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
            key={inputKey || `${field.key}-${value}`}
            ref={registerRef}
            className={`log-input-card${compact ? ' log-input-compact' : ''}`}
            type="text"
            inputMode={(field.inputMode as 'decimal' | 'numeric' | 'text') || 'text'}
            disabled={disabled}
            defaultValue={value}
            placeholder={prevHint ? `Last ${prevHint}` : field.placeholder || ''}
            onChange={(e) => onChangeValue?.(e.target.value)}
            onBlur={(e) => onBlur(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {unitLabel && <span className="log-input-unit">{unitLabel}</span>}
        </div>
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
    if (!prev) return undefined;
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
      inputKey={`${set.id}-${f.key}-${resolveValue(f.key)}`}
    />
  );

  return (
    <div className={`set-log-card${completed ? ' set-log-done' : ''}`}>
      <div className="set-log-head">
        <div className="set-log-head-left">
          <span className="set-log-num">Set {set.set_number}</span>
          {canEdit ? (
            <select
              className="log-input-card log-set-type-select"
              value={set.set_type}
              disabled={!canEdit}
              onChange={(e) => onEditSet(set, 'set_type', e.target.value)}
            >
              <option>warmup</option>
              <option>working</option>
              <option>backoff</option>
              <option>dropset</option>
              <option>amrap</option>
            </select>
          ) : (
            <span className="badge set-type-badge">{set.set_type}</span>
          )}
          {canEdit && (
            <button type="button" className="btn small red set-remove-btn" onClick={() => onRemoveSet(set)} aria-label="Remove set">
              ×
            </button>
          )}
        </div>
        <label className="set-done-check">
          <input
            type="checkbox"
            checked={completed}
            disabled={!canLog}
            onChange={(e) => onSaveField(set.id, 'completed', e.target.checked ? 'true' : '', { completed: e.target.checked })}
          />
          <span>Done</span>
        </label>
      </div>

      <div className="set-log-fields">
        <div className="set-log-metrics-row">
          <div className="log-field-row log-field-row-compact">{layout.primary.map(renderField)}</div>
          {prev && canLog && (
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

        {layout.showRpeChips && (
          <FieldCard
            field={{ key: 'actual_rpe', label: 'RPE', chipOptions: RPE_CHIPS, size: 'wide' }}
            value={String(log.actual_rpe || '')}
            disabled={!canLog}
            onChipPick={(v) => onSaveField(set.id, 'actual_rpe', v)}
            onBlur={() => {}}
          />
        )}

        {layout.showIntensityChips && (
          <FieldCard
            field={{ key: 'actual_rpe', label: 'Intensity', chipOptions: INTENSITY_CHIPS, size: 'wide' }}
            value={String(log.actual_rpe || '')}
            disabled={!canLog}
            onChipPick={(v) => onSaveField(set.id, 'actual_rpe', v)}
            onBlur={() => {}}
          />
        )}

        {layout.showSideChips && (
          <FieldCard
            field={{ key: '_side', label: 'Side', chipOptions: SIDE_CHIPS, size: 'wide' }}
            value={side}
            disabled={!canLog}
            onChipPick={(v) => onSaveField(set.id, 'log_notes', mergeSideIntoNotes(notes, v))}
            onBlur={() => {}}
          />
        )}

        {layout.optional && layout.optional.length > 0 && (
          <div className="log-field-row log-field-row-compact log-field-optional-row">{layout.optional.map(renderField)}</div>
        )}
      </div>
    </div>
  );
}

export default function WorkoutSetLogger({
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
}: Props) {
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
    }, 450);
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
            prevHint={exerciseNotesPrev || undefined}
            disabled={!canLog}
            onBlur={(v) => { flushSaves(); saveExerciseNotes(v); }}
            onChangeValue={(v) => scheduleSave(`notes:${firstSet.id}`, v, () => saveExerciseNotes(v))}
            registerRef={registerInputRef}
            onKeyDown={onInputKeyDown}
            inputKey={`notes-${firstSet.id}-${exerciseNotesDisplay}`}
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
          />
        ))}
      </div>

      {canLog && sets.length > 0 && <p className="muted log-save-hint">Values save automatically as you type.</p>}
    </div>
  );
}
