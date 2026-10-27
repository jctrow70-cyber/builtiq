/**
 * BIQ-0271 Phase A: shared workout sections and exercise summaries.
 * Run: npx tsx scripts/test-workout-preview.ts
 */
import assert from 'node:assert/strict';
import {
  WORKOUT_SECTIONS,
  exerciseSection,
  normalizeWorkoutSection,
  sectionExercises,
  summarizeExercise,
  summarizeExerciseParts,
} from '../lib/programDesign/workoutPreview';
import { WORKOUT_TEMPLATE_SECTIONS } from '../lib/training/workoutTemplate';
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

console.log('workout preview Phase A checks passed');
