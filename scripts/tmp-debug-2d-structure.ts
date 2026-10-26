import { FALLBACK_CATALOG } from '../lib/scienceEngine/catalogAdapter';
import { generateProgram } from '../lib/scienceEngine/generateProgram';
import { buildGenerationContext } from '../lib/scienceEngine/generation/context';
import { repairAiProgram } from '../lib/scienceEngine/generation/repairAiProgram';
import { validateAiProgram } from '../lib/scienceEngine/generation/validateAiProgram';
import { inspectWorkingStructure, parseWorkingStructure } from '../lib/scienceEngine/generation/workingStructure';
import { runStage2dChecks } from '../lib/scienceEngine/generation/stage2dCheck';

// Import helpers by reconstructing the broken week the same way as the check.
import { trainingProfileFromSources } from '../lib/scienceEngine/profile';

const STRUCTURE_NOTES =
  'Set up the workouts to start and end with glute exercises. In the middle do a push/pull superset and a core exercise.';

function idOf(name: string): string {
  const hit = FALLBACK_CATALOG.find((ex) => ex.name === name);
  if (!hit?.id) throw new Error(`missing ${name}`);
  return String(hit.id);
}

function lift(name: string, role: any, extra?: any) {
  return {
    exercise_id: idOf(name),
    role,
    working_sets: role === 'primary' ? 3 : 2,
    rep_min: role === 'primary' ? 6 : 8,
    rep_max: role === 'primary' ? 8 : 12,
    target_rir: 2,
    rest_seconds: role === 'primary' ? 120 : 75,
    reps_per_side: /row|lunge|split|single|one-arm/i.test(name),
    measurement_type: 'reps',
    why: `${role} work for ${name}`,
    ...extra,
  };
}

const profile = trainingProfileFromSources({
  profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy', birth_year: 1990 },
  trainingProfile: {
    warmup_style: 'dynamic',
    warmup_duration: 'standard',
    preferred_session_minutes: 45,
    available_equipment: ['barbell', 'dumbbell', 'cable', 'machine'],
  },
  config: {
    days: ['Mon', 'Wed', 'Fri'],
    dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
    weeks: 1,
    sessionMinutes: 45,
    primaryGoal: 'hypertrophy',
    experienceLevel: 'intermediate',
    focusMuscles: ['Glutes'],
    availableEquipment: ['barbell', 'dumbbell', 'cable', 'machine'],
    intakeNotes: `Intermediate hypertrophy. 3 days Monday Wednesday Friday. 45 minutes. Glute priority. ${STRUCTURE_NOTES}`,
  },
});

const seed = generateProgram(profile, FALLBACK_CATALOG);
const { context, catalogById } = buildGenerationContext({
  profile,
  program: seed,
  catalog: FALLBACK_CATALOG,
  userPrompt: profile.intakeNotes || STRUCTURE_NOTES,
  programName: 'debug',
  mode: 'full_program',
});
const library = new Map(context.candidate_library.map((ex) => [ex.exercise_id, ex]));
const parsed = parseWorkingStructure(STRUCTURE_NOTES)!;
const broken = {
  schema_version: '2.1',
  summary: 'Order is wrong',
  coaching_notes: '',
  workouts: ['Mon'].map((label) => ({
    day_label: label,
    name: `${label} out of order`,
    emphasis: 'Needs repair',
    estimated_minutes: 44,
    warmup: [{ exercise_id: idOf('Scapular Push-Up'), sets: 1, prescription: '8', why: 'Scap prep' }],
    potentiation: [],
    strength: [
      { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary')] },
      { type: 'straight_sets', exercises: [lift('Hip Thrust', 'secondary')] },
      { type: 'straight_sets', exercises: [lift('Dumbbell Row', 'secondary')] },
      { type: 'straight_sets', exercises: [lift('Conventional Deadlift', 'primary')] },
      { type: 'straight_sets', exercises: [lift('Back Squat', 'primary')] },
      { type: 'straight_sets', exercises: [lift('Plank', 'accessory', { rest_seconds: 45, measurement_type: 'time' })] },
      { type: 'straight_sets', exercises: [lift('Cable Kickback', 'isolation')] },
    ],
    cooldown: [],
  })),
};
const repaired = repairAiProgram(broken as any, context, catalogById);
const after = validateAiProgram(repaired.program, context, catalogById);
const workout = repaired.program.workouts[0];
const names = (workout.strength || []).flatMap((block: any) =>
  (block.exercises || []).map((ex: any) => `${block.type}:${library.get(ex.exercise_id)?.name || ex.exercise_id}`)
);
console.log(JSON.stringify({
  names,
  repairs: repaired.repairs.map((r) => r.action),
  structureErrors: after.issues.filter((i) => i.code === 'WORKING_STRUCTURE'),
  inspect: inspectWorkingStructure(workout, parsed, library),
}, null, 2));
void runStage2dChecks;
