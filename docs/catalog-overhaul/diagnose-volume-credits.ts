/**
 * Read-only volume-credit diagnosis. Does not write Supabase or change production generate.
 * Writes docs/catalog-overhaul/volume-credit-diagnosis.json
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchAllExerciseCatalog } from '../../lib/training/catalogFetch';
import { adaptGenerationCatalog, selectAiGenerationCatalogRows } from '../../lib/scienceEngine/generation/catalogEligibility';
import { generateProgram } from '../../lib/scienceEngine/generateProgram';
import { calculateWeeklyVolume } from '../../lib/scienceEngine/volume';
import { contributionsForExercise, creditSets } from '../../lib/scienceEngine/contributions';
import { buildGenerationContext } from '../../lib/scienceEngine/generation/context';
import { libraryById } from '../../lib/scienceEngine/generation/library';
import { requestWeekProgram, parseWeekProgram } from '../../lib/scienceEngine/generation/openaiClient';
import { buildDesignerInstructions, buildDesignerUserContent } from '../../lib/scienceEngine/generation/prompt';
import { validateAiProgram } from '../../lib/scienceEngine/generation/validateAiProgram';
import { SCIENCE_RULES_V1 } from '../../lib/scienceEngine/rules';
import { isMajorMuscle } from '../../lib/scienceEngine/rules';
import { MAJOR_MUSCLES, type MuscleId } from '../../lib/scienceEngine/taxonomy';
import type { CatalogExercise, TrainingProfile } from '../../lib/scienceEngine/types';
import type { AiWeekProgram } from '../../lib/scienceEngine/generation/types';

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

const TEST_PROFILE: TrainingProfile = {
  userId: 'volume-diag',
  primaryGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 3,
  preferredDays: ['Mon', 'Wed', 'Fri'],
  preferredSessionMinutes: 60,
  availableEquipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'rack', 'bodyweight'],
  preferredExercises: [],
  excludedExercises: [],
  injuryLimitations: [],
  painAreas: [],
  priorityMuscles: [],
  lowPriorityMuscles: [],
  warmupStyle: 'dynamic',
  warmupDuration: 'standard',
  potentiationPreference: 'automatic',
  includeCooldown: true,
  weeks: 6,
  supersetPreference: 'sometimes',
  varietyPreference: 'balanced',
  trainingSplit: 'full_body',
  trainingFeel: [],
  intakeNotes: 'Intermediate hypertrophy 3 days Mon Wed Fri 60 minutes Full Body Balanced supersets sometimes.',
  explicitDayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
};

const WATCH = [
  'upper_back',
  'lats',
  'rear_delts',
  'biceps',
  'chest',
  'quads',
  'hamstrings',
  'glutes',
  'front_delts',
  'side_delts',
  'triceps',
];

function flattenStrength(program: AiWeekProgram) {
  return (program.workouts || []).flatMap((w) =>
    (w.strength || []).flatMap((block) =>
      (block.exercises || []).map((ex) => ({
        day: w.day_label,
        name: w.name,
        ...ex,
      }))
    )
  );
}

function rawCredits(raw: any): Array<{ muscle: string; credit: number }> {
  const credits = raw?.coaching_metadata?.hypertrophy_volume_credits;
  if (!Array.isArray(credits)) return [];
  return credits.map((row: any) => ({ muscle: String(row.muscle || ''), credit: Number(row.credit) || 0 }));
}

function proposedCredits(ex: CatalogExercise): Array<{ muscle: string; credit: number }> {
  const n = ex.name.toLowerCase();
  const pattern = ex.movementPattern;
  const policy = String(ex.raw?.coaching_metadata?.volume_policy || '');
  const warmup = !!ex.warmupSuitable && ex.programRoles.every((r) => r === 'warmup' || r === 'power');
  if (policy === 'zero_non_hypertrophy' || warmup || /stretch|mobility|hang|jump rope|treadmill/.test(n)) {
    return [];
  }
  if (/face pull|reverse fly|rear-?delt|band pull-?apart/.test(n)) {
    return [
      { muscle: 'rear_delts', credit: 1 },
      { muscle: 'upper_back', credit: 0.5 },
    ];
  }
  if (/upright row/.test(n)) return [{ muscle: 'side_delts', credit: 1 }];
  if (pattern === 'horizontal_pull' || (/\brow\b/.test(n) && !/upright/.test(n))) {
    return [
      { muscle: 'upper_back', credit: 1 },
      { muscle: 'lats', credit: 0.5 },
      { muscle: 'biceps', credit: 0.5 },
    ];
  }
  if (pattern === 'vertical_pull' || /pull-?up|chin-?up|lat pulldown|pulldown/.test(n)) {
    return [
      { muscle: 'lats', credit: 1 },
      { muscle: 'upper_back', credit: 0.5 },
      { muscle: 'biceps', credit: 0.5 },
    ];
  }
  if (pattern === 'horizontal_push' || /bench press|chest press|push-?up/.test(n)) {
    return [
      { muscle: 'chest', credit: 1 },
      { muscle: 'triceps', credit: 0.5 },
      { muscle: 'front_delts', credit: 0.5 },
    ];
  }
  if (pattern === 'vertical_push' || /overhead press|military press|shoulder press/.test(n)) {
    return [
      { muscle: 'front_delts', credit: 1 },
      { muscle: 'triceps', credit: 0.5 },
    ];
  }
  if (/lateral raise|side raise/.test(n)) return [{ muscle: 'side_delts', credit: 1 }];
  if (/front raise/.test(n)) return [{ muscle: 'front_delts', credit: 1 }];
  if (pattern === 'squat' || pattern === 'lunge') {
    const glutePrimary = ex.primaryMuscles[0] === 'glutes';
    return glutePrimary
      ? [
          { muscle: 'glutes', credit: 1 },
          { muscle: 'quads', credit: 0.5 },
        ]
      : [
          { muscle: 'quads', credit: 1 },
          { muscle: 'glutes', credit: 0.5 },
        ];
  }
  if (pattern === 'hinge' || /deadlift|rdl|hip thrust/.test(n)) {
    if (/hip thrust|glute bridge|frog pump/.test(n)) {
      return [
        { muscle: 'glutes', credit: 1 },
        { muscle: 'hamstrings', credit: 0.5 },
      ];
    }
    return [
      { muscle: 'hamstrings', credit: 1 },
      { muscle: 'glutes', credit: 0.5 },
    ];
  }
  if (/curl/.test(n) && !/leg curl|hamstring/.test(n)) return [{ muscle: 'biceps', credit: 1 }];
  if (/extension|pushdown|kickback/.test(n) && /tricep|pushdown|skull|overhead/.test(n)) return [{ muscle: 'triceps', credit: 1 }];
  if (/leg curl|nordic/.test(n)) return [{ muscle: 'hamstrings', credit: 1 }];
  if (/leg extension/.test(n)) return [{ muscle: 'quads', credit: 1 }];
  if (/calf/.test(n)) return [{ muscle: 'calves', credit: 1 }];
  if (ex.primaryMuscles[0]) {
    const credits = [{ muscle: ex.primaryMuscles[0], credit: 1 }];
    if (ex.secondaryMuscles[0] && ['chest', 'upper_back', 'lats', 'quads', 'hamstrings', 'glutes', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps'].includes(ex.secondaryMuscles[0])) {
      credits.push({ muscle: ex.secondaryMuscles[0], credit: 0.5 });
    }
    return credits;
  }
  return [];
}

function mapFromCredits(rows: Array<{ muscle: string; credit: number }>, sets: number) {
  const out: Record<string, number> = {};
  rows.forEach((row) => {
    out[row.muscle] = (out[row.muscle] || 0) + sets * row.credit;
  });
  return out;
}

function weeklyFromProgram(
  program: AiWeekProgram,
  catalogById: Map<string, CatalogExercise>,
  mode: 'current' | 'proposed'
) {
  const totals: Record<string, number> = {};
  flattenStrength(program).forEach((ex) => {
    const catalog = catalogById.get(ex.exercise_id);
    if (!catalog) return;
    const credits =
      mode === 'proposed'
        ? proposedCredits(catalog)
        : contributionsForExercise(catalog).map((c) => ({ muscle: c.muscle, credit: c.contribution }));
    const gained = mapFromCredits(credits, ex.working_sets);
    Object.entries(gained).forEach(([muscle, value]) => {
      totals[muscle] = (totals[muscle] || 0) + value;
    });
  });
  return totals;
}

function suspicious(ex: CatalogExercise, current: Array<{ muscle: string; credit: number }>, proposed: Array<{ muscle: string; credit: number }>) {
  const n = ex.name.toLowerCase();
  const reasons: string[] = [];
  const cur = Object.fromEntries(current.map((c) => [c.muscle, c.credit]));
  const prop = Object.fromEntries(proposed.map((c) => [c.muscle, c.credit]));
  if ((ex.movementPattern === 'horizontal_pull' || (/\brow\b/.test(n) && !/upright/.test(n))) && (cur.upper_back || 0) < 1 && (prop.upper_back || 0) >= 1) {
    reasons.push('horizontal row under-credits upper_back (lat-primary enrichment)');
  }
  if ((ex.movementPattern === 'vertical_pull' || /pull-?up|chin-?up|lat pulldown/.test(n)) && (cur.upper_back || 0) === 0 && (prop.upper_back || 0) > 0) {
    reasons.push('vertical pull missing upper_back secondary credit');
  }
  if (/face pull|reverse fly|rear-?delt/.test(n) && (cur.rear_delts || 0) < 1) {
    reasons.push('rear-delt isolation missing rear_delts 1.0');
  }
  if (current.length === 0 && proposed.length > 0 && !ex.warmupSuitable) {
    reasons.push('working lift has empty hypertrophy_volume_credits');
  }
  if ((cur.lats || 0) === 1 && (cur.upper_back || 0) === 1 && ex.movementPattern.includes('pull')) {
    reasons.push('double-full pull credit (lats 1 + upper_back 1) — avoid');
  }
  return reasons;
}

async function main() {
  loadEnvLocal();
  const report: any = {
    generated_at: new Date().toISOString(),
    scenario: {
      experience: 'intermediate',
      goal: 'hypertrophy',
      days: ['Mon', 'Wed', 'Fri'],
      minutes: 60,
      split: 'full_body',
      variety: 'balanced',
      supersets: 'sometimes',
    },
    contribution_model: {
      '1.0': 'Primary hypertrophy stimulus. One working set counts as one equivalent set for that muscle.',
      '0.5': 'Meaningful secondary hypertrophy stimulus. One working set counts as half an equivalent set.',
      '0.25': 'Reserved. Not used by current SCIENCE_RULES (primary=1, secondary=0.5). Do not invent it for this pass.',
      '0': 'No hypertrophy set credit: stabilizer, warmup, mobility, stretch, hang, cardio, olympic/power practice.',
    },
    precedence_proposed: {
      order: [
        'coaching_metadata.hypertrophy_volume_credits if non-empty (authoritative for the 260)',
        'do not merge name-defaults into explicit credits',
        'muscle_targets / primaryMuscles / NAME_DEFAULTS only for legacy or incomplete rows',
      ],
      current_runtime_order: [
        'stored contribution rows if passed',
        'hypertrophy_volume_credits, then BIQ-0228 merges missing NAME_DEFAULTS muscles',
        'muscle_targets mapped through 1.0/0.5, then same name-default merge',
        'NAME_DEFAULTS',
        'primaryMuscles 1.0 + secondaryMuscles 0.5',
      ],
    },
  };

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  const fetched = await fetchAllExerciseCatalog(supabase);
  const rawRows = selectAiGenerationCatalogRows(fetched.data || []);
  const catalog = adaptGenerationCatalog(rawRows);
  report.catalog_counts = {
    raw_fetch: (fetched.data || []).length,
    ai_eligible: rawRows.length,
    adapted: catalog.length,
  };

  const targets = calculateWeeklyVolume(TEST_PROFILE);
  report.weekly_targets = targets.map((t) => ({
    muscle: t.muscle,
    targetSets: t.targetSets,
    minSets: t.minSets,
    maxSets: t.maxSets,
    priority: t.priority,
    major: isMajorMuscle(t.muscle),
  }));
  report.upper_back_target_explanation = {
    value: targets.find((t) => t.muscle === 'upper_back')?.targetSets,
    lats_value: targets.find((t) => t.muscle === 'lats')?.targetSets,
    formula:
      'calculateWeeklyVolume: intermediate.major.start (10) * normal priority (1.0) = 10. Same formula as chest/lats/quads/hamstrings/glutes.',
    definition:
      'targetSets are equivalent working sets after contribution weighting. A 3-set row at upper_back 1.0 = 3. A 3-set chin-up at upper_back 0.5 = 1.5.',
    validator:
      'VOLUME_OFF error if major got < 1, or hypertrophy && got/target < 0.5 (so upper_back 10 requires at least 5 equivalent sets). Warning below 0.7.',
    same_set_definition:
      'Yes: the input target and exercise credits use the same equivalent-set unit. They do not currently use the same muscle role (rows were enriched as lat-primary).',
    rules: {
      primaryContribution: SCIENCE_RULES_V1.primaryContribution,
      secondaryContribution: SCIENCE_RULES_V1.secondaryContribution,
      intermediate_major: SCIENCE_RULES_V1.volumeBands.intermediate.major,
      major_muscles: MAJOR_MUSCLES,
    },
  };

  const catalogById = new Map(catalog.filter((ex) => ex.id).map((ex) => [String(ex.id), ex]));
  const audit = catalog.map((ex) => {
    const stored = rawCredits(ex.raw);
    const current = contributionsForExercise(ex).map((c) => ({ muscle: c.muscle, credit: c.contribution }));
    const proposed = proposedCredits(ex);
    const reasons = suspicious(ex, current, proposed);
    return {
      id: ex.id,
      name: ex.name,
      pattern: ex.movementPattern,
      primary_muscles: ex.primaryMuscles,
      secondary_muscles: ex.secondaryMuscles,
      stored_hypertrophy_volume_credits: stored,
      current_runtime_map: current,
      proposed_credits: proposed,
      suspicious: reasons,
      changed: JSON.stringify(current) !== JSON.stringify(proposed),
    };
  });
  report.audit_summary = {
    total: audit.length,
    with_stored_credits: audit.filter((r) => r.stored_hypertrophy_volume_credits.length).length,
    empty_stored_credits: audit.filter((r) => !r.stored_hypertrophy_volume_credits.length).length,
    suspicious_count: audit.filter((r) => r.suspicious.length).length,
    proposed_changes: audit.filter((r) => r.changed && r.proposed_credits.length + r.current_runtime_map.length > 0).length,
  };
  report.suspicious_master_exercises = audit.filter((r) => r.suspicious.length);
  report.focus_pulls = audit.filter((r) =>
    /row|pull-?up|chin-?up|pulldown|face pull|reverse fly|rear.?delt|pull-?apart/i.test(r.name)
  );
  report.proposed_corrections = audit
    .filter((r) => r.changed)
    .map((r) => ({
      exercise: r.name,
      id: r.id,
      current_credits: r.current_runtime_map,
      stored_credits: r.stored_hypertrophy_volume_credits,
      proposed_credits: r.proposed_credits,
      reason: r.suspicious.join('; ') || 'align stored/runtime credits with proposed pattern model',
    }));

  const science = generateProgram(TEST_PROFILE, catalog);
  const { context } = buildGenerationContext({
    profile: TEST_PROFILE,
    program: science,
    catalog,
    userPrompt: TEST_PROFILE.intakeNotes || '',
    programName: 'Volume diagnosis',
    mode: 'full_program',
  });
  const library = libraryById(context);

  let aiProgram: AiWeekProgram | null = null;
  let aiMeta: any = { skipped: true };
  if (process.env.OPENAI_API_KEY) {
    const call = await requestWeekProgram({
      apiKey: process.env.OPENAI_API_KEY,
      system: buildDesignerInstructions(context),
      user: buildDesignerUserContent(context),
    });
    aiProgram = call.program || parseWeekProgram(call.raw);
    aiMeta = {
      skipped: false,
      model: call.model,
      latency_note: 'single design call, no deterministic repair',
      error: call.error,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      reasoning_tokens: call.reasoningTokens,
    };
  }
  report.ai_call = aiMeta;

  if (aiProgram) {
    const traces = flattenStrength(aiProgram).map((ex) => {
      const catalogRow = catalogById.get(ex.exercise_id);
      const stored = catalogRow ? rawCredits(catalogRow.raw) : [];
      const current = catalogRow ? contributionsForExercise(catalogRow) : [];
      const proposed = catalogRow ? proposedCredits(catalogRow) : [];
      return {
        day: ex.day,
        name: catalogRow?.name || ex.exercise_id,
        catalog_id: ex.exercise_id,
        sets: ex.working_sets,
        role: ex.role,
        movement_pattern: catalogRow?.movementPattern || null,
        catalog_primary_muscles: catalogRow?.primaryMuscles || [],
        catalog_secondary_muscles: catalogRow?.secondaryMuscles || [],
        stored_hypertrophy_volume_credits: stored,
        current_contribution_map: current,
        current_set_credits: catalogRow ? creditSets(current, ex.working_sets) : {},
        proposed_credits: proposed,
        proposed_set_credits: mapFromCredits(proposed, ex.working_sets),
      };
    });
    const currentWeekly = weeklyFromProgram(aiProgram, catalogById, 'current');
    const proposedWeekly = weeklyFromProgram(aiProgram, catalogById, 'proposed');
    const currentValidation = validateAiProgram(aiProgram, context, catalogById);
    report.rejected_ai_week = {
      summary: aiProgram.summary,
      coaching_notes: aiProgram.coaching_notes,
      workouts: aiProgram.workouts.map((w) => ({
        day: w.day_label,
        name: w.name,
        emphasis: w.emphasis,
        strength: (w.strength || []).map((block) => ({
          type: block.type,
          exercises: (block.exercises || []).map((ex) => ({
            id: ex.exercise_id,
            name: catalogById.get(ex.exercise_id)?.name,
            role: ex.role,
            sets: ex.working_sets,
            reps: `${ex.rep_min}-${ex.rep_max}`,
            rest: ex.rest_seconds,
          })),
        })),
      })),
    };
    report.per_exercise_trace = traces;
    report.volume_before_after = {
      current: Object.fromEntries(WATCH.map((m) => [m, currentWeekly[m] || 0])),
      proposed: Object.fromEntries(WATCH.map((m) => [m, proposedWeekly[m] || 0])),
      targets: Object.fromEntries(WATCH.map((m) => [m, targets.find((t) => t.muscle === m)?.targetSets || 0])),
    };
    report.why_upper_back_is_low = {
      current_upper_back: currentWeekly.upper_back || 0,
      proposed_upper_back: proposedWeekly.upper_back || 0,
      target: 10,
      error_threshold_equivalent_sets: 5,
      explanation:
        'Current runtime often gives vertical pulls lats 1.0 and only 0.5 upper_back (via name-default merge). Rows were enriched as lat-primary so they also give upper_back 0.5 instead of 1.0. A week of chin-ups/pull-ups without a true row lands near 1.5–3 equivalent upper_back sets.',
    };
    const proposedIssues = [];
    WATCH.forEach((muscle) => {
      const target = targets.find((t) => t.muscle === muscle);
      if (!target) return;
      const got = proposedWeekly[muscle] || 0;
      const ratio = target.targetSets ? got / target.targetSets : 1;
      const major = isMajorMuscle(muscle as MuscleId);
      if (major && (got < 1 || ratio < 0.5)) {
        proposedIssues.push({ muscle, got, target: target.targetSets, ratio, severity: 'error' });
      }
    });
    report.would_pass_after_correction = {
      current_validator_ok: currentValidation.ok,
      current_errors: currentValidation.issues.filter((i) => i.severity === 'error').map((i) => i.message),
      proposed_major_volume_errors: proposedIssues,
      volume_would_pass: proposedIssues.length === 0,
      note: 'Re-score is contribution-only. Laterality/rest/superset errors are unchanged and are deterministic-repair problems, not this audit.',
    };
  }

  const scienceWeek1 = science.workouts.filter((w) => w.week === 1);
  report.fallback_week = scienceWeek1.map((w) => ({
    day: w.dayLabel,
    name: w.name,
    exercises: w.exercises.map((ex) => {
      const row = catalog.find((c) => c.name === ex.name || c.id === ex.exerciseId);
      const current = row ? contributionsForExercise(row) : [];
      return {
        name: ex.name,
        role: ex.role,
        sets: ex.sets,
        pattern: row?.movementPattern,
        current_credits: current,
        proposed_credits: row ? proposedCredits(row) : [],
      };
    }),
  }));
  report.fallback_diagnosis = {
    observation:
      'Fallback repeats Chin-Up + Pull-Up because generateProgram fills lats via vertical_pull (1.0 each) and still owes upper_back. Rows only pay 0.5 upper_back under lat-primary enrichment, so the engine keeps adding more pulls instead of one authoritative horizontal row at 1.0.',
    if_credits_corrected:
      'A 3-set row would pay 3 upper_back + 1.5 lats. Combined with one vertical pull (3 lats + 1.5 upper_back) a 3-day week can hit both majors without stacking two vertical pulls every day.',
  };

  report.files_that_would_change = [
    'st_exercises.coaching_metadata.hypertrophy_volume_credits for the 260 active master rows (not archived, not user-custom)',
    'optionally st_exercises.muscle_targets / coaching_metadata.primary_muscles so rows are upper_back-primary',
    'lib/scienceEngine/catalogEnrichment/qualityPass.ts conservativeCredits + inferPrimaryFallback + EXACT row overrides (so future enrichment does not re-lat-primary rows)',
    'lib/scienceEngine/contributions.ts: stop merging NAME_DEFAULTS into explicit hypertrophy_volume_credits once the 260 are complete',
  ];

  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-diagnosis.json'),
    JSON.stringify(report, null, 2)
  );
}

main().catch((err) => {
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-diagnosis.json'),
    JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2)
  );
  process.exit(1);
});
