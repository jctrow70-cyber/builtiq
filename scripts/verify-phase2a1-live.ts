/**
 * Live-verify BIQ-0217 Phase 2A.1 after 052 has already been applied.
 * Does not reapply the migration. Does not start Phase 2A.2.
 * Cleans only disposable verification rows.
 */
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateProgram } from '../lib/scienceEngine/generateProgram';
import { trainingProfileFromSources } from '../lib/scienceEngine/profile';
import { scienceProgramToAiPlan } from '../lib/scienceEngine/toAiPlan';
import { adaptGenerationCatalog, selectAiGenerationCatalogRows } from '../lib/scienceEngine/generation/catalogEligibility';
import { persistAiProgramPlan } from '../lib/training/aiProgramPlan';
import { extraSetInsertPayload, extraSetsAreNotPlanned, countsTowardProgression } from '../lib/training/extraSets';
import { isStrengthWorkoutCompleted } from '../lib/programDesign/activityCompletion';
import { deriveSessionStatus } from '../lib/training/sessionOutcome';
import { upsertExerciseSession, upsertWorkoutFeel, upsertWorkoutSession, normalizePainFlag } from '../lib/training/workoutSessions';
import { snapshotForLog } from '../lib/training/setLogSnapshots';
import { SCIENCE_ENGINE_VERSION } from '../lib/scienceEngine/version';

const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/phase2a1-live-verify-report.json');
const MARKER = 'BIQ-0217-VERIFY';

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function writeReport(report: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
}

async function runSql(sql: string): Promise<{ ok: boolean; data?: unknown; error?: string; via?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const ref = url.replace(/^https:\/\//, '').split('.')[0];
  const tokens = [
    process.env.SUPABASE_ACCESS_TOKEN,
    process.env.SUPABASE_MANAGEMENT_TOKEN,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean) as string[];

  for (const token of tokens) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* raw */ }
    if (res.ok) return { ok: true, data: parsed, via: 'management_api' };
    if (res.status !== 401 && res.status !== 403) {
      return { ok: false, error: `management_api ${res.status}: ${text.slice(0, 500)}`, via: 'management_api' };
    }
  }
  return { ok: false, error: 'No Supabase Management API token accepted. Service-role cannot run DDL via PostgREST.' };
}

async function fetchAll(supabase: SupabaseClient, table: string, columns: string) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) return { rows, error: error.message };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return { rows, error: null as string | null };
}

async function probeSchema(admin: SupabaseClient) {
  const probes: Record<string, unknown> = {};
  const tries: Array<[string, string, string]> = [
    ['st_exercises', 'program_role,measurement_type,laterality', 'exercise_meta'],
    ['st_set_logs', 'snapshot_target_rir,snapshot_rep_min,snapshot_rep_max,snapshot_program_role,snapshot_rest_seconds,exercise_id,is_extra_set,extra_set_number', 'set_log_meta'],
    ['st_workouts', 'week_status', 'week_status'],
    ['st_workout_feedback', 'workout_feel,pain_flag,notes', 'feedback'],
    ['st_workout_sessions', 'id,status', 'sessions'],
    ['st_exercise_sessions', 'id,status,attempt_outcome', 'exercise_sessions'],
    ['st_adaptation_events', 'id,decision', 'ledger'],
  ];
  for (const [table, cols, key] of tries) {
    const { error } = await admin.from(table).select(cols).limit(1);
    probes[key] = error ? { ok: false, error: error.message } : { ok: true };
  }
  return probes;
}

