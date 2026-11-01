export type SetSaveState = 'idle' | 'saving' | 'error';

/**
 * Routine saves stay out of the card layout.
 * A failed save is a visible alert. aria-busy is not the failure message.
 */
export function setLogStatusPresentation(state: SetSaveState) {
  return {
    politeText: state === 'saving' ? 'Saving set' : '',
    showError: state === 'error',
    reservesLayout: state === 'error',
  };
}
