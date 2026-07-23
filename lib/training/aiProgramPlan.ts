/** BIQ-0014: AI-driven program generation — prompt, validation, catalog matching */

import { inferExerciseType } from './exerciseTypes';
import { hasExerciseGuide } from './exerciseMedia';
import { filterCatalogByEquipment, hasEquipmentFilter, normalizeEquipmentList } from './equipmentFilter';
import { mondayOfWeek, todayYmd } from './programCalendar';
import { isMissingProgramStatusColumn } from './programStatus';

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
  coaching_notes?: string;
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
  availableEquipment?: string[];
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
  limit = 500,
  availableEquipment?: string[] | null
): { name: string; muscle_group: string; movement_pattern: string; equipment: string; has_form_guide: boolean }[] {
  const tokens = promptTokens(userPrompt);
  let pool = (catalog || []).filter((c) => !isUserCustomExercise(c));
  if (hasEquipmentFilter(availableEquipment)) {
    pool = filterCatalogByEquipment(pool, availableEquipment);
  }
  return pool
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
  limit = 100,
  availableEquipment?: string[] | null
): { name: string; muscle_group: string; exercise_type: string; has_form_guide: boolean }[] {
  const tokens = promptTokens(userPrompt);
  let pool = (catalog || []).filter((c) => !isUserCustomExercise(c));
  if (hasEquipmentFilter(availableEquipment)) {
    pool = filterCatalogByEquipment(pool, availableEquipment);
  }
  return pool
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
  const equipment = normalizeEquipmentList(
    config.availableEquipment?.length ? config.availableEquipment : profile?.available_equipment
  );
  const catalogRef = selectCatalogForAi(catalog, userPrompt, 500, equipment);
  const mobilityCatalog = selectMobilityCatalogForAi(catalog, userPrompt, 100, equipment);
  const equipmentNote = hasEquipmentFilter(equipment)
    ? `15. EQUIPMENT: User only has access to: ${equipment.join(', ')}. Use ONLY exercises from exercise_catalog/mobility_catalog that match this equipment (bodyweight/mobility stretches are always OK). Do not prescribe barbell/dumbbell/cable exercises requiring unavailable equipment.`
    : '';
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

  const system = `You are BuildIQ Health's strength & conditioning program designer. You create science-based, periodized training plans as strict JSON only — no markdown, no prose outside JSON.

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
10. Match each workout's workout_type to the scheduled day_type for that day_label (${daySchedule}).${equipmentNote}${cardioRules}${mobilityDayRules}${cooldownRules}${warmupMobilityRules}
${sportPresets}

JSON schema:
{
  "program_name": "string (optional short title)",
  "program_summary": "string (3-5 sentences: sport/goals, weekly structure, periodization phases, what success looks like)",
  "coaching_notes": "string (4-8 sentences of practical coaching: how to progress loads, recovery tips, form cues tied to the user's sport/goals, deload guidance — general wellness only, not medical advice)",
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

Generate exactly one workout entry per (week × training day) for all ${config.weeks} weeks and days: ${config.days.join(', ')}. Always fill program_summary and coaching_notes with helpful, specific text for this athlete.`;

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
        available_equipment: equipment.length ? equipment : null,
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
  const coachingNotes = String(parsed.coaching_notes || '').trim();

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
  const softIssues: string[] = [];

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
      if (strengthCount < MIN_MOBILITY_EXERCISES) {
        softIssues.push(
          `Too few mobility exercises in week ${week} ${dayLabel} (${strengthCount}; minimum ${MIN_MOBILITY_EXERCISES})`
        );
      } else {
        const mobilityCount = countMobilityInItems(strength, catalog, catMap);
        if (mobilityCount < MIN_MOBILITY_EXERCISES) {
          softIssues.push(
            `Too few mobility-classified exercises in week ${week} ${dayLabel} Mobility day (${mobilityCount}; minimum ${MIN_MOBILITY_EXERCISES})`
          );
        }
      }
    } else {
      const minExercises = isCardioSession ? MIN_CARDIO_EXERCISES : MIN_STRENGTH_EXERCISES;
      if (strengthCount < minExercises) {
        const label = isCardioSession ? 'conditioning' : 'strength';
        softIssues.push(
          `Too few ${label} exercises in week ${week} ${dayLabel} (${strengthCount}; minimum ${minExercises})`
        );
      }
    }

    if (isStrengthSession) {
      const warmupCount = countWorkoutItems(warmup);
      const mobilityInWarmup = countMobilityInItems(warmup, catalog, catMap);
      if (warmupCount < 3 || mobilityInWarmup < 2) {
        softIssues.push(
          `Warmup mobility insufficient in week ${week} ${dayLabel} (warmup ${warmupCount}, mobility items ${mobilityInWarmup}; need warmup >= 3 with >= 2 mobility)`
        );
      }
      if (includeCooldown && cooldown.length < 2) {
        softIssues.push(
          `Cooldown too short in week ${week} ${dayLabel} (${cooldown.length}; minimum 2 on strength days)`
        );
      }
    }

    const workout: AiWorkout = { week, day_label: dayLabel, workout_type: workoutType, warmup, strength };
    if (includeCooldown && cooldown.length) workout.cooldown = cooldown;
    workouts.push(workout);
  }

  if (!workouts.length) return { plan: null, error: 'No valid workouts after validation' };

  const missing = Array.from(expectedKeys).filter((k) => !seen.has(k));
  // Allow filling gaps from nearest completed week when most of the plan is present
  if (missing.length > Math.max(config.days.length, Math.floor(expectedKeys.size * 0.35))) {
    return {
      plan: null,
      error: `AI plan incomplete — missing workouts for: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
    };
  }

  let plan: AiProgramPlan = {
    program_name: parsed.program_name ? String(parsed.program_name).trim() : undefined,
    program_summary: summary,
    coaching_notes: coachingNotes || undefined,
    program_style: parsed.program_style ? String(parsed.program_style) : 'athletic_performance',
    workouts: workouts.sort((a, b) => a.week - b.week || DAY_ORDER.indexOf(a.day_label) - DAY_ORDER.indexOf(b.day_label)),
  };

  if (missing.length || softIssues.length) {
    plan = repairAiPlan(plan, config, catalog, missing);
  }

  // Hard-fail only if repair still left critical gaps (no strength work)
  const stillBroken = plan.workouts.some((w) => {
    const isCardio = w.workout_type === 'Cardio' || config.dayTypes[w.day_label] === 'Cardio';
    const isMob = w.workout_type === 'Mobility' || config.dayTypes[w.day_label] === 'Mobility';
    const min = isMob ? MIN_MOBILITY_EXERCISES : isCardio ? MIN_CARDIO_EXERCISES : MIN_STRENGTH_EXERCISES;
    return countStrengthExercises(w.strength || []) < min;
  });
  if (stillBroken) {
    return {
      plan: null,
      error: softIssues[0] || 'AI plan still missing required exercises after repair — please retry',
    };
  }

  return { plan, error: null };
}

function mobilityFallbackExercises(catalog: any[], count: number, seed: string): AiExercise[] {
  const pool = selectMobilityCatalogForAi(catalog, seed || 'mobility stretch hips shoulders', 40);
  const picks = pool.length
    ? pool
    : [
        { name: 'Worlds Greatest Stretch', muscle_group: 'Full Body', exercise_type: 'mobility', has_form_guide: false },
        { name: 'Cat Cow', muscle_group: 'Back', exercise_type: 'mobility', has_form_guide: false },
        { name: 'Hip Flexor Stretch', muscle_group: 'Hips', exercise_type: 'mobility', has_form_guide: false },
        { name: 'Pigeon Stretch', muscle_group: 'Glutes', exercise_type: 'mobility', has_form_guide: false },
        { name: 'Thoracic Rotation', muscle_group: 'Back', exercise_type: 'mobility', has_form_guide: false },
        { name: 'Shoulder Dislocates', muscle_group: 'Shoulders', exercise_type: 'mobility', has_form_guide: false },
        { name: 'Hamstring Stretch', muscle_group: 'Hamstrings', exercise_type: 'mobility', has_form_guide: false },
        { name: 'Foam Roll Quads', muscle_group: 'Quads', exercise_type: 'mobility', has_form_guide: false },
      ];
  const out: AiExercise[] = [];
  for (let i = 0; i < count; i++) {
    const item = picks[i % picks.length];
    out.push({
      name: item.name,
      muscle_group: item.muscle_group || 'Mobility',
      sets: 1,
      reps: '30-45 sec',
      rpe: '',
    });
  }
  return out;
}

function activationFallback(): AiExercise {
  return { name: 'Easy Bike or Brisk Walk', muscle_group: 'Cardio', sets: 1, reps: '3-5 min', rpe: '4-5' };
}

function cloneWorkoutForGap(source: AiWorkout, week: number, dayLabel: string, workoutType: string): AiWorkout {
  return {
    week,
    day_label: dayLabel,
    workout_type: workoutType,
    warmup: JSON.parse(JSON.stringify(source.warmup || [])),
    strength: JSON.parse(JSON.stringify(source.strength || [])),
    cooldown: source.cooldown ? JSON.parse(JSON.stringify(source.cooldown)) : undefined,
  };
}

/** Pad warmup/cooldown/mobility and fill missing week/day slots from nearest prior workout. */
export function repairAiPlan(
  plan: AiProgramPlan,
  config: GenerationConfig,
  catalog: any[],
  missingKeys: string[] = []
): AiProgramPlan {
  const catMap = catalogByName(catalog);
  const includeCooldown = config.includeCooldown !== false;
  const byKey = new Map(plan.workouts.map((w) => [`${w.week}|${w.day_label}`, w]));

  for (const key of missingKeys) {
    const [weekStr, dayLabel] = key.split('|');
    const week = Number(weekStr);
    const workoutType = config.dayTypes[dayLabel] || 'Full Body';
    let donor: AiWorkout | undefined;
    for (let w = week - 1; w >= 1 && !donor; w--) {
      donor = byKey.get(`${w}|${dayLabel}`);
    }
    if (!donor) {
      donor = plan.workouts.find((x) => x.day_label === dayLabel) || plan.workouts[0];
    }
    if (!donor) continue;
    const cloned = cloneWorkoutForGap(donor, week, dayLabel, workoutType);
    byKey.set(key, cloned);
  }

  const repaired: AiWorkout[] = [];
  for (const w of Array.from(byKey.values())) {
    const isCardioSession = w.workout_type === 'Cardio' || config.dayTypes[w.day_label] === 'Cardio';
    const isMobilitySession = w.workout_type === 'Mobility' || config.dayTypes[w.day_label] === 'Mobility';
    const isStrengthSession = !isCardioSession && !isMobilitySession;
    let warmup = [...(w.warmup || [])];
    let strength = [...(w.strength || [])];
    let cooldown = [...(w.cooldown || [])];
    const seed = `${config.prompt} ${w.workout_type} ${w.day_label}`;

    if (isStrengthSession) {
      while (countWorkoutItems(warmup) < 3 || countMobilityInItems(warmup, catalog, catMap) < 2) {
        const needMobility = countMobilityInItems(warmup, catalog, catMap) < 2;
        if (needMobility) warmup.push(...mobilityFallbackExercises(catalog, 1, seed + ' warmup'));
        else warmup.unshift(activationFallback());
        if (countWorkoutItems(warmup) > 6) break;
      }
      if (includeCooldown) {
        while (cooldown.length < 2) {
          cooldown.push(...mobilityFallbackExercises(catalog, 1, seed + ' cooldown'));
          if (cooldown.length > 4) break;
        }
      }
    }

    if (isMobilitySession) {
      while (
        countStrengthExercises(strength) < MIN_MOBILITY_EXERCISES ||
        countMobilityInItems(strength, catalog, catMap) < MIN_MOBILITY_EXERCISES
      ) {
        strength.push(...mobilityFallbackExercises(catalog, 1, seed + ' mobility day'));
        if (countStrengthExercises(strength) > 12) break;
      }
      if (!warmup.length) warmup = [activationFallback()];
    }

    if (isCardioSession && countStrengthExercises(strength) < MIN_CARDIO_EXERCISES) {
      const cardioPads: AiExercise[] = [
        { name: 'Assault Bike Intervals', muscle_group: 'Cardio', sets: 4, reps: '30 sec hard / 60 sec easy', rpe: '8' },
        { name: 'Row Erg Steady', muscle_group: 'Cardio', sets: 1, reps: '8-10 min', rpe: '6-7' },
        { name: 'Jump Rope', muscle_group: 'Cardio', sets: 3, reps: '45 sec', rpe: '7' },
        { name: 'Treadmill Incline Walk', muscle_group: 'Cardio', sets: 1, reps: '10 min', rpe: '5-6' },
      ];
      let i = 0;
      while (countStrengthExercises(strength) < MIN_CARDIO_EXERCISES && i < cardioPads.length) {
        strength.push(cardioPads[i++]);
      }
    }

    if (!isCardioSession && !isMobilitySession && countStrengthExercises(strength) < MIN_STRENGTH_EXERCISES) {
      // Cannot invent safe heavy lifts without context — leave for hard-fail / AI retry
    }

    const next: AiWorkout = {
      week: w.week,
      day_label: w.day_label,
      workout_type: w.workout_type,
      warmup,
      strength,
    };
    if (includeCooldown && cooldown.length) next.cooldown = cooldown;
    repaired.push(next);
  }

  const expectedKeys = new Set<string>();
  for (let week = 1; week <= config.weeks; week++) {
    config.days.forEach((d) => expectedKeys.add(`${week}|${d}`));
  }
  const finalWorkouts = repaired
    .filter((w) => expectedKeys.has(`${w.week}|${w.day_label}`))
    .sort((a, b) => a.week - b.week || DAY_ORDER.indexOf(a.day_label) - DAY_ORDER.indexOf(b.day_label));

  let summary = plan.program_summary;
  if (!summary || summary.length < 40) {
    summary = `${plan.program_name || 'BuildIQ Health program'} — ${config.weeks}-week plan on ${config.days.join(', ')}. Built around your goals: ${config.prompt.slice(0, 180)}. Progress intensity across weeks and keep form quality high.`;
  }
  let coaching = plan.coaching_notes || '';
  if (!coaching || coaching.length < 60) {
    coaching = `Use week 1 to establish technique and baseline loads. Add small weekly progressions on main lifts when all sets feel controlled. Prioritize sleep and a light walk on rest days. If a movement feels painful (not just challenging), swap to a catalog alternative that matches your equipment. This is general fitness guidance, not medical advice.`;
  }

  return {
    ...plan,
    program_summary: summary,
    coaching_notes: coaching,
    workouts: finalWorkouts,
  };
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

type PendingExerciseInsert = {
  payload: Record<string, unknown>;
  planned: { sets: number; reps: string; rpe: string; target_weight: string };
};

const PLANNED_SET_INSERT_CHUNK = 500;

function collectSectionItems(
  workoutId: string,
  section: string,
  list: AiWorkoutItem[],
  startSort: number,
  catalog: any[],
  catMap: Record<string, any>
): { exercises: PendingExerciseInsert[]; error: string | null } {
  const exercises: PendingExerciseInsert[] = [];
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
        exercises.push({
          payload: {
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
          },
          planned: {
            sets: exItem.sets || 3,
            reps: exItem.reps || '',
            rpe: exItem.rpe || '',
            target_weight: exItem.target_weight || '',
          },
        });
      }
      sort++;
    } else if (isExerciseItem(item)) {
      const hit = matchExerciseToCatalog(item.name, catalog, catMap);
      const exType = inferExerciseType(item.name, hit?.muscle_group || item.muscle_group, section, hit?.exercise_type);
      exercises.push({
        payload: {
          workout_id: workoutId,
          section,
          sort_order: sort,
          name: hit?.name || item.name,
          muscle_group: hit?.muscle_group || item.muscle_group || 'Muscle',
          catalog_exercise_id: hit?.id || null,
          exercise_type: exType,
          superset_group_id: null,
        },
        planned: {
          sets: item.sets || 3,
          reps: item.reps || '',
          rpe: item.rpe || '',
          target_weight: item.target_weight || '',
        },
      });
      sort++;
    }
  }

  return { exercises, error: null };
}

async function insertPlannedSetRows(supabase: any, rows: any[]): Promise<{ error: string | null }> {
  for (let i = 0; i < rows.length; i += PLANNED_SET_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + PLANNED_SET_INSERT_CHUNK);
    const { error } = await supabase.from('st_planned_sets').insert(chunk);
    if (error) return { error: error.message };
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
    start_date: mondayOfWeek(todayYmd()),
    focus_muscles: config.focusMuscles?.length ? config.focusMuscles : null,
    generation_prompt: config.prompt.trim(),
    generation_method: 'ai',
    program_summary: plan.program_summary,
    coaching_notes: plan.coaching_notes || null,
    program_style: plan.program_style || null,
    status: 'draft',
  };

  const { data: program, error: pErr } = await supabase.from('st_programs').insert(programPayload).select().single();
  if ((pErr || !program) && isMissingProgramStatusColumn(pErr)) {
    const { status: _s, ...fallbackPayload } = programPayload;
    const retry = await supabase.from('st_programs').insert(fallbackPayload).select().single();
    if (retry.data && !retry.error) {
      return persistWorkoutsForProgram(supabase, retry.data.id, plan, config, catalog, catMap);
    }
  }
  if (pErr || !program) return { programId: null, error: pErr?.message || 'Failed to create program' };

  return persistWorkoutsForProgram(supabase, program.id, plan, config, catalog, catMap);
}

async function persistWorkoutsForProgram(
  supabase: any,
  programId: string,
  plan: AiProgramPlan,
  config: GenerationConfig,
  catalog: any[],
  catMap: Record<string, any>
): Promise<{ programId: string | null; error: string | null }> {
  const workoutRows = plan.workouts.map((w) => ({
    program_id: programId,
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
  const pendingExercises: PendingExerciseInsert[] = [];

  for (const w of insertedWorkouts) {
    const tpl = planByKey.get(`${w.week}|${w.day_label}`);
    if (!tpl) continue;

    for (const sec of ['warmup', 'strength', 'cooldown'] as const) {
      const list = tpl[sec] || [];
      if (!list.length) continue;
      const { exercises } = collectSectionItems(w.id, sec, list, SECTION_SORT_BASE[sec] ?? 0, catalog, catMap);
      pendingExercises.push(...exercises);
    }
  }

  if (!pendingExercises.length) return { programId, error: null };

  const { data: insertedExercises, error: exErr } = await supabase
    .from('st_exercises')
    .insert(pendingExercises.map((entry) => entry.payload))
    .select('id');

  if (exErr || !insertedExercises?.length) {
    return { programId: null, error: exErr?.message || 'Failed to create exercises' };
  }
  if (insertedExercises.length !== pendingExercises.length) {
    return { programId: null, error: 'Failed to create all exercises for the AI program' };
  }

  const plannedSetRows = insertedExercises.flatMap((row: { id: string }, index: number) => {
    const meta = pendingExercises[index].planned;
    return buildPlannedSetRows(meta.sets).map((r, i) => ({
      ...r,
      exercise_id: row.id,
      target_reps: meta.reps || '',
      target_rpe: meta.rpe || '',
      target_weight: meta.target_weight || '',
      set_number: i + 1,
    }));
  });

  if (plannedSetRows.length) {
    const { error: setErr } = await insertPlannedSetRows(supabase, plannedSetRows);
    if (setErr) return { programId: null, error: setErr };
  }

  return { programId, error: null };
}