function logHasPerformance(row: any) {
  return !!(
    row &&
    (row.completed === true ||
      String(row.actual_weight || '').trim() ||
      String(row.actual_reps || '').trim() ||
      String(row.actual_duration || '').trim() ||
      String(row.actual_distance || '').trim())
  );
}

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    phase_2a2: 'not_started',
    migration: {},
    schema: {},
    week_status: {},
    live: {},
    issues: [] as string[],
    operationally_verified: false,
  };
  const issues = report.issues as string[];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !serviceKey || !anonKey) throw new Error('Supabase URL/keys missing from .env.local');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const before = await probeSchema(admin);
  (report.schema as any).before = before;
  (report.migration as any).apply = {
    attempted: false,
    skipped: 'User already applied 052 in the SQL Editor. This script does not reapply it.',
  };

  const already = (before as any).exercise_meta?.ok && (before as any).set_log_meta?.ok && (before as any).week_status?.ok && (before as any).sessions?.ok && (before as any).exercise_sessions?.ok && (before as any).ledger?.ok && (before as any).feedback?.ok;
  if (!already) {
    writeReport(report);
    console.error(JSON.stringify({ status: 'blocked', reason: '052 objects are not visible via PostgREST yet', schema: before, report: REPORT }, null, 2));
    process.exit(2);
  }
  (report.migration as any).schema_visible = true;

  const inspect = await runSql(`
    select
      (select json_agg(t) from (select tablename from pg_tables where schemaname='public' and tablename in ('st_workout_sessions','st_exercise_sessions','st_adaptation_events','st_extra_set_logs') order by 1) t) as tables,
      (select json_agg(c) from (select table_name, column_name from information_schema.columns where table_schema='public' and (
        (table_name='st_exercises' and column_name in ('program_role','measurement_type','laterality'))
        or (table_name='st_set_logs' and column_name in ('snapshot_target_rir','snapshot_rep_min','snapshot_rep_max','snapshot_program_role','snapshot_rest_seconds','exercise_id','is_extra_set','extra_set_number'))
        or (table_name='st_workouts' and column_name='week_status')
        or (table_name='st_workout_feedback' and column_name in ('workout_feel','pain_flag','notes'))
      ) order by 1,2) c) as columns,
      (select json_agg(i) from (select indexname from pg_indexes where schemaname='public' and indexname in ('st_set_logs_extra_unique','st_set_logs_extra_exercise_idx','st_workout_sessions_user_date_idx','st_exercise_sessions_user_date_idx','st_adaptation_events_user_idx','st_adaptation_events_program_idx') order by 1) i) as indexes,
      (select json_agg(x) from (select conname, conrelid::regclass::text as table_name from pg_constraint where conname in (
        'st_exercises_program_role_check','st_exercises_measurement_type_check','st_exercises_laterality_check',
        'st_set_logs_extra_set_check','st_workouts_week_status_check','st_workout_feedback_feel_check','st_workout_feedback_pain_check',
        'st_workout_sessions_status_check','st_workout_sessions_unique','st_exercise_sessions_status_check','st_exercise_sessions_unique'
      ) order by 1) x) as constraints,
      (select json_agg(tr) from (select tgname, tgrelid::regclass::text as table_name from pg_trigger where not tgisinternal and tgname in ('st_planned_sets_logged_rewrite_guard','st_planned_sets_logged_guard') order by 1) tr) as triggers,
      (select json_agg(p) from (select polname, tablename from pg_policies where schemaname='public' and (
        tablename in ('st_workout_sessions','st_exercise_sessions','st_adaptation_events')
        or (tablename='st_set_logs' and polname='set_logs_insert')
      ) order by 1) p) as policies;
  `);
  (report.schema as any).inspect = inspect.ok ? inspect.data : { error: inspect.error };
  (report.schema as any).after_probe = await probeSchema(admin);

  const workouts = await fetchAll(admin, 'st_workouts', 'id, week, week_status, program_id');
  const statusCounts: Record<string, number> = {};
  const byWeek: Record<string, Record<string, number>> = {};
  for (const w of workouts.rows) {
    const status = w.week_status == null || w.week_status === '' ? 'null' : String(w.week_status);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const week = String(w.week ?? 'null');
    byWeek[week] = byWeek[week] || {};
    byWeek[week][status] = (byWeek[week][status] || 0) + 1;
  }
  (report.week_status as any).counts = statusCounts;
  (report.week_status as any).by_week = byWeek;
  (report.week_status as any).total = workouts.rows.length;
  if (workouts.error) issues.push(`workout fetch: ${workouts.error}`);

  const planned = await fetchAll(admin, 'st_planned_sets', 'id, exercise_id');
  const exercises = await fetchAll(admin, 'st_exercises', 'id, workout_id, section');
  const logs = await fetchAll(admin, 'st_set_logs', 'id, planned_set_id, exercise_id, completed, actual_weight, actual_reps, actual_duration, actual_distance, is_extra_set');
  const exById = new Map(exercises.rows.map((e) => [e.id, e]));
  const plannedById = new Map(planned.rows.map((p) => [p.id, p]));
  const workoutPerf = new Map<string, { planned: boolean; extra: boolean; completedSets: Set<string>; loggable: Set<string> }>();
  for (const w of workouts.rows) {
    workoutPerf.set(w.id, { planned: false, extra: false, completedSets: new Set(), loggable: new Set() });
  }
  for (const ps of planned.rows) {
    const ex = exById.get(ps.exercise_id);
    if (!ex) continue;
    const bucket = workoutPerf.get(ex.workout_id);
    if (!bucket) continue;
    if (String(ex.section || 'strength') !== 'warmup') bucket.loggable.add(ps.id);
  }
  for (const log of logs.rows) {
    if (!logHasPerformance(log)) continue;
    if (log.is_extra_set) {
      const ex = exById.get(log.exercise_id);
      if (ex && workoutPerf.has(ex.workout_id)) workoutPerf.get(ex.workout_id)!.extra = true;
      continue;
    }
    const ps = plannedById.get(log.planned_set_id);
    const ex = ps ? exById.get(ps.exercise_id) : null;
    if (!ex) continue;
    const bucket = workoutPerf.get(ex.workout_id);
    if (!bucket) continue;
    bucket.planned = true;
    if (log.completed) bucket.completedSets.add(log.planned_set_id);
  }
  const anomalies: any[] = [];
  for (const w of workouts.rows) {
    const ev = workoutPerf.get(w.id)!;
    const hasPerf = ev.planned || ev.extra;
    const fully = ev.loggable.size > 0 && [...ev.loggable].every((id) => ev.completedSets.has(id));
    if (w.week_status === 'template' && hasPerf) anomalies.push({ id: w.id, week: w.week, status: w.week_status, issue: 'template_with_performance' });
    if (w.week_status === 'completed' && !hasPerf) anomalies.push({ id: w.id, week: w.week, status: w.week_status, issue: 'completed_without_performance' });
    if (w.week_status === 'in_progress' && !hasPerf) anomalies.push({ id: w.id, week: w.week, status: w.week_status, issue: 'in_progress_without_performance' });
    if (w.week_status === 'completed' && Number(w.week) > 8 && !hasPerf) anomalies.push({ id: w.id, week: w.week, status: w.week_status, issue: 'future_completed_suspicious' });
    if (w.week_status === 'template' && fully) anomalies.push({ id: w.id, week: w.week, status: w.week_status, issue: 'historical_trained_marked_template' });
  }
  (report.week_status as any).anomalies = anomalies;
  (report.week_status as any).anomaly_counts = anomalies.reduce((acc: Record<string, number>, row) => {
    acc[row.issue] = (acc[row.issue] || 0) + 1;
    return acc;
  }, {});

  const catalog = await fetchAll(admin, 'st_exercise_catalog', '*');
  if (catalog.error) throw new Error(catalog.error);
  const eligible = selectAiGenerationCatalogRows(catalog.rows);
  const adapted = adaptGenerationCatalog(catalog.rows, { allowFallback: false });
  (report.live as any).catalog = {
    total: catalog.rows.length,
    eligible: eligible.length,
    adapted: adapted.length,
    policy_260: eligible.length === 260 && adapted.length === 260,
  };
  if (eligible.length !== 260) issues.push(`AI eligible catalog is ${eligible.length}, expected 260`);

  const stamp = Date.now();
  const emailA = `biq0217.verify.${stamp}@builtiq.test`;
  const emailB = `biq0217.other.${stamp}@builtiq.test`;
  const password = `Biq0217!${stamp}`;
  const createdA = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  const createdB = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  if (createdA.error || !createdA.data.user) throw new Error(createdA.error?.message || 'create user A failed');
  if (createdB.error || !createdB.data.user) throw new Error(createdB.error?.message || 'create user B failed');
  const userA = createdA.data.user.id;
  const userB = createdB.data.user.id;

  const clientA = createClient(url, anonKey, { auth: { persistSession: false } });
  const clientB = createClient(url, anonKey, { auth: { persistSession: false } });
  const signA = await clientA.auth.signInWithPassword({ email: emailA, password });
  const signB = await clientB.auth.signInWithPassword({ email: emailB, password });
  if (signA.error) throw new Error(`sign in A: ${signA.error.message}`);
  if (signB.error) throw new Error(`sign in B: ${signB.error.message}`);

  let programId: string | null = null;
  try {
    const profile = trainingProfileFromSources({
      profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
      trainingProfile: { preferred_session_minutes: 60 },
      config: { days: ['Mon', 'Wed', 'Fri'], dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' }, weeks: 2, sessionMinutes: 60 },
    });
    const science = generateProgram(profile, adapted);
    const plan = scienceProgramToAiPlan(science, { programName: `${MARKER} ${stamp}`, weeks: 2 });
    const persist = await persistAiProgramPlan(
      clientA,
      userA,
      plan,
      {
        prompt: MARKER,
        weeks: 2,
        days: ['Mon', 'Wed', 'Fri'],
        dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
        programName: `${MARKER} ${stamp}`,
        mode: 'personal',
        generationMethod: 'science',
        scienceVersion: SCIENCE_ENGINE_VERSION,
      },
      catalog.rows
    );
    programId = persist.programId;
    (report.live as any).persist = { programId, error: persist.error };
    if (!programId) throw new Error(persist.error || 'persist failed');

    const { data: exercisesLive, error: exErr } = await clientA
      .from('st_exercises')
      .select('id, name, program_role, measurement_type, laterality, workout_id, section, st_planned_sets(id, target_reps, target_rir, rep_min, rep_max, rest_seconds, set_type, set_number, is_deleted)')
      .in('workout_id', (
        await clientA.from('st_workouts').select('id, week, week_status').eq('program_id', programId)
      ).data?.map((w: any) => w.id) || []);
    if (exErr) throw new Error(exErr.message);
    const withMeta = (exercisesLive || []).filter((e) => e.program_role || e.measurement_type || e.laterality);
    (report.live as any).prescription = {
      exercise_count: (exercisesLive || []).length,
      with_any_meta: withMeta.length,
      sample: (exercisesLive || []).slice(0, 6).map((e) => ({
        name: e.name,
        program_role: e.program_role,
        measurement_type: e.measurement_type,
        laterality: e.laterality,
      })),
    };
    if (!withMeta.length) issues.push('Persisted exercises have null program_role/measurement_type/laterality');

    const { data: workoutsLive } = await clientA.from('st_workouts').select('id, week, week_status, day_label, workout_type').eq('program_id', programId).order('week').order('day_order');
    const week1 = (workoutsLive || []).find((w) => Number(w.week) === 1);
    if (!week1) throw new Error('week 1 workout missing');
    const week1Exercises = (exercisesLive || []).filter((e) => e.workout_id === week1.id && e.section === 'strength');
    const targetEx = week1Exercises[0];
    const plannedSets = ((targetEx as any)?.st_planned_sets || []).filter((s: any) => !s.is_deleted && s.set_type !== 'warmup');
    const setA = plannedSets[0];
    const setB = plannedSets[1] || plannedSets[0];
    if (!setA) throw new Error('no planned working set to log');

    const today = new Date().toISOString().slice(0, 10);
    const snap = snapshotForLog(targetEx, setA, week1);
    const logPayload = {
      planned_set_id: setA.id,
      user_id: userA,
      log_date: today,
      completed: true,
      actual_weight: '185',
      actual_reps: String(setA.rep_max || setA.target_reps || '8'),
      exercise_id: targetEx.id,
      is_extra_set: false,
      ...snap,
    };
    const logged = await clientA.from('st_set_logs').upsert(logPayload, { onConflict: 'planned_set_id,user_id,log_date' }).select().single();
    if (logged.error) throw new Error(`log planned set: ${logged.error.message}`);
    const { data: plannedAfter } = await clientA.from('st_planned_sets').select('*').eq('id', setA.id).single();
    (report.live as any).snapshot = {
      log: {
        planned_set_id: logged.data.planned_set_id,
        exercise_id: logged.data.exercise_id,
        snapshot_target_rir: logged.data.snapshot_target_rir,
        snapshot_rep_min: logged.data.snapshot_rep_min,
        snapshot_rep_max: logged.data.snapshot_rep_max,
        snapshot_program_role: logged.data.snapshot_program_role,
        snapshot_rest_seconds: logged.data.snapshot_rest_seconds,
        actual_weight: logged.data.actual_weight,
        actual_reps: logged.data.actual_reps,
        is_extra_set: logged.data.is_extra_set,
      },
      planned_unchanged:
        plannedAfter?.target_rir === setA.target_rir &&
        plannedAfter?.rep_min === setA.rep_min &&
        plannedAfter?.rep_max === setA.rep_max &&
        plannedAfter?.rest_seconds === setA.rest_seconds &&
        plannedAfter?.target_reps === setA.target_reps,
    };

    const rewrite = await clientA.from('st_planned_sets').update({ target_reps: '99-99' }).eq('id', setA.id).select();
    const editB = setB && setB.id !== setA.id
      ? await clientA.from('st_planned_sets').update({ target_weight: '135' }).eq('id', setB.id).select()
      : { error: { message: 'no second planned set' }, data: null };
    const addSet = await clientA.from('st_planned_sets').insert({
      exercise_id: targetEx.id,
      set_number: 99,
      set_type: 'working',
      target_reps: '6-8',
    }).select();
    (report.live as any).trigger = {
      rewrite_logged: { blocked: !!rewrite.error, error: rewrite.error?.message || null, rows: rewrite.data?.length || 0 },
      edit_unlogged: { ok: !editB.error, error: editB.error?.message || null },
      add_planned_set: { ok: !addSet.error, error: addSet.error?.message || null },
    };
    if (!rewrite.error) issues.push('Logged planned-set rewrite was NOT blocked');
    if (setB && setB.id !== setA.id && editB.error) issues.push(`Unlogged set edit failed: ${editB.error.message}`);
    if (addSet.error) issues.push(`Add planned set failed: ${addSet.error.message}`);

    const extraPayload = extraSetInsertPayload({
      user_id: userA,
      exercise_id: targetEx.id,
      log_date: today,
      extra_set_number: 1,
      actual_weight: '185',
      actual_reps: '6',
      completed: true,
      snapshot_exercise_name: targetEx.name,
      snapshot_program_role: targetEx.program_role,
    });
    const extra = await clientA.from('st_set_logs').insert(extraPayload).select().single();
    const extraDup = await clientA.from('st_set_logs').insert(extraPayload).select().single();
    const plannedCountBefore = ((targetEx as any).st_planned_sets || []).length;
    const { count: plannedCountAfter } = await clientA.from('st_planned_sets').select('id', { count: 'exact', head: true }).eq('exercise_id', targetEx.id);
    const history = await clientA.from('st_set_logs').select('*').eq('user_id', userA).eq('exercise_id', targetEx.id).eq('is_extra_set', true);
    const completion = isStrengthWorkoutCompleted(
      { st_exercises: week1Exercises },
      Object.fromEntries((await clientA.from('st_set_logs').select('*').eq('user_id', userA).eq('log_date', today)).data?.map((row: any) => [row.planned_set_id || row.id, row]) || [])
    );
    (report.live as any).extra = {
      insert_ok: !extra.error,
      error: extra.error?.message || null,
      row: extra.data && {
        table: 'st_set_logs',
        planned_set_id: extra.data.planned_set_id,
        exercise_id: extra.data.exercise_id,
        is_extra_set: extra.data.is_extra_set,
        extra_set_number: extra.data.extra_set_number,
      },
      not_planned: extra.data ? extraSetsAreNotPlanned(extra.data) : false,
      counts_toward_progression: extra.data ? countsTowardProgression(extra.data) : null,
      history_count: history.data?.length || 0,
      planned_set_count_before: plannedCountBefore,
      planned_set_count_after: plannedCountAfter,
      unique_blocked: !!extraDup.error,
      unique_error: extraDup.error?.message || null,
      completes_workout: completion,
    };
    if (extra.error) issues.push(`extra insert: ${extra.error.message}`);
    if (!extraDup.error) issues.push('duplicate extra_set_number was not rejected');
    if (completion) issues.push('extra set satisfied planned workout completion');

    const emptySkip = deriveSessionStatus({ workout: { st_exercises: week1Exercises }, logs: {} });
    const statuses = ['not_started', 'in_progress', 'completed', 'partial', 'skipped'] as const;
    const sessionWrites: Record<string, unknown> = {};
    for (const status of statuses) {
      const saved = await upsertWorkoutSession(clientA, {
        user_id: userA,
        workout_id: week1.id,
        program_id: programId,
        log_date: today,
        status,
        skip_reason: status === 'skipped' ? 'time' : null,
      });
      sessionWrites[status] = { ok: !saved.error && !saved.pendingMigration, error: saved.error, pending: saved.pendingMigration, data_status: saved.data?.status };
    }
    const skipEx = await upsertExerciseSession(clientA, {
      userId: userA,
      exerciseId: targetEx.id,
      logDate: today,
      status: 'skipped',
      skipReason: 'other',
      attemptOutcome: 'did_not_perform',
    });
    const failEx = week1Exercises[1]
      ? await upsertExerciseSession(clientA, {
          userId: userA,
          exerciseId: week1Exercises[1].id,
          logDate: today,
          status: 'partial',
          attemptOutcome: 'could_not_complete',
        })
      : { error: 'no second exercise', pendingMigration: false };
    const doneEx = week1Exercises[2]
      ? await upsertExerciseSession(clientA, {
          userId: userA,
          exerciseId: week1Exercises[2].id,
          logDate: today,
          status: 'completed',
          attemptOutcome: 'completed',
        })
      : { error: null, pendingMigration: false };
    (report.live as any).outcomes = {
      empty_logs_status: emptySkip,
      empty_is_not_skipped: emptySkip !== 'skipped',
      sessions: sessionWrites,
      exercise: {
        skipped_did_not_perform: { ok: !skipEx.error, error: skipEx.error },
        partial_could_not_complete: { ok: !failEx.error, error: (failEx as any).error || null },
        completed: { ok: !doneEx.error, error: (doneEx as any).error || null },
      },
    };
    if (emptySkip === 'skipped') issues.push('empty logs inferred skipped');

    const unanswered = await upsertWorkoutFeel(clientA, { userId: userA, workoutId: week1.id, logDate: today, draft: { workout_feel: 'good', pain_flag: null, notes: 'verify unanswered pain' } });
    const explicitNone = await upsertWorkoutFeel(clientA, { userId: userA, workoutId: week1.id, logDate: `${today}`, draft: { workout_feel: 'easy', pain_flag: 'none', notes: 'verify explicit none' } });
    const { data: feelRows } = await admin.from('st_workout_feedback').select('id, workout_feel, pain_flag, notes').eq('user_id', userA).order('created_at', { ascending: false }).limit(4);
    (report.live as any).feedback = {
      unanswered_write: { ok: !unanswered.error, id: unanswered.id, pending: unanswered.pendingMigration },
      explicit_none_write: { ok: !explicitNone.error, id: explicitNone.id },
      normalize_empty: normalizePainFlag(''),
      normalize_none: normalizePainFlag('none'),
      rows: feelRows,
    };
    const unansweredRow = (feelRows || []).find((r) => r.notes === 'verify unanswered pain');
    const noneRow = (feelRows || []).find((r) => r.notes === 'verify explicit none');
    if (unansweredRow && unansweredRow.pain_flag !== null) issues.push(`unanswered pain stored as ${unansweredRow.pain_flag}`);
    if (noneRow && noneRow.pain_flag !== 'none') issues.push(`explicit none stored as ${noneRow.pain_flag}`);

    const ledger = await clientA.from('st_adaptation_events').select('id').eq('user_id', userA).limit(1);
    const ledgerInsert = await clientA.from('st_adaptation_events').insert({
      user_id: userA,
      program_id: programId,
      decision: 'VERIFY_NO_PROGRESSION',
      reason_codes: ['TEST'],
      actor: 'user',
      science_version: SCIENCE_ENGINE_VERSION,
    }).select().single();
    const bReadSessions = await clientB.from('st_workout_sessions').select('id').eq('user_id', userA);
    const bReadExtras = await clientB.from('st_set_logs').select('id').eq('user_id', userA).eq('is_extra_set', true);
    const bReadFeedback = await clientB.from('st_workout_feedback').select('id').eq('user_id', userA);
    const bReadLedger = await clientB.from('st_adaptation_events').select('id').eq('user_id', userA);
    const bWriteSession = await clientB.from('st_workout_sessions').insert({
      user_id: userA,
      workout_id: week1.id,
      log_date: '1999-01-01',
      status: 'completed',
    }).select();
    (report.live as any).rls = {
      owner_session: sessionWrites.completed,
      owner_extra: !extra.error,
      owner_feedback: !unanswered.error,
      owner_exercise: !skipEx.error,
      owner_ledger_read: { ok: !ledger.error, error: ledger.error?.message || null },
      owner_ledger_insert: { ok: !ledgerInsert.error, error: ledgerInsert.error?.message || null },
      other_cannot_read_sessions: (bReadSessions.data || []).length === 0,
      other_cannot_read_extras: (bReadExtras.data || []).length === 0,
      other_cannot_read_feedback: (bReadFeedback.data || []).length === 0,
      other_cannot_read_ledger: (bReadLedger.data || []).length === 0,
      other_cannot_write_session: !!bWriteSession.error,
      other_errors: {
        sessions: bReadSessions.error?.message || null,
        extras: bReadExtras.error?.message || null,
        write: bWriteSession.error?.message || null,
      },
    };
    if ((bReadSessions.data || []).length) issues.push('User B read User A sessions');
    if ((bReadExtras.data || []).length) issues.push('User B read User A extras');
    if ((bReadLedger.data || []).length) issues.push('User B read User A ledger');
    if (!bWriteSession.error) issues.push('User B wrote a session as User A');
  } finally {
    if (programId) {
      await admin.from('st_set_logs').delete().eq('user_id', userA);
      await admin.from('st_exercise_sessions').delete().eq('user_id', userA);
      await admin.from('st_workout_sessions').delete().eq('user_id', userA);
      await admin.from('st_workout_feedback').delete().eq('user_id', userA);
      await admin.from('st_adaptation_events').delete().eq('user_id', userA);
      await admin.from('st_programs').delete().eq('id', programId);
    }
    await admin.auth.admin.deleteUser(userA);
    await admin.auth.admin.deleteUser(userB);
    (report.live as any).cleanup = { programId, users_deleted: [emailA, emailB] };
  }

  report.operationally_verified = issues.length === 0 && !!(report.live as any).catalog?.policy_260;
  writeReport(report);
  console.log(JSON.stringify({
    status: report.operationally_verified ? 'verified' : 'issues',
    issues,
    report: REPORT,
    week_status: (report.week_status as any).counts,
    anomalies: (report.week_status as any).anomaly_counts,
    catalog_260: (report.live as any).catalog,
    trigger: (report.live as any).trigger,
    extra: (report.live as any).extra,
    rls: (report.live as any).rls,
  }, null, 2));
  if (issues.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
