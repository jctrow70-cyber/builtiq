import type { ExerciseType } from './exerciseTypes';
import { isCardioType, isStrengthLike } from './exerciseTypes';

/** UI field definition — maps to st_set_logs columns (or virtual keys handled in the logger). */
export type LogFieldUI = {
  key: string;
  label: string;
  placeholder?: string;
  unit?: string;
  unitGroup?: 'weight' | 'distance' | 'duration';
  optional?: boolean;
  inputMode?: 'decimal' | 'numeric' | 'text';
  chipOptions?: string[];
  wide?: boolean;
  /** compact = narrow numeric input; wide = full row */
  size?: 'compact' | 'normal' | 'wide';
};

export type LogLayout = {
  primary: LogFieldUI[];
  optional?: LogFieldUI[];
  /** Shown once above all sets for the exercise (not repeated per set). */
  exerciseNotes?: LogFieldUI;
  showRpeChips?: boolean;
  showIntensityChips?: boolean;
  showSideChips?: boolean;
};

const RPE_CHIPS = ['6', '7', '8', '9', '10'];
const INTENSITY_CHIPS = ['Easy', 'Moderate', 'Hard', 'Max'];
const SIDE_CHIPS = ['Left', 'Right', 'Each'];

const EXERCISE_NOTES: LogFieldUI = {
  key: 'log_notes',
  label: 'Notes',
  placeholder: 'Form, tempo, how it felt…',
  optional: true,
  size: 'wide',
};

function layoutWithExerciseNotes(
  primary: LogFieldUI[],
  optional: LogFieldUI[] = [],
  extras: Omit<LogLayout, 'primary' | 'optional' | 'exerciseNotes'> = {},
): LogLayout {
  const withoutNotes = optional.filter((f) => f.key !== 'log_notes');
  const notesField = optional.find((f) => f.key === 'log_notes') || EXERCISE_NOTES;
  return {
    primary,
    optional: withoutNotes.length ? withoutNotes : undefined,
    exerciseNotes: notesField,
    ...extras,
  };
}

export function logLayoutForType(type: ExerciseType): LogLayout {
  if (isCardioType(type)) {
    return layoutWithExerciseNotes(
      [
        { key: 'actual_duration', label: 'Duration', placeholder: '30', unit: 'min', unitGroup: 'duration', inputMode: 'decimal', size: 'compact' },
        { key: 'actual_distance', label: 'Distance', placeholder: '3.1', unitGroup: 'distance', inputMode: 'decimal', size: 'compact' },
        { key: 'actual_pace', label: 'Pace', placeholder: '9:30', unit: 'min/mi', inputMode: 'text', size: 'normal' },
      ],
      [
        { key: 'actual_hr', label: 'HR', placeholder: '145', unit: 'bpm', optional: true, inputMode: 'numeric', size: 'compact' },
        { key: 'actual_calories', label: 'Cal', placeholder: '320', unit: 'kcal', optional: true, inputMode: 'numeric', size: 'compact' },
        { key: 'log_notes', label: 'Notes', placeholder: 'How it felt…', optional: true, size: 'wide' },
      ],
      { showIntensityChips: true },
    );
  }
  if (type === 'timed') {
    return layoutWithExerciseNotes(
      [
        { key: 'actual_duration', label: 'Duration', placeholder: '60', unit: 'sec', unitGroup: 'duration', inputMode: 'decimal', size: 'compact' },
        { key: 'actual_weight', label: 'Load', placeholder: '0', unitGroup: 'weight', optional: true, inputMode: 'decimal', size: 'compact' },
      ],
      [{ key: 'log_notes', label: 'Notes', placeholder: 'Form, rest…', optional: true, size: 'wide' }],
    );
  }
  if (type === 'mobility') {
    return layoutWithExerciseNotes(
      [{ key: 'actual_duration', label: 'Duration', placeholder: '45', unit: 'sec', unitGroup: 'duration', inputMode: 'decimal', size: 'compact' }],
      [{ key: 'log_notes', label: 'Notes', placeholder: 'ROM, tension…', optional: true, size: 'wide' }],
      { showSideChips: true },
    );
  }
  if (type === 'bodyweight') {
    return layoutWithExerciseNotes(
      [
        { key: 'actual_reps', label: 'Reps', placeholder: '12', unit: 'reps', inputMode: 'numeric', size: 'compact' },
        { key: 'actual_weight', label: 'Added', placeholder: '0', unitGroup: 'weight', optional: true, inputMode: 'decimal', size: 'compact' },
      ],
      [
        { key: '_assist_weight', label: 'Assist', placeholder: '20', unitGroup: 'weight', optional: true, inputMode: 'decimal', size: 'compact' },
        { key: 'log_notes', label: 'Notes', placeholder: 'Tempo, form…', optional: true, size: 'wide' },
      ],
      { showRpeChips: true },
    );
  }
  if (isStrengthLike(type)) {
    return layoutWithExerciseNotes(
      [
        { key: 'actual_weight', label: 'Weight', placeholder: '135', unitGroup: 'weight', inputMode: 'decimal', size: 'compact' },
        { key: 'actual_reps', label: 'Reps', placeholder: '8', unit: 'reps', inputMode: 'numeric', size: 'compact' },
      ],
      [{ key: 'log_notes', label: 'Notes', placeholder: 'Felt strong, etc.', optional: true, size: 'wide' }],
      { showRpeChips: true },
    );
  }
  return layoutWithExerciseNotes(
    [{ key: 'actual_reps', label: 'Reps', placeholder: '10', unit: 'reps', inputMode: 'numeric', size: 'compact' }],
    [{ key: 'log_notes', label: 'Notes', optional: true, size: 'wide' }],
  );
}

