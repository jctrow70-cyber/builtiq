export type WorkoutSaveStatus = 'idle' | 'saving' | 'saved' | 'refresh_failed' | 'failed';

export type WorkoutSaveState = {
  status: WorkoutSaveStatus;
  detail: string;
};

export type WorkoutSaveEvent =
  | { type: 'start' }
  | { type: 'write_failed'; message: string }
  | { type: 'reload_ok' }
  | { type: 'reload_failed'; message?: string };

export const INITIAL_WORKOUT_SAVE_STATE: WorkoutSaveState = { status: 'idle', detail: '' };

export function applyWorkoutSaveEvent(prev: WorkoutSaveState, event: WorkoutSaveEvent): WorkoutSaveState {
  if (event.type === 'start') return { status: 'saving', detail: '' };
  if (event.type === 'write_failed') return { status: 'failed', detail: String(event.message || '').trim() };
  if (event.type === 'reload_ok') return { status: 'saved', detail: '' };
  return { status: 'refresh_failed', detail: String(event.message || '').trim() };
}

export function interpretReloadResult(result: unknown): Extract<WorkoutSaveEvent, { type: 'reload_ok' | 'reload_failed' }> {
  if (result && typeof result === 'object' && 'error' in result) {
    const message = String((result as { error?: unknown }).error || '').trim();
    if (message) return { type: 'reload_failed', message };
  }
  return { type: 'reload_ok' };
}

export function workoutSaveStatusLabel(status: WorkoutSaveStatus): string {
  if (status === 'saving') return 'Saving…';
  if (status === 'saved') return 'Saved';
  if (status === 'refresh_failed') return "Saved, but couldn't refresh";
  if (status === 'failed') return 'Save failed';
  return '';
}

export function workoutSaveStatusLive(status: WorkoutSaveStatus): 'polite' | 'assertive' | null {
  if (status === 'failed') return 'assertive';
  if (status === 'saving' || status === 'saved' || status === 'refresh_failed') return 'polite';
  return null;
}

export function workoutSaveStatusClass(status: WorkoutSaveStatus): string {
  if (status === 'failed') return 'pd-save-status pd-save-status--error';
  if (status === 'refresh_failed') return 'pd-save-status pd-save-status--refresh';
  return 'pd-save-status';
}
