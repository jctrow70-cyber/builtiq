import { parseCoachingMetadata, parseMuscleTargets } from '../training/exerciseIntelligence';
import { normalizeEquipmentList } from '../training/equipmentFilter';
import { inferFallbackFatigue } from './generation/qualityRules';
import { interpretMuscleLabel, normalizeMovementPattern, type MovementPatternId, type MuscleId } from './taxonomy';
import type { CatalogExercise, ExerciseTypeKind, ProgramRole } from './types';

/** Authoritative coaching kind wins. Otherwise a case-insensitive name check separates isolation accessories from compounds. */
export function inferExerciseKind(name: string, raw?: any): ExerciseTypeKind {
  const stored = String(raw?.coaching_metadata?.exercise_kind || raw?.coaching_metadata?.mechanic || '').toLowerCase();
  if (stored === 'isolation' || stored === 'compound') return stored;
  const n = String(name || '').toLowerCase();
  if (/leg curl|nordic curl/.test(n)) return 'isolation';
  if (/\bface pull\b|\brear delt fly\b|\bcurl\b|\braise\b|\bfly\b|pushdown|kickback|\bshrug\b|\bplank\b/.test(n)) return 'isolation';
  const category = String(raw?.category || '').toLowerCase();
  if (category === 'isolation') return 'isolation';
  return 'compound';
}

function inferKind(name: string, raw?: any): ExerciseTypeKind {
  return inferExerciseKind(name, raw);
}

/** A stored pattern of "isolation" or "strength" is a mechanic, not a movement. */
export function resolveMovementPattern(name: string, raw?: any): MovementPatternId {
  const rawToken = String(raw?.coaching_metadata?.movement_pattern || raw?.movement_pattern || '')
    .toLowerCase()
    .trim();
  const stored = normalizeMovementPattern(rawToken);
  const generic = !rawToken || /^(isolation|strength|general|other|accessory|mobility)$/.test(rawToken) || stored === 'other';
  if (!generic) return stored;
  return inferPatternFromName(name) || stored;
}

export function inferPatternFromName(name: string): MovementPatternId | null {
  const n = String(name || '').toLowerCase();
  if (/\bface pull\b|\brear delt fly\b/.test(n)) return 'horizontal_pull';
  if (/\b(knee|leg) raise\b|\bcrunch\b|\bsit-?up\b/.test(n)) return 'core_flexion';
  if (/\bcurl\b/.test(n) && !/leg curl|nordic/.test(n)) return 'elbow_flexion';
  if (/pushdown|triceps extension/.test(n)) return 'elbow_extension';
  if (/\blateral raise\b|\bfront raise\b/.test(n)) return 'shoulder_abduction';
  return null;
}

function inferRoles(name: string, kind: ExerciseTypeKind, warmupSuitable: boolean, raw?: any): ProgramRole[] {
  const stored = raw?.coaching_metadata?.program_roles;
  if (Array.isArray(stored) && stored.length) {
    return stored.map(String).filter(Boolean) as ProgramRole[];
  }
  const n = name.toLowerCase();
  const roles: ProgramRole[] = [];
  if (warmupSuitable) roles.push('warmup');
  if (/jump|throw|slam|bound|plyo|chest pass|swing/.test(n)) roles.push('power');
  if (kind === 'isolation') roles.push('isolation', 'accessory');
  else if (/bench|squat|deadlift|overhead press|barbell row|pull-?up/.test(n)) roles.push('primary', 'secondary');
  else roles.push('secondary', 'accessory');
  return roles.filter((r, i, arr) => arr.indexOf(r) === i);
}

function musclesFromRaw(raw: any): { primary: MuscleId[]; secondary: MuscleId[] } {
  const name = String(raw?.name || '');
  const coaching = raw?.coaching_metadata || {};
  if (Array.isArray(coaching.primary_muscles) || Array.isArray(coaching.secondary_muscles)) {
    const primary = (coaching.primary_muscles || []).map((m: string) => interpretMuscleLabel(m, name)).filter((m): m is MuscleId => !!m);
    const secondary = (coaching.secondary_muscles || [])
      .map((m: string) => interpretMuscleLabel(m, name))
      .filter((m): m is MuscleId => !!m && !primary.includes(m));
    return { primary, secondary };
  }
  const targets = parseMuscleTargets(raw?.muscle_targets);
  const primary = targets.filter((t) => t.role === 'primary').map((t) => interpretMuscleLabel(t.muscle, name)).filter((m): m is MuscleId => !!m);
  const secondary = targets.filter((t) => t.role === 'secondary').map((t) => interpretMuscleLabel(t.muscle, name)).filter((m): m is MuscleId => !!m);
  const fallback = interpretMuscleLabel(raw?.muscle_group, name);
  if (!primary.length && fallback) primary.push(fallback);
  return { primary, secondary };
}

export function catalogExerciseFromRow(row: any): CatalogExercise | null {
  if (!row || row.is_archived) return null;
  const name = String(row.name || '').trim();
  if (!name) return null;
  const coaching = parseCoachingMetadata(row.coaching_metadata) as any;
  const kind = inferKind(name, row);
  const rolesForFatigue = inferRoles(name, kind, false, row);
  const { primary, secondary } = musclesFromRaw(row);
  const warmupSuitable = Boolean(
    coaching.warmup_eligible === true ||
      row.warmup_suitable ||
      coaching.programming_role === 'warmup' ||
      (coaching.warmup_eligible !== false && /warmup|mobility|stretch/.test(String(row.category || '')))
  );
  const laterality = String(coaching.laterality || '');
  return {
    id: row.id ? String(row.id) : undefined,
    name,
    movementPattern: resolveMovementPattern(name, row),
    exerciseType: kind,
    programRoles: inferRoles(name, kind, warmupSuitable, row),
    equipment: normalizeEquipmentList(
      [row.equipment, ...(Array.isArray(row.coaching_metadata?.compatible_equipment) ? row.coaching_metadata.compatible_equipment : [])].filter(Boolean)
    ),
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    stabilityRequirement: (row.stability_requirement || 'medium') as CatalogExercise['stabilityRequirement'],
    fatigueCost:
      coaching.fatigue_cost === 'moderate'
        ? 'medium'
        : coaching.fatigue_cost || inferFallbackFatigue(name, kind, rolesForFatigue),
    skillRequirement: (coaching.skill_demand === 'moderate' ? 'medium' : coaching.skill_demand) || 'medium',
    suitableForBeginner: row.suitable_for_beginner !== false && String(row.training_goal || '') !== 'power',
    unilateral: laterality === 'unilateral' || laterality === 'alternating' || /single|one-arm|split|lunge|bulgarian/.test(name.toLowerCase()),
    defaultRepMin: Number(coaching.default_rep_min || row.default_rep_min) || (kind === 'isolation' ? 8 : 5),
    defaultRepMax: Number(coaching.default_rep_max || row.default_rep_max) || (kind === 'isolation' ? 15 : 10),
    videoUrl: row.video_url || row.gif_url || row.media_url || null,
    warmupSuitable,
    warmupCategory: row.warmup_category || null,
    planes: Array.isArray(row.planes) ? row.planes : ['sagittal'],
    warmupFatigue: row.warmup_fatigue || 'low',
    impactLevel: row.impact_level || 'low',
    raw: row,
  };
}
