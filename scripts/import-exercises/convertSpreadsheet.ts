#!/usr/bin/env node
/**
 * Convert Excel/CSV exercise spreadsheet → BuiltIQ import JSON.
 * Save Excel as "CSV UTF-8" or use .csv from the template.
 *
 * Usage:
 *   npm run import:convert:spreadsheet -- --file my-exercises.csv
 *   npm run import:convert:spreadsheet -- --file my-exercises.csv --source my_gym --out builtiq.json
 */

import fs from 'fs';
import path from 'path';
import type { ExternalExerciseRecord } from './types';

const HEADER_ALIASES: Record<string, keyof ExternalExerciseRecord | 'thumbnail_url'> = {
  name: 'name',
  exercise: 'name',
  'exercise name': 'name',
  external_id: 'external_id',
  id: 'external_id',
  external_source: 'external_source',
  source: 'external_source',
  exercise_type: 'exercise_type',
  type: 'exercise_type',
  primary_muscle: 'primary_muscle',
  'primary muscle': 'primary_muscle',
  muscle: 'primary_muscle',
  muscle_group: 'primary_muscle',
  secondary_muscles: 'secondary_muscles',
  'secondary muscles': 'secondary_muscles',
  equipment: 'equipment',
  movement_pattern: 'movement_pattern',
  'movement pattern': 'movement_pattern',
  pattern: 'movement_pattern',
  category: 'category',
  instructions: 'instructions',
  notes: 'instructions',
  thumbnail_url: 'thumbnail_url',
  thumbnail: 'thumbnail_url',
  image_url: 'thumbnail_url',
  image: 'thumbnail_url',
  media_url: 'media_url',
  video_url: 'media_url',
  video: 'media_url',
};

function parseArgs(argv: string[]) {
  let file = '';
  let out = '';
  let source = 'spreadsheet_import';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--file' || a === '-f') && argv[i + 1]) file = argv[++i];
    else if ((a === '--out' || a === '-o') && argv[i + 1]) out = argv[++i];
    else if ((a === '--source' || a === '-s') && argv[i + 1]) source = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(`Convert CSV spreadsheet to BuiltIQ import JSON

Options:
  --file, -f <path>     CSV file (required). In Excel: File → Save As → CSV UTF-8
  --out, -o <path>      Output JSON path (default: <file>-builtiq.json)
  --source, -s <name>   external_source when column blank (default: spreadsheet_import)
  --help, -h            Show help
`);
      process.exit(0);
    }
  }
  return { file, out, source };
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvRow(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map(parseCsvRow).filter((r) => r.some((c) => c.trim()));
  return { headers, rows };
}

function rowToRecord(
  headers: string[],
  cells: string[],
  defaultSource: string,
  usedIds: Set<string>
): ExternalExerciseRecord | { error: string } {
  const row: Partial<ExternalExerciseRecord> = {};
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (!key || !cells[i]?.trim()) return;
    const val = cells[i].trim();
    if (key === 'secondary_muscles') {
      row.secondary_muscles = val.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    } else {
      (row as any)[key] = val;
    }
  });

  const name = String(row.name || '').trim();
  if (!name) return { error: 'row missing name (skip empty rows)' };

  let external_id = String(row.external_id || '').trim();
  if (!external_id) {
    external_id = slugify(name);
    let n = 2;
    while (usedIds.has(external_id)) {
      external_id = `${slugify(name)}-${n++}`;
    }
  }
  usedIds.add(external_id);

  const external_source = String(row.external_source || defaultSource).trim().toLowerCase();

  return {
    external_source,
    external_id,
    name,
    exercise_type: row.exercise_type,
    primary_muscle: row.primary_muscle,
    secondary_muscles: row.secondary_muscles,
    equipment: row.equipment,
    movement_pattern: row.movement_pattern,
    category: row.category,
    instructions: row.instructions,
    thumbnail_url: row.thumbnail_url,
    media_url: row.media_url,
  };
}

function main() {
  const { file, out, source } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('Error: --file <path> is required. See scripts/import-exercises/exercise-import-template.csv');
    process.exit(1);
  }

  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.error(`Error: file not found: ${abs}`);
    process.exit(1);
  }

  const ext = path.extname(abs).toLowerCase();
  if (ext !== '.csv') {
    console.error('Error: only .csv is supported. In Excel: File → Save As → CSV UTF-8 (*.csv)');
    process.exit(1);
  }

  const { headers, rows } = parseCsv(fs.readFileSync(abs, 'utf8'));
  if (!headers.length) {
    console.error('Error: CSV has no header row');
    process.exit(1);
  }

  const mappedHeaders = headers.filter((h) => HEADER_ALIASES[h]);
  if (!mappedHeaders.includes('name')) {
    console.error(`Error: CSV must include a "name" column. Found: ${headers.join(', ')}`);
    process.exit(1);
  }

  const usedIds = new Set<string>();
  const records: ExternalExerciseRecord[] = [];
  const errors: string[] = [];

  rows.forEach((cells, i) => {
    const result = rowToRecord(headers, cells, source, usedIds);
    if ('error' in result) {
      if (result.error !== 'row missing name (skip empty rows)') errors.push(`Line ${i + 2}: ${result.error}`);
      return;
    }
    records.push(result);
  });

  const outPath =
    out ||
    path.join(
      path.dirname(abs),
      `${path.basename(abs, path.extname(abs))}-builtiq.json`
    );

  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf8');

  console.log(`Converted ${records.length} exercise(s) → ${outPath}`);
  if (errors.length) {
    console.warn('Warnings:');
    errors.forEach((e) => console.warn(`  - ${e}`));
  }
  console.log('\nNext steps:');
  console.log(`  npm run import:exercises:dry -- --file ${path.relative(process.cwd(), outPath).replace(/\\/g, '/')}`);
  console.log(`  npm run import:exercises -- --file ${path.relative(process.cwd(), outPath).replace(/\\/g, '/')}`);
}

main();
