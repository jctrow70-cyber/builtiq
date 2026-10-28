/**
 * BIQ-0271 Phase A/C: shared workout sections, summaries, and detail helpers.
 * Run: npx tsx scripts/test-workout-preview.ts
 */
import assert from 'node:assert/strict';
import {
  WORKOUT_SECTIONS,
  blockRestLabel,
  exerciseEquipmentLabel,
  exerciseNoteText,
  exerciseRestLabel,
  exerciseSection,
  exerciseTempoLabel,
  groupedPreviewSections,
  normalizeWorkoutSection,
  rampSetDetails,
  sectionExercises,
  summarizeExercise,
  summarizeExerciseParts,
  supersetMarks,
  workingSetCount,
} from '../lib/programDesign/workoutPreview';
import { WORKOUT_TEMPLATE_SECTIONS, groupSectionBlocks } from '../lib/training/workoutTemplate';
import {
  applyWorkoutSaveEvent,
  INITIAL_WORKOUT_SAVE_STATE,
  interpretReloadResult,
  workoutSaveStatusClass,
  workoutSaveStatusLabel,
  workoutSaveStatusLive,
} from '../lib/training/workoutSaveStatus';
import { programEditAudience, programEditScopeCopy, programEditScopeKind } from '../lib/programDesign/enrollment';
import type { ProgramDesignRecord } from '../lib/programDesign/types';

assert.deepEqual(
  WORKOUT_SECTIONS.map((s) => s.id),
  ['warmup', 'strength', 'conditioning', 'cooldown']
);
assert.deepEqual(
  WORKOUT_TEMPLATE_SECTIONS.map((s) => s.id),
  ['warmup', 'strength', 'conditioning', 'cooldown']
);

assert.equal(normalizeWorkoutSection('warmup'), 'warmup');
assert.equal(normalizeWorkoutSection('strength'), 'strength');
assert.equal(normalizeWorkoutSection('cooldown'), 'cooldown');
assert.equal(normalizeWorkoutSection('conditioning'), 'conditioning');
assert.equal(normalizeWorkoutSection('cardio'), 'conditioning');
assert.equal(normalizeWorkoutSection('metcon'), 'conditioning');
assert.equal(normalizeWorkoutSection('finisher'), 'conditioning');
assert.equal(normalizeWorkoutSection('cool-down'), 'cooldown');
assert.equal(normalizeWorkoutSection('mobility'), 'mobility');
assert.equal(normalizeWorkoutSection('strength', { program_role: 'conditioning' }), 'conditioning');
assert.equal(normalizeWorkoutSection('warmup', { program_role: 'conditioning' }), 'warmup');
assert.equal(exerciseSection({ section: 'cardio' }), 'conditioning');
assert.equal(exerciseSection({ section: 'strength', program_role: 'primary' }), 'strength');

const mixedWorkout = {
  st_exercises: [
    { id: 'w1', section: 'warmup', sort_order: 1, name: 'March' },
    { id: 's1', section: 'strength', sort_order: 2, name: 'Bench Press' },
    { id: 'c1', section: 'cardio', sort_order: 3, name: 'Assault Bike' },
    { id: 'c2', section: 'strength', program_role: 'conditioning', sort_order: 4, name: 'Row Ergometer' },
    { id: 'd1', section: 'cooldown', sort_order: 5, name: 'Walk' },
    { id: 'm1', section: 'mobility', sort_order: 6, name: 'T-Spine' },
  ],
};

assert.deepEqual(
  sectionExercises(mixedWorkout, 'conditioning').map((e: any) => e.name),
  ['Assault Bike', 'Row Ergometer']
);
assert.equal(sectionExercises(mixedWorkout, 'strength').length, 1);
assert.equal(sectionExercises(mixedWorkout, 'mobility').length, 1);
assert.equal(exerciseSection(mixedWorkout.st_exercises[2]), 'conditioning');
assert.equal(mixedWorkout.st_exercises[2].section, 'cardio');

function exercise(name: string, sets: Array<Record<string, unknown>>) {
  return {
    name,
    st_planned_sets: sets.map((set, i) => ({
      set_number: i + 1,
      sort_order: i + 1,
      ...set,
    })),
  };
}

const bench = exercise('Bench Press', [
  { set_type: 'warmup', target_reps: '8' },
  { set_type: 'warmup', target_reps: '5' },
  { set_type: 'ramp', target_reps: '3' },
  { set_type: 'working', rep_min: 5, rep_max: 8, target_rir: 2 },
  { set_type: 'working', rep_min: 5, rep_max: 8, target_rir: 2 },
  { set_type: 'working', rep_min: 5, rep_max: 8, target_rir: 2 },
  { set_type: 'working', rep_min: 5, rep_max: 8, target_rir: 2 },
]);
const benchParts = summarizeExerciseParts(bench);
assert.equal(benchParts.primary, '4 × 5–8 reps · 2 RIR');
assert.deepEqual(benchParts.extras, ['3 ramp-up sets']);
assert.equal(summarizeExercise(bench), '4 × 5–8 reps · 2 RIR · 3 ramp-up sets');
assert.doesNotMatch(benchParts.primary, /ramp|warmup/);

