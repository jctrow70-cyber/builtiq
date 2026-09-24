import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { scienceProgramToAiPlan } from '../toAiPlan';
import { adaptGenerationCatalog, isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../generation/catalogEligibility';
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { MASTER_CATALOG_SOURCE } from '../../training/masterCatalog';
import { userCustomCatalogItems } from '../../training/catalogSearch';
import { prescriptionColumnsFromSources } from '../../training/prescriptionMeta';
import { snapshotForLog, plannedRepRangeFromLog } from '../../training/setLogSnapshots';
import {
  canAddPlannedSetAfterSiblingLogs,
  canReplaceWorkout,
  canRewritePlannedSetPrescription,
  workoutHasPerformanceLogs,
} from '../../training/plannedSetGuard';
import { deriveSessionStatus, skippedIsNotFailed } from '../../training/sessionOutcome';
import { deriveExerciseStatus } from '../../training/exerciseOutcome';
import {
  countsTowardProgression,
  extraSetInsertPayload,
  extraSetsAreNotPlanned,
  extraSetsDoNotCompleteWorkout,
  extraLogsFromSetLogs,
  nextExtraSetNumber,
} from '../../training/extraSets';
import { isStrengthWorkoutCompleted } from '../../programDesign/activityCompletion';
import { backfillWeekStatus, weekStatusForNewWorkout } from './weekStatus';
import { progressionConfidence, reportedRirOrUnknown } from './confidence';
import { resolveLoadIncrement } from './increments';
import { normalizePainFlag } from '../../training/workoutSessions';
import { buildExerciseSessionHistory } from '../../training/exerciseSessionHistory';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function hypertrophyProfile() {
  return trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 4,
      sessionMinutes: 60,
    },
  });
}

function masterRow(id: string, name: string) {
  return {
    id,
    name,
    is_archived: false,
    is_system: true,
    user_id: null,
    external_source: MASTER_CATALOG_SOURCE,
    coaching_metadata: {
      laterality: 'bilateral',
      measurement_type: 'reps',
      program_roles: ['primary', 'secondary'],
    },
  };
}

