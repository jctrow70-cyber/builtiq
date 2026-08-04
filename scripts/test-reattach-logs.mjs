/**
 * Smoke test for rematch scoring (no build tooling required).
 * Run: node scripts/test-reattach-logs.mjs
 */

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function mondayOfWeek(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function weekForDate(startDate, dateYmd, totalWeeks = 6) {
  const anchor = mondayOfWeek(startDate);
  const from = new Date(anchor);
  const to = new Date(dateYmd);
  const diffDays = Math.floor((to - from) / 86400000);
  if (diffDays < 0) return 1;
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(1, week), totalWeeks);
}

function dayLabelFromYmd(ymd) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ymd + 'T12:00:00').getDay()];
}

function score(log, target, program) {
  const setNumber = Number(log.snapshot_set_number ?? 1) || 1;
  if (setNumber !== target.setNumber) return -1;
  const logCatalog = log.snapshot_catalog_exercise_id || null;
  const logName = normName(log.snapshot_exercise_name);
  const targetName = normName(target.exerciseName);
  const exOk =
    (logCatalog && target.catalogId && logCatalog === target.catalogId) ||
    (logName && targetName && logName === targetName);
  if (!exOk) return -1;
  let s = 10;
  const logDate = String(log.log_date || '').slice(0, 10);
  if (logDate) {
    const weekOnDate = weekForDate(program.start_date, logDate, program.weeks || 6);
    const dayOnDate = dayLabelFromYmd(logDate);
    if (target.week === weekOnDate && normName(target.dayLabel) === normName(dayOnDate)) s += 40;
  }
  if (log.snapshot_week != null && Number(log.snapshot_week) === target.week) s += 12;
  if (log.snapshot_day_label && normName(log.snapshot_day_label) === normName(target.dayLabel)) s += 8;
  return s;
}

const program = {
  start_date: '2026-06-30',
  weeks: 6,
  st_workouts: [
    {
      id: 'w1',
      week: 1,
      day_label: 'Mon',
      day_order: 1,
      st_exercises: [
        {
          id: 'e1',
          name: 'Back Squat',
          catalog_exercise_id: 'c1',
          st_planned_sets: [
            { id: 'ps1', set_number: 1 },
            { id: 'ps2', set_number: 2 },
          ],
        },
      ],
    },
  ],
};

const targets = [
  {
    plannedSetId: 'ps1',
    week: 1,
    dayLabel: 'Mon',
    exerciseName: 'Back Squat',
    catalogId: 'c1',
    setNumber: 1,
  },
  {
    plannedSetId: 'ps2',
    week: 1,
    dayLabel: 'Mon',
    exerciseName: 'Back Squat',
    catalogId: 'c1',
    setNumber: 2,
  },
];

const log = {
  log_date: '2026-06-30',
  snapshot_exercise_name: 'Back Squat',
  snapshot_catalog_exercise_id: 'c1',
  snapshot_set_number: 1,
  snapshot_week: 1,
  snapshot_day_label: 'Mon',
};

const s = score(log, targets[0], program);
if (s < 18) {
  console.error('FAIL: expected calendar rematch score >= 18, got', s);
  process.exit(1);
}
const s2 = score(log, targets[1], program);
if (s2 >= 0) {
  console.error('FAIL: set 1 log should not match set 2 target, got', s2);
  process.exit(1);
}
console.log('OK rematch smoke score=', s);
