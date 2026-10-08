import { expectationFactsFromSchedule, progressAdherence } from './adherence';
import { buildProgressReport, type ProgressReport } from './report';
import { comparableWindows, rangeBounds, type ProgressRange } from './ranges';
import { setFactFromRow, type ProgressSetFact } from './setFacts';
import { seriesKey } from './identity';

export const PROGRESS_SET_FACT_COLUMNS = [
  'id',
  'log_date',
  'completed',
  'actual_weight',
  'actual_reps',
  'actual_rpe',
  'actual_rir',
  'snapshot_set_type',
  'snapshot_exercise_type',
  'snapshot_exercise_name',
  'snapshot_catalog_exercise_id',
  'snapshot_equipment',
  'snapshot_variant',
  'snapshot_movement_pattern',
  'snapshot_muscle_credits',
  'snapshot_muscle_group',
  'snapshot_program_role',
  'snapshot_provenance',
].join(',');

const PAGE_SIZE = 1000;

type QueryClient = {
  from: (table: string) => any;
};

/**
 * Landing data is aggregated in buildProgressReport.
 * Callers receive the report, not the raw set history.
 * Drill into one series with fetchSeriesFacts.
 */
export async function loadProgressReport(
  client: QueryClient,
  userId: string,
  range: ProgressRange,
  today: string
): Promise<ProgressReport> {
  const provisional = rangeBounds(range, today, null);
  const windows = comparableWindows(provisional);
  const fetchFrom = range === 'All' ? '1970-01-01' : windows.baseline.from < provisional.from ? windows.baseline.from : provisional.from;
  const spanFrom = range === 'All' ? '1970-01-01' : provisional.from;
  const [setRows, meals, goals, measurements, expectations, sessions] = await Promise.all([
    fetchPaged(client, 'st_set_logs', PROGRESS_SET_FACT_COLUMNS, userId, 'log_date', fetchFrom, today),
    fetchPaged(client, 'st_meal_entries', 'log_date,calories,protein_g,carbs_g,fat_g', userId, 'log_date', spanFrom, today),
    client.from('st_nutrition_goals').select('calories_target,protein_g_target,carbs_g_target,fat_g_target').eq('user_id', userId).maybeSingle(),
    fetchPaged(client, 'st_body_measurements', 'id,user_id,measured_on,weight_lbs,waist_inches,chest_inches,arm_inches,thigh_inches,hip_inches,neck_inches,body_fat_percent,measurement_extras,notes', userId, 'measured_on', spanFrom, today),
    fetchExpectations(client, userId, spanFrom, today),
    fetchSessions(client, userId, spanFrom, today),
  ]);

  const facts = setRows.map(setFactFromRow);
  const earliest = facts.map((fact) => fact.logDate).sort()[0] || null;
  const view = rangeBounds(range, today, earliest);
  const neededFrom = comparableWindows(view).baseline.from;
  const extraFacts =
    range === 'All'
      ? []
      : neededFrom < fetchFrom
        ? (await fetchPaged(client, 'st_set_logs', PROGRESS_SET_FACT_COLUMNS, userId, 'log_date', neededFrom, addDayBefore(fetchFrom))).map(setFactFromRow)
        : [];

  return buildProgressReport({
    range,
    today,
    facts: extraFacts.concat(facts),
    mealEntries: meals,
    nutritionTargets: goals?.data
      ? {
          calories: numberOrNull(goals.data.calories_target),
          protein: numberOrNull(goals.data.protein_g_target),
          carbs: numberOrNull(goals.data.carbs_g_target),
          fat: numberOrNull(goals.data.fat_g_target),
        }
      : null,
    measurements,
    expectations: expectations.error ? null : expectationFactsFromSchedule(expectations.rows, sessions.rows),
  });
}

export async function fetchSeriesFacts(
  client: QueryClient,
  userId: string,
  identity: { catalogExerciseId?: string | null; exerciseName?: string | null; equipment?: string | null; variant?: string | null },
  from?: string | null,
  to?: string | null
): Promise<ProgressSetFact[]> {
  const rows = await fetchPaged(client, 'st_set_logs', PROGRESS_SET_FACT_COLUMNS, userId, 'log_date', from || '1970-01-01', to || '2999-12-31');
  const wanted = seriesKey({
    catalogExerciseId: identity.catalogExerciseId || null,
    exerciseName: identity.exerciseName || 'Exercise',
    equipmentKey: String(identity.equipment || '').trim().toLowerCase() || 'unspecified',
    equipmentLabel: identity.equipment || 'Unspecified',
    variant: identity.variant || null,
  });
  return rows.map(setFactFromRow).filter((fact) => seriesKey(fact.identity) === wanted);
}

async function fetchExpectations(client: QueryClient, userId: string, from: string, to: string) {
  const result = await client
    .from('st_training_expectations')
    .select('id,source_key,team_id,workout_id,scheduled_date,excused,origin')
    .eq('user_id', userId)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);
  if (result.error) return { error: result.error, rows: [] };
  return { error: null, rows: result.data || [] };
}

async function fetchSessions(client: QueryClient, userId: string, from: string, to: string) {
  const result = await client
    .from('st_workout_sessions')
    .select('expectation_id,workout_id,log_date,status')
    .eq('user_id', userId)
    .gte('log_date', from)
    .lte('log_date', to);
  if (result.error) return { error: result.error, rows: [] };
  return { error: null, rows: result.data || [] };
}

/** Drop a select column only when the database error names that column. */
export function columnsWithoutMissing(columns: string, message: string): string | null {
  const parts = columns.split(',').map((column) => column.trim()).filter(Boolean);
  const missing = parts.filter((column) => new RegExp(`\\b${column}\\b`, 'i').test(message));
  if (!missing.length) return null;
  const next = parts.filter((column) => !missing.includes(column));
  if (!next.length || next.length === parts.length) return null;
  return next.join(',');
}

async function fetchPaged(
  client: QueryClient,
  table: string,
  columns: string,
  userId: string,
  dateColumn: string,
  from: string,
  to: string
): Promise<any[]> {
  return fetchPagedAttempt(client, table, columns, userId, dateColumn, from, to, 0);
}

async function fetchPagedAttempt(
  client: QueryClient,
  table: string,
  columns: string,
  userId: string,
  dateColumn: string,
  from: string,
  to: string,
  attempt: number
): Promise<any[]> {
  try {
    return await fetchPagedOnce(client, table, columns, userId, dateColumn, from, to);
  } catch (error) {
    const message = errorText(error);
    const next = attempt < 8 ? columnsWithoutMissing(columns, message) : null;
    if (!next) throw error;
    return fetchPagedAttempt(client, table, next, userId, dateColumn, from, to, attempt + 1);
  }
}

async function fetchPagedOnce(
  client: QueryClient,
  table: string,
  columns: string,
  userId: string,
  dateColumn: string,
  from: string,
  to: string
): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq('user_id', userId)
      .gte(dateColumn, from)
      .lte(dateColumn, to)
      .order(dateColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error || '');
  const row = error as { message?: string; details?: string; hint?: string };
  return [row.message, row.details, row.hint].filter(Boolean).join(' ');
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function addDayBefore(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() - 1);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export { progressAdherence };