export function runPhase2a1FoundationChecks() {
  const profile = hypertrophyProfile();
  const science = generateProgram(profile, FALLBACK_CATALOG);
  const week1 = science.workouts.filter((w) => w.week === 1);
  assert(week1.length === 3 && week1.every((w) => w.exercises.length > 0), 'Phase 1 generation still produces week 1 lifts');
  const laterWeeks = science.workouts.filter((w) => w.week > 1);
  assert(laterWeeks.length > 0, 'Phase 1 still copies later weeks');
  assert(
    laterWeeks.every((w) => w.exercises.map((e) => e.name).join('|') === week1.find((d) => d.dayLabel === w.dayLabel)?.exercises.map((e) => e.name).join('|')),
    'Phase 1 week-copy behavior is unchanged'
  );

  const plan = scienceProgramToAiPlan(science, { programName: '3-Day Hypertrophy', weeks: 4 });
  const firstStrength = plan.workouts.find((w) => w.week === 1)?.strength?.[0];
  const firstEx = firstStrength && 'name' in firstStrength ? firstStrength : (firstStrength as any)?.superset?.[0];
  assert(firstEx?.program_role, `generated exercises persist program_role, got ${firstEx?.program_role}`);
  assert(firstEx?.measurement_type, 'measurement_type survives toAiPlan');
  assert(firstEx?.laterality, 'laterality survives toAiPlan');

  const catalogHit = {
    name: 'Barbell Bench Press',
    coaching_metadata: { laterality: 'bilateral', measurement_type: 'reps', program_roles: ['primary'] },
    muscle_group: 'chest',
  };
  const persisted = prescriptionColumnsFromSources({
    item: firstEx,
    catalogItem: catalogHit,
    section: 'strength',
    role: firstEx.program_role,
  });
  assert(persisted.program_role === firstEx.program_role, 'persist payload keeps generated role');
  assert(persisted.measurement_type === 'reps', 'measurement_type survives persistence mapping');
  assert(persisted.laterality === 'bilateral', 'laterality survives persistence mapping');

  const planned = { target_rir: 2, rep_min: 6, rep_max: 8, rest_seconds: 180, target_reps: '6-8', set_type: 'working', set_number: 1 };
  const exercise = { name: 'Barbell Bench Press', catalog_exercise_id: '11111111-1111-1111-1111-111111111111', program_role: 'primary' };
  const snap = snapshotForLog(exercise, planned, { day_label: 'Mon', workout_type: 'Full Body', week: 1, day_order: 0 });
  assert(snap.snapshot_target_rir === 2, 'logs snapshot planned RIR');
  assert(snap.snapshot_rep_min === 6 && snap.snapshot_rep_max === 8, 'logs snapshot planned rep range');
  assert(snap.snapshot_program_role === 'primary', 'logs snapshot program_role');
  assert(snap.snapshot_rest_seconds === 180, 'logs snapshot rest');
  const plannedCopy = { ...planned };
  snapshotForLog(exercise, planned, { week: 1 });
  assert(JSON.stringify(plannedCopy) === JSON.stringify(planned), 'logging does not mutate st_planned_sets');

  const oldLog = { snapshot_target_reps: '6-8', snapshot_exercise_name: 'Barbell Bench Press' };
  const range = plannedRepRangeFromLog(oldLog, planned);
  assert(range.raw === '6-8' && range.min === 6, 'old logs with null new snapshot fields still render');

  const workout = {
    id: 'w1',
    st_exercises: [
      {
        id: 'exA',
        section: 'strength',
        st_planned_sets: [
          { id: 'psA', set_type: 'working' },
          { id: 'psB', set_type: 'working' },
        ],
      },
      {
        id: 'exB',
        section: 'strength',
        st_planned_sets: [{ id: 'psC', set_type: 'working' }],
      },
    ],
  };
  const siblingLogs = [{ planned_set_id: 'psA', completed: true, actual_reps: '8' }];
  assert(canAddPlannedSetAfterSiblingLogs().ok, 'mid-session add set still succeeds after another set is logged');
  assert(canRewritePlannedSetPrescription({ plannedSetId: 'psC', logs: siblingLogs }).ok, 'unlogged set in a started workout remains editable');
  assert(!canRewritePlannedSetPrescription({ plannedSetId: 'psA', logs: siblingLogs }).ok, 'logged planned set A cannot have its prescription rewritten');
  assert(canRewritePlannedSetPrescription({ plannedSetId: 'psB', logs: siblingLogs }).ok, 'unlogged planned set B in the same workout can still be edited');
  assert(!canReplaceWorkout({ workout, logs: siblingLogs }).ok, 'destructive wholesale replacement of a logged workout remains guarded');
  assert(canReplaceWorkout({ workout, logs: [] }).ok, 'unlogged workouts can still be replaced');
  assert(workoutHasPerformanceLogs(workout, siblingLogs), 'performance logs are detected for replace guards');

  assert(deriveSessionStatus({ workout, logs: {} }) === 'not_started', 'empty logs are not_started, not skipped');
  assert(deriveSessionStatus({ workout, logs: { psA: { completed: true, actual_reps: '8' } } }) === 'in_progress', 'partial logs are in_progress');
  assert(deriveSessionStatus({ workout, logs: {}, explicit: { status: 'skipped' } }) === 'skipped', 'skipped is explicit');
  assert(skippedIsNotFailed('skipped'), 'skipped does not equal failed performance');
  const skippedEx = deriveExerciseStatus({ plannedSets: workout.st_exercises[0].st_planned_sets, logs: {}, explicit: { status: 'skipped' } });
  assert(skippedEx.status === 'skipped' && skippedEx.attempt === 'did_not_perform', 'I did not do this');
  const failedEx = deriveExerciseStatus({
    plannedSets: workout.st_exercises[0].st_planned_sets,
    logs: { psA: { completed: true, actual_reps: '3' } },
    explicit: { attempt_outcome: 'could_not_complete' },
  });
  assert(failedEx.status === 'partial' && failedEx.attempt === 'could_not_complete', 'I tried and could not complete it');

  const extra = extraSetInsertPayload({
    exercise_id: 'exA',
    log_date: '2026-09-23',
    extra_set_number: nextExtraSetNumber([]),
    actual_reps: '8',
    actual_weight: '185',
    snapshot_exercise_name: 'Barbell Bench Press',
  });
  assert(extra.is_extra_set === true, 'extra sets are stored as is_extra_set');
  assert(extra.planned_set_id == null, 'extra set planned_set_id is null');
  assert(extra.exercise_id === 'exA', 'extra set has exercise_id');
  assert(extraSetsAreNotPlanned(extra), 'extra sets can be logged without becoming planned sets');
  assert(!countsTowardProgression(extra as any), 'extra sets are excluded from deterministic progression');
  const extraInHistory = extraLogsFromSetLogs([
    { planned_set_id: 'psA', completed: true, actual_reps: '8' },
    extra,
  ]);
  assert(extraInHistory.length === 1, 'extras are identifiable among st_set_logs');
  const history = buildExerciseSessionHistory(
    [
      {
        ...extra,
        log_date: '2026-09-23',
        completed: true,
        snapshot_day_label: 'Mon',
      },
    ],
    'strength',
    { matchDayLabel: false }
  );
  assert(history.length === 1 && history[0].sets.length === 1, 'extra sets appear in exercise history');
  assert(
    !extraSetsDoNotCompleteWorkout({
      plannedSetIds: ['psA', 'psB', 'psC'],
      logs: [{ ...extra, completed: true } as any],
    }),
    'extra sets do not satisfy planned workout completion by themselves'
  );
  assert(
    !isStrengthWorkoutCompleted(workout, { extra1: { planned_set_id: undefined, completed: true, is_extra_set: true } as any }),
    'completion map ignores extras without planned_set_id'
  );

  assert(weekStatusForNewWorkout(1) === 'activated', 'week 1 new insert is activated');
  assert(weekStatusForNewWorkout(3) === 'template', 'new future copied weeks are templates');
  assert(backfillWeekStatus({ week: 2, hasPerformance: true, fullyCompleted: true }) === 'completed', 'completed historical week becomes completed');
  assert(backfillWeekStatus({ week: 2, hasPerformance: true, fullyCompleted: false }) === 'in_progress', 'partially trained week becomes in_progress');
  assert(backfillWeekStatus({ week: 2, hasPerformance: false, currentProgramWeek: 3 }) === 'activated', 'trained-calendar week 2 without leftover template if it is current/elapsed');
  assert(backfillWeekStatus({ week: 2, hasPerformance: true, currentProgramWeek: 1 }) === 'in_progress', 'trained week 2 does not become template');
  assert(backfillWeekStatus({ week: 4, hasPerformance: false, currentProgramWeek: 1 }) === 'template', 'untouched future week becomes template');
  assert(backfillWeekStatus({ week: 3, hasPerformance: false, currentProgramWeek: null }) === 'activated', 'ambiguous old week remains activated');
  assert(backfillWeekStatus({ week: 3, existing: 'activated' }) === 'activated', 'explicit historical status is preserved');
  assert(backfillWeekStatus({ week: 1, existing: 'completed' }) === 'completed', 'existing completed week 1 stays completed');

  assert(normalizePainFlag('') === null, 'unanswered pain is null');
  assert(normalizePainFlag(undefined) === null, 'missing pain is null');
  assert(normalizePainFlag('none') === 'none', 'explicit no pain is none');

  const custom = {
    id: 'custom-1',
    name: 'User Curl',
    user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    is_system: false,
    is_archived: false,
  };
  assert(!isAiGenerationEligibleRow(custom), 'custom exercises remain excluded from AI generation');
  assert(userCustomCatalogItems([custom], custom.user_id).length === 1, 'custom exercises remain visible to their owner');

  const masters = Array.from({ length: 260 }, (_, i) => masterRow(String(i + 1), `Master ${i + 1}`));
  const live = [...masters, custom];
  assert(selectAiGenerationCatalogRows(live).length === 260, '260-card AI generation policy remains unchanged');
  assert(adaptGenerationCatalog(live, { allowFallback: false }).length === 260, 'adapted generation catalog stays 260');

  const missingRir = reportedRirOrUnknown('');
  assert(missingRir === null, 'missing RIR is never interpreted as 2');
  const firstUnknown = progressionConfidence({
    repMax: 10,
    targetRir: 2,
    workingSets: [
      { reps: 10, rir: null },
      { reps: 10, rir: null },
      { reps: 10, rir: null },
    ],
    consecutiveTopRangeMissingRir: 1,
  });
  assert(!firstUnknown.loadEligible && firstUnknown.reasonCode === 'HOLD_UNKNOWN_RIR_ONCE', 'first missing-RIR top-range exposure holds');
  const secondUnknown = progressionConfidence({
    repMax: 10,
    targetRir: 2,
    workingSets: [
      { reps: 10, rir: null },
      { reps: 10, rir: null },
      { reps: 10, rir: null },
    ],
    consecutiveTopRangeMissingRir: 2,
  });
  assert(secondUnknown.loadEligible && secondUnknown.confidence === 'performance_only', 'two comparable missing-RIR exposures can progress');
  const high = progressionConfidence({
    repMax: 10,
    targetRir: 2,
    workingSets: [
      { reps: 10, rir: 2 },
      { reps: 10, rir: 2 },
      { reps: 10, rir: 2 },
    ],
  });
  assert(high.confidence === 'high' && high.loadEligible, 'compatible RIR is high-confidence load progression');

  const userInc = resolveLoadIncrement({ equipment: 'Barbell', userIncrement: 2.5, units: 'lb' });
  assert(userInc.source === 'user' && userInc.increment === 2.5, 'user increment overrides defaults');
  const gymInc = resolveLoadIncrement({ equipment: 'Barbell', gymIncrement: 10, units: 'lb' });
  assert(gymInc.source === 'gym', 'gym increment overrides equipment default');
  const barbell = resolveLoadIncrement({ equipment: 'Barbell', movementPattern: 'horizontal_push', units: 'lb' });
  assert(barbell.source === 'equipment_default' && barbell.increment === 5, 'equipment-aware default is 5 lb for barbell');
  const bodyweight = resolveLoadIncrement({ equipment: 'bodyweight' });
  assert(bodyweight.increment === 0, 'bodyweight default increment is 0');

  console.log('BIQ-0217 Phase 2A.1 data-foundation checks passed.');
}
