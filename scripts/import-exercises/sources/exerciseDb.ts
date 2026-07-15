import type { ExternalExerciseRecord } from '../types';

/**
 * ExerciseDB v1 (AscendAPI OSS) — https://oss.exercisedb.dev/docs
 * Free tier: ~1,500 exercises with GIF demos + step-by-step instructions.
 * Attribution required; non-commercial use on free tier.
 */
export const EXERCISE_DB_SOURCE = 'exercisedb';

export type ExerciseDbRow = {
  exerciseId: string;
  name: string;
  gifUrl?: string;
  bodyParts?: string[];
  equipments?: string[];
  targetMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
};

/** GitHub mirror of ExerciseDB v1 (~1,324 exercises) — avoids API rate limits */
export type ExerciseDatasetBulkRow = {
  id: string;
  name: string;
  body_part?: string;
  equipment?: string;
  target?: string;
  secondary_muscles?: string[];
  muscle_group?: string;
  instructions?: { en?: string } | string;
  instruction_steps?: { en?: string[] } | string[];
  image?: string;
  gif_url?: string;
};

const EXERCISEDB_CDN = 'https://static.exercisedb.dev/media/';

function exerciseIdFromMediaPath(p?: string): string | null {
  const m = String(p || '').match(/-([A-Za-z0-9]+)\.(gif|jpg|jpeg|png|webp)$/i);
  return m ? m[1] : null;
}

function instructionsFromBulk(row: ExerciseDatasetBulkRow): string {
  const steps = row.instruction_steps;
  if (Array.isArray(steps) && steps.length) return steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n\n');
  if (steps && typeof steps === 'object' && Array.isArray((steps as { en?: string[] }).en)) {
    return ((steps as { en: string[] }).en || []).map((s, i) => `Step ${i + 1}: ${s}`).join('\n\n');
  }
  const ins = row.instructions;
  if (typeof ins === 'string') return ins.trim();
  if (ins && typeof ins === 'object' && (ins as { en?: string }).en) return String((ins as { en: string }).en).trim();
  return '';
}

export function convertExerciseDatasetBulkRow(row: ExerciseDatasetBulkRow): ExternalExerciseRecord {
  const exerciseId = exerciseIdFromMediaPath(row.gif_url) || exerciseIdFromMediaPath(row.image) || row.id;
  const apiRow: ExerciseDbRow = {
    exerciseId,
    name: row.name,
    gifUrl: `${EXERCISEDB_CDN}${exerciseId}.gif`,
    bodyParts: row.body_part ? [row.body_part] : row.muscle_group ? [row.muscle_group] : [],
    equipments: row.equipment ? [row.equipment] : [],
    targetMuscles: row.target ? [row.target] : [],
    secondaryMuscles: row.secondary_muscles || [],
    instructions: instructionsFromBulk(row)
      ? instructionsFromBulk(row)
          .split(/\n\n+/)
          .filter(Boolean)
      : [],
  };
  return convertExerciseDbRow(apiRow);
}

export function convertExerciseDatasetBulkRows(rows: ExerciseDatasetBulkRow[]): ExternalExerciseRecord[] {
  return rows.map(convertExerciseDatasetBulkRow);
}

const MUSCLE_MAP: Record<string, string> = {
  abdominals: 'Core',
  abs: 'Core',
  spine: 'Back',
  lats: 'Lats',
  'upper back': 'Upper Back',
  'lower back': 'Lower Back',
  traps: 'Traps',
  chest: 'Chest',
  shoulders: 'Shoulders',
  delts: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  glutes: 'Glutes',
  quadriceps: 'Quads',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  cardio: 'Cardio',
  'hip flexors': 'Hip Flexors',
  adductors: 'Adductors',
  abductors: 'Abductors',
  neck: 'Neck',
};

