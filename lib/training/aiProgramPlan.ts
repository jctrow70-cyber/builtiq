/** BIQ-0014: AI-driven program generation — prompt, validation, catalog matching */

import { inferExerciseType } from './exerciseTypes';

export type AiExercise = {
  name: string;
  muscle_group?: string;
  sets?: number;
  reps?: string;
  rpe?: string;
  target_weight?: string;
};

export type AiWorkoutItem = AiExercise | { superset: AiExercise[] };

export type AiWorkout = {
  week: number;
  day_label: string;
  workout_type: string;
  warmup?: AiWorkoutItem[];
  strength?: AiWorkoutItem[];
};

export type AiProgramPlan = {
  program_name?: string;
  program_summary: string;
  program_style?: string;
  workouts: AiWorkout[];
};

export type GenerationConfig = {
  prompt: string;
  weeks: number;
  days: string[];
  dayTypes: Record<string, string>;
  focusMuscles?: string[];
  programName?: string;
  mode: 'personal' | 'team';
  teamId?: string | null;
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VALID_WORKOUT_TYPES = ['Lower Body', 'Upper Body', 'Full Body'];
const SECTION_SORT_BASE: Record<string, number> = { warmup: 0, strength: 100 };

function compactCatalog(catalog: any[], limit = 500): { name: string; muscle_group: string; movement_pattern: string; equipment: string }[] {
  return (catalog || [])
    .filter((c) => !c?.is_archived)
    .slice(0, limit)
    .map((c) => ({
      name: String(c.name || ''),
      muscle_group: String(c.muscle_group || ''),
      movement_pattern: String(c.movement_pattern || ''),
      equipment: String(c.equipment || ''),
    }));
}

export function buildProgramGenerationPrompt(
  userPrompt: string,
  profile: any,
  catalog: any[],
  config: GenerationConfig
): { system: string; user: string } {
  const catalogRef = compactCatalog(catalog);
  const daySchedule = config.days
    .map((d) => `${d}: ${config.dayTypes[d] || 'Full Body'}`)
    .join(', ');

  const system = `You are BuiltIQ Health's strength & conditioning program designer. You create science-based, periodized training plans as strict JSON only — no markdown, no prose outside JSON.

Rules:
1. Interpret the user's natural-language goal (sport, position, throw/hit power, hypertrophy, etc.) and design accordingly.
2. Each week must differ: vary exercises, rep schemes, and/or intensity across weeks (accumulation → intensification → deload/peak). Never photocopy identical workouts every week.
3. Prefer exercise names EXACTLY from the provided catalog when possible. If no match, use a clear standard gym name.
4. Balance push/pull; avoid stacking the same movement pattern on consecutive training days.
5. Use realistic set/rep/RPE targets for the user's experience level.
6. Warmup: 2–4 prep items per session. Strength: 4–8 exercises per session; optional supersets (2 exercises max per superset).
7. Frame guidance as general fitness/wellness — not medical advice.
8. Output ONLY valid JSON matching the schema below.

JSON schema:
{
  "program_name": "string (optional short title)",
  "program_summary": "string (1-2 sentences: sport/goals, weekly structure, periodization)",
  "program_style": "general|hypertrophy|strength|athletic_performance",
  "workouts": [
    {
      "week": 1,
      "day_label": "Mon",
      "workout_type": "Lower Body|Upper Body|Full Body",
      "warmup": [{ "name": "...", "muscle_group": "...", "sets": 1, "reps": "..." }],
      "strength": [
        { "name": "...", "muscle_group": "...", "sets": 3, "reps": "8-12", "rpe": "7-8" },
        { "superset": [{ "name": "...", "sets": 3, "reps": "10-12" }, { "name": "...", "sets": 3, "reps": "10-12" }] }
      ]
    }
  ]
}

Generate exactly one workout entry per (week × training day) for all ${config.weeks} weeks and days: ${config.days.join(', ')}.`;

  const user = JSON.stringify(
    {
      user_request: userPrompt.trim(),
      athlete_profile: {
        experience_level: profile?.experience_level || 'beginner',
        primary_goal: profile?.primary_goal || 'general_health',
        sex: profile?.sex || null,
        height_inches: profile?.height_inches || null,
        weight_lbs: profile?.weight_lbs || null,
      },
      program_config: {
        weeks: config.weeks,
        training_days: daySchedule,
        focus_muscles: config.focusMuscles || [],
        visibility: config.mode,
      },
      exercise_catalog: catalogRef,
    },
    null,
    0
  );

  return { system, user };
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return s.trim();
}

function isSupersetItem(item: any): item is { superset: AiExercise[] } {
  return item && typeof item === 'object' && !Array.isArray(item) && Array.isArray(item.superset);
}

function isExerciseItem(item: any): item is AiExercise {
  return item && typeof item === 'object' && !Array.isArray(item) && typeof item.name === 'string';
}

function normalizeExercise(ex: AiExercise): AiExercise {
  return {
    name: String(ex.name || '').trim(),
    muscle_group: ex.muscle_group ? String(ex.muscle_group) : undefined,
    sets: Math.max(1, Math.min(8, Number(ex.sets) || 3)),
    reps: ex.reps ? String(ex.reps) : '8-12',
    rpe: ex.rpe ? String(ex.rpe) : '',
    target_weight: ex.target_weight ? String(ex.target_weight) : '',
  };
}

function normalizeWorkoutItem(item: any): AiWorkoutItem | null {
  if (isSupersetItem(item)) {
    const superset = item.superset
      .filter((e) => e?.name)
      .slice(0, 3)
      .map((e) => normalizeExercise(e));
    if (superset.length < 2) return null;
    return { superset };
  }
  if (isExerciseItem(item) && item.name.trim()) return normalizeExercise(item);
  return null;
}

export function parseAndValidateAiPlan(raw: string, config: GenerationConfig): { plan: AiProgramPlan | null; error: string | null } {
  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    return { plan: null, error: 'AI response was not valid JSON' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { plan: null, error: 'AI plan must be a JSON object' };
  }

  const summary = String(parsed.program_summary || '').trim();
  if (!summary) return { plan: null, error: 'AI plan missing program_summary' };

  const workoutsIn = Array.isArray(parsed.workouts) ? parsed.workouts : [];
  if (!workoutsIn.length) return { plan: null, error: 'AI plan has no workouts' };

  const expectedKeys = new Set<string>();
  for (let w = 1; w <= config.weeks; w++) {
    config.days.forEach((d) => expectedKeys.add(`${w}|${d}`));
  }

  const workouts: AiWorkout[] = [];
  const seen = new Set<string>();

  for (const row of workoutsIn) {
    const week = Number(row?.week);
    const dayLabel = String(row?.day_label || '').trim();
    if (!week || !dayLabel) continue;
    const key = `${week}|${dayLabel}`;
    if (!expectedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);

    let workoutType = String(row?.workout_type || config.dayTypes[dayLabel] || 'Full Body');
    if (!VALID_WORKOUT_TYPES.includes(workoutType)) workoutType = config.dayTypes[dayLabel] || 'Full Body';

    const warmup = (Array.isArray(row?.warmup) ? row.warmup : [])
      .map(normalizeWorkoutItem)
      .filter(Boolean) as AiWorkoutItem[];
    const strength = (Array.isArray(row?.strength) ? row.strength : [])
      .map(normalizeWorkoutItem)
      .filter(Boolean) as AiWorkoutItem[];

    if (!strength.length) continue;

    workouts.push({ week, day_label: dayLabel, workout_type: workoutType, warmup, strength });
  }

  if (!workouts.length) return { plan: null, error: 'No valid workouts after validation' };

  const missing = Array.from(expectedKeys).filter((k) => !seen.has(k));
  if (missing.length > config.days.length) {
    return { plan: null, error: `AI plan incomplete — missing workouts for: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` };
  }

  const plan: AiProgramPlan = {
    program_name: parsed.program_name ? String(parsed.program_name).trim() : undefined,
    program_summary: summary,
    program_style: parsed.program_style ? String(parsed.program_style) : 'athletic_performance',
    workouts: workouts.sort((a, b) => a.week - b.week || DAY_ORDER.indexOf(a.day_label) - DAY_ORDER.indexOf(b.day_label)),
  };

  return { plan, error: null };
}

export function catalogByName(items: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  (items || [])
    .filter((c) => !c?.is_archived)
    .forEach((c) => {
      map[String(c.name || '').toLowerCase()] = c;
    });
  return map;
}

function tokenize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

export function matchExerciseToCatalog(name: string, catalog: any[], catMap: Record<string, any>): any | null {
  const lower = String(name || '').toLowerCase().trim();
  if (!lower) return null;
  if (catMap[lower]) return catMap[lower];

  const tokens = tokenize(lower);
  let best: any = null;
  let bestScore = 0;

  for (const item of catalog || []) {
    if (item?.is_archived) continue;
    const iname = String(item.name || '').toLowerCase();
    if (iname.includes(lower) || lower.includes(iname)) {
      const score = 80 + iname.length;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
      continue;
    }
    const itokens = tokenize(iname);
    const overlap = tokens.filter((t) => itokens.some((it) => it.includes(t) || t.includes(it))).length;
    if (overlap >= 2 && overlap > bestScore) {
      bestScore = overlap;
      best = item;
    }
  }

  return best;
}

function buildPlannedSetRows(sets: number) {
  const rows: { sort_order: number; set_number: number; set_type: string; target_weight: string; target_reps: string; target_rpe: string }[] = [];
  const n = Math.max(1, sets);
  for (let i = 0; i < n; i++) {
    rows.push({
      sort_order: i,
      set_number: i + 1,
      set_type: 'working',
      target_weight: '',
      target_reps: '',
      target_rpe: '',
    });
  }
  return rows;
}

function makeSupersetGroupId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function insertSectionItems(
  supabase: any,
  workoutId: string,
  section: string,
  list: AiWorkoutItem[],
  startSort: number,
  catalog: any[],
  catMap: Record<string, any>
): Promise<{ error: string | null }> {
  let sort = startSort;
  let groupNum = 0;

  for (const item of list) {
    if (isSupersetItem(item)) {
      if (item.superset.length < 2) continue;
      groupNum++;
      const groupId = makeSupersetGroupId();
      const label = `Superset ${String.fromCharCode(64 + groupNum)}`;
      let slot = 0;
      for (const exItem of item.superset) {
        slot++;
        const hit = matchExerciseToCatalog(exItem.name, catalog, catMap);
        const exType = inferExerciseType(exItem.name, hit?.muscle_group || exItem.muscle_group, section, hit?.exercise_type);
        const { data: e, error } = await supabase
          .from('st_exercises')
          .insert({
            workout_id: workoutId,
            section,
            sort_order: sort,
            name: hit?.name || exItem.name,
            muscle_group: hit?.muscle_group || exItem.muscle_group || 'Muscle',
            catalog_exercise_id: hit?.id || null,
            exercise_type: exType,
            superset_group_id: groupId,
            superset_label: label,
            superset_order: slot,
          })
          .select()
          .single();
        if (error) return { error: error.message };
        const rows = buildPlannedSetRows(exItem.sets || 3).map((r, i) => ({
          ...r,
          exercise_id: e.id,
          target_reps: exItem.reps || '',
          target_rpe: exItem.rpe || '',
          target_weight: exItem.target_weight || '',
          set_number: i + 1,
        }));
        if (rows.length) {
          const { error: pe } = await supabase.from('st_planned_sets').insert(rows);
          if (pe) return { error: pe.message };
        }
      }
      sort++;
    } else if (isExerciseItem(item)) {
      const hit = matchExerciseToCatalog(item.name, catalog, catMap);
      const exType = inferExerciseType(item.name, hit?.muscle_group || item.muscle_group, section, hit?.exercise_type);
      const { data: e, error } = await supabase
        .from('st_exercises')
        .insert({
          workout_id: workoutId,
          section,
          sort_order: sort,
          name: hit?.name || item.name,
          muscle_group: hit?.muscle_group || item.muscle_group || 'Muscle',
          catalog_exercise_id: hit?.id || null,
          exercise_type: exType,
          superset_group_id: null,
        })
        .select()
        .single();
      if (error) return { error: error.message };
      const rows = buildPlannedSetRows(item.sets || 3).map((r, i) => ({
        ...r,
        exercise_id: e.id,
        target_reps: item.reps || '',
        target_rpe: item.rpe || '',
        target_weight: item.target_weight || '',
        set_number: i + 1,
      }));
      if (rows.length) {
        const { error: pe } = await supabase.from('st_planned_sets').insert(rows);
        if (pe) return { error: pe.message };
      }
      sort++;
    }
  }

  return { error: null };
}

export async function persistAiProgramPlan(
  supabase: any,
  userId: string,
  plan: AiProgramPlan,
  config: GenerationConfig,
  catalog: any[]
): Promise<{ programId: string | null; error: string | null }> {
  const catMap = catalogByName(catalog);
  const programPayload: Record<string, unknown> = {
    owner_user_id: userId,
    team_id: config.mode === 'team' ? config.teamId || null : null,
    visibility: config.mode,
    name: plan.program_name || config.programName || 'AI Strength Program',
    weeks: config.weeks,
    focus_muscles: config.focusMuscles?.length ? config.focusMuscles : null,
    generation_prompt: config.prompt.trim(),
    generation_method: 'ai',
    program_summary: plan.program_summary,
    program_style: plan.program_style || null,
  };

  const { data: program, error: pErr } = await supabase.from('st_programs').insert(programPayload).select().single();
  if (pErr || !program) return { programId: null, error: pErr?.message || 'Failed to create program' };

  const workoutRows = plan.workouts.map((w) => ({
    program_id: program.id,
    week: w.week,
    day_order: DAY_ORDER.indexOf(w.day_label),
    day_label: w.day_label,
    workout_type: w.workout_type,
  }));

  const { data: insertedWorkouts, error: wErr } = await supabase.from('st_workouts').insert(workoutRows).select();
  if (wErr || !insertedWorkouts?.length) {
    return { programId: null, error: wErr?.message || 'Failed to create workouts' };
  }

  const planByKey = new Map(plan.workouts.map((w) => [`${w.week}|${w.day_label}`, w]));

  for (const w of insertedWorkouts) {
    const tpl = planByKey.get(`${w.week}|${w.day_label}`);
    if (!tpl) continue;

    for (const sec of ['warmup', 'strength'] as const) {
      const list = tpl[sec] || [];
      if (!list.length) continue;
      const startSort = SECTION_SORT_BASE[sec] ?? 0;
      const { error: ie } = await insertSectionItems(supabase, w.id, sec, list, startSort, catalog, catMap);
      if (ie) return { programId: null, error: ie };
    }
  }

  return { programId: program.id, error: null };
}