/** Keys persisted to st_set_logs for saveLog payload assembly. */
export function logFieldKeysForType(type: ExerciseType): string[] {
  const layout = logLayoutForType(type);
  const keys = new Set<string>();
  [...layout.primary, ...(layout.optional || [])].forEach((f) => {
    if (!f.key.startsWith('_')) keys.add(f.key);
  });
  if (layout.exerciseNotes && !layout.exerciseNotes.key.startsWith('_')) keys.add(layout.exerciseNotes.key);
  if (layout.showRpeChips) keys.add('actual_rpe');
  if (layout.showIntensityChips) keys.add('actual_rpe');
  return Array.from(keys);
}

export function allLogFieldsFlat(type: ExerciseType): LogFieldUI[] {
  const layout = logLayoutForType(type);
  return [...layout.primary, ...(layout.optional || []), ...(layout.exerciseNotes ? [layout.exerciseNotes] : [])];
}

export { RPE_CHIPS, INTENSITY_CHIPS, SIDE_CHIPS };

/** Parse virtual assist weight from notes. */
export function parseAssistFromNotes(notes: string): string {
  const m = String(notes || '').match(/(?:^|\s)assist:\s*([^\s|]+)/i);
  return m ? m[1] : '';
}

export function mergeAssistIntoNotes(notes: string, assist: string): string {
  const base = String(notes || '')
    .replace(/(?:^|\s)assist:\s*[^\s|]+/gi, '')
    .trim();
  const a = String(assist || '').trim();
  if (!a) return base;
  return base ? `${base} · Assist: ${a}` : `Assist: ${a}`;
}

export function parseSideFromNotes(notes: string): string {
  const m = String(notes || '').match(/(?:^|\s)side:\s*(left|right|each)/i);
  if (!m) return '';
  const v = m[1].toLowerCase();
  return v === 'left' ? 'Left' : v === 'right' ? 'Right' : 'Each';
}

export function mergeSideIntoNotes(notes: string, side: string): string {
  const base = String(notes || '')
    .replace(/(?:^|\s)side:\s*(left|right|each)/gi, '')
    .trim();
  const s = String(side || '').trim();
  if (!s) return base;
  return base ? `${base} · Side: ${s}` : `Side: ${s}`;
}