const EQUIPMENT_MAP: Record<string, string> = {
  'body weight': 'bodyweight',
  bodyweight: 'bodyweight',
  assisted: 'assisted',
  band: 'band',
  barbell: 'barbell',
  'cable machine': 'cable',
  cable: 'cable',
  dumbbell: 'dumbbell',
  'ez barbell': 'barbell',
  kettlebell: 'kettlebell',
  'leverage machine': 'machine',
  machine: 'machine',
  'medicine ball': 'medicine ball',
  'olympic barbell': 'barbell',
  'resistance band': 'band',
  'roller wheel': 'foam roller',
  rope: 'cable',
  'skierg machine': 'machine',
  'sled machine': 'machine',
  'smith machine': 'machine',
  'stability ball': 'stability ball',
  'stationary bike': 'machine',
  'stepmill machine': 'machine',
  tire: 'other',
  'trap bar': 'trap bar',
  'upper body ergometer': 'machine',
  weighted: 'dumbbell',
  'wheel roller': 'foam roller',
};

function titleCaseName(raw: string): string {
  return String(raw || '')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function mapMuscle(raw?: string): string {
  const key = String(raw || '').toLowerCase().trim();
  if (!key) return '';
  if (MUSCLE_MAP[key]) return MUSCLE_MAP[key];
  return titleCaseName(key);
}

function mapEquipment(raw?: string): string {
  const key = String(raw || '').toLowerCase().trim();
  if (!key) return 'bodyweight';
  return EQUIPMENT_MAP[key] || key;
}

function inferMovementPattern(row: ExerciseDbRow): string | undefined {
  const name = row.name.toLowerCase();
  const body = (row.bodyParts || []).join(' ').toLowerCase();
  if (body.includes('cardio') || /run|walk|bike|row machine|elliptical|jump rope/.test(name)) return 'cardio';
  if (/stretch|yoga|pose|mobility/.test(name)) return 'rotation';
  if (/pull-up|chin-up|pulldown|lat pulldown/.test(name)) return 'pull_vertical';
  if (/overhead|shoulder press|military press|push press|jerk|snatch/.test(name)) return 'push_vertical';
  if (/squat|lunge|leg press|step-up|split squat/.test(name)) return 'squat';
  if (/deadlift|rdl|hip thrust|good morning|swing/.test(name)) return 'hinge';
  if (/carry|farmer/.test(name)) return 'carry';
  if (/curl|extension|fly|raise|kickback|crunch|plank/.test(name)) return 'isolation';
  if (/press|push-up|bench/.test(name)) return 'push_horizontal';
  if (/row|pull/.test(name)) return 'pull_horizontal';
  return undefined;
}

function inferExerciseType(row: ExerciseDbRow): string {
  const body = (row.bodyParts || []).join(' ').toLowerCase();
  const equip = mapEquipment(row.equipments?.[0]);
  if (body.includes('cardio')) return 'cardio';
  if (/stretch|yoga|pose/.test(row.name)) return 'mobility';
  if (equip === 'bodyweight') return 'bodyweight';
  return 'strength';
}

function inferCategory(exerciseType: string): string {
  if (exerciseType === 'cardio' || exerciseType === 'mobility') return 'warmup';
  return 'strength';
}

export function convertExerciseDbRow(row: ExerciseDbRow): ExternalExerciseRecord {
  const primary = mapMuscle(row.targetMuscles?.[0]);
  const secondaries = (row.secondaryMuscles || []).map(mapMuscle).filter(Boolean);
  const exercise_type = inferExerciseType(row);
  const movement = inferMovementPattern(row);
  const gif = String(row.gifUrl || '').trim();

  return {
    external_source: EXERCISE_DB_SOURCE,
    external_id: row.exerciseId,
    name: titleCaseName(row.name),
    exercise_type,
    category: inferCategory(exercise_type),
    primary_muscle: primary,
    secondary_muscles: secondaries,
    equipment: mapEquipment(row.equipments?.[0]),
    ...(movement ? { movement_pattern: movement } : {}),
    instructions: (row.instructions || []).join('\n\n'),
    thumbnail_url: gif || undefined,
    media_url: gif || undefined,
    gif_url: gif || undefined,
    coaching_metadata: {
      source_dataset: 'exercisedb-v1-oss',
      attribution: 'ExerciseDB by AscendAPI (https://oss.exercisedb.dev)',
      body_parts: row.bodyParts || [],
      raw_equipment: row.equipments || [],
    },
  };
}

export function convertExerciseDbRows(rows: ExerciseDbRow[]): ExternalExerciseRecord[] {
  return rows.map(convertExerciseDbRow);
}
