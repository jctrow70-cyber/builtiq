/**
 * BIQ-0271 Phase E1 — which logger chrome stays primary vs moves into More.
 * Presentation only. Does not change persistence, Copy last, or previous matching.
 */

export type ExerciseLogActionKey =
  | 'collapse'
  | 'formGuide'
  | 'history'
  | 'addSet'
  | 'more'
  | 'supersetEdit'
  | 'newSuperset'
  | 'change'
  | 'moveUp'
  | 'moveDown'
  | 'supersetOut'
  | 'removeExercise';

export type ExerciseLogMoreItemSpec = {
  id: ExerciseLogActionKey;
  label: string;
  danger?: boolean;
};

/** Set-row controls that stay first-class at 390px. Copy last stays explicit, never auto-filled. */
export const SET_ENTRY_PRIMARY_CONTROLS = [
  'setNumber',
  'setType',
  'weight',
  'reps',
  'rir',
  'done',
  'copyLast',
] as const;

export function exerciseLogPrimaryActions(input: {
  collapsed?: boolean;
  canEdit?: boolean;
  hasGuide?: boolean;
  showHistory?: boolean;
}): ExerciseLogActionKey[] {
  const keys: ExerciseLogActionKey[] = ['collapse'];
  if (input.collapsed) return keys;
  if (input.hasGuide) keys.push('formGuide');
  if (input.showHistory) keys.push('history');
  if (input.canEdit) keys.push('addSet', 'more');
  return keys;
}

export function exerciseLogMoreActions(input: {
  canEdit?: boolean;
  inSuperset?: boolean;
}): ExerciseLogActionKey[] {
  if (!input.canEdit) return [];
  if (input.inSuperset) {
    return ['change', 'moveUp', 'moveDown', 'supersetOut', 'removeExercise'];
  }
  return ['supersetEdit', 'change', 'moveUp', 'moveDown', 'removeExercise'];
}

export function exerciseLogMoreItemSpecs(input: {
  inSuperset?: boolean;
  supersetOpen?: boolean;
}): ExerciseLogMoreItemSpec[] {
  return exerciseLogMoreActions({ canEdit: true, inSuperset: input.inSuperset }).map((id) => {
    if (id === 'supersetEdit') {
      return { id, label: input.supersetOpen ? 'Done with superset' : 'Superset' };
    }
    if (id === 'change') return { id, label: 'Change exercise' };
    if (id === 'moveUp') return { id, label: input.inSuperset ? 'Move up in superset' : 'Move up' };
    if (id === 'moveDown') return { id, label: input.inSuperset ? 'Move down in superset' : 'Move down' };
    if (id === 'supersetOut') return { id, label: 'Remove from superset' };
    return { id, label: 'Remove exercise', danger: true };
  });
}

/** New superset stays on the existing Edit/Superset panel rather than a second More row. */
export function exerciseLogSupersetPanelActions(): ExerciseLogActionKey[] {
  return ['newSuperset'];
}

export function logFieldAriaLabel(input: { label: string; unit?: string | null }): string {
  const unit = String(input.unit || '').trim();
  const label = String(input.label || '').trim() || 'Field';
  return unit ? `${label} (${unit})` : label;
}

export function setDoneAriaLabel(): string {
  return 'Mark set done';
}

export function copyLastAriaLabel(): string {
  return 'Copy last workout values';
}

/**
 * Previous performance is a placeholder hint only. E1 must not auto-populate the input.
 */
export function previousPerformanceHint(input: {
  value?: string | null;
  prev?: string | null;
}): { displayValue: string; placeholder?: string; autoFilled: false } {
  const value = String(input.value || '');
  const prev = String(input.prev || '');
  return {
    displayValue: value,
    placeholder: !value && prev ? prev : undefined,
    autoFilled: false,
  };
}

/** Extra sets stay loggable but cannot be retyped, removed, or copy-lasted. */
export function extraSetLogPermissions(): { canEdit: boolean; showCopyLast: boolean; showPrevious: boolean } {
  return { canEdit: false, showCopyLast: false, showPrevious: false };
}

export function reviewSetLogInputsDisabled(canLog?: boolean): boolean {
  return !canLog;
}

export function bindExerciseLogMoreItems(
  specs: ExerciseLogMoreItemSpec[],
  handlers: Partial<Record<ExerciseLogActionKey, () => void>>,
): Array<ExerciseLogMoreItemSpec & { onSelect: () => void }> {
  return specs.map((item) => ({
    ...item,
    onSelect: handlers[item.id] || (() => {}),
  }));
}

export function exerciseLogMoreTriggerAttrs(open?: boolean): {
  'aria-expanded': boolean;
  'aria-haspopup': 'menu';
  'aria-label': string;
} {
  return {
    'aria-expanded': !!open,
    'aria-haspopup': 'menu',
    'aria-label': 'More exercise actions',
  };
}

/** Escape closes the menu and returns focus to More. Tab dismisses without a focus trap. */
export function exerciseLogMoreKeyCloses(key: string): boolean {
  return key === 'Escape';
}

export function exerciseLogMoreKeyRestoresTrigger(key: string): boolean {
  return key === 'Escape';
}

export function exerciseLogMoreKeyDismisses(key: string): boolean {
  return key === 'Escape' || key === 'Tab';
}

export function exerciseLogMoreMenuIndex(input: {
  key: string;
  currentIndex: number;
  count: number;
}): number | null {
  const count = Number(input.count) || 0;
  if (count <= 0) return null;
  const current = Math.min(Math.max(Number(input.currentIndex) || 0, 0), count - 1);
  if (input.key === 'ArrowDown') return (current + 1) % count;
  if (input.key === 'ArrowUp') return (current - 1 + count) % count;
  if (input.key === 'Home') return 0;
  if (input.key === 'End') return count - 1;
  return null;
}
