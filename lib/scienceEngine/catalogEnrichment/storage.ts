/**
 * BIQ-0213: Map approved enrichment proposals onto catalog storage.
 * First-class columns stay within existing DB constraints.
 * Programming intelligence is merged into coaching_metadata.
 */
import type { QualityClassification } from './qualityPass';

export const ENRICHMENT_VERSION = 'BIQ-0213';

/** Matches st_exercise_catalog_movement_pattern_check. Rich patterns stay in coaching_metadata. */
export const FIRST_CLASS_MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'push_horizontal',
  'push_vertical',
  'pull_horizontal',
  'pull_vertical',
  'carry',
  'rotation',
  'isolation',
  'cardio',
] as const;

export const REVIEW_OVERRIDES: Record<
  string,
  Partial<QualityClassification> & { demand_characteristics?: string[] }
> = {
  'cable y raise': {
    default_rep_min: 10,
    default_rep_max: 20,
    warmup_eligible: true,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    review_required: false,
    review_reasons: [],
    confidence: 'high',
  },
  'copenhagen plank': {
    cooldown_eligible: false,
    review_required: false,
    review_reasons: [],
    confidence: 'high',
  },
  'jefferson curl': {
    default_rep_min: 5,
    default_rep_max: 10,
    ramp_eligible: false,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    demand_characteristics: ['loaded_spinal_flexion'],
    demand_notes:
      'Loaded segmental spinal flexion / hinge mobility. Not an elbow-flexion curl. Zero hypertrophy volume. Not a medical diagnosis.',
    review_required: false,
    review_reasons: [],
    confidence: 'high',
  },
  'overhead carry': {
    laterality: 'unilateral',
    measurement_type: 'distance',
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    review_required: false,
    review_reasons: [],
    confidence: 'high',
  },
  'upright row': {
    movement_pattern: 'shoulder_abduction',
    primary_muscles: ['side_delts'],
    review_required: false,
    review_reasons: [],
    confidence: 'high',
  },
  'y raise': {
    default_rep_min: 10,
    default_rep_max: 20,
    warmup_eligible: true,
    volume_policy: 'zero_non_hypertrophy',
    hypertrophy_volume_credits: [],
    review_required: false,
    review_reasons: [],
    confidence: 'high',
  },
};

export type ApprovedProposal = QualityClassification & {
  demand_characteristics?: string[];
};

