export type TrainingPreviewAction = 'preview' | 'log';

export type TrainingPreviewReason = 'ok' | 'missing' | 'unauthorized' | 'unavailable';

export type TrainingPreviewResolution = {
  workout: any | null;
  error: string | null;
  reason: TrainingPreviewReason;
};

function looksUnauthorized(message: string): boolean {
  return /permission|policy|rls|not authorized|unauthorized|row-level|403/i.test(message);
}

/** Calendar title/details never start a workout. Start and Review keep the existing logger path. */
export function trainingCalendarAction(
  control: 'title' | 'details' | 'start' | 'review',
  item?: { workoutId?: string | null; completed?: boolean } | null
): TrainingPreviewAction | null {
  if (!item?.workoutId) return null;
  if (control === 'title' || control === 'details') return 'preview';
  if (control === 'start' || control === 'review') return 'log';
  return null;
}

/**
 * Resolve a preview workout from the requested program tree only.
 * Never substitutes a personal workout when the selected group/overlay tree is missing.
 */
export function resolveTrainingPreviewWorkout(input: {
  workoutId?: string | null;
  programId?: string | null;
  loadedProgram?: any | null;
  loadError?: string | null;
  fallbackWorkouts?: any[] | null;
}): TrainingPreviewResolution {
  const workoutId = String(input.workoutId || '').trim();
  if (!workoutId) {
    return { workout: null, error: 'This workout is unavailable.', reason: 'missing' };
  }

  const loadError = String(input.loadError || '').trim();
  if (loadError) {
    return {
      workout: null,
      error: looksUnauthorized(loadError)
        ? 'You do not have access to this workout.'
        : 'This workout could not be loaded.',
      reason: looksUnauthorized(loadError) ? 'unauthorized' : 'unavailable',
    };
  }

  const program = input.loadedProgram || null;
  const requestedProgramId = String(input.programId || '').trim();
  if (requestedProgramId && program?.id && String(program.id) !== requestedProgramId) {
    return { workout: null, error: 'This workout could not be loaded.', reason: 'unavailable' };
  }

  const fromProgram = (program?.st_workouts || []).find((row: any) => row?.id === workoutId) || null;
  if (fromProgram) return { workout: fromProgram, error: null, reason: 'ok' };

  const fallback = (input.fallbackWorkouts || []).find((row: any) => row?.id === workoutId) || null;
  if (fallback) {
    const fallbackProgramId = String(fallback.program_id || '').trim();
    if (requestedProgramId && fallbackProgramId && fallbackProgramId !== requestedProgramId) {
      return { workout: null, error: 'This workout is unavailable.', reason: 'missing' };
    }
    return { workout: fallback, error: null, reason: 'ok' };
  }

  return { workout: null, error: 'This workout is unavailable.', reason: 'missing' };
}

export function previewDialogKeyCloses(key: string): boolean {
  return key === 'Escape';
}

/** Edit stays hidden unless the user is already authorized or this is their personal calendar workout. */
export function canShowTrainingPreviewEdit(input: {
  authorized?: boolean;
  personalCalendar?: boolean;
  hasWorkout?: boolean;
  loadError?: string | null;
}): boolean {
  if (!input.hasWorkout) return false;
  if (String(input.loadError || '').trim()) return false;
  return !!input.authorized || !!input.personalCalendar;
}

/** Wrap Tab at the ends of the dialog. Returns the next index, or null when Tab should move normally. */
export function previewDialogTabWrap(
  key: string,
  shiftKey: boolean,
  activeIndex: number,
  count: number
): number | null {
  if (key !== 'Tab' || count <= 0) return null;
  if (shiftKey && activeIndex <= 0) return count - 1;
  if (!shiftKey && activeIndex >= count - 1) return 0;
  return null;
}