const mixedKinds = exercise('Squat', [
  { set_type: 'warmup', target_reps: '5' },
  { set_type: 'working', target_reps: '5' },
  { set_type: 'working', target_reps: '5' },
  { set_type: 'backoff', target_reps: '8' },
  { set_type: 'dropset', target_reps: '12' },
  { set_type: 'amrap', target_reps: 'AMRAP' },
]);
assert.equal(summarizeExerciseParts(mixedKinds).primary, '2 × 5 reps');
assert.deepEqual(summarizeExerciseParts(mixedKinds).extras, [
  '1 ramp-up set',
  '1 backoff set',
  '1 drop set',
  '1 AMRAP set',
]);

const warmupOnly = exercise('Band Pull-Apart', [
  { set_type: 'warmup', target_reps: '12' },
  { set_type: 'warmup', target_reps: '12' },
]);
assert.equal(summarizeExerciseParts(warmupOnly).primary, '2 × 12 reps');
assert.deepEqual(summarizeExerciseParts(warmupOnly).extras, []);

const empty = exercise('New lift', []);
assert.equal(summarizeExercise(empty), 'No sets prescribed');

function prog(partial: Partial<ProgramDesignRecord> & { id: string; name: string }): ProgramDesignRecord {
  return {
    owner_user_id: 'user-1',
    visibility: 'personal',
    status: 'published',
    weeks: 4,
    start_date: '2026-09-01',
    end_date: '2026-09-28',
    source_program_id: null,
    team_id: null,
    record_kind: 'instance',
    ...partial,
  } as ProgramDesignRecord;
}

const personal = prog({ id: 'p1', name: 'My Lift' });
const group = prog({ id: 'g1', name: 'Team Lift', visibility: 'team', team_id: 't1' });
const justMe = prog({ id: 'j1', name: 'Team Lift (just me)', source_program_id: 'g1' });

assert.equal(programEditAudience(personal), null);
assert.equal(programEditAudience(group), 'group');
assert.equal(programEditAudience(justMe), 'me');
assert.equal(programEditScopeKind(personal), 'personal');
assert.equal(programEditScopeKind(group), 'group');
assert.equal(programEditScopeKind(justMe), 'personalized_copy');
assert.equal(programEditScopeKind(personal, { assignmentType: 'individual_team' }), 'trainer_client');
assert.equal(programEditScopeKind(group, { assignmentType: 'individual_team' }), 'group');
assert.equal(programEditScopeCopy(personal).title, 'Personal program');
assert.equal(programEditScopeCopy(group).detail, 'Changes affect assigned members.');
assert.equal(programEditScopeCopy(justMe).title, 'Personalized group copy');
assert.equal(programEditScopeCopy(personal, { assignmentType: 'individual_team' }).title, 'Individual trainer-client program');

const noConditioning = {
  st_exercises: [
    { id: 'w1', section: 'warmup', sort_order: 1, name: 'March' },
    { id: 's1', section: 'strength', sort_order: 2, name: 'Bench Press' },
    { id: 'd1', section: 'cooldown', sort_order: 5, name: 'Walk' },
  ],
};
assert.deepEqual(
  groupedPreviewSections(noConditioning).map((sec) => sec.id),
  ['warmup', 'strength', 'cooldown']
);
assert.deepEqual(
  groupedPreviewSections(mixedWorkout).map((sec) => sec.id),
  ['warmup', 'strength', 'conditioning', 'cooldown', 'other']
);
assert.deepEqual(
  groupedPreviewSections(mixedWorkout)
    .find((sec) => sec.id === 'conditioning')
    ?.list.map((ex: any) => ex.name),
  ['Assault Bike', 'Row Ergometer']
);

assert.equal(exerciseEquipmentLabel({ name: 'Barbell Bench Press' }), '');
assert.equal(exerciseEquipmentLabel({ name: 'Barbell Bench Press', equipment: 'Barbell' }), 'Barbell');
assert.equal(
  exerciseEquipmentLabel({ name: 'Smith Machine Bench Press' }, { equipment: 'Smith Machine' }),
  'Smith Machine'
);
assert.equal(
  exerciseEquipmentLabel({ name: 'Dumbbell Bench Press' }, { coaching_metadata: { default_equipment: 'Dumbbell' } }),
  'Dumbbell'
);

