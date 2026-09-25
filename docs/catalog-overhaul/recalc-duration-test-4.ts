/**
 * Re-read Get Stronger 60 duration test 4. Does not rewrite the program.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { estimateWorkoutBreakdown } from '../../lib/scienceEngine/duration';
import { powerRestSecondsFor } from '../../lib/scienceEngine/powerPrescription';
import { SCIENCE_ENGINE_VERSION } from '../../lib/scienceEngine';

const PROGRAM_ID = 'bc2e4996-eb02-4f70-945a-3897d99abf45';

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

function breakdown(day: any, usePersistedRest: boolean) {
  const warmup = (day.warmup || []).filter((e: any) => e.program_role !== 'power' && !/power primer/i.test(String(e.notes || '')));
  const primer = (day.primer || []).length ? day.primer : (day.warmup || []).filter((e: any) => e.program_role === 'power' || /power primer/i.test(String(e.notes || '')));
  const strength = day.strength || [];
  const cooldown = day.cooldown || [];
  return estimateWorkoutBreakdown({
    warmupItems: warmup.map((e: any) => {
      const reps = String(e.sets?.[0]?.target_reps || '');
      return {
        name: e.name,
        category: 'activation' as const,
        reps,
        sets: Math.max(1, (e.sets || []).length),
        measurementType: /min|sec|hour/i.test(reps) ? 'time' : undefined,
      };
    }),
    potentiation: primer.map((e: any) => ({
      name: e.name,
      sets: (e.sets || []).filter((s: any) => !isWarmupSet(s)).length || (e.sets || []).length || 1,
      restSeconds: usePersistedRest
        ? e.sets?.find((s: any) => s.rest_seconds != null)?.rest_seconds ?? powerRestSecondsFor({ name: e.name })
        : powerRestSecondsFor({ name: e.name }),
      role: 'power' as const,
      muscleGroup: '',
      primaryMuscles: [],
      movementPattern: /jump/i.test(e.name) ? 'jump' : 'other',
      repMin: 3,
      repMax: 5,
      targetRir: null,
      loadIncrement: 0,
    })),
    rampCount: strength.reduce((sum: number, e: any) => sum + (e.sets || []).filter(isWarmupSet).length, 0),
    exercises: strength.map((e: any) => ({
      name: e.name,
      sets: (e.sets || []).filter((s: any) => !isWarmupSet(s)).length || 1,
      restSeconds: e.sets?.find((s: any) => !isWarmupSet(s) && s.rest_seconds != null)?.rest_seconds || 90,
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
    cooldownItems: cooldown.map((e: any) => ({
      sets: Math.max(1, (e.sets || []).length),
      reps: e.sets?.[0]?.target_reps || '',
    })),
  });
}

async function main() {
  loadEnvLocal();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
    auth: { persistSession: false },
  });
  const { data: program } = await supabase.from('st_programs').select('id, name').eq('id', PROGRAM_ID).maybeSingle();
  const week1 =
    (
      await supabase
        .from('st_workouts')
        .select('id, week, day_label, workout_type, day_order')
        .eq('program_id', PROGRAM_ID)
        .eq('week', 1)
        .order('day_order')
    ).data || [];
  const { data: exercises } = await supabase
    .from('st_exercises')
    .select('id, workout_id, name, section, notes, program_role, sort_order, superset_group_id, catalog_exercise_id')
    .in('workout_id', week1.map((w: any) => w.id).concat(['00000000-0000-0000-0000-000000000000']))
    .order('sort_order');
  const { data: sets } = await supabase
    .from('st_planned_sets')
    .select('id, exercise_id, set_number, set_type, target_reps, target_rir, rest_seconds, is_deleted')
    .in('exercise_id', (exercises || []).map((e: any) => e.id).concat(['00000000-0000-0000-0000-000000000000']))
    .order('set_number');
  const setsByEx = new Map<string, any[]>();
  (sets || []).forEach((s: any) => {
    if (s.is_deleted) return;
    const list = setsByEx.get(s.exercise_id) || [];
    list.push(s);
    setsByEx.set(s.exercise_id, list);
  });

  const days = week1.map((w: any) => {
    const exs = (exercises || []).filter((e: any) => e.workout_id === w.id).map((e: any) => ({ ...e, sets: setsByEx.get(e.id) || [] }));
    const grouped = {
      warmup: exs.filter((e: any) => e.section === 'warmup' && !/power primer/i.test(String(e.notes || ''))),
      primer: exs.filter((e: any) => /power primer/i.test(String(e.notes || '')) || e.program_role === 'power'),
      strength: exs.filter((e: any) => e.section === 'strength'),
      cooldown: exs.filter((e: any) => e.section === 'cooldown'),
    };
    const persisted = breakdown(grouped, true);
    const familyRest = breakdown(grouped, false);
    return {
      day: w.day_label,
      primer: grouped.primer.map((e: any) => ({
        name: e.name,
        persisted_rest: e.sets.find((s: any) => s.rest_seconds != null)?.rest_seconds ?? null,
        family_rest: powerRestSecondsFor({ name: e.name }),
        ramp_rir_null: grouped.strength.every((row: any) => row.sets.filter(isWarmupSet).every((s: any) => s.target_rir == null)),
      })),
      persisted_min: persisted.minutes,
      family_rest_min: familyRest.minutes,
      persisted: {
        warmup_min: +(persisted.warmupSeconds / 60).toFixed(1),
        power_min: +(persisted.potentiationSeconds / 60).toFixed(1),
        ramp_min: +(persisted.rampSeconds / 60).toFixed(1),
        working_min: +(persisted.workingSeconds / 60).toFixed(1),
        cooldown_min: +(persisted.cooldownSeconds / 60).toFixed(1),
        total_min: persisted.minutes,
      },
      rewritten: false,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    science_version: SCIENCE_ENGINE_VERSION,
    program_id: PROGRAM_ID,
    program_name: program?.name || null,
    rewritten: false,
    days,
  };
  fs.writeFileSync(path.join(process.cwd(), 'docs/catalog-overhaul/duration-test-4-recalc.json'), JSON.stringify(report, null, 2));
}

main().catch((err) => {
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/duration-test-4-recalc.json'),
    JSON.stringify({ error: err?.message || String(err) }, null, 2)
  );
  process.exit(1);
});
