/**
 * Convert a downloaded Guided Library JSON into docs/catalog-overhaul/exercise-catalog.csv
 *
 *   curl.exe -L https://raw.githubusercontent.com/AbdelrahmanElghoul/exercises-dataset/main/data/exercises.json -o docs/catalog-overhaul/exercises-raw.json
 *   node scripts/convert-catalog.cjs
 */
const fs = require('fs');
const path = require('path');

const inputPath = path.join('docs', 'catalog-overhaul', 'exercises-raw.json');
const outputPath = path.join('docs', 'catalog-overhaul', 'exercise-catalog.csv');
const COLUMNS = [
  'id',
  'name',
  'external_source',
  'external_id',
  'exercise_type',
  'category',
  'muscle_group',
  'equipment',
  'movement_pattern',
  'instructions',
  'thumbnail_url',
  'gif_url',
  'media_url',
  'is_system',
  'is_archived',
];

function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(' | ');
  if (typeof v === 'object') {
    if (typeof v.en === 'string') return v.en;
    if (typeof v.name === 'string') return v.name;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function csvEscape(v) {
  const t = asText(v).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function first(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return '';
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.exercises || raw.data || raw.items || [];
if (!Array.isArray(rows)) throw new Error('No exercise array found');

const lines = [COLUMNS.join(',')];
for (const row of rows) {
  const muscle = first(row, ['target', 'muscle', 'primaryMuscles', 'primary_muscle']);
  const gif = first(row, ['gif_url', 'gifUrl', 'gif']);
  const sys = first(row, ['is_system', 'isSystem']);
  const arch = first(row, ['is_archived', 'isArchived']);
  const rec = [
    first(row, ['id', 'exerciseId', 'exercise_id']),
    first(row, ['name', 'exercise_name', 'title']),
    first(row, ['external_source', 'externalSource']) || 'exercisedb',
    first(row, ['external_id', 'externalId', 'id']),
    first(row, ['exercise_type', 'exerciseType', 'type', 'category']),
    first(row, ['category', 'bodyPart', 'body_part']),
    first(row, ['muscle_group', 'muscleGroup', 'bodyPart', 'body_part', 'category']) || muscle,
    first(row, ['equipment', 'equipments']),
    first(row, ['movement_pattern', 'movementPattern', 'mechanic']),
    first(row, ['instructions', 'instruction', 'description']),
    first(row, ['image', 'thumbnail_url', 'thumbnail', 'images']),
    gif,
    first(row, ['media_url', 'mediaUrl', 'video', 'videoUrl']) || gif,
    sys === '' ? 'true' : sys,
    arch === '' ? 'false' : arch,
  ];
  lines.push(rec.map(csvEscape).join(','));
}

fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
console.log(`OK rows=${rows.length} bytes=${fs.statSync(outputPath).size} file=${outputPath}`);
