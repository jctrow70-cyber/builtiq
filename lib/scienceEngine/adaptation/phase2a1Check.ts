import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { scienceProgramToAiPlan } from '../toAiPlan';
import { adaptGenerationCatalog, isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../generation/catalogEligibility';
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { MASTER_CATALOG_SOURCE } from '../../training/masterCatalog';
import { userCustomCatalogItems } from '../../training/catalogSearch';
import { prescriptionColumnsFromSources } from '../../training/prescriptionMeta';
import { snapshotForLog, plannedRepRangeFromLog } from '../../training/setLogSnapshots';
import { canMutatePlannedSets, workoutHasPerformanceLogs } from '../../training/plannedSetGuard';
import { deriveSessionStatus, skippedIsNotFailed } from '../../training/sessionOutcome';
import { deriveExerciseStatus } from '../../training/exerciseOutcome';
import { extraSetInsertPayload, extraSetsAreNotPlanned, nextExtraSetNumber } from '../../training/extraSets';
import { backfillWeekStatus, weekStatusForNewWorkout } from './weekStatus';
import { progressionConfidence, reportedRirOrUnknown } from './confidence';
import { resolveLoadIncrement } from './increments';

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
        section: 'strength',
        st_planned_sets: [
          { id: 'ps1', set_type: 'working' },
          { id: 'ps2', set_type: 'working' },
        ],
      },
    ],
  };
  assert(deriveSessionStatus({ workout, logs: {} }) === 'not_started', 'empty logs are not_started, not skipped');
  assert(deriveSessionStatus({ workout, logs: { ps1: { completed: true, actual_reps: '8' } } }) === 'in_progress', 'partial logs are in_progress');
  assert(
    deriveSessionStatus({ workout, logs: { ps1: { completed: true }, ps2: { completed: true } } }) === 'completed',
    'all planned sets completed'
  );
  assert(deriveSessionStatus({ workout, logs: {}, explicit: { status: 'skipped' } }) === 'skipped', 'skipped is explicit');
  assert(skippedIsNotFailed('skipped'), 'skipped does not equal failed performance');
  const skippedEx = deriveExerciseStatus({ plannedSets: workout.st_exercises[0].st_planned_sets, logs: {}, explicit: { status: 'skipped' } });
  assert(skippedEx.status === 'skipped' && skippedEx.attempt === 'did_not_perform', 'I did not do this');
  const failedEx = deriveExerciseStatus({
    plannedSets: workout.st_exercises[0].st_planned_sets,
    logs: { ps1: { completed: true, actual_reps: '3' } },
    explicit: { attempt_outcome: 'could_not_complete' },
  });
  assert(failedEx.status === 'partial' && failedEx.attempt === 'could_not_complete', 'I tried and could not complete it');

  const extra = extraSetInsertPayload({
    exercise_id: 'ex1',
    log_date: '2026-09-23',
    extra_set_number: nextExtraSetNumber([]),
    actual_reps: '8',
    actual_weight: '185',
  });
  assert(extraSetsAreNotPlanned(extra as any), 'extra sets can be logged without becoming planned sets');
  assert(!extra.planned_set_id, 'extra set payload has no planned_set_id');

  const logs = [{ planned_set_id: 'ps1', completed: true, actual_reps: '8' }];
  const guard = canMutatePlannedSets({ workout, logs });
  assert(!guard.ok, 'workouts with logs are protected by the future-adaptation guard');
  assert(workoutHasPerformanceLogs(workout, logs), 'performance logs are detected');
  assert(canMutatePlannedSets({ workout, logs: [] }).ok, 'unlogged workouts can still edit prescriptions');

  assert(weekStatusForNewWorkout(1) === 'activated', 'week 1 is activated');
  assert(weekStatusForNewWorkout(3) === 'template', 'copied later weeks are templates');
  assert(backfillWeekStatus(3, 'activated') === 'activated', 'week status does not alter historical weeks');
  assert(backfillWeekStatus(1, 'completed') === 'completed', 'existing completed week 1 stays completed');

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
