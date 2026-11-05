/**
 * BIQ-0308: Historical set-log projection and completion recognition.
 * Run: npx tsx scripts/test-historical-log-projection.ts
 */
import assert from 'node:assert/strict';
import {
  decorateDayPlanCompletion,
  isStrengthWorkoutCompleted,
  logMapForDate,
} from '../lib/programDesign/activityCompletion';
import type { TrainingDayPlan } from '../lib/programDesign/trainingSchedule';
import {
  HISTORICAL_PROJECTION_MIN_SCORE,
  projectDateLogsOntoWorkout,
  projectedLogMapForWorkoutDate,
} from '../lib/training/historicalLogProjection';
import { mapDateLogsToProgram, scoreLogTargetMatch } from '../lib/training/reattachLogs';
import { deriveSessionStatus } from '../lib/training/sessionOutcome';
import { summarizeWorkoutHistory } from '../lib/training/workoutHistory';
import { isCountedWorkingSet, setFactFromRow } from '../lib/progress/setFacts';
import { plannedSetIdsForWorkout } from '../lib/programDesign/activityCompletion';

function workoutTemplate(ids: {
  workoutId: string;
  week?: number;
  dayLabel?: string;
  exercises: Array<{
    id: string;
    name: string;
    catalogId: string;
    sets: Array<{ id: string; setNumber: number; setType?: string }>;
  }>;
}) {
  return {
    id: ids.workoutId,
    week: ids.week ?? 1,
    day_label: ids.dayLabel ?? 'Mon',
    day_order: 1,
    st_exercises: ids.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      catalog_exercise_id: ex.catalogId,
      section: 'strength',
      st_planned_sets: ex.sets.map((s) => ({
        id: s.id,
        set_number: s.setNumber,
        set_type: s.setType || 'working',
        is_deleted: false,
      })),
    })),
  };
}

const currentMon = workoutTemplate({
  workoutId: 'w-current-mon',
  exercises: [
    {
      id: 'e-row',
      name: 'Chest-Supported Row',
      catalogId: 'cat-row',
      sets: [
        { id: 'ps-row-1', setNumber: 1, setType: 'warmup' },
        { id: 'ps-row-2', setNumber: 2 },
        { id: 'ps-row-3', setNumber: 3 },
      ],
    },
    {
      id: 'e-bench',
      name: 'Bench Press',
      catalogId: 'cat-bench',
      sets: [
        { id: 'ps-bench-1', setNumber: 1, setType: 'warmup' },
        { id: 'ps-bench-2', setNumber: 2 },
      ],
    },
  ],
});

const program = {
  id: 'prog-personal-copy',
  start_date: '2026-10-27',
  weeks: 6,
  st_workouts: [currentMon],
};

