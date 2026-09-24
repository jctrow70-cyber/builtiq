/**
 * Review-only CSV from the existing enrichment JSON.
 * Does not write to Supabase or change catalog rows.
 */
import fs from 'fs';
import path from 'path';
import { formatVolumeCredits } from '../lib/scienceEngine/catalogEnrichment/qualityPass';

const SRC = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment.json');
const OUT = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment-review.csv');

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function list(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join('; ');
  return value == null ? '' : String(value);
}

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const rows = (raw.exercises || []).map((ex: any) => {
  const proposed = ex.proposed || {};
  const current = ex.current || {};
  const flags: string[] = proposed.review_reasons || ex.review_flags || [];
  const credits = Array.isArray(proposed.hypertrophy_volume_credits)
    ? formatVolumeCredits(proposed.hypertrophy_volume_credits)
    : '';
  return {
    exercise_id: ex.id || '',
    external_id: ex.external_id || '',
    name: ex.name || '',
    category: ex.category || '',
    existing_movement_pattern: current.movement_pattern || '',
    proposed_movement_pattern: proposed.movement_pattern || '',
    existing_primary_muscles: list(current.primary_muscles),
    existing_secondary_muscles: list(current.secondary_muscles),
    primary_muscles: list(proposed.primary_muscles),
    secondary_muscles: list(proposed.secondary_muscles),
    involved_muscles: list(proposed.involved_muscles),
    unmapped_muscle_labels: list(proposed.unmapped_muscle_labels),
    proposed_volume_credits: credits,
    volume_policy: proposed.volume_policy || '',
    primary_assignment: proposed.primary_assignment || '',
    equipment: list(proposed.equipment?.length ? proposed.equipment : current.equipment),
    laterality: proposed.laterality || current.laterality || '',
    measurement_type: proposed.measurement_type || current.measurement_type || '',
    exercise_kind: proposed.exercise_kind || current.exercise_kind || '',
    fatigue_cost: proposed.fatigue_cost || '',
    skill_demand: proposed.skill_demand || '',
    program_roles: list(proposed.program_roles),
    default_rep_min: proposed.default_rep_min ?? '',
    default_rep_max: proposed.default_rep_max ?? '',
    warmup_eligible: proposed.warmup_eligible === true,
    power_eligible: proposed.power_eligible === true,
    ramp_eligible: proposed.ramp_eligible === true,
    cooldown_eligible: proposed.cooldown_eligible === true,
    review_required: proposed.review_required === true,
    review_reason: flags.join('; '),
    confidence: ex.confidence || proposed.confidence || '',
    provenance: [ex.source || 'builtiq_master', ex.master_movement ? `master_movement=${ex.master_movement}` : '', 'quality_pass_BIQ-0212', 'review_only_not_applied']
      .filter(Boolean)
      .join(' | '),
    demand_notes: proposed.demand_notes || '',
  };
});

const headers = [
  'exercise_id',
  'external_id',
  'name',
  'category',
  'existing_movement_pattern',
  'proposed_movement_pattern',
  'existing_primary_muscles',
  'existing_secondary_muscles',
  'primary_muscles',
  'secondary_muscles',
  'involved_muscles',
  'unmapped_muscle_labels',
  'proposed_volume_credits',
  'volume_policy',
  'primary_assignment',
  'equipment',
  'laterality',
  'measurement_type',
  'exercise_kind',
  'fatigue_cost',
  'skill_demand',
  'program_roles',
  'default_rep_min',
  'default_rep_max',
  'warmup_eligible',
  'power_eligible',
  'ramp_eligible',
  'cooldown_eligible',
  'review_required',
  'review_reason',
  'confidence',
  'provenance',
  'demand_notes',
];

const lines = [
  headers.join(','),
  ...rows.map((row: Record<string, unknown>) => headers.map((key) => csvEscape(row[key])).join(',')),
];
fs.writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(JSON.stringify({ wrote: OUT, rows: rows.length, source: SRC }, null, 2));
