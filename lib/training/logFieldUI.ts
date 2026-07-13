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
};

export type LogLayout = {
  primary: LogFieldUI[];
  optional?: LogFieldUI[];
  showRpeChips?: boolean;
  showIntensityChips?: boolean;
  showSideChips?: boolean;
};

const RPE_CHIPS = ['6', '7', '8', '9', '10'];
const INTENSITY_CHIPS = ['Easy', 'Moderate', 'Hard', 'Max'];
const SIDE_CHIPS = ['Left', 'Right', 'Each'];

export function logLayoutForType(type: ExerciseType): LogLayout {
  if (isCardioType(type)) {
    return {
      primary: [
        { key: 'actual_duration', label: 'Duration', placeholder: '30', unit: 'min', unitGroup: 'duration', inputMode: 'decimal' },
        { key: 'actual_distance', label: 'Distance', placeholder: '3.1', unitGroup: 'distance', inputMode: 'decimal' },
        { key: 'actual_pace', label: 'Pace / speed', placeholder: '9:30', unit: 'min/mi', inputMode: 'text' },
      ],
      optional: [
        { key: 'actual_hr', label: 'Heart rate', placeholder: '145', unit: 'bpm', optional: true, inputMode: 'numeric' },
        { key: 'actual_calories', label: 'Calories', placeholder: '320', unit: 'kcal', optional: true, inputMode: 'numeric' },
        { key: 'log_notes', label: 'Notes', placeholder: 'How it felt…', optional: true, wide: true },
      ],
      showIntensityChips: true,
    };
  }
  if (type === 'timed') {
    return {
      primary: [
        { key: 'actual_duration', label: 'Duration', placeholder: '60', unit: 'sec', unitGroup: 'duration', inputMode: 'decimal' },
        { key: 'actual_weight', label: 'Load (optional)', placeholder: '0', unitGroup: 'weight', optional: true, inputMode: 'decimal' },
      ],
      optional: [{ key: 'log_notes', label: 'Notes', placeholder: 'Form, rest…', optional: true, wide: true }],
    };
  }
  if (type === 'mobility') {
    return {
      primary: [
        { key: 'actual_duration', label: 'Duration', placeholder: '45', unit: 'sec', unitGroup: 'duration', inputMode: 'decimal' },
      ],
      optional: [{ key: 'log_notes', label: 'Notes', placeholder: 'ROM, tension…', optional: true, wide: true }],
      showSideChips: true,
    };
  }
  if (type === 'bodyweight') {
    return {
      primary: [
        { key: 'actual_reps', label: 'Reps', placeholder: '12', unit: 'reps', inputMode: 'numeric' },
        { key: 'actual_weight', label: 'Added weight', placeholder: '0', unitGroup: 'weight', optional: true, inputMode: 'decimal' },
      ],
      optional: [
        { key: '_assist_weight', label: 'Assistance', placeholder: '20', unitGroup: 'weight', optional: true, inputMode: 'decimal' },
        { key: 'log_notes', label: 'Notes', placeholder: 'Tempo, form…', optional: true, wide: true },
      ],
      showRpeChips: true,
    };
  }
  if (isStrengthLike(type)) {
    return {
      primary: [
        { key: 'actual_weight', label: 'Weight', placeholder: '135', unitGroup: 'weight', inputMode: 'decimal' },
        { key: 'actual_reps', label: 'Reps', placeholder: '8', unit: 'reps', inputMode: 'numeric' },
      ],
      optional: [{ key: 'log_notes', label: 'Notes', placeholder: 'Felt strong, etc.', optional: true, wide: true }],
      showRpeChips: true,
    };
  }
  return {
    primary: [
      { key: 'actual_reps', label: 'Reps', placeholder: '10', unit: 'reps', inputMode: 'numeric' },
    ],
    optional: [{ key: 'log_notes', label: 'Notes', optional: true, wide: true }],
  };
}

/** Keys persisted to st_set_logs for saveLog payload assembly. */
export function logFieldKeysForType(type: ExerciseType): string[] {
  const layout = logLayoutForType(type);
  const keys = new Set<string>();
  [...layout.primary, ...(layout.optional || [])].forEach((f) => {
    if (!f.key.startsWith('_')) keys.add(f.key);
  });
  if (layout.showRpeChips) keys.add('actual_rpe');
  if (layout.showIntensityChips) keys.add('actual_rpe');
  return Array.from(keys);
}

export function allLogFieldsFlat(type: ExerciseType): LogFieldUI[] {
  const layout = logLayoutForType(type);
  return [...layout.primary, ...(layout.optional || [])];
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
