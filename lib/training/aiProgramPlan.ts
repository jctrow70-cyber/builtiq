/** BIQ-0014: AI-driven program generation — prompt, validation, catalog matching */

import { inferExerciseType } from './exerciseTypes';
import { hasExerciseGuide } from './exerciseMedia';

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
  cooldown?: AiWorkoutItem[];
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
  includeCooldown?: boolean;
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VALID_WORKOUT_TYPES = ['Lower Body', 'Upper Body', 'Full Body', 'Cardio', 'Mobility'];
const SECTION_SORT_BASE: Record<string, number> = { warmup: 0, strength: 100, cooldown: 200 };

const MOBILITY_NAME_PATTERN = /stretch|mobility|foam|pigeon|inchworm|cat\s*cow|world'?s?\s*greatest|rotation|dislocation|breathing/i;

function isUserCustomExercise(item: any): boolean {
  if (!item || item.is_archived) return true;
  if (item.user_id) return true;
  if (item.is_system === false && !item.external_source) return true;
  return false;
}

function promptTokens(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function scoreCatalogItemForAi(item: any, tokens: string[]): number {
  let score = 0;
  if (hasExerciseGuide(item)) score += 40;
  if (item.external_source) score += 15;
  if (item.is_system === true) score += 5;

  const fields = [
    String(item.name || '').toLowerCase(),
    String(item.muscle_group || '').toLowerCase(),
    String(item.movement_pattern || '').toLowerCase(),
    String(item.training_goal || '').toLowerCase(),
  ];
  const hay = fields.join(' ');
  tokens.forEach((t, i) => {
    if (fields[0].includes(t)) score += 30 - i * 2;
    else if (hay.includes(t)) score += 12 - i;
  });

  return score;
}

export function selectCatalogForAi(
  catalog: any[],
  userPrompt: string,
  limit = 500
): { name: string; muscle_group: string; movement_pattern: string; equipment: string; has_form_guide: boolean }[] {
  const tokens = promptTokens(userPrompt);
  return (catalog || [])
    .filter((c) => !isUserCustomExercise(c))
    .map((c) => ({ item: c, score: scoreCatalogItemForAi(c, tokens) }))
    .sort((a, b) => b.score - a.score || String(a.item.name || '').localeCompare(String(b.item.name || '')))
    .slice(0, limit)
    .map(({ item }) => ({
      name: String(item.name || ''),
      muscle_group: String(item.muscle_group || ''),
      movement_pattern: String(item.movement_pattern || ''),
      equipment: String(item.equipment || ''),
      has_form_guide: hasExerciseGuide(item),
    }));
}

function scoreMobilityCatalogItem(item: any, tokens: string[]): number {
  let score = 0;
  const et = String(item.exercise_type || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const goal = String(item.training_goal || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();

  if (et === 'mobility') score += 50;
  if (cat === 'warmup' || cat === 'stretching') score += 40;
  if (goal === 'mobility' || goal.includes('mobility')) score += 35;
  if (MOBILITY_NAME_PATTERN.test(name)) score += 30;
  if (hasExerciseGuide(item)) score += 20;
  if (item.is_system === true) score += 5;

  const fields = [name, String(item.muscle_group || '').toLowerCase(), goal];
  const hay = fields.join(' ');
  tokens.forEach((t, i) => {
    if (fields[0].includes(t)) score += 25 - i * 2;
    else if (hay.includes(t)) score += 10 - i;
  });

  return score;
}

export function selectMobilityCatalogForAi(
  catalog: any[],
  userPrompt: string,
  limit = 100
): { name: string; muscle_group: string; exercise_type: string; has_form_guide: boolean }[] {
  const tokens = promptTokens(userPrompt);
  return (catalog || [])
    .filter((c) => !isUserCustomExercise(c))
    .map((c) => ({ item: c, score: scoreMobilityCatalogItem(c, tokens) }))
    .sort((a, b) => b.score - a.score || String(a.item.name || '').localeCompare(String(b.item.name || '')))
    .slice(0, limit)
    .map(({ item }) => ({
      name: String(item.name || ''),
      muscle_group: String(item.muscle_group || ''),
      exercise_type: String(item.exercise_type || 'mobility'),
      has_form_guide: hasExerciseGuide(item),
    }));
}

export function buildProgramGenerationPrompt(
  userPrompt: string,
  profile: any,
  catalog: any[],
  config: GenerationConfig
): { system: string; user: string } {
  const catalogRef = selectCatalogForAi(catalog, userPrompt);
  const mobilityCatalog = selectMobilityCatalogForAi(catalog, userPrompt, 100);
  const daySchedule = config.days
    .map((d) => `${d}: ${config.dayTypes[d] || 'Full Body'}`)
    .join(', ');
  const hasCardioDays = config.days.some((d) => config.dayTypes[d] === 'Cardio');
  const hasMobilityDays = config.days.some((d) => config.dayTypes[d] === 'Mobility');
  const includeCooldown = config.includeCooldown !== false;

  const cardioRules = hasCardioDays
    ? `
11. CARDIO DAYS: When day_types includes "Cardio", design cardio-focused conditioning sessions for those days.
    - workout_type must be "Cardio" on those days.
    - Use catalog exercises with muscle_group Cardio or conditioning equipment (assault bike, rower, ski erg, treadmill, bike).
    - Structure: 1–2 light warmup prep items, then 4–6 conditioning blocks in strength array (intervals, steady-state, or mixed).
    - Reps field can hold duration ("10 min", "30 sec", "500m") or distance; RPE 6–9 for intervals.
    - Vary cardio modality and intensity week to week (e.g. week 1 steady, week 2 intervals, week 3 tempo).
    - No heavy barbell lifts on Cardio days.${includeCooldown ? ' Optional cooldown: 1–2 light stretches or omit.' : ''}`
    : '';

  const mobilityDayRules = hasMobilityDays
    ? `
12. MOBILITY DAYS: When day_types includes "Mobility", design dedicated recovery/mobility sessions.
    - workout_type must be "Mobility" on those days.
    - Warmup: 1–2 light activation items (walk, bike, breathing).
    - Strength section: 6–10 mobility/stretch exercises from mobility_catalog (main work — NOT barbell compounds).
    - Use duration-based reps ("30 sec", "45 sec each side", "10 reps").
    - No heavy squats, deadlifts, bench press, or barbell compounds on Mobility days.
    - Cooldown: optional 1–2 breathing/relaxation items or merge into strength section.`
    : '';

  const cooldownRules = includeCooldown
    ? `
13. COOLDOWN (default ON): On strength days (Lower, Upper, Full Body), include a "cooldown" array with 2–4 static/dynamic stretches targeting muscles worked that session (e.g. lower day → hip flexor, hamstring, glute stretches). Pick from mobility_catalog. Use duration reps ("30 sec", "60 sec each side"). Cardio days: optional 1–2 cooldown stretches or omit.`
    : `
13. COOLDOWN: User disabled cooldown — omit the cooldown array entirely on all days.`;

  const warmupMobilityRules = `
14. WARMUP MOBILITY (strength days): Every Lower/Upper/Full Body day warmup must include:
    - 1 light cardio/activation item (bike, walk, jump rope).
    - 2–3 mobility/stretch items from mobility_catalog (exercise_type mobility or stretching names).
    - At least one item targeting hips, thoracic spine/rotation, or shoulders when goals mention throwing, hitting, baseball, or rotational sport.
    - Mobility reps are duration-based ("30 sec", "45 sec each side") — not heavy working sets.`;

  const sportPresets = `
Sport-aware mobility reference patterns (adapt to user goals — do not copy blindly):
| Sport / goal | Warmup emphasis | Cooldown emphasis |
| Baseball throw | Shoulder IR/ER, scap activation, thoracic rotation, hip hinge prep | Pec/lat, shoulder capsule, forearm |
| Baseball hit | Hip mobility, anti-rotation prep, thoracic rotation | Hip flexors, glutes, T-spine |
| General strength | Hip opener, T-spine, shoulder CARs | Muscles trained that day |
| Fat loss / conditioning | Dynamic full-body | Lower intensity static stretch |`;

  const system = `You are BuiltIQ Health's strength & conditioning program designer. You create science-based, periodized training plans as strict JSON only — no markdown, no prose outside JSON.

Rules:
1. Interpret the user's natural-language goal (sport, position, throw/hit power, hypertrophy, etc.) and design accordingly.
2. Each week must differ: vary exercises, rep schemes, and/or intensity across weeks (accumulation → intensification → deload/peak). Never photocopy identical workouts every week.
3. Prefer exercise names EXACTLY from the provided catalog when possible. For warmup/cooldown/mobility picks, strongly prefer mobility_catalog names.
4. Balance push/pull on strength days; avoid stacking the same movement pattern on consecutive training days.
5. Use realistic set/rep/RPE targets for the user's experience level.
6. Strength days: warmup 3–4 prep items (see rule 14); strength section 6–10 exercises; prefer compound lifts plus accessories; 3–4 working sets on main lifts. Optional supersets (2 exercises max per superset).
7. Strongly prefer exercises from the catalog that have form guides (has_form_guide: true — image, video, or instructions).
8. Frame guidance as general fitness/wellness — not medical advice.
9. Output ONLY valid JSON matching the schema below.
10. Match each workout's workout_type to the scheduled day_type for that day_label (${daySchedule}).${cardioRules}${mobilityDayRules}${cooldownRules}${warmupMobilityRules}
${sportPresets}

JSON schema:
{
  "program_name": "string (optional short title)",
  "program_summary": "string (1-2 sentences: sport/goals, weekly structure, periodization)",
  "program_style": "general|hypertrophy|strength|athletic_performance",
  "workouts": [
    {
      "week": 1,
      "day_label": "Mon",
      "workout_type": "Lower Body|Upper Body|Full Body|Cardio|Mobility",
      "warmup": [{ "name": "...", "muscle_group": "...", "sets": 1, "reps": "30 sec" }],
      "strength": [
        { "name": "...", "muscle_group": "...", "sets": 3, "reps": "8-12", "rpe": "7-8" },
        { "superset": [{ "name": "...", "sets": 3, "reps": "10-12" }, { "name": "...", "sets": 3, "reps": "10-12" }] }
      ]${includeCooldown ? ',\n      "cooldown": [{ "name": "...", "muscle_group": "...", "sets": 1, "reps": "45 sec each side" }]' : ''}
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
        include_cooldown: includeCooldown,
      },
      exercise_catalog: catalogRef,
      mobility_catalog: mobilityCatalog,
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

function countWorkoutItems(items: AiWorkoutItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isSupersetItem(item)) count += item.superset.length;
    else if (isExerciseItem(item)) count += 1;
  }
  return count;
}

function countStrengthExercises(strength: AiWorkoutItem[]): number {
  return countWorkoutItems(strength);
}

function isMobilityClassified(name: string, catalog: any[], catMap: Record<string, any>): boolean {
  const hit = matchExerciseToCatalog(name, catalog, catMap);
  if (String(hit?.exercise_type || '').toLowerCase() === 'mobility') return true;
  const cat = String(hit?.category || '').toLowerCase();
  if (cat === 'warmup' || cat === 'stretching' || cat === 'mobility') return true;
  return MOBILITY_NAME_PATTERN.test(name);
}

function countMobilityInItems(items: AiWorkoutItem[], catalog: any[], catMap: Record<string, any>): number {
  let count = 0;
  for (const item of items) {
    if (isSupersetItem(item)) {
      for (const ex of item.superset) {
        if (ex?.name && isMobilityClassified(ex.name, catalog, catMap)) count++;
      }
    } else if (isExerciseItem(item) && item.name && isMobilityClassified(item.name, catalog, catMap)) {
      count++;
    }
  }
  return count;
}

const MIN_STRENGTH_EXERCISES = 6;
const MIN_CARDIO_EXERCISES = 4;
const MIN_MOBILITY_EXERCISES = 6;

export function isRetryablePlanError(error: string | null): boolean {
  if (!error) return false;
  return (
    /too few (strength|conditioning|mobility) exercises/i.test(error) ||
    /warmup mobility/i.test(error) ||
    /cooldown/i.test(error) ||
    /incomplete/i.test(error)
  );
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

export function parseAndValidateAiPlan(
  raw: string,
  config: GenerationConfig,
  catalog: any[] = []
): { plan: AiProgramPlan | null; error: string | null } {
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
  const catMap = catalogByName(catalog);
  const includeCooldown = config.includeCooldown !== false;

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
    const cooldown = (Array.isArray(row?.cooldown) ? row.cooldown : [])
      .map(normalizeWorkoutItem)
      .filter(Boolean) as AiWorkoutItem[];

    if (!strength.length) continue;

    const strengthCount = countStrengthExercises(strength);
    const isCardioSession = workoutType === 'Cardio' || config.dayTypes[dayLabel] === 'Cardio';
    const isMobilitySession = workoutType === 'Mobility' || config.dayTypes[dayLabel] === 'Mobility';
    const isStrengthSession = !isCardioSession && !isMobilitySession;

    if (isMobilitySession) {
      const mobilityCount = countMobilityInItems(strength, catalog, catMap);
      if (strengthCount < MIN_MOBILITY_EXERCISES) {
        return {
          plan: null,
          error: `Too few mobility exercises in week ${week} ${dayLabel} (${strengthCount}; minimum ${MIN_MOBILITY_EXERCISES})`,
        };
      }
      if (mobilityCount < MIN_MOBILITY_EXERCISES) {
        return {
          plan: null,
          error: `Too few mobility-classified exercises in week ${week} ${dayLabel} Mobility day (${mobilityCount}; minimum ${MIN_MOBILITY_EXERCISES})`,
        };
      }
    } else {
      const minExercises = isCardioSession ? MIN_CARDIO_EXERCISES : MIN_STRENGTH_EXERCISES;
      if (strengthCount < minExercises) {
        const label = isCardioSession ? 'conditioning' : 'strength';
        return {
          plan: null,
          error: `Too few ${label} exercises in week ${week} ${dayLabel} (${strengthCount}; minimum ${minExercises})`,
        };
      }
    }

    if (isStrengthSession) {
      const warmupCount = countWorkoutItems(warmup);
      const mobilityInWarmup = countMobilityInItems(warmup, catalog, catMap);
      if (warmupCount < 3 || mobilityInWarmup < 2) {
        return {
          plan: null,
          error: `Warmup mobility insufficient in week ${week} ${dayLabel} (warmup ${warmupCount}, mobility items ${mobilityInWarmup}; need warmup >= 3 with >= 2 mobility)`,
        };
      }
      if (includeCooldown && cooldown.length < 2) {
        return {
          plan: null,
          error: `Cooldown too short in week ${week} ${dayLabel} (${cooldown.length}; minimum 2 on strength days)`,
        };
      }
    }

    const workout: AiWorkout = { week, day_label: dayLabel, workout_type: workoutType, warmup, strength };
    if (includeCooldown && cooldown.length) workout.cooldown = cooldown;
    workouts.push(workout);
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
    .filter((c) => !c?.is_archived && !isUserCustomExercise(c))
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
    if (item?.is_archived || isUserCustomExercise(item)) continue;
    const iname = String(item.name || '').toLowerCase();
    if (iname.includes(lower) || lower.includes(iname)) {
      const score = 80 + iname.length;
      const guideBoost = hasExerciseGuide(item) ? 1 : 0;
      if (score > bestScore || (score === bestScore && guideBoost && !hasExerciseGuide(best))) {
        bestScore = score;
        best = item;
      }
      continue;
    }
    const itokens = tokenize(iname);
    const overlap = tokens.filter((t) => itokens.some((it) => it.includes(t) || t.includes(it))).length;
    if (overlap >= 2) {
      const score = overlap;
      const guideBoost = hasExerciseGuide(item) ? 1 : 0;
      if (score > bestScore || (score === bestScore && guideBoost && !hasExerciseGuide(best))) {
        bestScore = score;
        best = item;
      }
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

    for (const sec of ['warmup', 'strength', 'cooldown'] as const) {
      const list = tpl[sec] || [];
      if (!list.length) continue;
      const startSort = SECTION_SORT_BASE[sec] ?? 0;
      const { error: ie } = await insertSectionItems(supabase, w.id, sec, list, startSort, catalog, catMap);
      if (ie) return { programId: null, error: ie };
    }
  }

  return { programId: program.id, error: null };
}
