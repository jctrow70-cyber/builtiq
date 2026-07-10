import type { ExerciseType } from './exerciseTypes';
import { isCardioType, isStrengthLike } from './exerciseTypes';
import { logFieldKeysForType } from './logFieldUI';

export type LogField = { key: string; label: string; placeholder?: string; gridClass?: string };

const FIELD_META: Record<string, { label: string; placeholder?: string }> = {
  actual_weight: { label: 'Weight', placeholder: 'lb' },
  actual_reps: { label: 'Reps', placeholder: 'reps' },
  actual_rpe: { label: 'RPE', placeholder: '1-10' },
  actual_duration: { label: 'Time', placeholder: 'min' },
  actual_distance: { label: 'Distance', placeholder: 'mi' },
  actual_pace: { label: 'Pace', placeholder: 'min/mi' },
  actual_hr: { label: 'HR', placeholder: 'bpm' },
  actual_calories: { label: 'Calories', placeholder: 'kcal' },
  log_notes: { label: 'Notes', placeholder: 'notes' },
};

export function logFieldsForType(type: ExerciseType): LogField[] {
  return logFieldKeysForType(type).map((key) => ({
    key,
    label: FIELD_META[key]?.label || key,
    placeholder: FIELD_META[key]?.placeholder,
  }));
}

export function formatLogSummary(row: any, type: ExerciseType) {
  if (isCardioType(type)) {
    const parts = [row.actual_duration, row.actual_distance, row.actual_pace].filter(Boolean);
    return parts.length ? parts.join(' · ') : row.log_notes || '—';
  }
  if (isStrengthLike(type)) {
    return `${row.actual_weight || '-'} x ${row.actual_reps || '-'}` + (row.actual_rpe ? ` @ ${row.actual_rpe}` : '');
  }
  return row.actual_duration || row.actual_reps || row.log_notes || '—';
}
