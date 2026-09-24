/**
 * Live-verify BIQ-0219 / BIQ-0220 Phase 2A.3 after 053 has already been applied.
 * Does not reapply the migration. Does not start Phase 2B.
 * Cleans only disposable verification rows.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { evaluateProgressionDecision } from '../lib/scienceEngine/adaptation/decision';
import { applyProgressionDecision } from '../lib/scienceEngine/adaptation/apply/applyDecision';
import { APPLY_ENGINE_VERSION } from '../lib/scienceEngine/adaptation/apply/types';
import type { AdaptationApplicationResult, CandidateExposure } from '../lib/scienceEngine/adaptation/apply/types';
import { applyProgressionForCompletedExercise, persistAdaptationApplication } from '../lib/training/adaptationApply';
import { snapshotForLog } from '../lib/training/setLogSnapshots';
import { SCIENCE_ENGINE_VERSION } from '../lib/scienceEngine/version';
import { ADAPTATION_ENGINE_VERSION } from '../lib/scienceEngine/adaptation/types';

const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/phase2a3-live-verify-report.json');
const MARKER = 'BIQ-0219-VERIFY';

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

function cardFromResult(result: AdaptationApplicationResult) {
  const silent = result.status === 'not_applied' && ['review_required', 'pain_hold', 'insufficient_data'].includes(result.decision);
  return {
    title: 'Next time',
    headline: result.explanation.headline,
    delta: result.explanation.next_line,
    why: result.explanation.why,
    not_changed: silent ? 'The next workout was not changed.' : null,
  };
}

function workingWeights(sets: any[]) {
  return (sets || [])
    .filter((s) => !s.is_deleted && !['warmup', 'ramp'].includes(String(s.set_type || 'working')))
    .map((s) => String(s.target_weight ?? ''));
}

function extraWeights(sets: any[], type: string) {
  return (sets || []).filter((s) => s.set_type === type).map((s) => String(s.target_weight ?? ''));
}

async function loadProgramTree(client: SupabaseClient, programId: string) {
  const { data: program, error: pErr } = await client.from('st_programs').select('*').eq('id', programId).single();
  if (pErr || !program) throw new Error(pErr?.message || 'program missing');
  const { data: workouts, error: wErr } = await client.from('st_workouts').select('*').eq('program_id', programId).order('week').order('day_order');
  if (wErr) throw new Error(wErr.message);
  const workoutIds = (workouts || []).map((w: any) => w.id);
  const { data: exercises, error: eErr } = await client.from('st_exercises').select('*').in('workout_id', workoutIds);
  if (eErr) throw new Error(eErr.message);
  const exerciseIds = (exercises || []).map((e: any) => e.id);
  const { data: sets, error: sErr } = await client.from('st_planned_sets').select('*').in('exercise_id', exerciseIds).order('set_number');
  if (sErr) throw new Error(sErr.message);
  const byEx: Record<string, any[]> = {};
  for (const s of sets || []) {
    (byEx[s.exercise_id] ||= []).push(s);
  }
  const byWo: Record<string, any[]> = {};
  for (const e of exercises || []) {
    (byWo[e.workout_id] ||= []).push({ ...e, st_planned_sets: byEx[e.id] || [] });
  }
  return {
    ...program,
    st_workouts: (workouts || []).map((w: any) => ({ ...w, st_exercises: byWo[w.id] || [] })),
  };
}

async function createBenchProgram(
  client: SupabaseClient,
  userId: string,
  catalogId: string,
  name: string,
  weekStatuses: Array<'activated' | 'template' | 'completed' | 'locked'>
) {
  const { data: program, error: pErr } = await client
    .from('st_programs')
    .insert({
      owner_user_id: userId,
      visibility: 'personal',
      name,
      weeks: weekStatuses.length,
      cycle_length_weeks: weekStatuses.length,
      start_date: new Date().toISOString().slice(0, 10),
      generation_prompt: MARKER,
      generation_method: 'science',
      science_version: SCIENCE_ENGINE_VERSION,
      status: 'draft',
    })
    .select()
    .single();
  if (pErr || !program) throw new Error(pErr?.message || 'program insert failed');

  const workoutRows = weekStatuses.map((status, i) => ({
    program_id: program.id,
    week: i + 1,
    day_order: 1,
    day_label: 'Mon',
    workout_type: 'Full Body',
    week_status: status,
  }));
  const { data: workouts, error: wErr } = await client.from('st_workouts').insert(workoutRows).select();
  if (wErr || !workouts?.length) throw new Error(wErr?.message || 'workout insert failed');

  const exercises: any[] = [];
  for (const w of workouts) {
    const { data: ex, error: eErr } = await client
      .from('st_exercises')
      .insert({
        workout_id: w.id,
        name: 'Barbell Bench Press',
        catalog_exercise_id: catalogId,
        program_role: 'primary',
        measurement_type: 'reps',
        laterality: 'bilateral',
        section: 'strength',
        equipment: 'Barbell',
        sort_order: 1,
      })
      .select()
      .single();
    if (eErr || !ex) throw new Error(eErr?.message || 'exercise insert failed');
    const setRows = [
      { exercise_id: ex.id, set_type: 'warmup', set_number: 0, sort_order: 0, target_weight: '45', target_reps: '10', rep_min: 10, rep_max: 10, target_rir: 5 },
      { exercise_id: ex.id, set_type: 'ramp', set_number: 0, sort_order: 1, target_weight: '135', target_reps: '5', rep_min: 5, rep_max: 5, target_rir: 3 },
      { exercise_id: ex.id, set_type: 'working', set_number: 1, sort_order: 2, target_weight: '185', target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
      { exercise_id: ex.id, set_type: 'working', set_number: 2, sort_order: 3, target_weight: '185', target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
      { exercise_id: ex.id, set_type: 'working', set_number: 3, sort_order: 4, target_weight: '185', target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
    ];
    const { error: sErr } = await client.from('st_planned_sets').insert(setRows);
    if (sErr) throw new Error(sErr.message);
    exercises.push(ex);
  }
  return { program, workouts, exercises };
}

async function logWorkingSets(
  client: SupabaseClient,
  userId: string,
  workout: any,
  exercise: any,
  sets: any[],
  logDate: string,
  reps: number[],
  rir: Array<number | null>
) {
  const working = sets.filter((s) => !s.is_deleted && s.set_type === 'working').sort((a: any, b: any) => (a.set_number || 0) - (b.set_number || 0));
  const logs: Record<string, any> = {};
  for (let i = 0; i < working.length; i++) {
    const ps = working[i];
    const payload: any = {
      planned_set_id: ps.id,
      user_id: userId,
      log_date: logDate,
      completed: true,
      actual_weight: '185',
      actual_reps: String(reps[i] ?? 10),
      actual_rir: rir[i],
      exercise_id: exercise.id,
      is_extra_set: false,
      ...snapshotForLog(exercise, ps, workout),
    };
    const { data, error } = await client.from('st_set_logs').upsert(payload, { onConflict: 'planned_set_id,user_id,log_date' }).select().single();
    if (error) throw new Error(`log set: ${error.message}`);
    logs[ps.id] = data;
  }
  return logs;
}

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    phase_2b: 'not_started',
    migration: { apply: { attempted: false, skipped: 'User already applied 053. This script does not reapply it.' } },
    schema: {},
    live: {},
    ui: {},
    regression: {},
    issues: [] as string[],
    operationally_verified: false,
  };
  const issues = report.issues as string[];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !serviceKey || !anonKey) throw new Error('Supabase URL/keys missing from .env.local');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const cols = 'source_workout_id,source_exercise_id,source_log_date,target_workout_id,target_exercise_id,application_status,application_key,target_fingerprint,confidence,adaptation_engine_version';
  const { error: schemaErr } = await admin.from('st_adaptation_events').select(cols).limit(1);
  (report.schema as any).ledger_columns = schemaErr ? { ok: false, error: schemaErr.message } : { ok: true, columns: cols.split(',') };
  if (schemaErr) {
    issues.push(`053 columns not visible: ${schemaErr.message}`);
    writeReport(report);
    process.exit(2);
  }

  const { data: benchRows, error: benchErr } = await admin
    .from('st_exercise_catalog')
    .select('id,name,equipment')
    .ilike('name', '%bench press%')
    .eq('is_archived', false)
    .limit(20);
  if (benchErr || !benchRows?.length) throw new Error(benchErr?.message || 'no bench press catalog row');
  const catalog = benchRows.find((r: any) => /barbell bench press/i.test(r.name)) || benchRows[0];
  (report.live as any).catalog = { id: catalog.id, name: catalog.name };

  const stamp = Date.now();
  const emailA = `biq0219.verify.${stamp}@builtiq.test`;
  const emailB = `biq0219.other.${stamp}@builtiq.test`;
  const password = `Biq0219!${stamp}`;
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

  const programIds: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  try {
    const uniqueKey = `${userA}|unique-index-probe|${stamp}|progress_load`;
    const uniqueRow = {
      user_id: userA,
      decision: 'progress_load',
      reason_codes: ['VERIFY'],
      actor: 'engine',
      science_version: SCIENCE_ENGINE_VERSION,
      application_status: 'mutated',
      application_key: uniqueKey,
    };
    const firstUnique = await clientA.from('st_adaptation_events').insert(uniqueRow).select('id').single();
    const secondUnique = await clientA.from('st_adaptation_events').insert(uniqueRow).select('id').single();
    (report.schema as any).unique_success_index = {
      first_ok: !firstUnique.error,
      second_blocked: !!secondUnique.error,
      second_error: secondUnique.error?.message || null,
    };
    if (firstUnique.error) issues.push(`unique index probe insert failed: ${firstUnique.error.message}`);
    if (!secondUnique.error) issues.push('unique success index did not reject a duplicate application_key');
    if (firstUnique.data?.id) await admin.from('st_adaptation_events').delete().eq('id', firstUnique.data.id);

    const closed = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} closed ${stamp}`, ['activated', 'template', 'template']);
    programIds.push(closed.program.id);
    const tree = await loadProgramTree(clientA, closed.program.id);
    const week1 = tree.st_workouts.find((w: any) => Number(w.week) === 1);
    const week2 = tree.st_workouts.find((w: any) => Number(w.week) === 2);
    const week3 = tree.st_workouts.find((w: any) => Number(w.week) === 3);
    const ex1 = week1.st_exercises[0];
    const logs = await logWorkingSets(clientA, userA, week1, ex1, ex1.st_planned_sets, today, [10, 10, 10], [2, 2, 2]);

    const firstApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: tree,
      workout: week1,
      exercise: ex1,
      logsByPlannedSetId: logs,
    });
    if (!firstApply) throw new Error('closed-loop apply returned null');

    const afterTree = await loadProgramTree(clientA, closed.program.id);
    const after2 = afterTree.st_workouts.find((w: any) => Number(w.week) === 2);
    const after3 = afterTree.st_workouts.find((w: any) => Number(w.week) === 3);
    const w2sets = after2.st_exercises[0].st_planned_sets;
    const w3sets = after3.st_exercises[0].st_planned_sets;
    const { data: successEvents } = await admin
      .from('st_adaptation_events')
      .select('*')
      .eq('user_id', userA)
      .eq('application_status', 'mutated')
      .eq('source_exercise_id', ex1.id)
      .order('created_at', { ascending: false });

    (report.live as any).closed_loop = {
      decision: firstApply.decision,
      proposed_load: firstApply.event.after_json?.proposed_load ?? firstApply.after_load,
      abort_reason: firstApply.abort_reason,
      status: firstApply.status,
      target: firstApply.target && { week: firstApply.target.week, exercise_id: firstApply.target.exercise_id, week_status: firstApply.target.week_status },
      week2_working: workingWeights(w2sets),
      week3_working: workingWeights(w3sets),
      week2_status: after2.week_status,
      week3_status: after3.week_status,
      week2_warmup: extraWeights(w2sets, 'warmup'),
      week2_ramp: extraWeights(w2sets, 'ramp'),
      explanation: firstApply.explanation,
    };
    if (firstApply.decision !== 'progress_load') issues.push(`expected progress_load, got ${firstApply.decision}`);
    if (String(firstApply.after_load) !== '190' && firstApply.event.after_json?.proposed_load !== 190) {
      issues.push(`expected proposed 190, got ${firstApply.after_load}`);
    }
    if (firstApply.target?.week !== 2) issues.push(`expected Week 2 target, got week ${firstApply.target?.week}`);
    if (workingWeights(w2sets).some((w) => w !== '190')) issues.push(`Week 2 working sets not 190: ${workingWeights(w2sets).join(',')}`);
    if (workingWeights(w3sets).some((w) => w !== '185')) issues.push(`Week 3 changed: ${workingWeights(w3sets).join(',')}`);
    if (after2.week_status !== 'template') issues.push(`Week 2 status became ${after2.week_status}`);
    if (extraWeights(w2sets, 'warmup').some((w) => w !== '45')) issues.push('warmup changed');
    if (extraWeights(w2sets, 'ramp').some((w) => w !== '135')) issues.push('ramp changed');
    if (!successEvents?.length) issues.push('no successful adaptation event written');

    const event = successEvents?.[0];
    (report.live as any).ledger = event
      ? {
          user_id: event.user_id,
          program_id: event.program_id,
          source_workout_id: event.source_workout_id,
          source_exercise_id: event.source_exercise_id,
          source_log_date: event.source_log_date,
          target_workout_id: event.target_workout_id,
          target_exercise_id: event.target_exercise_id,
          exercise_catalog_id: event.exercise_catalog_id,
          decision: event.decision,
          reason_codes: event.reason_codes,
          confidence: event.confidence,
          before_json: event.before_json,
          after_json: event.after_json,
          increment_value: event.increment_value,
          increment_source: event.increment_source,
          science_version: event.science_version,
          adaptation_engine_version: event.adaptation_engine_version,
          application_status: event.application_status,
          application_key: event.application_key,
          target_fingerprint: event.target_fingerprint,
        }
      : null;
    if (event) {
      if (event.user_id !== userA) issues.push('ledger user mismatch');
      if (event.program_id !== closed.program.id) issues.push('ledger program mismatch');
      if (event.source_exercise_id !== ex1.id) issues.push('ledger source exercise mismatch');
      if (event.target_exercise_id !== after2.st_exercises[0].id) issues.push('ledger target exercise mismatch');
      if (event.exercise_catalog_id !== catalog.id) issues.push('ledger catalog mismatch');
      if (event.decision !== 'progress_load') issues.push('ledger decision mismatch');
      if (event.application_status !== 'mutated') issues.push('ledger status mismatch');
      if (event.science_version !== SCIENCE_ENGINE_VERSION) issues.push('ledger science version mismatch');
      if (event.adaptation_engine_version !== ADAPTATION_ENGINE_VERSION) issues.push('ledger adaptation version mismatch');
      const beforeLoad = JSON.stringify(event.before_json || {});
      const afterLoad = JSON.stringify(event.after_json || {});
      if (!/185/.test(beforeLoad)) issues.push('before_json missing 185');
      if (!/190/.test(afterLoad)) issues.push('after_json missing 190');
      if (!event.application_key || event.application_key.includes(APPLY_ENGINE_VERSION) || event.application_key.includes(SCIENCE_ENGINE_VERSION)) {
        issues.push('application_key missing or includes a version');
      }
    }

    const secondApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: afterTree,
      workout: afterTree.st_workouts.find((w: any) => Number(w.week) === 1),
      exercise: afterTree.st_workouts.find((w: any) => Number(w.week) === 1).st_exercises[0],
      logsByPlannedSetId: logs,
    });
    const afterIdem = await loadProgramTree(clientA, closed.program.id);
    const { data: allSuccess } = await admin
      .from('st_adaptation_events')
      .select('id,application_status,application_key')
      .eq('user_id', userA)
      .eq('application_key', event?.application_key || '')
      .in('application_status', ['mutated', 'recorded_no_change']);
    const dupInsert = event
      ? await clientA.from('st_adaptation_events').insert({
          user_id: userA,
          program_id: closed.program.id,
          decision: 'progress_load',
          reason_codes: ['VERIFY_DUP'],
          actor: 'engine',
          science_version: '1.4.5',
          adaptation_engine_version: '2a3.0.1',
          application_status: 'mutated',
          application_key: event.application_key,
        }).select('id').single()
      : { error: { message: 'no event' }, data: null };

    const afterIdemReload = await loadProgramTree(clientA, closed.program.id);
    const versionApply = applyProgressionDecision({
      source: {
        user_id: userA,
        program_id: closed.program.id,
        workout_id: week1.id,
        exercise_id: ex1.id,
        catalog_exercise_id: catalog.id,
        week: 1,
        day_order: 1,
        log_date: today,
        measurement_type: 'reps',
        program_role: 'primary',
        laterality: 'bilateral',
        exercise_name: 'Barbell Bench Press',
      },
      decision: evaluateProgressionDecision({
        current: {
          log_date: today,
          catalog_exercise_id: catalog.id,
          exercise_name: 'Barbell Bench Press',
          program_role: 'primary',
          measurement_type: 'reps',
          laterality: 'bilateral',
          equipment: 'Barbell',
          prescription: { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
          sets: [10, 10, 10].map((reps, i) => ({
            planned_set_id: `v-${i}`,
            completed: true,
            set_type: 'working',
            actual_weight: 185,
            actual_reps: reps,
            actual_rir: 2,
            snapshot_rep_min: 8,
            snapshot_rep_max: 10,
            snapshot_target_rir: 2,
          })),
        },
      }),
      candidates: afterIdemReload.st_workouts.slice(1).map((w: any) => ({
        user_id: userA,
        program_id: closed.program.id,
        workout_id: w.id,
        exercise_id: w.st_exercises[0].id,
        catalog_exercise_id: catalog.id,
        exercise_name: 'Barbell Bench Press',
        program_role: 'primary',
        measurement_type: 'reps',
        laterality: 'bilateral',
        week: Number(w.week),
        day_order: Number(w.day_order),
        week_status: w.week_status,
        has_performance: false,
        planned_sets: w.st_exercises[0].st_planned_sets,
      })) as CandidateExposure[],
      existing_events: (allSuccess || []).map((row: any) => ({ ...row, before_json: {}, after_json: { proposed_load: 190 }, reason_codes: [], actor: 'engine' })),
    });
    (report.live as any).idempotency = {
      second_abort: secondApply?.abort_reason || secondApply?.status,
      week2_after: workingWeights(afterIdem.st_workouts.find((w: any) => Number(w.week) === 2).st_exercises[0].st_planned_sets),
      week3_after: workingWeights(afterIdem.st_workouts.find((w: any) => Number(w.week) === 3).st_exercises[0].st_planned_sets),
      successful_event_count: (allSuccess || []).length,
      live_unique_reject: !!dupInsert.error,
      live_unique_error: dupInsert.error?.message || null,
      version_replay_abort: versionApply.abort_reason,
    };
    if (secondApply?.abort_reason !== 'ALREADY_APPLIED' && secondApply?.status === 'mutated') issues.push('second apply mutated again');
    if (workingWeights(afterIdem.st_workouts.find((w: any) => Number(w.week) === 2).st_exercises[0].st_planned_sets).some((w) => w !== '190')) {
      issues.push('idempotent retry changed Week 2 off 190');
    }
    if (workingWeights(afterIdem.st_workouts.find((w: any) => Number(w.week) === 3).st_exercises[0].st_planned_sets).some((w) => w !== '185')) {
      issues.push('idempotent retry changed Week 3');
    }
    if ((allSuccess || []).length !== 1) issues.push(`expected 1 successful event, got ${(allSuccess || []).length}`);
    if (!dupInsert.error) issues.push('live unique index allowed a second successful row');
    if (versionApply.abort_reason !== 'ALREADY_APPLIED') issues.push(`cross-version replay was ${versionApply.abort_reason}`);

    const staleProg = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} stale ${stamp}`, ['activated', 'template']);
    programIds.push(staleProg.program.id);
    const staleTree = await loadProgramTree(clientA, staleProg.program.id);
    const staleW1 = staleTree.st_workouts.find((w: any) => Number(w.week) === 1);
    const staleW2 = staleTree.st_workouts.find((w: any) => Number(w.week) === 2);
    const staleEx1 = staleW1.st_exercises[0];
    const staleLogs = await logWorkingSets(clientA, userA, staleW1, staleEx1, staleEx1.st_planned_sets, today, [10, 10, 10], [2, 2, 2]);
    for (const s of staleW2.st_exercises[0].st_planned_sets.filter((x: any) => x.set_type === 'working')) {
      const edited = await clientA.from('st_planned_sets').update({ target_weight: '200' }).eq('id', s.id);
      if (edited.error) throw new Error(edited.error.message);
    }
    const staleApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: staleTree,
      workout: staleW1,
      exercise: staleEx1,
      logsByPlannedSetId: staleLogs,
    });
    const staleAfter = await loadProgramTree(clientA, staleProg.program.id);
    const staleW2After = staleAfter.st_workouts.find((w: any) => Number(w.week) === 2).st_exercises[0].st_planned_sets;
    const { data: staleEvents } = await admin.from('st_adaptation_events').select('id,application_status,application_key').eq('user_id', userA).eq('source_exercise_id', staleEx1.id);
    for (const s of staleW2After.filter((x: any) => x.set_type === 'working')) {
      await clientA.from('st_planned_sets').update({ target_weight: '185' }).eq('id', s.id);
    }
    const restoredTree = await loadProgramTree(clientA, staleProg.program.id);
    const restoreApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: restoredTree,
      workout: restoredTree.st_workouts.find((w: any) => Number(w.week) === 1),
      exercise: restoredTree.st_workouts.find((w: any) => Number(w.week) === 1).st_exercises[0],
      logsByPlannedSetId: staleLogs,
    });
    const restoredAfter = await loadProgramTree(clientA, staleProg.program.id);
    const { data: staleSuccess } = await admin
      .from('st_adaptation_events')
      .select('id,application_status')
      .eq('user_id', userA)
      .eq('source_exercise_id', staleEx1.id)
      .in('application_status', ['mutated', 'recorded_no_change']);
    (report.live as any).stale = {
      first_abort: staleApply?.abort_reason,
      first_status: staleApply?.status,
      weights_after_stale: workingWeights(staleW2After),
      not_applied_rows: (staleEvents || []).filter((r) => r.application_status === 'not_applied').length,
      restore_status: restoreApply?.status,
      restore_abort: restoreApply?.abort_reason,
      weights_after_restore: workingWeights(restoredAfter.st_workouts.find((w: any) => Number(w.week) === 2).st_exercises[0].st_planned_sets),
      successful_after_restore: (staleSuccess || []).length,
    };
    if (staleApply?.abort_reason !== 'STALE_TARGET_PRESCRIPTION') issues.push(`stale abort was ${staleApply?.abort_reason}`);
    if (workingWeights(staleW2After).some((w) => w !== '200')) issues.push('stale apply overwrote the manual 200');
    if (!(staleEvents || []).some((r) => r.application_status === 'not_applied')) issues.push('stale attempt was not auditable');
    if (restoreApply?.status !== 'mutated') issues.push(`restore apply was ${restoreApply?.status}`);
    if (workingWeights(restoredAfter.st_workouts.find((w: any) => Number(w.week) === 2).st_exercises[0].st_planned_sets).some((w) => w !== '190')) {
      issues.push('restore apply did not write 190');
    }
    if ((staleSuccess || []).length !== 1) issues.push(`stale identity should succeed once, got ${(staleSuccess || []).length}`);

    const hist = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} hist ${stamp}`, ['activated', 'template']);
    programIds.push(hist.program.id);
    const histTree = await loadProgramTree(clientA, hist.program.id);
    const histW1 = histTree.st_workouts.find((w: any) => Number(w.week) === 1);
    const histW2 = histTree.st_workouts.find((w: any) => Number(w.week) === 2);
    const histLogs = await logWorkingSets(clientA, userA, histW1, histW1.st_exercises[0], histW1.st_exercises[0].st_planned_sets, today, [10, 10, 10], [2, 2, 2]);
    await logWorkingSets(clientA, userA, histW2, histW2.st_exercises[0], histW2.st_exercises[0].st_planned_sets, today, [8, 8, 8], [2, 2, 2]);
    const histApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: histTree,
      workout: histW1,
      exercise: histW1.st_exercises[0],
      logsByPlannedSetId: { ...histLogs },
    });
    const histAfter = await loadProgramTree(clientA, hist.program.id);
    const histW2sets = histAfter.st_workouts.find((w: any) => Number(w.week) === 2).st_exercises[0].st_planned_sets;
    const rewriteLogged = await clientA.from('st_planned_sets').update({ target_weight: '999' }).eq('id', histW2sets.find((s: any) => s.set_type === 'working').id);

    const locked = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} locked ${stamp}`, ['activated', 'locked']);
    programIds.push(locked.program.id);
    const lockedTree = await loadProgramTree(clientA, locked.program.id);
    const lockedLogs = await logWorkingSets(clientA, userA, lockedTree.st_workouts[0], lockedTree.st_workouts[0].st_exercises[0], lockedTree.st_workouts[0].st_exercises[0].st_planned_sets, today, [10, 10, 10], [2, 2, 2]);
    const lockedApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: lockedTree,
      workout: lockedTree.st_workouts[0],
      exercise: lockedTree.st_workouts[0].st_exercises[0],
      logsByPlannedSetId: lockedLogs,
    });
    const lockedAfter = await loadProgramTree(clientA, locked.program.id);

    const completed = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} completed ${stamp}`, ['activated', 'completed']);
    programIds.push(completed.program.id);
    const completedTree = await loadProgramTree(clientA, completed.program.id);
    const completedLogs = await logWorkingSets(clientA, userA, completedTree.st_workouts[0], completedTree.st_workouts[0].st_exercises[0], completedTree.st_workouts[0].st_exercises[0].st_planned_sets, today, [10, 10, 10], [2, 2, 2]);
    const completedApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: completedTree,
      workout: completedTree.st_workouts[0],
      exercise: completedTree.st_workouts[0].st_exercises[0],
      logsByPlannedSetId: completedLogs,
    });
    const completedAfter = await loadProgramTree(clientA, completed.program.id);

    const otherProg = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} otherprog ${stamp}`, ['activated', 'template']);
    programIds.push(otherProg.program.id);
    const otherTree = await loadProgramTree(clientA, otherProg.program.id);
    const otherApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: afterIdem,
      workout: afterIdem.st_workouts[0],
      exercise: afterIdem.st_workouts[0].st_exercises[0],
      logsByPlannedSetId: logs,
    });
    const otherAfter = await loadProgramTree(clientA, otherProg.program.id);

    const otherUserWrite = await clientB.from('st_planned_sets').update({ target_weight: '999' }).eq('id', after2.st_exercises[0].st_planned_sets.find((s: any) => s.set_type === 'working').id).select('id');
    const otherUserLedger = await clientB.from('st_adaptation_events').select('id').eq('user_id', userA);
    const otherUserApply = await applyProgressionForCompletedExercise({
      supabase: clientB,
      userId: userB,
      program: afterIdem,
      workout: afterIdem.st_workouts[0],
      exercise: afterIdem.st_workouts[0].st_exercises[0],
      logsByPlannedSetId: logs,
    });

    (report.live as any).safety = {
      logged_target_abort: histApply?.abort_reason,
      logged_target_week2: workingWeights(histW2sets),
      history_trigger_blocked: !!rewriteLogged.error,
      history_trigger_error: rewriteLogged.error?.message || null,
      locked_abort: lockedApply?.abort_reason,
      locked_week2: workingWeights(lockedAfter.st_workouts[1].st_exercises[0].st_planned_sets),
      completed_abort: completedApply?.abort_reason,
      completed_week2: workingWeights(completedAfter.st_workouts[1].st_exercises[0].st_planned_sets),
      other_program_week2: workingWeights(otherAfter.st_workouts[1].st_exercises[0].st_planned_sets),
      other_user_cannot_edit: !!otherUserWrite.error || !(otherUserWrite.data || []).length,
      other_user_cannot_read_ledger: (otherUserLedger.data || []).length === 0,
      other_user_apply_abort: otherUserApply?.abort_reason || otherUserApply?.status,
    };
    if (workingWeights(histW2sets).some((w) => w !== '185')) issues.push('logged Week 2 was rewritten');
    if (!rewriteLogged.error) issues.push('2A.1 history trigger did not block logged rewrite');
    if (lockedApply?.status === 'mutated') issues.push('locked workout was mutated');
    if (completedApply?.status === 'mutated') issues.push('completed workout was mutated');
    if (workingWeights(otherAfter.st_workouts[1].st_exercises[0].st_planned_sets).some((w) => w !== '185')) issues.push('another program was targeted');
    if ((otherUserWrite.data || []).length) issues.push('other user rewrote planned sets');
    if ((otherUserLedger.data || []).length) issues.push('other user read ledger rows');
    if (otherUserApply?.mutated) issues.push('other user apply mutated the target');
    void otherApply;

    const holdProg = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} hold ${stamp}`, ['activated', 'template']);
    programIds.push(holdProg.program.id);
    const holdTree = await loadProgramTree(clientA, holdProg.program.id);
    const holdLogs = await logWorkingSets(clientA, userA, holdTree.st_workouts[0], holdTree.st_workouts[0].st_exercises[0], holdTree.st_workouts[0].st_exercises[0].st_planned_sets, today, [6, 6, 6], [1, 1, 1]);
    const holdApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: holdTree,
      workout: holdTree.st_workouts[0],
      exercise: holdTree.st_workouts[0].st_exercises[0],
      logsByPlannedSetId: holdLogs,
    });
    const holdAfter = await loadProgramTree(clientA, holdProg.program.id);

    const buildProg = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} build ${stamp}`, ['activated', 'template']);
    programIds.push(buildProg.program.id);
    const buildTree = await loadProgramTree(clientA, buildProg.program.id);
    const buildLogs = await logWorkingSets(clientA, userA, buildTree.st_workouts[0], buildTree.st_workouts[0].st_exercises[0], buildTree.st_workouts[0].st_exercises[0].st_planned_sets, today, [8, 8, 8], [2, 2, 2]);
    const buildApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: buildTree,
      workout: buildTree.st_workouts[0],
      exercise: buildTree.st_workouts[0].st_exercises[0],
      logsByPlannedSetId: buildLogs,
    });
    const buildAfter = await loadProgramTree(clientA, buildProg.program.id);

    async function applyWithPain(flag: any, associated?: boolean) {
      const p = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} ${flag} ${stamp}`, ['activated', 'template']);
      programIds.push(p.program.id);
      const treeP = await loadProgramTree(clientA, p.program.id);
      const logsP = await logWorkingSets(clientA, userA, treeP.st_workouts[0], treeP.st_workouts[0].st_exercises[0], treeP.st_workouts[0].st_exercises[0].st_planned_sets, today, [10, 10, 10], [2, 2, 2]);
      const current = {
        log_date: today,
        catalog_exercise_id: catalog.id,
        exercise_name: 'Barbell Bench Press',
        program_role: 'primary' as const,
        measurement_type: 'reps' as const,
        laterality: 'bilateral' as const,
        equipment: 'Barbell',
        pain_flag: flag,
        pain_associated: associated,
        prescription: { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
        sets: treeP.st_workouts[0].st_exercises[0].st_planned_sets.filter((s: any) => s.set_type === 'working').map((s: any) => ({
          planned_set_id: s.id,
          completed: true,
          set_type: 'working',
          actual_weight: 185,
          actual_reps: 10,
          actual_rir: 2,
          snapshot_rep_min: 8,
          snapshot_rep_max: 10,
          snapshot_target_rir: 2,
        })),
      };
      const decision = evaluateProgressionDecision({ current });
      const candidates = treeP.st_workouts.slice(1).map((w: any) => ({
        user_id: userA,
        program_id: p.program.id,
        workout_id: w.id,
        exercise_id: w.st_exercises[0].id,
        catalog_exercise_id: catalog.id,
        exercise_name: 'Barbell Bench Press',
        program_role: 'primary',
        measurement_type: 'reps',
        laterality: 'bilateral',
        week: Number(w.week),
        day_order: Number(w.day_order),
        week_status: w.week_status,
        has_performance: false,
        planned_sets: w.st_exercises[0].st_planned_sets,
      }));
      const applied = applyProgressionDecision({
        source: {
          user_id: userA,
          program_id: p.program.id,
          workout_id: treeP.st_workouts[0].id,
          exercise_id: treeP.st_workouts[0].st_exercises[0].id,
          catalog_exercise_id: catalog.id,
          week: 1,
          day_order: 1,
          log_date: today,
          measurement_type: 'reps',
          program_role: 'primary',
          laterality: 'bilateral',
          exercise_name: 'Barbell Bench Press',
        },
        decision,
        candidates,
      });
      await persistAdaptationApplication(clientA, applied);
      const after = await loadProgramTree(clientA, p.program.id);
      return { decision: decision.decision, apply: applied, week2: workingWeights(after.st_workouts[1].st_exercises[0].st_planned_sets), card: cardFromResult(applied) };
    }

    const reviewLive = await applyWithPain('discomfort', false);
    const painLive = await applyWithPain('pain_limiting', true);
    const insuffProg = await createBenchProgram(clientA, userA, catalog.id, `${MARKER} insuff ${stamp}`, ['activated', 'template']);
    programIds.push(insuffProg.program.id);
    const insuffTree = await loadProgramTree(clientA, insuffProg.program.id);
    const insuffApply = await applyProgressionForCompletedExercise({
      supabase: clientA,
      userId: userA,
      program: insuffTree,
      workout: insuffTree.st_workouts[0],
      exercise: insuffTree.st_workouts[0].st_exercises[0],
      logsByPlannedSetId: {},
    });
    const insuffAfter = await loadProgramTree(clientA, insuffProg.program.id);

    (report.live as any).no_change = {
      hold: { decision: holdApply?.decision, status: holdApply?.status, week2: workingWeights(holdAfter.st_workouts[1].st_exercises[0].st_planned_sets), card: holdApply ? cardFromResult(holdApply) : null },
      build_reps: { decision: buildApply?.decision, status: buildApply?.status, week2: workingWeights(buildAfter.st_workouts[1].st_exercises[0].st_planned_sets), card: buildApply ? cardFromResult(buildApply) : null },
    };
    (report.live as any).non_applicable = {
      review_required: reviewLive,
      pain_hold: painLive,
      insufficient_data: { decision: insuffApply?.decision, status: insuffApply?.status, abort: insuffApply?.abort_reason, week2: workingWeights(insuffAfter.st_workouts[1].st_exercises[0].st_planned_sets), card: insuffApply ? cardFromResult(insuffApply) : null },
    };
    if (holdApply?.decision !== 'hold' || holdApply.status !== 'recorded_no_change') issues.push(`hold was ${holdApply?.decision}/${holdApply?.status}`);
    if (workingWeights(holdAfter.st_workouts[1].st_exercises[0].st_planned_sets).some((w) => w !== '185')) issues.push('hold mutated prescription');
    if (buildApply?.decision !== 'build_reps' || buildApply.status !== 'recorded_no_change') issues.push(`build_reps was ${buildApply?.decision}/${buildApply?.status}`);
    if (workingWeights(buildAfter.st_workouts[1].st_exercises[0].st_planned_sets).some((w) => w !== '185')) issues.push('build_reps mutated prescription');
    if (reviewLive.decision !== 'review_required' || reviewLive.apply.status !== 'not_applied') issues.push(`review was ${reviewLive.decision}/${reviewLive.apply.status}`);
    if (reviewLive.week2.some((w) => w !== '185')) issues.push('review mutated');
    if (painLive.decision !== 'pain_hold' || painLive.apply.status !== 'not_applied') issues.push(`pain was ${painLive.decision}/${painLive.apply.status}`);
    if (painLive.week2.some((w) => w !== '185')) issues.push('pain mutated');
    if (insuffApply?.decision !== 'insufficient_data' || insuffApply.status !== 'not_applied') issues.push(`insufficient was ${insuffApply?.decision}/${insuffApply?.status}`);
    if (workingWeights(insuffAfter.st_workouts[1].st_exercises[0].st_planned_sets).some((w) => w !== '185')) issues.push('insufficient mutated');
    if (!reviewLive.card.not_changed || !painLive.card.not_changed) issues.push('review/pain card did not say workout was not changed');

    report.ui = {
      browser: 'not_run',
      reason: 'No logged-in Training session available for browser automation.',
      progress_card: cardFromResult(firstApply),
      hold_card: holdApply ? cardFromResult(holdApply) : null,
      build_card: buildApply ? cardFromResult(buildApply) : null,
      review_card: reviewLive.card,
      pain_card: painLive.card,
      gpt_used: false,
    };
    const progressCard = cardFromResult(firstApply);
    if (!/190/.test(progressCard.headline || '') || !/5/.test(progressCard.delta || '')) issues.push('progress card missing 190 / 5 lb');
    if (!progressCard.why) issues.push('progress card missing why');

    const science = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'lib/scienceEngine/acceptanceCheck.ts'], { encoding: 'utf8' });
    (report.regression as any) = {
      exit: science.status,
      stdout: (science.stdout || '').trim().split(/\r?\n/).filter((l) => /passed|FAIL|Error/.test(l)),
    };
    if (science.status !== 0) issues.push(`science suite exit ${science.status}`);
    const out = science.stdout || '';
    if (!/BIQ-0141/.test(out)) issues.push('Phase 1 line missing');
    if (!/BIQ-0209/.test(out)) issues.push('Phase 1.1 line missing');
    if (!/BIQ-0217/.test(out)) issues.push('Phase 2A.1 line missing');
    if (!/BIQ-0218/.test(out)) issues.push('Phase 2A.2 line missing');
    if (!/BIQ-0219/.test(out)) issues.push('Phase 2A.3 line missing');
  } finally {
    for (const id of programIds) {
      await admin.from('st_set_logs').delete().eq('user_id', userA);
      await admin.from('st_exercise_sessions').delete().eq('user_id', userA);
      await admin.from('st_workout_sessions').delete().eq('user_id', userA);
      await admin.from('st_workout_feedback').delete().eq('user_id', userA);
      await admin.from('st_adaptation_events').delete().eq('user_id', userA);
      await admin.from('st_programs').delete().eq('id', id);
    }
    await admin.from('st_adaptation_events').delete().eq('user_id', userA);
    await admin.from('st_adaptation_events').delete().eq('user_id', userB);
    await admin.auth.admin.deleteUser(userA);
    await admin.auth.admin.deleteUser(userB);
    (report.live as any).cleanup = { programIds, users_deleted: [emailA, emailB] };
  }

  report.operationally_verified = issues.length === 0;
  writeReport(report);
  console.log(JSON.stringify({
    status: report.operationally_verified ? 'verified' : 'issues',
    issues,
    report: REPORT,
    closed_loop: (report.live as any).closed_loop,
    idempotency: (report.live as any).idempotency,
    stale: (report.live as any).stale,
    regression: (report.regression as any).stdout,
  }, null, 2));
  if (issues.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
