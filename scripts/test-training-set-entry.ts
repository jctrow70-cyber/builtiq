/**
 * BIQ-0271 Phase E1: set-entry-first chrome. Presentation only.
 * Run: npx tsx scripts/test-training-set-entry.ts
 */
import assert from 'node:assert/strict';
import {
  SET_ENTRY_PRIMARY_CONTROLS,
  bindExerciseLogMoreItems,
  copyLastAriaLabel,
  exerciseLogMoreActions,
  exerciseLogMoreItemSpecs,
  exerciseLogMoreKeyCloses,
  exerciseLogMoreKeyDismisses,
  exerciseLogMoreKeyRestoresTrigger,
  exerciseLogMoreMenuIndex,
  exerciseLogMoreTriggerAttrs,
  exerciseLogPrimaryActions,
  exerciseLogSupersetPanelActions,
  extraSetLogPermissions,
  logFieldAriaLabel,
  previousPerformanceHint,
  reviewSetLogInputsDisabled,
  setDoneAriaLabel,
} from '../lib/training/exerciseLogChrome';
import { logLayoutForType } from '../lib/training/logFieldUI';
import { setTypeAcronym } from '../lib/training/setTypes';
import { extraSetsForExercise, nextExtraSetNumber } from '../lib/training/extraSets';

assert.deepEqual(
  [...SET_ENTRY_PRIMARY_CONTROLS],
  ['setNumber', 'setType', 'weight', 'reps', 'rir', 'done', 'copyLast']
);

assert.deepEqual(
  exerciseLogPrimaryActions({ collapsed: false, canEdit: true, hasGuide: true, showHistory: true }),
  ['collapse', 'formGuide', 'history', 'addSet', 'more']
);
assert.deepEqual(exerciseLogPrimaryActions({ collapsed: true, canEdit: true, hasGuide: true, showHistory: true }), [
  'collapse',
]);
assert.deepEqual(
  exerciseLogPrimaryActions({ collapsed: false, canEdit: false, hasGuide: true, showHistory: true }),
  ['collapse', 'formGuide', 'history']
);
assert.ok(!exerciseLogPrimaryActions({ collapsed: false, canEdit: true, showHistory: true }).includes('change'));
assert.ok(!exerciseLogPrimaryActions({ collapsed: false, canEdit: true, showHistory: true }).includes('removeExercise'));

assert.deepEqual(exerciseLogMoreActions({ canEdit: true, inSuperset: false }), [
  'supersetEdit',
  'change',
  'moveUp',
  'moveDown',
  'removeExercise',
]);
assert.deepEqual(exerciseLogMoreActions({ canEdit: true, inSuperset: true }), [
  'change',
  'moveUp',
  'moveDown',
  'supersetOut',
  'removeExercise',
]);
assert.deepEqual(exerciseLogMoreActions({ canEdit: false }), []);

const standaloneMore = exerciseLogMoreItemSpecs({ inSuperset: false, supersetOpen: false });
assert.equal(standaloneMore.find((i) => i.id === 'supersetEdit')?.label, 'Superset');
assert.equal(exerciseLogMoreItemSpecs({ inSuperset: false, supersetOpen: true }).find((i) => i.id === 'supersetEdit')?.label, 'Done with superset');
assert.equal(standaloneMore.find((i) => i.id === 'change')?.label, 'Change exercise');
assert.equal(standaloneMore.find((i) => i.id === 'removeExercise')?.danger, true);
assert.equal(exerciseLogMoreItemSpecs({ inSuperset: true }).find((i) => i.id === 'supersetOut')?.label, 'Remove from superset');
assert.deepEqual(exerciseLogSupersetPanelActions(), ['newSuperset']);

const bound = bindExerciseLogMoreItems(standaloneMore, {
  change: () => {},
  moveUp: () => {},
  moveDown: () => {},
  removeExercise: () => {},
  supersetEdit: () => {},
});
assert.equal(bound.length, standaloneMore.length);
assert.equal(typeof bound[0].onSelect, 'function');

