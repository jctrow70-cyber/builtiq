/**
 * Read-only audit of the Get Stronger 3-day program from the latest generation run.
 * Does not regenerate.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { classifySessionDuration, estimateWorkoutBreakdown } from '../../lib/scienceEngine/duration';

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

function isWarmupSet(set: any) {
  const t = String(set?.set_type || 'working').toLowerCase();
  return t === 'warmup' || t === 'ramp';
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const report: any = { generated_at: new Date().toISOString() };

  const { data: runs, error: runErr } = await supabase
    .from('st_generation_runs')
    .select('id, program_id, user_id, generation_method, model, latency_ms, created_at, validation_json, error_text, science_version, prompt_version, input_json, output_json')
    .order('created_at', { ascending: false })
    .limit(10);
  report.run_fetch_error = runErr?.message || null;
  const run = (runs || []).find((r: any) => r.program_id) || (runs || [])[0];
  const programId = run?.program_id;
  if (!programId) {
    fs.writeFileSync(path.join(process.cwd(), 'docs/catalog-overhaul/persisted-strength-program-audit.json'), JSON.stringify({ error: 'no generation run with program_id', runs: (runs || []).map((r: any) => ({ id: r.id, program_id: r.program_id, created_at: r.created_at })) }, null, 2));
    return;
  }

  const { data: program } = await supabase
    .from('st_programs')
    .select('id, name, owner_user_id, created_at, program_summary, status, weeks, generation_method, science_version')
    .eq('id', programId)
    .maybeSingle();

  const { data: allWorkouts, error: workoutErr } = await supabase
    .from('st_workouts')
    .select('id, program_id, week, day_label, workout_type, day_order')
    .eq('program_id', programId)
    .order('week')
    .order('day_order');
  report.workout_fetch_error = workoutErr?.message || null;
  report.workout_weeks = Array.from(new Set((allWorkouts || []).map((w: any) => w.week)));
  const workouts = (allWorkouts || []).filter((w: any) => Number(w.week) === 1);

  const workoutIds = (workouts || []).map((w: any) => w.id);
  const { data: exercises } = await supabase
    .from('st_exercises')
    .select('id, workout_id, name, section, notes, program_role, sort_order, superset_group_id, superset_label, catalog_exercise_id')
    .in('workout_id', workoutIds.length ? workoutIds : ['00000000-0000-0000-0000-000000000000'])
    .order('sort_order');

  const exerciseIds = (exercises || []).map((e: any) => e.id);
  const { data: sets } = await supabase
    .from('st_planned_sets')
    .select('id, exercise_id, set_number, set_type, target_reps, target_rir, rest_seconds, rep_min, rep_max, target_weight, is_deleted')
    .in('exercise_id', exerciseIds.length ? exerciseIds : ['00000000-0000-0000-0000-000000000000'])
    .order('set_number');

  const catalogIds = Array.from(new Set((exercises || []).map((e: any) => e.catalog_exercise_id).filter(Boolean)));
  const { data: catalog } = await supabase
    .from('st_exercise_catalog')
    .select('id, name')
    .in('id', catalogIds.length ? catalogIds : ['00000000-0000-0000-0000-000000000000']);
  const catalogName = new Map((catalog || []).map((row: any) => [row.id, row.name]));

  const aiIds = Array.from(
    new Set(
      (run.output_json?.workouts || []).flatMap((w: any) => [
        ...(w.potentiation || []).map((p: any) => p.exercise_id),
        ...(w.strength || []).flatMap((b: any) => (b.exercises || []).map((e: any) => e.exercise_id)),
      ])
    )
  );
  const { data: aiCatalog } = await supabase
    .from('st_exercise_catalog')
    .select('id, name')
    .in('id', aiIds.length ? aiIds : ['00000000-0000-0000-0000-000000000000']);
  const aiName = new Map((aiCatalog || []).map((row: any) => [row.id, row.name]));

  const setsByEx = new Map<string, any[]>();
  (sets || []).forEach((s: any) => {
    if (s.is_deleted) return;
    const list = setsByEx.get(s.exercise_id) || [];
    list.push(s);
    setsByEx.set(s.exercise_id, list);
  });
  const exByWorkout = new Map<string, any[]>();
  (exercises || []).forEach((e: any) => {
    const list = exByWorkout.get(e.workout_id) || [];
    list.push({ ...e, sets: setsByEx.get(e.id) || [] });
    exByWorkout.set(e.workout_id, list);
  });

  const durationDays = (workouts || []).map((d: any) => {
    const exs = exByWorkout.get(d.id) || [];
    const warmup = exs.filter((e: any) => e.section === 'warmup' && !/power primer/i.test(String(e.notes || '')) && e.program_role !== 'power');
    const primer = exs.filter((e: any) => /power primer/i.test(String(e.notes || '')) || e.program_role === 'power');
    const strength = exs.filter((e: any) => e.section === 'strength');
    const cooldown = exs.filter((e: any) => e.section === 'cooldown');
    const rampCount = strength.reduce((sum: number, e: any) => sum + e.sets.filter(isWarmupSet).length, 0);
    const groups = new Map<string, any[]>();
    strength.forEach((e: any, i: number) => {
      const key = e.superset_group_id || `solo-${i}`;
      const list = groups.get(key) || [];
      list.push(e);
      groups.set(key, list);
    });
    const breakdown = estimateWorkoutBreakdown({
      warmupItems: warmup.map((e: any) => ({ name: e.name, category: 'activation', reps: e.sets[0]?.target_reps || '8', sets: Math.max(1, e.sets.length) })),
      potentiation: primer.map((e: any) => ({
        name: e.name,
        sets: e.sets.filter((s: any) => !isWarmupSet(s)).length || e.sets.length || 1,
        restSeconds: e.sets.find((s: any) => s.rest_seconds != null)?.rest_seconds || 45,
        role: 'power' as const,
        muscleGroup: '',
        primaryMuscles: [],
        movementPattern: 'jump',
        repMin: 3,
        repMax: 5,
        targetRir: null,
        loadIncrement: 0,
      })),
      rampCount,
      exercises: strength.map((e: any) => ({
        name: e.name,
        sets: e.sets.filter((s: any) => !isWarmupSet(s)).length || 1,
        restSeconds: e.sets.find((s: any) => !isWarmupSet(s) && s.rest_seconds != null)?.rest_seconds || 90,
        role: e.program_role || 'secondary',
        muscleGroup: '',
        primaryMuscles: [],
        movementPattern: 'other',
        repMin: 4,
        repMax: 6,
        targetRir: 2,
        loadIncrement: 5,
        supersetGroupId: e.superset_group_id || undefined,
      })),
      cooldownItems: cooldown.map((e: any) => ({ sets: Math.max(1, e.sets.length) })),
    });
    const strengthSupersets = Array.from(groups.values()).filter((g) => g.length >= 2 && g[0].superset_group_id);
    return {
      day: d.day_label,
      name: d.workout_type,
      stored_estimated_minutes: null,
      recomputed_minutes: breakdown.minutes,
      duration_breakdown: {
        warmup_min: +(breakdown.warmupSeconds / 60).toFixed(1),
        potentiation_min: +(breakdown.potentiationSeconds / 60).toFixed(1),
        ramp_min: +(breakdown.rampSeconds / 60).toFixed(1),
        working_min: +(breakdown.workingSeconds / 60).toFixed(1),
        cooldown_min: +(breakdown.cooldownSeconds / 60).toFixed(1),
        total_min: breakdown.minutes,
        ramp_sets: rampCount,
      },
      duration_class: classifySessionDuration(breakdown.minutes, 60),
      warmup: warmup.map((e: any) => ({ name: e.name, sets: e.sets.map((s: any) => ({ type: s.set_type, reps: s.target_reps, rir: s.target_rir })) })),
      primer: primer.map((e: any) => ({
        name: e.name,
        catalog: catalogName.get(e.catalog_exercise_id) || null,
        role: e.program_role,
        notes: e.notes,
        sets: e.sets.map((s: any) => ({ type: s.set_type, reps: s.target_reps, rir: s.target_rir, rest: s.rest_seconds })),
      })),
      strength: strength.map((e: any) => ({
        name: e.name,
        role: e.program_role,
        superset: e.superset_label,
        superset_group_id: e.superset_group_id,
        sets: e.sets.map((s: any) => ({ type: s.set_type, reps: s.target_reps, rir: s.target_rir, rest: s.rest_seconds })),
      })),
      cooldown: cooldown.map((e: any) => e.name),
      strength_superset_groups: strengthSupersets.map((g) => g.map((e: any) => e.name)),
    };
  });

  report.selected = {
    program,
    generation_run: {
      id: run.id,
      program_id: run.program_id,
      generation_method: run.generation_method,
      model: run.model,
      latency_ms: run.latency_ms,
      created_at: run.created_at,
      science_version: run.science_version,
      prompt_version: run.prompt_version,
      error_text: run.error_text,
      ai_latency_ms: run.validation_json?.ai_latency_ms,
      wall_ms: run.validation_json?.wall_ms,
      openai_calls: run.validation_json?.openai_calls,
      initial_ok: run.validation_json?.initial?.ok,
      final_ok: run.validation_json?.ok,
      repairs: run.validation_json?.repairs,
      issues: run.validation_json?.issues,
      superset_preference: run.input_json?.athlete?.superset_preference,
      session_minutes: run.input_json?.constraints?.session_minutes || run.input_json?.athlete?.session_minutes,
      primary_goal: run.input_json?.athlete?.primary_goal,
      experience_level: run.input_json?.athlete?.experience_level,
      training_split: run.input_json?.athlete?.training_split,
      variety_preference: run.input_json?.athlete?.variety_preference,
      ai_days: (run.output_json?.workouts || []).map((w: any) => ({
        day: w.day_label,
        estimated_minutes: w.estimated_minutes,
        potentiation: (w.potentiation || []).map((p: any) => ({
          name: aiName.get(p.exercise_id) || p.exercise_id,
          sets: p.sets,
          prescription: p.prescription,
        })),
        strength: (w.strength || []).map((b: any) => ({
          type: b.type,
          names: (b.exercises || []).map((e: any) => aiName.get(e.exercise_id) || e.exercise_id),
        })),
      })),
    },
  };
  report.days = durationDays;
  fs.writeFileSync(path.join(process.cwd(), 'docs/catalog-overhaul/persisted-strength-program-audit.json'), JSON.stringify(report, null, 2));
}

main().catch((err) => {
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/persisted-strength-program-audit.json'),
    JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2)
  );
  process.exit(1);
});
