import { hasEquipmentFilter } from '../training/equipmentFilter';
import { aliasExerciseName } from './exerciseAliases';
import type { CatalogExercise, ProgramRole, TrainingProfile } from './types';
import type { MovementPatternId, MuscleId } from './taxonomy';

export function filterEligibleExercises(catalog: CatalogExercise[], profile: TrainingProfile): CatalogExercise[] {
  const excluded = new Set(profile.excludedExercises.map((n) => n.toLowerCase()));
  const pain = profile.painAreas.concat(profile.injuryLimitations).map((s) => s.toLowerCase());
  const needEquipment = hasEquipmentFilter(profile.availableEquipment);

  return catalog.filter((ex) => {
    if (excluded.has(ex.name.toLowerCase())) return false;
    if (pain.some((p) => restrictionConflicts(ex, p))) return false;
    if (profile.experienceLevel === 'beginner' && !ex.suitableForBeginner && ex.skillRequirement === 'high') return false;
    if (needEquipment && ex.equipment.length && !equipmentAllowed(ex, profile.availableEquipment)) return false;
    return true;
  });
}

function restrictionConflicts(ex: CatalogExercise, restriction: string): boolean {
  if (!restriction) return false;
  const hay = `${ex.name} ${ex.primaryMuscles.join(' ')} ${ex.movementPattern}`.toLowerCase();
  return hay.includes(restriction) || ex.primaryMuscles.some((m) => restriction.includes(m.replace('_', ' ')));
}

function equipmentAllowed(ex: CatalogExercise, available: string[]): boolean {
  const have = available.map((e) => e.toLowerCase());
  if (ex.equipment.some((e) => ['bodyweight', 'none', ''].includes(e.toLowerCase()))) return true;
  return ex.equipment.some((e) => have.some((h) => h.includes(e) || e.includes(h)));
}

export function scoreExercise(ex: CatalogExercise, ctx: {
  profile: TrainingProfile;
  muscle: MuscleId;
  role: ProgramRole;
  pattern?: MovementPatternId;
  alreadyNames: string[];
}): number {
  let score = 0;
  if (ex.primaryMuscles.includes(ctx.muscle)) score += 40;
  else if (ex.secondaryMuscles.includes(ctx.muscle)) score += 12;
  else score -= 40;

  if (ctx.pattern && ex.movementPattern === ctx.pattern) score += 20;
  if (ex.programRoles.includes(ctx.role)) score += 16;
  if (ctx.profile.preferredExercises.some((n) => ex.name.toLowerCase().includes(n.toLowerCase()))) score += 18;
  if (ex.videoUrl) score += 6;
  if (ctx.profile.priorityMuscles.includes(ctx.muscle) && ex.programRoles.includes('primary')) score += 8;
  if (ex.fatigueCost === 'high' && ctx.role === 'isolation') score -= 8;
  if (redundancyPenalty(ex, ctx.alreadyNames) > 0) score -= redundancyPenalty(ex, ctx.alreadyNames);
  if (ctx.profile.experienceLevel === 'beginner' && ex.skillRequirement === 'high') score -= 15;
  return score;
}

function sameMovementFamily(name: string, alreadyNames: string[]): boolean {
  const family = movementFamily(name);
  if (!family) return false;
  return alreadyNames.some((n) => movementFamily(n) === family);
}

/** Conventional, Romanian, trap-bar, stiff-leg, etc. — one per session max. */
export function isDeadliftVariation(name: string): boolean {
  const n = String(name || '').toLowerCase();
  return /\bdeadlift\b|\brdl\b/.test(n);
}

/** Session-only: never stack two deadlift variations in the same workout. */
export function conflictsInSession(name: string, sessionNames: string[]): boolean {
  if (!sessionNames.length) return false;
  if (sameMovementFamily(name, sessionNames)) return true;
  if (isDeadliftVariation(name) && sessionNames.some(isDeadliftVariation)) return true;
  return false;
}

function redundancyPenalty(ex: CatalogExercise, alreadyNames: string[]): number {
  const family = movementFamily(ex.name);
  if (!family) return 0;
  const hits = alreadyNames.filter((n) => movementFamily(n) === family).length;
  return hits >= 1 ? 25 * hits : 0;
}

function movementFamily(name: string): string {
  const n = name.toLowerCase();
  if (/bench press|chest press/.test(n)) return 'flat_press';
  if (/incline/.test(n) && /press|bench/.test(n)) return 'incline_press';
  if (/fly|pec deck/.test(n)) return 'fly';
  if (/row/.test(n)) return 'row';
  if (/pulldown|pull-?up/.test(n)) return 'vertical_pull';
  if (/squat/.test(n) && !/split squat/.test(n)) return 'squat';
  if (/split squat|bulgarian/.test(n)) return 'split_squat';
  // Keep RDL distinct from conventional across the WEEK so full-body A/B can vary.
  // Same-session stacking is blocked separately via conflictsInSession / isDeadliftVariation.
  if (/\brdl\b|romanian deadlift/.test(n)) return 'rdl';
  if (/deadlift/.test(n)) return 'deadlift';
  return '';
}

function isWarmupOnly(ex: CatalogExercise, role: ProgramRole): boolean {
  if (role === 'warmup' || role === 'power') return false;
  const strengthRoles = ex.programRoles.filter((r) => r !== 'warmup' && r !== 'power');
  return ex.programRoles.includes('warmup') && strengthRoles.length === 0;
}

export function pickExercise(
  pool: CatalogExercise[],
  ctx: {
    profile: TrainingProfile;
    muscle: MuscleId;
    role: ProgramRole;
    pattern?: MovementPatternId;
    alreadyNames: string[];
    /** Names already chosen in this workout (not prior days). */
    sessionNames?: string[];
    preferredNames?: string[];
  }
): CatalogExercise | null {
  const sessionNames = ctx.sessionNames || [];
  const blocked = new Set((ctx.alreadyNames || []).map((n) => n.toLowerCase()));
  const preferred = (ctx.preferredNames || [])
    .map((name) => findByName(pool, name))
    .find(
      (ex) =>
        ex &&
        !blocked.has(ex.name.toLowerCase()) &&
        !sameMovementFamily(ex.name, ctx.alreadyNames) &&
        !conflictsInSession(ex.name, sessionNames) &&
        scoreExercise(ex, ctx) > -20
    );
  if (preferred) return preferred;

  const ranked = pool
    .filter((ex) => !ctx.alreadyNames.some((n) => n.toLowerCase() === ex.name.toLowerCase()))
    .filter((ex) => !isWarmupOnly(ex, ctx.role))
    .filter((ex) => !sameMovementFamily(ex.name, ctx.alreadyNames))
    .filter((ex) => !conflictsInSession(ex.name, sessionNames))
    .map((ex) => ({ ex, score: scoreExercise(ex, ctx) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score > 0 ? ranked[0].ex : null;
}

export function findByName(pool: CatalogExercise[], name: string): CatalogExercise | null {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  const aliased = aliasExerciseName(raw).toLowerCase();
  return (
    pool.find((ex) => ex.name.toLowerCase() === key) ||
    pool.find((ex) => ex.name.toLowerCase() === aliased) ||
    pool.find((ex) => ex.name.toLowerCase().includes(key) || key.includes(ex.name.toLowerCase())) ||
    null
  );
}