assert.equal(workingSetCount(bench), 4);
assert.deepEqual(rampSetDetails(bench), ['Ramp 1: 8 reps', 'Ramp 2: 5 reps', 'Ramp 3: 3 reps']);
const squat = exercise('Back Squat', [
  { set_type: 'ramp' },
  { set_type: 'ramp' },
  { set_type: 'working', rep_min: 6, rep_max: 8 },
  { set_type: 'working', rep_min: 6, rep_max: 8 },
  { set_type: 'working', rep_min: 6, rep_max: 8 },
]);
assert.equal(workingSetCount(squat), 3);
assert.equal(summarizeExerciseParts(squat).primary, '3 × 6–8 reps');
assert.deepEqual(summarizeExerciseParts(squat).extras, ['2 ramp-up sets']);
assert.deepEqual(rampSetDetails(squat), ['Ramp 1', 'Ramp 2']);

const press = {
  name: 'Incline Dumbbell Press',
  rest_seconds: 90,
  tempo: '3010',
  notes: 'Keep elbows 45°',
  st_planned_sets: [{ set_type: 'working', target_reps: '10', target_rir: 2, rest_seconds: 90 }],
};
assert.equal(exerciseRestLabel(press), '90 sec rest');
assert.equal(exerciseTempoLabel(press), '3010');
assert.equal(exerciseNoteText(press), 'Keep elbows 45°');

const pair = [
  {
    id: 'a1',
    name: 'Incline Dumbbell Press',
    sort_order: 1,
    rest_seconds: 90,
    superset_group_id: 'g1',
    superset_label: 'Superset A',
    superset_order: 1,
  },
  {
    id: 'a2',
    name: 'Cable Row',
    sort_order: 1,
    rest_seconds: 90,
    superset_group_id: 'g1',
    superset_label: 'Superset A',
    superset_order: 2,
  },
  { id: 'b1', name: 'Curl', sort_order: 2 },
];
const blocks = groupSectionBlocks(pair);
assert.equal(blocks[0].type, 'superset');
assert.deepEqual(
  blocks[0].exercises.map((ex: any) => ex.name),
  ['Incline Dumbbell Press', 'Cable Row']
);
assert.deepEqual(supersetMarks(blocks[0].label, 2), ['A1', 'A2']);
assert.equal(blockRestLabel(blocks[0].exercises), '90 sec rest');
assert.equal(blocks[1].type, 'single');
assert.equal(blocks[1].exercises[0].name, 'Curl');

function simulatePersist(write: 'ok' | 'fail', reload: 'ok' | 'fail' | 'throw' | 'skip') {
  let state = applyWorkoutSaveEvent(INITIAL_WORKOUT_SAVE_STATE, { type: 'start' });
  assert.equal(state.status, 'saving');
  assert.equal(workoutSaveStatusLabel(state.status), 'Saving…');
  assert.equal(workoutSaveStatusLive(state.status), 'polite');
  if (write === 'fail') {
    return applyWorkoutSaveEvent(state, { type: 'write_failed', message: 'Could not update set' });
  }
  if (reload === 'skip') return state;
  if (reload === 'throw') {
    return applyWorkoutSaveEvent(state, { type: 'reload_failed', message: 'Network down' });
  }
  return applyWorkoutSaveEvent(state, interpretReloadResult(reload === 'ok' ? { error: null } : { error: 'Could not load workout tree' }));
}

const saving = simulatePersist('ok', 'skip');
assert.equal(workoutSaveStatusLabel(saving.status), 'Saving…');
assert.equal(saving.detail, '');

const saved = simulatePersist('ok', 'ok');
assert.equal(saved.status, 'saved');
assert.equal(workoutSaveStatusLabel(saved.status), 'Saved');
assert.equal(workoutSaveStatusLive(saved.status), 'polite');
assert.notEqual(saved.status, 'failed');

const refreshFailed = simulatePersist('ok', 'fail');
assert.equal(refreshFailed.status, 'refresh_failed');
assert.equal(workoutSaveStatusLabel(refreshFailed.status), "Saved, but couldn't refresh");
assert.equal(refreshFailed.detail, 'Could not load workout tree');
assert.notEqual(refreshFailed.status, 'failed');
assert.equal(workoutSaveStatusLive(refreshFailed.status), 'polite');
assert.match(workoutSaveStatusClass(refreshFailed.status), /refresh/);

const refreshThrew = simulatePersist('ok', 'throw');
assert.equal(refreshThrew.status, 'refresh_failed');
assert.equal(workoutSaveStatusLabel(refreshThrew.status), "Saved, but couldn't refresh");
assert.notEqual(refreshThrew.status, 'failed');

const writeFailed = simulatePersist('fail', 'skip');
assert.equal(writeFailed.status, 'failed');
assert.equal(workoutSaveStatusLabel(writeFailed.status), 'Save failed');
assert.equal(writeFailed.detail, 'Could not update set');
assert.equal(workoutSaveStatusLive(writeFailed.status), 'assertive');
assert.match(workoutSaveStatusClass(writeFailed.status), /error/);

assert.equal(interpretReloadResult(undefined).type, 'reload_ok');
assert.equal(interpretReloadResult({ error: '' }).type, 'reload_ok');

console.log('workout preview Phase A/C checks passed');