export function applyReviewOverrides(name: string, proposed: QualityClassification): ApprovedProposal {
  const key = String(name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const override = REVIEW_OVERRIDES[key];
  if (!override) return { ...proposed, demand_characteristics: [] };
  return {
    ...proposed,
    ...override,
    hypertrophy_volume_credits: override.hypertrophy_volume_credits || proposed.hypertrophy_volume_credits,
    program_roles: override.program_roles || proposed.program_roles,
    demand_characteristics: override.demand_characteristics || [],
  };
}

function existingFirstClass(existing?: string | null): string | null {
  const v = String(existing || '').toLowerCase().trim();
  if ((FIRST_CLASS_MOVEMENT_PATTERNS as readonly string[]).includes(v)) return v;
  if (v === 'horizontal_push' || v === 'push') return 'push_horizontal';
  if (v === 'vertical_push') return 'push_vertical';
  if (v === 'horizontal_pull' || v === 'pull') return 'pull_horizontal';
  if (v === 'vertical_pull') return 'pull_vertical';
  if (v === 'lunge' || v === 'jump') return 'squat';
  if (v === 'mobility' || v === 'stretch') return 'rotation';
  if (v === 'activation' || v === 'stability') return 'isolation';
  if (v === 'power' || v === 'olympic') return 'hinge';
  return null;
}

export function toFirstClassMovementPattern(
  rich: string,
  category?: string | null,
  existing?: string | null
): string {
  const p = String(rich || '').toLowerCase();
  const cat = String(category || '').toLowerCase();
  if (p === 'horizontal_push') return 'push_horizontal';
  if (p === 'vertical_push') return 'push_vertical';
  if (p === 'horizontal_pull') return 'pull_horizontal';
  if (p === 'vertical_pull') return 'pull_vertical';
  if (p === 'squat' || p === 'hinge' || p === 'carry') return p;
  if (p === 'lunge' || p === 'jump') return 'squat';
  if (p === 'throw') return 'push_horizontal';
  if (p === 'olympic' || p === 'power') return existingFirstClass(existing) || 'hinge';
  if (p.startsWith('core_') || p === 'rotation') return 'rotation';
  if (p === 'other' && /cardio|conditioning/.test(cat)) return 'cardio';
  if (p === 'other' && /mobility|stretch/.test(cat)) return 'rotation';
  return 'isolation';
}

export function toProgressionType(measurement: string): 'weight' | 'reps' | 'duration' | 'distance' {
  if (measurement === 'distance') return 'distance';
  if (measurement === 'time') return 'duration';
  return 'weight';
}

export function muscleTargetsFromCredits(
  credits: Array<{ muscle: string; credit: number }>,
  primaries: string[]
): Array<{ muscle: string; percentage: number; role: 'primary' | 'secondary' }> {
  return (credits || []).map((row) => {
    const primary = row.credit >= 1 || primaries.includes(row.muscle);
    return {
      muscle: row.muscle,
      percentage: primary ? 60 : 40,
      role: primary ? 'primary' : 'secondary',
    };
  });
}

export type CatalogPatch = {
  movement_pattern: string;
  muscle_group: string | null;
  muscle_targets: Array<{ muscle: string; percentage: number; role: 'primary' | 'secondary' }>;
  primary_muscle_percentage: number | null;
  secondary_muscle_percentage: number | null;
  progression_type: 'weight' | 'reps' | 'duration' | 'distance';
  coaching_metadata: Record<string, unknown>;
};

export function buildCatalogPatch(opts: {
  name: string;
  category?: string | null;
  proposed: QualityClassification;
  existingMetadata?: Record<string, unknown> | null;
  existingMovementPattern?: string | null;
}): { approved: ApprovedProposal; patch: CatalogPatch; errors: string[] } {
  const approved = applyReviewOverrides(opts.name, opts.proposed);
  const firstClass = toFirstClassMovementPattern(
    approved.movement_pattern,
    opts.category,
    opts.existingMovementPattern
  );
  const errors: string[] = [];
  if (!(FIRST_CLASS_MOVEMENT_PATTERNS as readonly string[]).includes(firstClass)) {
    errors.push(`${opts.name}: first-class movement_pattern ${firstClass} is not allowed`);
  }
  if (approved.movement_pattern === 'vertical_pull' && /upright row/i.test(opts.name)) {
    errors.push(`${opts.name}: upright row must not be vertical_pull`);
  }
  if (approved.laterality && !['bilateral', 'unilateral', 'alternating'].includes(approved.laterality)) {
    errors.push(`${opts.name}: invalid laterality ${approved.laterality}`);
  }
  if (!['reps', 'time', 'distance'].includes(approved.measurement_type)) {
    errors.push(`${opts.name}: invalid measurement ${approved.measurement_type}`);
  }
  if (approved.volume_policy === 'zero_non_hypertrophy' && approved.hypertrophy_volume_credits.length) {
    errors.push(`${opts.name}: zero volume policy still has hypertrophy credits`);
  }
  if (/jefferson curl/i.test(opts.name) && !approved.demand_characteristics?.includes('loaded_spinal_flexion')) {
    errors.push(`${opts.name}: missing loaded_spinal_flexion demand characteristic`);
  }
  if (/copenhagen/i.test(opts.name) && approved.cooldown_eligible) {
    errors.push(`${opts.name}: cooldown_eligible must be false`);
  }

  const existing =
    opts.existingMetadata && typeof opts.existingMetadata === 'object' ? { ...opts.existingMetadata } : {};
  const credits = muscleTargetsFromCredits(approved.hypertrophy_volume_credits, approved.primary_muscles);
  const primaryPct = credits.filter((t) => t.role === 'primary').reduce((n, t) => n + t.percentage, 0);
  const secondaryPct = credits.filter((t) => t.role === 'secondary').reduce((n, t) => n + t.percentage, 0);

  const coaching_metadata = {
    ...existing,
    movement_pattern: approved.movement_pattern,
    laterality: approved.laterality,
    measurement_type: approved.measurement_type,
    exercise_kind: approved.exercise_kind,
    program_roles: approved.program_roles,
    fatigue_cost: approved.fatigue_cost === 'medium' ? 'moderate' : approved.fatigue_cost,
    skill_demand: approved.skill_demand === 'medium' ? 'moderate' : approved.skill_demand,
    warmup_eligible: approved.warmup_eligible,
    power_eligible: approved.power_eligible,
    ramp_eligible: approved.ramp_eligible,
    cooldown_eligible: approved.cooldown_eligible,
    default_rep_min: approved.default_rep_min,
    default_rep_max: approved.default_rep_max,
    volume_policy: approved.volume_policy,
    hypertrophy_volume_credits: approved.hypertrophy_volume_credits,
    primary_muscles: approved.primary_muscles,
    secondary_muscles: approved.secondary_muscles,
    involved_muscles: approved.involved_muscles,
    primary_assignment: approved.primary_assignment,
    demand_notes: approved.demand_notes,
    demand_characteristics: approved.demand_characteristics || [],
    enrichment_version: ENRICHMENT_VERSION,
  };

  return {
    approved,
    patch: {
      movement_pattern: firstClass,
      muscle_group: approved.primary_muscles[0] || null,
      muscle_targets: credits,
      primary_muscle_percentage: credits.length ? Math.min(100, primaryPct || 60) : null,
      secondary_muscle_percentage: credits.length && secondaryPct ? Math.min(100, secondaryPct) : null,
      progression_type: toProgressionType(approved.measurement_type),
      coaching_metadata,
    },
    errors,
  };
}

export function validatePersistedRow(opts: {
  name: string;
  before: any;
  after: any;
  patch: CatalogPatch;
}): string[] {
  const errors: string[] = [];
  if (String(opts.after?.id) !== String(opts.before?.id)) errors.push(`${opts.name}: id changed`);
  if (String(opts.after?.name) !== String(opts.before?.name)) errors.push(`${opts.name}: name changed`);
  if (Boolean(opts.after?.is_archived) !== Boolean(opts.before?.is_archived)) {
    errors.push(`${opts.name}: archive status changed`);
  }
  if (opts.after?.is_archived === true) errors.push(`${opts.name}: row is archived after write`);
  if (opts.after?.movement_pattern !== opts.patch.movement_pattern) {
    errors.push(`${opts.name}: movement_pattern persisted ${opts.after?.movement_pattern}, expected ${opts.patch.movement_pattern}`);
  }
  const coaching = opts.after?.coaching_metadata || {};
  if (coaching.movement_pattern !== opts.patch.coaching_metadata.movement_pattern) {
    errors.push(`${opts.name}: coaching movement_pattern mismatch`);
  }
  if (coaching.laterality !== opts.patch.coaching_metadata.laterality) {
    errors.push(`${opts.name}: laterality mismatch`);
  }
  if (coaching.measurement_type !== opts.patch.coaching_metadata.measurement_type) {
    errors.push(`${opts.name}: measurement_type mismatch`);
  }
  if (coaching.enrichment_version !== ENRICHMENT_VERSION) {
    errors.push(`${opts.name}: missing enrichment_version`);
  }
  if (/jefferson curl/i.test(opts.name)) {
    const chars = coaching.demand_characteristics || [];
    if (!chars.includes('loaded_spinal_flexion')) errors.push(`${opts.name}: persisted without loaded_spinal_flexion`);
    if (Array.isArray(coaching.contraindications) && coaching.contraindications.length) {
      errors.push(`${opts.name}: must not store medical contraindications`);
    }
  }
  return errors;
}