/** November 2-style orphaned planned_set_ids (logged on prior template). */
const nov2OrphanLogs = [
  {
    id: 'log-row-1',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-row-1',
    completed: true,
    actual_weight: '102',
    actual_reps: '8',
    snapshot_exercise_name: 'Chest-Supported Row',
    snapshot_catalog_exercise_id: 'cat-row',
    snapshot_set_number: 1,
    snapshot_set_type: 'warmup',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
  {
    id: 'log-row-2',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-row-2',
    completed: true,
    actual_weight: '162',
    actual_reps: '10',
    snapshot_exercise_name: 'Chest-Supported Row',
    snapshot_catalog_exercise_id: 'cat-row',
    snapshot_set_number: 2,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
  {
    id: 'log-row-3',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-row-3',
    completed: true,
    actual_weight: '192',
    actual_reps: '10',
    snapshot_exercise_name: 'Chest-Supported Row',
    snapshot_catalog_exercise_id: 'cat-row',
    snapshot_set_number: 3,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
  {
    id: 'log-bench-1',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-bench-1',
    completed: true,
    actual_weight: '95',
    actual_reps: '10',
    snapshot_exercise_name: 'Bench Press',
    snapshot_catalog_exercise_id: 'cat-bench',
    snapshot_set_number: 1,
    snapshot_set_type: 'warmup',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
  {
    id: 'log-bench-2',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-bench-2',
    completed: true,
    actual_weight: '155',
    actual_reps: '8',
    snapshot_exercise_name: 'Bench Press',
    snapshot_catalog_exercise_id: 'cat-bench',
    snapshot_set_number: 2,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
];

// --- Exclusion path reproduction (pre-fix behavior): exact ID map misses orphans ---
const exactOnly: Record<string, any> = {};
nov2OrphanLogs.forEach((log) => {
  if (['ps-row-1', 'ps-row-2', 'ps-row-3', 'ps-bench-1', 'ps-bench-2'].includes(String(log.planned_set_id))) {
    exactOnly[String(log.planned_set_id)] = log;
  }
});
assert.equal(Object.keys(exactOnly).length, 0, 'orphaned Nov 2 IDs must not exact-match current planned sets');
assert.equal(
  deriveSessionStatus({ workout: currentMon, logs: exactOnly }),
  'not_started',
  'exact-ID-only path excludes Nov 2 (root cause reproduction)'
);

// --- Soft score threshold ---
const sampleScore = scoreLogTargetMatch(
  nov2OrphanLogs[1],
  {
    plannedSetId: 'ps-row-2',
    workoutId: 'w-current-mon',
    week: 1,
    dayOrder: 1,
    dayLabel: 'Mon',
    exerciseId: 'e-row',
    exerciseName: 'Chest-Supported Row',
    catalogId: 'cat-row',
    setNumber: 2,
    setType: 'working',
  },
  program
);
assert.ok(sampleScore >= HISTORICAL_PROJECTION_MIN_SCORE, `expected strong score, got ${sampleScore}`);

// --- Project orphans onto personal-copy IDs ---
const projected = projectDateLogsOntoWorkout(nov2OrphanLogs, program, currentMon, {
  logDate: '2026-11-02',
});
assert.equal(projected.exactCount, 0);
assert.ok(projected.appliedSoftProjection);
assert.equal(projected.byPlannedSetId['ps-row-2']?.actual_weight, '162');
assert.equal(projected.byPlannedSetId['ps-bench-2']?.actual_weight, '155');
assert.equal(
  deriveSessionStatus({ workout: currentMon, logs: projected.byPlannedSetId }),
  'completed',
  'projected Nov 2 logs satisfy completion rules'
);
assert.equal(mapDateLogsToProgram(nov2OrphanLogs, program, currentMon)['ps-row-1']?.id, 'log-row-1');

// --- Normally linked Tue/Wed-style IDs still win exactly ---
const linkedLogs = [
  {
    id: 'tue-1',
    log_date: '2026-11-03',
    planned_set_id: 'ps-row-2',
    completed: true,
    actual_weight: '100',
    actual_reps: '8',
    snapshot_exercise_name: 'Chest-Supported Row',
    snapshot_catalog_exercise_id: 'cat-row',
    snapshot_set_number: 2,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Tue',
    snapshot_week: 1,
  },
];
const linked = projectDateLogsOntoWorkout(linkedLogs, program, currentMon, { logDate: '2026-11-03' });
assert.equal(linked.exactCount, 1);
assert.equal(linked.projectedCount, 0);
assert.equal(linked.byPlannedSetId['ps-row-2']?.id, 'tue-1');

// --- Substantially different program: do not paint coincidental name matches ---
const legsOnlyMon = workoutTemplate({
  workoutId: 'w-legs',
  exercises: [
    {
      id: 'e-squat',
      name: 'Front Squat',
      catalogId: 'cat-squat',
      sets: [
        { id: 'ps-squat-1', setNumber: 1 },
        { id: 'ps-squat-2', setNumber: 2 },
      ],
    },
    // Coincidental shared name should not pull orphan push logs onto this card alone
    {
      id: 'e-bench-new',
      name: 'Bench Press',
      catalogId: 'cat-bench',
      sets: [{ id: 'ps-bench-new-1', setNumber: 1, setType: 'warmup' }],
    },
  ],
});
const legsProgram = { ...program, id: 'prog-legs', st_workouts: [legsOnlyMon] };
const refused = projectDateLogsOntoWorkout(nov2OrphanLogs, legsProgram, legsOnlyMon, {
  logDate: '2026-11-02',
});
assert.equal(refused.appliedSoftProjection, false, 'low coverage must not project onto unrelated program');
assert.equal(Object.keys(refused.byPlannedSetId).length, 0);

// --- Duplicate exercise names: catalog identity wins; set slots stay distinct ---
const dupWorkout = workoutTemplate({
  workoutId: 'w-dup',
  exercises: [
    {
      id: 'e-a',
      name: 'Chest Fly',
      catalogId: 'cat-fly-a',
      sets: [{ id: 'ps-fly-a-1', setNumber: 1 }],
    },
    {
      id: 'e-b',
      name: 'Chest Fly',
      catalogId: 'cat-fly-b',
      sets: [{ id: 'ps-fly-b-1', setNumber: 1 }],
    },
  ],
});
const dupProgram = { ...program, st_workouts: [dupWorkout] };
const dupLogs = [
  {
    id: 'fly-b',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-fly',
    completed: true,
    actual_weight: '35',
    actual_reps: '12',
    snapshot_exercise_name: 'Chest Fly',
    snapshot_catalog_exercise_id: 'cat-fly-b',
    snapshot_set_number: 1,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
];
const dupProjected = projectDateLogsOntoWorkout(dupLogs, dupProgram, dupWorkout, {
  logDate: '2026-11-02',
});
assert.equal(dupProjected.byPlannedSetId['ps-fly-b-1']?.id, 'fly-b');
assert.equal(dupProjected.byPlannedSetId['ps-fly-a-1'], undefined);

// --- Multiple workouts same date: project only onto the requested workout ---
const secondWorkout = workoutTemplate({
  workoutId: 'w-current-mon-b',
  exercises: [
    {
      id: 'e-fly',
      name: 'Chest Fly',
      catalogId: 'cat-fly',
      sets: [{ id: 'ps-fly-1', setNumber: 1 }],
    },
  ],
});
const multiProgram = { ...program, st_workouts: [currentMon, secondWorkout] };
const multi = projectDateLogsOntoWorkout(nov2OrphanLogs, multiProgram, secondWorkout, {
  logDate: '2026-11-02',
});
assert.equal(Object.keys(multi.byPlannedSetId).length, 0, 'row/bench logs must not land on fly workout');

// --- Calendar non-selected date completion ---
const plan: TrainingDayPlan = {
  date: '2026-11-02',
  label: 'Mon',
  items: [
    {
      key: 'w-current-mon',
      title: 'Upper',
      typeLabel: 'Strength',
      activityType: 'strength',
      duration: '',
      workoutId: 'w-current-mon',
      activityId: null,
      isRest: false,
      source: 'program',
    },
  ],
  primary: null,
  later: [],
  isToday: false,
};
const decoratedPast = decorateDayPlanCompletion(plan, {
  activities: [],
  workouts: [currentMon],
  progressLogs: nov2OrphanLogs,
  sessionLogs: {},
  selectedDate: '2026-11-04',
  program,
});
assert.equal(decoratedPast.items[0].completed, true, 'non-selected calendar date must recognize projected logs');

const legacyMap = logMapForDate('2026-11-02', nov2OrphanLogs, {}, '2026-11-04');
assert.equal(isStrengthWorkoutCompleted(currentMon, legacyMap), false, 'legacy exact map still fails without program');

const projectedMap = projectedLogMapForWorkoutDate({
  dateYmd: '2026-11-02',
  dateLogs: nov2OrphanLogs,
  program,
  workout: currentMon,
  selectedDate: '2026-11-04',
});
assert.equal(isStrengthWorkoutCompleted(currentMon, projectedMap), true);

// --- Explicit session status wins over derived ---
assert.equal(
  deriveSessionStatus({
    workout: currentMon,
    logs: projected.byPlannedSetId,
    explicit: { status: 'partial' },
  }),
  'partial'
);
assert.equal(
  deriveSessionStatus({
    workout: currentMon,
    logs: projected.byPlannedSetId,
    explicit: { status: 'skipped' },
  }),
  'skipped'
);

// --- Partial completion: not all loggable sets done ---
const partialLogs = nov2OrphanLogs.slice(0, 2);
const partial = projectDateLogsOntoWorkout(partialLogs, program, currentMon, { logDate: '2026-11-02' });
assert.equal(deriveSessionStatus({ workout: currentMon, logs: partial.byPlannedSetId }), 'in_progress');
assert.equal(isStrengthWorkoutCompleted(currentMon, partial.byPlannedSetId), false);

// --- No double counting: one log occupies one planned set ---
const duplicateTargets = [
  ...nov2OrphanLogs,
  {
    ...nov2OrphanLogs[1],
    id: 'log-row-2-dup',
    actual_weight: '999',
  },
];
const once = projectDateLogsOntoWorkout(duplicateTargets, program, currentMon, { logDate: '2026-11-02' });
assert.equal(once.byPlannedSetId['ps-row-2']?.id, 'log-row-2');
assert.notEqual(once.byPlannedSetId['ps-row-2']?.actual_weight, '999');

// --- Exact + soft must not count the same saved log twice ---
const exactOwnedLog = {
  id: 'exact-owned',
  log_date: '2026-11-02',
  planned_set_id: 'ps-row-2',
  completed: true,
  actual_weight: '170',
  actual_reps: '8',
  snapshot_exercise_name: 'Chest-Supported Row',
  snapshot_catalog_exercise_id: 'cat-row',
  snapshot_set_number: 2,
  snapshot_set_type: 'working',
  snapshot_day_label: 'Mon',
  snapshot_week: 1,
};
const exactOwned = projectDateLogsOntoWorkout([exactOwnedLog], program, currentMon, {
  logDate: '2026-11-02',
});
assert.equal(exactOwned.exactCount, 1);
assert.equal(exactOwned.projectedCount, 0);
const exactOwnedIds = Object.values(exactOwned.byPlannedSetId).map((row) => row.id);
assert.equal(exactOwnedIds.filter((id) => id === 'exact-owned').length, 1);
assert.equal(exactOwned.byPlannedSetId['ps-row-3'], undefined);

// --- Completion denominator: required working sets on the workout, not matched-log count ---
const fiveSetMon = workoutTemplate({
  workoutId: 'w-five',
  exercises: [
    {
      id: 'e-row-five',
      name: 'Chest-Supported Row',
      catalogId: 'cat-row',
      sets: [
        { id: 'ps5-1', setNumber: 1 },
        { id: 'ps5-2', setNumber: 2 },
        { id: 'ps5-3', setNumber: 3 },
        { id: 'ps5-4', setNumber: 4 },
        { id: 'ps5-5', setNumber: 5 },
      ],
    },
  ],
});
const fiveProgram = { ...program, id: 'prog-five', st_workouts: [fiveSetMon] };
const twoOfFiveLogs = [
  {
    id: 'p5-1',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-p5-1',
    completed: true,
    actual_weight: '100',
    actual_reps: '8',
    snapshot_exercise_name: 'Chest-Supported Row',
    snapshot_catalog_exercise_id: 'cat-row',
    snapshot_set_number: 1,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
  {
    id: 'p5-2',
    log_date: '2026-11-02',
    planned_set_id: 'orphan-p5-2',
    completed: true,
    actual_weight: '120',
    actual_reps: '8',
    snapshot_exercise_name: 'Chest-Supported Row',
    snapshot_catalog_exercise_id: 'cat-row',
    snapshot_set_number: 2,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
  },
];
const twoOfFive = projectDateLogsOntoWorkout(twoOfFiveLogs, fiveProgram, fiveSetMon, {
  logDate: '2026-11-02',
});
assert.equal(twoOfFive.appliedSoftProjection, true);
assert.equal(Object.keys(twoOfFive.byPlannedSetId).length, 2);
assert.equal(plannedSetIdsForWorkout(fiveSetMon, { loggableOnly: true }).length, 5);
assert.equal(deriveSessionStatus({ workout: fiveSetMon, logs: twoOfFive.byPlannedSetId }), 'in_progress');
assert.equal(isStrengthWorkoutCompleted(fiveSetMon, twoOfFive.byPlannedSetId), false);

// --- 20 historical sets, <50% match current workout: keep history/progress, do not complete ---
const sparseMon = workoutTemplate({
  workoutId: 'w-sparse',
  exercises: [
    {
      id: 'e-sparse-bench',
      name: 'Bench Press',
      catalogId: 'cat-bench',
      sets: [
        { id: 'ps-sparse-1', setNumber: 1 },
        { id: 'ps-sparse-2', setNumber: 2 },
      ],
    },
  ],
});
const sparseProgram = { ...program, id: 'prog-sparse', st_workouts: [sparseMon] };
const twentyHistorical = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const isBenchMatch = n <= 2;
  return {
    id: `hist-${n}`,
    log_date: '2026-11-02',
    planned_set_id: `orphan-hist-${n}`,
    completed: true,
    actual_weight: String(50 + n),
    actual_reps: '8',
    snapshot_exercise_name: isBenchMatch ? 'Bench Press' : `Accessory Lift ${n}`,
    snapshot_catalog_exercise_id: isBenchMatch ? 'cat-bench' : `cat-acc-${n}`,
    snapshot_set_number: isBenchMatch ? n : 1,
    snapshot_set_type: 'working',
    snapshot_day_label: 'Mon',
    snapshot_week: 1,
    snapshot_workout_type: 'Upper',
  };
});
const sparseProjection = projectDateLogsOntoWorkout(twentyHistorical, sparseProgram, sparseMon, {
  logDate: '2026-11-02',
});
assert.ok(sparseProjection.coverage < 0.5, `expected coverage under 50%, got ${sparseProjection.coverage}`);
assert.equal(sparseProjection.appliedSoftProjection, false, 'threshold must block card projection');
assert.equal(Object.keys(sparseProjection.byPlannedSetId).length, 0);
assert.equal(deriveSessionStatus({ workout: sparseMon, logs: sparseProjection.byPlannedSetId }), 'not_started');
assert.equal(isStrengthWorkoutCompleted(sparseMon, sparseProjection.byPlannedSetId), false);

const progressFacts = twentyHistorical.map(setFactFromRow);
assert.equal(progressFacts.filter(isCountedWorkingSet).length, 20, 'all 20 sets remain in progress metrics');

const historySummaries = summarizeWorkoutHistory(twentyHistorical as any[]);
const nov2History = historySummaries.find((row) => row.date === '2026-11-02');
assert.ok(nov2History, 'November 2 remains visible in workout history');
assert.equal(nov2History?.workingSets, 20, 'history counts all original completed working sets');
assert.equal(nov2History?.source, 'set_log');

const sparseDecorated = decorateDayPlanCompletion(
  {
    date: '2026-11-02',
    label: 'Mon',
    items: [
      {
        key: 'w-sparse',
        title: 'Sparse',
        typeLabel: 'Strength',
        activityType: 'strength',
        duration: '',
        workoutId: 'w-sparse',
        activityId: null,
        isRest: false,
        source: 'program',
      },
    ],
    primary: null,
    later: [],
    isToday: false,
  },
  {
    activities: [],
    workouts: [sparseMon],
    progressLogs: twentyHistorical,
    sessionLogs: {},
    selectedDate: '2026-11-04',
    program: sparseProgram,
  }
);
assert.equal(sparseDecorated.items[0].completed, false, 'unrelated sparse workout must not mark complete');

console.log('OK: historical log projection checks passed');
