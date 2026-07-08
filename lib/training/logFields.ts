import type { ExerciseType } from './exerciseTypes';
import { isCardioType, isStrengthLike } from './exerciseTypes';

export type LogField = { key: string; label: string; placeholder?: string; gridClass?: string };

export function logFieldsForType(type: ExerciseType): LogField[] {
  if (isCardioType(type)) {
    return [
      { key: 'actual_duration', label: 'Time', placeholder: 'min' },
      { key: 'actual_distance', label: 'Dist', placeholder: 'mi' },
      { key: 'actual_pace', label: 'Pace', placeholder: 'min/mi' },
      { key: 'actual_hr', label: 'HR', placeholder: 'bpm' },
      { key: 'log_notes', label: 'Notes', placeholder: 'notes' },
    ];
  }
  if (type === 'timed') {
    return [
      { key: 'actual_duration', label: 'Time', placeholder: 'sec' },
      { key: 'log_notes', label: 'Notes', placeholder: 'notes' },
    ];
  }
  if (isStrengthLike(type)) {
    return [
      { key: 'actual_weight', label: 'Wt', placeholder: 'lb' },
      { key: 'actual_reps', label: 'Reps', placeholder: 'reps' },
      { key: 'actual_rpe', label: 'RPE', placeholder: '1-10' },
    ];
  }
  return [
    { key: 'actual_reps', label: 'Reps', placeholder: 'reps' },
    { key: 'log_notes', label: 'Notes', placeholder: 'notes' },
  ];
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
