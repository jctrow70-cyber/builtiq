#!/usr/bin/env node
/**
 * Fetch ExerciseDB v1 OSS API and convert to Build IQ import JSON.
 * https://oss.exercisedb.dev/docs — attribution required on free tier.
 *
 * Usage:
 *   npm run import:fetch:exercisedb
 *   npm run import:fetch:exercisedb -- --out scripts/import-exercises/data/exercisedb/build-iq-import.json
 */

import fs from 'fs';
import path from 'path';
import { convertExerciseDbRows, convertExerciseDatasetBulkRows, type ExerciseDbRow, type ExerciseDatasetBulkRow } from './sources/exerciseDb';

const API_BASE = 'https://oss.exercisedb.dev/api/v1/exercises';
const BULK_JSON_URL =
  'https://raw.githubusercontent.com/AbdelrahmanElghoul/exercises-dataset/main/data/exercises.json';
const DEFAULT_RAW = 'scripts/import-exercises/data/exercisedb/exercises-raw.json';
const DEFAULT_OUT = 'scripts/import-exercises/data/exercisedb/build-iq-import.json';
const PAGE_SIZE = 25;
const PAGE_DELAY_MS = 500;
const MAX_RETRIES = 4;

type ApiResponse = {
  success: boolean;
  meta: { total: number; hasNextPage: boolean; nextCursor?: string };
  data: ExerciseDbRow[];
};

async function fetchPage(url: string): Promise<ApiResponse> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`ExerciseDB API ${res.status}`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`ExerciseDB API ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as ApiResponse;
      if (!json.success || !Array.isArray(json.data)) throw new Error('Unexpected ExerciseDB API response');
      return json;
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr || new Error('ExerciseDB fetch failed');
}

async function fetchAllExercises(rawPath: string): Promise<ExerciseDbRow[]> {
  const all: ExerciseDbRow[] = [];
  let cursor: string | undefined;
  let page = 0;
  let total = 0;

  while (true) {
    page++;
    const url = cursor
      ? `${API_BASE}?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
      : `${API_BASE}?limit=${PAGE_SIZE}`;
    const json = await fetchPage(url);
    total = json.meta.total;

    all.push(...json.data);
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, JSON.stringify(all, null, 2), 'utf8');
    console.log(`  page ${page}: +${json.data.length} (total ${all.length}/${total})`);

    if (!json.meta.hasNextPage || !json.meta.nextCursor) break;
    cursor = json.meta.nextCursor;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  return all;
}

function parseArgs(argv: string[]) {
  let rawOut = DEFAULT_RAW;
  let out = DEFAULT_OUT;
  let fromFile = '';
  let useBulk = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) out = argv[++i];
    else if (a === '--raw-out' && argv[i + 1]) rawOut = argv[++i];
    else if (a === '--from-file' && argv[i + 1]) fromFile = argv[++i];
    else if (a === '--bulk') useBulk = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Fetch ExerciseDB OSS → Build IQ import format

Options:
  --out <path>       Build IQ import JSON (default: ${DEFAULT_OUT})
  --raw-out <path>   Cached raw API dump (default: ${DEFAULT_RAW})
  --from-file <path> Skip fetch; convert existing raw JSON
  --bulk             Download static JSON mirror (~1,324 exercises, recommended)
`);
      process.exit(0);
    }
  }
  return { rawOut, out, fromFile, useBulk };
}

async function fetchBulkDataset(rawPath: string): Promise<ExerciseDatasetBulkRow[]> {
  console.log(`Downloading bulk dataset: ${BULK_JSON_URL}`);
  const res = await fetch(BULK_JSON_URL);
  if (!res.ok) throw new Error(`Bulk download failed ${res.status}`);
  const rows = (await res.json()) as ExerciseDatasetBulkRow[];
  if (!Array.isArray(rows)) throw new Error('Bulk JSON must be an array');
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`Cached bulk dump (${rows.length} exercises): ${rawPath}`);
  return rows;
}

async function main() {
  const { rawOut, out, fromFile, useBulk } = parseArgs(process.argv.slice(2));
  const rawPath = path.resolve(process.cwd(), fromFile || rawOut);
  const outPath = path.resolve(process.cwd(), out);

  let converted;
  if (fromFile) {
    if (!fs.existsSync(rawPath)) {
      console.error(`Error: --from-file not found: ${rawPath}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    converted = Array.isArray(raw) && raw[0]?.gifUrl != null
      ? convertExerciseDbRows(raw as ExerciseDbRow[])
      : convertExerciseDatasetBulkRows(raw as ExerciseDatasetBulkRow[]);
    console.log(`Loaded ${raw.length} exercises from cache`);
  } else if (useBulk) {
    const rows = await fetchBulkDataset(rawPath);
    converted = convertExerciseDatasetBulkRows(rows);
  } else {
    console.log('Fetching ExerciseDB v1 (OSS API — may rate-limit; use --bulk for full dataset)...');
    const rows = await fetchAllExercises(rawPath);
    console.log(`Cached raw API dump: ${rawPath}`);
    converted = convertExerciseDbRows(rows);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf8');

  const withGif = converted.filter((r) => r.gif_url || r.media_url).length;
  const withInstructions = converted.filter((r) => r.instructions).length;

  console.log(`Converted ${converted.length} exercises`);
  console.log(`  with GIF demo:     ${withGif}`);
  console.log(`  with instructions: ${withInstructions}`);
  console.log(`  output: ${outPath}`);
  console.log(`
Next steps:
  npm run import:exercises:exercisedb:dry
  npm run import:exercises:exercisedb
`);
}

main().catch((err) => {
  console.error('Fatal:', err?.message || err);
  process.exit(1);
});
