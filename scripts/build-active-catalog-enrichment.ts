/**
 * BIQ-0212: Active-catalog programming-metadata review artifact (quality pass).
 * Does not write to st_exercise_catalog.
 *
 * Run: npx tsx scripts/build-active-catalog-enrichment.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { classifyExercise, HIGHLIGHT_NAMES, type QualityClassification } from '../lib/scienceEngine/catalogEnrichment/qualityPass';
import { catalogExerciseFromRow } from '../lib/scienceEngine/catalogAdapter';
import { lateralityOf, measurementTypeOf } from '../lib/scienceEngine/generation/library';
import { isCooldownEligible } from '../lib/scienceEngine/generation/qualityRules';
import { normalizeMovementPattern } from '../lib/scienceEngine/taxonomy';
import { loadMasterLibraryRecords, MASTER_CATALOG_SOURCE, mapMasterMovementPattern } from '../lib/training/masterCatalog';

const OUT_JSON = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment.json');
const OUT_MD = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment-audit.md');

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

async function fetchLiveCatalog() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { rows: [] as any[], error: 'Supabase URL/key not set' };
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('st_exercise_catalog').select('*').order('name').range(from, from + 999);
    if (error) return { rows, error: error.message };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return { rows, error: null };
}

function tally<T extends string>(values: T[]): Record<string, number> {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function highlightRow(ex: { name: string; proposed: QualityClassification; review_flags: string[]; confidence: string }) {
  const p = ex.proposed;
  return {
    name: ex.name,
    movement_pattern: p.movement_pattern,
    laterality: p.laterality,
    measurement_type: p.measurement_type,
    exercise_kind: p.exercise_kind,
    fatigue_cost: p.fatigue_cost,
    skill_demand: p.skill_demand,
    primary_muscles: p.primary_muscles,
    involved_muscles: p.involved_muscles,
    hypertrophy_volume_credits: p.hypertrophy_volume_credits,
    volume_policy: p.volume_policy,
    ramp_eligible: p.ramp_eligible,
    warmup_eligible: p.warmup_eligible,
    power_eligible: p.power_eligible,
    review_required: p.review_required,
    review_reasons: p.review_reasons,
    confidence: ex.confidence,
    demand_notes: p.demand_notes,
  };
}

async function main() {
  loadEnvLocal();
  const live = await fetchLiveCatalog();
  const master = loadMasterLibraryRecords();
  const masterByName = new Map(master.map((row) => [row.name.toLowerCase(), row]));
  const masterByExternal = new Map(master.map((row) => [String(row.id), row]));

  const liveActive = live.rows.filter((row) => row.is_archived !== true);
  const liveInactive = live.rows.filter((row) => row.is_archived === true);
  const useLive = !live.error && live.rows.length > 0;
  const sourceRows = useLive
    ? liveActive.filter((row) => row.is_system !== false && !row.user_id)
    : master.map((record) => ({
        id: `master:${record.id}`,
        name: record.name,
        is_archived: String(record.active || 'Yes').toLowerCase() !== 'yes',
        is_system: true,
        user_id: null,
        external_source: MASTER_CATALOG_SOURCE,
        external_id: record.id,
        category: record.category,
        muscle_group: record.primary_muscle,
        equipment: record.default_equipment,
        movement_pattern: mapMasterMovementPattern(record.movement_pattern),
        muscle_targets: null,
        coaching_metadata: { master_movement: record.movement_pattern, master_category: record.category },
        exercise_type: 'strength',
      }));

  const exercises = sourceRows
    .filter((row) => row.is_archived !== true)
    .map((row) => {
      const masterRow =
        masterByExternal.get(String(row.external_id || '')) || masterByName.get(String(row.name || '').toLowerCase()) || null;
      const adapted = catalogExerciseFromRow(row);
      const name = String(row.name || masterRow?.name || '');
      const category = String(masterRow?.category || row.category || '');
      const masterPattern = String(masterRow?.movement_pattern || row.coaching_metadata?.master_movement || '');
      const primarySource = masterRow?.primary_muscle || row.muscle_group;
      const secondarySource =
        masterRow?.secondary_muscles ||
        (row.muscle_targets || [])
          .filter((t: any) => t.role === 'secondary')
          .map((t: any) => t.muscle)
          .join('; ');
      const proposed = classifyExercise({
        name,
        category,
        masterMovement: masterPattern,
        primarySource,
        secondarySource,
      });
      const currentPattern = adapted?.movementPattern || normalizeMovementPattern(row.movement_pattern);
      const currentFatigue = adapted?.fatigueCost || 'medium';
      const currentSkill = adapted?.skillRequirement || 'medium';

      return {
        id: row.id || null,
        external_id: row.external_id || masterRow?.id || null,
        name,
        source: row.external_source || (masterRow ? MASTER_CATALOG_SOURCE : 'unknown'),
        category,
        master_movement: masterPattern || null,
        current: {
          movement_pattern: currentPattern,
          primary_muscles: adapted?.primaryMuscles || [],
          secondary_muscles: adapted?.secondaryMuscles || [],
          equipment: adapted?.equipment || [],
          laterality: adapted ? lateralityOf(adapted) : 'bilateral',
          measurement_type: adapted ? measurementTypeOf(adapted) : 'reps',
          exercise_kind: adapted?.exerciseType || null,
          program_roles: adapted?.programRoles || [],
          fatigue_cost: currentFatigue,
          skill_demand: currentSkill,
          default_rep_min: adapted?.defaultRepMin || null,
          default_rep_max: adapted?.defaultRepMax || null,
          warmup_eligible: !!adapted?.warmupSuitable,
          power_eligible: !!adapted?.programRoles.includes('power'),
          cooldown_eligible: adapted
            ? isCooldownEligible({ name, rawCategory: category, warmup_eligible: adapted.warmupSuitable })
            : false,
        },
        proposed: {
          ...proposed,
          equipment: adapted?.equipment?.length
            ? adapted.equipment
            : [String(masterRow?.default_equipment || row.equipment || '').toLowerCase()].filter(Boolean),
        },
        review_flags: proposed.review_reasons,
        inherited_suspect: false,
        confidence: proposed.confidence,
        warmup_mobility_stretch: proposed.warmup_eligible,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const adaptedActive = useLive ? liveActive.map(catalogExerciseFromRow).filter(Boolean) : exercises;
  const typicalAiEligible = exercises.filter(
    (ex) => !ex.proposed.warmup_eligible || ex.proposed.program_roles.some((role) => role !== 'warmup' && role !== 'power')
  );
  const warmupStretch = exercises.filter((ex) => ex.warmup_mobility_stretch);
  const reviewRequired = exercises.filter((ex) => ex.proposed.review_required);
  const highConfidence = exercises.filter((ex) => !ex.proposed.review_required);
  const missingPrimary = exercises.filter((ex) => ex.proposed.primary_assignment === 'missing');
  const withHypertrophy = exercises.filter((ex) => ex.proposed.hypertrophy_volume_credits.length > 0);
  const zeroHypertrophy = exercises.filter((ex) => ex.proposed.hypertrophy_volume_credits.length === 0);
  const anomalies = exercises.flatMap((ex) => ex.proposed.anomalies.map((anomaly) => ({ name: ex.name, anomaly })));

  const counts = {
    live_query_error: live.error,
    live_total_rows: live.rows.length,
    active_exercises: exercises.length,
    inactive_exercises: useLive ? liveInactive.length : null,
    active_system_library: useLive ? liveActive.filter((row) => row.is_system && !row.user_id).length : exercises.length,
    active_user_custom: useLive ? liveActive.filter((row) => row.user_id || row.is_system === false).length : 0,
    active_ai_generation_eligible: typicalAiEligible.length,
    active_warmup_mobility_stretch: warmupStretch.length,
    master_source_records: master.length,
    high_confidence_no_review: highConfidence.length,
    review_required: reviewRequired.length,
    missing_primary_muscles: missingPrimary.length,
    with_hypertrophy_volume_credits: withHypertrophy.length,
    zero_hypertrophy_volume_credit: zeroHypertrophy.length,
    anomaly_count: anomalies.length,
    movement_pattern: tally(exercises.map((ex) => ex.proposed.movement_pattern)),
    laterality: tally(exercises.map((ex) => ex.proposed.laterality)),
    measurement_type: tally(exercises.map((ex) => ex.proposed.measurement_type)),
    fatigue_cost: tally(exercises.map((ex) => ex.proposed.fatigue_cost)),
    volume_policy: tally(exercises.map((ex) => ex.proposed.volume_policy)),
    used_live_rows: useLive,
  };

  const artifact = {
    generated_at: new Date().toISOString(),
    status: 'review_only_not_applied',
    quality_pass: 'BIQ-0212',
    scope: 'ACTIVE exercises only. Inactive/legacy rows were not enriched. Production was not written.',
    generation_path: {
      fetch_loads_archived: true,
      adapter_drops_archived: true,
      generate_filters_archived: true,
      fallback_catalog_used_only_if_fewer_than_12_active: true,
      currently_active_only_after_adapt: adaptedActive.length > 0,
    },
    counts,
    review_required_names: reviewRequired.map((ex) => ({
      name: ex.name,
      reasons: ex.proposed.review_reasons,
      confidence: ex.confidence,
    })),
    missing_primary_names: missingPrimary.map((ex) => ex.name),
    anomalies,
    highlight_corrections: HIGHLIGHT_NAMES.map((name) => {
      const match = exercises.find((ex) => ex.name.toLowerCase() === name.toLowerCase());
      return match ? highlightRow(match) : { name, missing: true };
    }),
    exercises,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(artifact, null, 2));

  const md = `# Active catalog enrichment audit (quality pass, review only)

Generated: ${artifact.generated_at}

**Not applied to production.** Inactive/legacy exercises were not enriched. Phase 2 was not started.

## Counts

| Metric | Value |
|---|---|
| Live query | ${counts.live_query_error || 'ok'} |
| Active exercises | ${counts.active_exercises} |
| High-confidence / no review | ${counts.high_confidence_no_review} |
| Review required | ${counts.review_required} |
| Missing primary muscles | ${counts.missing_primary_muscles} |
| With hypertrophy volume credits | ${counts.with_hypertrophy_volume_credits} |
| Zero hypertrophy volume credit | ${counts.zero_hypertrophy_volume_credit} |
| Anomalies | ${counts.anomaly_count} |
| Artifact source | ${counts.used_live_rows ? 'live active system rows' : 'local builtiq_master library'} |

## Distributions

- Movement patterns: ${JSON.stringify(counts.movement_pattern)}
- Laterality: ${JSON.stringify(counts.laterality)}
- Measurement: ${JSON.stringify(counts.measurement_type)}
- Fatigue: ${JSON.stringify(counts.fatigue_cost)}
- Volume policy: ${JSON.stringify(counts.volume_policy)}

## Review-required exercises

${reviewRequired.map((ex) => `- **${ex.name}**: ${ex.proposed.review_reasons.join(', ') || 'unspecified'}`).join('\n') || '- none'}

## Quality-pass rules

- Exact/contextual mappings replace ambiguous substring rules (\`curl\`, \`plank\`, \`jump\`, \`row\`)
- Laterality is bilateral / unilateral / alternating and is not inferred from the absence of "single"
- Measurement supports reps, time, and distance
- Ramp eligibility is for loaded/technical working movements, not "compound" alone
- Fatigue is programming/recovery cost
- Muscle involvement is separate from conservative hypertrophy volume credit
- Warmup, mobility, most conditioning, carries, and Olympic/power work normally receive zero hypertrophy set credit
- \`review_required\` now means genuine ambiguity or programming risk, not a missing old-database field

## How to apply later

1. Review \`active-catalog-enrichment-review.csv\`
2. Accept/edit \`proposed\` fields
3. Write accepted values into \`coaching_metadata\` (and \`movement_pattern\` / \`muscle_targets\` where justified) **for these active IDs only**
4. Do not unarchive, delete, or enrich inactive rows
`;

  fs.writeFileSync(OUT_MD, md);
  console.log(
    JSON.stringify(
      {
        wrote_json: OUT_JSON,
        wrote_md: OUT_MD,
        counts,
        review_required_names: artifact.review_required_names,
        highlight_corrections: artifact.highlight_corrections,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