assert.equal(exerciseLogMoreKeyCloses('Escape'), true);
assert.equal(exerciseLogMoreKeyCloses('Tab'), false);
assert.equal(exerciseLogMoreKeyRestoresTrigger('Escape'), true);
assert.equal(exerciseLogMoreKeyRestoresTrigger('Tab'), false);
assert.equal(exerciseLogMoreKeyDismisses('Escape'), true);
assert.equal(exerciseLogMoreKeyDismisses('Tab'), true);
assert.equal(exerciseLogMoreMenuIndex({ key: 'ArrowDown', currentIndex: 0, count: 5 }), 1);
assert.equal(exerciseLogMoreMenuIndex({ key: 'ArrowUp', currentIndex: 0, count: 5 }), 4);
assert.equal(exerciseLogMoreMenuIndex({ key: 'Home', currentIndex: 3, count: 5 }), 0);
assert.equal(exerciseLogMoreMenuIndex({ key: 'End', currentIndex: 0, count: 5 }), 4);
assert.equal(exerciseLogMoreMenuIndex({ key: 'Enter', currentIndex: 0, count: 5 }), null);
assert.deepEqual(exerciseLogMoreTriggerAttrs(false), {
  'aria-expanded': false,
  'aria-haspopup': 'menu',
  'aria-label': 'More exercise actions',
});
assert.equal(exerciseLogMoreTriggerAttrs(true)['aria-expanded'], true);
assert.deepEqual(
  standaloneMore.map((i) => i.id),
  ['supersetEdit', 'change', 'moveUp', 'moveDown', 'removeExercise']
);
assert.deepEqual(
  exerciseLogMoreItemSpecs({ inSuperset: true }).map((i) => i.id),
  ['change', 'moveUp', 'moveDown', 'supersetOut', 'removeExercise']
);

const strength = logLayoutForType('strength');
assert.deepEqual(strength.primary.map((f) => f.key), ['actual_weight', 'actual_reps']);
assert.equal(strength.showRirChips, true);
assert.equal(setTypeAcronym('warmup'), 'WU');
assert.equal(setTypeAcronym('working'), 'WK');

assert.equal(logFieldAriaLabel({ label: 'Weight', unit: 'lb' }), 'Weight (lb)');
assert.equal(logFieldAriaLabel({ label: 'Reps', unit: 'reps' }), 'Reps (reps)');
assert.equal(logFieldAriaLabel({ label: 'RIR' }), 'RIR');
assert.equal(setDoneAriaLabel(), 'Mark set done');
assert.equal(copyLastAriaLabel(), 'Copy last workout values');

const emptyWithPrev = previousPerformanceHint({ value: '', prev: '135' });
assert.equal(emptyWithPrev.displayValue, '');
assert.equal(emptyWithPrev.placeholder, '135');
assert.equal(emptyWithPrev.autoFilled, false);
const logged = previousPerformanceHint({ value: '140', prev: '135' });
assert.equal(logged.displayValue, '140');
assert.equal(logged.placeholder, undefined);
assert.equal(logged.autoFilled, false);

assert.deepEqual(extraSetLogPermissions(), { canEdit: false, showCopyLast: false, showPrevious: false });
assert.equal(reviewSetLogInputsDisabled(false), true);
assert.equal(reviewSetLogInputsDisabled(true), false);

const extras = extraSetsForExercise(
  [
    { id: 'x1', exercise_id: 'ex-1', log_date: '2026-10-29', extra_set_number: 1, actual_weight: '185', actual_reps: '6' },
    { id: 'x2', exercise_id: 'ex-2', log_date: '2026-10-29', extra_set_number: 1 },
  ],
  'ex-1',
  '2026-10-29'
);
assert.equal(extras.length, 1);
assert.equal(extras[0].actual_weight, '185');
assert.equal(nextExtraSetNumber(extras), 2);

console.log('test-training-set-entry: ok');
