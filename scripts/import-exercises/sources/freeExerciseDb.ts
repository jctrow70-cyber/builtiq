import type { ExternalExerciseRecord } from '../types';

/** https://github.com/yuhonas/free-exercise-db — The Unlicense (public domain) */
export const FREE_EXERCISE_DB_SOURCE = 'free_exercise_db';
export const FREE_EXERCISE_DB_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export type FreeExerciseDbRow = {
  id: string;
  name: string;
  force?: string | null;
  level?: string;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string;
  images?: string[];
};

const MUSCLE_MAP: Record<string, string> = {
  abdominals: 'Core',
  quadriceps: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  chest: 'Chest',
  lats: 'Lats',
  'middle back': 'Mid Back',
  'lower back': 'Lower Back',
  traps: 'Traps',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  adductors: 'Adductors',
  abductors: 'Abductors',
  neck: 'Neck',
};

function titleMuscle(raw: string): string {
  const key = raw.toLowerCase().trim();
  if (MUSCLE_MAP[key]) return MUSCLE_MAP[key];
  return key
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function mapFreeExerciseDbEquipment(raw?: string | null): string {
  const e = String(raw || '').toLowerCase().trim();
  if (!e || e === 'null') return 'bodyweight';
  if (e === 'body only') return 'bodyweight';
  if (e === 'e-z curl bar') return 'barbell';
  if (e === 'foam roll') return 'foam roller';
  return e;
}

export function inferFreeExerciseDbMovementPattern(row: FreeExerciseDbRow): string | undefined {
  const cat = String(row.category || '').toLowerCase();
  const name = row.name.toLowerCase();
  if (cat === 'cardio') return 'cardio';
  if (cat === 'stretching') return 'rotation';
  const mechanic = String(row.mechanic || '').toLowerCase();
  if (mechanic === 'isolation') return 'isolation';
  if (/pull-up|chin-up|pulldown|lat pulldown/.test(name)) return 'pull_vertical';
  if (/overhead|shoulder press|military press|push press|jerk|snatch|push-?up/.test(name)) {
    return /pull-up|chin-up|pulldown/.test(name) ? 'pull_vertical' : 'push_vertical';
  }
  if (/squat|lunge|leg press|step-up|split squat/.test(name)) return 'squat';
  if (/deadlift|rdl|hip thrust|good morning|kettlebell swing|clean|swing/.test(name)) return 'hinge';
  if (/carry|farmer|suitcase walk/.test(name)) return 'carry';
  if (/woodchop|rotation|twist|pallof/.test(name)) return 'rotation';
  const force = String(row.force || '').toLowerCase();
  if (force === 'push') return 'push_horizontal';
  if (force === 'pull') return 'pull_horizontal';
  if (force === 'static') return 'isolation';
  return undefined;
}

function inferTypeAndCategory(row: FreeExerciseDbRow): { exercise_type: string; category: string } {
  const cat = String(row.category || '').toLowerCase();
  const equipment = mapFreeExerciseDbEquipment(row.equipment);
  if (cat === 'cardio') return { exercise_type: 'cardio', category: 'warmup' };
  if (cat === 'stretching') return { exercise_type: 'mobility', category: 'warmup' };
  if (cat === 'plyometrics') return { exercise_type: 'bodyweight', category: 'plyometric' };
  if (equipment === 'bodyweight') return { exercise_type: 'bodyweight', category: 'strength' };
  return { exercise_type: 'strength', category: 'strength' };
}

export function convertFreeExerciseDbRow(row: FreeExerciseDbRow): ExternalExerciseRecord {
  const { exercise_type, category } = inferTypeAndCategory(row);
  const primary = row.primaryMuscles?.[0] ? titleMuscle(row.primaryMuscles[0]) : '';
  const secondaries = (row.secondaryMuscles || []).map(titleMuscle);
  const movement = inferFreeExerciseDbMovementPattern(row);
    const thumbnail = row.images?.[0] ? FREE_EXERCISE_DB_IMAGE_BASE + row.images[0] : undefined;
  const media = row.images?.[1] ? FREE_EXERCISE_DB_IMAGE_BASE + row.images[1] : undefined;

  return {
    external_source: FREE_EXERCISE_DB_SOURCE,
    external_id: row.id,
    name: row.name,
    exercise_type,
    category,
    primary_muscle: primary,
    secondary_muscles: secondaries,
    equipment: mapFreeExerciseDbEquipment(row.equipment),
    ...(movement ? { movement_pattern: movement } : {}),
    instructions: (row.instructions || []).join('\n\n'),
    thumbnail_url: thumbnail,
    media_url: media,
    coaching_metadata: {
      source_dataset: 'yuhonas/free-exercise-db',
      license: 'Unlicense',
      level: row.level || null,
      force: row.force || null,
      mechanic: row.mechanic || null,
    },
  };
}

export function convertFreeExerciseDbRows(rows: FreeExerciseDbRow[]): ExternalExerciseRecord[] {
  return rows.map(convertFreeExerciseDbRow);
}
